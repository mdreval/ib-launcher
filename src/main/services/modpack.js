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
 *  - пока включено «Обновлять модпак», папка mods сборки совпадает с модпаком
 *    на GitHub — иначе сервер может не пустить из-за разницы в модах:
 *      · пропавшие и подменённые (другой размер) файлы модпака возвращаются;
 *      · выключенные моды модпака включаются обратно;
 *      · лишние моды НЕ удаляются, а переносятся в папку «no-modpack»
 *        рядом с mods — игрок ничего не теряет и может вернуть их, выключив
 *        «Обновлять модпак»;
 *      · мод скинов CustomSkinLoader лаунчер ставит сам — его это не касается;
 *    если «Обновлять модпак» выключено, лаунчер в моды не вмешивается;
 *  - модпак проверяется ТОЛЬКО по кнопке «Играть» (и при установке) сборки
 *    IGROBAR — при запуске лаунчера в сеть за модпаком никто не ходит; это один
 *    небольшой запрос к GitHub, архив качается, только если он поменялся или
 *    чего-то не хватает;
 *  - нет интернета — папка всё равно приводится в порядок тем, что есть на
 *    компьютере (лишние моды переносятся, выключенные включаются);
 *  - если модпак поставить не удалось и его файлов не хватает — игра НЕ
 *    запускается (без модов на сервер всё равно не зайти). Если файлы на месте,
 *    а нет только интернета — запускается с текущими модами.
 */

const fs = require("fs");
const path = require("path");

const paths = require("../paths");
const builds = require("./builds");
const cancel = require("../core/cancel");
const { fetchJson, downloadFile, removeFile, moveFile, sha256OfFile } = require("../core/http");
const { readJson, writeJson } = require("../core/jsonFile");

const STATE_FILE = ".igrobar-modpack.json";
const EXTRA_DIR = "no-modpack"; // сюда переносятся лишние моды
const OLD_EXTRA_DIR = "моды-не-из-модпака"; // так папка называлась в тестовых сборках
const SKIN_MOD_RE = /customskinloader/i; // мод скинов ставит сам лаунчер (skinMod.js)
const TMP_PREFIX = ".igrobar-modpack-tmp";
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
        // GitHub сам считает SHA-256 каждого файла релиза — по нему проверяем,
        // что архив скачался без единой ошибки.
        sha256: /^sha256:[0-9a-f]{64}$/i.test(asset.digest || "") ? asset.digest.slice(7).toLowerCase() : null,
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

const isJar = (name) => name.toLowerCase().endsWith(".jar");
const plainName = (name) => (name.endsWith(".disabled") ? name.slice(0, -".disabled".length) : name);

/**
 * Насколько папка сборки совпадает с модпаком:
 *  missing  — файлов модпака нет совсем;
 *  changed  — мод модпака подменён (другой размер, например обновили вручную);
 *  disabled — мод модпака выключен;
 *  extra    — моды, которых нет в модпаке (кроме мода скинов).
 * Конфиги (config/) по размеру не сверяются — их меняет сама игра.
 */
function folderReport(instanceDir, state) {
  const files = state.files || [];
  const sizes = state.sizes || {};
  const packMods = new Set(files.filter((rel) => rel.startsWith("mods/")).map((rel) => path.posix.basename(rel)));
  const changed = files.filter((rel) => {
    if (!rel.startsWith("mods/") || sizes[rel] == null) return false;
    const full = path.join(instanceDir, rel);
    const size = sizeOf(fs.existsSync(full) ? full : `${full}.disabled`);
    return size >= 0 && size !== sizes[rel];
  });
  const disabled = files.filter((rel) => {
    const full = path.join(instanceDir, rel);
    return rel.startsWith("mods/") && !fs.existsSync(full) && fs.existsSync(`${full}.disabled`);
  });
  let extra = [];
  if (packMods.size) {
    try {
      const modsDir = path.join(instanceDir, "mods");
      extra = fs.readdirSync(modsDir).filter((f) => {
        const base = plainName(f);
        if (!isJar(base) || SKIN_MOD_RE.test(base) || packMods.has(base)) return false;
        try {
          return fs.statSync(path.join(modsDir, f)).isFile();
        } catch (err) {
          return false;
        }
      });
    } catch (err) {
      /* папки mods нет */
    }
  }
  return { missing: missingFiles(instanceDir, state), changed, disabled, extra };
}

/** Приводит папку mods к модпаку: включает выключенные моды модпака и
 * переносит лишние моды в «no-modpack». */
function tidyFolder(instanceDir, rep) {
  let enabled = 0;
  let moved = 0;
  for (const rel of rep.disabled) {
    const full = path.join(instanceDir, rel);
    try {
      fs.renameSync(`${full}.disabled`, full);
      enabled += 1;
    } catch (err) {
      /* файл занят — в следующий раз */
    }
  }
  if (rep.extra.length) {
    const modsDir = path.join(instanceDir, "mods");
    const extraDir = path.join(instanceDir, EXTRA_DIR);
    const oldDir = path.join(instanceDir, OLD_EXTRA_DIR);
    if (fs.existsSync(oldDir) && !fs.existsSync(extraDir)) {
      try {
        fs.renameSync(oldDir, extraDir);
      } catch (err) {
        /* занята — останется как есть */
      }
    }
    fs.mkdirSync(extraDir, { recursive: true });
    for (const f of rep.extra) {
      let target = path.join(extraDir, plainName(f));
      if (fs.existsSync(target)) target = path.join(extraDir, `${Date.now()}-${plainName(f)}`);
      try {
        fs.renameSync(path.join(modsDir, f), target);
        moved += 1;
      } catch (err) {
        /* файл занят — в следующий раз */
      }
    }
  }
  return { enabled, moved, extraDir: EXTRA_DIR };
}

