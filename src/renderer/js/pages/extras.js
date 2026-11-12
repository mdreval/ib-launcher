/*
 * Дополнительные разделы:
 *  - миры сборки (резервные копии, восстановление, импорт) и скриншоты —
 *    вкладки на странице «Моды»;
 *  - импорт и экспорт сборок (страница «Сборки»);
 *  - профиль игрока (кнопка «Профиль» вверху).
 */
(function () {
  const IB = window.IB;
  const { h, run, toast, fmt } = IB;
  const api = window.ib;
  const S = IB.state;

  function dateTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.toLocaleDateString(IB.i18n ? IB.i18n.locale() : "ru-RU", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function duration(ms) {
    const min = Math.round((ms || 0) / 60000);
    if (min < 1) return "меньше минуты";
    const hrs = Math.floor(min / 60);
    const m = min % 60;
    if (!hrs) return `${m} ${fmt.plural(m, "минута", "минуты", "минут")}`;
    return `${hrs} ч${m ? ` ${m} мин` : ""}`;
  }

  // ======================== миры ========================

  async function worlds({ toolbar, body, buildId, quiet }) {
    toolbar.textContent = "";
    toolbar.append(
      h("div", { class: "muted", style: { fontSize: "13px" }, text: "Перетащите сюда .zip с миром, чтобы добавить его в сборку" }),
      h("span", { class: "grow" }),
      h("button", {
        class: "btn",
        html: `${IB.icon("plus")}Добавить мир`,
        onClick: async () => {
          const res = await run(() => api.worlds.import(buildId), { success: "Мир добавлен" });
          if (res) worlds({ toolbar, body, buildId, quiet: true });
        },
      }),
      h("button", { class: "btn", html: `${IB.icon("archive")}Папка копий`, onClick: () => run(() => api.worlds.openBackups(buildId)) })
    );
    if (!quiet) {
      body.textContent = "";
      body.append(h("div", { class: "empty" }, h("span", { class: "spinner" }), "Загружаю миры…"));
    }
    let data;
    try {
      data = await api.worlds.list(buildId);
    } catch (err) {
      body.textContent = "";
      body.append(h("div", { class: "empty", text: err.message }));
      return;
    }
    const again = () => worlds({ toolbar, body, buildId, quiet: true });
    body.textContent = "";

    if (!data.worlds.length) {
      body.append(h("div", { class: "empty" }, IB.iconEl("globe"), "В этой сборке пока нет одиночных миров"));
    } else {
      const grid = h("div", { class: "world-grid" });
      for (const w of data.worlds) {
        const backupBtn = h("button", { class: "btn btn--sm btn--primary", html: `${IB.icon("archive")}Копия` });
        backupBtn.addEventListener("click", async () => {
          backupBtn.disabled = true;
          backupBtn.innerHTML = '<span class="spinner"></span>Сохраняю…';
          await run(() => api.worlds.backup(buildId, w.folder), { success: `Резервная копия «${w.name}» сохранена` });
          again();
        });
        grid.append(
          h(
            "div",
            { class: "world-card" },
            h("div", { class: "world-card__icon" }, w.icon ? h("img", { src: w.icon, alt: "", class: "pixelated" }) : IB.iconEl("globe")),
            h(
              "div",
              { class: "world-card__main" },
              h("div", { class: "world-card__name", text: w.name, title: w.folder }),
              h("div", { class: "world-card__sub", text: [w.mode, w.version, fmt.bytes(w.size)].filter(Boolean).join(" · ") }),
              h("div", { class: "world-card__sub", text: w.lastPlayed ? `Играли ${fmt.ago(w.lastPlayed)}` : "" })
            ),
            h(
              "div",
              { class: "world-card__actions" },
              backupBtn,
              h("button", { class: "icon-btn", title: "Открыть папку мира", html: IB.icon("folder"), onClick: () => run(() => api.worlds.open(buildId, w.folder)) }),
              h("button", {
                class: "icon-btn icon-btn--danger",
                title: "Удалить мир",
                html: IB.icon("trash"),
                onClick: async () => {
                  const yes = await IB.confirmDialog({ title: `Удалить мир «${w.name}»?`, text: "Мир переместится в корзину — его можно будет вернуть оттуда. Лучше сначала сделать резервную копию." });
                  if (!yes) return;
                  await run(() => api.worlds.remove(buildId, w.folder), { success: "Мир удалён в корзину" });
                  again();
                },
              })
            )
          )
        );
      }
      body.append(grid);
    }

    // резервные копии
    body.append(h("h3", { class: "section-title", text: `Резервные копии${data.backups.length ? ` · ${data.backups.length}` : ""}` }));
    if (!data.backups.length) {
      body.append(h("div", { class: "muted", style: { fontSize: "13px" }, text: "Копий пока нет. Нажмите «Копия» у мира — он сохранится в .zip, и его можно будет вернуть, если что-то пойдёт не так." }));
      return;
    }
    const list = h("div", { class: "list" });
    for (const b of data.backups) {
      list.append(
        h(
          "div",
          { class: "list-row" },
          h("div", { class: "avatar-tile" }, IB.iconEl("archive")),
          h("div", { class: "list-row__main" }, h("div", { class: "list-row__title", text: b.file }), h("div", { class: "list-row__sub", text: `${dateTime(b.created)} · ${fmt.bytes(b.size)}` })),
          h(
            "div",
            { class: "list-row__actions" },
            h("button", {
              class: "btn btn--sm",
              html: `${IB.icon("undo")}Восстановить`,
              onClick: async () => {
                const yes = await IB.confirmDialog({
                  title: "Восстановить мир из копии?",
                  text: "Мир из копии появится в списке миров. Если такой мир уже есть, он не перезапишется — восстановленный добавится рядом с пометкой даты.",
                  confirmText: "Восстановить",
                  danger: false,
                });
                if (!yes) return;
                await run(() => api.worlds.restore(buildId, b.file), { success: "Мир восстановлен" });
                again();
              },
            }),
            h("button", {
              class: "icon-btn icon-btn--plain icon-btn--danger",
              title: "Удалить копию",
              html: IB.icon("close"),
              onClick: async () => {
                const yes = await IB.confirmDialog({ title: "Удалить резервную копию?", text: b.file });
                if (!yes) return;
                await run(() => api.worlds.removeBackup(buildId, b.file));
                again();
              },
            })
          )
        )
      );
    }
    body.append(list);
  }

  // ======================== скриншоты ========================

  async function screenshots({ toolbar, body, buildId, quiet }) {
    toolbar.textContent = "";
    toolbar.append(
      h("div", { class: "muted", style: { fontSize: "13px" }, text: "Скриншоты делаются в игре клавишей F2" }),
      h("span", { class: "grow" }),
      h("button", { class: "btn", html: `${IB.icon("folder")}Открыть папку`, onClick: () => run(() => api.shots.open(buildId, null)) })
    );
    if (!quiet) {
      body.textContent = "";
      body.append(h("div", { class: "empty" }, h("span", { class: "spinner" }), "Загружаю скриншоты…"));
    }
    let list;
    try {
      list = await api.shots.list(buildId);
    } catch (err) {
      body.textContent = "";
      body.append(h("div", { class: "empty", text: err.message }));
      return;
    }
    body.textContent = "";
    if (!list.length) {
      body.append(h("div", { class: "empty" }, IB.iconEl("image"), "Скриншотов пока нет — нажмите F2 в игре"));
      return;
    }
    const again = () => screenshots({ toolbar, body, buildId, quiet: true });
    const grid = h("div", { class: "shot-grid" });
    list.forEach((shot, index) => {
      grid.append(
        h(
          "figure",
          { class: "shot", onClick: () => viewer(buildId, list, index, again) },
          h("img", { src: shot.url, alt: "", loading: "lazy" }),
          h("figcaption", { text: dateTime(shot.created) })
        )
      );
    });
    body.append(grid);
  }

  /** Просмотр скриншота: стрелки ←/→, копировать, открыть, удалить. */
  function viewer(buildId, list, index, onChange) {
    let i = index;
    const img = h("img", { class: "shot-viewer__img", alt: "" });
    const caption = h("div", { class: "muted" });
    function show() {
      const s = list[i];
      img.src = s.url;
      caption.textContent = `${s.file} · ${dateTime(s.created)} · ${fmt.bytes(s.size)} · ${i + 1} из ${list.length}`;
    }
    const prev = h("button", { class: "icon-btn shot-viewer__nav shot-viewer__nav--prev", "aria-label": "Предыдущий", html: IB.icon("chevronLeft"), onClick: () => step(-1) });
    const next = h("button", { class: "icon-btn shot-viewer__nav shot-viewer__nav--next", "aria-label": "Следующий", html: IB.icon("chevronRight"), onClick: () => step(1) });
    function step(d) {
      i = (i + d + list.length) % list.length;
      show();
    }
    const keys = (e) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", keys);
    const m = IB.modal({
      title: "Скриншот",
      xl: true,
      content: h("div", { class: "shot-viewer" }, h("div", { class: "shot-viewer__stage" }, img, list.length > 1 ? prev : null, list.length > 1 ? next : null), caption),
      footer: [
        h("button", { class: "btn btn--ghost", html: `${IB.icon("copy")}Копировать`, onClick: () => run(() => api.shots.copy(buildId, list[i].file), { success: "Скриншот скопирован — можно вставить в Discord или Telegram" }) }),
        h("button", { class: "btn btn--ghost", html: `${IB.icon("external")}Открыть`, onClick: () => run(() => api.shots.open(buildId, list[i].file)) }),
        h("button", { class: "btn btn--ghost", html: `${IB.icon("folder")}Показать в папке`, onClick: () => run(() => api.shots.show(buildId, list[i].file)) }),
        h("button", {
          class: "btn btn--danger",
          html: `${IB.icon("trash")}Удалить`,
          onClick: async () => {
            const yes = await IB.confirmDialog({ title: "Удалить скриншот?", text: "Файл переместится в корзину." });
            if (!yes) return;
            await run(() => api.shots.remove(buildId, list[i].file));
            list.splice(i, 1);
            onChange();
            if (!list.length) return m.close();
            i = Math.min(i, list.length - 1);
            show();
          },
        }),
      ],
      onClose: () => document.removeEventListener("keydown", keys),
    });
    show();
  }

  // ======================== импорт / экспорт сборок ========================

  function exportBuild(buildId) {
    const build = IB.buildById(buildId);
    if (!build) return;
    const withWorlds = IB.switchEl({ checked: false, label: "Вместе с мирами" });
    const go = h("button", { class: "btn btn--primary", html: `${IB.icon("upload")}Сохранить файл` });
    const m = IB.modal({
      title: `Экспорт сборки «${build.name}»`,
      content: h(
        "div",
        { class: "stack" },
        h("p", { class: "soft", text: "Сборка сохранится в один файл .ibpack: версия игры и загрузчика, моды, конфиги, ресурспаки, шейдеры и настройки игры. Его можно отправить другу — он откроет его в своём лаунчере через «Импорт»." }),
        h("label", { class: "row", style: { gap: "10px" } }, withWorlds, h("span", { text: "Добавить одиночные миры (файл станет больше)" }))
      ),
      footer: [h("button", { class: "btn btn--ghost", text: "Отмена", onClick: () => m.close() }), go],
    });
    go.addEventListener("click", async () => {
      go.disabled = true;
      go.innerHTML = '<span class="spinner"></span>Сохраняю…';
      const res = await run(() => api.packs.export(buildId, withWorlds.input.checked));
      go.disabled = false;
      go.innerHTML = `${IB.icon("upload")}Сохранить файл`;
      if (res) {
        m.close();
        toast(`Сборка сохранена (${fmt.bytes(res.size)})`, "success");
      }
    });
  }

  /** Импорт .ibpack / .mrpack — из окна выбора файла или перетаскиванием. */
  async function importBuild(filePath) {
    const bar = h("div", { class: "progress" }, h("div", { class: "progress__bar" }));
    const text = h("div", { class: "soft", text: "Подготовка…" });
    let m = null;
    const off = IB.on("import", (p) => {
      if (!m) {
        m = IB.modal({ title: "Импорт сборки", closable: false, content: h("div", { class: "stack" }, text, bar) });
      }
      text.textContent = p.text || "Импорт…";
      bar.firstChild.style.width = `${Math.max(0, Math.min(100, p.percent || 0))}%`;
    });
    try {
      const res = await run(() => (filePath ? api.packs.importPath(filePath) : api.packs.import()));
      if (res && res.build) {
        toast(`Сборка «${res.build.name}» добавлена${res.format === "mrpack" ? " из Modrinth-модпака" : ""}`, "success");
        await IB.reload.builds();
        IB.actions.select(res.build.id);
      }
      return res;
    } finally {
      off();
      if (m) m.close();
    }
  }

  // ======================== профиль игрока ========================

  async function profile() {
    const acc = IB.selectedAccount();
    const stage = h("div", { class: "profile__stage" });
    const statsBox = h("div", { class: "profile__stats" }, h("span", { class: "spinner" }));
    const TYPES = { microsoft: "Лицензия Microsoft", ely: "Ely.by", offline: "Без пароля (по нику)" };

    const m = IB.modal({
      title: "Профиль игрока",
      wide: true,
      content: h(
        "div",
        { class: "profile" },
        h(
          "div",
          { class: "profile__left" },
          stage,
          h("div", { class: "profile__name", text: acc ? acc.name : "Нет аккаунта" }),
          h("div", { class: "muted", text: acc ? TYPES[acc.type] || acc.type : "Добавьте аккаунт, чтобы играть" }),
          h(
            "div",
            { class: "row", style: { gap: "8px", justifyContent: "center", marginTop: "10px", flexWrap: "wrap" } },
            h("button", {
              class: "btn btn--sm",
              html: `${IB.icon("brush")}Скин и плащ`,
              onClick: () => {
                m.close();
                IB.go("skin");
              },
            }),
            h("button", {
              class: "btn btn--sm btn--ghost",
              html: `${IB.icon("user")}Аккаунты`,
              onClick: () => {
                m.close();
                IB.modals.accounts();
              },
            })
          )
        ),
        statsBox
      ),
      onClose: () => clearInterval(timer),
    });

    const player = new IB.skin.Player3D(stage, { scale: 7, ry: -24, rx: -6 });
    if (S.skin) player.setSkin(S.skin.dataUrl, S.skin.model);
    if (acc && (!S.settings || S.settings.cape_enabled !== false)) {
      api.capes
        .get(acc.id)
        .then((cape) => cape && player.setCape(cape.dataUrl))
        .catch(() => {});
    }

    async function renderStats() {
      let st;
      try {
        st = await api.stats.get();
      } catch (err) {
        statsBox.textContent = err.message;
        return;
      }
      statsBox.textContent = "";
      const mine = acc && st.accounts[acc.id];
      const tile = (icon, value, label) => h("div", { class: "stat-tile" }, IB.iconEl(icon), h("strong", { text: value }), h("span", { text: label }));
      statsBox.append(
        h(
          "div",
          { class: "stat-grid" },
          tile("clock", duration(mine ? mine.ms : st.total_ms), mine ? "наиграно этим аккаунтом" : "наиграно всего"),
          tile("play", String(mine ? mine.launches : st.launches), "запусков игры"),
          tile("trophy", duration(st.longest_ms), "самая долгая игра"),
          tile("star", st.last_launch ? fmt.ago(st.last_launch) : "ещё не играли", "последняя игра")
        )
      );
      if (st.playing && st.playing.length) {
        const b = IB.buildById(st.playing[0]);
        statsBox.append(h("div", { class: "profile__live" }, h("span", { class: "dot dot--glow" }), `Сейчас играет: ${b ? b.name : "Minecraft"}`));
      }
      const rows = Object.entries(st.builds)
        .map(([id, v]) => ({ build: IB.buildById(id), ...v }))
        .filter((r) => r.build && r.ms > 0)
        .sort((a, b) => b.ms - a.ms);
      statsBox.append(h("h3", { class: "section-title", text: "Время по сборкам" }));
      if (!rows.length) {
        statsBox.append(h("div", { class: "muted", text: "Здесь появится, сколько вы играли в каждую сборку." }));
      } else {
        const max = rows[0].ms;
        const list = h("div", { class: "play-bars" });
        for (const r of rows.slice(0, 6)) {
          list.append(
            h(
              "div",
              { class: "play-bar" },
              h("div", { class: "play-bar__head" }, h("span", { text: r.build.name }), h("span", { class: "muted", text: `${duration(r.ms)} · ${r.launches} ${fmt.plural(r.launches, "запуск", "запуска", "запусков")}` })),
              h("div", { class: "play-bar__track" }, h("div", { class: "play-bar__fill", style: { width: `${Math.max(3, (r.ms / max) * 100)}%` } }))
            )
          );
        }
        statsBox.append(list);
      }
      if (st.first_launch) statsBox.append(h("div", { class: "muted", style: { marginTop: "12px", fontSize: "12.5px" }, text: `Играете через лаунчер с ${fmt.longDate(st.first_launch)}` }));
    }
    renderStats();
    const timer = setInterval(renderStats, 60000);
  }

  IB.extras = { worlds, screenshots, exportBuild, importBuild };
  IB.modals = IB.modals || {};
  IB.modals.profile = profile;
})();
