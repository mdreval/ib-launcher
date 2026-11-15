/*
 * Желейный ползунок («Jelly Slider», designbookmark.com/motion) для всех
 * ползунков лаунчера: память, громкость, перемотка, затемнение фона.
 *
 * Бегунок идёт за мышью на пружине и вытягивается от скорости. Пока тянут,
 * из него поднимается капля со значением; бегунок и капля сидят в одном
 * «жидком» слое (SVG-фильтр goo), поэтому капля отрывается и втекает обратно.
 * Если тянуть за край — резиновое сопротивление, после отпускания пружинит назад.
 *
 * Сам <input type="range"> остаётся на месте: он прозрачный и лежит поверх
 * дорожки. У него прежние value, события input/change, pointerdown/pointerup,
 * клавиатура и disabled, поэтому код страниц работать с ним не перестаёт.
 * Ползунки подхватываются сами, как только появляются на экране.
 *
 * Необязательные атрибуты у <input>:
 *   data-format="gb"   — значение в МБ, в капле показываются гигабайты (4,5)
 *   data-format="time" — значение в секундах, в капле время (1:23)
 *   data-scale="gb"    — шкала под дорожкой с отметками гигабайт
 *   data-jelly="off"   — оставить обычный ползунок
 * Без data-format ползунок от 0 до 1 показывает проценты, иначе само число.
 */
