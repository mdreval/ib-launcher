/**
 * Оформление: своя картинка или своё видео на фоне («живой фон»).
 *
 * Картинка копируется в launcher\background\custom.<расширение>, поэтому
 * исходный файл можно потом удалить или переместить. Интерфейс получает её
 * как data URL. Тема (зелёная / красная IGROBAR) — просто настройка theme.
 */

const fs = require("fs");
const path = require("path");

const { pathToFileURL } = require("url");
const paths = require("../paths");
const settings = require("./settings");
const { fetchBuffer } = require("../core/http");

const DIR = path.join(paths.LAUNCHER_DIR, "background");
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

function detectType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") return { ext: "png", mime: "image/png" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { ext: "jpg", mime: "image/jpeg" };
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (buffer.toString("ascii", 0, 3) === "GIF") return { ext: "gif", mime: "image/gif" };
  // видео: MP4 (…ftyp) и WebM (EBML)
  if (buffer.toString("ascii", 4, 8) === "ftyp") return { ext: "mp4", mime: "video/mp4", video: true };
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return { ext: "webm", mime: "video/webm", video: true };
  return null;
}

function currentFile() {
  if (!fs.existsSync(DIR)) return null;
  const f = fs.readdirSync(DIR).find((n) => /^custom\.(png|jpg|webp|gif|mp4|webm)$/.test(n));
  return f ? path.join(DIR, f) : null;
}

function isVideoFile(file) {
  return /\.(mp4|webm)$/i.test(file || "");
}

function customDataUrl() {
  const file = currentFile();
  if (!file || isVideoFile(file)) return null;
  const buffer = fs.readFileSync(file);
  const type = detectType(buffer);
  return type ? `data:${type.mime};base64,${buffer.toString("base64")}` : null;
}

function saveBuffer(buffer) {
  const type = detectType(buffer);
  if (!type) throw new Error("Это не картинка и не видео (нужен PNG, JPG, WEBP, GIF, MP4 или WebM)");
  if (!type.video && buffer.length > MAX_BYTES) throw new Error("Картинка больше 25 МБ — выберите поменьше");
  if (type.video && buffer.length > MAX_VIDEO_BYTES) throw new Error("Видео больше 300 МБ — выберите поменьше");
  fs.mkdirSync(DIR, { recursive: true });
  const old = currentFile();
  if (old) fs.rmSync(old, { force: true });
  fs.writeFileSync(path.join(DIR, `custom.${type.ext}`), buffer);
  settings.update({ background: "custom" });
  return get();
}

function fromPath(filePath) {
  const file = String(filePath);
  // Видео не читаем целиком в память — проверяем начало и копируем файл.
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  const type = detectType(head);
  if (type && type.video) {
    if (fs.statSync(file).size > MAX_VIDEO_BYTES) throw new Error("Видео больше 300 МБ — выберите поменьше");
    fs.mkdirSync(DIR, { recursive: true });
    const old = currentFile();
    if (old) fs.rmSync(old, { force: true });
    fs.copyFileSync(file, path.join(DIR, `custom.${type.ext}`));
    settings.update({ background: "custom" });
    return get();
  }
  return saveBuffer(fs.readFileSync(file));
}

async function fromUrl(url) {
  if (!/^https?:\/\//i.test(String(url || "").trim())) throw new Error("Вставьте ссылку на картинку (https://…)");
  const buffer = await fetchBuffer(String(url).trim(), { timeout: 30000 });
  return saveBuffer(buffer);
}

function resetCustom() {
  const old = currentFile();
  if (old) fs.rmSync(old, { force: true });
  settings.update({ background: "theme" });
  return get();
}

function get() {
  const s = settings.get();
  const file = currentFile();
  const useCustom = s.background === "custom" && !!file;
  const video = useCustom && isVideoFile(file);
  const dataUrl = useCustom && !video ? customDataUrl() : null;
  return {
    theme: s.theme,
    accent_color: s.accent_color,
    background: useCustom && (dataUrl || video) ? "custom" : "theme",
    bg_dim: s.bg_dim,
    customDataUrl: dataUrl,
    customVideoUrl: video ? `${pathToFileURL(file).href}?t=${Math.round(fs.statSync(file).mtimeMs)}` : null,
    hasCustom: !!file,
    live_effects: s.live_effects !== false,
    live_effect: s.live_effect || "auto",
    seasonal_effects: s.seasonal_effects !== false,
  };
}

module.exports = { get, fromPath, fromUrl, resetCustom };
