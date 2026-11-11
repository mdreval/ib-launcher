/**
 * Каталог скинов: отдельное окно с сайтом скинов (minecraftskins.com,
 * Ely.by, NameMC). Игрок листает сайт как в браузере и жмёт «Скачать» /
 * «Download» у понравившегося скина — лаунчер перехватывает скачанный PNG,
 * проверяет, что это скин 64×64, и отдаёт его в редактор скина.
 *
 * Окно работает в отдельной «сессии» (свои cookies), без доступа к Node и
 * к лаунчеру. Список сайтов — SOURCES ниже, можно дополнять.
 */

const fs = require("fs");
const path = require("path");
const { BrowserWindow, session, shell } = require("electron");

const paths = require("./paths");
const skins = require("./services/skins");

const SOURCES = {
  minecraftskins: { title: "MinecraftSkins.com", url: "https://www.minecraftskins.com/", hosts: ["minecraftskins.com"] },
  ely: { title: "Ely.by", url: "https://ely.by/skins", hosts: ["ely.by"] },
  namemc: { title: "NameMC", url: "https://namemc.com/minecraft-skins", hosts: ["namemc.com"] },
};

let win = null;
let onSkin = null;
let sessionReady = false;

function hostAllowed(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return Object.values(SOURCES).some((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  } catch (err) {
    return false;
  }
}

function setupSession(ses) {
  if (sessionReady) return;
  sessionReady = true;
  ses.on("will-download", (_event, item) => {
    const dir = path.join(paths.CACHE_DIR, "skin-downloads");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `skin-${Date.now()}.png`);
    item.setSavePath(file);
    item.once("done", (_e, state) => {
      if (state !== "completed") return;
      let result;
      try {
        const buffer = fs.readFileSync(file);
        skins.validatePng(buffer);
        result = { ok: true, dataUrl: `data:image/png;base64,${buffer.toString("base64")}`, name: item.getFilename() };
      } catch (err) {
        result = { ok: false, error: `Это не скин: ${err.message}` };
      } finally {
        fs.rmSync(file, { force: true });
      }
      if (onSkin) onSkin(result);
    });
  });
}

/**
 * Открывает окно каталога.
 * @param {string} sourceId ключ из SOURCES
 * @param {BrowserWindow} parent главное окно
 * @param {(res:{ok:boolean,dataUrl?:string,error?:string})=>void} callback
 */
function open(sourceId, parent, callback) {
  const source = SOURCES[sourceId] || SOURCES.minecraftskins;
  onSkin = callback;
  const ses = session.fromPartition("persist:skin-catalog");
  setupSession(ses);

  if (win && !win.isDestroyed()) {
    win.loadURL(source.url);
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    parent: parent || undefined,
    title: `Каталог скинов — ${source.title}`,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  // Ссылки «в новой вкладке» открываем в этом же окне (если это сайт скинов),
  // всё остальное — в обычном браузере.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (hostAllowed(url)) win.loadURL(url);
    else if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!hostAllowed(url) && !/^https?:\/\/[^/]*(google|gstatic|cloudflare|challenges)/.test(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
  win.on("closed", () => {
    win = null;
  });
  win.loadURL(source.url);
}

function close() {
  if (win && !win.isDestroyed()) win.close();
}

function sources() {
  return Object.entries(SOURCES).map(([id, s]) => ({ id, title: s.title, url: s.url }));
}

module.exports = { open, close, sources };
