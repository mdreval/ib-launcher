/**
 * Фоновые дела, пока открыт лаунчер (в том числе свёрнутый в трей):
 *
 *  - раз в минуту проверяет сервер IGROBAR: онлайн, кто играет —
 *    и рассылает это в интерфейс (главная показывает список игроков);
 *  - если зашёл кто-то из друзей (settings.friends) — системное уведомление;
 *  - раз в 30 минут тихо обновляет модпак сервера, если на GitHub вышел новый
 *    (только когда игра не запущена и сборка уже установлена).
 *
 * Список игроков сервер отдаёт не целиком: обычно до 12 ников (так устроен
 * протокол Minecraft), а некоторые серверы скрывают его совсем. Поэтому при
 * большом онлайне друга можно и не увидеть.
 */

const { Notification } = require("electron");

const builds = require("./builds");
const settings = require("./settings");
const serverStatus = require("../core/serverStatus");
const { broadcast } = require("../core/broadcast");
const { tr } = require("../core/i18n");

const STATUS_EVERY = 60 * 1000;
const MODPACK_EVERY = 30 * 60 * 1000;

let last = null; // последний статус
let lastNames = null; // Set ников прошлой проверки
let statusTimer = null;
let modpackTimer = null;
let deps = {}; // { game, modpack, showWindow }

function serverBuild() {
  return builds.list().find((b) => b.kind === "server") || null;
}

async function checkStatus() {
  const server = serverBuild();
  const address = server && (server.status_address || server.server_address);
  if (!address) return null;
  let st;
  try {
    st = await serverStatus.ping(address);
  } catch (err) {
    st = { online: false };
  }
  st.checked_at = Date.now();
  last = st;
  broadcast("server:status", st);

  const names = new Set((st.names || []).map((n) => n.toLowerCase()));
  if (lastNames && st.online) {
    const s = settings.get();
    if (s.friend_notifications !== false && Notification.isSupported()) {
      for (const friend of s.friends || []) {
        const key = friend.toLowerCase();
        if (names.has(key) && !lastNames.has(key)) notify(friend, server);
      }
    }
  }
  if (st.online) lastNames = names;
  return st;
}

function notify(friend, server) {
  try {
    const n = new Notification({
      title: tr(`${friend} зашёл на ${server ? server.name : "сервер"}`),
      body: tr("Нажмите, чтобы открыть лаунчер"),
      silent: false,
    });
    n.on("click", () => deps.showWindow && deps.showWindow());
    n.show();
  } catch (err) {
    /* уведомления недоступны */
  }
}

async function silentModpack() {
  const s = settings.get();
  if (s.silent_modpack === false || !deps.modpack || !deps.game) return;
  const server = serverBuild();
  if (!server || !server.installed || !builds.isModpackCapable(server) || !builds.modpackEnabled(server)) return;
  if (deps.game.isBusy()) return;
  try {
    const res = await deps.modpack.sync(server.id, {});
    if (res && res.updated) broadcast("modpack:background", { buildId: server.id, release: res.release, reason: res.reason });
  } catch (err) {
    /* не получилось — попробуем при запуске игры */
  }
}

function start(options) {
  deps = options || {};
  if (statusTimer) return;
  setTimeout(checkStatus, 3000);
  statusTimer = setInterval(checkStatus, STATUS_EVERY);
  setTimeout(silentModpack, 2 * 60 * 1000);
  modpackTimer = setInterval(silentModpack, MODPACK_EVERY);
}

function stop() {
  clearInterval(statusTimer);
  clearInterval(modpackTimer);
  statusTimer = null;
  modpackTimer = null;
}

/** Последний статус (или проверка сейчас). */
async function status({ force = false } = {}) {
  if (!force && last && Date.now() - last.checked_at < 30000) return last;
  return checkStatus();
}

module.exports = { start, stop, status };
