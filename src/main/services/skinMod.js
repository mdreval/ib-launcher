/**
 * Скины в игре — как в TLauncher, только на открытом моде.
 *
 * Без лицензии игра сама скины не показывает: ей неоткуда их взять. Для этого
 * используется мод CustomSkinLoader (Modrinth, один «универсальный» файл для
 * Forge / NeoForge / Fabric / Quilt и версий 1.8 — 1.21+). Лаунчер:
 *   1) сам ставит этот мод в каждую сборку с загрузчиком (кроме ванильных —
 *      туда моды не ставятся) и не дублирует его, если мод уже есть в
 *      модпаке или его поставил игрок;
 *   2) перед запуском кладёт выбранный в лаунчере скин офлайн-профиля в
 *      папку сборки CustomSkinLoader/LocalSkin/skins/<ник>.png — игрок видит
 *      свой скин сразу.
 *
 * Чтобы скин видели ДРУГИЕ игроки, он должен лежать на общем сервере скинов.
 * CustomSkinLoader по умолчанию берёт скины по нику с Mojang, Ely.by,
 * TLauncher, LittleSkin — поэтому достаточно зарегистрировать свой ник на
 * ely.by и загрузить туда скин (в лаунчере для этого есть кнопка).
 *
 * Выключается настройкой skin_mod: false в settings.json.
 */

const fs = require("fs");
const path = require("path");

const builds = require("./builds");
const settings = require("./settings");
const skins = require("./skins");
const { fetchJson, downloadFile, fetchBuffer } = require("../core/http");
const { readJson, writeJson } = require("../core/jsonFile");

const PROJECT_ID = "idMHQ4n2"; // customskinloader на Modrinth
const STATE_FILE = ".igrobar-skinmod.json";
const MOD_RE = /customskinloader/i;

function modLoadersFor(loaderType) {
  switch (loaderType) {
    case "forge":
      return ["forge"];
    case "neoforge":
      return ["neoforge"];
    case "fabric":
      return ["fabric"];
    case "quilt":
      return ["quilt", "fabric"];
    default:
      return [];
  }
}

async function findVersion(build) {
  const loaders = modLoadersFor(build.loader_type);
  if (!loaders.length) return null;
  const params = new URLSearchParams({ loaders: JSON.stringify(loaders), game_versions: JSON.stringify([build.mc_version]) });
  const list = await fetchJson(`https://api.modrinth.com/v2/project/${PROJECT_ID}/version?${params}`, { timeout: 15000 });
  if (!Array.isArray(list) || !list.length) return null;
  const release = list.find((v) => v.version_type === "release") || list[0];
  const file = (release.files || []).find((f) => f.primary) || (release.files || [])[0];
  return file ? { version: release.version_number, url: file.url, filename: file.filename, sha1: file.hashes && file.hashes.sha1, size: file.size } : null;
}

/** Ставит CustomSkinLoader в сборку, если его там ещё нет. */
async function ensureMod(build, log) {
  if (settings.get().skin_mod === false) return;
  if (!modLoadersFor(build.loader_type).length) return;
  const dir = builds.instanceDir(build);
  const modsDir = path.join(dir, "mods");
  const stateFile = path.join(dir, STATE_FILE);
  const state = readJson(stateFile, {});
  fs.mkdirSync(modsDir, { recursive: true });

  const files = fs.readdirSync(modsDir).filter((f) => MOD_RE.test(f));
  const ours = state.file && files.includes(state.file) ? state.file : null;
  const others = files.filter((f) => f !== ours);

  // Мод уже есть (в модпаке или игрок поставил/выключил сам) — свой не нужен.
  if (others.length) {
    if (ours) {
      fs.rmSync(path.join(modsDir, ours), { force: true });
      writeJson(stateFile, {});
    }
    return;
  }
  if (ours && state.mc_version === build.mc_version && state.loader_type === build.loader_type) return;

  const found = await findVersion(build);
  if (!found) {
    if (log) log(`Мод скинов CustomSkinLoader не найден для ${build.loader_type} ${build.mc_version} — скины в игре могут не показываться`);
    return;
  }
  await downloadFile(found.url, path.join(modsDir, found.filename), { sha1: found.sha1, expectedSize: found.size });
  if (ours && ours !== found.filename) fs.rmSync(path.join(modsDir, ours), { force: true });
  writeJson(stateFile, { file: found.filename, version: found.version, mc_version: build.mc_version, loader_type: build.loader_type });
  if (log) log(`Установлен мод скинов CustomSkinLoader ${found.version}`);
}

