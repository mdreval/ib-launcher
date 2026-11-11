/**
 * Установка и запуск сборок через minecraft-java-core.
 *
 * Папки: версии/библиотеки/ассеты/Java — общие (папка игры), а у каждой
 * сборки своя instances/<id> (это встроенный режим библиотеки «instance»).
 *
 * «Установить» отдельно от «Играть»: используется тот же Launch, но после
 * загрузки файлов процесс игры не запускается (переопределён start()).
 *
 * Чтобы работали кнопка «Остановить» и строка «Игра завершилась с кодом N»,
 * лаунчер перехватывает запуск java-процесса библиотекой (child_process.spawn)
 * и запоминает именно процесс этой сборки.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const { app } = require("electron");

const paths = require("../paths");
const settings = require("./settings");
const builds = require("./builds");
const accounts = require("./accounts");
const modpack = require("./modpack");
const versions = require("./versions");
const serverList = require("./serverList");
const skinMod = require("./skinMod");
const { broadcast } = require("../core/broadcast");
const { tr } = require("../core/i18n");

// ---------- перехват запуска процесса ----------

const originalSpawn = childProcess.spawn;
const spawnWatchers = new Set();

childProcess.spawn = function patchedSpawn(...args) {
  const child = originalSpawn.apply(this, args);
  for (const watcher of spawnWatchers) {
    try {
      watcher(child, args);
    } catch (err) {
      /* наблюдатель не должен ломать запуск */
    }
  }
  return child;
};

function normalizeDir(p) {
  return path.resolve(String(p || "")).replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
}

let LaunchClass = null;
function loadLibrary() {
  if (!LaunchClass) LaunchClass = require("minecraft-java-core").Launch;
  return LaunchClass;
}

// ---------- состояние сборок ----------

const MAX_LOG_LINES = 5000;
const sessions = new Map(); // buildId -> { status, progress, child, lines, logFile, startedAt }

function session(buildId) {
  if (!sessions.has(buildId)) {
    sessions.set(buildId, { status: "idle", progress: null, child: null, lines: [], logStream: null, exitCode: null });
  }
  return sessions.get(buildId);
}

function publicState(buildId) {
  const s = session(buildId);
  return { buildId, status: s.status, progress: s.progress, exitCode: s.exitCode, pid: s.child ? s.child.pid : null };
}

function allStates() {
  const out = {};
  for (const id of sessions.keys()) out[id] = publicState(id);
  return out;
}

function emitState(buildId) {
  broadcast("game:state", publicState(buildId));
}

function setStatus(buildId, status, progress = null) {
  const s = session(buildId);
  s.status = status;
  s.progress = progress;
  emitState(buildId);
}

let lastProgressEmit = 0;
function setProgress(buildId, percent, text) {
  const s = session(buildId);
  s.progress = { percent: Math.max(0, Math.min(100, Math.round(percent))), text: text || "" };
  const now = Date.now();
  if (now - lastProgressEmit > 120 || percent >= 100) {
    lastProgressEmit = now;
    emitState(buildId);
  }
}

function classify(line) {
  if (/^\[(Лаунчер|Launcher)\]|^---/.test(line)) return "launcher";
  if (/\/(ERROR|FATAL)\]|\bERROR\b|Exception|^\s+at /.test(line)) return "error";
  if (/\/WARN\]|\bWARN(ING)?\b/.test(line)) return "warn";
  return "info";
}

function pushLines(buildId, text) {
  const s = session(buildId);
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => ({ text: l, level: classify(l) }));
  if (!lines.length) return;
  s.lines.push(...lines);
  if (s.lines.length > MAX_LOG_LINES) s.lines.splice(0, s.lines.length - MAX_LOG_LINES);
  if (s.logStream) s.logStream.write(lines.map((l) => l.text).join("\n") + "\n");
  broadcast("game:log", { buildId, lines });
}

function launcherLine(buildId, text) {
  pushLines(buildId, `[${tr("Лаунчер")}] ${tr(text)}`);
}

