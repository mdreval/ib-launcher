/**
 * Все вызовы из интерфейса. Каждый обработчик возвращает { ok, data } или
 * { ok:false, error, code } — preload превращает это в обычное исключение с
 * понятным текстом (без «Error invoking remote method…»).
 */

const fs = require("fs");
const { ipcMain, shell, dialog, app } = require("electron");

const paths = require("./paths");
const windowMod = require("./window");
const settings = require("./services/settings");
const builds = require("./services/builds");
const versions = require("./services/versions");
const accounts = require("./services/accounts");
const skins = require("./services/skins");
const game = require("./services/game");
const modpack = require("./services/modpack");
const content = require("./services/content");
const serverStatus = require("./core/serverStatus");
const skinCatalog = require("./skinCatalog");
const appearance = require("./services/appearance");
const updater = require("./core/updater");
const { broadcast } = require("./core/broadcast");
const i18n = require("./core/i18n");

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), code: (err && err.code) || null };
    }
  });
}

function buildView(build) {
  return {
    ...build,
    loader_label: versions.loaderLabel(build),
    modpack_capable: builds.isModpackCapable(build),
    modpack_enabled: builds.modpackEnabled(build),
  };
}

function buildsPayload() {
  const all = builds.list().map(buildView);
  const selected = builds.selected();
  return { builds: all, selected: selected ? selected.id : null, states: game.allStates() };
}

function settingsView() {
  return {
    ...settings.get(),
    total_ram_mb: settings.totalRamMb(),
    game_dir_effective: settings.gameDir(),
    default_game_dir: paths.DEFAULT_GAME_DIR,
    launcher_dir: paths.LAUNCHER_DIR,
    language_effective: i18n.language(),
  };
}

/** Выбор сборки запоминается для текущего аккаунта. */
function rememberBuild(buildId) {
  const acc = accounts.selected();
  const patch = { selected_build: buildId };
  if (acc) patch.account_builds = { [acc.id]: buildId };
  settings.update(patch);
}

function notifyBuilds() {
  broadcast("builds:changed", buildsPayload());
}

function notifyAccounts() {
  broadcast("accounts:changed", accounts.list());
}

