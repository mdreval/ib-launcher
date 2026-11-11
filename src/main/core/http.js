/**
 * Сетевые запросы main-процесса. Используется встроенный fetch (Node 20 в
 * Electron 32), с таймаутом и понятными русскими ошибками.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const pkg = require("../../../package.json");

const USER_AGENT = `IBLauncher/${pkg.version} (github.com/mdreval)`;

class HttpError extends Error {
  constructor(status, url, body) {
    super(`Сервер ответил ошибкой ${status} (${new URL(url).host})`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

function friendlyNetworkError(err, url) {
  if (err instanceof HttpError) return err;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch (e) {
      return url;
    }
  })();
  if (err && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return new Error(`Нет ответа от ${host} — проверьте интернет`);
  }
  return new Error(`Не удалось связаться с ${host}: ${err && err.message ? err.message : err}`);
}

async function request(url, opts = {}) {
  const headers = { "User-Agent": USER_AGENT, ...(opts.headers || {}) };
  let res;
  try {
    res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body,
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeout || 20000),
    });
  } catch (err) {
    throw friendlyNetworkError(err, url);
  }
  if (!res.ok && !opts.allowError) {
    let body = "";
    try {
      body = await res.text();
    } catch (e) {
      /* тело ошибки не важно */
    }
    throw new HttpError(res.status, url, body);
  }
  return res;
}

async function fetchJson(url, opts = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await request(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers || {}) } });
      return await res.json();
    } catch (err) {
      lastErr = err;
      // 4xx — повторять бессмысленно; сетевые сбои и 5xx — пробуем ещё раз
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function postJson(url, data, opts = {}) {
  return fetchJson(url, {
    ...opts,
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
}

async function fetchBuffer(url, opts = {}) {
  const res = await request(url, opts);
  return Buffer.from(await res.arrayBuffer());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// На Windows антивирус или индексатор ненадолго держат свежий файл открытым,
// и удаление/переименование падает с EPERM/EBUSY/EACCES. Ждём и пробуем снова.
const BUSY_CODES = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);

async function retryFs(fn, attempts = 8) {
  for (let i = 0; ; i += 1) {
    try {
      return fn();
    } catch (err) {
      if (!BUSY_CODES.has(err.code) || i >= attempts) throw err;
      await sleep(300 * (i + 1));
    }
  }
}

const removeFile = (file) => retryFs(() => fs.rmSync(file, { force: true }));
const moveFile = (from, to) => retryFs(() => fs.renameSync(from, to));

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch (err) {
    return 0;
  }
}

function hashOfFile(file, algo) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algo);
    fs.createReadStream(file)
      .on("data", (c) => hash.update(c))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

const sha1OfFile = (file) => hashOfFile(file, "sha1");
const sha256OfFile = (file) => hashOfFile(file, "sha256");

/** Одна попытка: докачивает .part с места обрыва (Range), обрывает
 * соединение только если данные не приходят idleTimeout мс подряд. */
async function downloadOnce(url, tmp, { onProgress, expectedSize, idleTimeout }) {
  let start = fileSize(tmp);
  if (expectedSize && start > expectedSize) {
    fs.rmSync(tmp, { force: true });
    start = 0;
  }
  if (expectedSize && start === expectedSize) return;

  const controller = new AbortController();
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleTimeout);
  };
  arm();
  const headers = { "User-Agent": USER_AGENT };
  if (start > 0) headers.Range = `bytes=${start}-`;
  let res;
  try {
    res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    throw friendlyNetworkError(err, url);
  }
  if (res.status === 416) {
    clearTimeout(timer);
    return; // файл уже докачан целиком
  }
  if (!res.ok) {
    clearTimeout(timer);
    const err = new HttpError(res.status, url, "");
    err.fatal = res.status === 404 || res.status === 403 || res.status === 410;
    throw err;
  }
  const append = start > 0 && res.status === 206;
  if (!append) start = 0;
  const total = expectedSize || start + parseInt(res.headers.get("content-length") || "0", 10);
  let done = start;
  // Пишем на диск строго по очереди: прочитали кусок → дождались записи →
  // читаем следующий. Раньше здесь был Readable.fromWeb + pipeline, и в
  // Electron на Windows куски по 16 КБ иногда записывались не в том порядке —
  // архив модпака получался битым при правильном размере.
  const reader = res.body.getReader();
  const fh = await fs.promises.open(tmp, append ? "a" : "w");
  try {
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      arm();
      let offset = 0;
      while (offset < value.length) {
        const { bytesWritten } = await fh.write(value, offset, value.length - offset);
        offset += bytesWritten;
      }
      done += value.length;
      if (onProgress) onProgress(done, total);
    }
  } catch (err) {
    throw friendlyNetworkError(err, url);
  } finally {
    clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch (e) {
      /* поток уже закрыт */
    }
    await fh.close().catch(() => {});
  }
}

/**
 * Скачивает файл надёжно: во временный .part, с докачкой после обрыва и
 * несколькими попытками. Готовый файл появляется только после проверки
 * размера (expectedSize) и sha1, если они известны.
 */
async function downloadFile(url, dest, opts = {}) {
  const { onProgress, sha1, sha256, expectedSize, retries = 5, idleTimeout = 45000 } = opts;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await downloadOnce(url, tmp, { onProgress, expectedSize, idleTimeout });
      const size = fileSize(tmp);
      if (expectedSize && size !== expectedSize) {
        throw new Error(`Файл ${path.basename(dest)} скачался не полностью (${size} из ${expectedSize} байт)`);
      }
      if (sha1) {
        const actual = await sha1OfFile(tmp);
        if (actual.toLowerCase() !== String(sha1).toLowerCase()) {
          fs.rmSync(tmp, { force: true });
          throw new Error(`Файл ${path.basename(dest)} скачался повреждённым`);
        }
      }
      if (sha256) {
        const actual = await sha256OfFile(tmp);
        if (actual.toLowerCase() !== String(sha256).toLowerCase()) {
          fs.rmSync(tmp, { force: true });
          throw new Error(`Файл ${path.basename(dest)} скачался повреждённым (контрольная сумма не совпала)`);
        }
      }
      await removeFile(dest);
      await moveFile(tmp, dest);
      return dest;
    } catch (err) {
      lastErr = err;
      if (err.fatal) break;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr || new Error("Не удалось скачать файл");
}

module.exports = { USER_AGENT, HttpError, request, fetchJson, postJson, fetchBuffer, downloadFile, removeFile, moveFile, sha256OfFile };