function openLogFile(buildId) {
  const s = session(buildId);
  if (s.logStream) s.logStream.end();
  fs.mkdirSync(paths.GAME_LOGS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  s.logStream = fs.createWriteStream(path.join(paths.GAME_LOGS_DIR, `${buildId}-${stamp}.log`), { flags: "a" });
  // Храним только последние 30 журналов.
  try {
    const files = fs.readdirSync(paths.GAME_LOGS_DIR).filter((f) => f.endsWith(".log")).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.rmSync(path.join(paths.GAME_LOGS_DIR, f), { force: true });
  } catch (err) {
    /* не важно */
  }
}

// ---------- параметры запуска ----------

function splitArgs(str) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(str || ""))) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function loaderOption(build) {
  if (build.loader_type === "vanilla") return { enable: false };
  let buildValue = build.loader_version || "latest";
  if (build.loader_type === "forge" && buildValue !== "latest" && !buildValue.startsWith(`${build.mc_version}-`)) {
    buildValue = `${build.mc_version}-${buildValue}`;
  }
  return { type: build.loader_type, build: buildValue, enable: true, path: "./loader" };
}

function baseOptions(build, authenticator, extraJvm = []) {
  const s = settings.get();
  const ramMb = build.ram_mb || s.ram_mb;
  const gameArgs = [];
  if (build.fullscreen) gameArgs.push("--fullscreen");
  return {
    path: settings.gameDir(),
    instance: builds.instanceName(build),
    version: build.mc_version,
    authenticator,
    loader: loaderOption(build),
    java: { path: null, version: null, type: "jre" },
    memory: { min: `${Math.min(1024, ramMb)}M`, max: `${ramMb}M` },
    JVM_ARGS: [...splitArgs(s.jvm_args), ...splitArgs(build.jvm_args), ...extraJvm],
    GAME_ARGS: gameArgs,
    screen: build.window && build.window.width ? { width: build.window.width, height: build.window.height } : {},
    verify: false,
    detached: false,
    downloadFileMultiple: 6,
    timeout: 30000,
  };
}

function errorText(err) {
  if (!err) return "Неизвестная ошибка";
  if (typeof err === "string") return err;
  if (err.cause && err.cause.code && /fetch failed/.test(err.message || "")) return `${err.message} (${err.cause.code})`;
  if (err.message && typeof err.message === "string") return err.message;
  if (err.error && typeof err.error === "string") return err.error;
  if (err.error && err.error.message) return err.error.message;
  try {
    return JSON.stringify(err);
  } catch (e) {
    return String(err);
  }
}

