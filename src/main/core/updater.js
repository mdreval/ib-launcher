/**
 * Обновление лаунчера с GitHub Releases (репозиторий — package.json → build.publish).
 *
 * Windows: electron-updater сам скачивает новую версию и ставит её при
 *          перезапуске.
 * macOS:   приложение не подписано сертификатом Apple, поэтому
 *          автообновление там невозможно — лаунчер только сообщает о новой
 *          версии и даёт ссылку на .dmg в релизе. Релизы собираются только
 *          для Apple Silicon (M1 и новее): Mac на Intel получает ссылку на
 *          страницу релиза и пометку, что его сборки больше нет.
 */

const { app } = require("electron");
const log = require("electron-log");
const pkg = require("../../../package.json");
const { fetchJson, request, HttpError } = require("./http");

let autoUpdater = null;
let emit = () => {};

function repo() {
  const pub = ((pkg.build && pkg.build.publish) || [])[0] || {};
  return { owner: pub.owner, repo: pub.repo };
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function useAutoUpdater() {
  return process.platform === "win32";
}

function setup(onEvent) {
  emit = onEvent;
  if (!useAutoUpdater()) return;
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => emit({ type: "checking" }));
  autoUpdater.on("update-available", (info) => emit({ type: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => emit({ type: "not-available" }));
  autoUpdater.on("error", (err) => emit({ type: "error", message: err && err.message ? err.message : String(err) }));
  autoUpdater.on("download-progress", (p) => emit({ type: "progress", percent: p.percent }));
  autoUpdater.on("update-downloaded", (info) => emit({ type: "downloaded", version: info.version }));
}

/** Только .dmg под свой процессор: arm64 на Intel не запустится. */
function pickDmg(names) {
  const dmgs = names.filter((n) => n.endsWith(".dmg"));
  const name = dmgs.find((n) => (process.arch === "arm64" ? /arm64/i.test(n) : !/arm64/i.test(n))) || null;
  return { name, unsupported: !name && process.arch !== "arm64" && dmgs.length > 0 };
}

/** Основной способ: GitHub API → последний релиз со списком файлов. */
async function latestFromApi(owner, name) {
  const release = await fetchJson(`https://api.github.com/repos/${owner}/${name}/releases/latest`);
  const version = String(release.tag_name || "").replace(/^v/, "");
  const assets = release.assets || [];
  const { name: dmg, unsupported } = pickDmg(assets.map((a) => a.name));
  const asset = dmg ? assets.find((a) => a.name === dmg) : null;
  return {
    version,
    url: release.html_url,
    download: asset ? asset.browser_download_url : release.html_url,
    unsupported,
  };
}

/**
 * Запасной способ, если api.github.com не отвечает: latest-mac.yml из
 * последнего релиза на обычном github.com — тот же путь, которым обновляется
 * Windows (latest.yml).
 */
async function latestFromYml(owner, name) {
  const base = `https://github.com/${owner}/${name}/releases`;
  const res = await request(`${base}/latest/download/latest-mac.yml`, { timeout: 20000 });
  const text = await res.text();
  const m = text.match(/^version:\s*['"]?([^\s'"]+)/m);
  if (!m) throw new Error("В latest-mac.yml нет версии");
  const version = m[1].replace(/^v/, "");
  const files = [...text.matchAll(/^\s*-?\s*url:\s*['"]?([^\s'"]+)/gm)].map((x) => x[1]);
  const { name: dmg, unsupported } = pickDmg(files);
  const url = `${base}/tag/v${version}`;
  return {
    version,
    url,
    download: dmg ? `${base}/download/v${version}/${encodeURIComponent(dmg)}` : url,
    unsupported,
  };
}

/** macOS (и прочие): смотрим последний релиз и даём ссылку на .dmg. */
async function checkManual() {
  emit({ type: "checking" });
  const { owner, repo: name } = repo();
  let info = null;
  let apiErr = null;
  try {
    info = await latestFromApi(owner, name);
  } catch (err) {
    apiErr = err;
    log.warn(`Проверка обновлений через api.github.com не удалась: ${err.message} — пробую latest-mac.yml`);
    try {
      info = await latestFromYml(owner, name);
    } catch (ymlErr) {
      log.warn(`latest-mac.yml тоже не получен: ${ymlErr.message}`);
      // Сервер ответил, но не то (404 и т.п.) — даём игроку ссылку на релизы,
      // чтобы он мог обновиться сам. Без интернета окно не показываем.
      emit({
        type: "manual-error",
        message: apiErr.message,
        url: `https://github.com/${owner}/${name}/releases/latest`,
        http: apiErr instanceof HttpError || ymlErr instanceof HttpError,
      });
      return { error: apiErr.message };
    }
  }
  const latest = info.version;
  if (!latest || compareVersions(latest, app.getVersion()) <= 0) {
    emit({ type: "not-available" });
    return { available: false };
  }
  emit({ type: "manual", ...info });
  return { available: true, version: latest };
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    emit({ type: "dev" });
    return { dev: true };
  }
  try {
    if (!useAutoUpdater()) return await checkManual();
    await autoUpdater.checkForUpdates();
    return { dev: false };
  } catch (err) {
    emit({ type: "error", message: err.message });
    return { error: err.message };
  }
}

async function downloadUpdate() {
  if (!autoUpdater) return false;
  await autoUpdater.downloadUpdate();
  return true;
}

function quitAndInstall() {
  if (!autoUpdater) return false;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
}

module.exports = { setup, checkForUpdates, downloadUpdate, quitAndInstall, compareVersions };
