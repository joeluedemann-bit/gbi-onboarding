/**
 * Schlanker DXF-Schreiber (AutoCAD R12 / AC1009, ASCII).
 *
 * R12 wird von allen CAD-Programmen gelesen (AutoCAD, BricsCAD, ProgeCAD …)
 * und lässt sich dort direkt als DWG speichern bzw. per ODA File Converter
 * stapelweise nach DWG wandeln.
 */

export interface DxfLayer {
  name: string;
  /** AutoCAD-Farbindex (1 rot, 2 gelb, 3 grün, 4 cyan, 5 blau, 6 magenta, 7 weiß/schwarz, 8 grau …) */
  farbe: number;
  linientyp?: "CONTINUOUS" | "DASHED" | "DASHDOT" | "HIDDEN";
}

export type TextAusrichtung = "links" | "mitte" | "rechts";

export class DxfZeichnung {
  private readonly layer = new Map<string, DxfLayer>();
  private readonly entitaeten: string[] = [];
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  constructor(layer: DxfLayer[] = []) {
    this.neuerLayer({ name: "0", farbe: 7 });
    layer.forEach((l) => this.neuerLayer(l));
  }

  neuerLayer(l: DxfLayer) {
    this.layer.set(dxfName(l.name), { ...l, name: dxfName(l.name) });
  }

  private sicherLayer(name: string) {
    const n = dxfName(name);
    if (!this.layer.has(n)) this.layer.set(n, { name: n, farbe: 7 });
    return n;
  }

  private erweitere(x: number, y: number) {
    this.minX = Math.min(this.minX, x);
    this.minY = Math.min(this.minY, y);
    this.maxX = Math.max(this.maxX, x);
    this.maxY = Math.max(this.maxY, y);
  }

  linie(layer: string, x1: number, y1: number, x2: number, y2: number, z1 = 0, z2 = 0) {
    this.erweitere(x1, y1);
    this.erweitere(x2, y2);
    this.entitaeten.push(
      gruppen([0, "LINE"], [8, this.sicherLayer(layer)], [10, x1], [20, y1], [30, z1], [11, x2], [21, y2], [31, z2]),
    );
  }

  /** Polylinie; mit z-Werten als 3D-Polylinie. */
  polylinie(layer: string, punkte: { x: number; y: number; z?: number }[], geschlossen = false) {
    if (punkte.length < 2) return;
    const dreiD = punkte.some((p) => p.z !== undefined);
    const flags = (geschlossen ? 1 : 0) | (dreiD ? 8 : 0);
    const teile = [gruppen([0, "POLYLINE"], [8, this.sicherLayer(layer)], [66, 1], [10, 0], [20, 0], [30, 0], [70, flags])];
    for (const p of punkte) {
      this.erweitere(p.x, p.y);
      teile.push(gruppen([0, "VERTEX"], [8, this.sicherLayer(layer)], [10, p.x], [20, p.y], [30, p.z ?? 0], [70, dreiD ? 32 : 0]));
    }
    teile.push(gruppen([0, "SEQEND"], [8, this.sicherLayer(layer)]));
    this.entitaeten.push(teile.join(""));
  }

  kreis(layer: string, x: number, y: number, r: number) {
    this.erweitere(x - r, y - r);
    this.erweitere(x + r, y + r);
    this.entitaeten.push(gruppen([0, "CIRCLE"], [8, this.sicherLayer(layer)], [10, x], [20, y], [30, 0], [40, r]));
  }

  /** Gefüllte Fläche aus 3 oder 4 Punkten (z. B. Freistellflächen hinter Text). */
  flaeche(layer: string, p: { x: number; y: number }[]) {
    const [a, b, c, d] = [p[0], p[1], p[2], p[3] ?? p[2]];
    // Reihenfolge der SOLID-Eckpunkte: 1-2-4-3
    this.entitaeten.push(
      gruppen([0, "SOLID"], [8, this.sicherLayer(layer)], [10, a.x], [20, a.y], [30, 0], [11, b.x], [21, b.y], [31, 0], [12, d.x], [22, d.y], [32, 0], [13, c.x], [23, c.y], [33, 0]),
    );
  }

  /**
   * Text. Mit `freistellen` wird dahinter eine Fläche in Hintergrundfarbe gelegt,
   * damit Linien den Text nicht kreuzen.
   */
  text(
    layer: string,
    x: number,
    y: number,
    hoehe: number,
    inhalt: string,
    optionen: { drehung?: number; ausrichtung?: TextAusrichtung; vertikalMitte?: boolean; freistellen?: boolean } = {},
  ) {
    const drehung = optionen.drehung ?? 0;
    const h = optionen.ausrichtung === "mitte" ? 1 : optionen.ausrichtung === "rechts" ? 2 : 0;
    const v = optionen.vertikalMitte ? 2 : 0;
    if (optionen.freistellen) this.freistellflaeche(x, y, hoehe, inhalt, drehung, h, v);
    this.erweitere(x, y);
    const g: [number, string | number][] = [
      [0, "TEXT"],
      [8, this.sicherLayer(layer)],
      [10, x],
      [20, y],
      [30, 0],
      [40, hoehe],
      [1, dxfText(inhalt)],
      [50, drehung],
      [7, "STANDARD"],
    ];
    if (h || v) g.push([72, h], [11, x], [21, y], [31, 0], [73, v]);
    this.entitaeten.push(gruppen(...g));
  }

