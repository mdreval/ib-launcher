/*
 * Живой фон и музыка.
 *
 *  - Частицы поверх фона: светлячки (зелёная тема), искры (красная),
 *    огоньки цвета темы («свой цвет»).
 *  - Сезонные эффекты (включаются сами по дате): снег зимой, конфетти и снег
 *    на Новый год, летучие мыши на Хэллоуин, листопад осенью, лепестки весной.
 *  - Видео на фоне (своё MP4/WebM из настроек «Оформление»).
 *  - Музыка: встроенный спокойный эмбиент (генерируется прямо здесь, без
 *    файлов) или свои треки; на время игры затихает.
 */
(function () {
  const IB = window.IB;
  const api = window.ib;
  const S = IB.state;

  // ===================== частицы =====================

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let canvas = null;
  let ctx = null;
  let particles = [];
  let mode = null;
  let raf = 0;
  let lastT = 0;

  /** Какой сезон сегодня (или null). */
  function season(date = new Date()) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const md = m * 100 + d;
    if (md >= 1225 || md <= 107) return "newyear";
    if (md >= 1020 && md <= 1103) return "halloween";
    if (m === 12 || m === 1 || m === 2) return "winter";
    if ((md >= 915 && md < 1020) || (md > 1103 && md <= 1130)) return "autumn";
    if (md >= 401 && md <= 515) return "spring";
    return null;
  }

  function accentRgb() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--c-a8f0d0").trim();
    return v || "168, 240, 208";
  }

  /** Варианты живого фона (выбираются в настройках, работают с любой темой). */
  const LIVE_VARIANTS = [
    { id: "auto", title: "По теме" },
    { id: "fireflies", title: "Светлячки" },
    { id: "embers", title: "Искры" },
    { id: "glow", title: "Огоньки цвета темы" },
    { id: "stars", title: "Звёздное небо" },
    { id: "rain", title: "Дождь" },
    { id: "snow", title: "Снег" },
    { id: "petals", title: "Лепестки" },
    { id: "leaves", title: "Листья" },
    { id: "bubbles", title: "Пузырьки" },
  ];

  /** Живой фон и сезонный эффект показываются вместе: «режим» — их пара. */
  function pickMode() {
    const a = S.appearance || {};
    let live = null;
    if (a.live_effects !== false) {
      live = LIVE_VARIANTS.some((v) => v.id === a.live_effect) ? a.live_effect : "auto";
      if (live === "auto") live = a.theme === "red" ? "embers" : a.theme === "custom" ? "glow" : "fireflies";
    }
    const seas = a.seasonal_effects !== false ? season() : null;
    if (!live && !seas) return null;
    return `${live || ""}|${seas || ""}`;
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  function spawn(kind, w, h, initial) {
    const p = { kind, x: rnd(0, w), y: initial ? rnd(0, h) : -20, life: 0, phase: rnd(0, Math.PI * 2) };
    switch (kind) {
      case "fireflies":
      case "glow":
        p.y = initial ? rnd(h * 0.25, h) : h + 10;
        p.vx = rnd(-8, 8);
        p.vy = rnd(-14, -4);
        p.r = rnd(1.2, 2.6);
        p.tw = rnd(0.6, 1.6);
        break;
      case "embers":
        p.y = initial ? rnd(0, h) : h + 10;
        p.vx = rnd(-10, 10);
        p.vy = rnd(-40, -16);
        p.r = rnd(1, 2.4);
        p.tw = rnd(1, 2.5);
        break;
      case "snow":
        p.vx = rnd(-10, 10);
        p.vy = rnd(18, 48);
        p.r = rnd(1, 3.2);
        break;
      case "confetti":
        p.vx = rnd(-20, 20);
        p.vy = rnd(30, 70);
        p.r = rnd(2, 4);
        p.rot = rnd(0, Math.PI);
        p.vr = rnd(-3, 3);
        p.color = ["#ff5252", "#ffd43b", "#4dabf7", "#a9e34b", "#f783ac", "#ffffff"][Math.floor(Math.random() * 6)];
        break;
      case "leaf":
      case "petal":
        p.vx = rnd(-14, 14);
        p.vy = rnd(22, 46);
        p.r = kind === "leaf" ? rnd(4, 7) : rnd(3, 5);
        p.rot = rnd(0, Math.PI * 2);
        p.vr = rnd(-1.5, 1.5);
        p.color = kind === "leaf" ? ["#e8590c", "#f08c00", "#c92a2a", "#e67700", "#a0522d"][Math.floor(Math.random() * 5)] : ["#ffc9de", "#fcc2d7", "#ffdeeb", "#fff0f6"][Math.floor(Math.random() * 4)];
        break;
      case "star":
        p.y = rnd(0, h * 0.85);
        p.vx = rnd(-1.5, 1.5);
        p.vy = 0;
        p.r = Math.random() < 0.12 ? rnd(1.4, 2.2) : rnd(0.5, 1.3);
        p.tw = rnd(0.4, 1.8);
        p.still = true;
        break;
      case "rain":
        p.y = initial ? rnd(0, h) : rnd(-60, -10);
        p.vx = -90;
        p.vy = rnd(700, 950);
        p.len = rnd(10, 22);
        p.still = true;
        break;
      case "bubble":
        p.y = initial ? rnd(0, h) : h + 20;
        p.vx = rnd(-6, 6);
        p.vy = rnd(-34, -14);
        p.r = rnd(3, 9);
        break;
      case "bat":
        p.x = initial ? rnd(0, w) : -30;
        p.y = rnd(h * 0.05, h * 0.55);
        p.vx = rnd(40, 90);
        p.vy = rnd(-6, 6);
        p.r = rnd(6, 11);
        break;
      default:
        break;
    }
    return p;
  }

  /** Состав частиц для режима: [[вид, количество], …]. */
  function recipe(modeKey, w, h) {
    const [live, seas] = String(modeKey || "").split("|");
    // вместе с сезонным эффектом живой фон чуть реже, чтобы не было каши
    return [...liveRecipe(live, w, h, seas ? 0.6 : 1), ...liveRecipe(seas, w, h, live ? 0.8 : 1)];
  }

  function liveRecipe(m, w, h, k = 1) {
    const area = ((w * h) / (1280 * 800)) * k;
    const n = (c) => Math.max(3, Math.round(c * area));
    switch (m) {
      case "stars":
        return [["star", n(110)]];
      case "rain":
        return [["rain", n(120)]];
      case "snow":
        return [["snow", n(80)]];
      case "petals":
        return [["petal", n(26)]];
      case "leaves":
        return [["leaf", n(22)]];
      case "bubbles":
        return [["bubble", n(26)]];
      case "fireflies":
        return [["fireflies", n(28)]];
      case "glow":
        return [["glow", n(30)]];
      case "embers":
        return [["embers", n(34)]];
      case "winter":
        return [["snow", n(90)]];
      case "newyear":
        return [
          ["snow", n(60)],
          ["confetti", n(26)],
        ];
      case "halloween":
        return [
          ["embers", n(24)],
          ["bat", 5],
        ];
      case "autumn":
        return [["leaf", n(22)]];
      case "spring":
        return [["petal", n(26)]];
      default:
        return [];
    }
  }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function reset() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    particles = [];
    for (const [kind, count] of recipe(mode, w, h)) {
      for (let i = 0; i < count; i += 1) particles.push(spawn(kind, w, h, true));
    }
  }

  function drawBat(p, t) {
    const flap = Math.sin(t * 14 + p.phase) * 0.6;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(10, 6, 12, 0.85)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-p.r, -p.r * (0.6 + flap), -p.r * 1.8, -p.r * 0.1);
    ctx.quadraticCurveTo(-p.r, p.r * 0.1, 0, p.r * 0.35);
    ctx.quadraticCurveTo(p.r, p.r * 0.1, p.r * 1.8, -p.r * 0.1);
    ctx.quadraticCurveTo(p.r, -p.r * (0.6 + flap), 0, 0);
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
    lastT = now;
    const t = now / 1000;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    const acc = accentRgb();
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.life += dt;
      p.x += (p.vx + (p.still ? 0 : Math.sin(t * 0.8 + p.phase) * 6)) * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
      const out = p.y < -40 || p.y > h + 40 || p.x < -60 || p.x > w + 60;
      if (out) {
        particles[i] = spawn(p.kind, w, h, false);
        continue;
      }
      switch (p.kind) {
        case "fireflies":
        case "glow": {
          const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * p.tw + p.phase));
          const color = p.kind === "fireflies" ? "214, 255, 170" : acc;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
          g.addColorStop(0, `rgba(${color}, ${a})`);
          g.addColorStop(1, `rgba(${color}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "embers": {
          const a = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * p.tw + p.phase));
          ctx.fillStyle = `rgba(255, ${140 + Math.round(60 * Math.sin(p.phase))}, 60, ${a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "star": {
          const a = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(t * p.tw + p.phase));
          ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          if (p.r > 1.4) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.35})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - p.r * 3, p.y);
            ctx.lineTo(p.x + p.r * 3, p.y);
            ctx.moveTo(p.x, p.y - p.r * 3);
            ctx.lineTo(p.x, p.y + p.r * 3);
            ctx.stroke();
          }
          break;
        }
        case "rain":
          ctx.strokeStyle = "rgba(190, 215, 255, 0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + (p.vx / p.vy) * p.len, p.y + p.len);
          ctx.stroke();
          break;
        case "bubble":
          ctx.strokeStyle = `rgba(${acc}, 0.45)`;
          ctx.fillStyle = `rgba(${acc}, 0.07)`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
          ctx.beginPath();
          ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.22, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "snow":
          ctx.fillStyle = `rgba(255, 255, 255, ${0.45 + p.r / 8})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "confetti":
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
          ctx.restore();
          break;
        case "leaf":
        case "petal":
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        case "bat":
          drawBat(p, t);
          break;
        default:
          break;
      }
    }
  }

  function applyEffects() {
    const next = reduceMotion ? null : pickMode();
    if (next === mode && canvas) return;
    mode = next;
    if (!mode) {
      cancelAnimationFrame(raf);
      raf = 0;
      if (canvas) canvas.remove();
      canvas = null;
      return;
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "fx-canvas";
      canvas.setAttribute("aria-hidden", "true");
      document.body.insertBefore(canvas, document.querySelector(".shell"));
      ctx = canvas.getContext("2d");
      resize();
    }
    reset();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    if (!canvas) return;
    resize();
    reset();
  });

  // ===================== видео на фоне =====================

  function applyVideo() {
    const a = S.appearance || {};
    const bg = document.querySelector(".app-bg");
    if (!bg) return;
    let video = bg.querySelector("video");
    if (a.customVideoUrl) {
      if (!video) {
        video = document.createElement("video");
        video.className = "app-bg__video";
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        bg.prepend(video);
      }
      if (video.dataset.src !== a.customVideoUrl) {
        video.dataset.src = a.customVideoUrl;
        video.src = a.customVideoUrl;
        video.play().catch(() => {});
      }
      document.documentElement.setAttribute("data-video-bg", "");
    } else {
      if (video) video.remove();
      document.documentElement.removeAttribute("data-video-bg");
    }
  }

  // ===================== музыка =====================

  let audioCtx = null;
  let master = null;
  let ambientTimer = null;
  let ambientOn = false;
  let player = null; // <audio> для своих треков
  let tracks = [];
  let trackIndex = 0;
  let suspendedForGame = false;
  // Пауза, которую поставил сам игрок: держится, пока он не нажмёт «Играть».
  let userPaused = (() => {
    try {
      return localStorage.getItem("ib.musicPaused") === "1";
    } catch (err) {
      return false;
    }
  })();

  /** Громкость ползунка → громкость звука: по кривой, чтобы на слух менялась равномерно. */
  const curve = (v) => Math.max(0, Math.min(1, v)) ** 2;
  const notify = () => IB.emit("music", nowPlaying());

  function settings() {
    return S.settings || {};
  }

  function volume() {
    const v = Number(settings().music_volume);
    return Number.isFinite(v) ? v : 0.35;
  }

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = audioCtx.createGain();
    master.gain.value = 0;
    // Простая «комнатная» реверберация из сгенерированного импульса.
    const len = audioCtx.sampleRate * 3.5;
    const impulse = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const reverb = audioCtx.createConvolver();
    reverb.buffer = impulse;
    const wet = audioCtx.createGain();
    wet.gain.value = 0.55;
    const dry = audioCtx.createGain();
    dry.gain.value = 0.45;
    master.connect(dry).connect(audioCtx.destination);
    master.connect(reverb).connect(wet).connect(audioCtx.destination);
  }

  // Спокойные аккорды в ре-мажорной пентатонике.
  const CHORDS = [
    [50, 57, 62, 66],
    [47, 54, 59, 62],
    [43, 50, 55, 59],
    [45, 52, 57, 61],
  ];
  const MELODY = [62, 64, 66, 69, 71, 74, 76, 78];
  const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  function tone(midi, start, dur, gain, type = "sine") {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq(midi);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + Math.min(1.5, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  let chordStep = 0;
  function ambientBar() {
    if (!ambientOn) return;
    const now = audioCtx.currentTime + 0.05;
    const bar = 8;
    const chord = CHORDS[chordStep % CHORDS.length];
    chordStep += 1;
    for (const n of chord) tone(n, now, bar + 2, 0.045, "triangle");
    // несколько тихих «капель» мелодии
    const notes = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i += 1) {
      const at = now + 0.6 + Math.random() * (bar - 1.5);
      tone(MELODY[Math.floor(Math.random() * MELODY.length)], at, 3.2, 0.06, "sine");
    }
    ambientTimer = setTimeout(ambientBar, bar * 1000);
  }

  function fadeMaster(to, seconds = 1.5) {
    if (!master) return;
    const t = audioCtx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(to, t + seconds);
  }

  function startAmbient() {
    ensureAudio();
    clearTimeout(suspendTimer);
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
      // если система не дала включить звук сразу — включится с первым кликом
      window.addEventListener("pointerdown", () => audioCtx.resume().catch(() => {}), { once: true });
    }
    if (!ambientOn) {
      ambientOn = true;
      ambientBar();
    }
    fadeMaster(curve(volume()) * 0.9);
  }

  let suspendTimer = null;
  function stopAmbient() {
    ambientOn = false;
    clearTimeout(ambientTimer);
    if (!audioCtx) return;
    fadeMaster(0, 0.4);
    // После затухания звук полностью выключаем — иначе уже запущенные ноты
    // и эхо продолжали звучать.
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => {
      if (!ambientOn && audioCtx.state === "running") audioCtx.suspend().catch(() => {});
    }, 450);
  }

  async function startCustom() {
    if (!player) {
      player = new Audio();
      player.addEventListener("ended", () => {
        trackIndex = (trackIndex + 1) % Math.max(1, tracks.length);
        playTrack();
      });
      player.addEventListener("play", notify);
      player.addEventListener("pause", notify);
      // позиция трека для полосы перемотки
      let lastTick = 0;
      const tick = () => {
        const now = Date.now();
        if (now - lastTick < 250) return;
        lastTick = now;
        IB.emit("music:time", progress());
      };
      player.addEventListener("timeupdate", tick);
      player.addEventListener("loadedmetadata", () => IB.emit("music:time", progress()));
      player.addEventListener("seeked", () => IB.emit("music:time", progress()));
    }
    tracks = (await api.music.list().catch(() => [])) || [];
    if (!tracks.length) return startAmbient(); // своих треков нет — играет встроенная
    trackIndex %= tracks.length;
    player.volume = curve(volume());
    if (player.paused) playTrack();
  }

  function playTrack() {
    if (!tracks.length || !player) return;
    trackIndex = ((trackIndex % tracks.length) + tracks.length) % tracks.length;
    const tr = tracks[trackIndex];
    if (player.dataset.src !== tr.url) {
      player.dataset.src = tr.url;
      player.src = tr.url;
    }
    if (!userPaused && !suspendedForGame && settings().music_enabled) player.play().catch(() => {});
    notify();
  }

  function stopCustom() {
    if (player) player.pause();
  }

  /** Отпустить файл трека (перед удалением — иначе Windows не даст удалить). */
  function release(file) {
    if (!player) return;
    const tr = tracks[trackIndex];
    if (!file || (tr && tr.file === file)) {
      player.pause();
      player.removeAttribute("src");
      player.dataset.src = "";
      player.load();
    }
  }

  /** Позиция и длина текущего своего трека (для перемотки). */
  function progress() {
    if (!player || !player.dataset.src) return null;
    const d = player.duration;
    return { current: player.currentTime || 0, duration: Number.isFinite(d) ? d : 0 };
  }

  function seek(seconds) {
    if (!player || !Number.isFinite(player.duration)) return;
    player.currentTime = Math.max(0, Math.min(player.duration - 0.25, Number(seconds) || 0));
    IB.emit("music:time", progress());
  }

  /** Пауза своей музыки, если включили Spotify. */
  function pauseForSpotify() {
    if (userPaused || !settings().music_enabled) return false;
    IB.effects.togglePause();
    return true;
  }

  function nowPlaying() {
    const s = settings();
    const custom = s.music_source === "custom" && tracks.length > 0;
    return {
      enabled: !!s.music_enabled,
      paused: userPaused,
      custom,
      title: custom ? (tracks[trackIndex] || {}).title || "" : "Встроенная музыка",
      index: trackIndex,
      count: tracks.length,
    };
  }

  function applyMusic() {
    const s = settings();
    const want = s.music_enabled && !suspendedForGame && !userPaused;
    if (!want) {
      stopAmbient();
      stopCustom();
      notify();
      return;
    }
    if (s.music_source === "custom") {
      stopAmbient();
      startCustom();
    } else {
      stopCustom();
      startAmbient();
    }
    if (player) player.volume = curve(volume());
    notify();
  }

  /** Громкость меняется сразу, без перезапуска. */
  function setVolume(v) {
    if (player) player.volume = curve(v);
    if (ambientOn && master) {
      const t = audioCtx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(curve(v) * 0.9, t, 0.05);
    }
  }

  // На время игры музыка затихает.
  IB.on("game", () => {
    const running = Object.values(S.states || {}).some((st) => st && st.status === "running");
    if (running !== suspendedForGame) {
      suspendedForGame = running;
      applyMusic();
    }
  });

  IB.on("appearance", () => {
    applyEffects();
    applyVideo();
  });

  IB.effects = {
    apply() {
      applyEffects();
      applyVideo();
    },
    applyMusic,
    setVolume,
    season,
    LIVE_VARIANTS,
    nextTrack() {
      trackIndex += 1;
      playTrack();
    },
    prevTrack() {
      // в начале трека — предыдущий, иначе — сначала текущий
      if (player && player.currentTime > 3) player.currentTime = 0;
      else trackIndex -= 1;
      playTrack();
    },
    togglePause() {
      userPaused = !userPaused;
      try {
        localStorage.setItem("ib.musicPaused", userPaused ? "1" : "0");
      } catch (err) {
        /* не важно */
      }
      applyMusic();
    },
    release,
    nowPlaying,
    progress,
    seek,
    pauseForSpotify,
    /** Включить трек по номеру (клик по треку в списке). */
    playAt(i) {
      trackIndex = i;
      if (userPaused) {
        userPaused = false;
        try {
          localStorage.setItem("ib.musicPaused", "0");
        } catch (err) {
          /* не важно */
        }
      }
      if (player && settings().music_source === "custom" && tracks.length) {
        if (player.dataset.src) player.dataset.src = "";
        playTrack();
      }
      applyMusic();
    },
  };
})();
