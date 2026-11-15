/*
 * Живые переключатели и вкладки (компонент «Toggle switch», designbookmark.com/motion,
 * и «тянущаяся» подсветка из той же библиотеки).
 *
 * Переключатели (всё, что делает IB.switchEl): ручка едет на пружине и на ходу
 * вытягивается в сторону, куда едет, потом с маленьким отскоком округляется
 * обратно, а дорожка плавно перекрашивается в цвет темы.
 *
 * Вкладки — «Новости / Онлайн», фишки «Релиз / Снапшот / …», сегменты
 * «Установлено / Каталог» и т. п.: подсветка переезжает к выбранной вкладке.
 * Передний край едет на быстрой пружине, задний догоняет на медленной, поэтому
 * по дороге подсветка растягивается. Вид подсветки у каждого типа вкладок свой,
 * как и раньше. Содержимое «Новости / Онлайн» въезжает с той стороны, куда
 * переключили.
 *
 * Окна лаунчера (настройки сборки, аккаунты, журнал, скриншоты, подтверждения)
 * и всплывающие меню открываются и закрываются плавно: вырастают оттуда, где
 * нажали, и туда же уходят; фон за окном мягко затемняется.
 *
 * Всё подхватывается само — и то, что уже на экране, и то, что появится потом.
 * Страницы перерисовывают вкладки целиком, поэтому прошлое место подсветки
 * запоминается и после перерисовки.
 */
