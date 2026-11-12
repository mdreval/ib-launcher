/* Карта сервера IGROBAR: обычная карта мира (DynMap) и карта МТР (поезда).
   Адреса — data/server_profiles.json → dynmap_url и mtr_map_url. */
(function () {
  const IB = window.IB;
  const { h } = IB;
  const api = window.ib;

  const MAPS = [
    { id: "world", title: "Карта сервера", sub: "Живая карта мира IGROBAR", key: "dynmap_url", fallback: "https://igrobar.dynmap.xyz/", partition: "persist:dynmap" },
    { id: "mtr", title: "Карта МТР", sub: "Карта поездов и линий МТР", key: "mtr_map_url", fallback: "http://d11.joinserver.xyz:25986/", partition: "persist:mtrmap" },
  ];

  // Каждая карта загружается один раз и не перезагружается при переключении
  // и при уходе со вкладки.
  const webviews = {};

  function savedMap() {
    try {
      return localStorage.getItem("ib.map") || "world";
    } catch (err) {
      return "world";
    }
  }

  function saveMap(id) {
    try {
      localStorage.setItem("ib.map", id);
    } catch (err) {
      /* не важно */
    }
  }

  IB.pages.map = {
    mount(host) {
      const server = IB.serverBuild();
      const maps = MAPS.map((m) => ({ ...m, url: (server && server[m.key]) || m.fallback })).filter((m) => m.url);
      let current = maps.find((m) => m.id === savedMap()) || maps[0];

      const page = h("section", { class: "page page--fixed" });
      host.append(page);

      const title = h("h1");
      const subtitle = h("p");
      const seg = h("div", { class: "segmented" });
      const reload = h("button", { class: "btn", html: `${IB.icon("refresh")}Обновить`, onClick: () => webviews[current.id] && webviews[current.id].reload() });
      const external = h("button", { class: "btn", html: `${IB.icon("external")}Открыть в браузере`, onClick: () => api.app.openExternal(current.url) });

      page.append(
        h(
          "div",
          { class: "page-head", style: { marginBottom: "16px" } },
          h("div", {}, title, subtitle),
          h("div", { class: "row", style: { flexWrap: "wrap", justifyContent: "flex-end" } }, seg, reload, external)
        )
      );
      const frame = h("div", { class: "map-frame" });
      page.append(frame);

      const show = (map) => {
        current = map;
        saveMap(map.id);
        title.textContent = map.title;
        subtitle.textContent = `${map.sub} — ${map.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
        for (const btn of seg.children) btn.setAttribute("aria-pressed", String(btn.dataset.id === map.id));
        let wv = webviews[map.id];
        if (!wv || wv.getAttribute("src") !== map.url) {
          wv = document.createElement("webview");
          wv.setAttribute("src", map.url);
          wv.setAttribute("partition", map.partition);
          wv.setAttribute("allowpopups", "false");
          webviews[map.id] = wv;
        }
        // Скрываем через visibility, а не display:none — так webview в Electron
        // не теряет размер и не перезагружается.
        for (const [id, other] of Object.entries(webviews)) other.classList.toggle("map-frame__hidden", id !== map.id);
        for (const m of maps) {
          const v = webviews[m.id];
          if (v && v.parentNode !== frame) frame.append(v);
        }
      };

      for (const m of maps) {
        seg.append(h("button", { type: "button", "data-id": m.id, text: m.title, onClick: () => show(m) }));
      }
      show(current);
      return {};
    },
  };
})();
