/**
 * Отмена долгих операций (установка / подготовка запуска сборки).
 *
 * Библиотека minecraft-java-core и наши модули качают файлы через
 * глобальный fetch и запускают процессы через child_process.spawn. Чтобы
 * прервать всё это разом, операция выполняется внутри «токена отмены»
 * (AsyncLocalStorage): каждый fetch, сделанный внутри неё, получает свой
 * AbortController, а запущенные процессы запоминаются. cancel(token)
 * обрывает все загрузки, убивает процессы, и любые новые запросы этой
 * операции сразу завершаются ошибкой CancelledError.
 */

const { AsyncLocalStorage } = require("async_hooks");
const childProcess = require("child_process");

const storage = new AsyncLocalStorage();

class CancelledError extends Error {
  constructor(message = "Отменено") {
    super(message);
    this.name = "CancelledError";
    this.cancelled = true;
    this.code = "CANCELLED";
  }
}

function createToken() {
  let resolveCancelled;
  const token = {
    cancelled: false,
    controllers: new Set(),
    children: new Set(),
    whenCancelled: new Promise((resolve) => {
      resolveCancelled = resolve;
    }),
  };
  token.resolveCancelled = resolveCancelled;
  return token;
}

function run(token, fn) {
  return storage.run(token, fn);
}

/** Токен текущей операции. Закончившаяся операция (finish) больше ни на
 * что не влияет — даже если внутри неё лениво запустилось что-то долгоживущее
 * (локальный сервер скинов, таймеры), его запросы идут как обычно. */
function current() {
  const token = storage.getStore();
  return token && !token.finished ? token : null;
}

function finish(token) {
  if (!token) return;
  token.finished = true;
  token.controllers.clear();
  token.children.clear();
}

function killTree(child) {
  try {
    if (!child || child.exitCode !== null || child.killed) return;
    if (process.platform === "win32" && child.pid) {
      childProcess.execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
    } else child.kill("SIGKILL");
  } catch (err) {
    /* процесс уже завершился */
  }
}

function cancel(token) {
  if (!token || token.cancelled) return false;
  token.cancelled = true;
  for (const ctrl of token.controllers) {
    try {
      ctrl.abort(new CancelledError());
    } catch (err) {
      /* уже прерван */
    }
  }
  token.controllers.clear();
  for (const child of token.children) killTree(child);
  token.children.clear();
  token.resolveCancelled();
  return true;
}

function throwIfCancelled(token = current()) {
  if (token && token.cancelled) throw new CancelledError();
}

function isCancelled(err) {
  return !!(err && (err.cancelled || err.name === "CancelledError"));
}

/** Пауза, которая заканчивается сразу при отмене. */
function sleep(ms, token = current()) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (token)
      token.whenCancelled.then(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

/** Запоминает процесс, запущенный внутри операции (вызывается из перехвата spawn). */
function trackChild(child) {
  const token = current();
  if (!token || !child) return;
  if (token.cancelled) {
    killTree(child);
    return;
  }
  token.children.add(child);
  child.once("exit", () => token.children.delete(child));
}

// ---------- перехват fetch ----------

const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function" && !originalFetch.igrobarCancelable) {
  const patchedFetch = function igrobarFetch(input, init) {
    const token = current();
    if (!token) return originalFetch(input, init);
    if (token.cancelled) return Promise.reject(new CancelledError());
    const ctrl = new AbortController();
    const opts = { ...(init || {}) };
    const outer = opts.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener("abort", () => ctrl.abort(outer.reason), { once: true });
    }
    opts.signal = ctrl.signal;
    token.controllers.add(ctrl);
    return originalFetch(input, opts).then(
      (res) => res,
      (err) => {
        token.controllers.delete(ctrl);
        throw token.cancelled ? new CancelledError() : err;
      }
    );
  };
  patchedFetch.igrobarCancelable = true;
  globalThis.fetch = patchedFetch;
}

module.exports = { CancelledError, createToken, run, current, finish, cancel, throwIfCancelled, isCancelled, sleep, trackChild };
