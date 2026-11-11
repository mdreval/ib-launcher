/** Отправка событий в окно лаунчера (прогресс, журнал игры и т.п.). */

const { BrowserWindow } = require("electron");

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

module.exports = { broadcast };
