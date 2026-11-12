/**
 * Статус в Discord («Играет на IGROBAR · 1.21.1») — Discord Rich Presence.
 *
 * Работает через локальное подключение к запущенному приложению Discord
 * (named pipe discord-ipc-N), без сторонних библиотек.
 *
 * Нужен Application ID приложения Discord: создайте приложение на
 * https://discord.com/developers/applications, загрузите в Rich Presence →
 * Art Assets картинку с ключом "logo" и впишите Application ID в
 * data/server_profiles.json → discord_client_id. Пока поле пустое — статус
 * не показывается. Выключить у себя: Настройки → «Статус в Discord».
 */

const net = require("net");
const path = require("path");
const os = require("os");

const settings = require("./settings");
const builds = require("./builds");
const { tr } = require("../core/i18n");

let socket = null;
let connected = false;
let clientId = null;
let pending = null; // последняя активность, пока не подключились
let reconnectTimer = null;
let startedAt = null;

function pipePath(i) {
  if (process.platform === "win32") return `\\\\?\\pipe\\discord-ipc-${i}`;
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || os.tmpdir();
  return path.join(base, `discord-ipc-${i}`);
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data));
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

function send(op, data) {
  if (socket && !socket.destroyed) socket.write(encode(op, data));
}

function tryConnect(i = 0) {
  if (i > 9) return scheduleReconnect();
  const s = net.createConnection(pipePath(i));
  s.once("error", () => {
    s.destroy();
    tryConnect(i + 1);
  });
  s.once("connect", () => {
    socket = s;
    s.removeAllListeners("error");
    s.on("error", () => {});
    s.on("close", () => {
      connected = false;
      socket = null;
      scheduleReconnect();
    });
    let buf = Buffer.alloc(0);
    s.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 8) {
        const len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        let msg = null;
        try {
          msg = JSON.parse(buf.subarray(8, 8 + len).toString("utf8"));
        } catch (err) {
          msg = null;
        }
        buf = buf.subarray(8 + len);
        if (msg && msg.evt === "READY") {
          connected = true;
          if (pending) setActivity(pending);
        }
      }
    });
    send(0, { v: 1, client_id: clientId }); // рукопожатие
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  // Discord может быть не запущен — пробуем раз в минуту, тихо.
  reconnectTimer = setTimeout(() => {
    if (enabled()) tryConnect(0);
  }, 60000);
}

function enabled() {
  const server = builds.serverProfiles()[0] || {};
  clientId = server.discord_client_id || null;
  return !!clientId && settings.get().discord_rpc !== false;
}

function setActivity(activity) {
  pending = activity;
  if (!connected) return;
  send(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity }, nonce: `${Date.now()}-${Math.random()}` });
}

function buttons() {
  const server = builds.serverProfiles()[0] || {};
  const list = [{ label: tr("Скачать лаунчер"), url: "https://github.com/mdreval/ib-launcher/releases/latest" }];
  if (server.discord) list.push({ label: tr("Discord сервера"), url: server.discord });
  return list;
}

/** В лаунчере, игра не запущена. */
function idle() {
  if (!enabled()) return clear();
  startedAt = null;
  setActivity({
    details: tr("В лаунчере"),
    state: tr("Выбирает, во что поиграть"),
    assets: { large_image: "logo", large_text: "IGROBAR Launcher" },
    buttons: buttons(),
    instance: false,
  });
}

/** Игра запущена. */
function playing(build) {
  if (!enabled()) return clear();
  startedAt = Date.now();
  const isServer = build && build.kind === "server";
  setActivity({
    details: tr(isServer ? `Играет на ${build.name}` : `Играет в ${build ? build.name : "Minecraft"}`),
    state: build ? `Minecraft ${build.mc_version}${build.loader_type && build.loader_type !== "vanilla" ? ` · ${build.loader_type}` : ""}` : "Minecraft",
    timestamps: { start: Math.floor(startedAt / 1000) },
    assets: { large_image: "logo", large_text: "IGROBAR Launcher" },
    buttons: buttons(),
    instance: false,
  });
}

function clear() {
  pending = null;
  if (connected) send(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid }, nonce: `${Date.now()}` });
}

function start() {
  if (!enabled()) return;
  tryConnect(0);
  idle();
}

/** Настройку включили/выключили. */
function refresh() {
  if (!enabled()) return clear();
  if (!socket) tryConnect(0);
  if (!startedAt) idle();
}

module.exports = { start, idle, playing, clear, refresh };
