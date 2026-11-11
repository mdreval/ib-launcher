/**
 * Все пути лаунчера в одном месте.
 *
 * Две папки в %APPDATA% (macOS: ~/Library/Application Support):
 *
 *   IBLauncher\                — ИГРА. Сюда ставится Minecraft:
 *     versions\ libraries\ assets\ runtime\   общие файлы игры (одна версия
 *                                             качается один раз для всех сборок);
 *     instances\<сборка>\                     у каждой сборки свои mods,
 *                                             resourcepacks, shaderpacks, config,
 *                                             saves, screenshots, options.txt.
 *
 *   .LauncherIB\               — САМ ЛАУНЧЕР (служебные файлы Electron) и
 *     data\                      настройки, аккаунты, скины, журналы, кэш.
 *
 * Папку игры можно перенести в «Настройках».
 *
 * Почему не рядом с .exe: установщик при каждом обновлении лаунчера
 * пересоздаёт папку программы, и все сборки/миры пропали бы вместе с ней.
 *
 * Старые папки (IgrobarLauncher и «Igrobar Launcher» из версий до 2.0.0)
 * переносятся сюда автоматически при первом запуске — см. migrateOldFolders().
 */

const path = require("path");
const fs = require("fs");
const { app } = require("electron");

const APP_DATA = app.getPath("appData");

const GAME_FOLDER_NAME = "IBLauncher";
const LAUNCHER_FOLDER_NAME = ".LauncherIB";

const OLD_GAME_ROOT = path.join(APP_DATA, "IgrobarLauncher");
const OLD_USER_DATA = path.join(APP_DATA, "Igrobar Launcher");

let DATA_ROOT = path.join(APP_DATA, GAME_FOLDER_NAME);
const USER_DATA = path.join(APP_DATA, LAUNCHER_FOLDER_NAME);
const LAUNCHER_DIR = path.join(USER_DATA, "data");

function tryRename(from, to) {
  try {
    fs.renameSync(from, to);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Перенос из старых папок. Вызывается до любой работы с файлами:
 *  1) «Igrobar Launcher» (служебные файлы Electron, в т.ч. ключ шифрования
 *     аккаунтов) → .LauncherIB;
 *  2) IgrobarLauncher\launcher (настройки, аккаунты, скины) → .LauncherIB\data;
 *  3) IgrobarLauncher (игра) → IBLauncher.
 * Если что-то занято и не переносится, лаунчер продолжает работать со
 * старой папкой игры — ничего не теряется.
 */
function migrateOldFolders() {
  const result = { moved: [], gameRootFallback: false };

  if (fs.existsSync(OLD_USER_DATA) && !fs.existsSync(USER_DATA)) {
    if (tryRename(OLD_USER_DATA, USER_DATA)) result.moved.push("userData");
    else {
      // Хотя бы ключ шифрования, иначе сохранённые аккаунты не расшифруются.
      try {
        fs.mkdirSync(USER_DATA, { recursive: true });
        fs.copyFileSync(path.join(OLD_USER_DATA, "Local State"), path.join(USER_DATA, "Local State"));
      } catch (err) {
        /* нет файла — ничего страшного */
      }
    }
  }

  const oldLauncherDir = path.join(OLD_GAME_ROOT, "launcher");
  if (fs.existsSync(oldLauncherDir) && !fs.existsSync(LAUNCHER_DIR)) {
    fs.mkdirSync(USER_DATA, { recursive: true });
    if (tryRename(oldLauncherDir, LAUNCHER_DIR)) result.moved.push("launcher");
  }

  if (fs.existsSync(OLD_GAME_ROOT) && !fs.existsSync(DATA_ROOT)) {
    if (tryRename(OLD_GAME_ROOT, DATA_ROOT)) result.moved.push("game");
    else {
      DATA_ROOT = OLD_GAME_ROOT;
      result.gameRootFallback = true;
    }
  }
  return result;
}

const MIGRATION = migrateOldFolders();

// Служебные файлы Electron (кэш, cookies каталога скинов, ключ шифрования) —
// тоже в .LauncherIB, а не в «%APPDATA%\Igrobar Launcher».
app.setPath("userData", USER_DATA);

const SETTINGS_FILE = path.join(LAUNCHER_DIR, "settings.json");
const BUILDS_FILE = path.join(LAUNCHER_DIR, "builds.json");
const ACCOUNTS_FILE = path.join(LAUNCHER_DIR, "accounts.dat");
const SKINS_DIR = path.join(LAUNCHER_DIR, "skins");
const LOGS_DIR = path.join(LAUNCHER_DIR, "logs");
const GAME_LOGS_DIR = path.join(LOGS_DIR, "game");
const CACHE_DIR = path.join(LAUNCHER_DIR, "cache");
const LAUNCHER_LOG_FILE = path.join(LOGS_DIR, "launcher.log");

const DEFAULT_GAME_DIR = DATA_ROOT;

// Ресурсы, которые лежат внутри приложения (иконки, скин по умолчанию, данные).
const APP_ROOT = path.join(__dirname, "..", "..");

function ensureDirs() {
  for (const dir of [DATA_ROOT, USER_DATA, LAUNCHER_DIR, SKINS_DIR, LOGS_DIR, GAME_LOGS_DIR, CACHE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function appResource(...segments) {
  return path.join(APP_ROOT, ...segments);
}

/** Если в настройках папкой игры была явно указана старая IgrobarLauncher —
 * после переноса её больше нет, используем папку по умолчанию. */
function fixGameDir(gameDir) {
  if (!gameDir) return gameDir;
  const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  if (same(gameDir, OLD_GAME_ROOT) && !fs.existsSync(OLD_GAME_ROOT)) return null;
  return gameDir;
}

module.exports = {
  DATA_ROOT,
  USER_DATA,
  LAUNCHER_DIR,
  SETTINGS_FILE,
  BUILDS_FILE,
  ACCOUNTS_FILE,
  SKINS_DIR,
  LOGS_DIR,
  GAME_LOGS_DIR,
  CACHE_DIR,
  LAUNCHER_LOG_FILE,
  DEFAULT_GAME_DIR,
  APP_ROOT,
  MIGRATION,
  ensureDirs,
  appResource,
  fixGameDir,
};
