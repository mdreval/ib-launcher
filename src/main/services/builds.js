/**
 * Сборки — как в Rich Launcher: у каждой своя версия Minecraft, загрузчик и
 * своя папка instances/<id> (моды, ресурспаки, шейдеры, миры).
 *
 * Сборка сервера IGROBAR создаётся автоматически и выбрана по умолчанию.
 * Её версия Minecraft, загрузчик и адрес сервера НЕ зашиты в код, а берутся
 * из файла data/server_profiles.json:
 *   - в установленном лаунчере лежит копия этого файла;
 *   - при запуске лаунчера и перед установкой/запуском сборки сервера
 *     лаунчер скачивает свежую версию файла из репозитория на GitHub
 *     (ветка main, см. SERVER_PROFILES_URLS ниже).
 * Поэтому чтобы перевести сервер на другую версию (например 1.21.4 и другой
 * NeoForge), достаточно поправить data/server_profiles.json и отправить
 * коммит на GitHub — новый релиз лаунчера для этого не нужен.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const paths = require("../paths");
const settings = require("./settings");
const { readJson, writeJson } = require("../core/jsonFile");
const { fetchJson } = require("../core/http");

const pkg = require("../../../package.json");

const SERVER_PROFILES_CACHE = path.join(paths.CACHE_DIR, "server_profiles.json");
const SERVER_PROFILES_BUNDLED = paths.appResource("data", "server_profiles.json");

// Репозиторий лаунчера берётся из package.json → build.publish (тот же, куда
// выкладываются релизы). Если репозиторий приватный, raw-ссылки не работают —
// тогда файл можно приложить к релизу (см. refreshServerProfiles).
const LAUNCHER_REPO = (() => {
  const pub = pkg.build && Array.isArray(pkg.build.publish) ? pkg.build.publish[0] : null;
  return pub && pub.owner && pub.repo ? `${pub.owner}/${pub.repo}` : "mdreval/ib-launcher";
})();
const SERVER_PROFILES_URLS = [
  `https://raw.githubusercontent.com/${LAUNCHER_REPO}/main/data/server_profiles.json`,
  `https://raw.githubusercontent.com/${LAUNCHER_REPO}/master/data/server_profiles.json`,
];
const MODPACK_REPO_DEFAULT = "mdreval/ib-launcher";
const VALID_LOADERS = ["vanilla", "fabric", "forge", "neoforge", "quilt"];

function fallbackServerProfiles() {
  return [
    {
      id: "igrobar",
      name: "IGROBAR",
      mc_version: "1.21.1",
      loader_type: "neoforge",
      loader_version: "21.1.265",
      modpack: { repo: "mdreval/ib-launcher", asset: "modpack.zip" },
      dynmap_url: "https://igrobar.dynmap.xyz/",
      mtr_map_url: "http://d11.joinserver.xyz:25986/",
      server_address: "igrobar.aboba.host",
      status_address: "igrobar.aboba.host, igrobar2.aboba.host, d11.joinserver.xyz:25970, 135.181.237.56:25970",
      telegram: "https://t.me/igrobar",
      description: "Сборка сервера IGROBAR.",
    },
  ];
}

/** Файл бывает двух видов: новый { launcher_version, servers: [...] } и
 * старый — просто массив серверов. */
function validProfiles(data) {
  const list = data && !Array.isArray(data) && Array.isArray(data.servers) ? data.servers : data;
  if (!Array.isArray(list)) return null;
  const ok = list.filter((p) => p && typeof p === "object" && p.id && p.mc_version && p.loader_type);
  return ok.length ? ok : null;
}

/** Скачанные с GitHub параметры важнее встроенных; пустые поля (null) в
 * скачанном файле берутся из встроенной копии. */
