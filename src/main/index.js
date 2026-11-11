// Повторы и запасные адреса для сетевых запросов — до загрузки всего остального.
const netPatch = require("./core/netPatch");
netPatch.install();
netPatch.tuneLibraryMirrors();

const { app } = require("electron");
const log = require("electron-log");

const paths = require("./paths");

paths.ensureDirs();
log.transports.file.resolvePathFn = () => paths.LAUNCHER_LOG_FILE;
log.errorHandler.startCatching({ showDialog: false });

// Одна копия лаунчера: второй запуск просто показывает уже открытое окно.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const windowMod = require("./window");

  app.on("second-instance", () => windowMod.showWindow());

  app.whenReady().then(() => {
    app.setAppUserModelId("ru.igrobar.launcher");
    require("./ipc").register();
    windowMod.createMainWindow();
    app.on("activate", () => windowMod.showWindow());
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
