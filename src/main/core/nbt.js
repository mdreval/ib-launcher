/**
 * Минимальное чтение/запись NBT (формат файлов Minecraft) — нужно для
 * servers.dat (список серверов в «Сетевой игре»). servers.dat хранится
 * без сжатия. Поддерживаются все типы тегов, чтобы при правке файла не
 * потерять серверы, которые игрок добавил сам (с иконками и настройками).
 *
 * Значение тега — { type, value }. Для списков value = { itemType, items }.
 */

const T = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12,
};

// ---------- чтение ----------

function reader(buf) {
  let pos = 0;
  const need = (n) => {
    if (pos + n > buf.length) throw new Error("NBT: файл обрезан");
  };
  const r = {
    u8() {
      need(1);
      return buf.readUInt8(pos++);
    },
    i8() {
      need(1);
      return buf.readInt8(pos++);
    },
    i16() {
      need(2);
      const v = buf.readInt16BE(pos);
      pos += 2;
      return v;
    },
    u16() {
      need(2);
      const v = buf.readUInt16BE(pos);
      pos += 2;
      return v;
    },
    i32() {
      need(4);
      const v = buf.readInt32BE(pos);
      pos += 4;
      return v;
    },
    i64() {
      need(8);
      const v = buf.readBigInt64BE(pos);
      pos += 8;
      return v;
    },
    f32() {
      need(4);
      const v = buf.readFloatBE(pos);
      pos += 4;
      return v;
    },
    f64() {
      need(8);
      const v = buf.readDoubleBE(pos);
      pos += 8;
      return v;
    },
    bytes(n) {
      need(n);
      const v = buf.subarray(pos, pos + n);
      pos += n;
      return Buffer.from(v);
    },
    str() {
      const len = r.u16();
      return r.bytes(len).toString("utf8");
    },
  };
  return r;
}

function readPayload(r, type) {
  switch (type) {
    case T.BYTE:
      return r.i8();
    case T.SHORT:
      return r.i16();
    case T.INT:
      return r.i32();
    case T.LONG:
      return r.i64();
    case T.FLOAT:
      return r.f32();
    case T.DOUBLE:
      return r.f64();
    case T.BYTE_ARRAY:
      return r.bytes(r.i32());
    case T.STRING:
      return r.str();
    case T.LIST: {
      const itemType = r.u8();
      const len = r.i32();
      const items = [];
      for (let i = 0; i < len; i += 1) items.push(readPayload(r, itemType));
      return { itemType, items };
    }
    case T.COMPOUND: {
      const out = {};
      for (;;) {
        const t = r.u8();
        if (t === T.END) break;
        const name = r.str();
        out[name] = { type: t, value: readPayload(r, t) };
      }
      return out;
    }
    case T.INT_ARRAY: {
      const len = r.i32();
      const arr = [];
      for (let i = 0; i < len; i += 1) arr.push(r.i32());
      return arr;
    }
    case T.LONG_ARRAY: {
      const len = r.i32();
      const arr = [];
      for (let i = 0; i < len; i += 1) arr.push(r.i64());
      return arr;
    }
    default:
      throw new Error(`NBT: неизвестный тип ${type}`);
  }
}

/** Возвращает корневой compound (объект name → {type, value}). */
function parse(buf) {
  const r = reader(buf);
  const type = r.u8();
  if (type !== T.COMPOUND) throw new Error("NBT: корень не compound");
  r.str(); // имя корня (обычно пустое)
  return readPayload(r, T.COMPOUND);
}

// ---------- запись ----------

function writer() {
  const chunks = [];
  const w = {
    u8(v) {
      const b = Buffer.alloc(1);
      b.writeUInt8(v);
      chunks.push(b);
    },
    i8(v) {
      const b = Buffer.alloc(1);
      b.writeInt8(v);
      chunks.push(b);
    },
    i16(v) {
      const b = Buffer.alloc(2);
      b.writeInt16BE(v);
      chunks.push(b);
    },
    u16(v) {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(v);
      chunks.push(b);
    },
    i32(v) {
      const b = Buffer.alloc(4);
      b.writeInt32BE(v);
      chunks.push(b);
    },
    i64(v) {
      const b = Buffer.alloc(8);
      b.writeBigInt64BE(BigInt(v));
      chunks.push(b);
    },
    f32(v) {
      const b = Buffer.alloc(4);
      b.writeFloatBE(v);
      chunks.push(b);
    },
    f64(v) {
      const b = Buffer.alloc(8);
      b.writeDoubleBE(v);
      chunks.push(b);
    },
    raw(b) {
      chunks.push(Buffer.from(b));
    },
    str(s) {
      const b = Buffer.from(String(s), "utf8");
      w.u16(b.length);
      chunks.push(b);
    },
    result: () => Buffer.concat(chunks),
  };
  return w;
}

function writePayload(w, type, value) {
  switch (type) {
    case T.BYTE:
      return w.i8(value);
    case T.SHORT:
      return w.i16(value);
    case T.INT:
      return w.i32(value);
    case T.LONG:
      return w.i64(value);
    case T.FLOAT:
      return w.f32(value);
    case T.DOUBLE:
      return w.f64(value);
    case T.BYTE_ARRAY:
      w.i32(value.length);
      return w.raw(value);
    case T.STRING:
      return w.str(value);
    case T.LIST:
      w.u8(value.items.length ? value.itemType : value.itemType || T.END);
      w.i32(value.items.length);
      for (const item of value.items) writePayload(w, value.itemType, item);
      return undefined;
    case T.COMPOUND:
      for (const [name, tag] of Object.entries(value)) {
        w.u8(tag.type);
        w.str(name);
        writePayload(w, tag.type, tag.value);
      }
      return w.u8(T.END);
    case T.INT_ARRAY:
      w.i32(value.length);
      for (const v of value) w.i32(v);
      return undefined;
    case T.LONG_ARRAY:
      w.i32(value.length);
      for (const v of value) w.i64(v);
      return undefined;
    default:
      throw new Error(`NBT: неизвестный тип ${type}`);
  }
}

function serialize(rootCompound) {
  const w = writer();
  w.u8(T.COMPOUND);
  w.str("");
  writePayload(w, T.COMPOUND, rootCompound);
  return w.result();
}

module.exports = { T, parse, serialize };
