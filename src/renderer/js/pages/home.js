/* Главная: 3D-скин игрока, карточка сервера IGROBAR, панель запуска */
(function () {
  const IB = window.IB;
  const { h, toast } = IB;
  const api = window.ib;
  const S = IB.state;

  function statusInfo(build) {
    const st = IB.gameState(build.id);
    if (st.status === "running") return { dot: "var(--accent)", text: "Игра запущена", busy: false, running: true };
    if (st.status === "installing" || st.status === "preparing" || st.status === "modpack") {
      const p = st.progress || {};
      const pct = Number.isFinite(p.percent) ? ` ${p.percent}%` : "";
      return { dot: "var(--warning)", text: `${p.text || "Подготовка…"}${pct}`, busy: true, percent: p.percent };
    }
    if (!build.installed) return { dot: "var(--warning)", text: "Сборка не установлена" };
    return { dot: "var(--accent)", text: "Готов к запуску" };
  }

  // ================= правая панель: новости и онлайн =================

  /** Голова игрока из скина Ely.by (лицо + слой шляпы). */
  function headEl(name, size = 28) {
    const url = `https://skinsystem.ely.by/skins/${encodeURIComponent(name)}.png`;
    const el = h("span", { class: "head", style: { width: `${size}px`, height: `${size}px` } });
    el.style.backgroundImage = `url("${url}"), url("${url}")`;
    el.style.backgroundSize = `${size * 8}px auto, ${size * 8}px auto`;
    el.style.backgroundPosition = `-${size * 5}px -${size}px, -${size}px -${size}px`;
    return el;
  }
  IB.headEl = headEl;

  let newsCache = null;

  function fmtNewsDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return `сегодня, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
    return d.toLocaleDateString(IB.i18n ? IB.i18n.locale() : "ru-RU", { day: "numeric", month: "long" });
  }

  IB.homeSide = function homeSide() {
    let tab = (() => {
      try {
        return localStorage.getItem("ib.homeTab") || "news";
      } catch (err) {
        return "news";
      }
    })();
    const body = h("div", { class: "home-side__body" });
    const tabs = h("div", { class: "home-side__tabs", role: "tablist" });
    const el = h("aside", { class: "home-side" }, tabs, body);
    let destroyed = false;

    function renderTabs() {
      tabs.textContent = "";
      const st = S.serverStatus;
      const items = [
        { id: "news", title: "Новости", icon: "news" },
        { id: "online", title: st && st.online ? `Онлайн · ${st.players}` : "Онлайн", icon: "users" },
      ];
      for (const t of items) {
        tabs.append(
          h("button", {
            class: "home-side__tab",
            role: "tab",
            "aria-selected": String(tab === t.id),
            html: `${IB.icon(t.icon)}<span>${IB.escapeHtml ? IB.escapeHtml(t.title) : t.title}</span>`,
            onClick: () => {
              tab = t.id;
              try {
                localStorage.setItem("ib.homeTab", tab);
              } catch (err) {
                /* не важно */
              }
              render();
            },
          })
        );
      }
    }

    // ---------- новости ----------
    function newsCard(n) {
      const card = h(
        "article",
        { class: `news-card${n.pinned ? " news-card--pinned" : ""}` },
        n.image ? h("img", { class: "news-card__img", src: n.image, alt: "", loading: "lazy", onError: (e) => e.target.remove() }) : null,
        h(
          "div",
          { class: "news-card__body" },
          h(
            "div",
            { class: "news-card__meta" },
            n.pinned ? h("span", { class: "news-card__pin", html: `${IB.icon("star")}Закреплено` }) : null,
            n.source === "telegram" ? h("span", { class: "news-card__src", html: `${IB.icon("telegram")}${n.channel || "Telegram"}` }) : null,
            h("span", { text: fmtNewsDate(n.date) })
          ),
          n.title ? h("h4", { class: "news-card__title", text: n.title }) : null,
          n.text ? h("p", { class: "news-card__text", text: n.text }) : null
        )
      );
      if (n.url) {
        card.classList.add("news-card--link");
        card.title = "Открыть";
        card.addEventListener("click", () => api.app.openExternal(n.url));
      }
      return card;
    }

    function renderNews() {
      body.textContent = "";
      if (!newsCache) {
        body.append(h("div", { class: "home-side__empty" }, h("span", { class: "spinner" }), "Загружаю новости…"));
        return;
      }
      const list = h("div", { class: "news-list" });
      if (newsCache.offline) list.append(h("div", { class: "home-side__note", text: "Нет связи — показаны сохранённые новости" }));
      if (!newsCache.items.length) {
        list.append(h("div", { class: "home-side__empty", text: "Новостей пока нет" }));
      }
      for (const n of newsCache.items) list.append(newsCard(n));
      const server = IB.serverBuild();
      if (server && server.telegram) {
        list.append(h("button", { class: "btn btn--ghost btn--sm home-side__more", html: `${IB.icon("telegram")}Все новости в Telegram`, onClick: () => api.app.openExternal(server.telegram) }));
      }
      body.append(list);
    }

    async function loadNews(force) {
      try {
        newsCache = await api.news.list(!!force);
      } catch (err) {
        newsCache = newsCache || { items: [], offline: true };
      }
      if (!destroyed && tab === "news") renderNews();
    }

    // ---------- онлайн ----------
    function renderOnline() {
      renderTabs();
      if (tab !== "online") return;
      body.textContent = "";
      const st = S.serverStatus;
      if (!st) {
        body.append(h("div", { class: "home-side__empty" }, h("span", { class: "spinner" }), "Проверяю сервер…"));
        return;
      }
      if (!st.online) {
        body.append(h("div", { class: "home-side__empty", text: "Сервер сейчас недоступен" }));
        return;
      }
      const friends = new Set(((S.settings && S.settings.friends) || []).map((f) => f.toLowerCase()));
      const names = [...(st.names || [])].sort((a, b) => Number(friends.has(b.toLowerCase())) - Number(friends.has(a.toLowerCase())) || a.localeCompare(b));
      const head = h("div", { class: "online-head" }, h("strong", { text: `${st.players} из ${st.max}` }), h("span", { class: "muted", text: "игроков на сервере" }));
      body.append(head);
      if (!names.length) {
        body.append(h("div", { class: "home-side__empty", text: st.players ? "Сервер не показывает список игроков" : "Сейчас никого нет — зайдите первым!" }));
      } else {
        const list = h("div", { class: "online-list" });
        for (const name of names) {
          const isFriend = friends.has(name.toLowerCase());
          list.append(
            h(
              "div",
              { class: `online-row${isFriend ? " online-row--friend" : ""}` },
              headEl(name),
              h("span", { class: "online-row__name", text: name }),
              h("button", {
                class: "icon-btn icon-btn--plain online-row__star",
                title: isFriend ? "Убрать из друзей" : "В друзья — пришлю уведомление, когда зайдёт",
                html: IB.icon(isFriend ? "starFill" : "star"),
                onClick: () =>
                  IB.run(async () => {
                    const list2 = await api.friends.toggle(name);
                    S.settings = { ...S.settings, friends: list2 };
                    renderOnline();
                  }),
              })
            )
          );
        }
        body.append(list);
        if (st.players > names.length) body.append(h("div", { class: "home-side__note", text: `Сервер показывает только часть списка (${names.length} из ${st.players})` }));
      }
      body.append(h("div", { class: "home-side__note", text: "Отметьте друга звёздочкой — лаунчер сообщит, когда он зайдёт на сервер" }));
    }

    function render() {
      renderTabs();
      if (tab === "news") renderNews();
      else renderOnline();
    }

    render();
    loadNews(false);
    if (!S.serverStatus) {
      api.server
        .status(false)
        .then((st) => {
          S.serverStatus = st;
          IB.emit("server", st);
        })
        .catch(() => {});
    }
    const timer = setInterval(() => loadNews(false), 10 * 60 * 1000);

    return {
      el,
      renderOnline,
      destroy() {
        destroyed = true;
        clearInterval(timer);
      },
    };
  };

  // ================= мини-плеер музыки на главной =================

  const SPOTIFY_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M6.4 9.3c3.7-1.1 8.1-.7 11.3 1.2M7 12.4c3-.9 6.6-.5 9.2 1M7.6 15.3c2.4-.6 5-.3 7.1.9" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>';

  /** Мини-плеер: своя музыка лаунчера или Spotify (что сейчас играет). */
  IB.miniPlayer = function miniPlayer() {
    const title = h("div", { class: "mini-player__title" });
    const sub = h("div", { class: "mini-player__sub" });
    const fx = () => IB.effects;
    let mode = "launcher"; // или "spotify"
    let sp = null; // последнее состояние Spotify
    let destroyed = false;
    let timer = null;

    async function spotify(cmd) {
      if (cmd === "toggle" && sp && !sp.playing && fx() && fx().pauseForSpotify()) toast("Музыка лаунчера на паузе — играет Spotify", "info");
      try {
        sp = await api.spotify.command(cmd);
      } catch (err) {
        /* не важно */
      }
      paint();
    }
    const act = (launcherFn, spotifyCmd) => () => (mode === "spotify" ? spotify(spotifyCmd) : fx() && fx()[launcherFn]());
    const prev = h("button", { class: "mini-player__btn", title: "Предыдущий трек", html: IB.icon("skipBack"), onClick: act("prevTrack", "prev") });
    const toggle = h("button", { class: "mini-player__btn mini-player__btn--main", onClick: act("togglePause", "toggle") });
    const next = h("button", { class: "mini-player__btn", title: "Следующий трек", html: IB.icon("skipForward"), onClick: act("nextTrack", "next") });
    const logo = h("button", { class: "mini-player__logo", title: "Открыть «Музыку»", onClick: () => IB.go("music") });
    const el = h("div", { class: "mini-player" }, logo, h("div", { class: "mini-player__info", title: "Открыть «Музыку»", onClick: () => IB.go("music") }, title, sub), prev, toggle, next);

    function paint() {
      const s = S.settings || {};
      const np = fx() ? fx().nowPlaying() : null;
      const launcherOn = !!(s.music_enabled && np);
      const launcherPlaying = launcherOn && !np.paused;
      const spOn = !!(sp && sp.running && sp.title);
      // Spotify — если он играет, или если своя музыка выключена / на паузе
      mode = spOn && (sp.playing || !launcherPlaying) ? "spotify" : "launcher";
      if (mode === "launcher" && !launcherOn) mode = spOn ? "spotify" : "none";
      el.hidden = mode === "none";
      if (el.hidden) return;
      el.classList.toggle("mini-player--spotify", mode === "spotify");
      if (mode === "spotify") {
        logo.innerHTML = SPOTIFY_ICON;
        title.textContent = sp.title;
        sub.textContent = sp.playing ? sp.artist || "Spotify" : "Spotify · на паузе";
        toggle.innerHTML = IB.icon(sp.playing ? "pause" : "play");
        toggle.title = sp.playing ? "Пауза" : "Играть";
        prev.hidden = next.hidden = false;
        el.classList.toggle("is-paused", !sp.playing);
      } else {
        logo.innerHTML = '<img src="../../assets/ui/nav-music.png" alt="">';
        title.textContent = np.title || "Музыка";
        sub.textContent = np.paused ? "На паузе" : np.custom ? `Трек ${np.index + 1} из ${np.count}` : "Играет";
        toggle.innerHTML = IB.icon(np.paused ? "play" : "pause");
        toggle.title = np.paused ? "Играть" : "Пауза";
        prev.hidden = next.hidden = !np.custom;
        el.classList.toggle("is-paused", np.paused);
      }
    }

    async function poll() {
      if (destroyed) return;
      try {
        sp = await api.spotify.command("state");
      } catch (err) {
        sp = null;
      }
      if (destroyed) return;
      paint();
      if (sp && sp.supported === false) return; // Linux — Spotify не поддерживается
      timer = setTimeout(poll, sp && sp.running ? 2000 : 10000);
    }

    paint();
    poll();
    const offMusic = IB.on("music", paint);
    const offSettings = IB.on("settings", paint);
    return {
      el,
      destroy() {
        destroyed = true;
        clearTimeout(timer);
        offMusic();
        offSettings();
      },
    };
  };

  IB.pages.home = {
    mount(host) {
      const page = h("section", { class: "page page--fixed" });
      const root = h("div", { class: "home" });
      page.append(root);
      host.append(page);

      // ---- правая панель: новости и онлайн ----
      const side = IB.homeSide();
      root.append(side.el);

      // ---- верх ----
      const skinChip = h("span", { class: "skin-chip" });
      const serverSlot = h("div", {});
      const mini = IB.miniPlayer();
      root.append(h("div", { class: "home__top" }, h("div", {}, h("div", { class: "eyebrow", text: "Minecraft Java Edition" }), serverSlot), mini.el));

      // ---- сцена со скином ----
      const playerBox = h("div", { class: "home__player" });
      const nameEl = h("strong", {});
      const stage = h(
        "div",
        { class: "home__stage" },
        playerBox,
        h("button", { class: "icon-btn home__arrow home__arrow--left", "aria-label": "Повернуть", html: IB.icon("chevronLeft"), onClick: () => player.rotateBy(-45) }),
        h("button", { class: "icon-btn home__arrow home__arrow--right", "aria-label": "Повернуть", html: IB.icon("chevronRight"), onClick: () => player.rotateBy(45) }),
        h("div", { class: "home__name" }, skinChip, nameEl, h("span", { text: "Ваш текущий скин" })),
        h("div", { class: "home__hint", text: "Потяните, чтобы повернуть" }),
        h("button", { class: "btn home__skin-btn", html: `${IB.icon("user")}Изменить скин${IB.icon("chevronRight")}`, onClick: () => IB.go("skin") })
      );
      root.append(stage);
      const player = new IB.skin.Player3D(playerBox, { scale: 10, ry: -18, rx: -4 });
      const resize = new ResizeObserver(() => player.fitTo(playerBox.clientHeight, { min: 5, max: 12 }));
      resize.observe(playerBox);

      // ---- панель запуска ----
      const icon = h("img", { class: "launch-bar__icon", alt: "" });
      const bName = h("div", { class: "launch-bar__name" });
      const bSub = h("div", { class: "launch-bar__sub" });
      const statusDot = h("span", { class: "dot dot--glow" });
      const statusText = h("span", {});
      const playBtn = h("button", { class: "btn btn--primary btn--lg" });
      const progress = h("div", { class: "progress launch-bar__progress" }, h("div", { class: "progress__bar" }));
      const modsBtn = h("button", { class: "icon-btn icon-btn--lg", title: "Моды сборки", html: IB.icon("cube") });
      const gearBtn = h("button", { class: "icon-btn icon-btn--lg", title: "Настройки сборки", html: IB.icon("gear") });
      const folderBtn = h("button", { class: "icon-btn icon-btn--lg", title: "Папка сборки", html: IB.icon("folder") });
      const pickBtn = h("button", { class: "icon-btn icon-btn--lg", title: "Выбрать сборку", html: IB.icon("chevronRight") });
      const bar = h(
        "div",
        { class: "launch-bar" },
        icon,
        h("div", { class: "launch-bar__info" }, bName, bSub),
        h("div", { class: "launch-bar__sep" }),
        h("div", { class: "launch-bar__status" }, statusDot, statusText),
        h("div", { class: "launch-bar__actions" }, playBtn, modsBtn, gearBtn, folderBtn, pickBtn),
        progress
      );
      root.append(bar);

      playBtn.addEventListener("click", () => {
        const b = IB.selectedBuild();
        if (!b) return IB.modals.newBuild();
        const st = statusInfo(b);
        if (st.running) IB.actions.stop(b.id);
        else if (st.busy) return;
        else if (!b.installed) IB.actions.install(b.id);
        else IB.actions.play(b.id);
      });
      modsBtn.addEventListener("click", () => IB.selectedBuild() && IB.actions.openContent(IB.selectedBuild().id));
      gearBtn.addEventListener("click", () => IB.selectedBuild() && IB.modals.buildSettings(IB.selectedBuild().id));
      folderBtn.addEventListener("click", () => IB.selectedBuild() && IB.actions.openFolder(IB.selectedBuild().id));
      pickBtn.addEventListener("click", () => IB.modals.buildPicker(pickBtn));

      function renderSkin() {
        const acc = IB.selectedAccount();
        nameEl.textContent = acc ? acc.name : "Игрок";
        if (S.skin) player.setSkin(S.skin.dataUrl, S.skin.model);
        if (acc && (!S.settings || S.settings.cape_enabled !== false)) {
          api.capes
            .get(acc.id)
            .then((cape) => player.setCape(cape ? cape.dataUrl : null))
            .catch(() => {});
        } else player.setCape(null);
        skinChip.innerHTML = `<span class="dot"></span>${S.skin && S.skin.custom ? "Свой скин" : "Стандартный скин"}`;
      }

      let statusLine = null;
      function renderStatusLine() {
        if (!statusLine) return;
        const st = S.serverStatus;
        statusLine.textContent = "";
        if (!st) {
          statusLine.textContent = "Проверка сервера…";
          return;
        }
        statusLine.append(
          h("span", { class: "dot", style: { background: st.online ? "var(--ok)" : "var(--danger)" } }),
          st.online ? `Онлайн: ${st.players}/${st.max}${st.ping != null ? ` · пинг ${st.ping} мс` : ""}` : "Сервер недоступен"
        );
      }

      function renderServer() {
        serverSlot.textContent = "";
        statusLine = null;
        const b = IB.selectedBuild();
        if (!b || !b.modpack_capable) return;
        const server = IB.serverBuild();
        const modpackLine = b.modpack_enabled
          ? h("div", { class: "server-card__line" }, h("span", { class: "dot" }), "Модпак обновляется с GitHub автоматически")
          : h("div", { class: "server-card__line" }, h("span", { class: "dot", style: { background: "var(--text-muted)" } }), "Автообновление модпака выключено");
        if (server && server.server_address) statusLine = h("div", { class: "server-card__line" });
        const autoConnect = IB.switchEl({
          checked: !S.settings || S.settings.auto_connect !== false,
          label: "Сразу на сервер",
          onChange: (v) =>
            IB.run(async () => {
              S.settings = await api.settings.update({ auto_connect: v });
            }),
        });
        autoConnect.title = "После загрузки игра сама подключится к серверу — без меню и списка серверов";
        serverSlot.append(
          h(
            "div",
            { class: "server-card" },
            h("div", { class: "server-card__title" }, h("img", { src: "../../assets/ui/nav-home.png", alt: "" }), `Сервер ${server ? server.name : "IGROBAR"}`),
            statusLine,
            modpackLine,
            h("div", { class: "server-card__line server-card__switch", title: autoConnect.title }, autoConnect, h("span", { text: "Сразу на сервер" })),
            h("div", { class: "row", style: { gap: "8px" } }, h("button", { class: "btn btn--sm", html: `${IB.icon("map")}Карта сервера`, onClick: () => IB.go("map") }))
          )
        );
        renderStatusLine();
      }

      function renderBar() {
        const b = IB.selectedBuild();
        if (!b) {
          bName.textContent = "Нет сборок";
          bSub.textContent = "Создайте сборку, чтобы начать";
          playBtn.innerHTML = `${IB.icon("plus")}Создать сборку`;
          return;
        }
        icon.src = IB.buildIcon(b);
        bName.textContent = b.name;
        bSub.textContent = IB.buildSubtitle(b);
        const st = statusInfo(b);
        statusDot.style.background = st.dot;
        statusDot.style.color = st.dot;
        statusText.textContent = st.text;
        progress.style.display = st.busy ? "" : "none";
        progress.classList.toggle("progress--indeterminate", st.busy && !(st.percent > 0));
        progress.firstChild.style.width = `${st.percent || 0}%`;
        if (st.running) {
          playBtn.className = "btn btn--danger btn--lg";
          playBtn.innerHTML = `${IB.icon("stop")}Остановить`;
          playBtn.disabled = false;
        } else if (st.busy) {
          playBtn.className = "btn btn--primary btn--lg";
          playBtn.innerHTML = `<span class="spinner"></span>${Number.isFinite(st.percent) ? `Загрузка ${st.percent}%` : "Подготовка…"}`;
          playBtn.disabled = true;
        } else if (!b.installed) {
          playBtn.className = "btn btn--primary btn--lg";
          playBtn.innerHTML = `${IB.icon("download")}Установить`;
          playBtn.disabled = false;
        } else {
          playBtn.className = "btn btn--primary btn--lg";
          playBtn.innerHTML = `${IB.icon("play")}Играть`;
          playBtn.disabled = false;
        }
      }

      renderSkin();
      renderServer();
      renderBar();

      return {
        cleanup() {
          resize.disconnect();
          side.destroy();
          mini.destroy();
        },
        update(kind, detail) {
          if (kind === "skin" || kind === "accounts") renderSkin();
          if (kind === "builds") {
            renderServer();
            renderBar();
          }
          if (kind === "game" && detail && detail.buildId === S.selected) renderBar();
          if (kind === "server") {
            renderStatusLine();
            side.renderOnline();
          }
          if (kind === "settings") side.renderOnline();
        },
      };
    },
  };
})();
