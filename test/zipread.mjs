import assert from "node:assert/strict";

// A small reader: walks the central directory and returns { name, crc, data }.
export function read(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = buf.length - 22; while (v.getUint32(e, true) !== 0x06054b50) e--;
  const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = [];
  for (let i = 0; i < n; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    const crc = v.getUint32(p + 16, true), size = v.getUint32(p + 24, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nl));
    assert.equal(v.getUint32(off, true), 0x04034b50);
    const lnl = v.getUint16(off + 26, true), lxl = v.getUint16(off + 28, true);
    out.push({ name, crc, method: v.getUint16(p + 10, true), data: buf.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + size) });
    p += 46 + nl + xl + cl;
  }
  return out;
}

