/* Музыка в лаунчере: плеер, громкость, встроенная музыка или свои треки. */
(function () {
  const IB = window.IB;
  const { h, run, toast } = IB;
  const api = window.ib;
  const S = IB.state;

  IB.pages.music = {
    mount(host) {
      const page = h("section", { class: "page" });
      host.append(page);
      const wrap = h("div", { class: "settings music-page" });
      let offMusic = null;
      let tracks = [];

      page.append(
        h("div", { class: "page-head" }, h("div", {}, h("div", { class: "eyebrow", text: "Атмосфера" }), h("h1", { text: "Музыка" }), h("p", { text: "Фоновая музыка, пока открыт лаунчер. Во время игры затихает сама." }))),
        wrap
      );

      const fx = () => IB.effects;
      const save = (patch) => {
        S.settings = { ...S.settings, ...patch }; // сразу, чтобы ничего не «прыгало»
        return run(() => api.settings.update(patch).then((x) => (S.settings = x)));
      };

      async function loadTracks() {
        tracks = (await api.music.list().catch(() => [])) || [];
      }

      function render() {
        const s = S.settings || {};
        wrap.textContent = "";
        if (offMusic) offMusic();
        offMusic = null;

        // ---------- плеер ----------
        const title = h("div", { class: "mp-hero__title" });
        const sub = h("div", { class: "mp-hero__sub" });
        const prev = h("button", { class: "icon-btn icon-btn--lg", title: "Предыдущий трек", html: IB.icon("skipBack"), onClick: () => fx().prevTrack() });
        const toggle = h("button", { class: "mp-hero__toggle", onClick: () => fx().togglePause() });
        const next = h("button", { class: "icon-btn icon-btn--lg", title: "Следующий трек", html: IB.icon("skipForward"), onClick: () => fx().nextTrack() });
        const vol = h("input", { class: "range", type: "range", min: "0", max: "1", step: "0.01", value: String(s.music_volume ?? 0.35) });
        const volLabel = h("span", { class: "mp-hero__vol-label" });
        const paintVol = () => {
          vol.style.setProperty("--fill", `${vol.value * 100}%`);
          volLabel.textContent = `${Math.round(vol.value * 100)}%`;
        };
        vol.addEventListener("input", () => {
          paintVol();
          if (fx()) fx().setVolume(+vol.value);
        });
        vol.addEventListener("change", () => save({ music_volume: +vol.value }));
        paintVol();
        const disc = h("div", { class: "mp-hero__disc" }, h("img", { src: "../../assets/ui/nav-music.png", alt: "" }));
        const hero = h(
          "div",
          { class: "card mp-hero" },
          disc,
          h("div", { class: "mp-hero__info" }, title, sub, h("div", { class: "mp-hero__vol" }, IB.iconEl("music"), vol, volLabel)),
          h("div", { class: "mp-hero__controls" }, prev, toggle, next)
        );
        const paint = () => {
          const np = fx() ? fx().nowPlaying() : null;
          if (!np) return;
          const on = !!(S.settings && S.settings.music_enabled);
          title.textContent = on ? np.title || "—" : "Музыка выключена";
          sub.textContent = !on ? "Включите переключатель ниже" : np.paused ? "На паузе — не включится, пока не нажмёте ▶" : np.custom ? `Трек ${np.index + 1} из ${np.count} · по кругу` : "Спокойный эмбиент, сочиняется прямо в лаунчере";
          const playing = on && !np.paused;
          toggle.innerHTML = IB.icon(playing ? "pause" : "play");
          toggle.title = playing ? "Пауза" : "Играть";
          toggle.disabled = !on;
          prev.hidden = next.hidden = !np.custom;
          hero.classList.toggle("is-playing", playing);
          for (const row of wrap.querySelectorAll(".track-row[data-index]")) row.classList.toggle("is-current", np.custom && +row.dataset.index === np.index);
        };
        offMusic = IB.on("music", paint);

        // ---------- включение и источник ----------
        const enable = IB.switchEl({
          checked: !!s.music_enabled,
          label: "Музыка в лаунчере",
          onChange: async (on) => {
            await save({ music_enabled: on });
            if (fx()) fx().applyMusic();
            render();
          },
        });
        const sourceSeg = h(
          "div",
          { class: "segmented" },
          ...[
            { id: "ambient", title: "Встроенная" },
            { id: "custom", title: "Свои треки" },
          ].map((o) =>
            h("button", {
              "aria-pressed": String((s.music_source || "ambient") === o.id),
              text: o.title,
              onClick: async () => {
                await save({ music_source: o.id });
                if (fx()) fx().applyMusic();
                render();
              },
            })
          )
        );
        const settingsCard = h(
          "div",
          { class: "card" },
          h("div", { class: "setting-line" }, h("div", {}, h("h3", { text: "Музыка в лаунчере" }), h("p", { text: "По умолчанию выключена. Во время игры затихает и включается снова после выхода." })), enable),
          h("div", { class: "setting-line" }, h("div", {}, h("h3", { text: "Что играет" }), h("p", { text: "Встроенная — эмбиент, который сочиняется прямо в лаунчере. Свои треки — MP3, OGG, WAV и т. п., играют по очереди по кругу." })), sourceSeg)
        );

        wrap.append(hero, settingsCard);

        // ---------- свои треки ----------
        if ((s.music_source || "ambient") === "custom") {
          const list = h("div", { class: "track-list" });
          if (!tracks.length) list.append(h("div", { class: "muted", style: { fontSize: "13px" }, text: "Своих треков нет — пока играет встроенная музыка. Добавьте файлы кнопкой ниже." }));
          tracks.forEach((t, i) => {
            list.append(
              h(
                "div",
                { class: "track-row track-row--click", dataset: { index: String(i) }, title: "Включить", onClick: () => fx() && fx().playAt(i) },
                h("span", { class: "track-row__num", text: String(i + 1) }),
                IB.iconEl("music"),
                h("span", { class: "track-row__title", text: t.title }),
                h("button", {
                  class: "icon-btn icon-btn--plain icon-btn--danger",
                  title: "Убрать",
                  html: IB.icon("close"),
                  onClick: async (e) => {
                    e.stopPropagation();
                    if (fx()) fx().release(t.file); // отпустить файл, если он сейчас играет
                    const res = await run(() => api.music.remove(t.file));
                    if (res) tracks = res;
                    if (fx()) fx().applyMusic();
                    render();
                  },
                })
              )
            );
          });
          wrap.append(
            h(
              "div",
              { class: "card" },
              h("div", { class: "row row--between" }, h("h3", { style: { margin: 0 }, text: `Свои треки${tracks.length ? ` · ${tracks.length}` : ""}` }), h("button", {
                class: "btn btn--sm",
                html: `${IB.icon("plus")}Добавить треки`,
                onClick: async () => {
                  const res = await run(() => api.music.add());
                  if (res) {
                    toast(`Добавлено треков: ${res.added}`, "success");
                    tracks = res.tracks;
                    if (fx()) fx().applyMusic();
                    render();
                  }
                },
              })),
              list
            )
          );
        }
        paint();
      }

      loadTracks().then(render);
      render();

      return {
        cleanup() {
          if (offMusic) offMusic();
        },
        update(kind) {
          if (kind === "settings") render();
        },
      };
    },
  };
})();