// ---------- порядок источников скинов ----------
//
// CustomSkinLoader ищет скин по нику по очереди в нескольких местах и берёт
// первый найденный. По умолчанию Mojang стоит вторым, а «свой скин из
// лаунчера» (LocalSkin) — почти последним. Поэтому, если ник занят на
// Microsoft (например, mdreval), мод показывал лицензионный скин, а не
// выбранный в лаунчере. Наш порядок:
//   1. LocalSkin   — свой скин игрока: для офлайн-профиля — выбранный в
//                    лаунчере, для Ely.by-аккаунта — скачанный с Ely.by;
//   2. GameProfile — скин, который прислал сервер (на серверах с плагином
//                    скинов, вроде SkinsRestorer, это скин с Mojang по нику —
//                    поэтому он теперь ниже своего);
//   3. Ely.by, TLauncher — где обычно скины у игроков без лицензии;
//   4. Mojang и остальные.
// Файл: <сборка>/CustomSkinLoader/CustomSkinLoader.json. Мод сам дописывает
// в записи адреса и пути по имени источника — нам достаточно имени и типа.

const PREFERRED_ORDER = [
  { name: "LocalSkin", type: "Legacy" },
  { name: "GameProfile", type: "GameProfile" },
  { name: "ElyBy", type: "ElyByAPI" },
  { name: "TLauncher", type: "ElyByAPI" },
  { name: "Mojang", type: "MojangAPI" },
  { name: "LittleSkin", type: "CustomSkinAPI" },
  { name: "BlessingSkin", type: "CustomSkinAPI" },
  { name: "SkinMe", type: "UniSkinAPI" },
  { name: "GlitchlessGames", type: "ElyByAPI" },
  { name: "MinecraftCapes", type: "MinecraftCapesAPI" },
  { name: "Wynntils", type: "WynntilsAPI" },
];

function orderSkinSources(build) {
  const dir = path.join(builds.instanceDir(build), "CustomSkinLoader");
  const file = path.join(dir, "CustomSkinLoader.json");
  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    config = null; // файла нет (мод ещё не запускался) или он битый — создадим свой
  }
  if (!config || typeof config !== "object") config = {};
  const current = Array.isArray(config.loadlist) ? config.loadlist.filter((p) => p && p.name) : [];
  const byName = new Map(current.map((p) => [p.name, p]));
  const ordered = [];
  for (const want of PREFERRED_ORDER) {
    const existing = byName.get(want.name);
    if (existing) {
      ordered.push(existing);
      byName.delete(want.name);
    } else if (!current.length) {
      ordered.push({ ...want }); // первый запуск — мод сам заполнит остальное
    }
  }
  // Свои источники игрока (если добавлял) — в конец, в прежнем порядке.
  for (const p of current) if (byName.has(p.name)) ordered.push(p);

  const before = JSON.stringify(current.map((p) => p.name));
  const after = JSON.stringify(ordered.map((p) => p.name));
  if (before === after && current.length) return false;
  config.loadlist = ordered;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  // Мод мог запомнить скин из старого порядка — сбрасываем его кэш.
  try {
    fs.rmSync(path.join(dir, "caches"), { recursive: true, force: true });
  } catch (err) {
    /* не критично */
  }
  return true;
}

/**
 * Кладёт свой скин игрока туда, откуда его берёт CustomSkinLoader
 * (CustomSkinLoader/LocalSkin/skins/<ник>.png), — он стоит первым, поэтому
 * игрок видит себя со своим скином и в одиночной игре, и на серверах:
 *  - офлайн-профиль — скин, выбранный в лаунчере;
 *  - Ely.by — скин с Ely.by (тот, что загружен в профиль на ely.by);
 *  - Microsoft — ничего не кладём, игра и так берёт лицензионный скин.
 */
async function placeLocalSkin(build, account) {
  if (!account || !account.name) return;
  const dir = path.join(builds.instanceDir(build), "CustomSkinLoader", "LocalSkin", "skins");
  const target = path.join(dir, `${account.name}.png`);
  let png = null;
  if (account.type === "offline") {
    const skin = skins.get(account.id);
    if (skin && skin.custom) png = skins.dataUrlToBuffer(skin.dataUrl);
  } else if (account.type === "ely") {
    try {
      const buf = await fetchBuffer(`https://skinsystem.ely.by/skins/${encodeURIComponent(account.name)}.png`, { timeout: 8000 });
      skins.validatePng(buf);
      png = buf;
    } catch (err) {
      png = null; // нет скина на Ely.by или нет сети — оставим как есть
      if (fs.existsSync(target)) return;
    }
  }
  if (png) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, png);
  } else if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true });
  }
}

async function prepare(build, account, log) {
  try {
    await ensureMod(build, log);
  } catch (err) {
    if (log) log(`Не удалось поставить мод скинов: ${err.message || err}`);
  }
  try {
    await placeLocalSkin(build, account);
  } catch (err) {
    /* не критично */
  }
  if (modLoadersFor(build.loader_type).length && settings.get().skin_mod !== false) {
    try {
      orderSkinSources(build);
    } catch (err) {
      /* не критично */
    }
  }
}

module.exports = { prepare, ensureMod, placeLocalSkin, orderSkinSources };
