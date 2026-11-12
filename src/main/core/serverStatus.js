/**
 * Статус сервера Minecraft (онлайн, игроки, пинг) — свой Server List Ping.
 *
 * Почему не через minecraft-java-core: та утилита стучится строго на
 * host:25565 и не понимает SRV-записи. А у IGROBAR адрес igrobar.aboba.host —
 * это SRV-запись, которая указывает на d11.joinserver.xyz:25970. Игра SRV
 * понимает сама, а пинг лаунчера — нет, поэтому сервер всегда был «недоступен».
 *
 * Порядок: SRV (_minecraft._tcp.<host>) → host:порт из адреса (или 25565).
 * Можно передать несколько адресов через запятую — используется первый
 * ответивший (см. status_address в data/server_profiles.json).
 */

const net = require("net");
const dns = require("dns").promises;

const TIMEOUT_MS = 6000;
const PROTOCOL = 767; // любой: сервер отвечает статусом на любую версию протокола

function varInt(n) {
  const out = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  } while (v !== 0);
  return Buffer.from(out);
}

function readVarInt(buf, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    if (pos >= buf.length) return null;
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { value: result >>> 0, size: pos - offset };
    shift += 7;
    if (shift > 35) throw new Error("VarInt слишком длинный");
  }
}

function packet(id, payload) {
  const body = Buffer.concat([varInt(id), payload]);
  return Buffer.concat([varInt(body.length), body]);
}

function mcString(s) {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([varInt(b.length), b]);
}

function parseAddress(address) {
  const s = String(address || "").trim();
  const m = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(s);
  return { host: m ? m[1] : s, port: m && m[2] ? parseInt(m[2], 10) : null };
}

async function resolveTargets(address) {
  const { host, port } = parseAddress(address);
  const targets = [];
  if (!port && !net.isIP(host)) {
    try {
      const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
      records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      for (const r of records) targets.push({ host: r.name, port: r.port, viaSrv: true });
    } catch (err) {
      /* SRV-записи нет — пробуем напрямую */
    }
  }
  targets.push({ host, port: port || 25565, viaSrv: false });
  return { requestedHost: host, targets };
}

function slp(target, requestedHost) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.createConnection({ host: target.host, port: target.port });
    let buf = Buffer.alloc(0);
    let status = null;
    let pingSent = 0;
    let finished = false;
    let timer = null;
    const done = (err, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    timer = setTimeout(() => done(new Error("timeout")), TIMEOUT_MS);
    socket.on("error", (err) => done(err));
    socket.on("connect", () => {
      // Handshake: в адресе — то имя, что ввёл игрок (как делает сама игра).
      const port = Buffer.alloc(2);
      port.writeUInt16BE(target.port);
      socket.write(packet(0x00, Buffer.concat([varInt(PROTOCOL), mcString(target.viaSrv ? requestedHost : target.host), port, varInt(1)])));
      socket.write(packet(0x00, Buffer.alloc(0)));
    });
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const len = readVarInt(buf, 0);
        if (!len || buf.length < len.size + len.value) return;
        const body = buf.subarray(len.size, len.size + len.value);
        buf = buf.subarray(len.size + len.value);
        const id = readVarInt(body, 0);
        if (!id) return done(new Error("bad packet"));
        if (id.value === 0x00 && !status) {
          const strLen = readVarInt(body, id.size);
          if (!strLen) return done(new Error("bad packet"));
          const json = body.subarray(id.size + strLen.size, id.size + strLen.size + strLen.value).toString("utf8");
          try {
            status = JSON.parse(json);
          } catch (err) {
            return done(new Error("bad json"));
          }
          // Пинг (замер задержки). Если сервер на него не ответит — всё
          // равно вернём статус через 1,5 с.
          const payload = Buffer.alloc(8);
          payload.writeBigInt64BE(BigInt(Date.now()));
          pingSent = Date.now();
          socket.write(packet(0x01, payload));
          setTimeout(() => done(null, { status, ms: Date.now() - started }), 1500);
        } else if (id.value === 0x01 && status) {
          return done(null, { status, ms: Date.now() - pingSent });
        }
      }
    });
    socket.on("end", () => {
      if (status) done(null, { status, ms: Date.now() - started });
      else done(new Error("closed"));
    });
  });
}

function motdText(desc) {
  if (!desc) return "";
  if (typeof desc === "string") return desc.replace(/§./g, "");
  let out = desc.text || "";
  if (Array.isArray(desc.extra)) out += desc.extra.map(motdText).join("");
  return out.replace(/§./g, "");
}

async function pingOne(address) {
  const { requestedHost, targets } = await resolveTargets(address);
  let lastErr = null;
  for (const t of targets) {
    try {
      const { status, ms } = await slp(t, requestedHost);
      return {
        online: true,
        players: (status.players && status.players.online) ?? 0,
        max: (status.players && status.players.max) ?? 0,
        names: ((status.players && status.players.sample) || []).map((p) => p.name).filter(Boolean),
        ping: ms,
        version: (status.version && status.version.name) || "",
        motd: motdText(status.description),
        address: `${t.host}:${t.port}`,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  return { online: false, error: lastErr ? lastErr.message : "unreachable" };
}

/** address — строка; можно несколько через запятую или массив. */
async function ping(address) {
  const list = (Array.isArray(address) ? address : String(address || "").split(","))
    .map((a) => String(a).trim())
    .filter(Boolean);
  if (!list.length) return { online: false };
  let last = { online: false };
  for (const a of list) {
    last = await pingOne(a);
    if (last.online) return last;
  }
  return last;
}

/** Куда реально подключаться: SRV-запись или host:порт из адреса. */
async function resolve(address) {
  const first = String(address || "").split(",")[0].trim();
  const { targets } = await resolveTargets(first);
  return targets[0];
}

module.exports = { ping, resolve };
