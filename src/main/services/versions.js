/**
 * Каталог версий Minecraft (Релиз / Снапшот / Бета / Альфа) и версии
 * загрузчиков для окна «Новая сборка». Источники — те же официальные
 * сервисы, что использует библиотека установки, поэтому выбранная версия
 * загрузчика гарантированно найдётся при установке.
 *
 * Результаты кэшируются на диск: если интернета нет, лаунчер покажет
 * последний известный список.
 */

const path = require("path");
const paths = require("../paths");
const { fetchJson } = require("../core/http");
const { readJson, writeJson } = require("../core/jsonFile");

const TTL_MS = 60 * 60 * 1000;
const memory = new Map();

async function cached(key, loader) {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const file = path.join(paths.CACHE_DIR, `${key.replace(/[^a-z0-9._-]/gi, "_")}.json`);
  try {
    const data = await loader();
    memory.set(key, { at: Date.now(), data });
    writeJson(file, { at: Date.now(), data });
    return data;
  } catch (err) {
    const disk = readJson(file, null);
    if (disk && disk.data) {
      memory.set(key, { at: Date.now() - TTL_MS + 60000, data: disk.data });
      return disk.data;
    }
    throw err;
  }
}

/** Сравнение версий по числовым частям: "21.1.265" > "21.1.99". */
function compareVersions(a, b) {
  const pa = String(a).split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = String(b).split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function isUnstable(v) {
  return /alpha|beta|pre|rc|snapshot/i.test(String(v));
}

async function catalog() {
  return cached("mojang-manifest", async () => {
    const manifest = await fetchJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    return manifest.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
  });
}

/** То же сопоставление версии NeoForge с версией Minecraft, что и в
 * библиотеке установки (minecraft-java-core). */
function neoforgeToMinecraft(version) {
  const snapshot = version.match(/^0\.([^.]+)\./);
  if (snapshot) return snapshot[1];
  const parts = version.split(/[-+]/)[0].split(".");
  if (parts.length >= 4) {
    let mc = `${parts[0]}.${parts[1]}`;
    if (parts[2] !== "0") mc += `.${parts[2]}`;
    const suffix = version.match(/\+(snapshot-\d+|pre-\d+)/);
    if (suffix) mc += `-${suffix[1]}`;
    return mc;
  }
  if (parts.length === 3) {
    if (parts[1] === "0") return `1.${parts[0]}`;
    return `1.${parts[0]}.${parts[1]}`;
  }
  return null;
}

function pickRecommended(versions, isStable) {
  const stable = versions.find((v) => isStable(v));
  return (stable || versions[0] || {}).id || null;
}

async function fabricVersions(mc) {
  const data = await cached(`fabric-${mc}`, () => fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`));
  const versions = data.map((item) => ({ id: item.loader.version, label: item.loader.version, stable: !!item.loader.stable }));
  return { versions, recommended: pickRecommended(versions, (v) => v.stable) };
}

async function quiltVersions(mc) {
  const data = await cached(`quilt-${mc}`, () => fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`));
  const versions = data.map((item) => ({ id: item.loader.version, label: item.loader.version, stable: !isUnstable(item.loader.version) }));
  return { versions, recommended: pickRecommended(versions, (v) => v.stable) };
}

async function neoforgeVersions(mc) {
  const modern = await cached("neoforge-all", () =>
    fetchJson("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")
  );
  let ids = (modern.versions || []).filter((v) => neoforgeToMinecraft(v) === mc);
  if (!ids.length && mc === "1.20.1") {
    const legacy = await cached("neoforge-legacy", () =>
      fetchJson("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/forge")
    );
    ids = (legacy.versions || []).filter((v) => v.startsWith(`${mc}-`));
  }
  ids.sort((a, b) => compareVersions(b, a));
  const versions = ids.map((id) => ({ id, label: id.replace(`${mc}-`, ""), stable: !isUnstable(id) }));
  return { versions, recommended: pickRecommended(versions, (v) => v.stable) };
}

async function forgeVersions(mc) {
  const meta = await cached("forge-all", () =>
    fetchJson("https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json")
  );
  const ids = [...(meta[mc] || [])].sort((a, b) => compareVersions(b, a));
  let recommendedShort = null;
  try {
    const promos = await cached("forge-promos", () =>
      fetchJson("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")
    );
    recommendedShort = promos.promos[`${mc}-recommended`] || promos.promos[`${mc}-latest`] || null;
  } catch (err) {
    /* без рекомендации просто возьмём самую новую */
  }
  // Библиотеке установки нужен полный идентификатор «1.21.1-52.0.40».
  const versions = ids.map((id) => ({ id, label: id.replace(`${mc}-`, ""), stable: true }));
  const recommended =
    (recommendedShort && versions.find((v) => v.label === recommendedShort || v.label.startsWith(`${recommendedShort}-`))?.id) ||
    (versions[0] && versions[0].id) ||
    null;
  return { versions, recommended };
}

async function loaderVersions(loader, mc) {
  switch (loader) {
    case "fabric":
      return fabricVersions(mc);
    case "quilt":
      return quiltVersions(mc);
    case "neoforge":
      return neoforgeVersions(mc);
    case "forge":
      return forgeVersions(mc);
    default:
      return { versions: [], recommended: null };
  }
}

/** Короткая подпись версии загрузчика для интерфейса: у Forge убираем
 * префикс версии Minecraft («1.21.1-52.0.40» → «52.0.40»). */
function loaderLabel(build) {
  if (!build || !build.loader_version) return "";
  return String(build.loader_version).replace(`${build.mc_version}-`, "");
}

module.exports = { catalog, loaderVersions, compareVersions, neoforgeToMinecraft, loaderLabel };
