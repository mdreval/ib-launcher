/*
 * Сворачиваемая боковая панель («Sidebar collapse», designbookmark.com/motion).
 *
 * Нажатие на логотип IB раскрывает меню с названиями разделов и сворачивает
 * его обратно. Ширина панели едет на одной пружине. У каждой подписи своя
 * пружина прозрачности: при открытии они стартуют чуть позже одна за другой
 * (каскад сверху вниз), при закрытии гаснут все сразу. Подсветка выбранного
 * раздела переезжает на своей пружине.
 *
 * Пока меню раскрыто, подсказки с названиями при наведении не показываются —
 * названия и так видны. В свёрнутом виде всё как раньше.
 * Кнопки Telegram и Discord внизу: в свёрнутой панели стоят столбиком,
 * в раскрытой перестраиваются в ряд по центру — на той же пружине, что и панель.
 * Состояние запоминается: каким меню закрыли, таким оно и откроется.
 *
 * Узкое окно. Лаунчер рассчитан на основную область не уже 988px (окно
 * не уже 1212 — minWidth в src/main/window.js). Если раскрытое
 * меню оставило бы меньше, оно не раздвигает страницу, а выезжает поверх неё
 * (с тенью) и закрывается, когда выбрали раздел или нажали мимо. Так страница
 * и кнопки окна (свернуть, закрыть) никогда не уезжают за край.
 */
