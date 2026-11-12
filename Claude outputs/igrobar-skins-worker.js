/**
 * Igrobar Skins — сервер скинов для Igrobar Launcher (Cloudflare Worker).
 *
 * Лаунчер загружает сюда скин и плащ игрока, а CustomSkinLoader в игре
 * берёт их отсюда по нику — так все игроки лаунчера видят скины друг друга.
 *
 * Нужно в настройках Worker'а:
 *   - Binding  KV namespace, имя переменной: SKINS
 *   - Secret   ADMIN_KEY — длинный секретный ключ админа (сброс ников)
 *
 * Для игры (формат CustomSkinAPI, источник в CustomSkinLoader.json):
 *   GET  /<ник>.json              — профиль: { username, skins: { default|slim: hash }, cape: hash }
 *   GET  /textures/<hash>         — сама картинка (PNG)
 * Для просмотра в браузере:
 *   GET  /skins/<ник>.png, /capes/<ник>.png
 * Для лаунчера:
 *   PUT    /api/skin/<ник>        — загрузить скин/плащ. Тело JSON:
 *            { "skin": "<base64 png>" | null, "model": "default" | "slim", "cape": "<base64 png>" | null }
 *          Заголовок: Authorization: Bearer <ключ игрока>.
 *          Первый, кто загрузил скин для ника, становится его владельцем:
 *          дальше менять скин этого ника можно только с тем же ключом.
 *   DELETE /api/skin/<ник>        — удалить скин (владелец или админ).
 *          Админ с ?reset_owner=1 — ещё и «освобождает» ник (игрок потерял ключ).
 */

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const MAX_PNG_BYTES = 512 * 1024;
const MAX_SIDE = 1024;
const MIN_PLAYER_KEY = 32;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// ---------- помощники ----------

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function fail(status, message) {
  return json({ error: message }, status, { "Cache-Control": "no-store" });
}

function png(bytes, cacheControl) {
  return new Response(bytes, {
    headers: { "Content-Type": "image/png", "Cache-Control": cacheControl, ...CORS },
  });
}

