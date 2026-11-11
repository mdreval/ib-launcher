/**
 * Скины офлайн-профилей БЕЗ модов — так же, как в Rich Launcher и HMCL.
 *
 * Как это работает:
 *  1. Лаунчер поднимает у себя крошечный сервер скинов на 127.0.0.1 (только
 *     для этого компьютера) — он отвечает так же, как серверы Mojang
 *     (протокол Yggdrasil): «у игрока с таким UUID вот такой скин».
 *  2. Игра запускается с authlib-injector (-javaagent), который перенаправляет
 *     запросы игры к Mojang на этот сервер.
 *  3. Игра спрашивает «какой скин у меня?» — получает скин из лаунчера.
 *     Работает в любой версии (1.7.10 — 1.21+), в одиночной игре и на
 *     серверах, без модов и даже в ванильных сборках.
 *
 * Ответы подписываются своим ключом RSA (его открытая часть передаётся
 * authlib-injector), поэтому игра принимает скин как «настоящий».
 *
 * Про всех остальных (кого нет среди офлайн-профилей лаунчера) сервер
 * спрашивает настоящий Mojang — скины лицензионных ников продолжают работать.
 *
 * Сервер живёт, пока открыт лаунчер (лаунчер прячется в трей на время игры).
 * Выключается настройкой skin_server: false.
 */

const http = require("http");
const crypto = require("crypto");

const skins = require("./skins");
const { USER_AGENT } = require("../core/http");

let server = null;
let port = 0;
let keys = null;
const textures = new Map(); // hash -> Buffer (png)
let profilesProvider = () => [];

/** Список офлайн-профилей: [{ id, name, uuid }] — задаёт accounts.js. */
function setProfilesProvider(fn) {
  profilesProvider = fn;
}

function keyPair() {
  if (!keys) keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return keys;
}

function publicKeyPem() {
  return keyPair().publicKey.export({ type: "spki", format: "pem" }).toString();
}

function sign(value) {
  return crypto.sign("sha1", Buffer.from(value), keyPair().privateKey).toString("base64");
}

function baseUrl() {
  return `http://127.0.0.1:${port}`;
}

function metadata() {
  return {
    meta: {
      serverName: "Igrobar Launcher",
      implementationName: "igrobar-local-skins",
      implementationVersion: "1",
      "feature.non_email_login": true,
      "feature.no_mojang_namespace": false,
    },
    skinDomains: ["127.0.0.1", "localhost"],
    signaturePublickey: publicKeyPem(),
  };
}

const plainUuid = (u) => String(u || "").replace(/-/g, "").toLowerCase();

function known() {
  return (profilesProvider() || []).map((p) => ({ ...p, uuid: plainUuid(p.uuid) }));
}

function byUuid(uuid) {
  const id = plainUuid(uuid);
  return known().find((p) => p.uuid === id) || null;
}

function byName(name) {
  const n = String(name || "").toLowerCase();
  return known().find((p) => String(p.name).toLowerCase() === n) || null;
}

function texturesFor(profile) {
  const skin = skins.get(profile.id);
  const out = {};
  if (skin && skin.custom) {
    const png = skins.dataUrlToBuffer(skin.dataUrl);
    const hash = crypto.createHash("sha256").update(png).digest("hex");
    textures.set(hash, png);
    out.SKIN = { url: `${baseUrl()}/textures/${hash}` };
    if (skin.model === "slim") out.SKIN.metadata = { model: "slim" };
  }
  return out;
}

function profileJson(profile, signed = true) {
  const value = Buffer.from(
    JSON.stringify({
      timestamp: Date.now(),
      profileId: profile.uuid,
      profileName: profile.name,
      textures: texturesFor(profile),
    })
  ).toString("base64");
  const prop = { name: "textures", value };
  if (signed) prop.signature = sign(value);
  return { id: profile.uuid, name: profile.name, properties: [prop] };
}

// ---------- запросы к настоящему Mojang для остальных игроков ----------

async function proxy(res, url, init = {}) {
  try {
    const r = await fetch(url, { ...init, headers: { "User-Agent": USER_AGENT, ...(init.headers || {}) }, signal: AbortSignal.timeout(8000) });
    const body = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json" });
    res.end(body);
  } catch (err) {
    res.writeHead(204);
    res.end();
  }
}

