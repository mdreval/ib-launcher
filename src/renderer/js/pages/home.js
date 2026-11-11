/* Главная: 3D-скин игрока, карточка сервера IGROBAR, панель запуска */
(function () {
  const IB = window.IB;
  const { h } = IB;
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

  IB.pages.home = {
    mount(host) {
      const page = h("section", { class: "page page--fixed" });
      const root = h("div", { class: "home" });
      page.append(root);
      host.append(page);

      // ---- верх ----
      const skinChip = h("span", { class: "skin-chip" });
      const serverSlot = h("div", {});
      root.append(h("div", { class: "home__top" }, h("div", {}, h("div", { class: "eyebrow", text: "Minecraft Java Edition" }), serverSlot), skinChip));

      // ---- сцена со скином ----
      const playerBox = h("div", { class: "home__player" });
      const nameEl = h("strong", {});
      const stage = h(
        "div",
        { class: "home__stage" },
        playerBox,
        h("button", { class: "icon-btn home__arrow home__arrow--left", "aria-label": "Повернуть", html: IB.icon("chevronLeft"), onClick: () => player.rotateBy(-45) }),
        h("button", { class: "icon-btn home__arrow home__arrow--right", "aria-label": "Повернуть", html: IB.icon("chevronRight"), onClick: () => player.rotateBy(45) }),
        h("div", { class: "home__name" }, nameEl, h("span", { text: "Ваш текущий скин" })),
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
        skinChip.innerHTML = `<span class="dot"></span>${S.skin && S.skin.custom ? "Свой скин" : "Стандартный скин"}`;
      }

      function renderServer() {
        serverSlot.textContent = "";
        const b = IB.selectedBuild();
        if (!b || !b.modpack_capable) return;
        const server = IB.serverBuild();
        const modpackLine = b.modpack_enabled
          ? h("div", { class: "server-card__line" }, h("span", { class: "dot" }), "Модпак обновляется с GitHub автоматически")
          : h("div", { class: "server-card__line" }, h("span", { class: "dot", style: { background: "var(--text-muted)" } }), "Автообновление модпака выключено");
        serverSlot.append(
          h(
            "div",
            { class: "server-card" },
            h("div", { class: "server-card__title" }, h("img", { src: "../../assets/ui/nav-home.png", alt: "" }), `Сервер ${server ? server.name : "IGROBAR"}`),
            modpackLine,
            h(
              "div",
              { class: "row", style: { gap: "8px" } },
              h("button", { class: "btn btn--sm", html: `${IB.icon("map")}Карта сервера`, onClick: () => IB.go("map") }),
              server && server.telegram ? h("button", { class: "btn btn--sm btn--ghost", html: `${IB.icon("telegram")}Telegram`, onClick: () => api.app.openExternal(server.telegram) }) : null
            )
          )
        );
        if (server && server.server_address) {
          const line = h("div", { class: "server-card__line", text: "Проверка сервера…" });
          serverSlot.firstChild.insertBefore(line, serverSlot.firstChild.children[1]);
          api.server.ping(server.status_address || server.server_address).then((st) => {
            line.textContent = "";
            line.append(
              h("span", { class: "dot", style: { background: st.online ? "var(--ok)" : "var(--danger)" } }),
              st.online ? `Онлайн: ${st.players}/${st.max}${st.ping != null ? ` · пинг ${st.ping} мс` : ""}` : "Сервер недоступен"
            );
            if (st.online && st.names && st.names.length) line.title = st.names.join(", ");
          });
        }
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
        },
        update(kind, detail) {
          if (kind === "skin" || kind === "accounts") renderSkin();
          if (kind === "builds") {
            renderServer();
            renderBar();
          }
          if (kind === "game" && detail && detail.buildId === S.selected) renderBar();
        },
      };
    },
  };
})();