function isNetworkError(err) {
  return /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|socket|network|abort|terminated|timeout|HTTP 5\d\d|UND_ERR/i.test(errorText(err));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_PASSES = 4;

function wireProgress(launcher, buildId) {
  launcher.on("progress", (done, total) => {
    const percent = total > 0 ? (done / total) * 100 : 0;
    const pass = launcher.igrobarPass || 1;
    const mb = total > 0 ? ` ${Math.round(done / 1048576)} / ${Math.round(total / 1048576)} МБ` : "";
    setProgress(buildId, percent, pass > 1 ? `Докачка файлов (попытка ${pass}/${MAX_PASSES})${mb}` : `Загрузка файлов игры${mb}`);
  });
  launcher.on("check", (done, total) => {
    setProgress(buildId, total > 0 ? (done / total) * 100 : 0, "Проверка файлов…");
  });
  launcher.on("extract", () => setProgress(buildId, session(buildId).progress?.percent || 0, "Распаковка…"));
  launcher.on("patch", () => setProgress(buildId, session(buildId).progress?.percent || 0, "Установка загрузчика…"));
}

/**
 * Обёртка над Launch из minecraft-java-core:
 *  - ошибки отдельных файлов не обрывают установку: после прохода
 *    недостающие файлы докачиваются ещё раз (до MAX_PASSES проходов);
 *  - «тихие» падения библиотеки (исключение без события error, из-за
 *    которого раньше всё висело на «Подготовка 0%») превращаются в ошибку;
 *  - mode "install" — только скачать файлы, без запуска игры.
 */
function makeLauncher(mode, buildId) {
  const Launch = loadLibrary();
  class IgrobarLaunch extends Launch {
    emit(event, ...args) {
      if (event === "error") {
        const err = args[0];
        if (err instanceof Error && this.igrobarDownloading) this.igrobarFileErrors.push(err);
        else if (err) this.igrobarFatal = err;
        return true;
      }
      return super.emit(event, ...args);
    }

    async DownloadGame() {
      for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
        this.igrobarPass = pass;
        this.igrobarFileErrors = [];
        this.igrobarFatal = null;
        this.igrobarDownloading = true;
        let data = null;
        try {
          data = await super.DownloadGame();
        } catch (err) {
          this.igrobarFatal = err;
        }
        this.igrobarDownloading = false;
        if (data && !this.igrobarFileErrors.length && !this.igrobarFatal) return data;
        const reason = this.igrobarFatal
          ? errorText(this.igrobarFatal)
          : `не скачалось файлов: ${this.igrobarFileErrors.length} (${errorText(this.igrobarFileErrors[0])})`;
        const retryable = !this.igrobarFatal || isNetworkError(this.igrobarFatal);
        if (!retryable) {
          this.igrobarFailure = new Error(reason);
          return undefined;
        }
        if (pass === MAX_PASSES) {
          this.igrobarFailure = new Error(`Не удалось загрузить файлы игры: ${reason}. Проверьте интернет и нажмите ещё раз — уже скачанное не потеряется`);
          return undefined;
        }
        launcherLine(buildId, `Сбой загрузки (${reason}) — пробую ещё раз (${pass + 1}/${MAX_PASSES})…`);
        await sleep(2500 * pass);
      }
      return undefined;
    }

    async start() {
      try {
        if (mode === "install") {
          const data = await this.DownloadGame();
          if (data) super.emit("igrobar:installed");
          else super.emit("igrobar:failed", this.igrobarFailure || new Error(errorText(this.igrobarFatal)));
          return;
        }
        await super.start();
        if (this.igrobarFailure || (this.igrobarFatal && !this.igrobarSpawned)) {
          super.emit("igrobar:failed", this.igrobarFailure || new Error(errorText(this.igrobarFatal)));
        }
      } catch (err) {
        super.emit("igrobar:failed", err);
      }
    }
  }
  const launcher = new IgrobarLaunch();
  wireProgress(launcher, buildId);
  return launcher;
}

// ---------- Java ----------

/**
 * Какая Java нужна версии Minecraft. Скачивает её сама библиотека
 * minecraft-java-core (официальные сборки Java от Mojang, папка
 * runtime/<имя> в папке игры) — по полю javaVersion из файла версии.
 * У игрока Java может вообще не быть установлена: лаунчер всегда
 * использует свою, системная Java не нужна. Эта функция нужна только
 * чтобы написать в журнал, какая Java будет использоваться.
 */
function requiredJava(mcVersion) {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(String(mcVersion || ""));
  if (!m) return 21; // снапшоты и новые версии
  const minor = parseInt(m[1], 10);
  const patch = parseInt(m[2] || "0", 10);
  if (minor <= 16) return 8;
  if (minor === 17) return 16;
  if (minor < 20 || (minor === 20 && patch < 5)) return 17;
  return 21;
}

function javaLine(build) {
  launcherLine(build.id, `Java ${requiredJava(build.mc_version)} для Minecraft ${build.mc_version} — своя у лаунчера, скачивается автоматически при первом запуске`);
}

// ---------- сервер IGROBAR ----------

/** Перед установкой/запуском сборки сервера подтягиваем свежие параметры
 * (версия, NeoForge, адрес) с GitHub. Ждём не больше 6 секунд — без
 * интернета играем с последними известными параметрами. */
async function freshBuild(buildId) {
  const build = builds.get(buildId);
  if (!build || build.kind !== "server") return build;
  try {
    const changed = await Promise.race([builds.refreshServerProfiles(), sleep(6000).then(() => false)]);
    const fresh = builds.get(buildId);
    if (changed && fresh && builds.signature(fresh) !== builds.signature(build)) {
      launcherLine(buildId, `Сервер ${fresh.name} перешёл на Minecraft ${fresh.mc_version}, ${fresh.loader_type} ${fresh.loader_version} — сборка обновится`);
    }
    return fresh || build;
  } catch (err) {
    return build;
  }
}

function addServerToList(build) {
  try {
    const res = serverList.ensure(build);
    if (res.changed) launcherLine(build.id, `Сервер ${res.address} добавлен в «Сетевую игру»`);
  } catch (err) {
    launcherLine(build.id, `Не удалось добавить сервер в список: ${errorText(err)}`);
  }
}

