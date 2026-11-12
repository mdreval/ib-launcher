/* Каркас интерфейса: состояние, навигация, верхняя панель, общие действия */
(function () {
  const IB = window.IB;
  const { h, run, toast } = IB;
  const api = window.ib;

  const S = (IB.state = {
    info: null,
    settings: null,
    accounts: [],
    builds: [],
    selected: null,
    states: {},
    skin: null,
    avatar: null,
    page: null,
    lastLogBuild: null,
    serverStatus: null,
  });

  // ---------- шина событий ----------
  const bus = new EventTarget();
  IB.on = (name, fn) => {
    const handler = (e) => fn(e.detail);
    bus.addEventListener(name, handler);
    return () => bus.removeEventListener(name, handler);
  };
  IB.emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

  // ---------- выборки ----------
  IB.buildById = (id) => S.builds.find((b) => b.id === id) || null;
  IB.selectedBuild = () => IB.buildById(S.selected) || S.builds[0] || null;
  IB.selectedAccount = () => S.accounts.find((a) => a.selected) || null;
  IB.gameState = (id) => S.states[id] || { status: "idle", progress: null };
  IB.serverBuild = () => S.builds.find((b) => b.kind === "server") || null;

  IB.buildIcon = (build) => {
    if (build && build.kind === "server") return "../../assets/ui/nav-home.png";
    return "../../assets/ui/nav-home.png";
  };

  // ---------- загрузка данных ----------
  async function loadBuilds(payload) {
    const data = payload || (await api.builds.list());
    S.builds = data.builds;
    S.selected = data.selected;
    S.states = { ...S.states, ...(data.states || {}) };
    IB.emit("builds");
  }

  async function loadAccounts(list) {
    S.accounts = list || (await api.accounts.list());
    renderAccountChip();
    await loadSkin();
    IB.emit("accounts");
  }

  async function loadSkin() {
    const acc = IB.selectedAccount();
    try {
      S.skin = await api.skins.get(acc ? acc.id : null);
      S.avatar = await IB.skin.avatarFor(S.skin.dataUrl);
    } catch (err) {
      S.skin = null;
      S.avatar = null;
    }
    renderAccountChip();
    IB.emit("skin");
  }

  async function loadSettings() {
    S.settings = await api.settings.get();
    IB.emit("settings");
  }

  IB.reload = { builds: loadBuilds, accounts: loadAccounts, skin: loadSkin, settings: loadSettings };

  // ---------- оформление ----------
  /** Тема (зелёная / красная IGROBAR) и своя картинка фона. */
  // ---------- свой цвет лаунчера ----------
  //
  // Все цвета интерфейса — переменные --c-xxxxxx в base.css (значения
  // зелёной темы). Для «своего цвета» каждый из них пересчитывается: оттенок
  // берётся выбранный, насыщенность — пропорционально выбранной, яркость
  // остаётся прежней (тёмное остаётся тёмным, светлое — светлым). Акцентные
  // цвета (кнопки, ползунки, выделение) — сам выбранный цвет; текст на них
  // чёрный или белый — смотря что лучше читается.

  const ACCENT_KEYS = {
    "--c-a8f0d0": 0, // основной акцент
    "--c-7de6b8": -0.08, // акцент поярче/потемнее
    "--c-93ecc6": -0.04,
    "--c-c3f7e0": 0.06, // светлые оттенки (градиент кнопок)
    "--c-d6fbea": 0.1,
  };
  const ON_ACCENT_KEY = "--c-0a1411";
  const BASE_ACCENT_SAT = 0.73; // насыщенность мятного акцента зелёной темы

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    const n = m ? parseInt(m[1], 16) : 0x7de6b8;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHsl([r, g, b]) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function hslToRgb([h, s, l]) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  }

  const luminance = ([r, g, b]) => {
    const c = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };

  // Цвета зелёной темы (как в начале base.css). Читать их из CSS на лету
  // нельзя: для file:// Chromium не даёт доступ к правилам стилей.
  const BASE_COLORS = {
    "--c-030706": "3, 7, 6",
    "--c-060c0a": "6, 12, 10",
    "--c-070d0b": "7, 13, 11",
    "--c-080e0c": "8, 14, 12",
    "--c-0a1210": "10, 18, 16",
    "--c-0a1411": "10, 20, 17",
    "--c-0b1311": "11, 19, 17",
    "--c-0c1513": "12, 21, 19",
    "--c-0d1714": "13, 23, 20",
    "--c-0e1815": "14, 24, 21",
    "--c-0f1916": "15, 25, 22",
    "--c-101a17": "16, 26, 23",
    "--c-14221e": "20, 34, 30",
    "--c-162420": "22, 36, 32",
    "--c-1a2c27": "26, 44, 39",
    "--c-1c2a26": "28, 42, 38",
    "--c-1e302a": "30, 48, 42",
    "--c-2d4b42": "45, 75, 66",
    "--c-6f8880": "111, 136, 128",
    "--c-7de6b8": "125, 230, 184",
    "--c-93ecc6": "147, 236, 198",
    "--c-a8f0d0": "168, 240, 208",
    "--c-a9beb5": "169, 190, 181",
    "--c-c3f7e0": "195, 247, 224",
    "--c-c7d6cf": "199, 214, 207",
    "--c-c9d6d0": "201, 214, 208",
    "--c-d6fbea": "214, 251, 234",
    "--c-eef6f2": "238, 246, 242",
  };

  /** Значения --c-* зелёной темы. */
  function baseThemeColors() {
    return BASE_COLORS;
  }

  /** Все цвета темы под выбранный цвет: { "--c-xxxxxx": "r, g, b" }. */
  function customPalette(hex) {
    const picked = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(picked);
    const satFactor = Math.min(1.25, s / BASE_ACCENT_SAT);
    const accentL = Math.max(0.5, Math.min(0.82, l));
    const out = {};
    for (const [name, value] of Object.entries(baseThemeColors())) {
      const rgb = value.split(",").map((x) => parseInt(x, 10));
      let next;
      if (name in ACCENT_KEYS) {
        next = hslToRgb([h, Math.min(1, s), Math.max(0.3, Math.min(0.95, accentL + ACCENT_KEYS[name]))]);
      } else {
        const [, bs, bl] = rgbToHsl(rgb);
        next = hslToRgb([h, Math.min(1, bs * satFactor), bl]);
      }
      out[name] = next.join(", ");
    }
    // Текст на кнопках: чёрный на светлом акценте, белый на тёмном.
    const accentRgb = hslToRgb([h, Math.min(1, s), accentL]);
    out[ON_ACCENT_KEY] = luminance(accentRgb) > 0.36 ? hslToRgb([h, Math.min(0.35, s), 0.07]).join(", ") : "255, 255, 255";
    return { vars: out, light: luminance(picked) > 0.62, accentRgb };
  }

  let appliedVars = [];
  function applyPalette(palette) {
    const root = document.documentElement;
    for (const name of appliedVars) root.style.removeProperty(name);
    appliedVars = [];
    if (!palette) return;
    for (const [name, value] of Object.entries(palette.vars)) {
      root.style.setProperty(name, value);
      appliedVars.push(name);
    }
  }

  IB.theme = { customPalette, hexToRgb };

  /** Тема (зелёная / красная IGROBAR / свой цвет) и своя картинка фона. */
  /** opts.silent — только перекрасить, не сообщая страницам (предпросмотр
   * при выборе цвета: иначе настройки перерисуются и окно выбора закроется). */
  IB.applyAppearance = (a, opts = {}) => {
    if (!a) return;
    S.appearance = a;
    const root = document.documentElement;
    const theme = ["red", "custom"].includes(a.theme) ? a.theme : "green";
    root.dataset.theme = theme;
    let logoSrc = "../../assets/ui/logo.png";
    if (theme === "custom") {
      const palette = customPalette(a.accent_color);
      applyPalette(palette);
      // Логотип на своём цвете — нейтральный: серый, а на очень светлых
      // цветах — чёрный.
      logoSrc = palette.light ? "../../assets/ui/logo-black.png" : "../../assets/ui/logo-gray.png";
    } else {
      applyPalette(null);
      if (theme === "red") logoSrc = "../../assets/ui/logo-red.png";
    }
    if (a.background === "custom" && (a.customDataUrl || a.customVideoUrl)) {
      if (a.customDataUrl) root.style.setProperty("--app-bg-image", `url("${a.customDataUrl}")`);
      else root.style.setProperty("--app-bg-image", "none");
      root.setAttribute("data-custom-bg", "");
      root.style.setProperty("--bg-dim", String(a.bg_dim ?? 0.7));
    } else {
      root.style.removeProperty("--app-bg-image");
      root.removeAttribute("data-custom-bg");
      root.style.removeProperty("--bg-dim");
    }
    // Логотип можно закрепить: зелёный, красный или нейтральный — тогда он
    // не меняется вместе со своим цветом.
    const LOGOS = { green: "../../assets/ui/logo.png", red: "../../assets/ui/logo-red.png" };
    if (LOGOS[a.logo]) logoSrc = LOGOS[a.logo];
    else if (a.logo === "neutral") {
      const light = theme === "custom" ? customPalette(a.accent_color).light : false;
      logoSrc = light ? "../../assets/ui/logo-black.png" : "../../assets/ui/logo-gray.png";
    }
    const logo = document.querySelector(".sidebar__logo");
    if (logo) logo.src = logoSrc;
    if (!opts.silent) IB.emit("appearance");
  };

  // ---------- действия ----------
  IB.actions = {
    async play(buildId) {
      const build = IB.buildById(buildId);
      if (!build) return;
      if (!build.installed) return IB.actions.install(buildId);
      if (!IB.selectedAccount()) {
        toast("Сначала добавьте аккаунт — можно просто ник", "info");
        IB.modals.accounts();
        return;
      }
      S.lastLogBuild = buildId;
      await run(() => api.builds.launch(buildId), {
        onError: (err) => {
          if (err.code === "REAUTH" || err.code === "NO_ACCOUNT") IB.modals.accounts();
          toast(err.message, "error");
        },
      });
    },
    stop(buildId) {
      return run(() => api.builds.stop(buildId));
    },
    install(buildId) {
      S.lastLogBuild = buildId;
      return run(() => api.builds.install(buildId), { success: "Сборка установлена" });
    },
    select(buildId) {
      S.selected = buildId;
      IB.emit("builds");
      return run(() => api.builds.select(buildId));
    },
    openFolder(buildId) {
      return run(() => api.builds.openFolder(buildId));
    },
    openContent(buildId) {
      IB.go("content", { buildId });
    },
  };

  // ---------- навигация ----------
  const NAV = [
    { id: "home", title: "Главная", icon: "nav-home.png" },
    { id: "builds", title: "Сборки", icon: "nav-builds.png" },
    { id: "content", title: "Моды", icon: "nav-mods.png" },
    { id: "skin", title: "Скин", icon: "nav-skin.png" },
    { id: "map", title: "Карта сервера", icon: "nav-map.png" },
    { id: "music", title: "Музыка", icon: "nav-music.png" },
    { id: "rules", title: "Правила и ссылки", icon: "nav-rules.png" },
    { id: "settings", title: "Настройки", icon: "nav-settings.png" },
  ];

  IB.pages = IB.pages || {};
  let current = null;

  function renderNav() {
    const nav = document.getElementById("nav");
    nav.textContent = "";
    nav.append(h("div", { class: "nav__indicator", id: "nav-indicator" }));
    for (const item of NAV) {
      nav.append(
        h(
          "button",
          { class: "nav__btn", dataset: { page: item.id }, "aria-label": item.title, onClick: () => IB.go(item.id) },
          h("img", { src: `../../assets/ui/${item.icon}`, alt: "" }),
          h("span", { class: "tip", text: item.title })
        )
      );
    }
  }

  function updateNav(pageId) {
    const buttons = [...document.querySelectorAll(".nav__btn")];
    const idx = NAV.findIndex((n) => n.id === pageId);
    buttons.forEach((b, i) => b.setAttribute("aria-current", i === idx ? "page" : "false"));
    const indicator = document.getElementById("nav-indicator");
    if (idx >= 0) {
      indicator.style.opacity = "1";
      indicator.style.transform = `translateY(${buttons[idx].offsetTop}px)`;
    } else indicator.style.opacity = "0";
  }

  window.addEventListener("resize", () => S.page && updateNav(S.page));

  IB.go = (pageId, params = {}) => {
    const page = IB.pages[pageId];
    if (!page) return;
    IB.closePopover();
    if (current && current.cleanup) current.cleanup();
    const host = document.getElementById("page-host");
    host.textContent = "";
    S.page = pageId;
    current = page.mount(host, params) || {};
    document.getElementById("topbar-title").textContent = (NAV.find((n) => n.id === pageId) || {}).title || "";
    updateNav(pageId);
  };

  // события состояния передаём текущей странице
  for (const name of ["builds", "accounts", "skin", "settings", "game", "log", "server"]) {
    IB.on(name, (detail) => {
      if (current && current.update) current.update(name, detail);
    });
  }

  // ---------- верхняя панель ----------
  function renderAccountChip() {
    const acc = IB.selectedAccount();
    const avatar = document.getElementById("account-avatar");
    avatar.textContent = "";
    if (acc && S.avatar) avatar.append(h("img", { src: S.avatar, alt: "" }));
    else avatar.append(IB.iconEl("user"));
    document.getElementById("account-name").textContent = acc ? acc.name : "Войти";
  }

  function wireTopbar() {
    document.getElementById("account-chip").addEventListener("click", () => IB.modals.accounts());
    document.getElementById("logs-btn").addEventListener("click", () => IB.modals.logs(S.lastLogBuild || S.selected));
    document.getElementById("profile-btn").addEventListener("click", () => IB.modals.profile());
    document.getElementById("win-min").addEventListener("click", () => api.app.minimize());
    document.getElementById("win-max").addEventListener("click", () => api.app.toggleMaximize());
    document.getElementById("win-close").addEventListener("click", async () => {
      const result = await api.app.close();
      if (result === "tray") toast("Игра запущена — лаунчер свёрнут в трей", "info");
    });
    api.on("window:state", ({ maximized }) => {
      document.getElementById("win-max").innerHTML = IB.icon(maximized ? "restore" : "maximize");
    });
  }

  function renderSidebarFooter() {
    const server = IB.serverBuild();
    const footer = document.getElementById("sidebar-footer");
    footer.textContent = "";
    const tg = "https://t.me/igrobar_minecraft"; // чат сервера в Telegram — всегда сюда
    const ds = (server && server.discord) || "https://discord.gg/CxtzR2quvd";
    footer.append(
      h("button", { class: "social-btn", title: "Telegram IGROBAR", html: IB.icon("telegram"), onClick: () => api.app.openExternal(tg) }),
      h("button", { class: "social-btn social-btn--discord", title: "Discord IGROBAR", html: IB.icon("discord"), onClick: () => api.app.openExternal(ds) }),
      h("span", { class: "sidebar__caption", text: "IGROBAR" })
    );
  }

  // лёгкий параллакс фона
  function parallax() {
    const bg = document.querySelector(".app-bg");
    window.addEventListener("mousemove", (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * -18;
      const y = (e.clientY / window.innerHeight - 0.5) * -12;
      bg.style.setProperty("--px", `${x}px`);
      bg.style.setProperty("--py", `${y}px`);
    });
  }

  // ---------- события из main ----------
  function wireEvents() {
    api.on("builds:changed", (payload) => loadBuilds(payload));
    api.on("accounts:changed", (list) => loadAccounts(list));
    api.on("skins:changed", () => loadSkin());
    api.on("game:state", (state) => {
      S.states[state.buildId] = state;
      IB.emit("game", state);
    });
    api.on("game:log", (payload) => IB.emit("log", payload));
    api.on("game:log-reset", (payload) => IB.emit("log", { ...payload, reset: true }));
    api.on("game:exited", ({ buildId, exitCode, crashed, reasons }) => {
      if (crashed) {
        const why = reasons && reasons[0] ? ` Вероятная причина: ${reasons[0].title}.` : "";
        toast(`Игра завершилась с ошибкой (код ${exitCode}).${why} Подробности — в «Журнале игры».`, "error", 7000);
        IB.modals.logs(buildId);
      }
    });
    api.on("server:status", (st) => {
      S.serverStatus = st;
      IB.emit("server", st);
    });
    api.on("modpack:background", ({ release }) => {
      toast(`Модпак сервера тихо обновлён${release ? ` до ${release}` : ""} — можно играть`, "success");
    });
    api.on("import:progress", (p) => IB.emit("import", p));
    api.on("modpack:progress", (p) => IB.emit("game", { buildId: p.buildId, status: "modpack", progress: p }));
    api.on("update:event", (event) => {
      IB.emit("update", event);
      if (event.type === "available") {
        toast(`Доступна новая версия лаунчера ${event.version} — загружаю…`, "info");
        api.updates.download().catch(() => {});
      }
      if (event.type === "manual") {
        IB.confirmDialog({
          title: "Доступна новая версия",
          text: `Вышла версия лаунчера ${event.version}. На macOS обновление ставится вручную: скачайте новый .dmg и перетащите приложение в «Программы».`,
          confirmText: "Скачать",
          danger: false,
        }).then((yes) => yes && api.app.openExternal(event.download || event.url));
      }
      if (event.type === "downloaded") {
        IB.confirmDialog({
          title: "Обновление готово",
          text: `Версия ${event.version} загружена. Перезапустить лаунчер и установить её сейчас?`,
          confirmText: "Перезапустить",
          danger: false,
        }).then((yes) => yes && api.updates.install());
      }
    });
  }

  // ---------- запуск ----------
  async function init() {
    renderNav();
    wireTopbar();
    wireEvents();
    parallax();
    try {
      S.info = await api.app.info();
      if (S.info.platform === "darwin") document.body.classList.add("is-mac");
      const pill = document.getElementById("app-version");
      pill.textContent = `v${S.info.version}`;
      pill.hidden = false;
      document.getElementById("win-max").innerHTML = IB.icon(S.info.maximized ? "restore" : "maximize");
      await loadSettings();
      IB.applyAppearance(await api.appearance.get().catch(() => null));
      IB.i18n.start(S.settings.language || S.settings.language_effective);
      await Promise.all([loadBuilds(), loadAccounts()]);
    } catch (err) {
      toast(`Ошибка запуска интерфейса: ${err.message}`, "error");
    }
    renderSidebarFooter();
    if (IB.effects) {
      IB.effects.apply();
      IB.effects.applyMusic();
    }
    IB.go("home");
    if (S.settings && S.settings.check_launcher_updates) {
      setTimeout(() => api.updates.check().catch(() => {}), 4000);
    }
    if (!IB.selectedAccount()) setTimeout(() => IB.modals.accounts(), 500);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