// ---------- HTTP ----------

function send(res, status, data) {
  if (data === undefined) {
    res.writeHead(status);
    return res.end();
  }
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolve(""));
  });
}

async function handle(req, res) {
  const url = new URL(req.url, baseUrl());
  const p = url.pathname.replace(/\/+$/, "") || "/";
  let m;

  if (req.method === "GET" && p === "/") return send(res, 200, metadata());

  // профиль по UUID (игра спрашивает свой скин и скины других игроков)
  if (req.method === "GET" && (m = /^\/sessionserver\/session\/minecraft\/profile\/([0-9a-fA-F-]{32,36})$/.exec(p))) {
    const profile = byUuid(m[1]);
    if (profile) return send(res, 200, profileJson(profile, url.searchParams.get("unsigned") !== "true"));
    return proxy(res, `https://sessionserver.mojang.com/session/minecraft/profile/${plainUuid(m[1])}?unsigned=${url.searchParams.get("unsigned") || "true"}`);
  }

  // UUID по нику
  if (req.method === "GET" && (m = /^\/api\/users\/profiles\/minecraft\/([^/]+)$/.exec(p))) {
    const profile = byName(decodeURIComponent(m[1]));
    if (profile) return send(res, 200, { id: profile.uuid, name: profile.name });
    return proxy(res, `https://api.mojang.com/users/profiles/minecraft/${m[1]}`);
  }
  if (req.method === "POST" && (p === "/api/profiles/minecraft" || p === "/api/minecraft/profile/lookup/bulk/byname")) {
    let names = [];
    try {
      names = JSON.parse(await readBody(req));
    } catch (err) {
      names = [];
    }
    const out = [];
    for (const n of Array.isArray(names) ? names : []) {
      const profile = byName(n);
      if (profile) out.push({ id: profile.uuid, name: profile.name });
    }
    return send(res, 200, out);
  }

  // вход на сервер: на офлайн-серверах не используется, просто отвечаем «ок»
  if (req.method === "POST" && p === "/sessionserver/session/minecraft/join") {
    await readBody(req);
    return send(res, 204);
  }
  if (req.method === "GET" && p === "/sessionserver/session/minecraft/hasJoined") {
    const profile = byName(url.searchParams.get("username"));
    return profile ? send(res, 200, profileJson(profile)) : send(res, 204);
  }

  // сами картинки скинов
  if (req.method === "GET" && (m = /^\/textures\/([0-9a-f]{64})$/.exec(p))) {
    const png = textures.get(m[1]);
    if (!png) return send(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length });
    return res.end(png);
  }

  // новые версии игры спрашивают «можно ли играть по сети» — разрешаем всё
  if (p === "/minecraftservices/player/attributes") {
    return send(res, 200, {
      privileges: {
        onlineChat: { enabled: true },
        multiplayerServer: { enabled: true },
        multiplayerRealms: { enabled: false },
        telemetry: { enabled: false },
        optionalTelemetry: { enabled: false },
      },
      profanityFilterPreferences: { profanityFilterOn: false },
      banStatus: { bannedScopes: {} },
    });
  }
  if (p === "/minecraftservices/privacy/blocklist") return send(res, 200, { blockedProfiles: [] });

  return send(res, 404, { error: "Not found", errorMessage: "Not found" });
}

function start() {
  if (server) return Promise.resolve(baseUrl());
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      handle(req, res).catch(() => send(res, 500, { error: "Internal" }));
    });
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      server = s;
      port = s.address().port;
      resolve(baseUrl());
    });
  });
}

/** JVM-аргументы для запуска игры с локальным сервером скинов. */
async function jvmArgs(injectorJar) {
  const url = await start();
  const prefetched = Buffer.from(JSON.stringify(metadata())).toString("base64");
  return [
    `-javaagent:${injectorJar}=${url}/`,
    "-Dauthlibinjector.side=client",
    `-Dauthlibinjector.yggdrasil.prefetched=${prefetched}`,
    "-Dauthlibinjector.noShowServerName",
  ];
}

function stop() {
  if (server) server.close();
  server = null;
}

module.exports = { start, stop, jvmArgs, setProfilesProvider, baseUrl };
