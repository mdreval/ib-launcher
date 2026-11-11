/* Сборки: установленные сборки и каталог версий Minecraft (Релиз / Снапшот / Бета / Альфа) */
(function () {
  const IB = window.IB;
  const { h, run, LOADERS } = IB;
  const api = window.ib;
  const S = IB.state;

  const FILTERS = [
    { id: "installed", title: "Установленные" },
    { id: "release", title: "Релиз" },
    { id: "snapshot", title: "Снапшот" },
    { id: "old_beta", title: "Бета" },
    { id: "old_alpha", title: "Альфа" },
  ];
  const TYPE_BADGE = { release: "Релиз", snapshot: "Снапшот", old_beta: "Бета", old_alpha: "Альфа" };

  let filter = "installed";

  function buildRow(b) {
    const st = IB.gameState(b.id);
    const running = st.status === "running";
    const busy = st.status === "installing" || st.status === "preparing" || st.status === "modpack";
    const selected = b.id === S.selected;

    const actions = h("div", { class: "list-row__actions" });
    if (busy) {
      const pct = st.progress && Number.isFinite(st.progress.percent) ? st.progress.percent : null;
      const bar = h("div", { class: `progress${pct === null ? " progress--indeterminate" : ""}` }, h("div", { class: "progress__bar", style: { width: `${pct || 0}%` } }));
      actions.append(h("span", { class: "muted", style: { fontSize: "12.5px" }, text: pct === null ? "Подготовка…" : `${pct}%` }), bar);
    } else if (running) {
      actions.append(h("button", { class: "btn btn--danger btn--sm", html: `${IB.icon("stop")}Остановить`, onClick: (e) => (e.stopPropagation(), IB.actions.stop(b.id)) }));
    } else if (!b.installed) {
      actions.append(h("button", { class: "btn btn--sm", html: `${IB.icon("download")}Установить`, onClick: (e) => (e.stopPropagation(), IB.actions.install(b.id)) }));
    } else {
      actions.append(h("button", { class: "btn btn--primary btn--sm", html: `${IB.icon("play")}Играть`, onClick: (e) => (e.stopPropagation(), IB.actions.play(b.id)) }));
    }
    const stop = (fn) => (e) => {
      e.stopPropagation();
      fn();
    };
    actions.append(
      h("button", { class: "icon-btn icon-btn--plain", title: "Моды", html: IB.icon("cube"), onClick: stop(() => IB.actions.openContent(b.id)) }),
      h("button", { class: "icon-btn icon-btn--plain", title: "Настройки сборки", html: IB.icon("gear"), onClick: stop(() => IB.modals.buildSettings(b.id)) }),
      h("button", { class: "icon-btn icon-btn--plain", title: "Папка сборки", html: IB.icon("folder"), onClick: stop(() => IB.actions.openFolder(b.id)) })
    );
    if (b.kind !== "server") {
      actions.append(
        h("button", {
          class: "icon-btn icon-btn--plain icon-btn--danger",
          title: "Удалить сборку",
          html: IB.icon("close"),
          disabled: running || busy,
          onClick: stop(async () => {
            const yes = await IB.confirmDialog({
              title: "Удалить сборку?",
              text: `Будет удалена только папка сборки «${b.name}» (её моды, ресурспаки, шейдеры и миры). Общие файлы игры и другие сборки останутся.`,
            });
            if (yes) run(() => api.builds.remove(b.id), { success: "Сборка удалена" });
          }),
        })
      );
    }

    const badges = [
      b.loader_type !== "vanilla" ? h("span", { class: "badge badge--loader", style: { "--loader-color": IB.loaderColor(b.loader_type) }, text: LOADERS[b.loader_type].short }) : h("span", { class: "badge", text: "Vanilla" }),
      b.kind === "server" ? h("span", { class: "badge badge--accent", text: "Сервер" }) : null,
      selected ? h("span", { class: "badge badge--warning", text: "Выбрано" }) : null,
      !b.installed && !busy && !running ? h("span", { class: "badge", text: "Не установлена" }) : null,
    ];

    return h(
      "div",
      { class: `list-row${selected ? " is-selected" : ""}`, style: { cursor: "pointer" }, onClick: () => !selected && IB.actions.select(b.id) },
      h("div", { class: "list-row__icon" }, h("img", { src: IB.buildIcon(b), alt: "" }), h("span", { class: "dot", style: { background: IB.loaderColor(b.loader_type) } })),
      h("div", { class: "list-row__main" }, h("div", { class: "list-row__title" }, b.name, badges), h("div", { class: "list-row__sub", text: IB.buildSubtitle(b) + (b.last_played ? ` · играли ${IB.fmt.ago(b.last_played)}` : "") })),
      actions
    );
  }

  function versionRow(v) {
    const existing = S.builds.find((b) => b.loader_type === "vanilla" && b.mc_version === v.id);
    const actions = h("div", { class: "list-row__actions" });
    if (existing) {
      actions.append(
        h("span", { class: "badge badge--accent", text: "Установлено" }),
        h("button", { class: "btn btn--primary btn--sm", html: `${IB.icon("play")}Играть`, onClick: () => IB.actions.play(existing.id) })
      );
    } else {
      const btn = h("button", { class: "btn btn--sm", html: `${IB.icon("download")}Установить` });
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Создание…';
        const build = await run(() => api.builds.create({ name: `Minecraft ${v.id}`, mc_version: v.id, loader_type: "vanilla" }));
        if (build) {
          IB.toast(`Устанавливаю Minecraft ${v.id}`, "info");
          IB.actions.install(build.id);
        } else {
          btn.disabled = false;
          btn.innerHTML = `${IB.icon("download")}Установить`;
        }
      });
      actions.append(btn);
    }
    return h(
      "div",
      { class: "list-row" },
      h("div", { class: "list-row__icon" }, h("img", { src: "../../assets/ui/nav-home.png", alt: "" })),
      h("div", { class: "list-row__main" }, h("div", { class: "list-row__title" }, v.id, h("span", { class: "badge", text: TYPE_BADGE[v.type] || v.type })), h("div", { class: "list-row__sub", text: IB.fmt.longDate(v.releaseTime) })),
      actions
    );
  }

  IB.pages.builds = {
    mount(host) {
      const page = h("section", { class: "page" });
      host.append(page);
      const search = h("input", { class: "input", placeholder: "Поиск по версии или названию", spellcheck: "false" });
      const chips = h("div", { class: "row", style: { gap: "8px" } });
      const listEl = h("div", { class: "list" });
      let catalog = null;
      let limit = 60;

      page.append(
        h(
          "div",
          { class: "page-head" },
          h("div", {}, h("h1", { text: "Сборки" }), h("p", { text: "Свои сборки с Fabric, Forge, NeoForge или Quilt и чистые версии Minecraft Java Edition." })),
          h("button", { class: "btn btn--primary", html: `${IB.icon("plus")}Создать сборку`, onClick: () => IB.modals.newBuild() })
        ),
        h("div", { class: "toolbar" }, h("div", { class: "search" }, IB.iconEl("search"), search), chips),
        listEl
      );

      function renderChips() {
        chips.textContent = "";
        for (const f of FILTERS) {
          const label = f.id === "installed" ? `${f.title} (${S.builds.length})` : f.title;
          chips.append(
            h("button", {
              class: "chip",
              "aria-pressed": String(filter === f.id),
              text: label,
              onClick: () => {
                filter = f.id;
                limit = 60;
                renderChips();
                renderList();
              },
            })
          );
        }
      }

      async function renderList() {
        const q = search.value.trim().toLowerCase();
        listEl.textContent = "";
        if (filter === "installed") {
          const items = S.builds.filter((b) => !q || b.name.toLowerCase().includes(q) || b.mc_version.includes(q));
          if (!items.length) {
            listEl.append(h("div", { class: "empty" }, IB.iconEl("cube"), q ? "Ничего не найдено" : "Сборок пока нет"));
            return;
          }
          items.forEach((b, i) => {
            const row = buildRow(b);
            row.style.animationDelay = `${Math.min(i, 10) * 30}ms`;
            listEl.append(row);
          });
          return;
        }
        if (!catalog) {
          for (let i = 0; i < 6; i += 1) listEl.append(h("div", { class: "skeleton", style: { height: "72px" } }));
          try {
            catalog = await IB.versionCatalog();
          } catch (err) {
            listEl.textContent = "";
            listEl.append(h("div", { class: "empty" }, IB.iconEl("alert"), err.message));
            return;
          }
          listEl.textContent = "";
        }
        const items = catalog.filter((v) => v.type === filter && (!q || v.id.toLowerCase().includes(q)));
        if (!items.length) {
          listEl.append(h("div", { class: "empty" }, IB.iconEl("search"), "Ничего не найдено"));
          return;
        }
        items.slice(0, limit).forEach((v, i) => {
          const row = versionRow(v);
          row.style.animationDelay = `${Math.min(i, 12) * 25}ms`;
          listEl.append(row);
        });
        if (items.length > limit) {
          listEl.append(
            h("button", {
              class: "btn",
              style: { alignSelf: "center", marginTop: "8px" },
              text: `Показать ещё (${items.length - limit})`,
              onClick: () => {
                limit += 80;
                renderList();
              },
            })
          );
        }
      }

      search.addEventListener("input", IB.debounce(renderList, 150));
      renderChips();
      renderList();

      return {
        update(kind, detail) {
          if (kind === "builds") {
            renderChips();
            renderList();
          }
          if (kind === "game" && filter === "installed") {
            const id = detail && detail.buildId;
            const idx = S.builds.findIndex((b) => b.id === id);
            const row = listEl.children[idx];
            if (row && !search.value) row.replaceWith(buildRow(S.builds[idx]));
            else renderList();
          }
        },
      };
    },
  };
})();
