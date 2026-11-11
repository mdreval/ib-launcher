/**
 * Модпак сервера IGROBAR — файл modpack.zip в релизах GitHub (mdreval/ib-launcher).
 * Берётся самый свежий релиз, в котором этот файл есть.
 *
 * Работает только для сборки той версии, что указана в data/server_profiles.json
 * (builds.isModpackCapable), и только если включена галочка «Обновлять модпак».
 *
 * Правила:
 *  - при каждом запуске проверяется, что на месте ВСЕ файлы модпака. Если игрок
 *    случайно удалил хоть один мод — модпак ставится заново (из кэша, без
 *    повторного скачивания, если архив не менялся);
 *  - если на GitHub вышел новый modpack.zip — он скачивается и ставится;
 *  - моды, которые игрок добавил сам, не трогаются; выключенный мод модпака
 *    остаётся выключенным;
 *  - если модпак поставить не удалось и его файлов не хватает — игра НЕ
 *    запускается (без модов на сервер всё равно не зайти). Если файлы на месте,
 *    а нет только интернета — запускается с текущими модами.
 */

const fs = require("fs");
const path = require("path");

const paths = require("../paths");
const builds = require("./builds");
const { fetchJson, downloadFile, removeFile, moveFile } = require("../core/http");
const { readJson, writeJson } = require("../core/jsonFile");

const STATE_FILE = ".igrobar-modpack.json";
const TMP_DIR_NAME = ".igrobar-modpack-tmp";
const STALL_MS = 120000; // распаковка «встала» — столько ждём без прогресса

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch (err) {
    return -1;
  }
}

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

/** Какие файлы модпака пропали (с учётом выключенных .disabled). */
function missingFiles(instanceDir, state) {
  return (state.files || []).filter((rel) => {
    const full = path.join(instanceDir, rel);
    return !fs.existsSync(full) && !fs.existsSync(`${full}.disabled`);
  });
}

/** Модпак установлен полностью: есть запись об установке и все файлы на месте. */
function isComplete(buildOrId) {
  const build = typeof buildOrId === "string" ? builds.get(buildOrId) : buildOrId;
  if (!build) return false;
  const dir = builds.instanceDir(build);
  const state = loadState(dir);
  return (state.files || []).length > 0 && missingFiles(dir, state).length === 0;
}

function status(buildId) {
  const build = builds.get(buildId);
  if (!build) return { capable: false, enabled: false };
  const capable = builds.isModpackCapable(build);
  const dir = capable ? builds.instanceDir(build) : null;
  const state = capable ? loadState(dir) : null;
  return {
    capable,
    enabled: builds.modpackEnabled(build),
    installed_release: state ? state.release || null : null,
    synced_at: state ? state.checked_at || state.synced_at || null : null,
    files: state ? (state.files || []).length : 0,
    missing: state ? missingFiles(dir, state).length : 0,
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
  if (!rel || rel.split("/").some((p) => p === ".." || p === "")) return null;
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

function removeDirQuiet(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (err) {
    /* антивирус держит файл — уберём в следующий раз */
  }
}

/**
 * Распаковка через yauzl с проверкой размера и CRC32 каждого файла.
 *
 * Важно: промис ВСЕГДА завершается — успехом или ошибкой. Раньше при ошибке
 * внутри обработчиков (например, Windows не давал удалить временную папку)
 * промис зависал навсегда, и интерфейс показывал «reply was never sent».
 * Теперь любые исключения ловятся, а если распаковка 2 минуты не двигается —
 * она прерывается с понятной ошибкой.
 */
function extractModpack(zipPath, tmpDir, onProgress) {
  const yauzl = require("yauzl");
  removeDirQuiet(tmpDir);
  fs.mkdirSync(tmpDir, { recursive: true });

  return new Promise((resolve, reject) => {
    let zip = null;
    let settled = false;
    let stallTimer = null;
    let currentEntry = "";

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      try {
        if (zip && zip.isOpen) zip.close();
      } catch (e) {
        /* уже закрыт */
      }
      if (err) reject(new Error(`Не удалось распаковать модпак${currentEntry ? ` (${currentEntry})` : ""}: ${err.message || err}`));
      else resolve(value);
    };
    const alive = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => finish(new Error("распаковка остановилась — возможно, файл держит антивирус")), STALL_MS);
    };
    const guard =
      (fn) =>
      (...args) => {
        try {
          fn(...args);
        } catch (e) {
          finish(e);
        }
      };

    alive();
    yauzl.open(
      zipPath,
      { lazyEntries: true, autoClose: true },
      guard((err, opened) => {
        if (err) return finish(new Error(`архив повреждён: ${err.message}`));
        zip = opened;
        const files = [];
        let seen = 0;
        zip.on("error", (e) => finish(e));
        zip.on("end", () => finish(null, files));
        zip.on(
          "entry",
          guard((entry) => {
            alive();
            seen += 1;
            if (onProgress && zip.entryCount) onProgress(seen / zip.entryCount);
            const rel = targetFor(entry.fileName);
            if (!rel) return zip.readEntry();
            currentEntry = rel;
            zip.openReadStream(
              entry,
              guard((streamErr, stream) => {
                if (streamErr) return finish(streamErr);
                const out = path.join(tmpDir, rel);
                const parent = path.dirname(out);
                // На месте папки может оказаться файл с тем же именем — убираем.
                if (fs.existsSync(parent) && !fs.statSync(parent).isDirectory()) fs.rmSync(parent, { force: true });
                fs.mkdirSync(parent, { recursive: true });
                const writer = fs.createWriteStream(out);
                let crc = 0;
                let written = 0;
                stream.on("data", (chunk) => {
                  crc = crc32Update(crc, chunk);
                  written += chunk.length;
                  alive();
                });
                stream.on("error", (e) => finish(e));
                writer.on("error", (e) => finish(e));
                writer.on(
                  "finish",
                  guard(() => {
                    if (written !== entry.uncompressedSize) return finish(new Error("файл распакован не полностью"));
                    if (crc >>> 0 !== entry.crc32 >>> 0) return finish(new Error("контрольная сумма не совпала"));
                    if (!files.includes(rel)) files.push(rel);
                    currentEntry = "";
                    zip.readEntry();
                  })
                );
                stream.pipe(writer);
              })
            );
          })
        );
        zip.readEntry();
      })
    );
  });
}

