/**
 * Модпак сервера IGROBAR — тот же источник, что и в старом лаунчере:
 * файл modpack.zip в релизах GitHub (mdreval/ib-launcher).
 *
 * Работает ТОЛЬКО для сборок 1.21.1 + NeoForge 21.1.265 (builds.isModpackCapable)
 * и только если включена галочка «Обновлять модпак». Для любых других
 * версий модпак не скачивается и даже не проверяется.
 *
 * Отличия от старой версии (там при каждом обновлении удалялись ВСЕ .jar):
 *  - удаляются только моды, которые раньше поставил сам модпак;
 *  - моды, добавленные игроком вручную, не трогаются;
 *  - если игрок выключил мод модпака, он остаётся выключенным.
 */

const fs = require("fs");
const path = require("path");

const paths = require("../paths");
const builds = require("./builds");
const { fetchJson, downloadFile, removeFile, moveFile } = require("../core/http");

/** Размер файла или -1, если файла нет или он занят (stat на «удаляемом»
 * файле в Windows тоже даёт EPERM). */
function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch (err) {
    return -1;
  }
}
const { readJson, writeJson } = require("../core/jsonFile");

const STATE_FILE = ".igrobar-modpack.json";

function stateFile(instanceDir) {
  return path.join(instanceDir, STATE_FILE);
}

function loadState(instanceDir) {
  return readJson(stateFile(instanceDir), { asset_id: null, size: null, updated_at: null, files: [] });
}

/** Ищет самый свежий релиз, в котором есть modpack.zip (релизы самого
 * лаунчера могут идти без модпака — их пропускаем). */
async function findAsset(source) {
  const releases = await fetchJson(`https://api.github.com/repos/${source.repo}/releases?per_page=20`);
  for (const release of releases) {
    if (release.draft) continue;
    const asset = (release.assets || []).find((a) => a.name === source.asset);
    if (asset) {
      return {
        id: asset.id,
        size: asset.size,
        updated_at: asset.updated_at,
        url: asset.browser_download_url,
        release: release.tag_name,
      };
    }
  }
  throw new Error(`В релизах ${source.repo} не найден ${source.asset}`);
}

function trackedFilesPresent(instanceDir, state) {
  return (state.files || []).every((rel) => {
    const full = path.join(instanceDir, rel);
    return fs.existsSync(full) || fs.existsSync(`${full}.disabled`);
  });
}

function status(buildId) {
  const build = builds.get(buildId);
  if (!build) return { capable: false, enabled: false };
  const capable = builds.isModpackCapable(build);
  const state = capable ? loadState(builds.instanceDir(build)) : null;
  return {
    capable,
    enabled: builds.modpackEnabled(build),
    installed_release: state ? state.release || null : null,
    synced_at: state ? state.synced_at || null : null,
    files: state ? (state.files || []).length : 0,
  };
}

/** Какие файлы в папке mods поставлены модпаком (для пометки в списке модов). */
function trackedFiles(build) {
  if (!builds.isModpackCapable(build)) return new Set();
  const state = loadState(builds.instanceDir(build));
  return new Set((state.files || []).map((rel) => path.basename(rel)));
}

/** Куда кладётся файл из архива: все .jar → mods/, папка config/ → config/. */
function targetFor(entryName) {
  const name = entryName.replace(/\\/g, "/");
  if (name.endsWith("/")) return null;
  let rel = null;
  if (name.toLowerCase().endsWith(".jar")) rel = `mods/${path.posix.basename(name)}`;
  else if (/^(?:[^/]+\/)?config\//.test(name)) rel = name.slice(name.indexOf("config/"));
  if (!rel || rel.split("/").includes("..")) return null;
  return rel;
}

// CRC32 — та же контрольная сумма, что записана в zip для каждого файла.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32Update(crc, buf) {
  let c = crc ^ -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/** Распаковка через yauzl с проверкой размера и CRC32 каждого файла. */
function extractModpack(zipPath, tmpDir, onProgress) {
  const yauzl = require("yauzl");
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  fs.mkdirSync(tmpDir, { recursive: true });
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) return reject(new Error(`Архив модпака повреждён: ${err.message}`));
      const files = [];
      let seen = 0;
      const fail = (e) => {
        try {
          zip.close();
        } catch (closeErr) {
          /* уже закрыт */
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
        reject(new Error(`Архив модпака повреждён: ${e.message}`));
      };
      zip.on("error", fail);
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry) => {
        seen += 1;
        if (onProgress && zip.entryCount) onProgress(seen / zip.entryCount);
        const rel = targetFor(entry.fileName);
        if (!rel) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return fail(streamErr);
          const out = path.join(tmpDir, rel);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          const writer = fs.createWriteStream(out);
          let crc = 0;
          stream.on("data", (chunk) => {
            crc = crc32Update(crc, chunk);
          });
          stream.on("error", fail);
          writer.on("error", fail);
          writer.on("finish", () => {
            if (fs.statSync(out).size !== entry.uncompressedSize) return fail(new Error(`${rel} распакован не полностью`));
            if (crc >>> 0 !== entry.crc32 >>> 0) return fail(new Error(`${rel}: контрольная сумма не совпала`));
            if (!files.includes(rel)) files.push(rel);
            zip.readEntry();
          });
          stream.pipe(writer);
        });
      });
      zip.readEntry();
    });
  });
}

