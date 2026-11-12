/**
 * Миры, скриншоты, импорт и экспорт сборок.
 *
 *  Миры        — instances\<сборка>\saves: список с иконкой, названием (из
 *                level.dat), размером; резервные копии (zip в
 *                instances\<сборка>\backups), восстановление, импорт мира из zip,
 *                удаление в корзину.
 *  Скриншоты   — instances\<сборка>\screenshots: галерея, копировать, удалить.
 *  Экспорт     — сборка в один файл .ibpack (zip): настройки сборки + моды,
 *                конфиги, ресурспаки, шейдеры, options.txt (по желанию — миры).
 *  Импорт      — .ibpack (свой формат) и .mrpack (Modrinth): создаётся новая
 *                сборка, моды скачиваются, конфиги раскладываются.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pathToFileURL } = require("url");
const { shell, clipboard, nativeImage } = require("electron");
const AdmZip = require("adm-zip");

const builds = require("./builds");
const nbt = require("../core/nbt");
const { downloadFile } = require("../core/http");

function requireBuild(buildId) {
  const build = builds.get(buildId);
  if (!build) throw new Error("Сборка не найдена");
  return build;
}

function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        try {
          total += fs.statSync(full).size;
        } catch (err) {
          /* пропускаем */
        }
      }
    }
  };
  walk(dir);
  return total;
}

function safeName(name) {
  return String(name || "world").replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").replace(/\s+$/g, "").slice(0, 80) || "world";
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

/** Название мира и режим из level.dat (сжат gzip). */
function readLevel(worldDir) {
  try {
    const raw = zlib.gunzipSync(fs.readFileSync(path.join(worldDir, "level.dat")));
    const root = nbt.parse(raw);
    const data = root.Data ? root.Data.value : {};
    const val = (k) => (data[k] ? data[k].value : undefined);
    const modes = ["Выживание", "Творческий", "Приключение", "Наблюдатель"];
    const hardcore = val("hardcore") === 1;
    return {
      name: val("LevelName") || path.basename(worldDir),
      mode: hardcore ? "Хардкор" : modes[val("GameType")] || "",
      lastPlayed: val("LastPlayed") ? Number(val("LastPlayed")) : null,
      version: data.Version && data.Version.value.Name ? data.Version.value.Name.value : null,
    };
  } catch (err) {
    return { name: path.basename(worldDir), mode: "", lastPlayed: null, version: null };
  }
}

// ---------- миры ----------

function savesDir(build) {
  return path.join(builds.instanceDir(build), "saves");
}

function backupsDir(build) {
  return path.join(builds.instanceDir(build), "backups");
}

function listWorlds(buildId) {
  const build = requireBuild(buildId);
  const dir = savesDir(build);
  const worlds = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    entries = [];
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (!fs.existsSync(path.join(full, "level.dat"))) continue;
    const level = readLevel(full);
    const icon = path.join(full, "icon.png");
    let mtime = null;
    try {
      mtime = fs.statSync(path.join(full, "level.dat")).mtimeMs;
    } catch (err) {
      mtime = null;
    }
    worlds.push({
      folder: e.name,
      name: level.name,
      mode: level.mode,
      version: level.version,
      lastPlayed: level.lastPlayed || mtime,
      size: dirSize(full),
      icon: fs.existsSync(icon) ? `${pathToFileURL(icon).href}?t=${Math.round(mtime || 0)}` : null,
    });
  }
  worlds.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  return { worlds, backups: listBackups(build) };
}

function listBackups(build) {
  const dir = backupsDir(build);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".zip"));
  } catch (err) {
    files = [];
  }
  return files
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { file: f, size: st.size, created: st.mtimeMs };
    })
    .sort((a, b) => b.created - a.created);
}

function worldPath(build, folder) {
  const dir = savesDir(build);
  const full = path.join(dir, String(folder));
  if (path.dirname(full) !== dir || !fs.existsSync(full)) throw new Error("Мир не найден");
  return full;
}

/** Резервная копия мира → backups\<мир>_<дата>.zip. */
function backupWorld(buildId, folder) {
  const build = requireBuild(buildId);
  const full = worldPath(build, folder);
  fs.mkdirSync(backupsDir(build), { recursive: true });
  const zip = new AdmZip();
  zip.addLocalFolder(full, path.basename(full));
  const file = `${safeName(folder)}_${stamp()}.zip`;
  zip.writeZip(path.join(backupsDir(build), file));
  return { file };
}

