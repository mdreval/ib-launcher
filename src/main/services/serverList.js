/**
 * Прописывает сервер IGROBAR в список «Сетевая игра» (файл servers.dat в
 * папке сборки), чтобы игроку не нужно было вводить адрес вручную.
 *
 * Работает только для сборок сервера (kind === "server") с заданным
 * server_address в data/server_profiles.json. Для своих сборок игрока
 * ничего не делается.
 *
 * Серверы, которые игрок добавил сам, сохраняются. Наш сервер ставится
 * первым в списке. Если адрес сервера поменяется в server_profiles.json,
 * старая запись, которую добавлял лаунчер, заменится новой.
 */

const fs = require("fs");
const path = require("path");

const nbt = require("../core/nbt");
const builds = require("./builds");
const { readJson, writeJson } = require("../core/jsonFile");

const MARK_FILE = ".igrobar-server.json";

function sameAddress(a, b) {
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/:25565$/, "");
  return norm(a) === norm(b);
}

function entry(name, ip) {
  return {
    name: { type: nbt.T.STRING, value: name },
    ip: { type: nbt.T.STRING, value: ip },
    // 1 = «Ресурспаки сервера: включено», чтобы не спрашивало при входе.
    acceptTextures: { type: nbt.T.BYTE, value: 1 },
  };
}

function ensure(build) {
  if (!build || build.kind !== "server" || !build.server_address) return { changed: false };
  const dir = builds.instanceDir(build);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "servers.dat");
  const markFile = path.join(dir, MARK_FILE);
  const mark = readJson(markFile, {});
  const address = String(build.server_address).trim();
  const name = build.name || "IGROBAR";

  let root = null;
  if (fs.existsSync(file)) {
    try {
      root = nbt.parse(fs.readFileSync(file));
    } catch (err) {
      // Испорченный файл не удаляем, а откладываем в сторону.
      try {
        fs.renameSync(file, `${file}.broken-${Date.now()}`);
      } catch (e) {
        /* не важно */
      }
      root = null;
    }
  }
  if (!root) root = {};
  if (!root.servers || root.servers.type !== nbt.T.LIST || root.servers.value.itemType !== nbt.T.COMPOUND) {
    root.servers = { type: nbt.T.LIST, value: { itemType: nbt.T.COMPOUND, items: [] } };
  }

  let items = root.servers.value.items;
  const ipOf = (s) => (s.ip && s.ip.value) || "";

  // Убираем запись со старым адресом, если её раньше добавлял лаунчер.
  if (mark.address && !sameAddress(mark.address, address)) {
    items = items.filter((s) => !sameAddress(ipOf(s), mark.address));
  }

  const existing = items.find((s) => sameAddress(ipOf(s), address));
  let changed = false;
  if (!existing) {
    items.unshift(entry(name, address));
    changed = true;
  } else if (items[0] !== existing) {
    // Сервер есть, но не первым — поднимаем наверх, остальное не трогаем.
    items = [existing, ...items.filter((s) => s !== existing)];
    changed = true;
  }
  if (items.length !== root.servers.value.items.length) changed = true;
  root.servers.value.items = items;

  if (changed || !fs.existsSync(file)) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, nbt.serialize(root));
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
  }
  if (mark.address !== address) writeJson(markFile, { address });
  return { changed, address };
}

module.exports = { ensure };
