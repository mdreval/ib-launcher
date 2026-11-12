/* Правила и ссылки: правила сервера, полезные ссылки, как попасть на сервер.
   Содержимое — data/info.json на GitHub (правится без нового релиза). */
(function () {
  const IB = window.IB;
  const { h } = IB;
  const api = window.ib;

  IB.pages.rules = {
    mount(host) {
      const page = h("section", { class: "page" });
      host.append(page);
      let destroyed = false;

      function render(info) {
        page.textContent = "";
        page.append(
          h(
            "div",
            { class: "page-head" },
            h("div", {}, h("div", { class: "eyebrow", text: "Сервер IGROBAR" }), h("h1", { text: info.title || "Правила и ссылки" }), info.intro ? h("p", { text: info.intro }) : null),
            info.offline ? h("span", { class: "badge", title: "Нет связи с GitHub — показана сохранённая версия", text: "Офлайн" }) : null
          )
        );

        if (info.links.length) {
          const grid = h("div", { class: "link-grid" });
          for (const l of info.links) {
            grid.append(
              h(
                "button",
                {
                  class: `link-card${l.accent ? " link-card--accent" : ""}${l.url ? "" : " link-card--soon"}`,
                  type: "button",
                  title: l.url || "Скоро",
                  disabled: !l.url,
                  onClick: () => l.url && api.app.openExternal(l.url),
                },
                h("span", { class: "link-card__icon", html: IB.icon(l.icon) }),
                h("span", { class: "link-card__main" }, h("b", { text: l.title }), l.text ? h("small", { text: l.text }) : null),
                l.url ? h("span", { class: "link-card__go", html: IB.icon("external") }) : h("span", { class: "badge", text: "Скоро" })
              )
            );
          }
          page.append(grid);
        }

        const cols = h("div", { class: "rules-layout" });
        const rulesCol = h("div", { class: "rules-col" });
        info.rules.forEach((r, i) => {
          rulesCol.append(
            h(
              "div",
              { class: "card rules-card" },
              h("h3", { class: "rules-card__title" }, h("span", { class: "rules-card__num", text: String(i + 1) }), r.title || "Правила"),
              h("ol", { class: "rules-list" }, ...r.items.map((it) => h("li", { text: it })))
            )
          );
        });
        if (!info.rules.length) rulesCol.append(h("div", { class: "card muted", text: "Правила пока не добавлены." }));
        cols.append(rulesCol);

        if (info.whitelist) {
          const w = info.whitelist;
          cols.append(
            h(
              "div",
              { class: "card whitelist-card" },
              h("h3", { html: `${IB.icon("users")}<span>${IB.escapeHtml(w.title)}</span>` }),
              w.text ? h("p", { text: w.text }) : null,
              w.steps.length ? h("ol", { class: "steps-list" }, ...w.steps.map((s) => h("li", { text: s }))) : null,
              w.button ? h("button", { class: "btn btn--primary", style: { marginTop: "12px" }, html: `${IB.icon("external")}${IB.escapeHtml(w.button.title)}`, onClick: () => api.app.openExternal(w.button.url) }) : null
            )
          );
        }
        page.append(cols);
        if (info.updated) page.append(h("div", { class: "muted", style: { fontSize: "12px", marginTop: "14px" }, text: `Обновлено: ${IB.fmt.longDate(info.updated)}` }));
      }

      page.append(h("div", { class: "empty" }, h("span", { class: "spinner" }), "Загружаю…"));
      api.info
        .get(false)
        .then((info) => !destroyed && render(info))
        .catch((err) => {
          if (destroyed) return;
          page.textContent = "";
          page.append(h("div", { class: "empty", text: err.message }));
        });

      return {
        cleanup() {
          destroyed = true;
        },
      };
    },
  };
})();
