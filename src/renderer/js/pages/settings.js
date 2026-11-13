/* Настройки: память, модпак IGROBAR, папка игры, поведение, аргументы JVM, обновления, статистика, данные */
(function () {
  const IB = window.IB;
  const { h, run, toast } = IB;
  const api = window.ib;
  const S = IB.state;

  IB.pages.settings = {
    mount(host) {
      const page = h("section", { class: "page" });
      host.append(page);
      const wrap = h("div", { class: "settings" });
      page.append(wrap);
      const offs = [];
      let appearanceOff = null;
      offs.push(() => appearanceOff && appearanceOff());
      let updText = null;
      let lastUpdateText = "";
      offs.push(
        IB.on("update", (e) => {
          const map = {
            checking: "Проверка обновлений…",
            "not-available": `У вас последняя версия (${S.info ? S.info.version : ""}).`,
            available: `Найдена версия ${e.version} — загружаю…`,
            progress: `Загрузка обновления: ${Math.round(e.percent || 0)}%`,
            downloaded: `Версия ${e.version} загружена и установится при перезапуске.`,
            error: `Не удалось проверить обновления: ${e.message}`,
            dev: "Проверка обновлений работает в установленной версии лаунчера (не при запуске из исходников).",
          };
          if (map[e.type]) {
            lastUpdateText = map[e.type];
            if (updText) updText.textContent = lastUpdateText;
          }
        })
      );

      /** Карточка «Оформление»: тема лаунчера и картинка фона. */
      function renderAppearance() {
        const card = h("div", { class: "card" });
        const draw = () => {
          const a = S.appearance || { theme: "green", background: "theme", bg_dim: 0.7, accent_color: "#7de6b8" };
          const accent = a.accent_color || "#7de6b8";
          card.textContent = "";
          const apply = (res) => {
            if (res) IB.applyAppearance(res);
            draw();
          };

          // темы
          const neutralFor = (hex) => (IB.theme.customPalette(hex).light ? "../../assets/ui/logo-black.png" : "../../assets/ui/logo-gray.png");
          const fixedLogo = a.logo === "green" ? "../../assets/ui/logo.png" : a.logo === "red" ? "../../assets/ui/logo-red.png" : a.logo === "neutral" ? neutralFor(accent) : null;
          const themes = [
            { id: "red", title: "IGROBAR", sub: "Цвета сервера", img: "../../assets/ui/background.jpg", logo: fixedLogo || "../../assets/ui/logo-red.png", swatch: "#e2262c" },
            { id: "green", title: "Зелёная", sub: "Ночной лес", img: "../../assets/ui/background.jpg", logo: fixedLogo || "../../assets/ui/logo.png" },
            {
              id: "custom",
              title: "Свой цвет",
              sub: "Любой оттенок — ниже",
              img: "../../assets/ui/background.jpg",
              logo: fixedLogo || neutralFor(accent),
              swatch: accent,
            },
          ];
          const themeRow = h("div", { class: "theme-options" });
          for (const t of themes) {
            themeRow.append(
              h(
                "button",
                {
                  class: "theme-option",
                  type: "button",
                  "aria-pressed": String(a.theme === t.id),
                  onClick: async () => apply(await run(() => api.appearance.set({ theme: t.id }))),
                },
                h(
                  "span",
                  {
                    class: `theme-option__preview${t.swatch ? " theme-option__preview--custom" : ""}`,
                    style: t.swatch ? { backgroundImage: `url("${t.img}")`, "--swatch": t.swatch } : { backgroundImage: `url("${t.img}")` },
                  },
                  h("img", { src: t.logo, alt: "" })
                ),
                h("span", { class: "theme-option__text" }, h("b", { text: t.title }), h("small", { text: t.sub }))
              )
            );
          }

          // свой цвет: готовые цвета + любой цвет (радужный круг)
          const SWATCHES = ["#ff5252", "#ff9f43", "#ffd43b", "#a9e34b", "#7de6b8", "#38d9a9", "#4dabf7", "#5c7cfa", "#b197fc", "#f783ac", "#f1f3f5", "#868e96", "#25262b"];
          const setColor = async (hex) => apply(await run(() => api.appearance.set({ theme: "custom", accent_color: hex })));
          // Предпросмотр «тихий»: карточка не перерисовывается, иначе окно
          // выбора цвета закрывается при первом же движении.
          const preview = (hex) => IB.applyAppearance({ ...a, theme: "custom", accent_color: hex }, { silent: true });
          const hexLabel = h("span", { class: "color-hex", text: a.theme === "custom" ? accent.toUpperCase() : "" });
          const picker = h("input", { type: "color", value: accent, title: "Любой цвет" });
          picker.addEventListener("input", () => {
            hexLabel.textContent = picker.value.toUpperCase();
            preview(picker.value); // видно сразу, сохраняется при отпускании
          });
          picker.addEventListener("change", () => setColor(picker.value));
          const colorRow = h(
            "div",
            { class: "color-row" },
            h("span", { class: "color-row__label", text: "Свой цвет:" }),
            ...SWATCHES.map((hex) =>
              h("button", {
                class: "color-swatch",
                type: "button",
                title: hex.toUpperCase(),
                "aria-pressed": String(a.theme === "custom" && accent.toLowerCase() === hex),
                style: { background: hex, "--swatch-glow": hex },
                onClick: () => setColor(hex),
              })
            ),
            h("label", { class: "color-picker", title: "Любой цвет" }, picker),
            hexLabel
          );

          // логотип: по теме или закреплённый
          const LOGO_OPTIONS = [
            { id: "auto", title: "По теме", img: null, tip: "Меняется вместе с темой" },
            { id: "green", img: "../../assets/ui/logo.png", tip: "Зелёный логотип — не меняется при выборе своего цвета" },
            { id: "red", img: "../../assets/ui/logo-red.png", tip: "Красный логотип — не меняется при выборе своего цвета" },
            { id: "neutral", img: neutralFor(accent), tip: "Серый логотип, на светлых цветах — чёрный" },
          ];
          const logoRow = h(
            "div",
            { class: "logo-row" },
            h("span", { class: "color-row__label", text: "Логотип:" }),
            ...LOGO_OPTIONS.map((o) =>
              h(
                "button",
                {
                  class: `logo-option${o.img ? " logo-option--icon" : ""}`,
                  type: "button",
                  "aria-pressed": String((a.logo || "auto") === o.id),
                  "aria-label": o.tip,
                  title: o.tip,
                  onClick: async () => apply(await run(() => api.appearance.set({ logo: o.id }))),
                },
                o.img ? h("img", { src: o.img, alt: "" }) : h("span", { class: "logo-option__auto", html: IB.icon("sparkles") }),
                o.title ? h("span", { text: o.title }) : null
              )
            )
          );

          // фон
          const bgSeg = h(
            "div",
            { class: "segmented" },
            h("button", { "aria-pressed": String(a.background !== "custom"), text: "Картинка темы", onClick: async () => apply(await run(() => api.appearance.set({ background: "theme" }))) }),
            h("button", {
              "aria-pressed": String(a.background === "custom"),
              text: "Своя картинка или видео",
              onClick: async () => {
                if (a.hasCustom) apply(await run(() => api.appearance.set({ background: "custom" })));
                else apply(await run(() => api.appearance.pickFile()));
              },
            })
          );
          const pickBtn = h("button", { class: "btn btn--sm", html: `${IB.icon("upload")}Выбрать файл`, onClick: async () => apply(await run(() => api.appearance.pickFile())) });
          const urlBtn = h("button", { class: "btn btn--sm", html: `${IB.icon("link")}По ссылке`, onClick: () => askUrl(apply) });
          const delBtn = a.hasCustom ? h("button", { class: "btn btn--sm btn--ghost", html: `${IB.icon("trash")}Убрать свою`, onClick: async () => apply(await run(() => api.appearance.reset())) }) : null;

          let dimRow = null;
          if (a.background === "custom") {
            const dim = h("input", { class: "range", type: "range", min: "0", max: "1", step: "0.05", value: String(a.bg_dim ?? 0.7) });
            const paintDim = () => {
              dim.style.setProperty("--fill", `${dim.value * 100}%`);
              document.documentElement.style.setProperty("--bg-dim", dim.value);
            };
            dim.addEventListener("input", paintDim);
            dim.addEventListener("change", async () => {
              const res = await run(() => api.appearance.set({ bg_dim: +dim.value }));
              if (res) S.appearance = res;
            });
            paintDim();
            dimRow = h("div", { class: "setting-line", style: { marginTop: "12px" } }, h("div", {}, h("h3", { text: "Затемнение картинки" }), h("p", { text: "Чтобы текст хорошо читался поверх яркой картинки." })), h("div", { style: { width: "220px" } }, dim));
          }

          const season = IB.effects ? IB.effects.season() : null;
          const SEASON_NAMES = { newyear: "сейчас: новогодний снег и конфетти", winter: "сейчас: снег", halloween: "сейчас: Хэллоуин", autumn: "сейчас: листопад", spring: "сейчас: лепестки" };
          const fxLine = (title, desc, key) =>
            h(
              "div",
              { class: "setting-line", style: { marginTop: "12px" } },
              h("div", {}, h("h3", { text: title }), h("p", { text: desc })),
              IB.switchEl({ checked: a[key] !== false, label: title, onChange: async (on) => apply(await run(() => api.appearance.set({ [key]: on }))) })
            );
          card.append(
            h("h3", { text: "Оформление" }),
            h("p", { text: "Цвет лаунчера и фон. Свою картинку или видео (MP4, WebM) можно выбрать с компьютера, картинку — ещё и по ссылке из интернета." }),
            themeRow,
            colorRow,
            logoRow,
            h("div", { class: "row", style: { marginTop: "14px", gap: "10px", flexWrap: "wrap" } }, bgSeg, pickBtn, urlBtn, delBtn)
          );
          if (dimRow) card.append(dimRow);
          card.append(
            fxLine("Живой фон", "Анимация поверх фона — выберите любой вариант, он работает с любой темой и своей картинкой.", "live_effects"),
            a.live_effects !== false && IB.effects
              ? h(
                  "div",
                  { class: "fx-variants" },
                  ...IB.effects.LIVE_VARIANTS.map((v) =>
                    h("button", {
                      class: "chip",
                      type: "button",
                      "aria-pressed": String((a.live_effect || "auto") === v.id),
                      text: v.id === "auto" ? `${v.title} (${a.theme === "red" ? "искры" : a.theme === "custom" ? "огоньки" : "светлячки"})` : v.title,
                      onClick: async () => apply(await run(() => api.appearance.set({ live_effect: v.id }))),
                    })
                  )
                )
              : null,
            fxLine("Сезонные эффекты", `Снег зимой, конфетти на Новый год, летучие мыши на Хэллоуин, листопад осенью${season ? ` — ${SEASON_NAMES[season]}` : ""}. Показываются вместе с живым фоном.`, "seasonal_effects")
          );
        };
        draw();
        if (appearanceOff) appearanceOff();
        appearanceOff = IB.on("appearance", () => draw());
        return card;
      }

      function askUrl(done) {
        const input = h("input", { class: "input", placeholder: "https://…/картинка.jpg" });
        const okBtn = h("button", { class: "btn btn--primary", html: `${IB.icon("download")}Скачать` });
        const m = IB.modal({
          title: "Картинка по ссылке",
          content: h("div", {}, h("p", { class: "soft", style: { margin: "0 0 12px" }, text: "Вставьте прямую ссылку на картинку (PNG, JPG, WEBP). Например, из wallhaven.cc — «Скопировать адрес изображения»." }), input),
          footer: [okBtn],
        });
        const go = async () => {
          okBtn.disabled = true;
          okBtn.innerHTML = '<span class="spinner"></span>Скачиваю…';
          const res = await run(() => api.appearance.fromUrl(input.value));
          if (res) {
            m.close();
            done(res);
          } else {
            okBtn.disabled = false;
            okBtn.innerHTML = `${IB.icon("download")}Скачать`;
          }
        };
        okBtn.addEventListener("click", go);
        input.addEventListener("keydown", (e) => e.key === "Enter" && go());
      }

      function render() {
        const s = S.settings;
        if (!s) return;
        wrap.textContent = "";

        // ---- язык ----
        const langSelect = h("select", { class: "select", style: { width: "220px" }, "data-no-i18n": "" });
        for (const l of window.IB_I18N.LANGS) langSelect.append(h("option", { value: l.id, text: l.title }));
        langSelect.value = IB.lang;
        langSelect.addEventListener("change", async () => {
          const res = await run(() => api.settings.update({ language: langSelect.value }));
          if (res) location.reload();
        });
        wrap.append(h("div", { class: "card" }, h("div", { class: "setting-line" }, h("div", {}, h("h3", { text: "Язык" }), h("p", { text: "Язык интерфейса лаунчера." })), langSelect)));

        // ---- оформление ----
        wrap.append(renderAppearance());

        // ---- память ----
        const total = s.total_ram_mb;
        const max = Math.max(2048, Math.floor((total - 1024) / 512) * 512);
        const ramValue = h("strong", {});
        const ramText = h("p", {});
        const ram = h("input", { class: "range", type: "range", min: "1024", max: String(max), step: "512", value: String(Math.min(s.ram_mb, max)) });
        const paint = () => {
          const v = +ram.value;
          ramValue.textContent = `${(v / 1024).toFixed(v % 1024 ? 1 : 0).replace(".", ",")} ГБ`;
          ram.style.setProperty("--fill", `${((v - ram.min) / (ram.max - ram.min)) * 100}%`);
          ramText.textContent = `Выделено ${v} МБ из ${total} МБ установленной памяти. Рекомендуется 4–8 ГБ.`;
        };
        ram.addEventListener("input", paint);
        ram.addEventListener("change", () => run(() => api.settings.update({ ram_mb: +ram.value }).then((x) => (S.settings = x))));
        paint();
        wrap.append(
          h(
            "div",
            { class: "card" },
            h("h3", { text: "Оперативная память" }),
            h("p", { text: "Сколько памяти получит Minecraft. Свою память для отдельной сборки можно задать в её настройках (значок шестерёнки)." }),
            h("div", { class: "ram-row" }, ram, ramValue),
            ramText
          )
        );

        // ---- модпак IGROBAR ----
        const b = IB.selectedBuild();
        const capable = b && b.modpack_capable;
        const server = IB.serverBuild();
        const loaderName = server ? { neoforge: "NeoForge", forge: "Forge", fabric: "Fabric", quilt: "Quilt" }[server.loader_type] || server.loader_type : "";
        const spec = server ? `${server.mc_version} + ${loaderName} ${server.loader_version}` : "—";
        const modpackSwitch = IB.switchEl({
          checked: capable && b.modpack_enabled,
          disabled: !capable,
          label: "Обновлять модпак",
          onChange: async (on, input) => {
            const res = await run(() => api.modpack.setEnabled(b.id, on), { success: on ? "Модпак будет обновляться автоматически" : "Автообновление модпака выключено" });
            if (!res) input.checked = !on;
          },
        });
        const statusLine = h("p", { class: "field__hint", style: { marginTop: "10px" } });
        const checkBtn = h("button", { class: "btn btn--sm", html: `${IB.icon("refresh")}Проверить сейчас`, disabled: !capable || !b.modpack_enabled });
        checkBtn.addEventListener("click", async () => {
          checkBtn.disabled = true;
          checkBtn.innerHTML = '<span class="spinner"></span>Проверка…';
          const res = await run(() => api.modpack.sync(b.id));
          if (res) toast(res.updated ? `Модпак обновлён до ${res.release}: ${res.added} файлов` : "Модпак уже актуален", "success");
          checkBtn.disabled = false;
          checkBtn.innerHTML = `${IB.icon("refresh")}Проверить сейчас`;
          loadModpackStatus();
        });
        async function loadModpackStatus() {
          if (!capable) {
            statusLine.textContent = `Работает только для сборки ${spec}. Сейчас выбрана: ${b ? `${b.name} (${IB.buildSubtitle(b)})` : "—"} — для неё модпак не проверяется и не скачивается.`;
            return;
          }
          const st = await api.modpack.status(b.id).catch(() => null);
          if (!st) return;
          statusLine.textContent = st.installed_release
            ? `Установлен модпак из релиза ${st.installed_release} (${st.files} файлов), проверено ${IB.fmt.ago(st.synced_at)}.` +
              (st.missing ? ` Не хватает файлов: ${st.missing} — они скачаются заново при запуске.` : "")
            : "Модпак ещё не загружался — он скачается при первом запуске сборки.";
        }
        loadModpackStatus();
        wrap.append(
          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "setting-line" },
              h("div", {}, h("h3", { text: "Обновлять модпак сервера IGROBAR" }), h("p", { text: `Если на GitHub появились изменения модпака, лаунчер скачает их перед запуском. Работает только для версии ${spec}.` })),
              modpackSwitch
            ),
            h("div", { class: "row row--between" }, statusLine, checkBtn)
          )
        );

        // ---- сервер и друзья ----
        // Сразу запоминаем новое значение: настройки перерисовываются по
        // событию из main раньше, чем придёт ответ, и ползунок «прыгал» назад.
        const save = (patch) => {
          S.settings = { ...S.settings, ...patch };
          return run(() => api.settings.update(patch).then((x) => (S.settings = x)));
        };
        const line = (title, desc, key, def = true, extra) =>
          h(
            "div",
            { class: "setting-line" },
            h("div", {}, h("h3", { text: title }), h("p", { text: desc })),
            IB.switchEl({
              checked: def ? s[key] !== false : !!s[key],
              label: title,
              onChange: (on) => save({ [key]: on }).then(() => extra && extra(on)),
            })
          );
        const friendInput = h("input", { class: "input", placeholder: "Ник друга", maxlength: "16", spellcheck: "false", style: { width: "200px" } });
        const friendList = h("div", { class: "friend-chips" });
        const renderFriends = () => {
          friendList.textContent = "";
          const list = S.settings.friends || [];
          if (!list.length) friendList.append(h("span", { class: "muted", style: { fontSize: "13px" }, text: "Друзей пока нет. Добавьте ник здесь или звёздочкой в списке «Онлайн» на главной." }));
          for (const f of list) {
            friendList.append(
              h(
                "span",
                { class: "friend-chip" },
                IB.headEl ? IB.headEl(f, 20) : null,
                f,
                h("button", {
                  class: "friend-chip__x",
                  title: "Убрать",
                  html: IB.icon("close"),
                  onClick: async () => {
                    const next = await run(() => api.friends.toggle(f));
                    if (next) {
                      S.settings = { ...S.settings, friends: next };
                      renderFriends();
                    }
                  },
                })
              )
            );
          }
        };
        const addFriend = async () => {
          const nick = friendInput.value.trim();
          if (!nick) return;
          if ((S.settings.friends || []).some((f) => f.toLowerCase() === nick.toLowerCase())) return toast("Этот ник уже в друзьях", "info");
          const next = await run(() => api.friends.toggle(nick));
          if (next) {
            S.settings = { ...S.settings, friends: next };
            friendInput.value = "";
            renderFriends();
          }
        };
        friendInput.addEventListener("keydown", (e) => e.key === "Enter" && addFriend());
        renderFriends();
        wrap.append(
          h(
            "div",
            { class: "card" },
            h("h3", { text: "Сервер и друзья" }),
            line("Сразу на сервер", "После загрузки игра сама подключится к серверу IGROBAR — без главного меню и списка серверов.", "auto_connect"),
            line("Тихое обновление модпака", "Пока лаунчер открыт (и даже свёрнут в трей), он сам скачивает новый модпак сервера — к запуску всё уже готово.", "silent_modpack"),
            line("Друг зашёл на сервер", "Уведомление Windows/macOS, когда кто-то из друзей заходит на сервер.", "friend_notifications"),
            h("div", { class: "row", style: { gap: "8px", marginTop: "12px" } }, friendInput, h("button", { class: "btn btn--sm", html: `${IB.icon("plus")}В друзья`, onClick: addFriend })),
            friendList
          )
        );

        // музыка — на отдельной странице «Музыка» (pages/music.js)

        // ---- Discord ----
        const rpcReady = server && server.discord_client_id;
        wrap.append(
          h(
            "div",
            { class: "card" },
            line(
              "Статус в Discord",
              rpcReady
                ? "Друзья в Discord видят, что вы играете на IGROBAR и в какой версии. Нужен запущенный Discord на компьютере."
                : "Друзья в Discord будут видеть, что вы играете на IGROBAR. Включится после обновления лаунчера, когда администратор подключит приложение Discord.",
              "discord_rpc"
            ),
            server && server.discord ? h("button", { class: "btn btn--sm", html: `${IB.icon("discord")}Discord-сервер IGROBAR`, onClick: () => api.app.openExternal(server.discord) }) : null
          )
        );

        // ---- папка игры ----
        const pathInput = h("input", { class: "input", value: s.game_dir_effective, readonly: true });
        wrap.append(
          h(
            "div",
            { class: "card" },
            h("h3", { text: "Папка игры" }),
            h("p", { text: "Здесь хранятся версии, библиотеки и ресурсы. Миры, моды и настройки каждой сборки лежат отдельно, в папке instances. При смене папки существующие файлы не переносятся." }),
            h(
              "div",
              { class: "path-row" },
              pathInput,
              h("button", {
                class: "icon-btn",
                title: "Выбрать папку",
                html: IB.icon("folder"),
                onClick: async () => {
                  const dir = await run(() => api.app.pickDirectory());
                  if (!dir) return;
                  const res = await run(() => api.settings.update({ game_dir: dir }), { success: "Папка игры изменена" });
                  if (res) {
                    S.settings = res;
                    render();
                  }
                },
              }),
              h("button", { class: "btn", text: "Открыть", onClick: () => run(() => api.app.openPath("game")) })
            ),
            s.game_dir
              ? h("button", {
                  class: "btn btn--ghost btn--sm",
                  style: { marginTop: "10px" },
                  text: "Вернуть папку по умолчанию",
                  onClick: async () => {
                    const res = await run(() => api.settings.update({ game_dir: null }));
                    if (res) {
                      S.settings = res;
                      render();
                    }
                  },
                })
              : null
          )
        );

        // ---- поведение ----
        wrap.append(
          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "setting-line" },
              h("div", {}, h("h3", { text: "Поведение" }), h("p", { text: "Прятать лаунчер в трей, пока идёт игра, и открывать снова после выхода из неё." })),
              IB.switchEl({
                checked: s.hide_on_launch,
                label: "Прятать в трей",
                onChange: (on) => run(() => api.settings.update({ hide_on_launch: on }).then((x) => (S.settings = x))),
              })
            )
          )
        );

        // ---- JVM ----
        const jvm = h("textarea", { class: "textarea", placeholder: "-XX:+UseG1GC -XX:MaxGCPauseMillis=50" });
        jvm.value = s.jvm_args || "";
        jvm.addEventListener("blur", () => {
          if (jvm.value.trim() !== (S.settings.jvm_args || "")) {
            run(() => api.settings.update({ jvm_args: jvm.value.trim() }).then((x) => (S.settings = x)), { success: "Аргументы JVM сохранены" });
          }
        });
        wrap.append(h("div", { class: "card" }, h("h3", { text: "Дополнительные аргументы JVM" }), h("p", { style: { marginBottom: "12px" }, text: "Добавляются перед запуском игры. Сохраняются при уходе из поля." }), jvm));

        // ---- обновления лаунчера ----
        updText = h("p", { text: lastUpdateText || `Установлена версия ${S.info ? S.info.version : ""}.` });
        const updBtn = h("button", { class: "btn btn--sm", html: `${IB.icon("refresh")}Проверить обновления` });
        updBtn.addEventListener("click", () => {
          updText.textContent = "Проверка…";
          api.updates.check().catch((err) => (updText.textContent = err.message));
        });
        wrap.append(h("div", { class: "card" }, h("div", { class: "setting-line" }, h("div", {}, h("h3", { text: "Обновления лаунчера" }), updText), updBtn)));

        // ---- статистика лаунчера ----
        usageBox = h("div", {});
        fillUsage();
        wrap.append(
          h(
            "div",
            { class: "card" },
            h("h3", { text: "Статистика лаунчера" }),
            h("p", { style: { marginBottom: "12px" }, text: "Сколько людей пользуется лаунчером IGROBAR. Учитывается анонимно: только номер установки, версия и система." }),
            usageBox
          )
        );

        // ---- данные ----
        wrap.append(
          h(
            "div",
            { class: "card" },
            h("h3", { text: "Данные лаунчера" }),
            h("p", { text: "Настройки, аккаунты, скины и журналы." }),
            h("p", { class: "field__hint", style: { fontFamily: "var(--mono)", margin: "8px 0 14px" }, text: s.launcher_dir }),
            h(
              "div",
              { class: "row row--between" },
              h("button", { class: "btn btn--ghost", html: `${IB.icon("folder")}Открыть папку данных`, onClick: () => run(() => api.app.openPath("data")) }),
              h("button", {
                class: "btn btn--danger",
                text: "Сбросить настройки",
                onClick: async () => {
                  const yes = await IB.confirmDialog({ title: "Сбросить настройки?", text: "Память, папка игры, аргументы JVM и галочки вернутся к значениям по умолчанию. Сборки, аккаунты и миры останутся.", confirmText: "Сбросить" });
                  if (!yes) return;
                  const res = await run(() => api.settings.reset(), { success: "Настройки сброшены" });
                  if (res) {
                    S.settings = res;
                    render();
                  }
                },
              })
            )
          )
        );
      }

      // Статистика лаунчера (services/usage.js): ряд «Лаунчер» (люди), ряд «Игра»
      // (запуски), топ-5 версий игры и версии лаунчера.
      let usageBox = null;
      const LOADER_NAMES = { vanilla: "ванилла", fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt" };
      function fillUsage() {
        if (!usageBox) return;
        usageBox.textContent = "";
        const u = S.usage;
        if (!u) {
          usageBox.append(h("p", { class: "muted", text: "Загрузка статистики…" }));
          return;
        }
        const fmt = (n) => Number(n || 0).toLocaleString("ru-RU");
        const pct = (n, total) => Math.round(((n || 0) / (total || 1)) * 100);
        const stat = (value, label, title) => h("div", { class: "usage-card__stat", title }, h("strong", { text: fmt(value) }), h("span", { text: label }));
        const group = (title, ...stats) => h("div", { class: "usage-group" }, h("h4", { class: "usage-group__title", text: title }), h("div", { class: "usage-card__grid" }, ...stats));
        const bars = (title, rows) =>
          h(
            "div",
            {},
            h("h4", { class: "usage-group__title", text: title }),
            h(
              "div",
              { class: "usage-versions" },
              ...rows.map((r) =>
                h(
                  "div",
                  { class: `usage-versions__row${r.current ? " is-current" : ""}` },
                  h("span", { class: "usage-versions__name", text: r.name, title: r.name }),
                  h("div", { class: "usage-versions__bar" }, h("div", { style: { width: `${Math.max(3, r.percent)}%` } })),
                  h("span", { class: "usage-versions__count", text: `${fmt(r.count)} · ${r.percent}%` })
                )
              )
            )
          );
        const games = u.games || {};
        usageBox.append(
          group(
            "Лаунчер",
            stat(u.installs, "Установок", "Сколько всего разных компьютеров установили лаунчер"),
            stat(u.today, "Открывали сегодня", "Сколько человек открывали лаунчер сегодня"),
            stat(u.week, "Открывали за неделю", "Сколько человек открывали лаунчер за последние 7 дней")
          ),
          group(
            "Игра",
            stat(games.today, "Запусков сегодня", "Сколько раз запускали игру сегодня"),
            stat(games.week, "Запусков за неделю", "Сколько раз запускали игру за последние 7 дней"),
            stat(games.total, "Запусков всего", "Сколько раз запускали игру за всё время")
          )
        );
        const top = u.top || [];
        if (top.length) {
          usageBox.append(
            bars(
              "Топ-5 версий игры за 30 дней",
              top.map((t) => ({
                name: `${t.mc} · ${LOADER_NAMES[t.loader] || t.loader}${t.igrobar ? " (IGROBAR)" : ""}`,
                count: t.count,
                percent: pct(t.count, u.top_total),
              }))
            )
          );
        }
        const versions = u.versions || [];
        if (versions.length) {
          const total = versions.reduce((sum, v) => sum + (v.count || 0), 0);
          const current = S.info ? S.info.version : "";
          usageBox.append(
            bars(
              "Версии лаунчера у тех, кто открывал его за 30 дней",
              versions.map((v) => ({
                name: v.version === "?" ? "неизвестно" : `v${v.version}`,
                count: v.count,
                percent: pct(v.count, total),
                current: v.version === current,
              }))
            )
          );
        }
      }
      api.usage
        .get(true)
        .then((u) => {
          if (u) {
            S.usage = u;
            fillUsage();
          }
        })
        .catch(() => {});

      render();
      return {
        update(kind) {
          if (kind === "usage") fillUsage();
          const typing = document.activeElement && wrap.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA";
          if ((kind === "settings" || kind === "builds") && !typing) render();
        },
        cleanup() {
          offs.forEach((off) => off());
        },
      };
    },
  };
})();
