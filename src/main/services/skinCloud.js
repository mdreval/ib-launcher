/**
 * Общий сервер скинов IGROBAR (Cloudflare Worker «igrobar-skins»).
 *
 * Зачем: скин, выбранный в лаунчере (нарисованный в редакторе, загруженный
 * файлом, скачанный с Ely.by или лицензионный), лежит только на компьютере
 * игрока — другие его не видят. Поэтому лаунчер загружает текущий скин и
 * плащ игрока на общий сервер, а CustomSkinLoader у всех игроков берёт
 * скины оттуда по нику (источник «Igrobar», сразу после LocalSkin).
 *
 * Защита ника: сервер запоминает, кто первым загрузил скин для ника, и
 * дальше принимает изменения только с тем же ключом. Ключ создаётся один раз
 * на установку лаунчера и лежит в data\skin-cloud.json. Если игрок потерял
 * ключ (переустановил лаунчер) — админ сбрасывает ник своим ADMIN_KEY.
 *
 * Выключается настройкой skin_cloud: false в settings.json.
 */

const crypto = require("crypto");
const path = require("path");

const paths = require("../paths");
const settings = require("./settings");
const skins = require("./skins");
const { request, fetchJson, fetchBuffer } = require("../core/http");
const { readJson, writeJson } = require("../core/jsonFile");

const DEFAULT_URL = "https://igrobar-skins.dreval-max.workers.dev";
const STATE_FILE = path.join(paths.LAUNCHER_DIR, "skin-cloud.json");

function baseUrl() {
  const custom = String(settings.get().skin_cloud_url || "").trim();
  return (custom || DEFAULT_URL).replace(/\/+$/, "");
}

function enabled() {
  return settings.get().skin_cloud !== false;
}

/** Корень для CustomSkinLoader (формат CustomSkinAPI): <url>/<ник>.json, <url>/textures/<hash>. */
function cslRoot() {
  return `${baseUrl()}/`;
}

function state() {
  const s = readJson(STATE_FILE, {});
  if (!s.key || String(s.key).length < 32) {
    s.key = crypto.randomBytes(32).toString("hex");
    s.uploaded = {};
    writeJson(STATE_FILE, s);
  }
  if (!s.uploaded || typeof s.uploaded !== "object") s.uploaded = {};
  return s;
}

const toModel = (model) => (model === "slim" ? "slim" : "default");

/**
 * Скин и плащ, которые игрок сейчас видит у себя в лаунчере:
 *  - офлайн-профиль — выбранный в лаунчере (если выбран);
 *  - Ely.by — выбранный в лаунчере, а если не выбирал — текущий с Ely.by;
 *  - Microsoft — лицензионный (лаунчер сохраняет его при входе и загрузке).
 * Возвращает { skin: Buffer|null, model: "default"|"slim", cape: Buffer|null }.
 */
async function currentTextures(account) {
  let skin = null;
  let model = "default";
  const stored = skins.get(account.id);

  if (account.type === "ely" && !(stored && stored.custom && stored.source === "custom")) {
    try {
      const textures = await fetchJson(`https://skinsystem.ely.by/textures/${encodeURIComponent(account.name)}`, { timeout: 8000 });
      if (textures && textures.SKIN && textures.SKIN.url) {
        const buf = await fetchBuffer(textures.SKIN.url.replace(/^http:/, "https:"), { timeout: 8000 });
        skins.validatePng(buf);
        skin = buf;
        model = toModel(textures.SKIN.metadata && textures.SKIN.metadata.model);
      }
    } catch (err) {
      skin = null; // нет скина на Ely.by или нет сети — возьмём сохранённый в лаунчере
    }
  }
  if (!skin && stored && stored.custom) {
    skin = skins.dataUrlToBuffer(stored.dataUrl);
    model = toModel(stored.model);
  }

  const capeEntry = settings.get().cape_enabled !== false ? skins.getCape(account.id) : null;
  const cape = capeEntry ? skins.dataUrlToBuffer(capeEntry.dataUrl) : null;
  return { skin, model, cape };
}

function fingerprint(t) {
  const h = crypto.createHash("sha256");
  h.update(t.skin || Buffer.alloc(0));
  h.update(`|${t.model}|`);
  h.update(t.cape || Buffer.alloc(0));
  return h.digest("hex");
}

/**
 * Загружает текущий скин/плащ игрока на общий сервер (если изменились с
 * прошлой загрузки). Ошибки не мешают запуску игры — только пишутся в лог.
 */
async function sync(account, log, { force = false, textures = null } = {}) {
  if (!enabled() || !account || !account.name) return false;
  if (!textures) textures = await currentTextures(account);
  const s = state();
  const nick = account.name.toLowerCase();
  const fp = fingerprint(textures);
  if (!force && s.uploaded[nick] === fp) return false;

  const body = JSON.stringify({
    skin: textures.skin ? textures.skin.toString("base64") : null,
    model: textures.model,
    cape: textures.cape ? textures.cape.toString("base64") : null,
  });
  const res = await request(`${baseUrl()}/api/skin/${encodeURIComponent(account.name)}`, {
    method: "PUT",
    body,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.key}` },
    timeout: 15000,
    allowError: true,
  });
  if (res.status === 403) {
    if (log) log(`Скин не загружен на сервер IGROBAR: ник ${account.name} уже занят другим игроком. Если это ваш ник — напишите админу`);
    return false;
  }
  if (!res.ok) {
    let msg = "";
    try {
      msg = (await res.json()).error || "";
    } catch (err) {
      msg = "";
    }
    throw new Error(`сервер скинов ответил ${res.status}${msg ? `: ${msg}` : ""}`);
  }
  const fresh = state();
  fresh.uploaded[nick] = fp;
  writeJson(STATE_FILE, fresh);
  if (log) log(textures.skin || textures.cape ? "Скин загружен на сервер IGROBAR — его видят все игроки лаунчера" : "Скин убран с сервера IGROBAR");
  return true;
}

/** То же, но в фоне и без ошибок — для кнопок «сохранить скин/плащ». */
function syncInBackground(account) {
  if (!account) return;
  sync(account, null).catch(() => {
    /* не критично: загрузится при следующем запуске игры */
  });
}

module.exports = { baseUrl, cslRoot, enabled, currentTextures, sync, syncInBackground };
