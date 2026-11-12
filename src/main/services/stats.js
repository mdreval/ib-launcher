/**
 * Статистика для профиля игрока: сколько наиграно (всего, по сборкам и по
 * аккаунтам), сколько запусков, когда играли первый и последний раз.
 * Файл: .LauncherIB\data\stats.json.
 */

const path = require("path");

const paths = require("../paths");
const { readJson, writeJson } = require("../core/jsonFile");

const FILE = path.join(paths.LAUNCHER_DIR, "stats.json");
const running = new Map(); // buildId -> { started, accountId }

function load() {
  const s = readJson(FILE, null) || {};
  return {
    total_ms: s.total_ms || 0,
    launches: s.launches || 0,
    first_launch: s.first_launch || null,
    last_launch: s.last_launch || null,
    longest_ms: s.longest_ms || 0,
    builds: s.builds || {},
    accounts: s.accounts || {},
  };
}

function gameStarted(buildId, accountId) {
  running.set(buildId, { started: Date.now(), accountId });
  const s = load();
  s.launches += 1;
  s.first_launch = s.first_launch || Date.now();
  s.last_launch = Date.now();
  const b = (s.builds[buildId] = s.builds[buildId] || { ms: 0, launches: 0 });
  b.launches += 1;
  if (accountId) {
    const a = (s.accounts[accountId] = s.accounts[accountId] || { ms: 0, launches: 0 });
    a.launches += 1;
  }
  writeJson(FILE, s);
}

function gameStopped(buildId) {
  const r = running.get(buildId);
  if (!r) return;
  running.delete(buildId);
  const ms = Math.max(0, Date.now() - r.started);
  const s = load();
  s.total_ms += ms;
  s.longest_ms = Math.max(s.longest_ms, ms);
  const b = (s.builds[buildId] = s.builds[buildId] || { ms: 0, launches: 0 });
  b.ms += ms;
  if (r.accountId) {
    const a = (s.accounts[r.accountId] = s.accounts[r.accountId] || { ms: 0, launches: 0 });
    a.ms += ms;
  }
  writeJson(FILE, s);
}

/** Текущая статистика (вместе с идущей прямо сейчас игрой). */
function get() {
  const s = load();
  const now = Date.now();
  for (const [buildId, r] of running) {
    const ms = now - r.started;
    s.total_ms += ms;
    s.builds[buildId] = s.builds[buildId] || { ms: 0, launches: 0 };
    s.builds[buildId].ms += ms;
    if (r.accountId) {
      s.accounts[r.accountId] = s.accounts[r.accountId] || { ms: 0, launches: 0 };
      s.accounts[r.accountId].ms += ms;
    }
  }
  s.playing = [...running.keys()];
  return s;
}

module.exports = { gameStarted, gameStopped, get };
