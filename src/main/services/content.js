/**
 * Моды, ресурспаки и шейдеры сборки — вкладка «Моды» как в Rich:
 *  - список установленного с названием, версией и иконкой из самого файла;
 *  - определение файла на Modrinth по sha1 (иначе — «СВОЙ ФАЙЛ»);
 *  - пометки «НЕ ДЛЯ ЭТОЙ СБОРКИ» / «НЕ ХВАТАЕТ ЗАВИСИМОСТЕЙ» + «Исправить»;
 *  - «Обновить все», каталог Modrinth с установкой в один клик.
 * Всё работает только с папкой выбранной сборки instances/<id>/...
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const builds = require("./builds");
const modpack = require("./modpack");
const modrinth = require("./modrinth");
const { downloadFile } = require("../core/http");

const KINDS = {
  mods: { dir: "mods", exts: [".jar"] },
  resourcepacks: { dir: "resourcepacks", exts: [".zip"] },
  shaderpacks: { dir: "shaderpacks", exts: [".zip"] },
};

const DISABLED = ".disabled";

const metaCache = new Map(); // путь|размер|время -> { sha1, meta }
const versionCache = new Map(); // sha1 -> версия Modrinth или null
const projectCache = new Map(); // projectId -> проект Modrinth
const updateCache = new Map(); // buildId|kind -> { at, map }

function kindInfo(kind) {
  const info = KINDS[kind];
  if (!info) throw new Error(`Неизвестный тип: ${kind}`);
  return info;
}

function contentDir(build, kind) {
  const dir = path.join(builds.instanceDir(build), kindInfo(kind).dir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function requireBuild(buildId) {
  const build = builds.get(buildId);
  if (!build) throw new Error("Сборка не найдена");
  return build;
}

function baseName(file) {
  return file.endsWith(DISABLED) ? file.slice(0, -DISABLED.length) : file;
}

function sha1File(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

// ---------- чтение метаданных из файла ----------

function parseLooseJson(text) {
  return JSON.parse(text.replace(/^﻿/, "").replace(/[\u0000-\u0019]+/g, " "));
}

function tomlValue(block, key) {
  const m = new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "m").exec(block);
  return m ? m[1] ?? m[2] : null;
}

function iconDataUrl(zip, iconPath) {
  if (!iconPath) return null;
  const entry = zip.getEntry(String(iconPath).replace(/^\/+/, ""));
  if (!entry || entry.header.size > 400 * 1024) return null;
  const ext = path.extname(iconPath).toLowerCase() === ".jpg" ? "jpeg" : "png";
  return `data:image/${ext};base64,${entry.getData().toString("base64")}`;
}

function readModMeta(file) {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(file);
  const text = (name) => {
    const entry = zip.getEntry(name);
    return entry ? entry.getData().toString("utf-8") : null;
  };

  const fabric = text("fabric.mod.json");
  if (fabric) {
    try {
      const j = parseLooseJson(fabric);
      const icon = typeof j.icon === "string" ? j.icon : j.icon ? Object.values(j.icon).pop() : null;
      return { modId: j.id, name: j.name || j.id, version: j.version, icon: iconDataUrl(zip, icon), loaders: ["fabric"] };
    } catch (err) {
      /* попробуем другие форматы */
    }
  }

  const quilt = text("quilt.mod.json");
  if (quilt) {
    try {
      const j = parseLooseJson(quilt).quilt_loader || {};
      const metaInfo = j.metadata || {};
      const icon = typeof metaInfo.icon === "string" ? metaInfo.icon : metaInfo.icon ? Object.values(metaInfo.icon).pop() : null;
      return { modId: j.id, name: metaInfo.name || j.id, version: j.version, icon: iconDataUrl(zip, icon), loaders: ["quilt"] };
    } catch (err) {
      /* дальше */
    }
  }

  const toml = text("META-INF/neoforge.mods.toml") || text("META-INF/mods.toml");
  if (toml) {
    const isNeo = !!zip.getEntry("META-INF/neoforge.mods.toml");
    const modsBlock = toml.split(/^\s*\[\[mods\]\]\s*$/m)[1] || toml;
    const block = modsBlock.split(/^\s*\[/m)[0];
    let version = tomlValue(block, "version");
    if (!version || version.includes("${")) {
      const manifest = text("META-INF/MANIFEST.MF") || "";
      const m = /Implementation-Version:\s*(.+)/.exec(manifest);
      version = m ? m[1].trim() : null;
    }
    const logo = tomlValue(block, "logoFile") || tomlValue(toml, "logoFile");
    return {
      modId: tomlValue(block, "modId"),
      name: tomlValue(block, "displayName") || tomlValue(block, "modId"),
      version,
      icon: iconDataUrl(zip, logo),
      loaders: isNeo ? ["neoforge"] : ["forge"],
    };
  }
  return null;
}

