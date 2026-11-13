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
const { fetchJson } = require("./http");

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

/** macOS (и прочие): смотрим последний релиз и даём ссылку на .dmg. */
async function checkManual() {
  emit({ type: "checking" });
  const { owner, repo: name } = repo();
  const release = await fetchJson(`https://api.github.com/repos/${owner}/${name}/releases/latest`);
  const latest = String(release.tag_name || "").replace(/^v/, "");
  if (!latest || compareVersions(latest, app.getVersion()) <= 0) {
    emit({ type: "not-available" });
    return { available: false };
  }
  const dmgs = (release.assets || []).filter((a) => a.name.endsWith(".dmg"));
  // Только .dmg под свой процессор: arm64 на Intel не запустится.
  const asset = dmgs.find((a) => (process.arch === "arm64" ? /arm64/i.test(a.name) : !/arm64/i.test(a.name))) || null;
  emit({
    type: "manual",
    version: latest,
    url: release.html_url,
    download: asset ? asset.browser_download_url : release.html_url,
    unsupported: !asset && process.arch !== "arm64" && dmgs.length > 0,
  });
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