/**
 * Проверяет и при необходимости ставит/обновляет модпак.
 * @param {boolean} force — поставить заново, даже если всё актуально
 */
async function sync(buildId, { force = false, onProgress } = {}) {
  const build = builds.get(buildId);
  const profile = builds.modpackProfileFor(build);
  if (!build || !profile) return { skipped: true, reason: "not-capable" };
  if (!builds.modpackEnabled(build) && !force) return { skipped: true, reason: "disabled" };

  const instanceDir = builds.instanceDir(build);
  fs.mkdirSync(path.join(instanceDir, "mods"), { recursive: true });

  const report = (percent, text) => onProgress && onProgress(percent, text);
  report(0, "Проверка модпака на GitHub…");

  const asset = await findAsset(profile.modpack);
  const state = loadState(instanceDir);
  const missing = missingFiles(instanceDir, state);
  const sameAsset = state.asset_id === asset.id && state.size === asset.size && state.updated_at === asset.updated_at;
  const upToDate = sameAsset && (state.files || []).length > 0 && missing.length === 0;

  if (upToDate && !force) {
    writeJson(stateFile(instanceDir), { ...state, checked_at: Date.now() });
    report(100, "Модпак актуален");
    return { skipped: false, updated: false, release: asset.release };
  }
  const reason = !sameAsset ? "new" : missing.length ? "missing" : "force";

  const download = (target) =>
    downloadFile(asset.url, target, {
      expectedSize: asset.size,
      onProgress: (done, total) => report(total ? Math.round((done / total) * 88) : 0, `Скачивание модпака… ${Math.round(done / 1048576)} / ${Math.round(total / 1048576)} МБ`),
    });

  // Распаковываем во временную папку: моды в сборке меняются только когда
  // весь архив распаковался без ошибок (никаких «половинок» модпака).
  const tmpDir = path.join(instanceDir, TMP_DIR_NAME);
  const extract = (zip) => {
    report(90, "Распаковка модпака…");
    return extractModpack(zip, tmpDir, (p) => report(90 + Math.round(p * 8), "Распаковка модпака…"));
  };

  let zipPath = path.join(paths.CACHE_DIR, `modpack-${asset.id}.zip`);
  let extracted;
  try {
    try {
      if (sizeOf(zipPath) !== asset.size) await download(zipPath);
      extracted = await extract(zipPath);
    } catch (firstErr) {
      // Архив мог повредиться, а старый файл — быть занят антивирусом,
      // поэтому второй раз качаем под НОВЫМ именем, не трогая старый.
      console.warn("[modpack] первая попытка не удалась:", firstErr);
      zipPath = path.join(paths.CACHE_DIR, `modpack-${asset.id}-${Date.now()}.zip`);
      try {
        await download(zipPath);
        extracted = await extract(zipPath);
      } catch (secondErr) {
        secondErr.message = `${secondErr.message} (первая попытка: ${firstErr.message})`;
        throw secondErr;
      }
    }
    if (!extracted.length) throw new Error("в modpack.zip нет ни одного мода (.jar)");

    report(98, "Установка модов…");
    const newFiles = [];
    for (const rel of extracted) {
      const target = path.join(instanceDir, rel);
      const disabledCopy = `${target}.disabled`;
      const keepDisabled = (state.files || []).includes(rel) && fs.existsSync(disabledCopy) && !fs.existsSync(target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const finalPath = keepDisabled ? disabledCopy : target;
      await removeFile(finalPath);
      await moveFile(path.join(tmpDir, rel), finalPath);
      newFiles.push(rel);
    }

    let removed = 0;
    for (const rel of state.files || []) {
      if (newFiles.includes(rel)) continue;
      for (const candidate of [path.join(instanceDir, rel), path.join(instanceDir, `${rel}.disabled`)]) {
        if (fs.existsSync(candidate)) {
          try {
            fs.rmSync(candidate, { force: true });
            removed += 1;
          } catch (err) {
            /* занят — удалится в следующий раз */
          }
        }
      }
    }

    writeJson(stateFile(instanceDir), {
      asset_id: asset.id,
      size: asset.size,
      updated_at: asset.updated_at,
      release: asset.release,
      synced_at: Date.now(),
      checked_at: Date.now(),
      files: newFiles,
    });

    // Старые архивы модпака больше не нужны. Занятые — удалятся в следующий раз.
    for (const f of fs.readdirSync(paths.CACHE_DIR)) {
      if (!/^modpack-[\d-]+\.zip(?:\.part)?$/.test(f) || f === path.basename(zipPath)) continue;
      try {
        fs.rmSync(path.join(paths.CACHE_DIR, f), { force: true });
      } catch (err) {
        /* занят */
      }
    }

    report(100, reason === "missing" ? "Пропавшие моды восстановлены" : "Модпак обновлён");
    return { skipped: false, updated: true, reason, restored: missing.length, release: asset.release, added: newFiles.length, removed };
  } finally {
    removeDirQuiet(tmpDir);
  }
}

module.exports = { status, sync, trackedFiles, isComplete };
