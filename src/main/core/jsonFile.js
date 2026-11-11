/** Надёжное чтение/запись JSON: запись через временный файл, чтобы при
 * внезапном выключении не остался обрезанный файл настроек. */

const fs = require("fs");
const path = require("path");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    return typeof fallback === "function" ? fallback() : fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

module.exports = { readJson, writeJson };