function readPackMeta(file) {
  const AdmZip = require("adm-zip");
  try {
    const zip = new AdmZip(file);
    return { icon: iconDataUrl(zip, "pack.png") };
  } catch (err) {
    return null;
  }
}

function localInfo(kind, full, stat) {
  const key = `${full}|${stat.size}|${stat.mtimeMs}`;
  if (metaCache.has(key)) return metaCache.get(key);
  let meta = null;
  try {
    meta = kind === "mods" ? readModMeta(full) : readPackMeta(full);
  } catch (err) {
    meta = null;
  }
  const info = { sha1: sha1File(full), meta };
  metaCache.set(key, info);
  return info;
}

// ---------- Modrinth ----------

async function identify(hashes) {
  const unknown = hashes.filter((h) => !versionCache.has(h));
  if (unknown.length) {
    try {
      const found = await modrinth.versionsByHashes(unknown);
      for (const h of unknown) versionCache.set(h, found[h] || null);
    } catch (err) {
      return false; // нет сети — показываем только локальные данные
    }
  }
  const projectIds = [...new Set(hashes.map((h) => versionCache.get(h)).filter(Boolean).map((v) => v.project_id))];
  const missing = projectIds.filter((id) => !projectCache.has(id));
  if (missing.length) {
    try {
      for (const p of await modrinth.projects(missing)) projectCache.set(p.id, p);
    } catch (err) {
      /* без иконок/названий тоже можно */
    }
  }
  return true;
}

async function updatesFor(build, kind, hashes, force = false) {
  const key = `${build.id}|${kind}|${build.mc_version}|${build.loader_type}`;
  const cached = updateCache.get(key);
  if (!force && cached && Date.now() - cached.at < 10 * 60 * 1000 && hashes.every((h) => h in cached.map)) return cached.map;
  try {
    const latest = await modrinth.latestByHashes(hashes, { kind, loaderType: build.loader_type, mcVersion: build.mc_version });
    const map = {};
    for (const h of hashes) map[h] = latest[h] || null;
    updateCache.set(key, { at: Date.now(), map });
    return map;
  } catch (err) {
    return {};
  }
}

// ---------- список ----------

