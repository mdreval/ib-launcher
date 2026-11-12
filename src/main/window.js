/**
 * Окно без системной рамки (свои кнопки свернуть/развернуть/закрыть, как в
 * Rich) и значок в трее: пока идёт игра, лаунчер прячется в трей и
 * возвращается, когда игра закрывается.
 */

const path = require("path");
const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");

const paths = require("./paths");

let mainWindow = null;
let tray = null;
let hiddenForGame = false;
let quitting = false;

function iconPath(name) {
  return paths.appResource("assets", name);
}

const isMac = process.platform === "darwin";

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1080,
    minHeight: 680,
    // Windows: своя шапка без рамки. macOS: родные кнопки окна поверх боковой панели.
    ...(isMac ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 24, y: 20 } } : { frame: false }),
    backgroundColor: "#070d0b",
    title: "Igrobar Launcher",
    icon: iconPath(process.platform === "win32" ? "icon.ico" : "icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: false,
      autoplayPolicy: "no-user-gesture-required", // музыка в лаунчере и видео-фон
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());

  const sendState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window:state", { maximized: mainWindow.isMaximized() });
    }
  };
  mainWindow.on("maximize", sendState);
  mainWindow.on("unmaximize", sendState);

  // Внешние ссылки открываем в браузере, а не внутри лаунчера.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

function ensureTray() {
  if (tray) return tray;
  const image = nativeImage.createFromPath(iconPath("icon.png")).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip("Igrobar Launcher");
  const { tr } = require("./core/i18n");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: tr("Открыть Igrobar Launcher"), click: () => showWindow() },
      { type: "separator" },
      {
        label: tr("Выход"),
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => showWindow());
  return tray;
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  ensureTray();
  mainWindow.hide();
}

function onGameStart(hideEnabled) {
  if (!hideEnabled) return;
  hiddenForGame = true;
  hideToTray();
}

function onAllGamesClosed() {
  if (hiddenForGame) {
    hiddenForGame = false;
    showWindow();
  }
}

/** Кнопка «Закрыть»: если игра ещё идёт — прячемся в трей, иначе выходим. */
function closeRequested(gameBusy) {
  if (gameBusy && !quitting) {
    hideToTray();
    return "tray";
  }
  quitting = true;
  app.quit();
  return "quit";
}

function minimize() {
  if (mainWindow) mainWindow.minimize();
}

function toggleMaximize() {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
}

function isMaximized() {
  return !!(mainWindow && mainWindow.isMaximized());
}

module.exports = {
  createMainWindow,
  getMainWindow,
  showWindow,
  onGameStart,
  onAllGamesClosed,
  closeRequested,
  minimize,
  toggleMaximize,
  isMaximized,
  ensureTray,
};
