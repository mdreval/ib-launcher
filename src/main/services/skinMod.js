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
const { fetchJson, downloadFile } = require("../core/http");
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

/** Кладёт скин офлайн-профиля туда, откуда его берёт CustomSkinLoader. */
function placeLocalSkin(build, account) {
  if (!account || !account.name) return;
  const dir = path.join(builds.instanceDir(build), "CustomSkinLoader", "LocalSkin", "skins");
  const target = path.join(dir, `${account.name}.png`);
  const skin = account.type === "offline" ? skins.get(account.id) : null;
  if (skin && skin.custom) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, skins.dataUrlToBuffer(skin.dataUrl));
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
    placeLocalSkin(build, account);
  } catch (err) {
    /* не критично */
  }
}

module.exports = { prepare, ensureMod, placeLocalSkin };
