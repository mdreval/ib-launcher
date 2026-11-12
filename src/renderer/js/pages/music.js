/* Музыка в лаунчере: плеер, громкость, встроенная музыка или свои треки. */
(function () {
  const IB = window.IB;
  const { h, run, toast } = IB;
  const api = window.ib;
  const S = IB.state;

  const SPOTIFY_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M6.4 9.3c3.7-1.1 8.1-.7 11.3 1.2M7 12.4c3-.9 6.6-.5 9.2 1M7.6 15.3c2.4-.6 5-.3 7.1.9" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>';

  const fmtTime = (sec) => {
    const t = Math.max(0, Math.floor(Number(sec) || 0));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  };

  /** Полоса перемотки: время слева, длина справа; пока тянут — не дёргается. */
  function seekBar(onSeek) {
    const range = h("input", { class: "range seek-bar__range", type: "range", min: "0", max: "1", step: "0.1", value: "0" });
    const cur = h("span", { class: "seek-bar__time", text: "0:00" });
    const dur = h("span", { class: "seek-bar__time", text: "0:00" });
    const el = h("div", { class: "seek-bar" }, cur, range, dur);
    let dragging = false;
    const paint = () => range.style.setProperty("--fill", `${(range.value / (range.max || 1)) * 100}%`);
    range.addEventListener("input", () => {
      dragging = true;
      cur.textContent = fmtTime(range.value);
      paint();
    });
    range.addEventListener("change", () => {
      dragging = false;
      onSeek(+range.value);
    });
    return {
      el,
      set(current, duration, enabled = true) {
        range.disabled = !enabled || !(duration > 0);
        if (dragging) return;
        range.max = String(Math.max(1, duration || 0));
        range.value = String(Math.min(current || 0, duration || 0));
        cur.textContent = fmtTime(current);
        dur.textContent = duration > 0 ? fmtTime(duration) : "—:—";
        paint();
      },
    };
  }

  IB.pages.music = {
    mount(host) {
      const page = h("section", { class: "page" });
      host.append(page);
      const wrap = h("div", { class: "settings music-page" });
      let offMusic = null;
      let offTime = null;
      let spotifyTimer = null;
      let destroyed = false;
      let spotifyCard = null;
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
        const seek = seekBar((t) => fx() && fx().seek(t));
        const paintTime = (pr) => {
          const np = fx() ? fx().nowPlaying() : null;
          const show = !!(np && np.custom && S.settings && S.settings.music_enabled && pr);
          seek.el.hidden = !show;
          if (show) seek.set(pr.current, pr.duration);
        };
        if (offTime) offTime();
        offTime = IB.on("music:time", paintTime);
        const disc = h("div", { class: "mp-hero__disc" }, h("img", { src: "../../assets/ui/nav-music.png", alt: "" }));
        const hero = h(
          "div",
          { class: "card mp-hero" },
          disc,
          h("div", { class: "mp-hero__info" }, title, sub, seek.el, h("div", { class: "mp-hero__vol" }, IB.iconEl("music"), vol, volLabel)),
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
          paintTime(fx().progress());
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

        // порядок: плеер → Spotify → настройки → свои треки
        spotifyCard = spotifyBlock();
        wrap.append(hero, spotifyCard.el, settingsCard);
        if (lastSpotify) spotifyCard.paint(lastSpotify);

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

      // ---------- Spotify ----------
      let lastSpotify = null;
      function spotifyBlock() {
        const cover = h("div", { class: "sp-cover" });
        const title = h("div", { class: "sp-title" });
        const sub = h("div", { class: "sp-sub" });
        const seek = seekBar((t) => send("seek", t));
        const prev = h("button", { class: "icon-btn", title: "Предыдущий трек", html: IB.icon("skipBack"), onClick: () => send("prev") });
        const toggle = h("button", { class: "icon-btn icon-btn--lg sp-toggle", onClick: () => send("toggle") });
        const next = h("button", { class: "icon-btn", title: "Следующий трек", html: IB.icon("skipForward"), onClick: () => send("next") });
        // громкость самого Spotify (микшер Windows / Spotify на macOS)
        const vol = h("input", { class: "range", type: "range", min: "0", max: "1", step: "0.01", value: "1" });
        const volLabel = h("span", { class: "mp-hero__vol-label" });
        const volRow = h("div", { class: "mp-hero__vol sp-vol", title: "Громкость Spotify" }, IB.iconEl("music"), vol, volLabel);
        let volDragging = false;
        let volTimer = null;
        const paintVol = () => {
          vol.style.setProperty("--fill", `${vol.value * 100}%`);
          volLabel.textContent = `${Math.round(vol.value * 100)}%`;
        };
        vol.addEventListener("input", () => {
          volDragging = true;
          paintVol();
          clearTimeout(volTimer);
          volTimer = setTimeout(() => api.spotify.command("volume", +vol.value).catch(() => {}), 120);
        });
        vol.addEventListener("change", () => {
          clearTimeout(volTimer);
          api.spotify
            .command("volume", +vol.value)
            .catch(() => {})
            .finally(() => setTimeout(() => (volDragging = false), 600));
        });
        const now = h("div", { class: "sp-now" }, cover, h("div", { class: "sp-info" }, title, sub, seek.el, volRow), h("div", { class: "sp-controls" }, prev, toggle, next));
        const off = h("div", { class: "sp-off" });
        const link = h("input", { class: "input", placeholder: "Ссылка на плейлист или альбом Spotify", spellcheck: "false" });
        const openLink = () =>
          run(async () => {
            await api.spotify.open(link.value);
            link.value = "";
          });
        link.addEventListener("keydown", (e) => e.key === "Enter" && openLink());
        const el = h(
          "div",
          { class: "card sp-card" },
          h("div", { class: "sp-head" }, h("span", { class: "sp-logo", html: SPOTIFY_SVG }), h("h3", { text: "Spotify" }), h("span", { class: "grow" }), h("button", { class: "btn btn--sm btn--ghost", html: `${IB.icon("external")}Открыть Spotify`, onClick: () => run(() => api.spotify.open("")) })),
          h("p", { class: "soft sp-note", text: "Управление приложением Spotify на этом компьютере: что играет, пауза, переключение и перемотка. Работает с бесплатным аккаунтом, входить в лаунчере не нужно." }),
          now,
          off,
          h("div", { class: "row", style: { gap: "8px", marginTop: "12px" } }, link, h("button", { class: "btn btn--sm", html: `${IB.icon("play")}Включить`, onClick: openLink }))
        );
        async function send(cmd, value) {
          if (cmd === "toggle" && lastSpotify && !lastSpotify.playing && fx() && fx().pauseForSpotify()) toast("Музыка лаунчера на паузе — играет Spotify", "info");
          try {
            const st = await api.spotify.command(cmd, value);
            lastSpotify = st;
            paint(st);
          } catch (err) {
            toast(err.message, "error");
          }
        }
        function paint(st) {
          const running = st && st.running;
          now.hidden = !running;
          off.hidden = !!running;
          if (!running) {
            off.textContent = "";
            if (st && st.supported === false) off.append(h("span", { text: "Управление Spotify работает на Windows и macOS." }));
            else off.append(IB.iconEl("music"), h("span", { text: st ? "Spotify не запущен или ничего не играет. Откройте Spotify и включите музыку — трек появится здесь." : "Ищу Spotify…" }));
            return;
          }
          cover.style.backgroundImage = st.cover ? `url("${st.cover}")` : "";
          cover.classList.toggle("sp-cover--empty", !st.cover);
          title.textContent = st.title || "—";
          sub.textContent = [st.artist, st.album].filter(Boolean).join(" · ");
          toggle.innerHTML = IB.icon(st.playing ? "pause" : "play");
          toggle.title = st.playing ? "Пауза" : "Играть";
          seek.set(st.position, st.duration, st.canSeek !== false);
          volRow.hidden = !(st.volume >= 0);
          if (st.volume >= 0 && !volDragging) {
            vol.value = String(st.volume);
            paintVol();
          }
          seek.el.title = st.canSeek === false ? "Spotify не даёт перематывать отсюда" : "";
        }
        return { el, paint };
      }

      async function pollSpotify() {
        if (destroyed) return;
        try {
          lastSpotify = await api.spotify.command("state");
        } catch (err) {
          lastSpotify = { running: false };
        }
        if (destroyed) return;
        if (spotifyCard) spotifyCard.paint(lastSpotify);
        spotifyTimer = setTimeout(pollSpotify, lastSpotify && lastSpotify.running ? 1000 : 4000);
      }

      loadTracks().then(render);
      render();

      pollSpotify();

      return {
        cleanup() {
          destroyed = true;
          clearTimeout(spotifyTimer);
          if (offMusic) offMusic();
          if (offTime) offTime();
        },
        update(kind) {
          if (kind === "settings") render();
        },
      };
    },
  };
})();