(function () {
  const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Пружины: [жёсткость, затухание].
  const SPRING = {
    knob: [320, 18], // switch.js: ручка переключателя
    stretch: [300, 20], // switch.js: вытягивание ручки
    lead: [620, 36], // --spring-lead: край подсветки со стороны движения
    trail: [190, 19], // --spring-trail: отстающий край — он и даёт растяжение
    fade: [420, 32], // --spring-fade: прозрачность и небольшие сдвиги
    soft: [260, 24], // --spring-soft: большие перемещения — окна, панели
  };
  const KICK = 60; // толчок вытягивания при переключении (switch.js)

  const S = (x, [k, c]) => ({ x, v: 0, t: x, k, c: reduce ? 2 * Math.sqrt(k) : c });
  const tune = (s, [k, c]) => {
    s.k = k;
    s.c = reduce ? 2 * Math.sqrt(k) : c;
  };
  const step = (s, dt) => {
    const a = -s.k * (s.x - s.t) - s.c * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const still = (s, eps) => Math.abs(s.x - s.t) < eps && Math.abs(s.v) < eps;
  const settle = (list) => list.forEach((s) => ((s.x = s.t), (s.v = 0)));

  // ---------- общий цикл: крутится, только пока что-то движется ----------
  const active = new Set();
  let raf = 0;
  let last = 0;
  function wake(item) {
    active.add(item);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    for (const it of active) {
      if (!it.el.isConnected) {
        active.delete(it);
        continue;
      }
      for (let k = 0; k < 4; k++) for (const s of it.springs) step(s, dt / 4); // 4 подшага, как в оригинале
      it.render();
      const done = it.doneWhen ? it.doneWhen() : it.springs.every((s) => still(s, it.eps || 0.01));
      if (!done) continue;
      settle(it.springs);
      it.render();
      active.delete(it);
      if (it.onRest) it.onRest();
    }
    raf = active.size ? requestAnimationFrame(loop) : 0;
  }

  // =====================================================================
  // Переключатели
  // =====================================================================
  const KNOB = 20; // ручка в покое, px (как в components.css)
  const TRAVEL = 22; // ход ручки, px
  const GROW = 8; // насколько ручка вытягивается на ходу, px
  const checkedProp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
  // Некоторые настройки после переключения перерисовывают карточку целиком
  // («Живой фон», «Сезонные эффекты»), иногда два раза подряд. Новый
  // переключатель с тем же названием продолжает движение старого — с того же
  // места и с той же скоростью, а не появляется сразу на месте.
  const lastSwitch = new Map(); // название → { el, P, G, at }
  const switchName = (input) => input.getAttribute("aria-label") || "";

  function enhanceSwitch(label) {
    if (label.__motion) return;
    const input = label.querySelector('input[type="checkbox"]');
    const track = label.querySelector(".switch__track");
    if (!input || !track) return;
    label.__motion = true;
    label.classList.add("switch--motion");
    const knob = document.createElement("span");
    knob.className = "switch__knob";
    track.append(knob);

    let on = checkedProp.get.call(input);
    const P = S(on ? 1 : 0, SPRING.knob); // положение ручки 0…1
    const G = S(0, SPRING.stretch); // вытягивание 0…1
    const name = switchName(input);
    const prev = name && lastSwitch.get(name);
    const mine = { el: label, P, G, at: 0 };
    if (prev && !prev.el.isConnected && performance.now() - prev.at < 1500) {
      Object.assign(P, { x: prev.P.x, v: prev.P.v }); // продолжить с прежнего места
      Object.assign(G, { x: prev.G.x, v: prev.G.v });
      mine.at = prev.at;
    }
    if (name) lastSwitch.set(name, mine);
    const item = {
      el: label,
      springs: [P, G],
      eps: 0.002,
      render() {
        const p = clamp(P.x, 0, 1);
        const grow = clamp(G.x, 0, 1) * GROW;
        const x = P.x * TRAVEL; // без ограничения — так виден отскок в конце
        // ручка вытягивается, передний край ведёт
        knob.style.width = `${(KNOB + grow).toFixed(2)}px`;
        knob.style.transform = `translateX(${(on ? x - grow * p : x).toFixed(2)}px)`;
        label.style.setProperty("--p", p.toFixed(3)); // цвет дорожки и ручки
      },
    };
    function flip(next) {
      if (next === on) return;
      on = next;
      P.t = on ? 1 : 0;
      G.t = 0;
      G.v = KICK;
      if (!label.isConnected) {
        settle(item.springs);
        item.render();
        return;
      }
      wake(item);
    }
    input.addEventListener("change", () => {
      mine.at = performance.now();
      flip(checkedProp.get.call(input));
    });
    // галочку поставили из кода (например, «Сбросить настройки»)
    Object.defineProperty(input, "checked", {
      configurable: true,
      enumerable: true,
      get() {
        return checkedProp.get.call(this);
      },
      set(v) {
        checkedProp.set.call(this, v);
        flip(!!v);
      },
    });
    item.render();
    if (P.x !== P.t || G.v) wake(item);
  }

  // =====================================================================
  // Вкладки
  // =====================================================================
  const groups = new WeakMap();
  const remembered = new Map(); // подпись группы → последнее место подсветки (для перерисованных групп)

  function kindOf(box) {
    if (box.classList.contains("home-side__tabs")) return "home";
    if (box.classList.contains("segmented")) return box.classList.contains("segmented--soft") ? "soft" : "seg";
    return "chips";
  }
  function itemsOf(g) {
    const sel = g.kind === "home" ? ".home-side__tab" : g.kind === "chips" ? ".chip[aria-pressed]" : "button";
    return [...g.box.children].filter((el) => el.matches(sel));
  }
  const isOn = (el) => el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-selected") === "true";
  const signature = (g, items) => `${g.kind}|${items.map((el) => el.textContent.replace(/[\d\s·()]+/g, "")).join("|")}`;

  function enhanceGroup(box) {
    if (groups.has(box) || box.dataset.tabs === "off") return;
    const g = {
      box,
      kind: kindOf(box),
      pill: document.createElement("span"),
      L: S(0, SPRING.lead),
      R: S(0, SPRING.trail),
      T: S(0, SPRING.lead),
      B: S(0, SPRING.trail),
      placed: false,
      index: -1,
      busy: false,
    };
    g.pill.className = `tabs-pill tabs-pill--${g.kind}`;
    g.pill.setAttribute("aria-hidden", "true");
    groups.set(box, g);
    box.classList.add("tabs-motion");
    g.item = {
      el: box,
      springs: [g.L, g.R, g.T, g.B],
      eps: 0.05,
      render() {
        g.pill.style.transform = `translate(${g.L.x.toFixed(2)}px,${g.T.x.toFixed(2)}px)`;
        g.pill.style.width = `${Math.max(0, g.R.x - g.L.x).toFixed(2)}px`;
        g.pill.style.height = `${Math.max(0, g.B.x - g.T.x).toFixed(2)}px`;
      },
    };
    new MutationObserver(() => update(g)).observe(box, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "aria-selected", "hidden"],
    });
    new ResizeObserver(() => update(g, true)).observe(box);
    update(g);
  }

  function update(g, fromResize = false) {
    if (g.busy) return;
    g.busy = true;
    try {
      const { box, pill } = g;
      if (pill.parentNode !== box) box.prepend(pill); // группу перерисовали — вернуть подсветку
      const items = itemsOf(g);
      const on = items.filter(isOn);
      if (on.length !== 1 || !box.offsetWidth) {
        // ничего не выбрано или выбрано несколько — обычный вид кнопок
        box.classList.remove("tabs-motion--on");
        return;
      }
      box.classList.add("tabs-motion--on");
      const el = on[0];
      const rect = { l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight };
      const index = items.indexOf(el);
      const sig = signature(g, items);

      if (!g.placed) {
        // группа новая: если такую уже видели (страницу перерисовали) — едем с прошлого места
        const prev = remembered.get(sig);
        g.placed = true;
        g.index = index;
        Object.assign(g.L, { x: prev ? prev.l : rect.l, t: rect.l, v: 0 });
        Object.assign(g.R, { x: prev ? prev.r : rect.r, t: rect.r, v: 0 });
        Object.assign(g.T, { x: prev ? prev.t : rect.t, t: rect.t, v: 0 });
        Object.assign(g.B, { x: prev ? prev.b : rect.b, t: rect.b, v: 0 });
        g.item.render();
        remembered.set(sig, rect);
        if (prev && (prev.l !== rect.l || prev.t !== rect.t)) aim(g, rect, prev);
        return;
      }
      const moved = index !== g.index;
      const from = { l: g.L.x, t: g.T.x };
      remembered.set(sig, rect);
      if (fromResize && !moved) {
        // Размер не поменялся (первый вызов наблюдателя) — не мешаем движению.
        if (rect.l === g.L.t && rect.r === g.R.t && rect.t === g.T.t && rect.b === g.B.t) return;
        // изменилась ширина (например, число в «Онлайн · 3») — подтянуть без растяжения
        Object.assign(g.L, { x: rect.l, t: rect.l, v: 0 });
        Object.assign(g.R, { x: rect.r, t: rect.r, v: 0 });
        Object.assign(g.T, { x: rect.t, t: rect.t, v: 0 });
        Object.assign(g.B, { x: rect.b, t: rect.b, v: 0 });
        g.item.render();
        return;
      }
      if (moved && g.kind === "home") slidePanel(g, index > g.index ? 1 : -1);
      g.index = index;
      aim(g, rect, from);
    } finally {
      g.busy = false;
    }
  }

  // Края подсветки: тот, что смотрит в сторону движения, — на быстрой пружине.
  function aim(g, rect, from) {
    const right = rect.l >= from.l;
    tune(g.L, right ? SPRING.trail : SPRING.lead);
    tune(g.R, right ? SPRING.lead : SPRING.trail);
    const down = rect.t >= from.t;
    tune(g.T, down ? SPRING.trail : SPRING.lead);
    tune(g.B, down ? SPRING.lead : SPRING.trail);
    g.L.t = rect.l;
    g.R.t = rect.r;
    g.T.t = rect.t;
    g.B.t = rect.b;
    wake(g.item);
  }

  // «Новости / Онлайн»: содержимое въезжает с той стороны, куда переключили.
  function slidePanel(g, dir) {
    const panel = g.box.nextElementSibling;
    if (!panel || !panel.classList.contains("home-side__body")) return;
    if (!panel.__slide) {
      const X = S(0, SPRING.fade);
      const O = S(1, SPRING.fade);
      panel.__slide = {
        X,
        O,
        item: {
          el: panel,
          springs: [X, O],
          eps: 0.003,
          render() {
            panel.style.transform = Math.abs(X.x) < 0.01 ? "" : `translateX(${X.x.toFixed(2)}px)`;
            panel.style.opacity = O.x >= 0.999 ? "" : clamp(O.x, 0, 1).toFixed(3);
          },
        },
      };
    }
    const { X, O, item } = panel.__slide;
    Object.assign(X, { x: dir * 18, t: 0, v: 0 });
    Object.assign(O, { x: 0, t: 1, v: 0 });
    item.render();
    wake(item);
  }

  // =====================================================================
  // Окна (IB.modal) и всплывающие меню (IB.popover)
  // =====================================================================
  // Последнее нажатие: окно вырастает оттуда, где нажали, и туда же уходит.
  let lastPress = null;
  document.addEventListener("pointerdown", (e) => (lastPress = { x: e.clientX, y: e.clientY, at: performance.now() }), true);

  function originFrom(el) {
    const r = el.getBoundingClientRect();
    if (lastPress && performance.now() - lastPress.at < 1000) {
      return `${clamp(lastPress.x - r.left, 0, r.width).toFixed(1)}px ${clamp(lastPress.y - r.top, 0, r.height).toFixed(1)}px`;
    }
    return "50% 50%";
  }

  // Пружины одного окна: размер, сдвиг, прозрачность окна и затемнения.
  function motionOf(box, backdrop, from) {
    if (box.__win) return box.__win;
    const w = {
      Sc: S(from.scale, SPRING.soft),
      Y: S(from.y, SPRING.soft),
      O: S(0, SPRING.fade),
      B: S(backdrop ? 0 : 1, SPRING.fade),
    };
    w.item = {
      el: backdrop || box,
      springs: [w.Sc, w.Y, w.O, w.B],
      eps: 0.002,
      render() {
        box.style.transform = `translateY(${w.Y.x.toFixed(2)}px) scale(${w.Sc.x.toFixed(4)})`;
        box.style.opacity = clamp(w.O.x, 0, 1).toFixed(3);
        if (backdrop) backdrop.style.opacity = clamp(w.B.x, 0, 1).toFixed(3);
      },
      onRest: null,
    };
    box.__win = w;
    return w;
  }
  const clearStyles = (box, backdrop) => {
    box.style.transform = "";
    box.style.opacity = "";
    box.style.willChange = "";
    if (backdrop) backdrop.style.opacity = "";
  };

  function open(box, backdrop, from) {
    box.style.transformOrigin = originFrom(box);
    box.style.willChange = "transform, opacity";
    const w = motionOf(box, backdrop, from);
    tune(w.Sc, SPRING.soft);
    tune(w.Y, SPRING.soft);
    w.Sc.t = 1;
    w.Y.t = 0;
    w.O.t = 1;
    w.B.t = 1;
    w.item.onRest = () => clearStyles(box, backdrop);
    w.item.doneWhen = null;
    w.item.render();
    wake(w.item);
  }

  function close(box, backdrop, to, done) {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done();
    };
    const w = motionOf(box, backdrop, { scale: 1, y: 0 });
    if (!box.__win.O.x && !box.style.opacity) Object.assign(w.O, { x: 1, t: 1 }); // окно уже стояло открытым
    if (backdrop && !backdrop.style.opacity) Object.assign(w.B, { x: 1, t: 1 });
    box.style.willChange = "transform, opacity";
    // закрывается быстрее, чем открывается, и без отскока
    tune(w.Sc, SPRING.fade);
    tune(w.Y, SPRING.fade);
    w.Sc.t = to.scale;
    w.Y.t = to.y;
    w.O.t = 0;
    w.B.t = 0;
    w.item.onRest = finish;
    w.item.doneWhen = () => w.O.x < 0.01 && w.B.x < 0.01; // убрать, как только исчезло с экрана
    w.item.render();
    wake(w.item);
    setTimeout(finish, 1200); // если окно лаунчера свёрнуто и кадры не идут
  }

  const isShot = (box) => !!box.querySelector(".shot-viewer");

  window.IB = window.IB || {};
  window.IB.motion = {
    modalOpen(backdrop, box) {
      backdrop.classList.add("is-motion");
      // скриншот заметнее «вырастает» из картинки, по которой нажали
      open(box, backdrop, isShot(box) ? { scale: 0.82, y: 0 } : { scale: 0.92, y: 16 });
    },
    modalClose(backdrop, box, done) {
      backdrop.classList.add("is-motion");
      backdrop.inert = true; // закрывающееся окно уже не ловит нажатия
      backdrop.style.pointerEvents = "none";
      close(box, backdrop, isShot(box) ? { scale: 0.88, y: 0 } : { scale: 0.95, y: 10 }, done);
    },
    popoverOpen(el, above) {
      el.classList.add("is-motion");
      el.__above = above;
      open(el, null, { scale: 0.94, y: above ? 8 : -8 });
    },
    popoverClose(el, done) {
      el.style.pointerEvents = "none";
      close(el, null, { scale: 0.96, y: el.__above ? 6 : -6 }, done);
    },
  };

  // =====================================================================
  // Подхватываем всё, что появляется на экране
  // =====================================================================
  function scan(node) {
    if (node.nodeType !== 1) return;
    const all = (sel) => (node.matches(sel) ? [node] : []).concat([...node.querySelectorAll(sel)]);
    all("label.switch").forEach(enhanceSwitch);
    all(".segmented, .home-side__tabs").forEach(enhanceGroup);
    const chipBoxes = new Set(all(".chip[aria-pressed]").map((c) => c.parentElement));
    if (node.matches(".chip[aria-pressed]") && node.parentElement) chipBoxes.add(node.parentElement);
    chipBoxes.forEach((box) => box && enhanceGroup(box));
  }
  function start() {
    scan(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains("tabs-pill")) scan(n);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
