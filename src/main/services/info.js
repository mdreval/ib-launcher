/**
 * Вкладка «Правила и ссылки».
 *
 * Содержимое — файл data/info.json в репозитории на GitHub: правила сервера,
 * ссылки (Telegram, Discord, донат, карта…) и как попасть в whitelist.
 * Файл можно править прямо на GitHub — игроки увидят изменения в течение
 * 10 минут, без нового релиза. Без интернета показывается последняя
 * загруженная версия, а если её нет — файл, встроенный в лаунчер.
 */

const path = require("path");

const paths = require("../paths");
const { fetchJson } = require("../core/http");
const { readJson, writeJson } = require("../core/jsonFile");

const pkg = require("../../../package.json");

const CACHE_FILE = path.join(paths.CACHE_DIR, "info.json");
const BUNDLED = paths.appResource("data", "info.json");
const CACHE_TTL = 10 * 60 * 1000;

const REPO = (() => {
  const pub = pkg.build && Array.isArray(pkg.build.publish) ? pkg.build.publish[0] : null;
  return pub && pub.owner && pub.repo ? `${pub.owner}/${pub.repo}` : "mdreval/ib-launcher";
})();

let memory = null;

function normalize(data) {
  const d = data && typeof data === "object" ? data : {};
  const str = (v) => (v == null ? "" : String(v));
  return {
    title: str(d.title) || "Правила и ссылки",
    intro: str(d.intro),
    links: (Array.isArray(d.links) ? d.links : [])
      .filter((l) => l && l.title)
      // ссылка без адреса — заглушка («Скоро»), кнопка неактивна
      .map((l) => ({ title: str(l.title), url: /^https?:\/\//i.test(str(l.url)) ? str(l.url) : "", text: str(l.text), icon: str(l.icon) || "link", accent: !!l.accent })),
    rules: (Array.isArray(d.rules) ? d.rules : [])
      .filter((r) => r && (r.title || (Array.isArray(r.items) && r.items.length)))
      .map((r) => ({ title: str(r.title), items: (Array.isArray(r.items) ? r.items : []).map(str).filter(Boolean) })),
    whitelist: d.whitelist && (d.whitelist.text || d.whitelist.steps)
      ? {
          title: str(d.whitelist.title) || "Как попасть на сервер",
          text: str(d.whitelist.text),
          steps: (Array.isArray(d.whitelist.steps) ? d.whitelist.steps : []).map(str).filter(Boolean),
          button: d.whitelist.button && /^https?:\/\//i.test(str(d.whitelist.button.url)) ? { title: str(d.whitelist.button.title) || "Подать заявку", url: str(d.whitelist.button.url) } : null,
        }
      : null,
    updated: str(d.updated),
  };
}

async function get({ force = false } = {}) {
  if (!force && memory && Date.now() - memory.at < CACHE_TTL) return memory.data;
  for (const branch of ["main", "master"]) {
    try {
      const raw = await fetchJson(`https://raw.githubusercontent.com/${REPO}/${branch}/data/info.json?t=${Date.now()}`, { timeout: 8000 });
      const data = normalize(raw);
      memory = { at: Date.now(), data };
      writeJson(CACHE_FILE, raw);
      return data;
    } catch (err) {
      /* следующая ветка */
    }
  }
  const cached = readJson(CACHE_FILE, null);
  const data = normalize(cached || readJson(BUNDLED, {}));
  data.offline = true;
  memory = { at: Date.now(), data };
  return data;
}

module.exports = { get };
