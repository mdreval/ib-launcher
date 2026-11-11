/* Редактор скина: рисование на персонаже (4 вида) или на развёртке 64×64, живой 3D-предпросмотр */
(function () {
  const IB = window.IB;
  const { h, run, toast } = IB;
  const api = window.ib;
  const S = IB.state;

  const PALETTE = ["#1d1d1f", "#ffffff", "#9aa7a1", "#3b2a1e", "#8a5a3a", "#d39a4c", "#e0a77f", "#f2c9a0", "#ffd479", "#9b2f2f", "#e05561", "#f4a3a3", "#3a8a4a", "#2a4fa8", "#3fa7e0", "#a58be0", "#7de6b8", "#bff5dc"];
  const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

  // Черновик переживает переход между вкладками.
  let draft = null;

  function viewDefs(slim) {
    const a = slim ? 3 : 4;
    return [
      { id: "front", label: "Спереди", w: 16, h: 32, rects: [["head", "front", 4, 0], ["body", "front", 4, 8], ["rarm", "front", 4 - a, 8], ["larm", "front", 12, 8], ["rleg", "front", 4, 20], ["lleg", "front", 8, 20]] },
      { id: "back", label: "Сзади", w: 16, h: 32, rects: [["head", "back", 4, 0], ["body", "back", 4, 8], ["larm", "back", 4 - a, 8], ["rarm", "back", 12, 8], ["lleg", "back", 4, 20], ["rleg", "back", 8, 20]] },
      { id: "right", label: "Правый бок", w: 8, h: 32, rects: [["head", "right", 0, 0], ["rarm", "right", 2, 8], ["rleg", "right", 2, 20]] },
      { id: "left", label: "Левый бок", w: 8, h: 32, rects: [["head", "left", 0, 0], ["larm", "left", 2, 8], ["lleg", "left", 2, 20]] },
    ];
  }

  /** Все прямоугольники граней (обоих слоёв) — для заливки на развёртке. */
  function allFaceRects(slim) {
    const out = [];
    for (const part of Object.keys(IB.skin.PARTS)) {
      for (const layer of ["base", "over"]) {
        for (const r of Object.values(IB.skin.partFaces(part, layer, slim))) out.push(r);
      }
    }
    return out;
  }

  function hexToRgba(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }

  function rgbaToHex(r, g, b) {
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }

  IB.pages.skin = {
    mount(host) {
      const page = h("section", { class: "page page--fixed" });
      host.append(page);
      const root = h("div", { class: "skin-page" });
      page.append(root);

      const st = {
        accountId: (IB.selectedAccount() || {}).id || null,
        tex: null,
        model: "classic",
        tool: "brush",
        size: 1,
        color: "#7de6b8",
        layer: "base",
        mode: "character",
        grid: true,
        zoom: 1,
        undo: [],
        redo: [],
        dirty: false,
        overlayPreview: true,
      };

      // ---------- шапка ----------
      const accountSelect = h("select", { class: "select", style: { width: "240px" } });
      const presetsBtn = h("button", { class: "btn", html: `${IB.icon("person")}Готовые скины` });
      const catalogBtn = h("button", { class: "btn", html: `${IB.icon("search")}Каталог скинов` });
      const loadBtn = h("button", { class: "btn", html: `${IB.icon("upload")}Загрузить PNG` });
      const saveBtn = h("button", { class: "btn btn--primary", html: `${IB.icon("save")}Сохранить скин`, disabled: true });
      root.append(
        h(
          "div",
          { class: "page-head", style: { marginBottom: "16px" } },
          h("div", {}, h("div", { class: "eyebrow", text: "Персонализация" }), h("h1", { text: "Редактор скина" }), h("p", { text: "Рисуйте на персонаже или загрузите готовый скин." })),
          h("div", { class: "row" }, accountSelect, presetsBtn, catalogBtn, loadBtn, saveBtn)
        )
      );

      // ---------- инструменты ----------
      const toolGrid = h("div", { class: "tool-grid" });
      const sizes = h("div", { class: "brush-sizes" });
      const palette = h("div", { class: "palette" });
      const colorInput = h("input", { type: "color", value: st.color });
      const colorHex = h("b", { text: st.color.toUpperCase() });
      const modelSeg = h("div", { class: "segmented segmented--soft", style: { width: "100%" } });
      const tools = h(
        "div",
        { class: "panel tools-panel" },
        h("div", { class: "panel-title", text: "Инструменты" }),
        toolGrid,
        h("div", { class: "panel-title", style: { marginTop: "18px" }, text: "Размер кисти" }),
        sizes,
        h("div", { class: "panel-title", style: { marginTop: "18px" }, text: "Палитра" }),
        palette,
        h("label", { class: "custom-color" }, colorInput, h("div", {}, h("small", { text: "Свой цвет" }), colorHex)),
        h("div", { class: "panel-title", style: { marginTop: "18px" }, text: "Модель рук" }),
        modelSeg,
        h("p", { class: "field__hint", style: { margin: "8px 0 0" }, text: "Обычная — 4 пикселя, тонкая — 3." })
      );

      // ---------- холст ----------
      const modeSeg = h("div", { class: "segmented segmented--soft" });
      const layerSeg = h("div", { class: "segmented segmented--soft" });
      const gridSwitch = IB.switchEl({ checked: st.grid, label: "Сетка" });
      const undoBtn = h("button", { class: "icon-btn icon-btn--plain", title: "Отменить (Ctrl+Z)", html: IB.icon("undo") });
      const redoBtn = h("button", { class: "icon-btn icon-btn--plain", title: "Повторить (Ctrl+Y)", html: IB.icon("redo") });
      const canvasWrap = h("div", { class: "editor-canvas-wrap" });
      const zoomLabel = h("span", {});
      const hint = h("span", {});
      const editor = h(
        "div",
        { class: "panel editor-panel drop-zone" },
        h("div", { class: "editor-panel__bar" }, modeSeg, h("div", { class: "row", style: { gap: "4px" } }, undoBtn, redoBtn)),
        h("div", { class: "editor-panel__bar" }, h("div", { class: "row", style: { gap: "10px" } }, IB.iconEl("layers"), layerSeg), h("div", { class: "row", style: { gap: "10px" } }, h("span", { class: "soft", style: { fontSize: "13px" }, text: "Сетка" }), gridSwitch)),
        canvasWrap,
        h(
          "div",
          { class: "editor-panel__foot" },
          h("button", { class: "btn btn--sm btn--ghost", html: `${IB.icon("download")}Скачать PNG`, onClick: () => st.tex && run(() => api.skins.export(st.tex.toDataURL("image/png")), { success: (ok) => (ok ? "Скин сохранён в файл" : "Отменено") }) }),
          hint,
          h(
            "div",
            { class: "zoom" },
            h("button", { class: "icon-btn icon-btn--plain", title: "Уменьшить", html: IB.icon("zoomOut"), onClick: () => setZoom(-1) }),
            zoomLabel,
            h("button", { class: "icon-btn icon-btn--plain", title: "Увеличить", html: IB.icon("zoomIn"), onClick: () => setZoom(1) })
          )
        )
      );

      // ---------- предпросмотр ----------
      const previewBox = h("div", {});
      const previewName = h("div", { class: "muted", style: { fontSize: "12.5px" } });
      // Подсказка для офлайн-профиля: как сделать, чтобы скин видели другие.
      const elyHint = h(
        "div",
        { class: "skin-share-hint" },
        h("div", { style: { fontWeight: 700, marginBottom: "4px" }, text: "Скин видят другие игроки?" }),
        h("div", {
          class: "muted",
          text: "Свой скин вы увидите в игре сразу, в любой версии. Другие игроки видят его, если этот ник зарегистрирован на Ely.by и туда загружен тот же скин.",
        }),
        h("button", { class: "btn btn--sm", style: { marginTop: "8px" }, html: `${IB.icon("external")}Открыть Ely.by`, onClick: () => api.app.openExternal("https://ely.by/") })
      );
      const saveState = h("div", { class: "muted", style: { fontSize: "12.5px", textAlign: "center", marginTop: "12px" } });
      const overlaySwitch = IB.switchEl({ checked: true, label: "Верхний слой" });
      const preview = h(
        "div",
        { class: "panel preview-panel" },
        h("div", { class: "row row--between" }, h("div", {}, h("div", { style: { fontWeight: 800 }, text: "Ваш персонаж" }), previewName), h("span", { class: "live-badge", text: "LIVE 3D" })),
        previewBox,
        h("div", { class: "muted", style: { textAlign: "center", fontSize: "12px" }, text: "Потяните мышью, чтобы повернуть" }),
        h(
          "div",
          { class: "preview-panel__actions" },
          h("button", { class: "btn btn--sm", text: "Спереди", onClick: () => player.setView(-18, -4) }),
          h("button", { class: "btn btn--sm", text: "Сзади", onClick: () => player.setView(162, -4) }),
          h("button", { class: "icon-btn", style: { width: "34px", height: "34px" }, title: "Сбросить поворот", html: IB.icon("rotate"), onClick: () => player.reset() })
        ),
        h("div", { class: "setting-line", style: { borderTop: "1px solid var(--border)", paddingTop: "12px" } }, h("span", { class: "row", style: { gap: "8px", fontSize: "13px" } }, IB.iconEl("eye"), "Верхний слой"), overlaySwitch),
        saveState,
        h("button", { class: "btn btn--sm btn--ghost", style: { marginTop: "6px" }, text: "Вернуть стандартный скин", onClick: resetToDefault }),
        elyHint
      );

      root.append(h("div", { class: "skin-layout" }, tools, editor, preview));
      root.append(
        h(
          "div",
          { class: "row row--between", style: { marginTop: "10px", fontSize: "12px", color: "var(--text-muted)" } },
          h("span", { html: `${IB.icon("pipette")} Правая кнопка мыши — взять цвет` }),
          h("span", { text: "PNG 64 × 64 — можно перетащить файл в редактор" })
        )
      );
      for (const svg of root.lastChild.querySelectorAll("svg")) Object.assign(svg.style, { width: "13px", height: "13px", verticalAlign: "-2px" });

      const player = new IB.skin.Player3D(previewBox, { scale: 7, ry: -18, rx: -4 });
      previewBox.style.flex = "1";
      previewBox.style.minHeight = "220px";
      let lastWrapSize = "";
      const resize = new ResizeObserver(
        IB.debounce(() => {
          player.fitTo(previewBox.clientHeight, { min: 4, max: 9 });
          const size = `${canvasWrap.clientWidth}x${canvasWrap.clientHeight}`;
          if (size !== lastWrapSize) {
            lastWrapSize = size;
            renderCanvas();
          }
        }, 80)
      );
      resize.observe(previewBox);
      resize.observe(canvasWrap);

      // ---------- отрисовка панелей ----------
      function renderTools() {
        toolGrid.textContent = "";
        const toolsList = [
          ["brush", "Кисть", "brush", "B"],
          ["eraser", "Ластик", "eraser", "E"],
          ["fill", "Заливка", "bucket", "G"],
          ["picker", "Пипетка", "pipette", "I"],
        ];
        for (const [id, title, icon, key] of toolsList) {
          toolGrid.append(h("button", { class: "tool-btn", title: `${title} (${key})`, "aria-pressed": String(st.tool === id), html: `${IB.icon(icon)}${title}`, onClick: () => ((st.tool = id), renderTools()) }));
        }
        sizes.textContent = "";
        for (const n of [1, 2, 4]) {
          const dot = h("i", { style: { width: `${2 + n * 1.5}px`, height: `${2 + n * 1.5}px` } });
          sizes.append(h("button", { "aria-pressed": String(st.size === n), onClick: () => ((st.size = n), renderTools()) }, dot, `${n} px`));
        }
        palette.textContent = "";
        for (const c of PALETTE) {
          palette.append(h("button", { style: { background: c }, title: c, "aria-pressed": String(st.color.toLowerCase() === c), onClick: () => setColor(c) }));
        }
        modelSeg.textContent = "";
        for (const [id, title] of [
          ["classic", "Обычная"],
          ["slim", "Тонкая"],
        ]) {
          modelSeg.append(
            h("button", {
              style: { flex: 1 },
              "aria-pressed": String(st.model === id),
              text: title,
              onClick: () => {
                if (st.model === id) return;
                st.model = id;
                markDirty();
                renderTools();
                renderCanvas();
                pushPreview();
              },
            })
          );
        }
      }

      function setColor(c) {
        st.color = c.toLowerCase();
        colorInput.value = st.color;
        colorHex.textContent = st.color.toUpperCase();
        if (st.tool === "eraser" || st.tool === "picker") st.tool = "brush";
        renderTools();
      }
      colorInput.addEventListener("input", () => setColor(colorInput.value));

      function renderBars() {
        modeSeg.textContent = "";
        modeSeg.append(
          h("button", { "aria-pressed": String(st.mode === "character"), html: `${IB.icon("person")} На персонаже`, onClick: () => ((st.mode = "character"), renderBars(), renderCanvas()) }),
          h("button", { "aria-pressed": String(st.mode === "uv"), html: `${IB.icon("grid")} Развёртка`, onClick: () => ((st.mode = "uv"), renderBars(), renderCanvas()) })
        );
        for (const svg of modeSeg.querySelectorAll("svg")) Object.assign(svg.style, { width: "15px", height: "15px", verticalAlign: "-3px" });
        layerSeg.textContent = "";
        layerSeg.append(
          h("button", { "aria-pressed": String(st.layer === "base"), text: "Основной", onClick: () => ((st.layer = "base"), renderBars(), renderCanvas()) }),
          h("button", { "aria-pressed": String(st.layer === "over"), text: "Верхний", onClick: () => ((st.layer = "over"), renderBars(), renderCanvas()) })
        );
        layerSeg.parentElement.style.opacity = st.mode === "uv" ? "0.4" : "1";
        layerSeg.parentElement.style.pointerEvents = st.mode === "uv" ? "none" : "";
        hint.textContent = st.mode === "uv" ? "Рисуйте прямо на развёртке текстуры" : "Выберите цвет и рисуйте прямо на персонаже";
        zoomLabel.textContent = `${Math.round(st.zoom * 100)}%`;
        undoBtn.disabled = !st.undo.length;
        redoBtn.disabled = !st.redo.length;
      }
      gridSwitch.input.addEventListener("change", () => {
        st.grid = gridSwitch.input.checked;
        renderCanvas();
      });
      overlaySwitch.input.addEventListener("change", () => player.setOverlay(overlaySwitch.input.checked));

      function setZoom(dir) {
        const idx = Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(st.zoom) + dir));
        st.zoom = ZOOMS[idx];
        renderBars();
        renderCanvas();
      }

      // ---------- холсты ----------
      let views = [];

      function pixelSize() {
        const availW = Math.max(240, canvasWrap.clientWidth - 40);
        const availH = Math.max(240, canvasWrap.clientHeight - 40);
        const fit = st.mode === "uv" ? Math.min(availW / 64, availH / 64) : Math.min((availW - 3 * 22) / 48, (availH - 40) / 32);
        return Math.max(3, Math.floor(fit * st.zoom));
      }

      function drawChecker(ctx, x, y, w, hh, P) {
        for (let j = 0; j < hh; j += 1) {
          for (let i = 0; i < w; i += 1) {
            ctx.fillStyle = (i + j) % 2 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)";
            ctx.fillRect((x + i) * P, (y + j) * P, P, P);
          }
        }
      }

      function drawGrid(ctx, x, y, w, hh, P) {
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= w; i += 1) {
          ctx.moveTo((x + i) * P + 0.5, y * P);
          ctx.lineTo((x + i) * P + 0.5, (y + hh) * P);
        }
        for (let j = 0; j <= hh; j += 1) {
          ctx.moveTo(x * P, (y + j) * P + 0.5);
          ctx.lineTo((x + w) * P, (y + j) * P + 0.5);
        }
        ctx.stroke();
      }

      function renderCanvas() {
        canvasWrap.textContent = "";
        views = [];
        if (!st.tex) return;
        const P = pixelSize();
        const slim = st.model === "slim";
        if (st.mode === "uv") {
          const canvas = h("canvas", { width: 64 * P, height: 64 * P });
          const view = { canvas, uv: true, P };
          views.push(view);
          canvasWrap.append(h("div", { class: "editor-view" }, canvas));
          drawView(view);
          bindCanvas(view);
          return;
        }
        const row = h("div", { class: "editor-views" });
        for (const def of viewDefs(slim)) {
          const canvas = h("canvas", { width: def.w * P, height: def.h * P });
          const rects = def.rects.map(([part, face, x, y]) => ({ part, face, x, y }));
          const view = { canvas, def, rects, P };
          views.push(view);
          row.append(h("div", { class: "editor-view" }, canvas, h("span", { class: "badge", text: def.label })));
          drawView(view);
          bindCanvas(view);
        }
        canvasWrap.append(row);
      }

      function drawView(view) {
        const ctx = view.canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, view.canvas.width, view.canvas.height);
        const P = view.P;
        const slim = st.model === "slim";
        if (view.uv) {
          drawChecker(ctx, 0, 0, 64, 64, P);
          ctx.drawImage(st.tex, 0, 0, 64, 64, 0, 0, 64 * P, 64 * P);
          if (st.grid) drawGrid(ctx, 0, 0, 64, 64, P);
          return;
        }
        for (const r of view.rects) {
          const [ub, vb, fw, fh] = IB.skin.partFaces(r.part, "base", slim)[r.face];
          const [uo, vo] = IB.skin.partFaces(r.part, "over", slim)[r.face];
          if (st.layer === "over") drawChecker(ctx, r.x, r.y, fw, fh, P);
          ctx.globalAlpha = st.layer === "over" ? 0.3 : 1;
          ctx.drawImage(st.tex, ub, vb, fw, fh, r.x * P, r.y * P, fw * P, fh * P);
          ctx.globalAlpha = st.layer === "over" ? 1 : 0.35;
          ctx.drawImage(st.tex, uo, vo, fw, fh, r.x * P, r.y * P, fw * P, fh * P);
          ctx.globalAlpha = 1;
          if (st.grid) drawGrid(ctx, r.x, r.y, fw, fh, P);
        }
      }

      function redrawAll() {
        for (const v of views) drawView(v);
      }

      /** Пиксель холста → координаты в текстуре (и грань, к которой он относится). */
      function toUV(view, cx, cy) {
        if (view.uv) {
          if (cx < 0 || cy < 0 || cx >= 64 || cy >= 64) return null;
          const rect = allFaceRects(st.model === "slim").find(([u, v, w, hh]) => cx >= u && cx < u + w && cy >= v && cy < v + hh);
          return { u: cx, v: cy, rect: rect || null };
        }
        const slim = st.model === "slim";
        for (const r of view.rects) {
          const [u, v, fw, fh] = IB.skin.partFaces(r.part, st.layer, slim)[r.face];
          if (cx >= r.x && cx < r.x + fw && cy >= r.y && cy < r.y + fh) {
            return { u: u + (cx - r.x), v: v + (cy - r.y), rect: [u, v, fw, fh], baseUV: IB.skin.partFaces(r.part, "base", slim)[r.face], r };
          }
        }
        return null;
      }

      const ctxTex = () => st.tex.getContext("2d", { willReadFrequently: true });

      function setPixel(u, v, rgba) {
        const ctx = ctxTex();
        if (!rgba) ctx.clearRect(u, v, 1, 1);
        else {
          const img = ctx.createImageData(1, 1);
          img.data.set(rgba);
          ctx.putImageData(img, u, v);
        }
      }

      function paintCell(view, cx, cy) {
        const n = st.size;
        const start = Math.floor((n - 1) / 2);
        const rgba = st.tool === "eraser" ? null : hexToRgba(st.color);
        for (let dy = 0; dy < n; dy += 1) {
          for (let dx = 0; dx < n; dx += 1) {
            const hit = toUV(view, cx - start + dx, cy - start + dy);
            if (hit && (view.uv ? hit.rect : true)) setPixel(hit.u, hit.v, rgba);
          }
        }
      }

      function floodFill(hit) {
        if (!hit || !hit.rect) return;
        const [ru, rv, rw, rh] = hit.rect;
        const ctx = ctxTex();
        const img = ctx.getImageData(ru, rv, rw, rh);
        const d = img.data;
        const idx = (x, y) => (y * rw + x) * 4;
        const sx = hit.u - ru;
        const sy = hit.v - rv;
        const target = d.slice(idx(sx, sy), idx(sx, sy) + 4);
        const fill = hexToRgba(st.color);
        if (target.every((c, i) => c === fill[i])) return;
        const same = (i) => d[i] === target[0] && d[i + 1] === target[1] && d[i + 2] === target[2] && d[i + 3] === target[3];
        const stack = [[sx, sy]];
        while (stack.length) {
          const [x, y] = stack.pop();
          if (x < 0 || y < 0 || x >= rw || y >= rh) continue;
          const i = idx(x, y);
          if (!same(i)) continue;
          d.set(fill, i);
          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        ctx.putImageData(img, ru, rv);
      }

      function pick(hit) {
        if (!hit) return;
        const ctx = ctxTex();
        let px = ctx.getImageData(hit.u, hit.v, 1, 1).data;
        if (px[3] === 0 && hit.baseUV) {
          const [ub, vb] = hit.baseUV;
          px = ctx.getImageData(ub + (hit.u - hit.rect[0]), vb + (hit.v - hit.rect[1]), 1, 1).data;
        }
        if (px[3] === 0) return;
        setColor(rgbaToHex(px[0], px[1], px[2]));
      }

      function snapshot() {
        st.undo.push(ctxTex().getImageData(0, 0, 64, 64));
        if (st.undo.length > 60) st.undo.shift();
        st.redo = [];
      }

      function restore(from, to) {
        if (!from.length) return;
        to.push(ctxTex().getImageData(0, 0, 64, 64));
        ctxTex().putImageData(from.pop(), 0, 0);
        markDirty();
        redrawAll();
        pushPreview();
        renderBars();
      }
      undoBtn.addEventListener("click", () => restore(st.undo, st.redo));
      redoBtn.addEventListener("click", () => restore(st.redo, st.undo));

      let previewQueued = false;
      function pushPreview() {
        if (previewQueued || !st.tex) return;
        previewQueued = true;
        requestAnimationFrame(() => {
          previewQueued = false;
          player.setSkin(st.tex.toDataURL("image/png"), st.model);
          draft = { accountId: st.accountId, dataUrl: st.tex.toDataURL("image/png"), model: st.model, dirty: st.dirty };
        });
      }

      function markDirty() {
        st.dirty = true;
        saveBtn.disabled = false;
        saveState.innerHTML = '<span style="color:var(--warning)">● Есть несохранённые изменения</span>';
      }

      function markSaved() {
        st.dirty = false;
        saveBtn.disabled = true;
        saveState.innerHTML = "● Ваш текущий скин<br><span>Все изменения сохранены</span>";
      }

      function bindCanvas(view) {
        let drawing = false;
        let last = null;
        const cell = (e) => {
          const rect = view.canvas.getBoundingClientRect();
          return [Math.floor(((e.clientX - rect.left) / rect.width) * (view.canvas.width / view.P)), Math.floor(((e.clientY - rect.top) / rect.height) * (view.canvas.height / view.P))];
        };
        view.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        view.canvas.addEventListener("pointerdown", (e) => {
          const [cx, cy] = cell(e);
          const hit = toUV(view, cx, cy);
          if (e.button === 2 || st.tool === "picker") {
            pick(hit);
            return;
          }
          if (e.button !== 0 || !hit) return;
          if (st.tool === "fill") {
            snapshot();
            floodFill(hit);
            markDirty();
            redrawAll();
            pushPreview();
            renderBars();
            return;
          }
          snapshot();
          drawing = true;
          last = [cx, cy];
          view.canvas.setPointerCapture(e.pointerId);
          paintCell(view, cx, cy);
          markDirty();
          redrawAll();
          pushPreview();
          renderBars();
        });
        view.canvas.addEventListener("pointermove", (e) => {
          if (!drawing) return;
          const [cx, cy] = cell(e);
          if (last && cx === last[0] && cy === last[1]) return;
          // линия между клетками, чтобы при быстром движении не было пропусков
          let [x0, y0] = last;
          const dx = Math.abs(cx - x0);
          const dy = -Math.abs(cy - y0);
          const sx = x0 < cx ? 1 : -1;
          const sy = y0 < cy ? 1 : -1;
          let err = dx + dy;
          for (let guard = 0; guard < 256; guard += 1) {
            paintCell(view, x0, y0);
            if (x0 === cx && y0 === cy) break;
            const e2 = 2 * err;
            if (e2 >= dy) {
              err += dy;
              x0 += sx;
            }
            if (e2 <= dx) {
              err += dx;
              y0 += sy;
            }
          }
          last = [cx, cy];
          redrawAll();
          pushPreview();
        });
        const end = () => {
          drawing = false;
          last = null;
        };
        view.canvas.addEventListener("pointerup", end);
        view.canvas.addEventListener("pointercancel", end);
      }

      // ---------- загрузка / сохранение ----------
      async function setTextureFromDataUrl(dataUrl, model, { dirty = false, keepHistory = false } = {}) {
        try {
          st.tex = await IB.skin.loadTexture(dataUrl);
        } catch (err) {
          toast(err.message, "error");
          return;
        }
        if (model) st.model = model;
        if (!keepHistory) {
          st.undo = [];
          st.redo = [];
        }
        renderTools();
        renderBars();
        renderCanvas();
        pushPreview();
        if (dirty) markDirty();
        else markSaved();
      }

      async function loadAccountSkin() {
        const acc = S.accounts.find((a) => a.id === st.accountId);
        previewName.textContent = acc ? `${acc.name} · ${acc.type === "offline" ? "офлайн-профиль" : acc.type === "microsoft" ? "Microsoft" : "Ely.by"}` : "Аккаунт не выбран";
        elyHint.style.display = acc && acc.type === "offline" ? "" : "none";
        if (draft && draft.accountId === st.accountId) {
          await setTextureFromDataUrl(draft.dataUrl, draft.model, { dirty: draft.dirty });
          return;
        }
        const skin = await api.skins.get(st.accountId).catch(() => null);
        if (skin) await setTextureFromDataUrl(skin.dataUrl, skin.model);
      }

      function renderAccounts() {
        accountSelect.textContent = "";
        if (!S.accounts.length) accountSelect.append(h("option", { value: "", text: "Нет аккаунтов" }));
        for (const a of S.accounts) accountSelect.append(h("option", { value: a.id, text: `${a.name} — ${a.type === "offline" ? "офлайн" : a.type === "microsoft" ? "Microsoft" : "Ely.by"}` }));
        if (!S.accounts.some((a) => a.id === st.accountId)) st.accountId = (IB.selectedAccount() || S.accounts[0] || {}).id || null;
        accountSelect.value = st.accountId || "";
      }
      accountSelect.addEventListener("change", async () => {
        if (st.dirty && !(await IB.confirmDialog({ title: "Несохранённые изменения", text: "Переключить аккаунт? Изменения текущего скина пропадут.", confirmText: "Переключить" }))) {
          accountSelect.value = st.accountId;
          return;
        }
        draft = null;
        st.accountId = accountSelect.value;
        loadAccountSkin();
      });

      loadBtn.addEventListener("click", async () => {
        const res = await run(() => api.skins.openFile());
        if (res) {
          if (st.tex) snapshot();
          await setTextureFromDataUrl(res.dataUrl, null, { dirty: true, keepHistory: true });
        }
      });

      saveBtn.addEventListener("click", async () => {
        if (!st.accountId) {
          toast("Сначала добавьте аккаунт", "error");
          IB.modals.accounts();
          return;
        }
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Сохранение…';
        const res = await run(() => api.skins.save({ accountId: st.accountId, dataUrl: st.tex.toDataURL("image/png"), model: st.model }));
        saveBtn.innerHTML = `${IB.icon("save")}Сохранить скин`;
        if (res) {
          draft = null;
          markSaved();
          toast(res.message, "success");
        } else saveBtn.disabled = false;
      });

      // ---------- готовые скины ----------
      async function openPresets() {
        const list = await run(() => api.skins.presets());
        if (!list || !list.length) return;
        let chosen = null;
        const grid = h("div", { class: "preset-grid" });
        const players = [];
        const applyBtn = h("button", { class: "btn btn--primary", disabled: true, html: `${IB.icon("check")}Применить` });
        const editBtn = h("button", { class: "btn", disabled: true, html: `${IB.icon("brush")}Открыть в редакторе` });
        for (const p of list) {
          const box = h("div", { class: "preset-card__model" });
          const card = h(
            "button",
            { class: "preset-card", type: "button" },
            box,
            h("span", { class: "preset-card__name", text: (p.name && (p.name[IB.lang] || p.name.ru)) || p.id }),
            p.model === "slim" ? h("span", { class: "badge", text: "Тонкие руки" }) : null
          );
          card.addEventListener("click", () => {
            chosen = p;
            for (const c of grid.children) c.classList.toggle("is-selected", c === card);
            applyBtn.disabled = false;
            editBtn.disabled = false;
          });
          card.addEventListener("dblclick", () => applyBtn.click());
          grid.append(card);
          const pl = new IB.skin.Player3D(box, { scale: 4, ry: -24, rx: -6, bob: false });
          pl.setSkin(p.dataUrl, p.model);
          players.push(pl);
        }
        const m = IB.modal({
          title: "Готовые скины",
          xl: true,
          content: h("div", {}, h("p", { class: "soft", style: { margin: "0 0 14px" }, text: "Выберите персонажа — скин сразу применится к аккаунту. Его можно потом доработать в редакторе." }), grid),
          footer: [editBtn, applyBtn],
        });
        editBtn.addEventListener("click", async () => {
          if (!chosen) return;
          m.close();
          if (st.tex) snapshot();
          await setTextureFromDataUrl(chosen.dataUrl, chosen.model, { dirty: true, keepHistory: true });
        });
        applyBtn.addEventListener("click", async () => {
          if (!chosen) return;
          if (!st.accountId) {
            toast("Сначала добавьте аккаунт", "error");
            return;
          }
          applyBtn.disabled = true;
          applyBtn.innerHTML = '<span class="spinner"></span>Применяю…';
          const res = await run(() => api.skins.save({ accountId: st.accountId, dataUrl: chosen.dataUrl, model: chosen.model }));
          if (res) {
            draft = null;
            m.close();
            toast(res.message, "success");
            await setTextureFromDataUrl(chosen.dataUrl, chosen.model);
          } else {
            applyBtn.disabled = false;
            applyBtn.innerHTML = `${IB.icon("check")}Применить`;
          }
        });
      }
      presetsBtn.addEventListener("click", openPresets);

      // ---------- каталог скинов с сайтов ----------
      async function openCatalogPicker() {
        const sources = await run(() => api.skins.catalogSources());
        if (!sources) return;
        const descriptions = {
          minecraftskins: "Самый большой каталог: сотни тысяч скинов, поиск по названию.",
          ely: "Каталог Ely.by — скины, которые загружают игроки.",
          namemc: "Популярные скины игроков с NameMC.",
        };
        const list = h("div", { class: "catalog-sources" });
        const m = IB.modal({
          title: "Каталог скинов",
          wide: true,
          content: h(
            "div",
            {},
            h("p", { class: "soft", style: { margin: "0 0 14px" }, text: "Откроется окно с сайтом. Найдите скин и нажмите у него «Скачать» / «Download» — скин сразу появится здесь, и его можно будет применить." }),
            list
          ),
        });
        for (const src of sources) {
          list.append(
            h(
              "button",
              {
                class: "catalog-source",
                type: "button",
                onClick: async () => {
                  m.close();
                  await run(() => api.skins.openCatalog(src.id));
                },
              },
              h("div", { class: "catalog-source__title", text: src.title }),
              h("div", { class: "muted", text: descriptions[src.id] || src.url })
            )
          );
        }
      }
      catalogBtn.addEventListener("click", openCatalogPicker);

      /** Тонкие руки: у тонкой модели столбцы 54–55 правой руки прозрачные. */
      function detectModel(dataUrl) {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              if (img.height !== 64) return resolve("classic");
              const c = document.createElement("canvas");
              c.width = 64;
              c.height = 64;
              const ctx = c.getContext("2d");
              ctx.drawImage(img, 0, 0);
              const a = ctx.getImageData(54, 20, 2, 12).data;
              let transparent = true;
              for (let i = 3; i < a.length; i += 4) if (a[i] !== 0) transparent = false;
              resolve(transparent ? "slim" : "classic");
            } catch (err) {
              resolve("classic");
            }
          };
          img.onerror = () => resolve("classic");
          img.src = dataUrl;
        });
      }

      async function onDownloaded(res) {
        if (!res || !res.ok) {
          toast((res && res.error) || "Не удалось получить скин", "error");
          return;
        }
        const model = await detectModel(res.dataUrl);
        const box = h("div", { class: "catalog-preview" });
        const applyBtn = h("button", { class: "btn btn--primary", html: `${IB.icon("check")}Применить` });
        const editBtn = h("button", { class: "btn", html: `${IB.icon("brush")}Открыть в редакторе` });
        const m = IB.modal({
          title: "Скин из каталога",
          content: h(
            "div",
            {},
            box,
            h("p", { class: "soft", style: { textAlign: "center", margin: "10px 0 0" }, text: model === "slim" ? "Модель: тонкие руки" : "Модель: обычные руки" })
          ),
          footer: [editBtn, applyBtn],
        });
        const pl = new IB.skin.Player3D(box, { scale: 6, ry: -24, rx: -6, bob: false });
        pl.setSkin(res.dataUrl, model);
        editBtn.addEventListener("click", async () => {
          m.close();
          if (st.tex) snapshot();
          await setTextureFromDataUrl(res.dataUrl, model, { dirty: true, keepHistory: true });
        });
        applyBtn.addEventListener("click", async () => {
          if (!st.accountId) {
            toast("Сначала добавьте аккаунт", "error");
            return;
          }
          applyBtn.disabled = true;
          applyBtn.innerHTML = '<span class="spinner"></span>Применяю…';
          const saved = await run(() => api.skins.save({ accountId: st.accountId, dataUrl: res.dataUrl, model }));
          if (saved) {
            draft = null;
            m.close();
            toast(saved.message, "success");
            await setTextureFromDataUrl(res.dataUrl, model);
          } else {
            applyBtn.disabled = false;
            applyBtn.innerHTML = `${IB.icon("check")}Применить`;
          }
        });
      }
      const offDownloaded = api.on("skins:downloaded", onDownloaded);

      async function resetToDefault() {
        if (!st.accountId) return;
        const yes = await IB.confirmDialog({ title: "Вернуть стандартный скин?", text: "Свой скин этого аккаунта в лаунчере будет удалён.", confirmText: "Вернуть" });
        if (!yes) return;
        const skin = await run(() => api.skins.reset(st.accountId));
        if (skin) {
          draft = null;
          await setTextureFromDataUrl(skin.dataUrl, skin.model);
        }
      }

      // перетаскивание PNG
      editor.addEventListener("dragover", (e) => {
        e.preventDefault();
        editor.classList.add("is-over");
      });
      editor.addEventListener("dragleave", (e) => {
        if (!editor.contains(e.relatedTarget)) editor.classList.remove("is-over");
      });
      editor.addEventListener("drop", async (e) => {
        e.preventDefault();
        editor.classList.remove("is-over");
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const filePath = api.files.pathFor(file);
        const res = filePath ? await run(() => api.skins.readPath(filePath)) : null;
        if (res) {
          if (st.tex) snapshot();
          await setTextureFromDataUrl(res.dataUrl, null, { dirty: true, keepHistory: true });
        }
      });

      // горячие клавиши
      function onKey(e) {
        if (e.target.matches("input, textarea, select")) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) {
          e.preventDefault();
          restore(st.undo, st.redo);
        } else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) {
          e.preventDefault();
          restore(st.redo, st.undo);
        } else if (!e.ctrlKey && !e.metaKey) {
          const map = { b: "brush", e: "eraser", g: "fill", i: "picker" };
          if (map[k]) {
            st.tool = map[k];
            renderTools();
          }
        }
      }
      document.addEventListener("keydown", onKey);

      renderAccounts();
      renderTools();
      renderBars();
      loadAccountSkin();

      return {
        cleanup() {
          resize.disconnect();
          offDownloaded();
          document.removeEventListener("keydown", onKey);
          if (st.tex && st.dirty) draft = { accountId: st.accountId, dataUrl: st.tex.toDataURL("image/png"), model: st.model, dirty: true };
        },
        update(kind) {
          if (kind === "accounts") {
            renderAccounts();
            if (!st.dirty) loadAccountSkin();
          }
        },
      };
    },
  };
})();
