/**
 * Статистика лаунчера (страница «Настройки»):
 *  - лаунчер: сколько всего установок, сколько людей открывали его сегодня и
 *    за неделю, у скольких какая версия лаунчера;
 *  - игра: сколько раз запускали игру сегодня, за неделю и всего, топ-5
 *    версий игры (версия Minecraft + загрузчик, без названий сборок).
 *
 * Как считается: при первом запуске лаунчер создаёт случайный номер установки
 * (data\usage.json) и при каждом запуске отмечается на сервере IGROBAR
 * (тот же Cloudflare Worker, что и скины: POST /api/usage/ping). Отправляются
 * только номер установки, версия лаунчера и система — без ников и IP.
 * При запуске игры — POST /api/usage/launch: версия Minecraft, загрузчик и
 * отметка «сборка сервера IGROBAR».
 *
 * Выключается настройкой usage_stats: false в settings.json — тогда лаунчер
 * не отмечается, но цифры в настройках по-прежнему показывает. Запуски из
 * исходников (npm start) тоже не отмечаются, чтобы не накручивать цифры.
 */

const crypto = require("crypto");
const path = require("path");
const { app } = require("electron");

const paths = require("../paths");
const settings = require("./settings");
const skinCloud = require("./skinCloud");
const { broadcast } = require("../core/broadcast");
const { request, fetchJson } = require("../core/http");
const { readJson, writeJson } = require("../core/jsonFile");

const STATE_FILE = path.join(paths.LAUNCHER_DIR, "usage.json");
const PING_EVERY_MS = 6 * 60 * 60 * 1000; // лаунчер открыт долго — отмечаемся снова
const REFRESH_EVERY_MS = 10 * 60 * 1000; // обновить цифры
const FIRST_PING_DELAY_MS = 3000;

let last = null; // { installs, today, week, versions: [{ version, count }], updated }
let started = false;

function installId() {
  const s = readJson(STATE_FILE, {}) || {};
  if (!/^[0-9a-f]{32}$/.test(String(s.id || ""))) {
    s.id = crypto.randomBytes(16).toString("hex");
    writeJson(STATE_FILE, s);
  }
  return s.id;
}

function osName() {
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return "linux";
  return "other";
}

function remember(stats) {
  if (!stats || typeof stats.installs !== "number") return last;
  const games = stats.games || {};
  last = {
    installs: stats.installs,
    today: stats.today || 0,
    week: stats.week || 0,
    versions: Array.isArray(stats.versions) ? stats.versions : [],
    games: { today: games.today || 0, week: games.week || 0, total: games.total || 0 },
    top: Array.isArray(stats.top) ? stats.top : [],
    top_total: stats.top_total || 0,
    updated: stats.updated || Date.now(),
  };
  broadcast("usage:changed", last);
  return last;
}

/** Отметиться «я запущен» — в ответ сервер сразу присылает свежие цифры. */
async function ping() {
  if (settings.get().usage_stats === false || !app.isPackaged) return refresh();
  const res = await request(`${skinCloud.baseUrl()}/api/usage/ping`, {
    method: "POST",
    body: JSON.stringify({ id: installId(), version: app.getVersion(), os: osName() }),
    headers: { "Content-Type": "application/json" },
    timeout: 10000,
    allowError: true,
  });
  if (!res.ok) throw new Error(`сервер статистики ответил ${res.status}`);
  return remember(await res.json());
}

/** Только получить цифры, не отмечаясь. */
async function refresh() {
  return remember(await fetchJson(`${skinCloud.baseUrl()}/api/usage/stats`, { timeout: 10000 }));
}

/** Последние известные цифры (или null, пока не загрузились); force — запросить свежие. */
async function get(force) {
  if (last && !force) return last;
  try {
    return await refresh();
  } catch (err) {
    return last;
  }
}

/** Игра запущена: сообщаем версию Minecraft и загрузчик (в фоне, ошибки не важны). */
function gameLaunched(build) {
  if (!build || settings.get().usage_stats === false || !app.isPackaged) return;
  request(`${skinCloud.baseUrl()}/api/usage/launch`, {
    method: "POST",
    body: JSON.stringify({
      id: installId(),
      mc: String(build.mc_version || ""),
      loader: String(build.loader_type || "vanilla"),
      igrobar: build.kind === "server",
    }),
    headers: { "Content-Type": "application/json" },
    timeout: 10000,
    allowError: true,
  })
    .then(() => refresh())
    .catch(() => {});
}

function start() {
  if (started) return;
  started = true;
  const quiet = (fn) => () => fn().catch(() => {});
  setTimeout(quiet(ping), FIRST_PING_DELAY_MS);
  setInterval(quiet(ping), PING_EVERY_MS).unref();
  setInterval(quiet(refresh), REFRESH_EVERY_MS).unref();
}

module.exports = { start, get, ping, refresh, gameLaunched };