/** Восстановить мир из копии (если мир с таким именем есть — рядом, под новым именем). */
function restoreBackup(buildId, file) {
  const build = requireBuild(buildId);
  const zipPath = path.join(backupsDir(build), String(file));
  if (path.dirname(zipPath) !== backupsDir(build) || !fs.existsSync(zipPath)) throw new Error("Копия не найдена");
  return extractWorldZip(build, zipPath);
}

/** Распаковать zip с миром в saves (ищется папка с level.dat). */
function extractWorldZip(build, zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const levelEntry = entries.find((e) => /(^|\/)level\.dat$/.test(e.entryName.replace(/\\/g, "/")));
  if (!levelEntry) throw new Error("В архиве нет мира (не найден level.dat)");
  const prefix = levelEntry.entryName.replace(/\\/g, "/").replace(/level\.dat$/, "");
  const baseName = safeName(prefix.replace(/\/$/, "").split("/").pop() || path.basename(zipPath, ".zip"));
  const dir = savesDir(build);
  fs.mkdirSync(dir, { recursive: true });
  let target = baseName;
  let n = 2;
  while (fs.existsSync(path.join(dir, target))) target = `${baseName} (${n++})`;
  const out = path.join(dir, target);
  for (const e of entries) {
    const name = e.entryName.replace(/\\/g, "/");
    if (!name.startsWith(prefix) || e.isDirectory) continue;
    const rel = name.slice(prefix.length);
    if (!rel || rel.split("/").includes("..")) continue;
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, e.getData());
  }
  return { folder: target };
}

function importWorld(buildId, zipPath) {
  return extractWorldZip(requireBuild(buildId), zipPath);
}

async function deleteWorld(buildId, folder) {
  const build = requireBuild(buildId);
  await shell.trashItem(worldPath(build, folder));
  return true;
}

async function deleteBackup(buildId, file) {
  const build = requireBuild(buildId);
  const full = path.join(backupsDir(build), String(file));
  if (path.dirname(full) !== backupsDir(build)) throw new Error("Копия не найдена");
  await shell.trashItem(full);
  return true;
}

function openWorld(buildId, folder) {
  const build = requireBuild(buildId);
  if (folder) return shell.openPath(worldPath(build, folder));
  fs.mkdirSync(savesDir(build), { recursive: true });
  return shell.openPath(savesDir(build));
}

function openBackups(buildId) {
  const build = requireBuild(buildId);
  fs.mkdirSync(backupsDir(build), { recursive: true });
  return shell.openPath(backupsDir(build));
}

// ---------- скриншоты ----------

function shotsDir(build) {
  return path.join(builds.instanceDir(build), "screenshots");
}

function listScreenshots(buildId) {
  const build = requireBuild(buildId);
  const dir = shotsDir(build);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f));
  } catch (err) {
    files = [];
  }
  return files
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { file: f, size: st.size, created: st.mtimeMs, url: `${pathToFileURL(full).href}?t=${Math.round(st.mtimeMs)}` };
    })
    .sort((a, b) => b.created - a.created);
}

function shotPath(build, file) {
  const full = path.join(shotsDir(build), String(file));
  if (path.dirname(full) !== shotsDir(build) || !fs.existsSync(full)) throw new Error("Скриншот не найден");
  return full;
}

function copyScreenshot(buildId, file) {
  const img = nativeImage.createFromPath(shotPath(requireBuild(buildId), file));
  if (img.isEmpty()) throw new Error("Не удалось прочитать картинку");
  clipboard.writeImage(img);
  return true;
}

async function deleteScreenshot(buildId, file) {
  await shell.trashItem(shotPath(requireBuild(buildId), file));
  return true;
}

function openScreenshot(buildId, file) {
  const build = requireBuild(buildId);
  if (file) return shell.openPath(shotPath(build, file));
  fs.mkdirSync(shotsDir(build), { recursive: true });
  return shell.openPath(shotsDir(build));
}

function showScreenshot(buildId, file) {
  shell.showItemInFolder(shotPath(requireBuild(buildId), file));
  return true;
}

// ---------- экспорт / импорт сборок ----------

const EXPORT_DIRS = ["mods", "config", "resourcepacks", "shaderpacks", "defaultconfigs", "kubejs"];
const EXPORT_FILES = ["options.txt", "servers.dat"];

