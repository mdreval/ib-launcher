/**
 * Хранилище скинов: у каждого аккаунта свой PNG 64×64 и модель рук
 * (обычная / тонкая). Если своего скина нет — показывается скин по
 * умолчанию из assets/skins/default.png.
 */

const fs = require("fs");
const path = require("path");
const paths = require("../paths");
const { readJson, writeJson } = require("../core/jsonFile");

const META_FILE = path.join(paths.SKINS_DIR, "skins.json");
const DEFAULT_SKIN = paths.appResource("assets", "skins", "default.png");

function safeId(accountId) {
  return String(accountId || "none").replace(/[^a-zA-Z0-9_-]/g, "");
}

function fileFor(accountId) {
  return path.join(paths.SKINS_DIR, `${safeId(accountId)}.png`);
}

function meta() {
  return readJson(META_FILE, {});
}

/** Проверка, что это действительно PNG-скин 64×64 или старый 64×32. */
function validatePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error("Это не PNG-файл");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new Error(`Скин должен быть 64×64 (или 64×32), а этот ${width}×${height}`);
  }
  return { width, height };
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ""));
  if (!match) throw new Error("Неверные данные изображения");
  return Buffer.from(match[1], "base64");
}

function get(accountId) {
  const entry = meta()[safeId(accountId)] || null;
  const file = fileFor(accountId);
  if (accountId && entry && fs.existsSync(file)) {
    const png = fs.readFileSync(file);
    return {
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      model: entry.model === "slim" ? "slim" : "classic",
      custom: true,
      source: entry.source || "custom",
    };
  }
  const png = fs.readFileSync(DEFAULT_SKIN);
  return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, model: "classic", custom: false, source: "default" };
}

function save(accountId, buffer, model, source = "custom") {
  if (!accountId) throw new Error("Сначала добавьте аккаунт");
  validatePng(buffer);
  fs.mkdirSync(paths.SKINS_DIR, { recursive: true });
  fs.writeFileSync(fileFor(accountId), buffer);
  const all = meta();
  all[safeId(accountId)] = { model: model === "slim" ? "slim" : "classic", source, updated_at: Date.now() };
  writeJson(META_FILE, all);
  return get(accountId);
}

/** Готовые скины из assets/skins/presets (выбрать одним кликом). */
function presets() {
  const dir = paths.appResource("assets", "skins", "presets");
  const index = readJson(path.join(dir, "presets.json"), []);
  return index
    .map((p) => {
      try {
        const png = fs.readFileSync(path.join(dir, `${p.id}.png`));
        return { id: p.id, name: p.name, model: p.model, dataUrl: `data:image/png;base64,${png.toString("base64")}` };
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);
}

function remove(accountId) {
  const all = meta();
  delete all[safeId(accountId)];
  writeJson(META_FILE, all);
  fs.rmSync(fileFor(accountId), { force: true });
}

module.exports = { get, save, remove, presets, validatePng, dataUrlToBuffer };