/**
 * Проверяет и при необходимости обновляет модпак.
 * @param {boolean} force — перекачать даже если версия не менялась
 */
async function sync(buildId, { force = false, onProgress } = {}) {
  const build = builds.get(buildId);
  const profile = builds.modpackProfileFor(build);
  if (!build || !profile) return { skipped: true, reason: "not-capable" };
  if (!builds.modpackEnabled(build) && !force) return { skipped: true, reason: "disabled" };

  const instanceDir = builds.instanceDir(build);
  const modsDir = path.join(instanceDir, "mods");
  fs.mkdirSync(modsDir, { recursive: true });

  const report = (percent, text) => onProgress && onProgress(percent, text);
  report(0, "Проверка модпака на GitHub…");

  const asset = await findAsset(profile.modpack);
  const state = loadState(instanceDir);
  const upToDate =
    state.asset_id === asset.id &&
    state.size === asset.size &&
    state.updated_at === asset.updated_at &&
    trackedFilesPresent(instanceDir, state);
  if (upToDate && !force) {
    report(100, "Модпак актуален");
    return { skipped: false, updated: false, release: asset.release };
  }

  const zipPath = path.join(paths.CACHE_DIR, `modpack-${asset.id}.zip`);
  const download = () =>
    downloadFile(asset.url, zipPath, {
      expectedSize: asset.size,
      onProgress: (done, total) => report(total ? Math.round((done / total) * 88) : 0, `Скачивание модпака… ${Math.round(done / 1048576)} / ${Math.round(total / 1048576)} МБ`),
    });
  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size !== asset.size) await download();

  // Распаковываем во временную папку: моды в сборке меняются только когда
  // весь архив распаковался без ошибок (никаких «половинок» модпака).
  report(90, "Распаковка модпака…");
  const tmpDir = path.join(instanceDir, ".igrobar-modpack-tmp");
  let extracted;
  try {
    extracted = await extractModpack(zipPath, tmpDir, (p) => report(90 + Math.round(p * 8), "Распаковка модпака…"));
  } catch (err) {
    // Архив мог повредиться при прошлой загрузке — скачиваем заново один раз.
    fs.rmSync(zipPath, { force: true });
    await download();
    extracted = await extractModpack(zipPath, tmpDir, (p) => report(90 + Math.round(p * 8), "Распаковка модпака…"));
  }

  report(98, "Установка модов…");
  const newFiles = [];
  for (const rel of extracted) {
    const target = path.join(instanceDir, rel);
    const disabledCopy = `${target}.disabled`;
    const keepDisabled = (state.files || []).includes(rel) && fs.existsSync(disabledCopy) && !fs.existsSync(target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const finalPath = keepDisabled ? disabledCopy : target;
    fs.rmSync(finalPath, { force: true });
    fs.renameSync(path.join(tmpDir, rel), finalPath);
    newFiles.push(rel);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  let removed = 0;
  for (const rel of state.files || []) {
    if (newFiles.includes(rel)) continue;
    for (const candidate of [path.join(instanceDir, rel), path.join(instanceDir, `${rel}.disabled`)]) {
      if (fs.existsSync(candidate)) {
        fs.rmSync(candidate, { force: true });
        removed += 1;
      }
    }
  }

  writeJson(stateFile(instanceDir), {
    asset_id: asset.id,
    size: asset.size,
    updated_at: asset.updated_at,
    release: asset.release,
    synced_at: Date.now(),
    files: newFiles,
  });

  // Старые архивы модпака больше не нужны.
  for (const f of fs.readdirSync(paths.CACHE_DIR)) {
    if (/^modpack-\d+\.zip$/.test(f) && f !== path.basename(zipPath)) fs.rmSync(path.join(paths.CACHE_DIR, f), { force: true });
  }

  report(100, "Модпак обновлён");
  return { skipped: false, updated: true, release: asset.release, added: newFiles.length, removed };
}

module.exports = { status, sync, trackedFiles };
