/**
 * Оформление: своя картинка фона.
 *
 * Картинка копируется в launcher\background\custom.<расширение>, поэтому
 * исходный файл можно потом удалить или переместить. Интерфейс получает её
 * как data URL. Тема (зелёная / красная IGROBAR) — просто настройка theme.
 */

const fs = require("fs");
const path = require("path");

const paths = require("../paths");
const settings = require("./settings");
const { fetchBuffer } = require("../core/http");

const DIR = path.join(paths.LAUNCHER_DIR, "background");
const MAX_BYTES = 25 * 1024 * 1024;

function detectType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") return { ext: "png", mime: "image/png" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { ext: "jpg", mime: "image/jpeg" };
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (buffer.toString("ascii", 0, 3) === "GIF") return { ext: "gif", mime: "image/gif" };
  return null;
}

function currentFile() {
  if (!fs.existsSync(DIR)) return null;
  const f = fs.readdirSync(DIR).find((n) => /^custom\.(png|jpg|webp|gif)$/.test(n));
  return f ? path.join(DIR, f) : null;
}

function customDataUrl() {
  const file = currentFile();
  if (!file) return null;
  const buffer = fs.readFileSync(file);
  const type = detectType(buffer);
  return type ? `data:${type.mime};base64,${buffer.toString("base64")}` : null;
}

function saveBuffer(buffer) {
  if (buffer.length > MAX_BYTES) throw new Error("Картинка больше 25 МБ — выберите поменьше");
  const type = detectType(buffer);
  if (!type) throw new Error("Это не картинка (нужен PNG, JPG, WEBP или GIF)");
  fs.mkdirSync(DIR, { recursive: true });
  const old = currentFile();
  if (old) fs.rmSync(old, { force: true });
  fs.writeFileSync(path.join(DIR, `custom.${type.ext}`), buffer);
  settings.update({ background: "custom" });
  return get();
}

function fromPath(filePath) {
  return saveBuffer(fs.readFileSync(String(filePath)));
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
  const dataUrl = s.background === "custom" ? customDataUrl() : null;
  return { theme: s.theme, background: dataUrl ? "custom" : "theme", bg_dim: s.bg_dim, customDataUrl: dataUrl, hasCustom: !!currentFile() };
}

module.exports = { get, fromPath, fromUrl, resetCustom };