function serverProfiles() {
  const bundled = validProfiles(readJson(SERVER_PROFILES_BUNDLED, null)) || fallbackServerProfiles();
  const remote = validProfiles(readJson(SERVER_PROFILES_CACHE, null));
  if (!remote) return bundled;
  return remote.map((p) => {
    const base = bundled.find((b) => b.id === p.id) || {};
    const merged = { ...base };
    for (const [key, value] of Object.entries(p)) if (value !== null && value !== undefined) merged[key] = value;
    return merged;
  });
}

/**
 * Обновляет параметры сервера с GitHub. Порядок:
 *   1) data/server_profiles.json в ветке main (или master) репозитория лаунчера;
 *   2) server_profiles.json, приложенный к релизу (старый способ).
 * Ошибки не критичны — остаётся последняя скачанная или встроенная копия.
 * Возвращает true, если параметры поменялись.
 */
let refreshing = null;
async function refreshServerProfiles() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const before = JSON.stringify(serverProfiles());
    let data = null;
    for (const url of SERVER_PROFILES_URLS) {
      try {
        data = validProfiles(await fetchJson(`${url}?t=${Date.now()}`, { timeout: 8000 }));
        if (data) break;
      } catch (err) {
        /* пробуем следующий источник */
      }
    }
    if (!data) {
      try {
        const releases = await fetchJson(`https://api.github.com/repos/${LAUNCHER_REPO}/releases?per_page=10`, { timeout: 8000 });
        for (const release of releases) {
          const asset = (release.assets || []).find((a) => a.name === "server_profiles.json");
          if (!asset) continue;
          data = validProfiles(await fetchJson(asset.browser_download_url, { timeout: 8000 }));
          if (data) break;
        }
      } catch (err) {
        /* нет сети — остаёмся на текущих параметрах */
      }
    }
    if (!data) return false;
    writeJson(SERVER_PROFILES_CACHE, data);
    return JSON.stringify(serverProfiles()) !== before;
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

function loadStore() {
  const store = readJson(paths.BUILDS_FILE, {});
  return { custom: store.custom || [], server_state: store.server_state || {} };
}

function saveStore(store) {
  writeJson(paths.BUILDS_FILE, store);
}

function serverBuild(profile, state) {
  return {
    id: profile.id,
    name: profile.name,
    kind: "server",
    locked: true,
    mc_version: profile.mc_version,
    loader_type: profile.loader_type,
    loader_version: profile.loader_version,
    modpack: profile.modpack ? { repo: MODPACK_REPO_DEFAULT, asset: "modpack.zip", ...profile.modpack } : null,
    dynmap_url: profile.dynmap_url || null,
    mtr_map_url: profile.mtr_map_url || null,
    server_address: profile.server_address || null,
    status_address: profile.status_address || profile.server_address || null,
    telegram: profile.telegram || null,
    description: profile.description || "",
    installed: !!state.installed,
    installed_signature: state.installed_signature || null,
    ram_mb: state.ram_mb || null,
    jvm_args: state.jvm_args || "",
    window: state.window || null,
    fullscreen: !!state.fullscreen,
    last_played: state.last_played || null,
    created_at: 0,
  };
}

function signature(build) {
  return `${build.mc_version}|${build.loader_type}|${build.loader_version || ""}`;
}

function list() {
  const store = loadStore();
  const servers = serverProfiles().map((p) => serverBuild(p, store.server_state[p.id] || {}));
  const custom = store.custom.map((b) => ({
    ...b,
    kind: "custom",
    locked: false,
    loader_type: VALID_LOADERS.includes(b.loader_type) ? b.loader_type : "vanilla",
    loader_version: b.loader_version || null,
    window: b.window || null,
    fullscreen: !!b.fullscreen,
    installed: !!b.installed,
    folder: b.folder || null,
  }));
  // Если версия/загрузчик поменялись после установки — снова нужна установка.
  return [...servers, ...custom].map((b) => ({
    ...b,
    installed: b.installed && (!b.installed_signature || b.installed_signature === signature(b)),
  }));
}

function get(id) {
  return list().find((b) => b.id === id) || null;
}

function selected() {
  const all = list();
  return all.find((b) => b.id === settings.get().selected_build) || all[0] || null;
}