// ---------- установка ----------

function placeholderAuth() {
  // Для загрузки файлов аккаунт не нужен — подставляем технический офлайн.
  return {
    access_token: "0",
    client_token: "0",
    uuid: "00000000000000000000000000000000",
    name: "Player",
    user_properties: "{}",
    meta: { online: false, type: "legacy" },
  };
}

function installFiles(build) {
  const launcher = makeLauncher("install", build.id);
  return new Promise((resolve, reject) => {
    launcher.on("igrobar:installed", resolve);
    launcher.on("igrobar:failed", (err) => reject(err instanceof Error ? err : new Error(errorText(err))));
    launcher.Launch(baseOptions(build, placeholderAuth())).catch(reject);
  });
}

async function syncModpackFor(build, { strict }) {
  if (!builds.isModpackCapable(build)) return;
  if (!builds.modpackEnabled(build)) {
    launcherLine(build.id, "Автообновление модпака выключено в настройках");
    return;
  }
  try {
    const result = await modpack.sync(build.id, { onProgress: (p, t) => setProgress(build.id, p, t) });
    if (result.updated && result.reason === "missing") {
      launcherLine(build.id, `Не хватало файлов модпака (${result.restored}) — модпак поставлен заново`);
    } else if (result.updated) {
      launcherLine(build.id, `Модпак обновлён до ${result.release}: ${result.added} файлов`);
    } else if (!result.skipped) launcherLine(build.id, "Модпак актуален");
  } catch (err) {
    // Без полного модпака на сервер не зайти — игру не запускаем.
    // Если все файлы на месте и не получилось только проверить обновление
    // (например, нет интернета) — можно играть с текущими модами.
    if (strict || !modpack.isComplete(build)) {
      throw new Error(`Модпак сервера не установлен: ${errorText(err)}. Проверьте интернет и нажмите ещё раз — без модпака игра не запустится`);
    }
    launcherLine(build.id, `Не удалось проверить обновление модпака: ${errorText(err)} — запускаю с текущими модами`);
  }
}

async function install(buildId) {
  if (!builds.get(buildId)) throw new Error("Сборка не найдена");
  const s = session(buildId);
  if (s.status !== "idle") throw new Error("Сборка уже устанавливается или запущена");
  setStatus(buildId, "installing", { percent: 0, text: "Подготовка…" });
  const build = await freshBuild(buildId);
  launcherLine(buildId, `Установка ${build.name}: Minecraft ${build.mc_version}${build.loader_type !== "vanilla" ? `, ${build.loader_type} ${versions.loaderLabel(build)}` : ""}`);
  javaLine(build);
  try {
    await installFiles(build);
    await syncModpackFor(build, { strict: true });
    addServerToList(build);
    await skinMod.prepare(build, accounts.selected(), (line) => launcherLine(buildId, line));
    builds.markInstalled(buildId);
    launcherLine(buildId, "Установка завершена");
    setStatus(buildId, "idle");
    return builds.get(buildId);
  } catch (err) {
    launcherLine(buildId, `Ошибка установки: ${errorText(err)}`);
    setStatus(buildId, "idle");
    throw new Error(errorText(err));
  }
}

// ---------- запуск ----------

let windowHooks = { onGameStart: () => {}, onAllGamesClosed: () => {} };

function setWindowHooks(hooks) {
  windowHooks = { ...windowHooks, ...hooks };
}

function anyRunning() {
  return [...sessions.values()].some((s) => s.status === "running");
}

