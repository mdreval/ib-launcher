/* Общие помощники интерфейса: создание элементов, уведомления, окна, форматирование */
(function () {
  const IB = (window.IB = window.IB || {});

  /** h('div', {class, onClick, html, text, style, dataset, ...attrs}, ...children) */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === "class") el.className = value;
        else if (key === "html") el.innerHTML = value;
        else if (key === "text") el.textContent = value;
        else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
        else if (key === "dataset") Object.assign(el.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value === true) el.setAttribute(key, "");
        else el.setAttribute(key, value);
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function iconEl(name, cls) {
    const span = document.createElement("span");
    span.innerHTML = IB.icon(name, cls);
    return span.firstElementChild;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // ---------- форматирование ----------
  const L = () => IB.lang || "ru";
  const UNITS = {
    ru: { b: "Б", kb: "КБ", mb: "МБ", m: "млн", k: "тыс." },
    uk: { b: "Б", kb: "КБ", mb: "МБ", m: "млн", k: "тис." },
    en: { b: "B", kb: "KB", mb: "MB", m: "M", k: "K" },
  };
  const dec = (x) => (L() === "en" ? x : x.replace(".", ","));

  function bytes(n) {
    if (!Number.isFinite(n)) return "";
    const u = UNITS[L()];
    if (n < 1024) return `${n} ${u.b}`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} ${u.kb}`;
    return `${dec((n / 1024 / 1024).toFixed(1))} ${u.mb}`;
  }

  function count(n) {
    if (!Number.isFinite(n)) return "";
    const u = UNITS[L()];
    if (n >= 1e6) return `${dec((n / 1e6).toFixed(1))}${L() === "en" ? "" : " "}${u.m}`;
    if (n >= 1e3) return `${dec((n / 1e3).toFixed(1))}${L() === "en" ? "" : " "}${u.k}`;
    return String(n);
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function ago(date) {
    const t = new Date(date).getTime();
    if (!Number.isFinite(t)) return "";
    const diff = Math.max(0, Date.now() - t) / 1000;
    if (L() !== "ru") {
      try {
        const rtf = new Intl.RelativeTimeFormat(L() === "uk" ? "uk" : "en", { numeric: "auto" });
        if (diff < 60) return rtf.format(0, "second");
        if (diff < 3600) return rtf.format(-Math.floor(diff / 60), "minute");
        if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), "hour");
        if (diff < 86400 * 31) return rtf.format(-Math.floor(diff / 86400), "day");
        if (diff < 86400 * 365) return rtf.format(-Math.floor(diff / 86400 / 30.4), "month");
        return rtf.format(-Math.floor(diff / 86400 / 365), "year");
      } catch (err) {
        /* ниже — русский вариант */
      }
    }
    if (diff < 60) return "только что";
    const min = Math.floor(diff / 60);
    if (min < 60) return `${min} ${plural(min, "минуту", "минуты", "минут")} назад`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} ${plural(hours, "час", "часа", "часов")} назад`;
    const days = Math.floor(hours / 24);
    if (days < 31) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
    const months = Math.floor(days / 30.4);
    if (months < 12) return `${months} ${plural(months, "мес.", "мес.", "мес.")} назад`;
    const years = Math.floor(days / 365);
    return `${years} ${plural(years, "год", "года", "лет")} назад`;
  }

  function longDate(date) {
    const d = new Date(date);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString(IB.i18n ? IB.i18n.locale() : "ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ---------- уведомления ----------
  function toast(message, type = "info", ms = 4200) {
    const root = document.getElementById("toast-root");
    const el = h("div", { class: `toast toast--${type}` }, iconEl(type === "error" ? "alert" : type === "success" ? "check" : "info"), h("div", { text: message }));
    root.append(el);
    const remove = () => {
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 240);
    };
    el.addEventListener("click", remove);
    setTimeout(remove, type === "error" ? Math.max(ms, 7000) : ms);
  }

  /** Выполняет действие и показывает ошибку уведомлением. */
  async function run(fn, { success, onError } = {}) {
    try {
      const result = await fn();
      if (success) toast(typeof success === "function" ? success(result) : success, "success");
      return result;
    } catch (err) {
      if (err && err.code === "CANCELLED") return undefined;
      if (onError) onError(err);
      else toast(err && err.message ? err.message : String(err), "error");
      return undefined;
    }
  }

  // ---------- модальные окна ----------
  const openModals = [];

  function modal({ title, content, footer, wide, xl, onClose, closable = true }) {
    const root = document.getElementById("modal-root");
    const closeBtn = closable ? h("button", { class: "icon-btn icon-btn--plain", "aria-label": "Закрыть", html: IB.icon("close") }) : null;
    const box = h(
      "div",
      { class: `modal${wide ? " modal--wide" : ""}${xl ? " modal--xl" : ""}`, role: "dialog", "aria-modal": "true" },
      h("div", { class: "modal__head" }, h("h2", { text: title || "" }), closeBtn),
      content,
      footer ? h("div", { class: "modal__foot" }, footer) : null
    );
    const backdrop = h("div", { class: "modal-backdrop" }, box);
    let closed = false;
    const api = {
      el: box,
      close() {
        if (closed) return;
        closed = true;
        backdrop.remove();
        const idx = openModals.indexOf(api);
        if (idx >= 0) openModals.splice(idx, 1);
        if (onClose) onClose();
      },
    };
    if (closeBtn) closeBtn.addEventListener("click", () => api.close());
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop && closable) api.close();
    });
    root.append(backdrop);
    openModals.push(api);
    const first = box.querySelector("input:not([type=hidden]), select, textarea");
    if (first) setTimeout(() => first.focus(), 60);
    return api;
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openModals.length) {
      openModals[openModals.length - 1].close();
      e.stopPropagation();
    }
  });

  function confirmDialog({ title, text, confirmText = "Удалить", danger = true }) {
    return new Promise((resolve) => {
      let answered = false;
      const yes = h("button", { class: `btn ${danger ? "btn--danger" : "btn--primary"}`, text: confirmText });
      const no = h("button", { class: "btn btn--ghost", text: "Отмена" });
      const m = modal({
        title,
        content: h("p", { class: "soft", style: { margin: 0 }, text }),
        footer: [no, yes],
        onClose: () => {
          if (!answered) resolve(false);
        },
      });
      yes.addEventListener("click", () => {
        answered = true;
        m.close();
        resolve(true);
      });
      no.addEventListener("click", () => m.close());
    });
  }

  // ---------- всплывающее меню ----------
  let openPopover = null;
  function popover(anchor, content, { align = "right", above = true } = {}) {
    closePopover();
    const el = h("div", { class: "popover" }, content);
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let left = align === "right" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = above ? r.top - hgt - 10 : r.bottom + 10;
    if (top < 8) top = r.bottom + 10;
    if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 10);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    openPopover = el;
    setTimeout(() => document.addEventListener("mousedown", outside), 0);
    function outside(e) {
      if (!el.contains(e.target)) closePopover();
    }
    el._outside = outside;
    return el;
  }

  function closePopover() {
    if (openPopover) {
      document.removeEventListener("mousedown", openPopover._outside);
      openPopover.remove();
      openPopover = null;
    }
  }

  function switchEl({ checked, disabled, onChange, label }) {
    const input = h("input", { type: "checkbox", "aria-label": label || "" });
    input.checked = !!checked;
    input.disabled = !!disabled;
    if (onChange) input.addEventListener("change", () => onChange(input.checked, input));
    const el = h("label", { class: "switch" }, input, h("span", { class: "switch__track" }));
    el.input = input;
    return el;
  }

  // ---------- загрузчики ----------
  const LOADERS = {
    vanilla: { title: "Без модов", short: "Vanilla", desc: "Чистая игра без модов" },
    fabric: { title: "Fabric", short: "Fabric", desc: "Лёгкий и быстрый, моды на новые версии" },
    forge: { title: "Forge", short: "Forge", desc: "Классика: огромные модпаки и старые версии" },
    neoforge: { title: "NeoForge", short: "NeoForge", desc: "Современный Forge, с 1.20.1" },
    quilt: { title: "Quilt", short: "Quilt", desc: "Ответвление Fabric, запускает его моды" },
  };

  function loaderColor(type) {
    return `var(--loader-${LOADERS[type] ? type : "vanilla"})`;
  }

  function buildSubtitle(build) {
    if (!build) return "";
    if (build.loader_type === "vanilla") return `Minecraft ${build.mc_version}`;
    return `${LOADERS[build.loader_type].short} ${build.loader_label || build.loader_version || ""} · Minecraft ${build.mc_version}`;
  }

  Object.assign(IB, {
    h,
    iconEl,
    escapeHtml,
    fmt: { bytes, count, ago, longDate, plural },
    debounce,
    toast,
    run,
    modal,
    confirmDialog,
    popover,
    closePopover,
    switchEl,
    LOADERS,
    loaderColor,
    buildSubtitle,
  });
})();
