/* Настройки: память, модпак IGROBAR, папка игры, поведение, аргументы JVM, обновления, данные */
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
          const themes = [
            { id: "green", title: "Зелёная", sub: "Ночной лес", img: "../../assets/ui/background.jpg", logo: "../../assets/ui/logo.png" },
            { id: "red", title: "Красная IGROBAR", sub: "Цвета сервера", img: "../../assets/ui/background-igrobar.jpg", logo: "../../assets/ui/logo-red.png" },
            {
              id: "custom",
              title: "Свой цвет",
              sub: "Любой оттенок — ниже",
              img: "../../assets/ui/background.jpg",
              logo: IB.theme.customPalette(accent).light ? "../../assets/ui/logo-black.png" : "../../assets/ui/logo-gray.png",
              custom: true,
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
                    class: `theme-option__preview${t.custom ? " theme-option__preview--custom" : ""}`,
                    style: t.custom ? { backgroundImage: `url("${t.img}")`, "--swatch": accent } : { backgroundImage: `url("${t.img}")` },
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

          // фон
          const bgSeg = h(
            "div",
            { class: "segmented" },
            h("button", { "aria-pressed": String(a.background !== "custom"), text: "Картинка темы", onClick: async () => apply(await run(() => api.appearance.set({ background: "theme" }))) }),
            h("button", {
              "aria-pressed": String(a.background === "custom"),
              text: "Своя картинка",
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

          card.append(
            h("h3", { text: "Оформление" }),
            h("p", { text: "Цвет лаунчера и картинка на фоне. Свою картинку можно выбрать с компьютера или вставить ссылку на неё из интернета." }),
            themeRow,
            colorRow,
            h("div", { class: "row", style: { marginTop: "14px", gap: "10px", flexWrap: "wrap" } }, bgSeg, pickBtn, urlBtn, delBtn)
          );
          if (dimRow) card.append(dimRow);
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

      render();
      return {
        update(kind) {
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
