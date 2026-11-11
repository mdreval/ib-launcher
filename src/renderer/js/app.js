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
  IB.applyAppearance = (a) => {
    if (!a) return;
    S.appearance = a;
    const root = document.documentElement;
    root.dataset.theme = a.theme === "red" ? "red" : "green";
    if (a.background === "custom" && a.customDataUrl) {
      root.style.setProperty("--app-bg-image", `url("${a.customDataUrl}")`);
      root.setAttribute("data-custom-bg", "");
      root.style.setProperty("--bg-dim", String(a.bg_dim ?? 0.7));
    } else {
      root.style.removeProperty("--app-bg-image");
      root.removeAttribute("data-custom-bg");
      root.style.removeProperty("--bg-dim");
    }
    const logo = document.querySelector(".sidebar__logo");
    if (logo) logo.src = a.theme === "red" ? "../../assets/ui/logo-red.png" : "../../assets/ui/logo.png";
    IB.emit("appearance");
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
      indicator.style.transform = `translateY(${idx * 64}px)`;
    } else indicator.style.opacity = "0";
  }

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
  for (const name of ["builds", "accounts", "skin", "settings", "game", "log"]) {
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
    const tg = (server && server.telegram) || "https://t.me/igrobar";
    footer.append(
      h("button", { class: "social-btn", title: "Telegram IGROBAR", html: IB.icon("telegram"), onClick: () => api.app.openExternal(tg) }),
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
    api.on("game:exited", ({ buildId, exitCode, crashed }) => {
      if (crashed) {
        toast(`Игра завершилась с ошибкой (код ${exitCode}). Подробности — в «Журнале игры».`, "error");
        IB.modals.logs(buildId);
      }
    });
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
    IB.go("home");
    if (S.settings && S.settings.check_launcher_updates) {
      setTimeout(() => api.updates.check().catch(() => {}), 4000);
    }
    if (!IB.selectedAccount()) setTimeout(() => IB.modals.accounts(), 500);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