function uniqueName(base, all) {
  if (!all.some((b) => b.name === base)) return base;
  let n = 2;
  while (all.some((b) => b.name === `${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

function defaultName(mc, loader) {
  const titles = { vanilla: "Minecraft", fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt" };
  return `${titles[loader] || "Minecraft"} ${mc}`;
}

// ---------- папки сборок ----------
//
// Каждая своя сборка лежит в instances/<папка>, где папка — понятное имя из
// названия сборки латиницей: «Forge 1.12.2» → instances/Forge-1.12.2.
// Внутренний id сборки (b-xxxx) остаётся прежним — на него завязаны
// настройки, — меняется только имя папки.

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g",
};

/** Имя папки из названия: только латиница, цифры, «.», «-», «_» — старые
 * версии Minecraft и Forge ломаются на кириллице и пробелах в пути. */
function folderSlug(name) {
  let out = "";
  for (const ch of String(name || "")) {
    const lower = ch.toLowerCase();
    if (TRANSLIT[lower] !== undefined) {
      const t = TRANSLIT[lower];
      out += ch !== lower && t ? t[0].toUpperCase() + t.slice(1) : t;
    } else out += ch;
  }
  out = out
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 48);
  return out || "build";
}

function instancesRoot() {
  return path.join(settings.gameDir(), "instances");
}

function reservedFolders(store, exceptId) {
  const used = new Set(serverProfiles().map((p) => String(p.id).toLowerCase()));
  for (const b of store.custom) if (b.id !== exceptId) used.add(String(b.folder || b.id).toLowerCase());
  return used;
}

function uniqueFolder(base, store, exceptId, currentDir) {
  const used = reservedFolders(store, exceptId);
  const free = (name) => {
    if (used.has(name.toLowerCase())) return false;
    const dir = path.join(instancesRoot(), name);
    return !fs.existsSync(dir) || (currentDir && path.resolve(dir).toLowerCase() === path.resolve(currentDir).toLowerCase());
  };
  if (free(base)) return base;
  let n = 2;
  while (!free(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Переименовывает папку сборки под её текущее название. Вызывать только
 * когда сборка не запущена. Возвращает новое имя папки. */
function renameFolder(id) {
  const store = loadStore();
  const build = store.custom.find((b) => b.id === id);
  if (!build) return null;
  const oldName = build.folder || build.id;
  const oldDir = path.join(instancesRoot(), oldName);
  const wanted = uniqueFolder(folderSlug(build.name), store, id, oldDir);
  if (wanted === oldName) return oldName;
  const newDir = path.join(instancesRoot(), wanted);
  if (fs.existsSync(oldDir)) {
    try {
      fs.renameSync(oldDir, newDir);
    } catch (err) {
      return oldName; // папка занята (открыта в проводнике и т.п.) — оставляем как есть
    }
  }
  build.folder = wanted;
  saveStore(store);
  return wanted;
}

/** Один раз при запуске: старые сборки с папками b-xxxx получают понятные имена. */
function migrateFolders() {
  const store = loadStore();
  const ids = store.custom.filter((b) => !b.folder).map((b) => b.id);
  for (const id of ids) renameFolder(id);
}

function create({ name, mc_version, loader_type, loader_version }) {
  if (!mc_version) throw new Error("Не выбрана версия Minecraft");
  const loader = VALID_LOADERS.includes(loader_type) ? loader_type : "vanilla";
  if (loader !== "vanilla" && !loader_version) throw new Error("Не выбрана версия загрузчика");
  const store = loadStore();
  const all = list();
  const build = {
    id: `b-${crypto.randomBytes(4).toString("hex")}`,
    name: uniqueName((name || "").trim() || defaultName(mc_version, loader), all),
    folder: null,
    mc_version,
    loader_type: loader,
    loader_version: loader === "vanilla" ? null : loader_version,
    created_at: Date.now(),
    installed: false,
    ram_mb: null,
    jvm_args: "",
    last_played: null,
  };
  build.folder = uniqueFolder(folderSlug(build.name), store, build.id);
  store.custom.push(build);
  saveStore(store);
  return get(build.id);
}

const EDITABLE_CUSTOM = ["name", "loader_version", "ram_mb", "jvm_args", "window", "fullscreen", "installed", "installed_signature", "last_played"];
const EDITABLE_SERVER = ["ram_mb", "jvm_args", "window", "fullscreen", "installed", "installed_signature", "last_played"];

function update(id, patch) {
  const store = loadStore();
  const isServer = serverProfiles().some((p) => p.id === id);
  if (isServer) {
    const state = { ...(store.server_state[id] || {}) };
    for (const key of EDITABLE_SERVER) if (key in patch) state[key] = patch[key];
    store.server_state[id] = state;
  } else {
    const build = store.custom.find((b) => b.id === id);
    if (!build) throw new Error("Сборка не найдена");
    for (const key of EDITABLE_CUSTOM) if (key in patch) build[key] = patch[key];
    if (typeof build.name === "string") build.name = build.name.trim() || defaultName(build.mc_version, build.loader_type);
  }
  saveStore(store);
  return get(id);
}

function markInstalled(id) {
  const build = get(id);
  if (!build) return null;
  return update(id, { installed: true, installed_signature: signature(build) });
}

/** Имя папки сборки внутри instances (его же получает minecraft-java-core). */
function instanceName(buildOrId) {
  let build = typeof buildOrId === "string" ? null : buildOrId;
  if (!build) {
    const id = String(buildOrId);
    const stored = loadStore().custom.find((b) => b.id === id);
    build = stored || { id };
  } else if (build.kind !== "server" && !build.folder) {
    const stored = loadStore().custom.find((b) => b.id === build.id);
    if (stored && stored.folder) build = stored;
  }
  const name = String(build.folder || build.id).replace(/[^A-Za-z0-9._-]/g, "");
  return name || "default";
}

function instanceDir(buildOrId) {
  return path.join(instancesRoot(), instanceName(buildOrId));
}

/** Удаляет только саму сборку и её папку instances/<id>. Общие версии,
 * библиотеки и другие сборки не трогаются. */
function remove(id) {
  if (serverProfiles().some((p) => p.id === id)) throw new Error("Сборку сервера удалить нельзя");
  const dir = instanceDir(id);
  const store = loadStore();
  const before = store.custom.length;
  store.custom = store.custom.filter((b) => b.id !== id);
  if (store.custom.length === before) throw new Error("Сборка не найдена");
  saveStore(store);
  if (path.dirname(dir) === instancesRoot() && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (settings.get().selected_build === id) settings.update({ selected_build: serverProfiles()[0]?.id || "igrobar" });
  return true;
}

/** Профиль сервера, под который подходит сборка (версия + загрузчик +
 * версия загрузчика). Именно от этого зависит, работает ли галочка
 * «Обновлять модпак»: для любых других версий модпак не проверяется. */
function modpackProfileFor(build) {
  if (!build) return null;
  return (
    serverProfiles().find(
      (p) =>
        p.modpack &&
        p.mc_version === build.mc_version &&
        p.loader_type === build.loader_type &&
        String(p.loader_version) === String(build.loader_version)
    ) || null
  );
}

function isModpackCapable(build) {
  return !!modpackProfileFor(build);
}

function modpackEnabled(build) {
  if (!isModpackCapable(build)) return false;
  const value = settings.get().modpack[build.id];
  if (typeof value === "boolean") return value;
  return build.kind === "server";
}

module.exports = {
  VALID_LOADERS,
  serverProfiles,
  refreshServerProfiles,
  list,
  get,
  selected,
  create,
  update,
  remove,
  markInstalled,
  instanceDir,
  instanceName,
  renameFolder,
  migrateFolders,
  folderSlug,
  modpackProfileFor,
  isModpackCapable,
  modpackEnabled,
  signature,
};
