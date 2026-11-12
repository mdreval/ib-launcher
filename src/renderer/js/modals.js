/* Модальные окна: аккаунты, Ely.by, журнал игры, новая сборка, настройки сборки, выбор сборки */
(function () {
  const IB = window.IB;
  const { h, run, toast, modal, LOADERS } = IB;
  const api = window.ib;
  const S = IB.state;

  const TYPE_LABEL = { offline: "Офлайн", microsoft: "Microsoft", ely: "Ely.by" };

  function busyButton(btn, busy, text) {
    btn.disabled = busy;
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span>${IB.escapeHtml(text || "")}`;
    } else if (btn.dataset.label) {
      btn.innerHTML = btn.dataset.label;
    }
  }

  // =================== Аккаунты ===================
  function accounts() {
    const listEl = h("div", { class: "account-list" });
    const nameInput = h("input", { class: "input", placeholder: "Ник без пробелов, 4–16 символов", maxlength: "16", spellcheck: "false" });
    const error = h("div", { class: "field__error" });
    const addOffline = h("button", { class: "btn btn--block", text: "Добавить офлайн-профиль" });
    const msBtn = h("button", { class: "btn btn--primary btn--block", html: `${IB.icon("user")}Войти через Microsoft` });
    const elyBtn = h("button", { class: "btn btn--block", text: "Войти через Ely.by" });

    async function renderList() {
      listEl.textContent = "";
      if (!S.accounts.length) {
        listEl.append(h("div", { class: "notice notice--info", html: `${IB.icon("info")}<div>Аккаунтов пока нет. Для игры на IGROBAR достаточно ника — добавьте офлайн-профиль ниже.</div>` }));
        return;
      }
      for (const acc of S.accounts) {
        const avatar = h("div", { class: "avatar-tile" });
        api.skins
          .get(acc.id)
          .then((skin) => IB.skin.avatarFor(skin.dataUrl))
          .then((url) => avatar.append(h("img", { class: "pixelated", src: url, alt: "" })))
          .catch(() => {});
        const removeBtn = h("button", {
          class: "icon-btn icon-btn--plain icon-btn--danger",
          title: "Удалить аккаунт",
          html: IB.icon("close"),
          onClick: async (e) => {
            e.stopPropagation();
            const yes = await IB.confirmDialog({ title: "Удалить аккаунт?", text: `Профиль ${acc.name} будет удалён из лаунчера.` });
            if (yes) await run(() => api.accounts.remove(acc.id));
          },
        });
        listEl.append(
          h(
            "div",
            {
              class: `account-row${acc.selected ? " is-selected" : ""}`,
              onClick: () => !acc.selected && run(() => api.accounts.select(acc.id)),
            },
            avatar,
            h("div", { class: "grow" }, h("div", { class: "account-row__name", text: acc.name }), h("div", { class: "account-row__type", text: TYPE_LABEL[acc.type] || acc.type })),
            h("span", { class: `badge ${acc.type === "offline" ? "" : "badge--accent"}`, text: TYPE_LABEL[acc.type] }),
            removeBtn,
            h("span", { class: `radio${acc.selected ? " is-on" : ""}` })
          )
        );
      }
    }

    addOffline.addEventListener("click", async () => {
      error.textContent = "";
      try {
        await api.accounts.addOffline(nameInput.value);
        nameInput.value = "";
        toast("Офлайн-профиль добавлен", "success");
      } catch (err) {
        error.textContent = err.message;
      }
    });
    nameInput.addEventListener("keydown", (e) => e.key === "Enter" && addOffline.click());

    msBtn.addEventListener("click", async () => {
      busyButton(msBtn, true, "Ожидание входа в окне Microsoft…");
      await run(() => api.accounts.addMicrosoft(), { success: (acc) => `Вход выполнен: ${acc.name}` });
      busyButton(msBtn, false);
    });
    elyBtn.addEventListener("click", () => elyLogin());

    const m = modal({
      title: "Аккаунты",
      content: h(
        "div",
        {},
        listEl,
        h("div", { class: "divider" }),
        h("div", { class: "modal__section-title", style: { marginTop: 0 }, text: "Вход в аккаунт" }),
        h("div", { class: "stack" }, msBtn, elyBtn),
        h("div", { class: "modal__section-title", text: "Офлайн-режим" }),
        h("p", { class: "field__hint", style: { margin: "0 0 10px" }, text: "Играть без входа в Microsoft. Работает на серверах, которые не проверяют лицензию (например, IGROBAR)." }),
        h("div", { class: "stack" }, nameInput, error, addOffline)
      ),
    });

    renderList();
    const off = IB.on("accounts", renderList);
    const offExit = window.ib.on("game:exited", (p) => {
      if (p.buildId === currentId) renderCrash(p.reasons || []);
    });
    const origClose = m.close;
    m.close = () => {
      off();
      offExit();
      origClose();
    };
    return m;
  }

  function elyLogin() {
    const login = h("input", { class: "input", placeholder: "Логин или e-mail", spellcheck: "false" });
    const password = h("input", { class: "input", type: "password", placeholder: "Пароль" });
    const totp = h("input", { class: "input", placeholder: "Код из приложения (если включена 2FA)", inputmode: "numeric", maxlength: "8" });
    const totpField = h("div", { class: "field", style: { display: "none" } }, h("label", { text: "Код двухфакторной защиты" }), totp);
    const error = h("div", { class: "field__error" });
    const submit = h("button", { class: "btn btn--primary", text: "Войти" });
    const cancel = h("button", { class: "btn btn--ghost", text: "Отмена" });

    const m = modal({
      title: "Вход через Ely.by",
      content: h(
        "div",
        {},
        h("div", { class: "field" }, h("label", { text: "Логин" }), login),
        h("div", { class: "field" }, h("label", { text: "Пароль" }), password),
        totpField,
        error,
        h("p", { class: "field__hint", html: 'Нет аккаунта? <a href="https://account.ely.by/register" target="_blank">Зарегистрироваться на ely.by</a>' })
      ),
      footer: [cancel, submit],
    });
    cancel.addEventListener("click", () => m.close());

    async function go() {
      error.textContent = "";
      busyButton(submit, true, "Вход…");
      try {
        const acc = await api.accounts.addEly({ login: login.value, password: password.value, totp: totp.value || undefined });
        toast(`Вход выполнен: ${acc.name}`, "success");
        m.close();
      } catch (err) {
        if (err.code === "ELY_2FA") {
          totpField.style.display = "";
          totp.focus();
        }
        error.textContent = err.message;
      }
      busyButton(submit, false);
    }
    submit.addEventListener("click", go);
    for (const input of [login, password, totp]) input.addEventListener("keydown", (e) => e.key === "Enter" && go());
  }

  // =================== Журнал игры ===================
  function logs(buildId) {
    let currentId = buildId || S.selected;
    const view = h("div", { class: "log-view" });
    const crashBox = h("div", { class: "crash-box", hidden: true });
    const select = h("select", { class: "select", style: { width: "280px" } });
    for (const b of S.builds) select.append(h("option", { value: b.id, text: b.name }));
    select.value = currentId;
    let lines = [];

    function lineEl(l) {
      return h("div", { class: `log-line--${l.level}`, text: l.text });
    }

    function render() {
      view.textContent = "";
      if (!lines.length) {
        view.append(h("div", { class: "muted", text: "Журнал пуст. Здесь появится вывод игры после запуска сборки." }));
        return;
      }
      const frag = document.createDocumentFragment();
      for (const l of lines) frag.append(lineEl(l));
      view.append(frag);
      view.scrollTop = view.scrollHeight;
    }

    /** Понятные причины вылета — над журналом. */
    function renderCrash(reasons) {
      crashBox.textContent = "";
      crashBox.hidden = !(reasons && reasons.length);
      if (crashBox.hidden) return;
      crashBox.append(h("div", { class: "crash-box__head", html: `${IB.icon("alert")}<span>Почему игра закрылась</span>` }));
      for (const r of reasons) {
        crashBox.append(h("div", { class: "crash-box__item" }, h("strong", { text: r.title }), h("p", { text: r.text })));
      }
    }

    async function load() {
      lines = (await api.game.logs(currentId).catch(() => [])) || [];
      render();
      renderCrash(await api.game.crashInfo(currentId).catch(() => []));
    }

    select.addEventListener("change", () => {
      currentId = select.value;
      load();
    });

    const copyBtn = h("button", {
      class: "btn btn--ghost",
      text: "Копировать",
      onClick: () => navigator.clipboard.writeText(lines.map((l) => l.text).join("\n")).then(() => toast("Журнал скопирован", "success")),
    });
    const reportBtn = h("button", {
      class: "btn btn--ghost",
      text: "Скопировать отчёт",
      onClick: async () => {
        const text = await api.game.report(currentId);
        await navigator.clipboard.writeText(text);
        toast("Отчёт скопирован — его можно отправить в чат поддержки", "success");
      },
    });
    const clearBtn = h("button", {
      class: "btn",
      text: "Очистить",
      onClick: async () => {
        await api.game.clearLogs(currentId);
        lines = [];
        render();
      },
    });

    const m = modal({
      title: "Журнал игры",
      xl: true,
      content: h("div", {}, h("div", { class: "row", style: { marginBottom: "12px" } }, h("span", { class: "soft", text: "Сборка:" }), select), crashBox, view),
      footer: [copyBtn, reportBtn, clearBtn],
    });

    const off = IB.on("log", (payload) => {
      if (payload.buildId !== currentId) return;
      if (payload.reset) {
        lines = [];
        render();
        renderCrash([]);
        return;
      }
      const atBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - 40;
      if (!lines.length) view.textContent = "";
      lines.push(...payload.lines);
      for (const l of payload.lines) view.append(lineEl(l));
      while (view.childElementCount > 5000) view.firstElementChild.remove();
      if (atBottom) view.scrollTop = view.scrollHeight;
    });
    const offExit = window.ib.on("game:exited", (p) => {
      if (p.buildId === currentId) renderCrash(p.reasons || []);
    });
    const origClose = m.close;
    m.close = () => {
      off();
      offExit();
      origClose();
    };
    load();
    return m;
  }

  // =================== Новая сборка ===================
  let catalogCache = null;
  async function catalog() {
    if (!catalogCache) catalogCache = await api.versions.catalog();
    return catalogCache;
  }
  IB.versionCatalog = catalog;

  function newBuild(preset = {}) {
    const name = h("input", { class: "input", placeholder: "Название", maxlength: "40" });
    const mcSelect = h("select", { class: "select" }, h("option", { text: "Загрузка версий…" }));
    const snapSwitch = IB.switchEl({ label: "Снапшоты, бета и альфа-версии" });
    const loaderCards = h("div", { class: "loader-cards" });
    const loaderSelect = h("select", { class: "select" });
    const loaderField = h("div", { class: "field" }, h("label", { text: "Версия загрузчика" }), loaderSelect, h("div", { class: "field__hint", text: "Рекомендуемая версия проверена авторами загрузчика. Её можно поменять позже в настройках сборки." }));
    const create = h("button", { class: "btn btn--primary", text: "Создать сборку" });
    const cancel = h("button", { class: "btn btn--ghost", text: "Отмена" });
    let loader = preset.loader_type || "fabric";
    let loaderVersions = { versions: [], recommended: null };
    let token = 0;

    function placeholder() {
      const mc = mcSelect.value || "";
      return `${LOADERS[loader].title === "Без модов" ? "Minecraft" : LOADERS[loader].title} ${mc}`.trim();
    }

    function renderLoaders() {
      loaderCards.textContent = "";
      for (const [id, info] of Object.entries(LOADERS)) {
        const card = h(
          "button",
          { class: "loader-card", type: "button", "aria-pressed": String(id === loader), style: { "--loader-color": IB.loaderColor(id) } },
          h("strong", {}, h("span", { class: "dot" }), info.title),
          h("span", { text: info.desc })
        );
        card.addEventListener("click", () => {
          loader = id;
          renderLoaders();
          refreshLoaderVersions();
        });
        loaderCards.append(card);
      }
      name.placeholder = placeholder();
    }

    async function fillVersions() {
      try {
        const list = await catalog();
        const showAll = snapSwitch.input.checked;
        const prev = mcSelect.value;
        mcSelect.textContent = "";
        const typeLabel = { snapshot: " (снапшот)", old_beta: " (бета)", old_alpha: " (альфа)" };
        for (const v of list) {
          if (!showAll && v.type !== "release") continue;
          mcSelect.append(h("option", { value: v.id, text: v.id + (typeLabel[v.type] || "") }));
        }
        mcSelect.value = preset.mc_version && !prev ? preset.mc_version : prev || (mcSelect.options[0] && mcSelect.options[0].value);
        if (!mcSelect.value && mcSelect.options[0]) mcSelect.value = mcSelect.options[0].value;
        name.placeholder = placeholder();
        refreshLoaderVersions();
      } catch (err) {
        mcSelect.textContent = "";
        mcSelect.append(h("option", { text: "Нет связи с сервером версий" }));
        toast(err.message, "error");
      }
    }

    async function refreshLoaderVersions() {
      name.placeholder = placeholder();
      const my = ++token;
      if (loader === "vanilla") {
        loaderField.style.display = "none";
        create.disabled = !mcSelect.value;
        return;
      }
      loaderField.style.display = "";
      loaderSelect.textContent = "";
      loaderSelect.append(h("option", { text: "Загрузка…" }));
      loaderSelect.disabled = true;
      create.disabled = true;
      try {
        const res = await api.versions.loaders(loader, mcSelect.value);
        if (my !== token) return;
        loaderVersions = res;
        loaderSelect.textContent = "";
        if (!res.versions.length) {
          loaderSelect.append(h("option", { text: `${LOADERS[loader].title} не поддерживает Minecraft ${mcSelect.value}` }));
          return;
        }
        for (const v of res.versions) {
          loaderSelect.append(h("option", { value: v.id, text: v.label + (v.id === res.recommended ? " — рекомендуется" : "") }));
        }
        loaderSelect.value = preset.loader_version && res.versions.some((v) => v.id === preset.loader_version) ? preset.loader_version : res.recommended || res.versions[0].id;
        loaderSelect.disabled = false;
        create.disabled = false;
      } catch (err) {
        if (my !== token) return;
        loaderSelect.textContent = "";
        loaderSelect.append(h("option", { text: "Не удалось загрузить версии загрузчика" }));
      }
    }

    mcSelect.addEventListener("change", refreshLoaderVersions);
    snapSwitch.input.addEventListener("change", fillVersions);

    const m = modal({
      title: "Новая сборка",
      wide: true,
      content: h(
        "div",
        {},
        h("div", { class: "field" }, h("label", { text: "Название" }), name),
        h("div", { class: "field" }, h("label", { text: "Версия Minecraft" }), mcSelect, h("div", { class: "row row--between" }, h("span", { class: "field__hint", text: "Снапшоты, бета и альфа-версии" }), snapSwitch)),
        h("div", { class: "field" }, h("label", { text: "Загрузчик модов" }), loaderCards),
        loaderField
      ),
      footer: [cancel, create],
    });
    cancel.addEventListener("click", () => m.close());
    create.addEventListener("click", async () => {
      busyButton(create, true, "Создание…");
      const build = await run(() =>
        api.builds.create({
          name: name.value.trim() || name.placeholder,
          mc_version: mcSelect.value,
          loader_type: loader,
          loader_version: loader === "vanilla" ? null : loaderSelect.value,
        })
      );
      busyButton(create, false);
      if (build) {
        m.close();
        toast(`Сборка «${build.name}» создана — загружаю файлы игры`, "success");
        IB.actions.install(build.id);
        if (preset.onCreated) preset.onCreated(build);
      }
    });

    renderLoaders();
    fillVersions();
  }

  // =================== Настройки сборки ===================
  const WINDOW_SIZES = [null, [1280, 720], [1600, 900], [1920, 1080]];

  function buildSettings(buildId) {
    const build = IB.buildById(buildId);
    if (!build) return;
    const isServer = build.kind === "server";
    const gb = (mb) => `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0).replace(".", ",")} ГБ`;

    // ---- название и версии ----
    const name = h("input", { class: "input", value: build.name, maxlength: "40", disabled: isServer });
    const loaderSelect = h("select", { class: "select", disabled: isServer || build.loader_type === "vanilla" });
    loaderSelect.append(h("option", { value: build.loader_version || "", text: build.loader_label || "—" }));
    if (!isServer && build.loader_type !== "vanilla") {
      api.versions
        .loaders(build.loader_type, build.mc_version)
        .then((res) => {
          loaderSelect.textContent = "";
          if (build.loader_version && !res.versions.some((v) => v.id === build.loader_version)) {
            loaderSelect.append(h("option", { value: build.loader_version, text: build.loader_label || build.loader_version }));
          }
          for (const v of res.versions) loaderSelect.append(h("option", { value: v.id, text: v.label + (v.id === res.recommended ? " — рекомендуется" : "") }));
          loaderSelect.value = build.loader_version;
        })
        .catch(() => {});
    }

    // ---- память ----
    const total = (S.settings && S.settings.total_ram_mb) || 8192;
    const globalRam = (S.settings && S.settings.ram_mb) || 4096;
    const ownRam = IB.switchEl({ checked: !!build.ram_mb, label: "Своя память для сборки" });
    const ramValue = h("strong", { style: { fontSize: "22px", minWidth: "80px", textAlign: "right" } });
    const ramHint = h("div", { class: "field__hint" });
    const ram = h("input", { class: "range", type: "range", min: "1024", max: String(Math.max(2048, Math.floor((total - 1024) / 512) * 512)), step: "512", value: String(build.ram_mb || globalRam) });
    function paintRam() {
      const own = ownRam.input.checked;
      if (!own) ram.value = String(globalRam);
      ram.disabled = !own;
      ramValue.textContent = gb(+ram.value);
      ramHint.textContent = own ? "Своя память для этой сборки." : `Как в «Настройках»: ${gb(globalRam)}.`;
      ram.style.setProperty("--fill", `${((ram.value - ram.min) / (ram.max - ram.min)) * 100}%`);
      ram.style.opacity = own ? "1" : "0.55";
    }
    ram.addEventListener("input", paintRam);
    ownRam.input.addEventListener("change", paintRam);
    paintRam();

    // ---- окно игры ----
    let windowSize = build.window && build.window.width ? [build.window.width, build.window.height] : null;
    const sizeChips = h("div", { class: "row", style: { gap: "8px", flexWrap: "wrap" } });
    function renderSizes() {
      sizeChips.textContent = "";
      for (const size of WINDOW_SIZES) {
        const active = (!size && !windowSize) || (size && windowSize && size[0] === windowSize[0] && size[1] === windowSize[1]);
        sizeChips.append(
          h("button", {
            class: "chip",
            type: "button",
            "aria-pressed": String(!!active),
            text: size ? `${size[0]} × ${size[1]}` : "Как в игре",
            onClick: () => {
              windowSize = size;
              renderSizes();
            },
          })
        );
      }
    }
    renderSizes();
    const fullscreen = IB.switchEl({ checked: !!build.fullscreen, label: "Полный экран" });

    // ---- аргументы JVM ----
    const jvm = h("textarea", { class: "textarea", placeholder: "Например: -XX:+UseG1GC (добавляются к общим аргументам)" });
    jvm.value = build.jvm_args || "";

    // ---- модпак ----
    let modpackBlock = null;
    if (build.modpack_capable) {
      const sw = IB.switchEl({
        checked: build.modpack_enabled,
        label: "Обновлять модпак",
        onChange: (on) => run(() => api.modpack.setEnabled(build.id, on), { success: on ? "Модпак будет обновляться с GitHub" : "Автообновление модпака выключено" }),
      });
      modpackBlock = h(
        "div",
        { class: "setting-line", style: { marginBottom: "4px" } },
        h("div", {}, h("div", { class: "field__label", text: "Обновлять модпак сервера" }), h("div", { class: "field__hint", text: "Перед запуском проверять GitHub и скачивать изменения модпака IGROBAR." })),
        sw
      );
    }

    const save = h("button", { class: "btn btn--primary", text: "Сохранить" });
    const cancel = h("button", { class: "btn btn--ghost", text: "Отмена" });
    const remove = isServer ? null : h("button", { class: "icon-btn icon-btn--danger", title: "Удалить сборку", html: IB.icon("trash") });
    const folder = h("button", { class: "icon-btn", title: "Папка сборки", html: IB.icon("folder"), onClick: () => IB.actions.openFolder(build.id) });

    const m = modal({
      title: `Настройки «${build.name}»`,
      wide: true,
      content: h(
        "div",
        {},
        isServer ? h("div", { class: "notice notice--info", style: { marginBottom: "16px" }, html: `${IB.icon("info")}<div>Это сборка сервера IGROBAR: версия Minecraft и NeoForge закреплены под сервер.</div>` }) : null,
        isServer ? null : h("div", { class: "field" }, h("label", { text: "Название" }), name),
        h(
          "div",
          { class: "row", style: { gap: "14px", alignItems: "flex-start" } },
          h("div", { class: "field grow" }, h("label", { text: "Версия Minecraft" }), h("input", { class: "input", value: build.mc_version, disabled: true })),
          build.loader_type === "vanilla" ? null : h("div", { class: "field grow" }, h("label", { text: `Версия ${LOADERS[build.loader_type].title}` }), loaderSelect)
        ),
        modpackBlock,
        h("div", { class: "divider", style: { marginTop: "6px" } }),
        h("div", { class: "setting-line" }, h("div", {}, h("div", { class: "field__label", text: "Оперативная память" }), ramHint), ownRam),
        h("div", { class: "ram-row", style: { margin: "12px 0 4px" } }, ram, ramValue),
        h("div", { class: "divider" }),
        h("div", { class: "field" }, h("label", { text: "Размер окна игры" }), sizeChips),
        h(
          "div",
          { class: "setting-line", style: { marginBottom: "16px" } },
          h("div", {}, h("div", { class: "field__label", text: "Полный экран" }), h("div", { class: "field__hint", text: "Игра сразу откроется на весь экран. Переключить можно клавишей F11." })),
          fullscreen
        ),
        h("div", { class: "field", style: { marginBottom: 0 } }, h("label", { text: "Дополнительные аргументы JVM" }), jvm)
      ),
      footer: [remove, folder, h("span", { class: "grow" }), cancel, save],
    });
    cancel.addEventListener("click", () => m.close());

    save.addEventListener("click", async () => {
      const patch = {
        ram_mb: ownRam.input.checked ? parseInt(ram.value, 10) : null,
        jvm_args: jvm.value.trim(),
        window: windowSize ? { width: windowSize[0], height: windowSize[1] } : null,
        fullscreen: fullscreen.input.checked,
      };
      if (!isServer) {
        patch.name = name.value.trim();
        if (build.loader_type !== "vanilla" && loaderSelect.value && loaderSelect.value !== build.loader_version) patch.loader_version = loaderSelect.value;
      }
      const res = await run(() => api.builds.update(build.id, patch), { success: "Настройки сборки сохранены" });
      if (res) m.close();
    });
    if (remove) {
      remove.addEventListener("click", async () => {
        const yes = await IB.confirmDialog({
          title: "Удалить сборку?",
          text: `Будет удалена папка сборки «${build.name}» вместе с её модами и мирами. Общие файлы игры и другие сборки останутся.`,
        });
        if (!yes) return;
        const ok = await run(() => api.builds.remove(build.id), { success: "Сборка удалена" });
        if (ok) m.close();
      });
    }
  }

  // =================== Выбор сборки ===================
  function buildPicker(anchor) {
    const list = h("div", {});
    for (const b of S.builds) {
      const item = h(
        "button",
        { class: "popover__item", "aria-current": String(b.id === S.selected), onClick: () => (IB.closePopover(), IB.actions.select(b.id)) },
        h("span", { class: "list-row__icon", style: { width: "32px", height: "32px" } }, h("img", { src: IB.buildIcon(b), alt: "" }), h("span", { class: "dot", style: { background: IB.loaderColor(b.loader_type) } })),
        h("span", { class: "grow" }, h("div", { style: { fontWeight: 800 }, text: b.name }), h("div", { class: "muted", style: { fontSize: "12px" }, text: IB.buildSubtitle(b) })),
        b.kind === "server" ? h("span", { class: "badge badge--accent", text: "Сервер" }) : null
      );
      list.append(item);
    }
    list.append(
      h("div", { class: "divider", style: { margin: "6px 0" } }),
      h("button", { class: "popover__item", html: `${IB.icon("plus")}<span>Создать сборку</span>`, onClick: () => (IB.closePopover(), newBuild()) })
    );
    IB.popover(anchor, list, { align: "right", above: true });
  }

  IB.modals = { accounts, elyLogin, logs, newBuild, buildSettings, buildPicker };
})();
