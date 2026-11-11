/**
 * Аккаунты — как в Rich: несколько профилей, один выбранный.
 *   offline   — ник без пароля (работает на серверах без проверки лицензии);
 *   microsoft — лицензия, вход через окно Microsoft (библиотека minecraft-java-core);
 *   ely       — аккаунт Ely.by (свои скины без лицензии).
 *
 * Токены хранятся в launcher\accounts.dat, зашифрованными средствами Windows
 * (Electron safeStorage), если шифрование доступно.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { safeStorage } = require("electron");

const paths = require("../paths");
const skins = require("./skins");
const settings = require("./settings");
const skinServer = require("./skinServer");
const { request, fetchJson, fetchBuffer, downloadFile, USER_AGENT } = require("../core/http");

const ELY_AUTH = "https://authserver.ely.by";
const NAME_RE = /^[A-Za-z0-9_]{4,16}$/;

class AccountError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------- хранилище ----------

function readStore() {
  try {
    const raw = fs.readFileSync(paths.ACCOUNTS_FILE);
    if (raw.subarray(0, 4).toString() === "ENC1") {
      return JSON.parse(safeStorage.decryptString(raw.subarray(4)));
    }
    return JSON.parse(raw.toString("utf-8"));
  } catch (err) {
    return { selected: null, accounts: [] };
  }
}

function writeStore(store) {
  const json = JSON.stringify(store);
  let data;
  try {
    data = safeStorage.isEncryptionAvailable()
      ? Buffer.concat([Buffer.from("ENC1"), safeStorage.encryptString(json)])
      : Buffer.from(json, "utf-8");
  } catch (err) {
    data = Buffer.from(json, "utf-8");
  }
  fs.mkdirSync(path.dirname(paths.ACCOUNTS_FILE), { recursive: true });
  const tmp = `${paths.ACCOUNTS_FILE}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, paths.ACCOUNTS_FILE);
}

function publicView(account, selectedId) {
  return {
    id: account.id,
    type: account.type,
    name: account.name,
    uuid: account.uuid,
    selected: account.id === selectedId,
  };
}

function list() {
  const store = readStore();
  return store.accounts.map((a) => publicView(a, store.selected));
}

function selected() {
  const store = readStore();
  return store.accounts.find((a) => a.id === store.selected) || store.accounts[0] || null;
}

function upsert(account, { select = true } = {}) {
  const store = readStore();
  const idx = store.accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) store.accounts[idx] = account;
  else store.accounts.push(account);
  if (select || !store.selected) store.selected = account.id;
  writeStore(store);
  return publicView(account, store.selected);
}

function select(id) {
  const store = readStore();
  if (!store.accounts.some((a) => a.id === id)) throw new Error("Аккаунт не найден");
  store.selected = id;
  writeStore(store);
  return list();
}

function remove(id) {
  const store = readStore();
  store.accounts = store.accounts.filter((a) => a.id !== id);
  if (store.selected === id) store.selected = store.accounts[0] ? store.accounts[0].id : null;
  writeStore(store);
  skins.remove(id);
  return list();
}

// ---------- офлайн ----------

/** UUID как у сервера в офлайн-режиме: один и тот же для одного ника,
 * поэтому инвентарь и прогресс не теряются между запусками. */
function offlineUuid(name) {
  const hash = crypto.createHash("md5").update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return hash.toString("hex");
}

function addOffline(name) {
  const nick = String(name || "").trim();
  if (!NAME_RE.test(nick)) {
    throw new AccountError("BAD_NAME", "Ник: 4–16 символов, только латиница, цифры и «_», без пробелов");
  }
  const store = readStore();
  if (store.accounts.some((a) => a.type === "offline" && a.name.toLowerCase() === nick.toLowerCase())) {
    throw new AccountError("EXISTS", "Такой офлайн-профиль уже добавлен");
  }
  const uuid = offlineUuid(nick);
  return upsert({ id: `off-${uuid.slice(0, 12)}`, type: "offline", name: nick, uuid });
}

// ---------- Microsoft ----------

