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

  function progressPercent(st) {
    if (st.status === "cancelling") return null;
    return st.progress && Number.isFinite(st.progress.percent) ? st.progress.percent : null;
  }

  function progressLabel(st, pct) {
    if (st.status === "cancelling") return (st.progress && st.progress.text) || "Отмена…";
    return pct === null ? "Подготовка…" : `${pct}%`;
  }

  /** «Отмена» во время установки / подготовки запуска. */
  function cancelButton(buildId, st) {
    const cancelling = st.status === "cancelling";
    return h("button", {
      class: "btn btn--sm build-cancel",
      title: cancelling ? "Отменяется…" : "Отменить и удалить уже скачанное",
      disabled: cancelling,
      html: cancelling ? '<span class="spinner"></span>Отмена…' : `${IB.icon("close")}Отмена`,
      onClick: (e) => {
        e.stopPropagation();
        IB.actions.cancel(buildId);
      },
    });
  }

  /** Обновляет строку сборки без пересоздания, если это просто новый
   * процент загрузки — иначе строка «моргала» при каждом событии. */
  function patchRow(row, b) {
    const st = IB.gameState(b.id);
    const busyNow = ["installing", "preparing", "modpack"].includes(st.status);
    const bar = row.querySelector(".list-row__actions .progress__bar");
    const label = row.querySelector(".build-progress__label");
    const cancelBtn = row.querySelector(".build-cancel");
    if (!busyNow || !bar || !label || !cancelBtn || cancelBtn.disabled) return false;
    const pct = progressPercent(st);
    bar.parentElement.classList.toggle("progress--indeterminate", pct === null);
    bar.style.width = `${pct || 0}%`;
    label.textContent = progressLabel(st, pct);
    return true;
  }

  function buildRow(b) {
    const st = IB.gameState(b.id);
    const running = st.status === "running";
    const busy = st.status === "installing" || st.status === "preparing" || st.status === "modpack" || st.status === "cancelling";
    const selected = b.id === S.selected;

    const actions = h("div", { class: "list-row__actions" });
    if (busy) {
      const pct = progressPercent(st);
      const bar = h("div", { class: `progress${pct === null ? " progress--indeterminate" : ""}` }, h("div", { class: "progress__bar", style: { width: `${pct || 0}%` } }));
      actions.append(h("span", { class: "muted build-progress__label", style: { fontSize: "12.5px" }, text: progressLabel(st, pct) }), bar, cancelButton(b.id, st));
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
      h("button", { class: "icon-btn icon-btn--plain", title: "Папка сборки", html: IB.icon("folder"), onClick: stop(() => IB.actions.openFolder(b.id)) }),
      h("button", { class: "icon-btn icon-btn--plain", title: "Экспорт сборки в файл", html: IB.icon("upload"), disabled: !b.installed, onClick: stop(() => IB.extras.exportBuild(b.id)) })
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

  /** Чистая сборка этой версии: сначала установленная, иначе любая. */
  function vanillaBuildFor(version) {
    const all = S.builds.filter((b) => b.loader_type === "vanilla" && b.mc_version === version);
    return all.find((b) => b.installed) || all.find((b) => IB.gameState(b.id).status !== "idle") || all[0] || null;
  }

  function versionRow(v) {
    const existing = vanillaBuildFor(v.id);
    const st = existing ? IB.gameState(existing.id) : { status: "idle" };
    const busy = ["installing", "preparing", "modpack", "cancelling"].includes(st.status);
    const actions = h("div", { class: "list-row__actions" });
    if (existing && busy) {
      // Установка идёт прямо здесь — проценты и «Отмена» в этой же строке.
      const pct = progressPercent(st);
      const bar = h("div", { class: `progress${pct === null ? " progress--indeterminate" : ""}` }, h("div", { class: "progress__bar", style: { width: `${pct || 0}%` } }));
      actions.append(h("span", { class: "muted build-progress__label", style: { fontSize: "12.5px" }, text: progressLabel(st, pct) }), bar, cancelButton(existing.id, st));
    } else if (existing && st.status === "running") {
      actions.append(h("button", { class: "btn btn--danger btn--sm", html: `${IB.icon("stop")}Остановить`, onClick: () => IB.actions.stop(existing.id) }));
    } else if (existing && !existing.installed) {
      actions.append(h("button", { class: "btn btn--sm", html: `${IB.icon("download")}Установить`, onClick: () => IB.actions.install(existing.id) }));
    } else if (existing) {
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
      { class: "list-row", dataset: { version: v.id } },
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
          h(
            "div",
            { class: "row", style: { gap: "8px" } },
            h("button", {
              class: "btn",
              title: "Открыть сборку из файла .ibpack (экспорт этого лаунчера) или .mrpack (модпак Modrinth). Файл можно и просто перетащить в окно.",
              html: `${IB.icon("download")}Импорт`,
              onClick: () => IB.extras.importBuild(),
            }),
            h("button", { class: "btn btn--primary", html: `${IB.icon("plus")}Создать сборку`, onClick: () => IB.modals.newBuild() })
          )
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

      async function renderList(animate = true) {
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
            // Перерисовка из-за смены состояния (запуск, установка) — без
            // анимации появления, иначе весь список «моргает».
            if (animate) row.style.animationDelay = `${Math.min(i, 10) * 30}ms`;
            else row.style.animation = "none";
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
          if (animate) row.style.animationDelay = `${Math.min(i, 12) * 25}ms`;
          else row.style.animation = "none";
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

      // перетаскивание .ibpack / .mrpack — импорт сборки
      page.addEventListener("dragover", (e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
          e.preventDefault();
          page.classList.add("is-over");
        }
      });
      page.addEventListener("dragleave", (e) => {
        if (!page.contains(e.relatedTarget)) page.classList.remove("is-over");
      });
      page.addEventListener("drop", async (e) => {
        e.preventDefault();
        page.classList.remove("is-over");
        const file = [...e.dataTransfer.files].map((f) => api.files.pathFor(f)).find((p) => p && /\.(ibpack|mrpack|zip)$/i.test(p));
        if (!file) return IB.toast("Перетащите файл сборки .ibpack или .mrpack", "info");
        IB.extras.importBuild(file);
      });

      search.addEventListener("input", IB.debounce(renderList, 150));
      renderChips();
      renderList();

      return {
        update(kind, detail) {
          if (kind === "builds") {
            renderChips();
            renderList(false);
          }
          if (kind === "game" && filter === "installed") {
            const id = detail && detail.buildId;
            const idx = S.builds.findIndex((b) => b.id === id);
            const row = listEl.children[idx];
            if (row && !search.value) {
              if (patchRow(row, S.builds[idx])) return;
              const fresh = buildRow(S.builds[idx]);
              fresh.style.animation = "none";
              row.replaceWith(fresh);
            } else renderList(false);
          }
          if (kind === "game" && filter !== "installed" && catalog) {
            // Установка из «Релизов»: обновляем только строку этой версии.
            const b = S.builds.find((x) => x.id === (detail && detail.buildId));
            if (!b || b.loader_type !== "vanilla") return;
            const row = listEl.querySelector(`[data-version="${CSS.escape(b.mc_version)}"]`);
            if (!row) return;
            if (patchRow(row, b)) return;
            const fresh = versionRow(catalog.find((v) => v.id === b.mc_version) || { id: b.mc_version });
            fresh.style.animation = "none";
            row.replaceWith(fresh);
          }
        },
      };
    },
  };
})();