async function sha256Hex(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64ToBytes(value) {
  const clean = String(value).replace(/^data:image\/png;base64,/, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Проверяет, что это PNG разумного размера; для скина — пропорции 1:1 или 2:1. */
function checkPng(bytes, kind) {
  if (bytes.length < 33 || bytes.length > MAX_PNG_BYTES) throw new Error(`${kind}: неверный размер файла`);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error(`${kind}: это не PNG`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw new Error(`${kind}: неверные размеры картинки`);
  if (kind === "skin" && !(width % 64 === 0 && (height === width || height * 2 === width))) {
    throw new Error("skin: размер должен быть 64x64 или 64x32 (или HD, кратный 64)");
  }
  if (kind === "cape" && height > width) throw new Error("cape: неверные пропорции");
}

const lower = (name) => name.toLowerCase();
const profileKey = (name) => `profile:${lower(name)}`;
const ownerKey = (name) => `owner:${lower(name)}`;
const textureKey = (hash) => `tex:${hash}`;

async function getProfile(env, name) {
  return env.SKINS.get(profileKey(name), "json");
}

/** Сохраняет картинку под её хешем (одинаковые скины хранятся один раз). */
async function saveTexture(env, bytes) {
  const hash = await sha256Hex(bytes);
  const exists = await env.SKINS.get(textureKey(hash), "arrayBuffer");
  if (!exists) await env.SKINS.put(textureKey(hash), bytes);
  return hash;
}

function bearer(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function isAdmin(env, key) {
  return Boolean(env.ADMIN_KEY && key && safeEqual(key, env.ADMIN_KEY));
}

/** Кто может менять ник: админ, владелец или первый загрузивший (ник свободен). */
async function checkOwner(env, name, key) {
  if (isAdmin(env, key)) return { ok: true, admin: true, claim: false };
  if (!key || key.length < MIN_PLAYER_KEY) return { ok: false };
  const keyHash = await sha256Hex(key);
  const owner = await env.SKINS.get(ownerKey(name));
  if (!owner) return { ok: true, admin: false, claim: true, keyHash };
  return { ok: safeEqual(owner, keyHash), admin: false, claim: false };
}

// ---------- обработчики ----------

async function handleProfileJson(env, name) {
  const profile = await getProfile(env, name);
  if (!profile || (!profile.skin && !profile.cape)) return fail(404, "Not found");
  const out = { username: profile.username || name };
  if (profile.skin) out.skins = { [profile.model === "slim" ? "slim" : "default"]: profile.skin };
  if (profile.cape) out.cape = profile.cape;
  return json(out, 200, { "Cache-Control": "public, max-age=30" });
}

async function handleTexture(env, hash) {
  const bytes = await env.SKINS.get(textureKey(hash), "arrayBuffer");
  if (!bytes) return fail(404, "Not found");
  return png(bytes, "public, max-age=31536000, immutable");
}

async function handleNamedPng(env, name, field) {
  const profile = await getProfile(env, name);
  const hash = profile && profile[field];
  if (!hash) return fail(404, "Not found");
  const bytes = await env.SKINS.get(textureKey(hash), "arrayBuffer");
  if (!bytes) return fail(404, "Not found");
  return png(bytes, "public, max-age=30");
}

async function handleUpload(env, request, name) {
  const access = await checkOwner(env, name, bearer(request));
  if (!access.ok) return fail(403, "Этот ник уже занят другим игроком (нет ключа владельца)");

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return fail(400, "Тело запроса должно быть JSON");
  }

  let skinBytes = null;
  let capeBytes = null;
  try {
    if (body.skin) {
      skinBytes = base64ToBytes(body.skin);
      checkPng(skinBytes, "skin");
    }
    if (body.cape) {
      capeBytes = base64ToBytes(body.cape);
      checkPng(capeBytes, "cape");
    }
  } catch (err) {
    return fail(400, err.message || "Неверная картинка");
  }

  if (access.claim) await env.SKINS.put(ownerKey(name), access.keyHash);

  if (!skinBytes && !capeBytes) {
    await env.SKINS.delete(profileKey(name));
    return json({ ok: true, removed: true }, 200, { "Cache-Control": "no-store" });
  }

  const profile = {
    username: name,
    skin: skinBytes ? await saveTexture(env, skinBytes) : null,
    model: body.model === "slim" ? "slim" : "default",
    cape: capeBytes ? await saveTexture(env, capeBytes) : null,
    updated: Date.now(),
  };
  await env.SKINS.put(profileKey(name), JSON.stringify(profile));
  return json({ ok: true, claimed: access.claim, skin: profile.skin, cape: profile.cape }, 200, { "Cache-Control": "no-store" });
}

async function handleDelete(env, request, name, url) {
  const key = bearer(request);
  const access = await checkOwner(env, name, key);
  if (!access.ok || access.claim) return fail(403, "Нет доступа");
  await env.SKINS.delete(profileKey(name));
  const resetOwner = access.admin && url.searchParams.get("reset_owner") === "1";
  if (resetOwner) await env.SKINS.delete(ownerKey(name));
  return json({ ok: true, owner_reset: resetOwner }, 200, { "Cache-Control": "no-store" });
}

// ---------- маршруты ----------

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (!env.SKINS) return fail(500, "Не подключено хранилище: добавьте KV binding с именем SKINS");

    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    let m;

    try {
      if (request.method === "GET") {
        if (path === "/" || path === "") return json({ name: "Igrobar Skins", ok: true });
        if ((m = /^\/textures\/([0-9a-f]{64})$/.exec(path)) && HASH_RE.test(m[1])) return handleTexture(env, m[1]);
        if ((m = /^\/skins\/([^/]+)\.png$/.exec(path)) && NAME_RE.test(m[1])) return handleNamedPng(env, m[1], "skin");
        if ((m = /^\/capes\/([^/]+)\.png$/.exec(path)) && NAME_RE.test(m[1])) return handleNamedPng(env, m[1], "cape");
        if ((m = /^\/([^/]+)\.json$/.exec(path)) && NAME_RE.test(m[1])) return handleProfileJson(env, m[1]);
        return fail(404, "Not found");
      }

      if ((m = /^\/api\/skin\/([^/]+)$/.exec(path))) {
        if (!NAME_RE.test(m[1])) return fail(400, "Неверный ник");
        if (request.method === "PUT") return handleUpload(env, request, m[1]);
        if (request.method === "DELETE") return handleDelete(env, request, m[1], url);
      }

      return fail(404, "Not found");
    } catch (err) {
      return fail(500, "Внутренняя ошибка");
    }
  },
};