function microsoftErrorMessage(result) {
  const code = String(result.error || "");
  const xerr = String(result.XErr || "");
  if (code === "NO_MINECRAFT_ENTITLEMENTS") return "На этом аккаунте Microsoft не куплен Minecraft: Java Edition";
  if (code === "NO_MINECRAFT_ACCOUNT") return "У аккаунта ещё нет ника Minecraft — создайте его на minecraft.net";
  if (xerr === "2148916233") return "У этого аккаунта нет профиля Xbox — создайте его на xbox.com и попробуйте снова";
  if (xerr === "2148916235") return "Xbox Live недоступен в вашей стране";
  if (xerr === "2148916236" || xerr === "2148916237") return "Аккаунту нужно подтверждение возраста на xbox.com";
  if (xerr === "2148916238") return "Это детский аккаунт — его нужно добавить в семью Microsoft";
  if (result.errorType === "network") return "Нет связи с серверами Microsoft — проверьте интернет";
  return `Не удалось войти через Microsoft (${code || result.errorType || "ошибка"})`;
}

function stripProfile(auth) {
  const copy = { ...auth };
  delete copy.profile;
  return copy;
}

async function saveMicrosoftSkin(accountId, auth) {
  const list = (auth.profile && auth.profile.skins) || [];
  const active = list.find((s) => s.state === "ACTIVE") || list[0];
  if (!active) return;
  let buffer = null;
  if (active.base64 && active.base64.includes(",")) buffer = Buffer.from(active.base64.split(",")[1], "base64");
  else if (active.url) buffer = await fetchBuffer(active.url.replace(/^http:/, "https:"));
  if (buffer && buffer.length) skins.save(accountId, buffer, String(active.variant).toLowerCase() === "slim" ? "slim" : "classic", "account");
}

async function addMicrosoft() {
  const { Microsoft } = require("minecraft-java-core");
  const result = await new Microsoft("").getAuth("electron");
  if (!result) throw new AccountError("CANCELLED", "Вход отменён");
  if (result.error) throw new AccountError("MS_ERROR", microsoftErrorMessage(result));
  const id = `ms-${result.uuid}`;
  const view = upsert({ id, type: "microsoft", name: result.name, uuid: result.uuid, auth: stripProfile(result) });
  try {
    await saveMicrosoftSkin(id, result);
  } catch (err) {
    /* скин не критичен для входа */
  }
  return view;
}

async function freshMicrosoftAuth(account) {
  const { Microsoft } = require("minecraft-java-core");
  const refreshed = await new Microsoft("").refresh(account.auth);
  if (!refreshed || refreshed.error) {
    throw new AccountError("REAUTH", `Сессия Microsoft для ${account.name} устарела — войдите в аккаунт заново`);
  }
  const updated = { ...account, name: refreshed.name || account.name, auth: stripProfile(refreshed) };
  upsert(updated, { select: false });
  return updated;
}