(function () {
  const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Пружины из side.js оригинала: [жёсткость, затухание].
  const SPRING = {
    width: [260, 24], // ширина панели
    label: [300, 26], // появление и исчезновение подписей
    highlight: [380, 28], // подсветка выбранного раздела
  };
  const CASCADE_START = 0.06; // с: первая подпись
  const CASCADE_STEP = 0.04; // с: каждая следующая
  const KEY = "ib.sidebarOpen";
  const MIN_MAIN = 988; // минимальная ширина основной области, px
  const ROOM_SLACK = 16; // запас, чтобы меню не прыгало туда-сюда на самой границе

  const S = (x, [k, c]) => ({ x, v: 0, t: x, k, c: reduce ? 2 * Math.sqrt(k) : c });
  const step = (s, dt) => {
    const a = -s.k * (s.x - s.t) - s.c * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const still = (s, eps) => Math.abs(s.x - s.t) < eps && Math.abs(s.v) < eps;

  let shell = null;
  let side = null;
  let toggle = null;
  let tip = null;
  let nav = null;
  let indicator = null;
  let labels = [];
  let socials = [];
  let socialSize = 44;
  const SOCIAL_GAP_Y = 8; // между кнопками столбиком (как в layout.css)
  const SOCIAL_GAP_X = 12; // между кнопками в ряд
  let closedW = 92;
  let open = false; // раскрыто ли меню сейчас
  let pref = false; // как оставил игрок (запоминается)
  let overlay = false; // меню поверх страницы (узкое окно)
  let ySet = false;

  const W = S(92, SPRING.width);
  const Y = S(0, SPRING.highlight);

  // ---------- таймеры в «физическом» времени и цикл, который спит, когда всё стоит ----------
  let timers = [];
  const after = (sec, fn) => timers.push({ t: sec, fn });
  let raf = 0;
  let last = 0;
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].fn();
    for (let k = 0; k < 4; k++) frame(dt / 4); // 4 подшага физики на кадр, как в оригинале
    render();
    if (idle()) raf = 0;
    else raf = requestAnimationFrame(loop);
  }
  function frame(dt) {
    step(W, dt);
    step(Y, dt);
    for (const l of labels) step(l.s, dt);
    for (const b of socials) step(b.s, dt);
  }
  function idle() {
    if (timers.length) return false;
    if (!still(W, 0.01) || !still(Y, 0.01) || labels.some((l) => !still(l.s, 0.001)) || socials.some((b) => !still(b.s, 0.001))) return false;
    for (const s of [W, Y, ...labels.map((l) => l.s), ...socials.map((b) => b.s)]) {
      s.x = s.t;
      s.v = 0;
    }
    if (!open && overlay) setOverlay(false); // меню поверх страницы закрылось
    render();
    return true;
  }

  function render() {
    if (!shell) return;
    if (overlay) {
      // поверх страницы: колонка остаётся узкой, панель шире неё
      shell.style.setProperty("--sidebar-w", `${closedW}px`);
      side.style.width = `${W.x.toFixed(2)}px`;
    } else {
      shell.style.setProperty("--sidebar-w", `${W.x.toFixed(2)}px`);
      side.style.width = "";
    }
    for (const l of labels) {
      const o = clamp(l.s.x, 0, 1);
      l.el.style.opacity = o.toFixed(3);
      l.el.style.transform = `translateX(${((1 - o) * -10).toFixed(2)}px)`;
      l.el.style.visibility = o > 0.001 ? "visible" : "hidden";
    }
    if (indicator) indicator.style.transform = `translateY(${Y.x.toFixed(2)}px)`;

    // Telegram и Discord: из столбика (0) в ряд по центру панели (1)
    const n = socials.length;
    const sz = socialSize;
    const rowLeft = (W.x - 1 - (n * sz + (n - 1) * SOCIAL_GAP_X)) / 2; // 1px — рамка справа
    socials.forEach((b, i) => {
      const p = b.s.x;
      const cx = (closedW - 1 - sz) / 2;
      const cy = i * (sz + SOCIAL_GAP_Y);
      const ex = rowLeft + i * (sz + SOCIAL_GAP_X);
      const ey = (n - 1) * (sz + SOCIAL_GAP_Y); // ряд — на месте нижней кнопки
      b.el.style.translate = `${(cx + (ex - cx) * p).toFixed(2)}px ${(cy + (ey - cy) * p).toFixed(2)}px`;
    });
  }

  // Ширина раскрытой панели: по самой длинной подписи (на любом языке).
  function openWidth() {
    let text = 0;
    let left = 61;
    for (const l of labels) {
      text = Math.max(text, l.text.offsetWidth);
      left = l.el.offsetLeft || left;
    }
    const navGap = side.clientWidth && nav ? side.clientWidth - nav.offsetWidth : closedW - 64;
    return Math.round(clamp(navGap + left + text + 22 + 1, 190, 320));
  }

  // Хватит ли места, чтобы раскрытое меню раздвинуло страницу.
  const roomy = (w, slack = 0) => window.innerWidth - w >= MIN_MAIN + slack;

  function setOverlay(on) {
    overlay = on;
    side.classList.toggle("is-overlay", on);
  }

  function savePref(on) {
    pref = on;
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {}
  }

  // Нажатие на логотип.
  function toggleMenu() {
    if (open) {
      if (!overlay) savePref(false);
      setOpen(false);
      return;
    }
    if (roomy(openWidth())) {
      setOverlay(false);
      savePref(true);
    } else setOverlay(true); // узкое окно: поверх страницы, ненадолго
    setOpen(true);
  }

  // Окно поменяло размер: меню, которое раздвигает страницу, должно помещаться.
  function fitWindow() {
    if (!side) return;
    if (open && !overlay && !roomy(W.t)) setOpen(false); // стало тесно — свернуть (выбор игрока помним)
    else if (open && overlay && roomy(W.t, ROOM_SLACK)) {
      setOverlay(false); // окно расширили — меню снова раздвигает страницу
      render();
    } else if (!open && pref && roomy(openWidth(), ROOM_SLACK)) {
      setOverlay(false);
      setOpen(true);
    }
  }

  function setOpen(next, animate = true) {
    open = next;
    side.classList.toggle("is-open", open);
    const text = open ? "Свернуть меню" : "Развернуть меню";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", text);
    if (tip) tip.textContent = text;

    W.t = open ? openWidth() : closedW;
    timers = [];
    labels.forEach((l, i) => {
      if (open && animate) after(CASCADE_START + i * CASCADE_STEP, () => open && (l.s.t = 1));
      else l.s.t = open ? 1 : 0;
    });
    socials.forEach((b, i) => {
      if (open && animate && i) after(i * CASCADE_STEP, () => open && (b.s.t = 1));
      else b.s.t = open ? 1 : 0;
    });
    if (!animate) {
      for (const s of [W, ...labels.map((l) => l.s), ...socials.map((b) => b.s)]) {
        s.x = s.t;
        s.v = 0;
      }
      render();
      return;
    }
    wake();
  }

  window.addEventListener("resize", () => {
    if (socials.length) socialSize = socials[0].el.offsetWidth || socialSize;
    render();
    fitWindow();
  });

  // Меню поверх страницы закрывается нажатием мимо него, выбором раздела и Esc.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (open && overlay && side && !side.contains(e.target)) setOpen(false);
    },
    true
  );
  document.addEventListener("click", (e) => {
    if (open && overlay && e.target.closest && e.target.closest(".nav__btn")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open && overlay && !document.querySelector(".modal-backdrop:not([inert])")) setOpen(false);
  });

  const IB = (window.IB = window.IB || {});
  IB.sidebar = {
    /** Вызывается после того, как нарисовано меню (app.js → renderNav). */
    attach() {
      shell = document.querySelector(".shell");
      side = document.querySelector(".sidebar");
      toggle = document.getElementById("sidebar-toggle");
      nav = document.getElementById("nav");
      indicator = document.getElementById("nav-indicator");
      if (!shell || !side || !toggle || !nav) return;
      tip = toggle.querySelector(".tip");
      closedW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-w")) || 92;
      labels = [...nav.querySelectorAll(".nav__label")].map((el) => ({
        el,
        text: el.firstElementChild || el,
        s: S(0, SPRING.label),
      }));
      ySet = false;

      if (!toggle.__sidebar) {
        toggle.__sidebar = true;
        toggle.addEventListener("click", toggleMenu);
        // Подписи перевели на другой язык — подогнать ширину раскрытой панели.
        new MutationObserver(() => {
          if (open) {
            W.t = openWidth();
            wake();
            fitWindow();
          }
        }).observe(nav, { subtree: true, characterData: true, childList: true });
      }

      try {
        pref = localStorage.getItem(KEY) === "1";
      } catch {}
      // в узком окне при запуске меню свёрнуто (раскроется само, когда окно расширят)
      setOverlay(false);
      setOpen(pref && roomy(openWidth()), false);
    },
    /** Вызывается после того, как нарисованы кнопки Telegram и Discord (app.js). */
    footer() {
      const box = document.getElementById("sidebar-footer");
      if (!box) return;
      socials = [...box.querySelectorAll(".social-btn")].map((el) => ({ el, s: S(open ? 1 : 0, SPRING.width) }));
      socialSize = (socials[0] && socials[0].el.offsetWidth) || 44;
      render();
    },
    /** Подсветка выбранного раздела переезжает на пружине. */
    highlight(y) {
      Y.t = y;
      if (!ySet) {
        ySet = true;
        Y.x = y;
        Y.v = 0;
        render();
        return;
      }
      wake();
    },
    toggle: () => setOpen(!open),
    get open() {
      return open;
    },
  };
})();
