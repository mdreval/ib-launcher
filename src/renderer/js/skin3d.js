/*
 * Скины: разметка текстуры 64×64, перевод старых скинов 64×32, аватар-голова
 * и объёмная модель игрока на CSS 3D (вращается мышью).
 */
(function () {
  const IB = window.IB;
  const { h } = IB;

  // Части тела: где лежит текстура (основной и верхний слой), размер и
  // положение центра в «пикселях модели» (рост игрока 32).
  const PARTS = {
    head: { base: [0, 0], over: [32, 0], size: [8, 8, 8], pos: [0, -12, 0], grow: 1 },
    body: { base: [16, 16], over: [16, 32], size: [8, 12, 4], pos: [0, -2, 0], grow: 0.5 },
    rarm: { base: [40, 16], over: [40, 32], size: ["arm", 12, 4], pos: ["-arm", -2, 0], grow: 0.5 },
    larm: { base: [32, 48], over: [48, 48], size: ["arm", 12, 4], pos: ["+arm", -2, 0], grow: 0.5 },
    rleg: { base: [0, 16], over: [0, 32], size: [4, 12, 4], pos: [-2, 10, 0], grow: 0.5 },
    lleg: { base: [16, 48], over: [0, 48], size: [4, 12, 4], pos: [2, 10, 0], grow: 0.5 },
  };

  function armWidth(slim) {
    return slim ? 3 : 4;
  }

  function dims(part, slim) {
    const [w, hh, d] = PARTS[part].size;
    return [w === "arm" ? armWidth(slim) : w, hh, d];
  }

  function faceRects(u, v, w, hh, d) {
    return {
      top: [u + d, v, w, d],
      bottom: [u + d + w, v, w, d],
      right: [u, v + d, d, hh],
      front: [u + d, v + d, w, hh],
      left: [u + d + w, v + d, d, hh],
      back: [u + 2 * d + w, v + d, w, hh],
    };
  }

  function partFaces(part, layer, slim) {
    const p = PARTS[part];
    const [u, v] = layer === "over" ? p.over : p.base;
    const [w, hh, d] = dims(part, slim);
    return faceRects(u, v, w, hh, d);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не удалось прочитать изображение скина"));
      img.src = src;
    });
  }

  /** Старые скины 64×32: левая рука и нога — зеркальные копии правых. */
  function mirrorLimb(ctx, src, dst, w, hh, d) {
    const s = faceRects(src[0], src[1], w, hh, d);
    const t = faceRects(dst[0], dst[1], w, hh, d);
    const map = { top: "top", bottom: "bottom", front: "front", back: "back", right: "left", left: "right" };
    for (const [tf, sf] of Object.entries(map)) {
      const [su, sv, sw, sh] = s[sf];
      const [tu, tv] = t[tf];
      ctx.save();
      ctx.translate(tu + sw, tv);
      ctx.scale(-1, 1);
      ctx.drawImage(ctx.canvas, su, sv, sw, sh, 0, 0, sw, sh);
      ctx.restore();
    }
  }

  async function loadTexture(dataUrl) {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    if (img.height === 32) {
      ctx.drawImage(img, 0, 0);
      mirrorLimb(ctx, [0, 16], [16, 48], 4, 12, 4);
      mirrorLimb(ctx, [40, 16], [32, 48], 4, 12, 4);
    } else {
      ctx.drawImage(img, 0, 0, 64, 64);
    }
    return canvas;
  }

  /** Аватар 8×8: лицо + верхний слой (шапка). */
  function headAvatar(texture) {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(texture, 8, 8, 8, 8, 0, 0, 8, 8);
    ctx.drawImage(texture, 40, 8, 8, 8, 0, 0, 8, 8);
    return c.toDataURL();
  }

  const avatarCache = new Map();
  async function avatarFor(dataUrl) {
    if (avatarCache.has(dataUrl)) return avatarCache.get(dataUrl);
    const tex = await loadTexture(dataUrl);
    const url = headAvatar(tex);
    avatarCache.set(dataUrl, url);
    return url;
  }

  // ---------------- CSS 3D модель ----------------
  class Player3D {
    constructor(container, { scale = 11, ry = -22, rx = -6, bob = true } = {}) {
      this.container = container;
      this.scale = scale;
      this.ry = ry;
      this.rx = rx;
      this.initial = { ry, rx };
      this.slim = false;
      this.showOverlay = true;
      container.classList.add("player3d");
      this.scene = h("div", { class: "player3d__scene" });
      this.bob = h("div", { class: bob ? "player3d__bob" : "" });
      this.model = h("div", { class: "player3d__model" });
      this.bob.append(this.model);
      this.scene.append(this.bob);
      container.append(this.scene, h("div", { class: "player3d__platform" }));
      this.build();
      this.apply();
      this.bindDrag();
    }

    setSkin(dataUrl, model) {
      const slim = model === "slim";
      this.model.style.setProperty("--skin", `url("${dataUrl}")`);
      if (slim !== this.slim) {
        this.slim = slim;
        this.build();
      }
    }

    /** Плащ (PNG 64×32 или HD 128×64, 256×128…); null — без плаща. */
    setCape(dataUrl) {
      const next = dataUrl || null;
      if (next === this.capeUrl) return;
      this.capeUrl = next;
      this.model.style.setProperty("--cape", next ? `url("${next}")` : "none");
      this.build();
    }

    setScale(scale) {
      if (!scale || scale === this.scale) return;
      this.scale = scale;
      this.build();
    }

    /** Подбирает масштаб так, чтобы модель целиком помещалась в контейнер. */
    fitTo(height, { min = 5, max = 12 } = {}) {
      this.setScale(Math.max(min, Math.min(max, Math.floor((height - 24) / 34))));
    }

    setOverlay(show) {
      this.showOverlay = show;
      this.container.classList.toggle("no-overlay", !show);
    }

    build() {
      this.model.textContent = "";
      const s = this.scale;
      for (const part of Object.keys(PARTS)) {
        for (const layer of ["base", "over"]) {
          this.model.append(this.cube(part, layer, s));
        }
      }
      if (this.capeUrl) this.model.append(this.capeCube(s));
      // модель по центру по вертикали: от -16 (макушка) до 16 (ступни)
      this.scene.style.transform = `translateY(${-0.5 * s}px)`;
    }

    cube(part, layer, s) {
      const p = PARTS[part];
      const [w, hh, d] = dims(part, this.slim);
      const grow = layer === "over" ? p.grow : 0;
      const W = (w + grow) * s;
      const H = (hh + grow) * s;
      const D = (d + grow) * s;
      let [cx, cy, cz] = p.pos;
      const aw = armWidth(this.slim);
      if (cx === "-arm") cx = -(4 + aw / 2);
      if (cx === "+arm") cx = 4 + aw / 2;
      const el = h("div", { class: `cube cube--${part}${layer === "over" ? " cube--overlay" : ""}` });
      el.style.width = `${W}px`;
      el.style.height = `${H}px`;
      el.style.transform = `translate3d(${cx * s - W / 2}px, ${cy * s - H / 2}px, ${cz * s}px)`;

      const rects = partFaces(part, layer, this.slim);
      const faces = {
        front: { w: W, h: H, x: 0, y: 0, t: `translateZ(${D / 2}px)` },
        back: { w: W, h: H, x: 0, y: 0, t: `rotateY(180deg) translateZ(${D / 2}px)` },
        right: { w: D, h: H, x: (W - D) / 2, y: 0, t: `rotateY(-90deg) translateZ(${W / 2}px)` },
        left: { w: D, h: H, x: (W - D) / 2, y: 0, t: `rotateY(90deg) translateZ(${W / 2}px)` },
        top: { w: W, h: D, x: 0, y: (H - D) / 2, t: `rotateX(90deg) translateZ(${H / 2}px)` },
        bottom: { w: W, h: D, x: 0, y: (H - D) / 2, t: `rotateX(-90deg) translateZ(${H / 2}px)` },
      };
      for (const [name, f] of Object.entries(faces)) {
        const [u, v, fw, fh] = rects[name];
        const kx = f.w / fw;
        const ky = f.h / fh;
        const face = h("div", { class: `cube__face cube__face--${name}` });
        face.style.width = `${f.w}px`;
        face.style.height = `${f.h}px`;
        face.style.left = `${f.x}px`;
        face.style.top = `${f.y}px`;
        face.style.transform = f.t;
        face.style.backgroundImage = "var(--skin)";
        face.style.backgroundSize = `${64 * kx}px ${64 * ky}px`;
        face.style.backgroundPosition = `${-u * kx}px ${-v * ky}px`;
        el.append(face);
      }
      return el;
    }

    /** Плащ 10×16×1 за спиной, чуть отведён назад, крепится у плеч. */
    capeCube(s) {
      const W = 10 * s;
      const H = 16 * s;
      const D = 1 * s;
      const el = h("div", { class: "cube cube--cape" });
      el.style.width = `${W}px`;
      el.style.height = `${H}px`;
      el.style.transformOrigin = "50% 0 0";
      el.style.transform = `translate3d(${-W / 2}px, ${-8 * s}px, ${-2.6 * s}px) rotateX(-12deg)`;
      // Разметка плаща в текстуре 64×32: снаружи (1,1), изнутри (12,1).
      const rects = faceRects(0, 0, 10, 16, 1);
      const faces = {
        // наружная сторона смотрит назад (-Z), внутренняя — к спине игрока
        front: { rect: rects.back, w: W, h: H, x: 0, y: 0, t: `translateZ(${D / 2}px)` },
        back: { rect: rects.front, w: W, h: H, x: 0, y: 0, t: `rotateY(180deg) translateZ(${D / 2}px)` },
        right: { rect: rects.right, w: D, h: H, x: (W - D) / 2, y: 0, t: `rotateY(-90deg) translateZ(${W / 2}px)` },
        left: { rect: rects.left, w: D, h: H, x: (W - D) / 2, y: 0, t: `rotateY(90deg) translateZ(${W / 2}px)` },
        top: { rect: rects.top, w: W, h: D, x: 0, y: (H - D) / 2, t: `rotateX(90deg) translateZ(${H / 2}px)` },
        bottom: { rect: rects.bottom, w: W, h: D, x: 0, y: (H - D) / 2, t: `rotateX(-90deg) translateZ(${H / 2}px)` },
      };
      for (const [name, f] of Object.entries(faces)) {
        const [u, v, fw, fh] = f.rect;
        const kx = f.w / fw;
        const ky = f.h / fh;
        const face = h("div", { class: `cube__face cube__face--${name}` });
        face.style.width = `${f.w}px`;
        face.style.height = `${f.h}px`;
        face.style.left = `${f.x}px`;
        face.style.top = `${f.y}px`;
        face.style.transform = f.t;
        face.style.backgroundImage = "var(--cape)";
        face.style.backgroundSize = `${64 * kx}px ${32 * ky}px`;
        face.style.backgroundPosition = `${-u * kx}px ${-v * ky}px`;
        el.append(face);
      }
      return el;
    }

    apply() {
      this.model.style.transform = `rotateX(${this.rx}deg) rotateY(${this.ry}deg)`;
    }

    rotateBy(deg) {
      this.ry += deg;
      this.apply();
    }

    setView(ry, rx = this.initial.rx) {
      // поворачиваем к ближайшему эквивалентному углу, чтобы не крутиться лишний раз
      const turns = Math.round((this.ry - ry) / 360);
      this.ry = ry + turns * 360;
      this.rx = rx;
      this.apply();
    }

    reset() {
      this.setView(this.initial.ry, this.initial.rx);
    }

    bindDrag() {
      let start = null;
      this.container.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        start = { x: e.clientX, y: e.clientY, ry: this.ry, rx: this.rx };
        this.model.classList.add("is-dragging");
        this.container.setPointerCapture(e.pointerId);
      });
      this.container.addEventListener("pointermove", (e) => {
        if (!start) return;
        this.ry = start.ry + (e.clientX - start.x) * 0.55;
        this.rx = Math.max(-35, Math.min(35, start.rx - (e.clientY - start.y) * 0.3));
        this.apply();
      });
      const end = (e) => {
        if (!start) return;
        start = null;
        this.model.classList.remove("is-dragging");
        try {
          this.container.releasePointerCapture(e.pointerId);
        } catch (err) {
          /* уже отпущено */
        }
      };
      this.container.addEventListener("pointerup", end);
      this.container.addEventListener("pointercancel", end);
    }
  }

  IB.skin = { PARTS, partFaces, faceRects, dims, armWidth, loadImage, loadTexture, headAvatar, avatarFor, Player3D };
})();