(function () {
  const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Пружины из tokens.css оригинала: [жёсткость, затухание].
  const SPRING = {
    follow: [900, 50], // --slider-follow: бегунок под мышью — без отставания и перелёта
    bubble: [420, 22], // --slider-bubble: капля со значением поднимается из бегунка
    release: [300, 14], // --slider-release: отпустили — встаёт на место с пружинкой
    glide: [420, 34], // --slider-glide (значение по умолчанию в slider.js): клавиатура и изменения из кода
    lean: [260, 18], // капля отстаёт от бегунка и наклоняется
    press: [520, 16], // наведение и нажатие
  };
  const BLUR = 8; // --slider-blur: насколько сливаются бегунок и капля

  // R радиус бегунка, TR половина нарисованного бегунка (фильтр съедает ~2px края,
  // поэтому рисуется 28, а читается как 24), D радиус капли, CY центр дорожки,
  // OX/OY сдвиг жидкого слоя, RISE на сколько поднимается капля.
  const R = 12, TR = 14, D = 18, OX = 40, OY = 80, CY = 16, RISE = -38, REST_DROP = 0.5;

  const S = (x, [k, c]) => ({ x, v: 0, t: x, k, c: reduce ? 2 * Math.sqrt(k) : c });
  const tune = (s, [k, c]) => {
    s.k = k;
    s.c = reduce ? 2 * Math.sqrt(k) : c; // уменьшение движения — без перелётов
  };
  const step = (s, dt) => {
    const a = -s.k * (s.x - s.t) - s.c * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rubber = (x, min, max, d = 18) =>
    x < min ? min - (1 - 1 / (((min - x) * 0.55) / d + 1)) * d : x > max ? max + (1 - 1 / (((x - max) * 0.55) / d + 1)) * d : x;

  const valueProp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const lang = () => (window.IB && window.IB.lang) || "ru";
  const dec = (s) => (lang() === "en" ? s : s.replace(".", ","));
  const GB = () => (lang() === "en" ? "GB" : "ГБ");

  // ---------- общий цикл анимации: крутится, только пока что-то движется ----------
  const active = new Set();
  let raf = 0;
  let last = 0;
  function wake(j) {
    active.add(j);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    for (const j of active) {
      if (!j.wrap.isConnected) {
        active.delete(j);
        continue;
      }
      for (let k = 0; k < 4; k++) j.frame(dt / 4); // 4 подшага физики на кадр, как в оригинале
      j.render();
      if (j.idle()) active.delete(j);
    }
    raf = active.size ? requestAnimationFrame(loop) : 0;
  }

  // ---------- SVG-фильтр «жидкости» (один на всё окно) ----------
  function ensureFilter() {
    if (document.getElementById("ib-jelly-goo")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
        '<filter id="ib-jelly-goo" x="-50%" y="-50%" width="200%" height="200%">' +
        `<feGaussianBlur in="SourceGraphic" stdDeviation="${BLUR}" result="b"/>` +
        '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g"/>' +
        '<feComposite in="SourceGraphic" in2="g" operator="atop"/>' +
        "</filter></svg>"
    );
  }

  const div = (cls) => {
    const el = document.createElement("div");
    el.className = cls;
    return el;
  };

  function enhance(input) {
    if (input.__jelly || input.type !== "range" || input.dataset.jelly === "off" || !input.parentNode) return;
    input.__jelly = true;
    ensureFilter();

    // ---------- разметка ----------
    const wrap = div("jelly");
    const rail = div("jelly__rail");
    const track = div("jelly__track");
    const fill = div("jelly__fill");
    const goo = div("jelly__goo");
    const drop = div("jelly__blob jelly__drop");
    const thumb = div("jelly__blob jelly__thumb");
    const label = div("jelly__label");
    label.setAttribute("aria-hidden", "true");
    label.setAttribute("data-no-i18n", "");
    track.append(fill);
    goo.append(drop, thumb);
    input.parentNode.insertBefore(wrap, input);
    rail.append(track, goo, label, input);
    wrap.append(rail);

    // ---------- значение ----------
    const num = (s, d) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : d;
    };
    const lim = () => {
      const min = num(input.min, 0);
      const max = num(input.max, 100);
      return [min, max > min ? max : min + 1];
    };
    const cur = () => num(valueProp.get.call(input), 0);
    const snap = (v) => {
      const [min, max] = lim();
      const st = input.step === "any" ? 0 : num(input.step, 1);
      if (st > 0) v = min + Math.round((v - min) / st) * st;
      return +clamp(v, min, max).toFixed(6);
    };
    const fmt = (v) => {
      const f = input.dataset.format;
      if (f === "gb") return dec(String(Math.round((v / 1024) * 10) / 10));
      if (f === "time") {
        const t = Math.max(0, Math.floor(v));
        return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      }
      const [min, max] = lim();
      if (min >= 0 && max <= 1) return String(Math.round(v * 100)); // доли — в процентах
      return String(Math.round(v));
    };

    // ---------- геометрия ----------
    let Wd = rail.clientWidth || 0;
    const span = () => Math.max(Wd - 2 * R, 1);
    const toX = (v) => {
      const [min, max] = lim();
      return R + ((clamp(v, min, max) - min) / (max - min)) * span();
    };
    const toV = (x) => {
      const [min, max] = lim();
      return min + clamp((x - R) / span(), 0, 1) * (max - min);
    };
    const localX = (e) => e.clientX - rail.getBoundingClientRect().left;

    const X = S(toX(cur()), SPRING.follow); // центр бегунка
    const DX = S(X.x, SPRING.lean); // капля отстаёт — поэтому наклоняется
    const DY = S(CY, SPRING.bubble); // высота капли
    const DS = S(REST_DROP, SPRING.bubble); // размер капли
    const PS = S(1, SPRING.press); // бегунок при наведении и нажатии
    const springs = [X, DX, DY, DS, PS];

    // ---------- шкала (для памяти) ----------
    let marks = [];
    let nums = [];
    let scaleEl = null;
    function buildScale() {
      if (input.dataset.scale !== "gb") return;
      if (!scaleEl) {
        scaleEl = div("jelly__ticks");
        scaleEl.setAttribute("aria-hidden", "true");
        scaleEl.setAttribute("data-no-i18n", "");
        wrap.append(scaleEl);
      }
      const [min, max] = lim();
      const lo = min / 1024;
      const hi = max / 1024;
      const all = hi - lo;
      const major = [1, 2, 4, 8, 16, 32, 64].find((s) => all / s <= 5) || 128;
      const minor = all <= 40 ? (all <= 8 ? 0.5 : 1) : major / 4;
      const markBox = div("jelly__marks");
      const numBox = div("jelly__nums");
      marks = [];
      nums = [];
      for (let g = Math.ceil(lo / minor - 1e-9) * minor; g <= hi + 1e-9; g += minor) {
        const m = document.createElement("i");
        m.style.setProperty("--p", (g - lo) / all);
        if (Math.abs(g % major) < 1e-9 || Math.abs(g - lo) < 1e-9 || Math.abs(g - hi) < 1e-9) m.className = "major";
        markBox.append(m);
        marks.push({ el: m, v: g * 1024 });
      }
      const labelAt = new Set([lo, hi]);
      for (let g = Math.ceil(lo / major) * major; g < hi; g += major) {
        const p = (g - lo) / all;
        if (p > 0.12 && p < 0.88) labelAt.add(g);
      }
      for (const g of [...labelAt].sort((a, b) => a - b)) {
        const n = document.createElement("span");
        n.style.setProperty("--p", (g - lo) / all);
        n.textContent = `${dec(String(Math.round(g * 10) / 10))} ${GB()}`;
        numBox.append(n);
        nums.push({ el: n, v: g * 1024 });
      }
      scaleEl.replaceChildren(markBox, numBox);
      lit = null;
    }
    let lit = null;
    function lightScale(v) {
      if (v === lit || !marks.length) return;
      lit = v;
      const [min] = lim();
      for (const m of marks) m.el.classList.toggle("on", v > min && m.v <= v + 1e-6);
      for (const n of nums) n.el.classList.toggle("on", v > min && n.v <= v + 1e-6);
    }
    buildScale();

    // ---------- состояние ----------
    let dragging = false;
    let hover = false;
    let lifted = false;
    let startValue = 0;
    let selfEvent = false;
    let pointerFocus = false;
    let shown = "";

    function sync() {
      const up = dragging || lifted;
      DY.t = up ? CY + RISE : CY;
      DS.t = up ? 1 : REST_DROP;
      PS.t = dragging ? 1.16 : hover ? 1.08 : 1;
      wake(j);
    }
    // плавно доехать до значения без рывка (клавиатура, изменения из кода)
    function goTo(v) {
      tune(X, SPRING.glide);
      X.t = toX(v);
      wake(j);
    }
    function place() {
      X.x = X.t = DX.x = DX.t = toX(cur());
      X.v = DX.v = 0;
      j.render();
    }
    function emit(type) {
      selfEvent = true;
      try {
        input.dispatchEvent(new Event(type, { bubbles: true }));
      } finally {
        selfEvent = false;
      }
    }
    function setFromPointer(px) {
      const v = snap(toV(clamp(px, R, Wd - R)));
      if (v === cur()) return;
      valueProp.set.call(input, String(v));
      emit("input");
    }

    // ---------- мышь и палец ----------
    input.addEventListener("pointerdown", (e) => {
      if (input.disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault(); // своё перетаскивание вместо стандартного — значение совпадает с бегунком
      pointerFocus = true; // фокус от мыши: капля не должна оставаться поднятой после отпускания
      input.focus({ preventScroll: true });
      pointerFocus = false;
      lifted = false;
      try {
        input.setPointerCapture(e.pointerId);
      } catch {}
      Wd = rail.clientWidth || Wd;
      dragging = true;
      startValue = cur();
      tune(X, SPRING.follow);
      X.t = rubber(localX(e), R, Wd - R);
      setFromPointer(localX(e));
      sync();
    });
    input.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      X.t = rubber(localX(e), R, Wd - R);
      setFromPointer(localX(e));
      wake(j);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      tune(X, SPRING.release);
      X.t = toX(cur()); // встаёт ровно на выбранное значение, с пружинкой
      if (cur() !== startValue) emit("change");
      sync();
    };
    input.addEventListener("pointerup", end);
    input.addEventListener("pointercancel", end);
    input.addEventListener("lostpointercapture", end);
    input.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") {
        hover = true;
        sync();
      }
    });
    input.addEventListener("pointerleave", () => {
      hover = false;
      sync();
    });

    // ---------- клавиатура: капля поднята, пока у ползунка фокус с клавиатуры ----------
    input.addEventListener("input", () => {
      if (selfEvent || dragging) return;
      goTo(cur());
    });
    input.addEventListener("keydown", (e) => {
      if (["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
        lifted = true;
        sync();
      }
    });
    input.addEventListener("focus", () => {
      if (!pointerFocus && input.matches(":focus-visible")) {
        lifted = true;
        sync();
      }
    });
    input.addEventListener("blur", () => {
      lifted = false;
      end();
      sync();
    });

    // ---------- значение, заданное из кода (сброс настроек, громкость Spotify, время трека) ----------
    Object.defineProperty(input, "value", {
      configurable: true,
      enumerable: true,
      get() {
        return valueProp.get.call(this);
      },
      set(v) {
        valueProp.set.call(this, v);
        if (!dragging) goTo(cur());
      },
    });
    new MutationObserver(() => {
      if (input.disabled) end();
      buildScale();
      if (!dragging) goTo(cur());
    }).observe(input, { attributes: true, attributeFilter: ["min", "max", "step", "disabled"] });

    new ResizeObserver(() => {
      const w = rail.clientWidth;
      if (!w || w === Wd) return;
      Wd = w;
      place();
    }).observe(rail);

    // ---------- кадр ----------
    const j = {
      wrap,
      frame(dt) {
        DX.t = X.x;
        for (const s of springs) step(s, dt);
      },
      render() {
        const x = X.x;
        const v = snap(toV(x));

        // бегунок вытягивается вдоль дорожки от скорости, площадь сохраняется
        const st = 1 + Math.min(Math.abs(X.v) / 2400, 0.4);
        thumb.style.transform = `translate(${x - TR + OX}px,${CY - TR + OY}px) scale(${st * PS.x},${PS.x / st})`;

        // капля поднимается и наклоняется в сторону, откуда её тянут
        const tilt = clamp((DX.x - X.x) * 0.9, -28, 28);
        const dTr = `translate(${DX.x - D}px,${DY.x - D}px) rotate(${tilt}deg) scale(${DS.x})`;
        drop.style.transform = `translate(${OX}px,${OY}px) ${dTr}`;
        label.style.transform = dTr;
        label.style.opacity = clamp((DS.x - 0.7) / 0.25, 0, 1);
        const text = fmt(v);
        if (text !== shown) {
          shown = text;
          label.textContent = text;
          label.classList.toggle("jelly__label--long", text.length > 4);
        }

        // заливка кончается под центром бегунка и исчезает, когда он в нуле
        fill.style.width = clamp(x, 0, Math.max(Wd, 0)) * clamp((x - R) / R, 0, 1) + "px";
        lightScale(v);
      },
      idle() {
        if (dragging) return false;
        for (const s of springs) if (Math.abs(s.x - s.t) > 0.002 || Math.abs(s.v) > 0.002) return false;
        for (const s of springs) {
          s.x = s.t;
          s.v = 0;
        }
        this.render();
        return true;
      },
    };
    j.render();
    return wrap;
  }

  // ---------- подхватываем все ползунки, в том числе появившиеся позже ----------
  const SEL = 'input[type="range"]';
  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches(SEL)) enhance(node);
    else node.querySelectorAll(SEL).forEach(enhance);
  }
  function start() {
    scan(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) scan(n);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);

  window.IB = window.IB || {};
  window.IB.jelly = enhance;
})();