/** Без сети: только то, что можно сделать на месте (лишние моды и
 * выключенные моды модпака). Пропавшие файлы так не вернуть. */
function tidyLocal(buildId) {
  const build = builds.get(buildId);
  if (!build || !builds.modpackProfileFor(build) || !builds.modpackEnabled(build)) return { enabled: 0, moved: 0, extraDir: EXTRA_DIR };
  const dir = builds.instanceDir(build);
  const state = loadState(dir);
  if (!(state.files || []).length) return { enabled: 0, moved: 0, extraDir: EXTRA_DIR };
  return tidyFolder(dir, folderReport(dir, state));
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
    extra: state ? folderReport(dir, state).extra.length : 0,
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
  const before = folderReport(instanceDir, state);
  const missing = before.missing;
  const sameAsset = state.asset_id === asset.id && state.size === asset.size && state.updated_at === asset.updated_at;
  const upToDate = sameAsset && (state.files || []).length > 0 && missing.length === 0 && before.changed.length === 0;

  if (upToDate && !force) {
    const tidy = tidyFolder(instanceDir, before);
    writeJson(stateFile(instanceDir), { ...state, checked_at: Date.now() });
    report(100, "Модпак актуален");
    return { skipped: false, updated: false, release: asset.release, ...tidy };
  }
  const reason = !sameAsset ? "new" : missing.length ? "missing" : before.changed.length ? "changed" : "force";

  const download = (target) =>
    downloadFile(asset.url, target, {
      expectedSize: asset.size,
      sha256: asset.sha256,
      onProgress: (done, total) => report(total ? Math.round((done / total) * 88) : 0, `Скачивание модпака… ${Math.round(done / 1048576)} / ${Math.round(total / 1048576)} МБ`),
    });

  // Распаковываем во временную папку: моды в сборке меняются только когда
  // весь архив распаковался без ошибок (никаких «половинок» модпака).
  // Каждая попытка распаковывает в СВОЮ новую папку: если антивирус ещё
  // держит файлы прошлой попытки, они не мешают (раньше было «EPERM … open»).
  cleanupTmpDirs(instanceDir);
  let tmpDir = null;
  const extract = (zip) => {
    report(90, "Распаковка модпака…");
    if (tmpDir) removeDirQuiet(tmpDir);
    tmpDir = path.join(instanceDir, `${TMP_PREFIX}-${Date.now()}`);
    return extractModpack(zip, tmpDir, (p) => report(90 + Math.round(p * 8), "Распаковка модпака…"));
  };
  // Архив из кэша используем, только если он целый (размер и SHA-256).
  const cachedOk = async (file) => {
    if (sizeOf(file) !== asset.size) return false;
    if (!asset.sha256) return true;
    report(89, "Проверка архива модпака…");
    return (await sha256OfFile(file).catch(() => "")) === asset.sha256;
  };

  let zipPath = path.join(paths.CACHE_DIR, `modpack-${asset.id}.zip`);
  let extracted;
  try {
    try {
      if (!(await cachedOk(zipPath))) {
        try {
          fs.rmSync(zipPath, { force: true });
        } catch (err) {
          zipPath = path.join(paths.CACHE_DIR, `modpack-${asset.id}-${Date.now()}.zip`);
        }
        await download(zipPath);
      }
      extracted = await extract(zipPath);
    } catch (firstErr) {
      if (firstErr && firstErr.cancelled) throw firstErr; // пользователь отменил установку
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

    // Последний момент, когда установку можно отменить без «половинок»:
    // дальше моды переносятся в сборку.
    cancel.throwIfCancelled();
    report(98, "Установка модов…");
    const newFiles = [];
    const sizes = {};
    for (const rel of extracted) {
      const target = path.join(instanceDir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // мод модпака всегда включён: выключенная копия убирается
      await removeFile(`${target}.disabled`);
      await removeFile(target);
      await moveFile(path.join(tmpDir, rel), target);
      newFiles.push(rel);
      if (rel.startsWith("mods/")) sizes[rel] = sizeOf(target);
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

    const newState = {
      asset_id: asset.id,
      size: asset.size,
      updated_at: asset.updated_at,
      release: asset.release,
      synced_at: Date.now(),
      checked_at: Date.now(),
      files: newFiles,
      sizes,
    };
    writeJson(stateFile(instanceDir), newState);
    const tidy = tidyFolder(instanceDir, folderReport(instanceDir, newState));

    // Старые архивы модпака больше не нужны. Занятые — удалятся в следующий раз.
    for (const f of fs.readdirSync(paths.CACHE_DIR)) {
      if (!/^modpack-[\d-]+\.zip(?:\.part)?$/.test(f) || f === path.basename(zipPath)) continue;
      try {
        fs.rmSync(path.join(paths.CACHE_DIR, f), { force: true });
      } catch (err) {
        /* занят */
      }
    }

    report(100, reason === "missing" || reason === "changed" ? "Моды модпака восстановлены" : "Модпак обновлён");
    return { skipped: false, updated: true, reason, restored: missing.length + before.changed.length, release: asset.release, added: newFiles.length, removed, ...tidy };
  } finally {
    if (tmpDir) removeDirQuiet(tmpDir);
  }
}

/** Убирает временные папки прошлых распаковок (что не удаётся — позже). */
function cleanupTmpDirs(instanceDir) {
  try {
    for (const name of fs.readdirSync(instanceDir)) {
      if (name.startsWith(TMP_PREFIX)) removeDirQuiet(path.join(instanceDir, name));
    }
  } catch (err) {
    /* папки нет */
  }
}

module.exports = { status, sync, tidyLocal, trackedFiles, isComplete, EXTRA_DIR, SKIN_MOD_RE };
