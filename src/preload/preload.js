/**
 * Мост между интерфейсом и main-процессом. Интерфейс видит только window.ib
 * — без доступа к Node и файловой системе.
 */

const { contextBridge, ipcRenderer, webUtils } = require("electron");

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (res && res.ok) return res.data;
  const err = new Error((res && res.error) || "Неизвестная ошибка");
  err.code = res && res.code;
  throw err;
}

const EVENTS = [
  "window:state",
  "builds:changed",
  "accounts:changed",
  "skins:changed",
  "skins:downloaded",
  "game:state",
  "game:log",
  "game:log-reset",
  "game:exited",
  "modpack:progress",
  "update:event",
];

function on(event, callback) {
  if (!EVENTS.includes(event)) throw new Error(`Неизвестное событие ${event}`);
  const listener = (_e, payload) => callback(payload);
  ipcRenderer.on(event, listener);
  return () => ipcRenderer.removeListener(event, listener);
}

contextBridge.exposeInMainWorld("ib", {
  on,
  app: {
    info: () => call("app:info"),
    minimize: () => call("app:minimize"),
    toggleMaximize: () => call("app:toggle-maximize"),
    close: () => call("app:close"),
    openExternal: (url) => call("app:open-external", url),
    openPath: (target) => call("app:open-path", target),
    pickDirectory: () => call("app:pick-directory"),
  },
  settings: {
    get: () => call("settings:get"),
    update: (patch) => call("settings:update", patch),
    reset: () => call("settings:reset"),
  },
  accounts: {
    list: () => call("accounts:list"),
    addOffline: (name) => call("accounts:add-offline", name),
    addMicrosoft: () => call("accounts:add-microsoft"),
    addEly: (data) => call("accounts:add-ely", data),
    remove: (id) => call("accounts:remove", id),
    select: (id) => call("accounts:select", id),
  },
  appearance: {
    get: () => call("appearance:get"),
    set: (patch) => call("appearance:set", patch),
    pickFile: () => call("appearance:pick-file"),
    fromUrl: (url) => call("appearance:from-url", url),
    reset: () => call("appearance:reset"),
  },
  skins: {
    get: (accountId) => call("skins:get", accountId),
    save: (data) => call("skins:save", data),
    reset: (accountId) => call("skins:reset", accountId),
    presets: () => call("skins:presets"),
    openFile: () => call("skins:open-file"),
    readPath: (filePath) => call("skins:read-path", filePath),
    export: (dataUrl) => call("skins:export", dataUrl),
    catalogSources: () => call("skins:catalog-sources"),
    openCatalog: (sourceId) => call("skins:open-catalog", sourceId),
  },
  versions: {
    catalog: () => call("versions:catalog"),
    loaders: (loader, mc) => call("versions:loaders", { loader, mc }),
  },
  builds: {
    list: () => call("builds:list"),
    create: (data) => call("builds:create", data),
    update: (id, patch) => call("builds:update", { id, patch }),
    remove: (id) => call("builds:remove", id),
    select: (id) => call("builds:select", id),
    install: (id) => call("builds:install", id),
    launch: (id) => call("builds:launch", id),
    stop: (id) => call("builds:stop", id),
    openFolder: (id) => call("builds:open-folder", id),
    refreshServer: () => call("builds:refresh-server"),
  },
  modpack: {
    status: (id) => call("modpack:status", id),
    setEnabled: (id, enabled) => call("modpack:set-enabled", { id, enabled }),
    sync: (id) => call("modpack:sync", id),
  },
  content: {
    list: (buildId, kind, refresh) => call("content:list", { buildId, kind, refresh }),
    toggle: (buildId, kind, file, enabled) => call("content:toggle", { buildId, kind, file, enabled }),
    remove: (buildId, kind, file) => call("content:remove", { buildId, kind, file }),
    addFiles: (buildId, kind) => call("content:add-files", { buildId, kind }),
    addPaths: (buildId, kind, paths) => call("content:add-paths", { buildId, kind, paths }),
    openFolder: (buildId, kind) => call("content:open-folder", { buildId, kind }),
    install: (buildId, kind, projectId) => call("content:install", { buildId, kind, projectId }),
    update: (buildId, kind, file) => call("content:update", { buildId, kind, file }),
    updateAll: (buildId, kind) => call("content:update-all", { buildId, kind }),
    fix: (buildId, kind, file) => call("content:fix", { buildId, kind, file }),
    search: (buildId, kind, params) => call("content:search", { buildId, kind, params }),
    categories: (kind) => call("content:categories", kind),
  },
  game: {
    states: () => call("game:states"),
    logs: (buildId) => call("game:logs", buildId),
    clearLogs: (buildId) => call("game:clear-logs", buildId),
    report: (buildId) => call("game:report", buildId),
  },
  server: {
    ping: (address) => call("server:ping", address),
  },
  updates: {
    check: () => call("updates:check"),
    download: () => call("updates:download"),
    install: () => call("updates:install"),
  },
  files: {
    // Путь к файлу, перетащенному в окно (для drag-and-drop модов и скинов).
    pathFor: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch (err) {
        return null;
      }
    },
  },
});
