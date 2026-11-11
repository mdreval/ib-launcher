/**
 * Надёжная сеть для minecraft-java-core.
 *
 * Библиотека качает метаданные Forge, Java и файлы игры обычным fetch() без
 * повторов. Если сервер (files.minecraftforge.net, launchermeta.mojang.com и
 * т.п.) не ответил за 10 секунд, получалось «fetch failed
 * (UND_ERR_CONNECT_TIMEOUT)», а иногда соединение просто висело.
 *
 * Здесь глобальный fetch оборачивается (только GET/HEAD по строковому адресу):
 *  - сетевые сбои повторяются до 3 раз с паузой;
 *  - если заголовки ответа не пришли за 30 секунд, запрос обрывается и
 *    повторяется (раньше мог висеть минутами);
 *  - для известных сайтов есть запасные адреса (files.minecraftforge.net →
 *    maven.minecraftforge.net, launchermeta → piston-meta);
 *  - из списка зеркал библиотек убирается maven.creeperhost.net — он часто
 *    недоступен, и проверка каждой библиотеки ждала его по 10 секунд.
 *
 * Подключается в самом начале src/main/index.js, до загрузки библиотеки.
 */

const path = require("path");

const ATTEMPTS = 3;
const HEADERS_TIMEOUT_MS = 30000;
const RETRYABLE = /UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|UND_ERR_HEADERS_TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|IgrobarHeadersTimeout/;

// [что заменить, на что] — запасные адреса, если основной не отвечает.
const FALLBACKS = [
  [/^https:\/\/files\.minecraftforge\.net\//, "https://maven.minecraftforge.net/"],
  [/^https:\/\/launchermeta\.mojang\.com\//, "https://piston-meta.mojang.com/"],
  [/^https:\/\/piston-meta\.mojang\.com\//, "https://launchermeta.mojang.com/"],
];

const SLOW_MIRRORS = ["https://maven.creeperhost.net"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function errorCode(err) {
  if (!err) return "";
  const parts = [err.name, err.code, err.message];
  if (err.cause) parts.push(err.cause.code, err.cause.name, err.cause.message);
  return parts.filter(Boolean).join(" ");
}

function candidatesFor(url) {
  const list = [url];
  for (const [re, replacement] of FALLBACKS) {
    if (re.test(url)) list.push(url.replace(re, replacement));
  }
  return list;
}

/** Один запрос с ограничением времени ожидания заголовков (тело ответа не
 * ограничивается — большие файлы качаются сколько нужно). */
async function fetchWithHeadersTimeout(original, url, init) {
  const controller = new AbortController();
  const outer = init && init.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, HEADERS_TIMEOUT_MS);
  try {
    return await original(url, { ...(init || {}), signal: controller.signal });
  } catch (err) {
    if (timedOut && !(outer && outer.aborted)) {
      const e = new Error(`Нет ответа от ${new URL(url).host} за ${HEADERS_TIMEOUT_MS / 1000} с`);
      e.code = "IgrobarHeadersTimeout";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function install() {
  if (globalThis.__igrobarFetchPatched || typeof globalThis.fetch !== "function") return;
  globalThis.__igrobarFetchPatched = true;
  const original = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function igrobarFetch(input, init) {
    const isPlainUrl = typeof input === "string" || input instanceof URL;
    const method = String((init && init.method) || "GET").toUpperCase();
    if (!isPlainUrl || (method !== "GET" && method !== "HEAD")) return original(input, init);

    const url = String(input);
    const outer = init && init.signal;
    const candidates = candidatesFor(url);
    let lastErr = null;
    let lastBadResponse = null;

    for (let c = 0; c < candidates.length; c += 1) {
      const candidate = candidates[c];
      const hasNext = c < candidates.length - 1;
      // Если есть запасной адрес, долго не ждём основной.
      const tries = hasNext ? 2 : ATTEMPTS;
      for (let attempt = 1; attempt <= tries; attempt += 1) {
        if (outer && outer.aborted) throw lastErr || new DOMException("Aborted", "AbortError");
        try {
          const res = await fetchWithHeadersTimeout(original, candidate, init);
          // Плохой ответ основного адреса (403 от Cloudflare, 5xx) — пробуем запасной.
          if (!res.ok && hasNext && (res.status >= 500 || res.status === 403 || res.status === 429)) {
            lastBadResponse = res;
            break;
          }
          if (res.status >= 500 && attempt < tries) {
            lastBadResponse = res;
            await sleep(1000 * attempt);
            continue;
          }
          return res;
        } catch (err) {
          lastErr = err;
          if ((outer && outer.aborted) || !RETRYABLE.test(errorCode(err))) throw err;
          if (attempt < tries) await sleep(1000 * attempt);
        }
      }
    }
    if (lastBadResponse) return lastBadResponse;
    throw lastErr || new Error(`fetch failed: ${url}`);
  };
}

/** Убирает медленные зеркала из списка библиотеки (тот же массив, что
 * использует установщик Forge). */
function tuneLibraryMirrors() {
  try {
    const entry = require.resolve("minecraft-java-core");
    const utils = require(path.join(path.dirname(entry), "utils", "Index.js"));
    const mirrors = utils.mirrors;
    if (!Array.isArray(mirrors)) return;
    for (const slow of SLOW_MIRRORS) {
      const i = mirrors.indexOf(slow);
      if (i !== -1) mirrors.splice(i, 1);
    }
  } catch (err) {
    /* другая версия библиотеки — ничего страшного */
  }
}

module.exports = { install, tuneLibraryMirrors };