function register() {
  // Старые папки сборок b-xxxx → понятные имена (Forge-1.12.2 и т.п.).
  try {
    builds.migrateFolders();
  } catch (err) {
    /* не критично */
  }

  game.setWindowHooks({
    onGameStart: () => windowMod.onGameStart(settings.get().hide_on_launch),
    onAllGamesClosed: () => {
      windowMod.onAllGamesClosed();
      notifyBuilds();
    },
  });

  // ----- окно и система -----
  handle("app:info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataRoot: paths.DATA_ROOT,
    maximized: windowMod.isMaximized(),
  }));
  handle("app:minimize", () => windowMod.minimize());
  handle("app:toggle-maximize", () => windowMod.toggleMaximize());
  handle("app:close", () => windowMod.closeRequested(game.isBusy()));
  handle("app:open-external", (url) => {
    if (!/^https?:\/\//.test(String(url))) throw new Error("Недопустимая ссылка");
    return shell.openExternal(url);
  });
  handle("app:open-path", async (target) => {
    const map = { data: paths.LAUNCHER_DIR, game: settings.gameDir(), logs: paths.LOGS_DIR };
    const dir = map[target];
    if (!dir) throw new Error("Неизвестная папка");
    fs.mkdirSync(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return true;
  });
  handle("app:pick-directory", async () => {
    const res = await dialog.showOpenDialog(windowMod.getMainWindow(), {
      title: i18n.tr("Выберите папку игры"),
      properties: ["openDirectory", "createDirectory"],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  // ----- настройки -----
  handle("settings:get", () => settingsView());
  handle("settings:update", (patch) => {
    if (patch && "game_dir" in patch && game.isBusy()) throw new Error("Сначала закройте игру");
    settings.update(patch || {});
    notifyBuilds();
    return settingsView();
  });
  handle("settings:reset", () => {
    settings.reset();
    notifyBuilds();
    return settingsView();
  });

  // ----- аккаунты -----
  handle("accounts:list", () => accounts.list());
  handle("accounts:add-offline", (name) => {
    const view = accounts.addOffline(name);
    notifyAccounts();
    return view;
  });
  handle("accounts:add-microsoft", async () => {
    const view = await accounts.addMicrosoft();
    notifyAccounts();
    return view;
  });
  handle("accounts:add-ely", async (data) => {
    const view = await accounts.addEly(data || {});
    notifyAccounts();
    return view;
  });
  handle("accounts:remove", (id) => {
    const list = accounts.remove(id);
    notifyAccounts();
    return list;
  });
  handle("accounts:select", (id) => {
    const list = accounts.select(id);
    // У каждого аккаунта своя последняя выбранная сборка.
    const remembered = (settings.get().account_builds || {})[id];
    if (remembered && builds.get(remembered)) {
      settings.update({ selected_build: remembered });
      notifyBuilds();
    }
    notifyAccounts();
    return list;
  });

  // ----- скины -----
  handle("skins:get", (accountId) => {
    const id = accountId || (accounts.selected() || {}).id || null;
    return { accountId: id, ...skins.get(id) };
  });
  handle("skins:save", async ({ accountId, dataUrl, model }) => {
    const id = accountId || (accounts.selected() || {}).id;
    if (!id) throw new Error("Сначала добавьте аккаунт");
    const buffer = skins.dataUrlToBuffer(dataUrl);
    const account = accounts.accountById(id);
    let message = "Скин сохранён";
    let uploaded = false;
    if (account && account.type === "microsoft") {
      await accounts.uploadMicrosoftSkin(id, buffer, model);
      uploaded = true;
      message = "Скин загружен в профиль Minecraft";
    } else if (account && account.type === "ely") {
      message = "Скин сохранён в лаунчере. Чтобы его видели другие игроки, загрузите его на ely.by";
    } else {
      message = "Скин сохранён — в игре он появится при следующем запуске. Чтобы его видели другие игроки, загрузите его на ely.by под тем же ником";
    }
    const skin = skins.save(id, buffer, model, uploaded ? "account" : "custom");
    broadcast("skins:changed", { accountId: id });
    return { skin: { accountId: id, ...skin }, uploaded, message };
  });
  handle("skins:reset", (accountId) => {
    const id = accountId || (accounts.selected() || {}).id;
    skins.remove(id);
    broadcast("skins:changed", { accountId: id });
    return { accountId: id, ...skins.get(id) };
  });
  handle("skins:presets", () => skins.presets());
  handle("skins:catalog-sources", () => skinCatalog.sources());
  handle("skins:open-catalog", (sourceId) => {
    skinCatalog.open(sourceId, windowMod.getMainWindow(), (result) => {
      broadcast("skins:downloaded", result);
      if (result.ok) {
        skinCatalog.close();
        windowMod.showWindow();
      }
    });
    return true;
  });
  handle("skins:open-file", async () => {
    const res = await dialog.showOpenDialog(windowMod.getMainWindow(), {
      title: i18n.tr("Выберите скин"),
      filters: [{ name: i18n.tr("Скин PNG"), extensions: ["png"] }],
      properties: ["openFile"],
    });
    if (res.canceled) return null;
    const buffer = fs.readFileSync(res.filePaths[0]);
    skins.validatePng(buffer);
    return { dataUrl: `data:image/png;base64,${buffer.toString("base64")}` };
  });
  handle("skins:read-path", (filePath) => {
    const buffer = fs.readFileSync(String(filePath));
    skins.validatePng(buffer);
    return { dataUrl: `data:image/png;base64,${buffer.toString("base64")}` };
  });
  handle("skins:export", async (dataUrl) => {
    const res = await dialog.showSaveDialog(windowMod.getMainWindow(), {
      title: i18n.tr("Сохранить скин"),
      defaultPath: "skin.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (res.canceled || !res.filePath) return false;
    fs.writeFileSync(res.filePath, skins.dataUrlToBuffer(dataUrl));
    return true;
  });

  // ----- версии -----
  handle("versions:catalog", () => versions.catalog());
  handle("versions:loaders", ({ loader, mc }) => versions.loaderVersions(loader, mc));

  // ----- сборки -----
  handle("builds:list", () => buildsPayload());
  handle("builds:create", (data) => {
    const build = builds.create(data || {});
    rememberBuild(build.id);
    notifyBuilds();
    return buildView(build);
  });
  handle("builds:update", ({ id, patch }) => {
    const before = builds.get(id);
    let build = builds.update(id, patch || {});
    // Переименовали сборку — переименуем и её папку (если игра не запущена).
    if (before && build && before.kind === "custom" && before.name !== build.name && game.publicState(id).status === "idle") {
      builds.renameFolder(id);
      build = builds.get(id);
    }
    notifyBuilds();
    return buildView(build);
  });
  handle("builds:remove", (id) => {
    if (game.publicState(id).status !== "idle") throw new Error("Сначала закройте игру в этой сборке");
    builds.remove(id);
    notifyBuilds();
    return true;
  });
  handle("builds:select", (id) => {
    if (!builds.get(id)) throw new Error("Сборка не найдена");
    rememberBuild(id);
    notifyBuilds();
    return true;
  });
  handle("builds:install", async (id) => {
    const build = await game.install(id);
    notifyBuilds();
    return buildView(build);
  });
  handle("builds:launch", async (id) => {
    rememberBuild(id);
    const state = await game.launch(id);
    notifyBuilds();
    return state;
  });
  handle("builds:stop", (id) => game.stop(id));
  handle("builds:open-folder", async (id) => {
    const dir = builds.instanceDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return true;
  });
  handle("builds:refresh-server", async () => {
    await builds.refreshServerProfiles();
    notifyBuilds();
    return buildsPayload();
  });

  // ----- модпак сервера -----
  handle("modpack:status", (id) => modpack.status(id));
  handle("modpack:set-enabled", ({ id, enabled }) => {
    const build = builds.get(id);
    if (!build || !builds.isModpackCapable(build)) {
      const p = builds.serverProfiles().find((x) => x.modpack);
      throw new Error(`Обновление модпака доступно только для сборки ${p ? `${p.mc_version} + ${p.loader_type} ${p.loader_version}` : "сервера"}`);
    }
    settings.update({ modpack: { [id]: !!enabled } });
    notifyBuilds();
    return modpack.status(id);
  });
  handle("modpack:sync", async (id) => {
    if (game.publicState(id).status !== "idle") throw new Error("Сначала закройте игру в этой сборке");
    const result = await modpack.sync(id, {
      force: false,
      onProgress: (percent, text) => broadcast("modpack:progress", { buildId: id, percent, text }),
    });
    if (result.skipped && result.reason === "not-capable") throw new Error("Для этой сборки модпак сервера не используется");
    if (result.skipped && result.reason === "disabled") throw new Error("Включите «Обновлять модпак» в настройках");
    return result;
  });

  // ----- моды, ресурспаки, шейдеры -----
  handle("content:list", ({ buildId, kind, refresh }) => content.list(buildId, kind, { refreshUpdates: !!refresh }));
  handle("content:toggle", ({ buildId, kind, file, enabled }) => content.setEnabled(buildId, kind, file, enabled));
  handle("content:remove", ({ buildId, kind, file }) => content.remove(buildId, kind, file));
  handle("content:add-files", async ({ buildId, kind }) => {
    const ext = kind === "mods" ? "jar" : "zip";
    const res = await dialog.showOpenDialog(windowMod.getMainWindow(), {
      title: i18n.tr("Добавить файлы"),
      properties: ["openFile", "multiSelections"],
      filters: [{ name: i18n.tr(kind === "mods" ? "Моды (.jar)" : "Архивы (.zip)"), extensions: [ext] }],
    });
    if (res.canceled) return { added: [], skipped: [] };
    return content.addFiles(buildId, kind, res.filePaths);
  });
  handle("content:add-paths", ({ buildId, kind, paths: list }) => content.addFiles(buildId, kind, list));
  handle("content:open-folder", async ({ buildId, kind }) => {
    const err = await shell.openPath(content.folder(buildId, kind));
    if (err) throw new Error(err);
    return true;
  });
  handle("content:install", ({ buildId, kind, projectId }) => content.installProject(buildId, kind, projectId));
  handle("content:update", ({ buildId, kind, file }) => content.updateFile(buildId, kind, file));
  handle("content:update-all", ({ buildId, kind }) => content.updateAll(buildId, kind));
  handle("content:fix", ({ buildId, kind, file }) => content.fix(buildId, kind, file));
  handle("content:search", ({ buildId, kind, params }) => content.search(buildId, kind, params || {}));
  handle("content:categories", (kind) => content.categories(kind));

  // ----- оформление -----
  handle("appearance:get", () => appearance.get());
  handle("appearance:set", (patch) => {
    const allowed = {};
    for (const key of ["theme", "accent_color", "background", "bg_dim"]) if (patch && key in patch) allowed[key] = patch[key];
    settings.update(allowed);
    return appearance.get();
  });
  handle("appearance:pick-file", async () => {
    const res = await dialog.showOpenDialog(windowMod.getMainWindow(), {
      title: i18n.tr("Выберите картинку для фона"),
      filters: [{ name: i18n.tr("Картинки"), extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      properties: ["openFile"],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return appearance.fromPath(res.filePaths[0]);
  });
  handle("appearance:from-url", (url) => appearance.fromUrl(url));
  handle("appearance:reset", () => appearance.resetCustom());

  // ----- журнал игры -----
  handle("game:states", () => game.allStates());
  handle("game:logs", (buildId) => game.logs(buildId));
  handle("game:clear-logs", (buildId) => game.clearLogs(buildId));
  handle("game:report", (buildId) => game.report(buildId));

  // ----- сервер -----
  handle("server:ping", (address) => serverStatus.ping(address));

  // ----- обновления лаунчера -----
  updater.setup((event) => broadcast("update:event", event));
  handle("updates:check", () => updater.checkForUpdates());
  handle("updates:download", () => updater.downloadUpdate());
  handle("updates:install", () => updater.quitAndInstall());

  // Свежие параметры сервера IGROBAR (версия, NeoForge, адрес) с GitHub —
  // в фоне при запуске лаунчера.
  builds
    .refreshServerProfiles()
    .then((changed) => {
      if (changed) notifyBuilds();
    })
    .catch(() => {});
}

module.exports = { register };
