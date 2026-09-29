/** Minimaler ZIP-Schreiber (ohne Kompression, „stored“) für Planpakete. */

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(daten: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < daten.length; i++) c = CRC_TABELLE[(c ^ daten[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEintrag {
  name: string;
  daten: string | Uint8Array;
}

export function erzeugeZip(eintraege: ZipEintrag[]): Uint8Array {
  const enc = new TextEncoder();
  const jetzt = new Date();
  const zeit = (jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | Math.floor(jetzt.getSeconds() / 2);
  const datum = ((jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate();
  const teile: Uint8Array[] = [];
  const zentral: Uint8Array[] = [];
  let versatz = 0;

  for (const e of eintraege) {
    const name = enc.encode(e.name);
    const daten = typeof e.daten === "string" ? enc.encode(e.daten) : e.daten;
    const crc = crc32(daten);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true);
    kopf.setUint16(4, 20, true);
    kopf.setUint16(6, 0x0800, true); // Dateinamen in UTF-8
    kopf.setUint16(8, 0, true);
    kopf.setUint16(10, zeit, true);
    kopf.setUint16(12, datum, true);
    kopf.setUint32(14, crc, true);
    kopf.setUint32(18, daten.length, true);
    kopf.setUint32(22, daten.length, true);
    kopf.setUint16(26, name.length, true);
    kopf.setUint16(28, 0, true);
    teile.push(new Uint8Array(kopf.buffer), name, daten);

    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true);
    z.setUint16(4, 20, true);
    z.setUint16(6, 20, true);
    z.setUint16(8, 0x0800, true);
    z.setUint16(10, 0, true);
    z.setUint16(12, zeit, true);
    z.setUint16(14, datum, true);
    z.setUint32(16, crc, true);
    z.setUint32(20, daten.length, true);
    z.setUint32(24, daten.length, true);
    z.setUint16(28, name.length, true);
    z.setUint32(42, versatz, true);
    zentral.push(new Uint8Array(z.buffer), name);
    versatz += 30 + name.length + daten.length;
  }

  const zentralGroesse = zentral.reduce((s, x) => s + x.length, 0);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);
  ende.setUint16(8, eintraege.length, true);
  ende.setUint16(10, eintraege.length, true);
  ende.setUint32(12, zentralGroesse, true);
  ende.setUint32(16, versatz, true);

  const alle = [...teile, ...zentral, new Uint8Array(ende.buffer)];
  const ergebnis = new Uint8Array(alle.reduce((s, x) => s + x.length, 0));
  let pos = 0;
  for (const x of alle) {
    ergebnis.set(x, pos);
    pos += x.length;
  }
  return ergebnis;
}
