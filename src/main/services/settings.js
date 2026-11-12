/**
 * Настройки лаунчера (вкладка «Настройки»).
 *
 * modpack[buildId] — та самая галочка «Обновлять модпак с GitHub». Она
 * учитывается только для сборок, совпадающих с профилем сервера IGROBAR
 * (1.21.1 + NeoForge 21.1.265) — см. builds.isModpackCapable(). Для
 * официальной сборки IGROBAR по умолчанию включена, чтобы после установки
 * лаунчера всё работало сразу без настроек.
 */

const os = require("os");
const paths = require("../paths");
const { readJson, writeJson } = require("../core/jsonFile");

function defaultRam() {
  const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
  const quarter = Math.round((totalMb * 0.25) / 512) * 512;
  return Math.max(2048, Math.min(8192, quarter));
}

function defaults() {
  return {
    ram_mb: defaultRam(),
    game_dir: null,
    hide_on_launch: true,
    jvm_args: "",
    selected_build: "igrobar",
    modpack: {},
    account_builds: {},
    language: null,
    check_launcher_updates: true,
    // Оформление: theme — "green" (лес) или "red" (IGROBAR); background —
    // "theme" (картинка темы) или "custom" (своя картинка); bg_dim — сила
    // затемнения своей картинки 0..1.
    theme: "green",
    accent_color: "#7de6b8", // для theme: "custom"
    logo: "auto", // логотип: auto (по теме), green, red, neutral (серый, на светлом — чёрный)
    background: "theme",
    bg_dim: 0.7,
    // Друзья: ники; когда кто-то из них заходит на сервер — уведомление.
    friends: [],
    friend_notifications: true,
    // «Сразу на сервер»: сборка сервера после загрузки игры сама подключается.
    auto_connect: true,
    // Фон: живые эффекты (искры/светлячки), сезонные (снег, Хэллоуин…).
    live_effects: true,
    live_effect: "auto", // вариант живого фона: auto (по теме), fireflies, embers, glow, stars, rain, snow, petals, leaves, bubbles
    seasonal_effects: true,
    // Музыка в лаунчере: source — "ambient" (встроенная) или "custom" (свои файлы).
    music_enabled: false,
    music_volume: 0.35,
    music_source: "ambient",
    // Статус «Играет на IGROBAR» в Discord.
    discord_rpc: true,
    // Модпак обновляется в фоне, пока лаунчер открыт.
    silent_modpack: true,
    // Плащ показывается в игре (если выбран).
    cape_enabled: true,
    skin_mod: true,
    skin_server: true,
    // Общий сервер скинов IGROBAR: лаунчер загружает туда скин игрока,
    // CustomSkinLoader у всех берёт скины оттуда (services/skinCloud.js).
    skin_cloud: true,
    skin_cloud_url: "",
  };
}

let cache = null;

function get() {
  if (!cache) {
    const stored = readJson(paths.SETTINGS_FILE, {});
    cache = { ...defaults(), ...stored, modpack: { ...(stored.modpack || {}) }, account_builds: { ...(stored.account_builds || {}) } };
  }
  return cache;
}

function update(patch) {
  const current = get();
  const next = { ...current, ...patch };
  if (patch.modpack) next.modpack = { ...current.modpack, ...patch.modpack };
  if (patch.account_builds) next.account_builds = { ...(current.account_builds || {}), ...patch.account_builds };
  if (typeof next.ram_mb !== "number" || !Number.isFinite(next.ram_mb)) next.ram_mb = current.ram_mb;
  next.ram_mb = Math.max(1024, Math.round(next.ram_mb));
  if (next.game_dir === "") next.game_dir = null;
  if (!["green", "red", "custom"].includes(next.theme)) next.theme = "green";
  if (!/^#[0-9a-f]{6}$/i.test(String(next.accent_color || ""))) next.accent_color = "#7de6b8";
  if (!["auto", "green", "red", "neutral"].includes(next.logo)) next.logo = "auto";
  if (!["theme", "custom"].includes(next.background)) next.background = "theme";
  next.bg_dim = Math.max(0, Math.min(1, Number(next.bg_dim) || 0));
  next.friends = Array.isArray(next.friends)
    ? [...new Set(next.friends.map((f) => String(f).trim()).filter((f) => /^[A-Za-z0-9_]{2,16}$/.test(f)))].slice(0, 100)
    : [];
  next.music_volume = Math.max(0, Math.min(1, Number(next.music_volume) || 0));
  if (!["ambient", "custom"].includes(next.music_source)) next.music_source = "ambient";
  if (!["auto", "fireflies", "embers", "glow", "stars", "rain", "snow", "petals", "leaves", "bubbles"].includes(next.live_effect)) next.live_effect = "auto";
  cache = next;
  writeJson(paths.SETTINGS_FILE, cache);
  return cache;
}

function reset() {
  const { selected_build, account_builds, language } = get();
  cache = { ...defaults(), selected_build, account_builds, language };
  writeJson(paths.SETTINGS_FILE, cache);
  return cache;
}

function gameDir() {
  return paths.fixGameDir(get().game_dir) || paths.DEFAULT_GAME_DIR;
}

function totalRamMb() {
  return Math.floor(os.totalmem() / 1024 / 1024);
}

module.exports = { get, update, reset, gameDir, totalRamMb, defaultRam };