async function uploadMicrosoftSkin(accountId, buffer, model) {
  const store = readStore();
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account || account.type !== "microsoft") return false;
  const fresh = await freshMicrosoftAuth(account);
  const form = new FormData();
  form.append("variant", model === "slim" ? "slim" : "classic");
  form.append("file", new Blob([buffer], { type: "image/png" }), "skin.png");
  const res = await fetch("https://api.minecraftservices.com/minecraft/profile/skins", {
    method: "POST",
    headers: { Authorization: `Bearer ${fresh.auth.access_token}`, "User-Agent": USER_AGENT },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Mojang не принял скин (код ${res.status})`);
  return true;
}

// ---------- Ely.by ----------

async function elyCall(endpoint, body) {
  const res = await request(`${ELY_AUTH}${endpoint}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    allowError: true,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}

async function saveElySkin(accountId, name) {
  try {
    const textures = await fetchJson(`https://skinsystem.ely.by/textures/${encodeURIComponent(name)}`);
    if (!textures || !textures.SKIN || !textures.SKIN.url) return;
    const buffer = await fetchBuffer(textures.SKIN.url.replace(/^http:/, "https:"));
    const model = textures.SKIN.metadata && textures.SKIN.metadata.model === "slim" ? "slim" : "classic";
    skins.save(accountId, buffer, model, "account");
  } catch (err) {
    /* у аккаунта может не быть скина */
  }
}

async function addEly({ login, password, totp }) {
  if (!login || !password) throw new AccountError("BAD_INPUT", "Введите логин и пароль от Ely.by");
  const clientToken = crypto.randomUUID();
  const { ok, data } = await elyCall("/auth/authenticate", {
    username: String(login).trim(),
    password: totp ? `${password}:${String(totp).trim()}` : password,
    clientToken,
    requestUser: true,
  });
  if (!ok) {
    const msg = String(data.errorMessage || "");
    if (/two factor/i.test(msg)) throw new AccountError("ELY_2FA", "Включена двухфакторная защита — введите код из приложения");
    if (/invalid credentials|invalid username or password/i.test(msg)) throw new AccountError("ELY_CREDENTIALS", "Неверный логин или пароль");
    throw new AccountError("ELY_ERROR", msg || "Не удалось войти через Ely.by");
  }
  const profile = data.selectedProfile;
  if (!profile) throw new AccountError("ELY_ERROR", "У аккаунта Ely.by нет игрового профиля");
  const id = `ely-${profile.id}`;
  const view = upsert({
    id,
    type: "ely",
    name: profile.name,
    uuid: profile.id,
    accessToken: data.accessToken,
    clientToken: data.clientToken || clientToken,
  });
  await saveElySkin(id, profile.name);
  return view;
}

async function freshElyAuth(account) {
  const { ok, data } = await elyCall("/auth/refresh", {
    accessToken: account.accessToken,
    clientToken: account.clientToken,
    requestUser: true,
  });
  if (!ok || !data.accessToken) {
    throw new AccountError("REAUTH", `Сессия Ely.by для ${account.name} устарела — войдите в аккаунт заново`);
  }
  const updated = {
    ...account,
    accessToken: data.accessToken,
    name: (data.selectedProfile && data.selectedProfile.name) || account.name,
  };
  upsert(updated, { select: false });
  return updated;
}

/** authlib-injector нужен, чтобы игра брала скины и вход с Ely.by. */
async function ensureAuthlibInjector() {
  const target = path.join(paths.LAUNCHER_DIR, "authlib-injector.jar");
  if (fs.existsSync(target)) return target;
  const info = await fetchJson("https://authlib-injector.yushi.moe/artifact/latest.json");
  await downloadFile(info.download_url, target);
  return target;
}

// ---------- для запуска игры ----------

/** Возвращает authenticator для minecraft-java-core и доп. JVM-аргументы. */
async function launchAuth(onLog) {
  const account = selected();
  if (!account) throw new AccountError("NO_ACCOUNT", "Добавьте аккаунт: нажмите на ник в правом верхнем углу");

  if (account.type === "offline") {
    // Свой скин офлайн-профиля — через локальный сервер скинов и
    // authlib-injector (как в Rich/HMCL), без модов и на любой версии.
    const jvmArgs = [];
    const skin = skins.get(account.id);
    if (skin && skin.custom && settings.get().skin_server !== false) {
      try {
        const injector = await ensureAuthlibInjector();
        jvmArgs.push(...(await skinServer.jvmArgs(injector)));
        if (onLog) onLog("Скин профиля подключён (локальный сервер скинов)");
      } catch (err) {
        if (onLog) onLog(`Не удалось подключить скин (${err.message}) — игра запустится со стандартным скином`);
      }
    }
    return {
      account,
      jvmArgs,
      authenticator: {
        access_token: account.uuid,
        client_token: account.uuid,
        uuid: account.uuid,
        name: account.name,
        user_properties: "{}",
        meta: { online: false, type: "legacy" },
      },
    };
  }

  if (account.type === "microsoft") {
    const fresh = await freshMicrosoftAuth(account);
    return { account: fresh, jvmArgs: [], authenticator: fresh.auth };
  }

  if (account.type === "ely") {
    const fresh = await freshElyAuth(account);
    const jvmArgs = [];
    try {
      const injector = await ensureAuthlibInjector();
      jvmArgs.push(`-javaagent:${injector}=ely.by`);
    } catch (err) {
      if (onLog) onLog(`authlib-injector не скачался (${err.message}) — скины Ely.by в игре могут не показываться`);
    }
    return {
      account: fresh,
      jvmArgs,
      authenticator: {
        access_token: fresh.accessToken,
        client_token: fresh.clientToken,
        uuid: fresh.uuid,
        name: fresh.name,
        user_properties: "{}",
        meta: { online: true, type: "mojang" },
      },
    };
  }

  throw new AccountError("UNKNOWN", "Неизвестный тип аккаунта");
}

function accountById(id) {
  return readStore().accounts.find((a) => a.id === id) || null;
}

// Локальный сервер скинов отдаёт скины всех офлайн-профилей лаунчера.
skinServer.setProfilesProvider(() =>
  readStore()
    .accounts.filter((a) => a.type === "offline")
    .map((a) => ({ id: a.id, name: a.name, uuid: a.uuid }))
);

module.exports = {
  AccountError,
  list,
  selected,
  select,
  remove,
  addOffline,
  addMicrosoft,
  addEly,
  launchAuth,
  uploadMicrosoftSkin,
  accountById,
  offlineUuid,
};
