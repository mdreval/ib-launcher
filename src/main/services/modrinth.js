/**
 * Публичный API Modrinth (ключ не нужен): поиск, категории, версии,
 * определение установленных файлов по sha1 и проверка обновлений.
 */

const { fetchJson, postJson } = require("../core/http");

const API = "https://api.modrinth.com/v2";

const PROJECT_TYPE = { mods: "mod", resourcepacks: "resourcepack", shaderpacks: "shader" };

/** Какие «загрузчики» Modrinth подходят сборке. */
function loaderFacets(kind, loaderType, mcVersion) {
  if (kind !== "mods") return [];
  switch (loaderType) {
    case "fabric":
      return ["fabric"];
    case "quilt":
      return ["quilt", "fabric"];
    case "forge":
      return ["forge"];
    case "neoforge":
      return mcVersion === "1.20.1" ? ["neoforge", "forge"] : ["neoforge"];
    default:
      return [];
  }
}

async function search({ kind, query, index, category, offset, loaderType, mcVersion }) {
  const facets = [[`project_type:${PROJECT_TYPE[kind]}`]];
  const loaders = loaderFacets(kind, loaderType, mcVersion);
  if (loaders.length) facets.push(loaders.map((l) => `categories:${l}`));
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  if (category) facets.push([`categories:${category}`]);
  const params = new URLSearchParams({
    query: query || "",
    index: index || "relevance",
    offset: String(offset || 0),
    limit: "20",
    facets: JSON.stringify(facets),
  });
  return fetchJson(`${API}/search?${params.toString()}`);
}

let categoriesCache = null;
async function categories(kind) {
  if (!categoriesCache) categoriesCache = await fetchJson(`${API}/tag/category`);
  return categoriesCache
    .filter((c) => c.project_type === PROJECT_TYPE[kind] && c.header === "categories")
    .map((c) => c.name)
    .sort();
}

async function projectVersions(projectId, { kind, loaderType, mcVersion }) {
  const params = new URLSearchParams();
  const loaders = loaderFacets(kind, loaderType, mcVersion);
  if (loaders.length) params.set("loaders", JSON.stringify(loaders));
  if (mcVersion) params.set("game_versions", JSON.stringify([mcVersion]));
  return fetchJson(`${API}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`);
}

async function versionsByHashes(hashes) {
  if (!hashes.length) return {};
  return postJson(`${API}/version_files`, { hashes, algorithm: "sha1" });
}

async function latestByHashes(hashes, { kind, loaderType, mcVersion }) {
  if (!hashes.length) return {};
  const body = { hashes, algorithm: "sha1", game_versions: [mcVersion] };
  const loaders = loaderFacets(kind, loaderType, mcVersion);
  if (loaders.length) body.loaders = loaders;
  return postJson(`${API}/version_files/update`, body);
}

async function projects(ids) {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    out.push(...(await fetchJson(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`)));
  }
  return out;
}

module.exports = { search, categories, projectVersions, versionsByHashes, latestByHashes, projects, loaderFacets, PROJECT_TYPE };