  private freistellflaeche(x: number, y: number, hoehe: number, inhalt: string, drehung: number, h: number, v: number) {
    const breite = inhalt.length * hoehe * 0.72 + hoehe * 0.4;
    const rand = hoehe * 0.2;
    let x0 = h === 1 ? -breite / 2 : h === 2 ? -breite : 0;
    let y0 = v === 2 ? -hoehe / 2 : 0;
    x0 -= rand / 2;
    y0 -= rand;
    const hh = hoehe + 2 * rand;
    const w = drehung * (Math.PI / 180);
    const c = Math.cos(w);
    const s = Math.sin(w);
    const d = (dx: number, dy: number) => ({ x: x + dx * c - dy * s, y: y + dx * s + dy * c });
    this.flaeche("FREISTELLEN", [d(x0, y0), d(x0 + breite + rand, y0), d(x0 + breite + rand, y0 + hh), d(x0, y0 + hh)]);
  }

  toString(): string {
    if (!this.layer.has("FREISTELLEN")) this.layer.set("FREISTELLEN", { name: "FREISTELLEN", farbe: 255 });
    const ext = Number.isFinite(this.minX) ? [this.minX, this.minY, this.maxX, this.maxY] : [0, 0, 100, 100];
    const kopf = [
      gruppen([0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1009"], [9, "$DWGCODEPAGE"], [3, "ANSI_1252"], [9, "$INSUNITS"], [70, 6], [9, "$EXTMIN"], [10, ext[0]], [20, ext[1]], [30, 0], [9, "$EXTMAX"], [10, ext[2]], [20, ext[3]], [30, 0], [0, "ENDSEC"]),
      gruppen([0, "SECTION"], [2, "TABLES"]),
      gruppen([0, "TABLE"], [2, "LTYPE"], [70, 4]),
      ltype("CONTINUOUS", "Durchgezogen", []),
      ltype("DASHED", "Gestrichelt __ __ __", [0.5, -0.25]),
      ltype("DASHDOT", "Strichpunkt __ . __ .", [0.5, -0.25, 0, -0.25]),
      ltype("HIDDEN", "Verdeckt _ _ _", [0.25, -0.125]),
      gruppen([0, "ENDTAB"]),
      gruppen([0, "TABLE"], [2, "LAYER"], [70, this.layer.size]),
      ...[...this.layer.values()].map((l) =>
        gruppen([0, "LAYER"], [2, l.name], [70, 0], [62, l.farbe], [6, l.linientyp ?? "CONTINUOUS"]),
      ),
      gruppen([0, "ENDTAB"]),
      gruppen([0, "TABLE"], [2, "STYLE"], [70, 1], [0, "STYLE"], [2, "STANDARD"], [70, 0], [40, 0], [41, 1], [50, 0], [71, 0], [42, 2.5], [3, "txt"], [4, ""], [0, "ENDTAB"]),
      gruppen([0, "ENDSEC"]),
      gruppen([0, "SECTION"], [2, "ENTITIES"]),
    ];
    return kopf.join("") + this.entitaeten.join("") + gruppen([0, "ENDSEC"], [0, "EOF"]);
  }
}

function ltype(name: string, beschreibung: string, muster: number[]): string {
  const g: [number, string | number][] = [
    [0, "LTYPE"],
    [2, name],
    [70, 0],
    [3, beschreibung],
    [72, 65],
    [73, muster.length],
    [40, muster.reduce((s, x) => s + Math.abs(x), 0)],
  ];
  for (const m of muster) g.push([49, m]);
  return gruppen(...g);
}

function gruppen(...paare: [number, string | number][]): string {
  return paare.map(([code, wert]) => `${code}\r\n${typeof wert === "number" ? zahl(wert) : wert}\r\n`).join("");
}

function zahl(x: number): string {
  if (Number.isInteger(x)) return String(x);
  return Number(x.toFixed(6)).toString();
}

/** Layer-Namen: in R12 nur Großbuchstaben, Ziffern, _ - $. */
export function dxfName(name: string): string {
  return name
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .replace(/[^A-Z0-9_$-]/g, "_");
}

/**
 * Text für die DXF-Datei: Zeichen der Windows-Codepage 1252 (Umlaute, ß, °, ², €)
 * bleiben erhalten und werden beim Speichern mit `dxfBytes` kodiert; alle
 * anderen Zeichen werden als \\U+XXXX geschrieben.
 */
export function dxfText(s: string): string {
  return [...s]
    .map((c) => {
      const code = c.codePointAt(0)!;
      return code < 128 || CP1252.has(c) ? c : `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    })
    .join("")
    .replace(/\r?\n/g, " ");
}

// Windows-1252: 0xA0–0xFF entsprechen Latin-1, dazu die Sonderbelegung 0x80–0x9F
const CP1252_SONDER: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};
const CP1252 = new Set<string>([...Object.keys(CP1252_SONDER), ...Array.from({ length: 96 }, (_, i) => String.fromCharCode(0xa0 + i))]);

/** DXF-Text als Bytes in Windows-1252 (so erwartet es $DWGCODEPAGE ANSI_1252). */
export function dxfBytes(dxf: string): Uint8Array {
  const bytes = new Uint8Array(dxf.length);
  let n = 0;
  for (const c of dxf) {
    const code = c.codePointAt(0)!;
    bytes[n++] = code < 128 ? code : (CP1252_SONDER[c] ?? (code >= 0xa0 && code <= 0xff ? code : 0x3f));
  }
  return bytes.slice(0, n);
}
