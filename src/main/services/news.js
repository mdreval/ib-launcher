/**
 * Новости сервера на главной.
 *
 * Источники (всё настраивается в data/server_profiles.json):
 *  1. news_telegram — публичные Telegram-каналы (без бота и ключей: берётся
 *     открытая веб-версия канала t.me/s/<канал>, как её видит любой браузер);
 *  2. data/news.json в репозитории на GitHub — свои новости, которые можно
 *     написать руками (закреплённые, объявления). Формат — см. data/news.json.
 *
 * Если ничего не загрузилось (нет интернета) — показываются последние
 * загруженные новости из кэша, а если и их нет — новости из data/news.json,
 * встроенного в лаунчер.
 *
 * Читать сообщения из Discord через вебхук нельзя: вебхук умеет только
 * отправлять сообщения в канал, а не читать их.
 */

const path = require("path");

const paths = require("../paths");
const builds = require("./builds");
const { request, fetchJson } = require("../core/http");
const { readJson, writeJson } = require("../core/jsonFile");

const pkg = require("../../../package.json");

const CACHE_FILE = path.join(paths.CACHE_DIR, "news.json");
const BUNDLED_NEWS = paths.appResource("data", "news.json");
const CACHE_TTL = 10 * 60 * 1000;
const MAX_ITEMS = 20;

const LAUNCHER_REPO = (() => {
  const pub = pkg.build && Array.isArray(pkg.build.publish) ? pkg.build.publish[0] : null;
  return pub && pub.owner && pub.repo ? `${pub.owner}/${pub.repo}` : "mdreval/ib-launcher";
})();

let memory = null; // { at, items }

// ---------- Telegram ----------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m));
}

/** HTML текста поста → обычный текст (переносы строк сохраняются). */
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<i class="emoji"[^>]*>\s*<b>([\s\S]*?)<\/b>\s*<\/i>/gi, "$1")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDivInner(html, className) {
  const start = html.indexOf(`class="${className}`);
  if (start === -1) return null;
  const open = html.indexOf(">", start);
  if (open === -1) return null;
  // Внутри текста поста вложенных div не бывает — берём до первого </div>.
  const close = html.indexOf("</div>", open);
  return close === -1 ? null : html.slice(open + 1, close);
}

/** Разбор веб-версии канала t.me/s/<канал>. */
function parseTelegram(html, channel) {
  const items = [];
  const parts = html.split('class="tgme_widget_message_wrap').slice(1);
  for (const part of parts) {
    const post = /data-post="([^"]+)"/.exec(part);
    if (!post) continue;
    const textHtml = extractDivInner(part, "tgme_widget_message_text");
    const text = textHtml ? htmlToText(textHtml) : "";
    const time = /<time[^>]*datetime="([^"]+)"/.exec(part);
    const photo = /tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/.exec(part) || /tgme_widget_message_video_thumb"[^>]*background-image:url\('([^']+)'\)/.exec(part);
    if (!text && !photo) continue;
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    items.push({
      id: `tg:${post[1]}`,
      source: "telegram",
      channel,
      title: lines.length > 1 && lines[0].length <= 90 ? lines[0] : "",
      text: lines.length > 1 && lines[0].length <= 90 ? lines.slice(1).join("\n") : lines.join("\n"),
      image: photo ? (photo[1].startsWith("//") ? `https:${photo[1]}` : photo[1]) : null,
      url: `https://t.me/${post[1]}`,
      date: time ? Date.parse(time[1]) || null : null,
    });
  }
  return items;
}

async function fetchTelegram(channel) {
  const name = String(channel).replace(/^@/, "").replace(/^https?:\/\/t\.me\/(s\/)?/i, "").replace(/\/.*$/, "");
  if (!name) return [];
  const res = await request(`https://t.me/s/${encodeURIComponent(name)}`, {
    timeout: 12000,
    headers: { "Accept-Language": "ru,en;q=0.8", Accept: "text/html" },
  });
  const html = await res.text();
  return parseTelegram(html, name);
}

// ---------- свои новости (data/news.json) ----------

function normalizeCustom(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((n) => n && (n.title || n.text))
    .map((n, i) => ({
      id: `custom:${n.id || i}`,
      source: "custom",
      pinned: !!n.pinned,
      title: String(n.title || ""),
      text: String(n.text || ""),
      image: n.image || null,
      url: n.url || null,
      date: n.date ? Date.parse(n.date) || null : null,
    }));
}

async function fetchCustom() {
  for (const branch of ["main", "master"]) {
    try {
      const data = await fetchJson(`https://raw.githubusercontent.com/${LAUNCHER_REPO}/${branch}/data/news.json?t=${Date.now()}`, { timeout: 8000 });
      return normalizeCustom(Array.isArray(data) ? data : data && data.news);
    } catch (err) {
      /* следующая ветка */
    }
  }
  throw new Error("news.json недоступен");
}

function bundledCustom() {
  const data = readJson(BUNDLED_NEWS, []);
  return normalizeCustom(Array.isArray(data) ? data : data && data.news);
}

// ---------- сборка ленты ----------

function serverProfile() {
  return builds.serverProfiles()[0] || {};
}

function merge(custom, telegram) {
  const pinned = custom.filter((n) => n.pinned);
  const rest = [...custom.filter((n) => !n.pinned), ...telegram].sort((a, b) => (b.date || 0) - (a.date || 0));
  return [...pinned, ...rest].slice(0, MAX_ITEMS);
}

async function list({ force = false } = {}) {
  if (!force && memory && Date.now() - memory.at < CACHE_TTL) return memory;
  const profile = serverProfile();
  const channels = Array.isArray(profile.news_telegram) ? profile.news_telegram : profile.news_telegram ? [profile.news_telegram] : [];

  const results = await Promise.allSettled([fetchCustom(), ...channels.map((c) => fetchTelegram(c))]);
  const customRes = results[0];
  const custom = customRes.status === "fulfilled" ? customRes.value : bundledCustom();
  const telegram = results.slice(1).flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const anyTelegram = results.slice(1).some((r) => r.status === "fulfilled");

  if (!anyTelegram && customRes.status !== "fulfilled") {
    // Нет сети — последние новости из кэша.
    const cached = readJson(CACHE_FILE, null);
    if (cached && Array.isArray(cached.items) && cached.items.length) {
      memory = { at: Date.now(), items: cached.items, offline: true, channels };
      return memory;
    }
  }
  const items = merge(custom, telegram);
  memory = { at: Date.now(), items, offline: false, channels };
  if (items.length) writeJson(CACHE_FILE, { at: Date.now(), items });
  return memory;
}

module.exports = { list, parseTelegram };