async function launch(buildId) {
  let build = builds.get(buildId);
  if (!build) throw new Error("Сборка не найдена");
  const s = session(buildId);
  if (s.status !== "idle") throw new Error(s.status === "running" ? "Эта сборка уже запущена" : "Сборка сейчас устанавливается");

  s.lines = [];
  s.exitCode = null;
  openLogFile(buildId);
  broadcast("game:log-reset", { buildId });
  setStatus(buildId, "preparing", { percent: 0, text: "Подготовка…" });

  try {
    const auth = await accounts.launchAuth((line) => launcherLine(buildId, line));
    launcherLine(buildId, `Аккаунт: ${auth.account.name} (${auth.account.type})`);

    build = await freshBuild(buildId);
    if (!build.installed) javaLine(build);
    await syncModpackFor(build, { strict: false });
    addServerToList(build);
    await skinMod.prepare(build, auth.account, (line) => launcherLine(buildId, line));

    const options = baseOptions(build, auth.authenticator, auth.jvmArgs);
    const expectedCwd = normalizeDir(path.join(options.path, "instances", options.instance));
    const launcher = makeLauncher("launch", buildId);

    setStatus(buildId, "installing", { percent: 0, text: "Проверка файлов игры…" });

    await new Promise((resolve, reject) => {
      let started = false;
      const watcher = (child, args) => {
        const opts = args[2] || {};
        if (started || normalizeDir(opts.cwd) !== expectedCwd) return;
        started = true;
        launcher.igrobarSpawned = true;
        spawnWatchers.delete(watcher);
        s.child = child;
        child.on("exit", (code) => {
          s.exitCode = code;
        });
        builds.markInstalled(buildId);
        builds.update(buildId, { last_played: Date.now() });
        setStatus(buildId, "running");
        launcherLine(buildId, "Игра запущена");
        windowHooks.onGameStart(buildId);
        resolve();
      };
      spawnWatchers.add(watcher);

      launcher.on("data", (chunk) => pushLines(buildId, chunk));
      launcher.on("close", (code) => {
        const exitCode = typeof code === "number" ? code : s.exitCode;
        s.exitCode = exitCode;
        s.child = null;
        pushLines(buildId, tr(`--- Игра завершилась с кодом ${exitCode ?? "?"} ---`));
        if (s.logStream) {
          s.logStream.end();
          s.logStream = null;
        }
        setStatus(buildId, "idle");
        broadcast("game:exited", { buildId, exitCode, crashed: exitCode !== 0 && exitCode !== null });
        if (!anyRunning()) windowHooks.onAllGamesClosed();
      });
      launcher.on("igrobar:failed", (err) => {
        spawnWatchers.delete(watcher);
        if (!started) reject(err instanceof Error ? err : new Error(errorText(err)));
        else launcherLine(buildId, `Ошибка: ${errorText(err)}`);
      });
      launcher.Launch(options).catch((err) => {
        spawnWatchers.delete(watcher);
        reject(err);
      });
    });
    return publicState(buildId);
  } catch (err) {
    launcherLine(buildId, `Не удалось запустить: ${errorText(err)}`);
    if (s.logStream) {
      s.logStream.end();
      s.logStream = null;
    }
    setStatus(buildId, "idle");
    const error = new Error(errorText(err));
    error.code = err && err.code;
    throw error;
  }
}

function stop(buildId) {
  const s = session(buildId);
  if (!s.child) return false;
  const pid = s.child.pid;
  launcherLine(buildId, "Остановка игры…");
  if (process.platform === "win32" && pid) {
    // Завершаем дерево процессов: java может порождать дочерние.
    childProcess.execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    s.child.kill("SIGTERM");
  }
  return true;
}

function logs(buildId) {
  return session(buildId).lines;
}

function clearLogs(buildId) {
  session(buildId).lines = [];
  broadcast("game:log-reset", { buildId });
  return true;
}

function report(buildId) {
  const build = builds.get(buildId);
  const s = session(buildId);
  const total = Math.round(os.totalmem() / 1024 / 1024);
  const head = [
    "=== Отчёт Igrobar Launcher ===",
    `Лаунчер: ${app.getVersion()}`,
    `Система: ${os.type()} ${os.release()} (${os.arch()}), ОЗУ ${total} МБ`,
    build ? `Сборка: ${build.name} — Minecraft ${build.mc_version}, ${build.loader_type} ${versions.loaderLabel(build)}` : "",
    build ? `Память для игры: ${build.ram_mb || settings.get().ram_mb} МБ` : "",
    `Код выхода: ${s.exitCode ?? "—"}`,
    "",
    "=== Последние строки журнала ===",
  ].filter((l) => l !== null);
  const tail = s.lines.slice(-400).map((l) => l.text);
  return [...head, ...tail].join("\n");
}

function isBusy() {
  return [...sessions.values()].some((s) => s.status !== "idle");
}

module.exports = { install, launch, stop, logs, clearLogs, report, allStates, publicState, setWindowHooks, anyRunning, isBusy };
