/**
 * Версия лаунчера задаётся в ОДНОМ месте — data/server_profiles.json,
 * поле "launcher_version". Этот скрипт переносит её в package.json (и
 * package-lock.json), откуда её берут Electron, установщик и автообновление.
 *
 * Запускается сам: перед `npm start` и `npm run dist` (prestart/predist в
 * package.json) и в GitHub Actions перед сборкой. Вручную: node scripts/sync-version.js
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const configFile = path.join(root, "data", "server_profiles.json");
const pkgFile = path.join(root, "package.json");
const lockFile = path.join(root, "package-lock.json");

const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
const version = String((config && config.launcher_version) || "").trim();
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`В data/server_profiles.json неверный launcher_version: "${version}" (нужно вида 2.0.0)`);
  process.exit(1);
}

function setVersion(file, apply) {
  if (!fs.existsSync(file)) return false;
  const raw = fs.readFileSync(file, "utf-8");
  const data = JSON.parse(raw);
  const before = JSON.stringify(data);
  apply(data);
  if (JSON.stringify(data) === before) return false;
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(file, JSON.stringify(data, null, 2).replace(/\n/g, eol) + eol);
  return true;
}

const changedPkg = setVersion(pkgFile, (d) => {
  d.version = version;
});
const changedLock = setVersion(lockFile, (d) => {
  d.version = version;
  if (d.packages && d.packages[""]) d.packages[""].version = version;
});

console.log(`Версия лаунчера: ${version}${changedPkg || changedLock ? " (обновлён package.json)" : ""}`);
