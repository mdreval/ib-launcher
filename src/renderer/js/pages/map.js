/* Карта сервера IGROBAR (DynMap) — как вкладка карты в старом лаунчере */
(function () {
  const IB = window.IB;
  const { h } = IB;
  const api = window.ib;

  let webview = null; // карта не перезагружается при каждом переходе на вкладку

  IB.pages.map = {
    mount(host) {
      const server = IB.serverBuild();
      const url = (server && server.dynmap_url) || "https://igrobar.dynmap.xyz/";
      const page = h("section", { class: "page page--fixed" });
      host.append(page);

      const reload = h("button", { class: "btn", html: `${IB.icon("refresh")}Обновить`, onClick: () => webview && webview.reload() });
      const external = h("button", { class: "btn", html: `${IB.icon("external")}Открыть в браузере`, onClick: () => api.app.openExternal(url) });
      page.append(
        h(
          "div",
          { class: "page-head", style: { marginBottom: "16px" } },
          h("div", {}, h("h1", { text: "Карта сервера" }), h("p", { text: `Живая карта мира IGROBAR — ${url.replace(/^https?:\/\//, "").replace(/\/$/, "")}` })),
          h("div", { class: "row" }, reload, external)
        )
      );
      const frame = h("div", { class: "map-frame" });
      page.append(frame);

      if (!webview || webview.getAttribute("src") !== url) {
        webview = document.createElement("webview");
        webview.setAttribute("src", url);
        webview.setAttribute("partition", "persist:dynmap");
        webview.setAttribute("allowpopups", "false");
      }
      frame.append(webview);
      return {};
    },
  };
})();
