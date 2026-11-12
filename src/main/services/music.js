/**
 * Своя музыка в лаунчере: файлы копируются в .LauncherIB\data\music и
 * играют по кругу. Встроенная «эмбиент»-музыка генерируется прямо в
 * интерфейсе (src/renderer/js/effects.js) — файлов для неё не нужно.
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const paths = require("../paths");

const DIR = path.join(paths.LAUNCHER_DIR, "music");
const EXT = /\.(mp3|ogg|wav|m4a|flac|opus|webm)$/i;

function list() {
  let files = [];
  try {
    files = fs.readdirSync(DIR).filter((f) => EXT.test(f));
  } catch (err) {
    files = [];
  }
  return files.sort().map((f) => {
    const full = path.join(DIR, f);
    return { file: f, title: f.replace(EXT, "").replace(/[_]+/g, " "), url: pathToFileURL(full).href };
  });
}

function add(sourcePaths) {
  fs.mkdirSync(DIR, { recursive: true });
  let added = 0;
  for (const src of sourcePaths || []) {
    const name = path.basename(String(src));
    if (!EXT.test(name)) continue;
    let target = path.join(DIR, name);
    let n = 2;
    while (fs.existsSync(target)) target = path.join(DIR, name.replace(EXT, (m) => ` (${n++})${m}`));
    fs.copyFileSync(src, target);
    added += 1;
  }
  return { added, tracks: list() };
}

/** Удалить трек. Если файл ещё занят (только что играл) — пробуем ещё
 * несколько раз: Windows отпускает файл не сразу. */
async function remove(file) {
  const full = path.join(DIR, String(file));
  if (path.dirname(full) !== DIR) return list();
  for (let i = 0; i < 10; i += 1) {
    try {
      fs.rmSync(full, { force: true });
      break;
    } catch (err) {
      if (!["EBUSY", "EPERM"].includes(err.code) || i === 9) throw new Error("Трек сейчас занят — поставьте музыку на паузу и попробуйте ещё раз");
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return list();
}

module.exports = { list, add, remove };