/** Экспорт сборки в .ibpack. withWorlds — добавить папку saves. */
function exportBuild(buildId, targetFile, { withWorlds = false } = {}) {
  const build = requireBuild(buildId);
  const dir = builds.instanceDir(build);
  const zip = new AdmZip();
  const meta = {
    format: "ibpack",
    format_version: 1,
    name: build.name,
    mc_version: build.mc_version,
    loader_type: build.loader_type,
    loader_version: build.loader_version || null,
    ram_mb: build.ram_mb || null,
    jvm_args: build.jvm_args || "",
    exported_at: new Date().toISOString(),
  };
  zip.addFile("ibpack.json", Buffer.from(JSON.stringify(meta, null, 2)));
  for (const d of [...EXPORT_DIRS, ...(withWorlds ? ["saves"] : [])]) {
    const full = path.join(dir, d);
    if (fs.existsSync(full)) zip.addLocalFolder(full, `files/${d}`);
  }
  for (const f of EXPORT_FILES) {
    const full = path.join(dir, f);
    if (fs.existsSync(full)) zip.addLocalFile(full, "files");
  }
  zip.writeZip(targetFile);
  return { file: targetFile, size: fs.statSync(targetFile).size };
}

function extractTo(zip, prefix, destDir) {
  let count = 0;
  for (const e of zip.getEntries()) {
    const name = e.entryName.replace(/\\/g, "/");
    if (e.isDirectory || !name.startsWith(prefix)) continue;
    const rel = name.slice(prefix.length);
    if (!rel || rel.split("/").includes("..")) continue;
    const dest = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, e.getData());
    count += 1;
  }
  return count;
}

/** Загрузчик и его версия из dependencies .mrpack. */
function mrpackLoader(deps) {
  if (deps.neoforge) return { loader_type: "neoforge", loader_version: deps.neoforge };
  if (deps.forge) return { loader_type: "forge", loader_version: deps.forge };
  if (deps["fabric-loader"]) return { loader_type: "fabric", loader_version: deps["fabric-loader"] };
  if (deps["quilt-loader"]) return { loader_type: "quilt", loader_version: deps["quilt-loader"] };
  return { loader_type: "vanilla", loader_version: null };
}

/**
 * Импорт сборки из .ibpack или .mrpack. onProgress(percent, text).
 * Возвращает созданную сборку.
 */
async function importBuild(file, { onProgress } = {}) {
  const report = (p, t) => onProgress && onProgress(p, t);
  const zip = new AdmZip(file);
  const ib = zip.getEntry("ibpack.json");
  const mr = zip.getEntry("modrinth.index.json");

  if (ib) {
    const meta = JSON.parse(ib.getData().toString("utf8"));
    const build = builds.create({ name: meta.name, mc_version: meta.mc_version, loader_type: meta.loader_type, loader_version: meta.loader_version });
    const patch = {};
    if (meta.ram_mb) patch.ram_mb = meta.ram_mb;
    if (meta.jvm_args) patch.jvm_args = meta.jvm_args;
    if (Object.keys(patch).length) builds.update(build.id, patch);
    report(50, "Распаковка файлов сборки…");
    const count = extractTo(zip, "files/", builds.instanceDir(builds.get(build.id)));
    report(100, "Готово");
    return { build: builds.get(build.id), files: count, format: "ibpack" };
  }

  if (mr) {
    const index = JSON.parse(mr.getData().toString("utf8"));
    const deps = index.dependencies || {};
    if (!deps.minecraft) throw new Error("В .mrpack не указана версия Minecraft");
    const loader = mrpackLoader(deps);
    const build = builds.create({ name: index.name || path.basename(file, ".mrpack"), mc_version: deps.minecraft, ...loader });
    const dir = builds.instanceDir(builds.get(build.id));
    const files = (index.files || []).filter((f) => !f.env || f.env.client !== "unsupported");
    let done = 0;
    for (const f of files) {
      const rel = String(f.path || "").replace(/\\/g, "/");
      if (!rel || rel.split("/").includes("..") || !Array.isArray(f.downloads) || !f.downloads.length) continue;
      report(Math.round((done / Math.max(1, files.length)) * 85), `Скачивание ${path.basename(rel)} (${done + 1}/${files.length})…`);
      await downloadFile(f.downloads[0], path.join(dir, rel), { sha1: f.hashes && f.hashes.sha1, expectedSize: f.fileSize });
      done += 1;
    }
    report(90, "Распаковка настроек…");
    let count = extractTo(zip, "overrides/", dir);
    count += extractTo(zip, "client-overrides/", dir);
    report(100, "Готово");
    return { build: builds.get(build.id), files: done + count, format: "mrpack" };
  }

  throw new Error("Это не сборка: нужен файл .ibpack (экспорт из этого лаунчера) или .mrpack (Modrinth)");
}

module.exports = {
  listWorlds,
  backupWorld,
  restoreBackup,
  importWorld,
  deleteWorld,
  deleteBackup,
  openWorld,
  openBackups,
  listScreenshots,
  copyScreenshot,
  deleteScreenshot,
  openScreenshot,
  showScreenshot,
  exportBuild,
  importBuild,
};