async function list(buildId, kind, { refreshUpdates = false } = {}) {
  const build = requireBuild(buildId);
  const info = kindInfo(kind);
  const dir = contentDir(build, kind);
  const fromModpack = kind === "mods" ? modpack.trackedFiles(build) : new Set();

  const items = [];
  for (const file of fs.readdirSync(dir)) {
    const name = baseName(file);
    if (!info.exts.some((ext) => name.toLowerCase().endsWith(ext))) continue;
    const full = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch (err) {
      continue;
    }
    if (!stat.isFile()) continue;
    const local = localInfo(kind, full, stat);
    items.push({
      file: name,
      enabled: !file.endsWith(DISABLED),
      size: stat.size,
      sha1: local.sha1,
      name: (local.meta && local.meta.name) || name.replace(/\.(jar|zip)$/i, ""),
      version: (local.meta && local.meta.version) || null,
      icon: (local.meta && local.meta.icon) || null,
      modId: local.meta ? local.meta.modId : null,
      modpack: fromModpack.has(name),
      source: "local",
      projectId: null,
      issues: [],
      update: null,
    });
  }

  const online = await identify(items.map((i) => i.sha1));
  if (online) {
    const allowedLoaders = modrinth.loaderFacets(kind, build.loader_type, build.mc_version);
    const installedProjects = new Set();
    for (const item of items) {
      const version = versionCache.get(item.sha1);
      if (!version) continue;
      const project = projectCache.get(version.project_id);
      item.source = "modrinth";
      item.projectId = version.project_id;
      item.versionId = version.id;
      item.version = version.version_number || item.version;
      if (project) {
        item.name = project.title || item.name;
        item.slug = project.slug;
        if (!item.icon && project.icon_url) item.icon = project.icon_url;
      }
      if (item.enabled) installedProjects.add(version.project_id);
    }

    for (const item of items) {
      const version = versionCache.get(item.sha1);
      if (!version) continue;
      if (kind === "mods") {
        const loaderOk = !allowedLoaders.length || (version.loaders || []).some((l) => allowedLoaders.includes(l));
        const gameOk = (version.game_versions || []).includes(build.mc_version);
        if (!loaderOk || !gameOk) {
          item.issues.push({ type: "incompatible", text: "Не для этой сборки" });
        }
        const missing = (version.dependencies || [])
          .filter((d) => d.dependency_type === "required" && d.project_id && !installedProjects.has(d.project_id))
          .map((d) => d.project_id);
        if (missing.length && item.enabled) {
          item.issues.push({ type: "deps", text: "Не хватает зависимостей", missing: [...new Set(missing)] });
        }
      }
    }

    const identified = items.filter((i) => i.source === "modrinth" && !i.issues.some((x) => x.type === "incompatible"));
    const latest = await updatesFor(build, kind, identified.map((i) => i.sha1), refreshUpdates);
    for (const item of identified) {
      const next = latest[item.sha1];
      if (next && next.id !== item.versionId) {
        item.update = { versionId: next.id, versionNumber: next.version_number };
      }
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base" }));
  return { items, online, loader: build.loader_type, mc: build.mc_version };
}

// ---------- действия с файлами ----------

function resolveFile(build, kind, file) {
  const dir = contentDir(build, kind);
  const safe = path.basename(baseName(String(file)));
  const enabledPath = path.join(dir, safe);
  return { dir, safe, enabledPath, disabledPath: enabledPath + DISABLED };
}

function setEnabled(buildId, kind, file, enabled) {
  const build = requireBuild(buildId);
  const { enabledPath, disabledPath } = resolveFile(build, kind, file);
  if (enabled && fs.existsSync(disabledPath)) fs.renameSync(disabledPath, enabledPath);
  if (!enabled && fs.existsSync(enabledPath)) fs.renameSync(enabledPath, disabledPath);
  return true;
}

function remove(buildId, kind, file) {
  const build = requireBuild(buildId);
  const { enabledPath, disabledPath } = resolveFile(build, kind, file);
  fs.rmSync(enabledPath, { force: true });
  fs.rmSync(disabledPath, { force: true });
  return true;
}

function addFiles(buildId, kind, sourcePaths) {
  const build = requireBuild(buildId);
  const info = kindInfo(kind);
  const dir = contentDir(build, kind);
  const added = [];
  const skipped = [];
  for (const src of sourcePaths || []) {
    const name = path.basename(src);
    if (!info.exts.some((ext) => name.toLowerCase().endsWith(ext)) || !fs.existsSync(src)) {
      skipped.push(name);
      continue;
    }
    fs.copyFileSync(src, path.join(dir, name));
    added.push(name);
  }
  return { added, skipped };
}

function folder(buildId, kind) {
  return contentDir(requireBuild(buildId), kind);
}

// ---------- установка с Modrinth ----------

function pickVersion(versionsList) {
  if (!versionsList || !versionsList.length) return null;
  return versionsList.find((v) => v.version_type === "release") || versionsList[0];
}

function primaryFile(version) {
  return (version.files || []).find((f) => f.primary) || (version.files || [])[0] || null;
}

/** Удаляет уже установленные файлы того же проекта (при замене версии). */
async function removeOtherFilesOfProject(build, kind, projectId, keepFile) {
  const dir = contentDir(build, kind);
  for (const file of fs.readdirSync(dir)) {
    const name = baseName(file);
    if (name === keepFile) continue;
    const full = path.join(dir, file);
    let sha1;
    try {
      sha1 = localInfo(kind, full, fs.statSync(full)).sha1;
    } catch (err) {
      continue;
    }
    const version = versionCache.get(sha1);
    if (version && version.project_id === projectId) fs.rmSync(full, { force: true });
  }
}

async function installVersionFile(build, kind, version, { keepDisabled = false } = {}) {
  const file = primaryFile(version);
  if (!file) throw new Error("У этой версии нет файла для скачивания");
  const dir = contentDir(build, kind);
  const target = path.join(dir, path.basename(file.filename));
  await downloadFile(file.url, target, { sha1: file.hashes && file.hashes.sha1 });
  if (file.hashes && file.hashes.sha1) versionCache.set(file.hashes.sha1, version);
  await removeOtherFilesOfProject(build, kind, version.project_id, path.basename(file.filename));
  if (keepDisabled) fs.renameSync(target, target + DISABLED);
  updateCache.clear();
  return path.basename(file.filename);
}

async function installedProjectIds(build, kind) {
  const { items } = await list(build.id, kind);
  return new Set(items.filter((i) => i.projectId).map((i) => i.projectId));
}

async function installProject(buildId, kind, projectId, { depth = 0, seen = new Set() } = {}) {
  const build = requireBuild(buildId);
  if (kind === "mods" && build.loader_type === "vanilla") {
    throw new Error("В сборке без загрузчика моды не работают — создайте сборку с Fabric, Forge, NeoForge или Quilt");
  }
  seen.add(projectId);
  const versionsList = await modrinth.projectVersions(projectId, { kind, loaderType: build.loader_type, mcVersion: build.mc_version });
  const version = pickVersion(versionsList);
  if (!version) {
    const project = projectCache.get(projectId);
    const title = project ? `«${project.title}»` : "этого проекта";
    throw new Error(`Нет версии ${title} для ${build.loader_type === "vanilla" ? "" : build.loader_type + " "}${build.mc_version}`);
  }
  const fileName = await installVersionFile(build, kind, version);
  const installed = [fileName];

  if (kind === "mods" && depth < 4) {
    const have = await installedProjectIds(build, kind);
    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== "required" || !dep.project_id) continue;
      if (have.has(dep.project_id) || seen.has(dep.project_id)) continue;
      try {
        installed.push(...(await installProject(buildId, kind, dep.project_id, { depth: depth + 1, seen })));
      } catch (err) {
        /* зависимость не нашлась — покажется пометкой в списке */
      }
    }
  }
  return installed;
}

