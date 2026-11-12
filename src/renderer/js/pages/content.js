/* Моды, ресурспаки и шейдеры: установленное в сборке + каталог Modrinth */
(function () {
  const IB = window.IB;
  const { h, run, toast, fmt, LOADERS } = IB;
  const api = window.ib;
  const S = IB.state;

  const KINDS = [
    { id: "mods", title: "Моды", one: "мод" },
    { id: "resourcepacks", title: "Ресурспаки", one: "ресурспак" },
    { id: "shaderpacks", title: "Шейдеры", one: "шейдер" },
  ];
  // Миры и скриншоты сборки — рисует pages/extras.js
  const EXTRA_KINDS = [
    { id: "worlds", title: "Миры", icon: "globe" },
    { id: "screenshots", title: "Скриншоты", icon: "image" },
  ];
  const isExtra = (kind) => EXTRA_KINDS.some((k) => k.id === kind);

  const SORTS = [
    { id: "downloads", title: "Популярные" },
    { id: "relevance", title: "По релевантности" },
    { id: "follows", title: "Избранные" },
    { id: "newest", title: "Новые" },
    { id: "updated", title: "Обновлённые" },
  ];
  const CATEGORY_RU = {
    adventure: "Приключения", cursed: "Странное", decoration: "Декор", economy: "Экономика", equipment: "Снаряжение",
    food: "Еда", "game-mechanics": "Механики", library: "Библиотеки", magic: "Магия", management: "Управление",
    minigame: "Мини-игры", mobs: "Мобы", optimization: "Оптимизация", social: "Общение", storage: "Хранение",
    technology: "Технологии", transportation: "Транспорт", utility: "Утилиты", worldgen: "Генерация мира",
    "8x-": "8x и меньше", "16x": "16x", "32x": "32x", "48x": "48x", "64x": "64x", "128x": "128x", "256x": "256x", "512x+": "512x и больше",
    audio: "Звуки", blocks: "Блоки", combat: "Бой", "core-shaders": "Core-шейдеры", entities: "Существа", environment: "Окружение",
    fonts: "Шрифты", gui: "Интерфейс", items: "Предметы", locale: "Язык", modded: "Для модов", models: "Модели", realistic: "Реализм",
    simplistic: "Минимализм", themed: "Тематические", tweaks: "Улучшения", "vanilla-like": "Как в ванилле", atmosphere: "Атмосфера",
    bloom: "Свечение", "cartoon": "Мультяшные", "colored-lighting": "Цветное освещение", fantasy: "Фэнтези", foliage: "Листва",
    "path-tracing": "Трассировка путей", pbr: "PBR", reflections: "Отражения", "semi-realistic": "Полуреализм", shadows: "Тени",
  };

  const view = { buildId: null, kind: "mods", mode: "installed", query: "", catalogQuery: "", sort: "downloads", category: "" };

  function catLabel(c) {
    return CATEGORY_RU[c] || c;
  }

  function letterTile(name, icon) {
    const tile = h("div", { class: "avatar-tile" });
    if (icon) {
      const img = h("img", { src: icon, alt: "", class: icon.startsWith("data:") ? "pixelated" : "" });
      img.addEventListener("error", () => {
        img.remove();
        tile.textContent = (name || "?").trim().charAt(0).toUpperCase();
      });
      tile.append(img);
    } else tile.textContent = (name || "?").trim().charAt(0).toUpperCase();
    return tile;
  }

  IB.pages.content = {
    mount(host, params = {}) {
      if (params.buildId) view.buildId = params.buildId;
      if (!view.buildId || !IB.buildById(view.buildId)) view.buildId = S.selected;

      const page = h("section", { class: "page" });
      host.append(page);

      const buildSelect = h("select", { class: "select" });
      const buildMeta = h("div", { class: "row", style: { gap: "8px", fontSize: "12.5px", color: "var(--text-muted)" } });
      const kindTabs = h("div", { class: "row", style: { gap: "8px" } });
      const modeSeg = h("div", { class: "segmented" });
      const toolbar = h("div", { class: "toolbar" });
      const body = h("div", { class: "drop-zone" });
      let installed = { items: [], online: true };
      let loadToken = 0;
      let catalogState = { offset: 0, total: 0, hits: [], loading: false };

      page.append(
        h(
          "div",
          { class: "page-head" },
          h("div", {}, h("h1", { text: "Моды" }), h("p", { text: "Моды, ресурспаки и шейдеры с Modrinth, а ещё миры и скриншоты ваших сборок." })),
          h("div", { class: "content-head-right" }, h("span", { class: "field__label", text: "Сборка" }), buildSelect, buildMeta)
        ),
        h("div", { class: "row row--between", style: { marginBottom: "16px", flexWrap: "wrap" } }, kindTabs, modeSeg),
        toolbar,
        body
      );

      function build() {
        return IB.buildById(view.buildId);
      }

      function renderBuildSelect() {
        buildSelect.textContent = "";
        for (const b of S.builds) buildSelect.append(h("option", { value: b.id, text: `${b.name} — ${IB.LOADERS[b.loader_type].short} · ${b.mc_version}` }));
        if (!IB.buildById(view.buildId)) view.buildId = S.selected;
        buildSelect.value = view.buildId;
        const b = build();
        buildMeta.textContent = "";
        if (b) buildMeta.append(h("span", { class: "dot", style: { background: IB.loaderColor(b.loader_type) } }), IB.buildSubtitle(b));
      }
      buildSelect.addEventListener("change", () => {
        view.buildId = buildSelect.value;
        renderBuildSelect();
        refresh();
      });

      function renderTabs() {
        kindTabs.textContent = "";
        for (const k of KINDS) {
          kindTabs.append(
            h("button", {
              class: "chip",
              "aria-pressed": String(view.kind === k.id),
              text: k.title,
              onClick: () => {
                view.kind = k.id;
                view.category = "";
                renderTabs();
                refresh();
              },
            })
          );
        }
        kindTabs.append(h("span", { class: "chip-sep" }));
        for (const k of EXTRA_KINDS) {
          kindTabs.append(
            h("button", {
              class: "chip",
              "aria-pressed": String(view.kind === k.id),
              html: `${IB.icon(k.icon)}${k.title}`,
              onClick: () => {
                view.kind = k.id;
                renderTabs();
                refresh();
              },
            })
          );
        }
        modeSeg.textContent = "";
        modeSeg.hidden = isExtra(view.kind);
        if (modeSeg.hidden) return;
        modeSeg.append(
          h("button", {
            "aria-pressed": String(view.mode === "installed"),
            text: `Установлено · ${installed.count ?? installed.items.length}`,
            onClick: () => {
              view.mode = "installed";
              renderTabs();
              refresh();
            },
          }),
          h("button", {
            "aria-pressed": String(view.mode === "catalog"),
            text: "Каталог Modrinth",
            onClick: () => {
              view.mode = "catalog";
              renderTabs();
              refresh();
            },
          })
        );
      }

      // ---------- установленное ----------
      function renderInstalledToolbar() {
        toolbar.textContent = "";
        const search = h("input", { class: "input", placeholder: "Найти среди установленных", value: view.query, spellcheck: "false" });
        search.addEventListener(
          "input",
          IB.debounce(() => {
            view.query = search.value;
            renderInstalled();
          }, 120)
        );
        const updates = installed.items.filter((i) => i.update).length;
        const updateAll = h("button", { class: `btn ${updates ? "btn--primary" : ""}`, disabled: !updates, html: `${IB.icon("download")}Обновить все${updates ? ` (${updates})` : ""}` });
        updateAll.addEventListener("click", async () => {
          updateAll.disabled = true;
          updateAll.innerHTML = '<span class="spinner"></span>Обновление…';
          const res = await run(() => api.content.updateAll(view.buildId, view.kind));
          if (res) {
            if (res.updated.length) toast(`Обновлено: ${res.updated.length}`, "success");
            if (res.failed.length) toast(`Не удалось обновить: ${res.failed.join("; ")}`, "error");
          }
          refresh();
        });
        toolbar.append(
          h("div", { class: "search" }, IB.iconEl("search"), search),
          h("span", { class: "grow" }),
          updateAll,
          h("button", {
            class: "btn",
            html: `${IB.icon("plus")}Добавить файлы`,
            onClick: async () => {
              const res = await run(() => api.content.addFiles(view.buildId, view.kind));
              if (res && res.added.length) toast(`Добавлено: ${res.added.length}`, "success");
              refresh();
            },
          }),
          h("button", { class: "icon-btn", title: "Открыть папку", html: IB.icon("folder"), onClick: () => run(() => api.content.openFolder(view.buildId, view.kind)) })
        );
      }

      function itemRow(item) {
        const kind = view.kind;
        const badges = [];
        if (item.modpack) badges.push(h("span", { class: "badge badge--accent", title: "Этот мод ставит и обновляет модпак сервера", text: "Модпак" }));
        if (item.source === "local") badges.push(h("span", { class: "badge", title: "Файл не найден на Modrinth — добавлен вручную", text: "Свой файл" }));
        for (const issue of item.issues) badges.push(h("span", { class: "badge badge--danger", text: issue.text }));
        if (item.update) badges.push(h("span", { class: "badge badge--accent", text: `Обновление ${item.update.versionNumber || ""}`.trim() }));

        const actions = h("div", { class: "list-row__actions" });
        if (item.issues.length && item.projectId) {
          const fixBtn = h("button", { class: "btn btn--primary btn--sm", text: "Исправить" });
          fixBtn.addEventListener("click", async () => {
            fixBtn.disabled = true;
            fixBtn.innerHTML = '<span class="spinner"></span>Исправляю…';
            await run(() => api.content.fix(view.buildId, kind, item.file), { success: "Готово" });
            refresh();
          });
          actions.append(fixBtn);
        } else if (item.update) {
          const upBtn = h("button", { class: "btn btn--sm", html: `${IB.icon("download")}Обновить` });
          upBtn.addEventListener("click", async () => {
            upBtn.disabled = true;
            upBtn.innerHTML = '<span class="spinner"></span>';
            await run(() => api.content.update(view.buildId, kind, item.file), { success: `${item.name} обновлён` });
            refresh();
          });
          actions.append(upBtn);
        }
        actions.append(
          IB.switchEl({
            checked: item.enabled,
            label: item.enabled ? "Выключить" : "Включить",
            onChange: async (on) => {
              await run(() => api.content.toggle(view.buildId, kind, item.file, on));
              refresh(true);
            },
          }),
          h("button", {
            class: "icon-btn icon-btn--plain icon-btn--danger",
            title: "Удалить",
            html: IB.icon("close"),
            onClick: async () => {
              const yes = await IB.confirmDialog({
                title: `Удалить ${KINDS.find((k) => k.id === kind).one}?`,
                text: item.modpack ? `${item.name} входит в модпак сервера — при следующем обновлении модпака он вернётся. Чтобы он не загружался, лучше просто выключить его.` : `Файл ${item.file} будет удалён из сборки.`,
              });
              if (!yes) return;
              await run(() => api.content.remove(view.buildId, kind, item.file));
              refresh(true);
            },
          })
        );

        const sub = [item.version, item.file, fmt.bytes(item.size)].filter(Boolean).join(" · ");
        return h(
          "div",
          { class: `list-row mod-row${item.enabled ? "" : " is-disabled"}` },
          letterTile(item.name, item.icon),
          h("div", { class: "list-row__main" }, h("div", { class: "list-row__title" }, item.name, badges), h("div", { class: "list-row__sub", text: sub })),
          actions
        );
      }

      function renderInstalled() {
        body.textContent = "";
        const b = build();
        if (view.kind === "mods" && b && b.loader_type === "vanilla") {
          body.append(h("div", { class: "notice", style: { marginBottom: "14px" }, html: `${IB.icon("alert")}<div>В сборке без загрузчика моды не работают. Создайте сборку с Fabric, Forge, NeoForge или Quilt.</div>` }));
        }
        if (view.kind === "shaderpacks" && b && !["fabric", "quilt", "neoforge", "forge"].includes(b.loader_type)) {
          body.append(h("div", { class: "notice notice--info", style: { marginBottom: "14px" }, html: `${IB.icon("info")}<div>Для шейдеров нужен мод Iris (Fabric/NeoForge) или OptiFine — поставьте его во вкладке «Моды».</div>` }));
        }
        if (!installed.online) {
          body.append(h("div", { class: "notice notice--info", style: { marginBottom: "14px" }, html: `${IB.icon("info")}<div>Нет связи с Modrinth — показаны данные из самих файлов, обновления не проверяются.</div>` }));
        }
        const q = view.query.trim().toLowerCase();
        const items = installed.items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.file.toLowerCase().includes(q));
        if (!items.length) {
          body.append(
            h(
              "div",
              { class: "empty" },
              IB.iconEl("cube"),
              q ? "Ничего не найдено" : `Здесь пока пусто. Найдите ${KINDS.find((k) => k.id === view.kind).one} в каталоге Modrinth или перетащите файлы сюда.`,
              q ? null : h("button", { class: "btn btn--primary", text: "Открыть каталог Modrinth", onClick: () => ((view.mode = "catalog"), renderTabs(), refresh()) })
            )
          );
          return;
        }
        const list = h("div", { class: "list" });
        items.forEach((item, i) => {
          const row = itemRow(item);
          row.style.animationDelay = `${Math.min(i, 12) * 20}ms`;
          list.append(row);
        });
        body.append(list);
      }

      async function loadInstalled(quiet) {
        const my = ++loadToken;
        if (!quiet) {
          body.textContent = "";
          const sk = h("div", { class: "list" });
          for (let i = 0; i < 6; i += 1) sk.append(h("div", { class: "skeleton", style: { height: "66px" } }));
          body.append(sk);
        }
        try {
          const res = await api.content.list(view.buildId, view.kind);
          if (my !== loadToken) return;
          installed = res;
        } catch (err) {
          if (my !== loadToken) return;
          installed = { items: [], online: false };
          toast(err.message, "error");
        }
        renderTabs();
        renderInstalledToolbar();
        renderInstalled();
      }

      // ---------- каталог ----------
      async function renderCatalogToolbar() {
        toolbar.textContent = "";
        const search = h("input", { class: "input", placeholder: "Поиск на Modrinth", value: view.catalogQuery, spellcheck: "false" });
        search.addEventListener(
          "input",
          IB.debounce(() => {
            view.catalogQuery = search.value;
            loadCatalog(true);
          }, 350)
        );
        const sort = h("select", { class: "select", style: { width: "200px" } });
        for (const s of SORTS) sort.append(h("option", { value: s.id, text: s.title }));
        sort.value = view.sort;
        sort.addEventListener("change", () => {
          view.sort = sort.value;
          loadCatalog(true);
        });
        const cat = h("select", { class: "select", style: { width: "220px" } }, h("option", { value: "", text: "Все категории" }));
        api.content
          .categories(view.kind)
          .then((list) => {
            for (const c of list) cat.append(h("option", { value: c, text: catLabel(c) }));
            cat.value = view.category;
          })
          .catch(() => {});
        cat.addEventListener("change", () => {
          view.category = cat.value;
          loadCatalog(true);
        });
        toolbar.append(h("div", { class: "search", style: { maxWidth: "460px" } }, IB.iconEl("search"), search), sort, cat);
      }

      function catalogCard(hit) {
        const side = h("div", { class: "catalog-card__side" });
        function renderSide() {
          side.textContent = "";
          if (hit.installed) side.append(h("span", { class: "badge badge--accent", text: "Установлен" }));
          else {
            const btn = h("button", { class: "btn btn--primary btn--sm", html: `${IB.icon("download")}Установить` });
            btn.addEventListener("click", async () => {
              btn.disabled = true;
              btn.innerHTML = '<span class="spinner"></span>Установка…';
              const res = await run(() => api.content.install(view.buildId, view.kind, hit.projectId));
              if (res) {
                hit.installed = true;
                toast(res.length > 1 ? `${hit.title} установлен вместе с зависимостями (${res.length - 1})` : `${hit.title} установлен`, "success");
                installed.count = (installed.count ?? installed.items.length) + res.length;
                renderTabs();
              }
              renderSide();
            });
            side.append(btn);
          }
        }
        renderSide();
        return h(
          "div",
          { class: "catalog-card" },
          letterTile(hit.title, hit.icon),
          h(
            "div",
            { class: "catalog-card__body" },
            h("div", { class: "catalog-card__title" }, hit.title, h("span", { text: hit.author })),
            h("div", { class: "catalog-card__desc", text: hit.description }),
            h(
              "div",
              { class: "catalog-card__meta" },
              h("span", { html: `${IB.icon("download")} ${fmt.count(hit.downloads)}` }),
              h("span", { text: fmt.ago(hit.updated) }),
              ...hit.categories.slice(0, 2).map((c) => h("span", { class: "badge", text: catLabel(c) }))
            )
          ),
          side
        );
      }

      async function loadCatalog(reset) {
        const my = ++loadToken;
        if (reset) {
          catalogState = { offset: 0, total: 0, hits: [], loading: true };
          body.textContent = "";
          const grid = h("div", { class: "catalog-grid" });
          for (let i = 0; i < 8; i += 1) grid.append(h("div", { class: "skeleton", style: { height: "122px" } }));
          body.append(grid);
        }
        const b = build();
        if (view.kind === "mods" && b && b.loader_type === "vanilla") {
          body.textContent = "";
          body.append(h("div", { class: "notice", html: `${IB.icon("alert")}<div>В сборке без загрузчика моды не работают. Выберите сборку с Fabric, Forge, NeoForge или Quilt.</div>` }));
          return;
        }
        try {
          const res = await api.content.search(view.buildId, view.kind, { query: view.catalogQuery, index: view.sort, category: view.category, offset: catalogState.offset });
          if (my !== loadToken) return;
          catalogState.hits.push(...res.hits);
          catalogState.total = res.total;
          catalogState.offset += res.hits.length;
        } catch (err) {
          if (my !== loadToken) return;
          body.textContent = "";
          body.append(h("div", { class: "empty" }, IB.iconEl("alert"), err.message, h("button", { class: "btn", text: "Повторить", onClick: () => loadCatalog(true) })));
          return;
        }
        body.textContent = "";
        if (!catalogState.hits.length) {
          body.append(h("div", { class: "empty" }, IB.iconEl("search"), `Ничего не найдено для ${b ? `${LOADERS[b.loader_type].short} ${b.mc_version}` : "этой сборки"}`));
          return;
        }
        const grid = h("div", { class: "catalog-grid" });
        for (const hit of catalogState.hits) grid.append(catalogCard(hit));
        body.append(grid);
        if (catalogState.offset < catalogState.total) {
          const more = h("button", { class: "btn", style: { display: "flex", margin: "16px auto 0" }, text: "Показать ещё" });
          more.addEventListener("click", () => {
            more.disabled = true;
            more.innerHTML = '<span class="spinner"></span>Загрузка…';
            loadCatalog(false);
          });
          body.append(more);
        }
      }

      function refresh(quiet) {
        if (!build()) {
          toolbar.textContent = "";
          body.textContent = "";
          body.append(h("div", { class: "empty" }, IB.iconEl("cube"), "Сначала создайте сборку"));
          return;
        }
        if (isExtra(view.kind)) {
          const fn = view.kind === "worlds" ? IB.extras.worlds : IB.extras.screenshots;
          fn({ toolbar, body, buildId: view.buildId, quiet });
          return;
        }
        if (view.mode === "installed") loadInstalled(quiet);
        else {
          renderCatalogToolbar();
          loadCatalog(true);
        }
      }

      // перетаскивание файлов
      body.addEventListener("dragover", (e) => {
        if (view.kind === "screenshots") return;
        if (view.mode !== "installed" && !isExtra(view.kind)) return;
        e.preventDefault();
        body.classList.add("is-over");
      });
      body.addEventListener("dragleave", (e) => {
        if (!body.contains(e.relatedTarget)) body.classList.remove("is-over");
      });
      body.addEventListener("drop", async (e) => {
        e.preventDefault();
        body.classList.remove("is-over");
        if (view.kind === "screenshots") return;
        if (view.mode !== "installed" && !isExtra(view.kind)) return;
        const paths = [...e.dataTransfer.files].map((f) => api.files.pathFor(f)).filter(Boolean);
        if (!paths.length) return;
        if (view.kind === "worlds") {
          for (const file of paths) await run(() => api.worlds.importPath(view.buildId, file), { success: "Мир добавлен" });
          refresh();
          return;
        }
        const res = await run(() => api.content.addPaths(view.buildId, view.kind, paths));
        if (res) {
          if (res.added.length) toast(`Добавлено: ${res.added.length}`, "success");
          if (res.skipped.length) toast(`Пропущены (неверный формат): ${res.skipped.join(", ")}`, "error");
        }
        refresh();
      });

      renderBuildSelect();
      renderTabs();
      refresh();

      return {
        update(kind) {
          if (kind === "builds") renderBuildSelect();
        },
      };
    },
  };
})();
