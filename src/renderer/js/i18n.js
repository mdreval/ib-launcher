/*
 * Перевод интерфейса на лету: всё, что появляется на экране (текст, подсказки,
 * плейсхолдеры, уведомления), переводится по словарю из src/shared/i18n.js.
 * Журнал игры (.log-view) не переводится — там вывод самой игры.
 */
(function () {
  const IB = (window.IB = window.IB || {});
  const dict = window.IB_I18N;
  IB.lang = "ru";
  IB.t = (text) => dict.translate(text, IB.lang);

  const ATTRS = ["placeholder", "title", "aria-label"];
  const SKIP = ".log-view, script, style, textarea, [data-no-i18n]";
  const ATTR_SKIP = ".log-view, [data-no-i18n]";

  function skip(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest(SKIP);
  }

  function translateText(node) {
    if (skip(node)) return;
    const next = dict.translate(node.nodeValue, IB.lang);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function translateAttrs(el) {
    if (el.closest && el.closest(ATTR_SKIP)) return;
    for (const attr of ATTRS) {
      const value = el.getAttribute && el.getAttribute(attr);
      if (value) {
        const next = dict.translate(value, IB.lang);
        if (next !== value) el.setAttribute(attr, next);
      }
    }
  }

  function walk(root) {
    if (root.nodeType === 3) return translateText(root);
    if (root.nodeType !== 1) return;
    translateAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === 3) translateText(node);
      else translateAttrs(node);
      node = walker.nextNode();
    }
  }

  IB.i18n = {
    start(lang) {
      IB.lang = ["ru", "uk", "en"].includes(lang) ? lang : "ru";
      document.documentElement.lang = IB.lang;
      if (IB.lang === "ru") return;
      walk(document.body);
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "characterData") translateText(m.target);
          else if (m.type === "attributes") translateAttrs(m.target);
          else for (const n of m.addedNodes) walk(n);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    },
    locale() {
      return { ru: "ru-RU", uk: "uk-UA", en: "en-US" }[IB.lang] || "ru-RU";
    },
  };
})();