async function updateFile(buildId, kind, file) {
  const build = requireBuild(buildId);
  const { enabledPath, disabledPath } = resolveFile(build, kind, file);
  const full = fs.existsSync(enabledPath) ? enabledPath : disabledPath;
  if (!fs.existsSync(full)) throw new Error("Файл не найден");
  const sha1 = localInfo(kind, full, fs.statSync(full)).sha1;
  const latest = await modrinth.latestByHashes([sha1], { kind, loaderType: build.loader_type, mcVersion: build.mc_version });
  const next = latest[sha1];
  if (!next) throw new Error("Обновление не найдено");
  const newName = await installVersionFile(build, kind, next, { keepDisabled: full === disabledPath });
  if (path.basename(baseName(full)) !== newName) fs.rmSync(full, { force: true });
  return newName;
}

async function updateAll(buildId, kind) {
  const { items } = await list(buildId, kind, { refreshUpdates: true });
  const results = { updated: [], failed: [] };
  for (const item of items.filter((i) => i.update)) {
    try {
      await updateFile(buildId, kind, item.file);
      results.updated.push(item.name);
    } catch (err) {
      results.failed.push(`${item.name}: ${err.message}`);
    }
  }
  return results;
}

/** «Исправить»: ставит недостающие зависимости или заменяет мод на версию,
 * подходящую для этой сборки. */
async function fix(buildId, kind, file) {
  const build = requireBuild(buildId);
  const { items } = await list(buildId, kind);
  const item = items.find((i) => i.file === baseName(file));
  if (!item) throw new Error("Файл не найден");
  const done = [];
  for (const issue of item.issues) {
    if (issue.type === "deps") {
      for (const projectId of issue.missing || []) {
        done.push(...(await installProject(buildId, kind, projectId)));
      }
    }
    if (issue.type === "incompatible" && item.projectId) {
      const versionsList = await modrinth.projectVersions(item.projectId, { kind, loaderType: build.loader_type, mcVersion: build.mc_version });
      const version = pickVersion(versionsList);
      if (!version) throw new Error(`У «${item.name}» нет версии для ${build.loader_type} ${build.mc_version} — лучше удалить этот мод`);
      done.push(await installVersionFile(build, kind, version, { keepDisabled: !item.enabled }));
      const { enabledPath, disabledPath } = resolveFile(build, kind, item.file);
      if (!done.includes(item.file)) {
        fs.rmSync(enabledPath, { force: true });
        fs.rmSync(disabledPath, { force: true });
      }
    }
  }
  return done;
}

// ---------- каталог ----------

async function search(buildId, kind, params = {}) {
  const build = requireBuild(buildId);
  const result = await modrinth.search({
    kind,
    query: params.query,
    index: params.index,
    category: params.category,
    offset: params.offset,
    loaderType: build.loader_type,
    mcVersion: build.mc_version,
  });
  let installed = new Set();
  try {
    installed = await installedProjectIds(build, kind);
  } catch (err) {
    /* пометки «установлен» не будет */
  }
  return {
    total: result.total_hits,
    offset: result.offset,
    hits: (result.hits || []).map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      author: h.author,
      description: h.description,
      downloads: h.downloads,
      updated: h.date_modified,
      icon: h.icon_url,
      categories: (h.display_categories || h.categories || []).filter((c) => !["fabric", "forge", "neoforge", "quilt", "minecraft"].includes(c)),
      installed: installed.has(h.project_id),
    })),
  };
}

module.exports = {
  KINDS,
  list,
  setEnabled,
  remove,
  addFiles,
  folder,
  installProject,
  updateFile,
  updateAll,
  fix,
  search,
  categories: (kind) => modrinth.categories(kind),
};
