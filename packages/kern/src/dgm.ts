/**
 * Digitales Geländemodell als Dreiecksvermaschung (Delaunay, Bowyer-Watson)
 * mit Rasterindex für schnelle Höhenabfragen.
 */

export interface Gelaendepunkt {
  E: number;
  N: number;
  H: number;
}

export type Dreieck = [number, number, number];

export class DGM {
  readonly punkte: Gelaendepunkt[];
  readonly dreiecke: Dreieck[];
  readonly grenzen: { minE: number; minN: number; maxE: number; maxN: number; minH: number; maxH: number };
  private readonly zellGroesse: number;
  private readonly spalten: number;
  private readonly zeilen: number;
  private readonly index: number[][];

  constructor(punkte: Gelaendepunkt[]) {
    this.punkte = entferneDoppelte(punkte);
    if (this.punkte.length < 3) throw new Error("Das DGM braucht mindestens drei unterschiedliche Punkte");
    this.dreiecke = delaunay(this.punkte);

    let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity, minH = Infinity, maxH = -Infinity;
    for (const p of this.punkte) {
      minE = Math.min(minE, p.E); maxE = Math.max(maxE, p.E);
      minN = Math.min(minN, p.N); maxN = Math.max(maxN, p.N);
      minH = Math.min(minH, p.H); maxH = Math.max(maxH, p.H);
    }
    this.grenzen = { minE, minN, maxE, maxN, minH, maxH };

    const flaeche = Math.max((maxE - minE) * (maxN - minN), 1);
    this.zellGroesse = Math.max(Math.sqrt(flaeche / Math.max(this.dreiecke.length, 1)) * 2, 1e-3);
    this.spalten = Math.max(1, Math.ceil((maxE - minE) / this.zellGroesse) + 1);
    this.zeilen = Math.max(1, Math.ceil((maxN - minN) / this.zellGroesse) + 1);
    this.index = Array.from({ length: this.spalten * this.zeilen }, () => []);
    this.dreiecke.forEach((d, i) => {
      const [a, b, c] = d.map((j) => this.punkte[j]);
      const c0 = this.zelle(Math.min(a.E, b.E, c.E), Math.min(a.N, b.N, c.N));
      const c1 = this.zelle(Math.max(a.E, b.E, c.E), Math.max(a.N, b.N, c.N));
      for (let x = c0[0]; x <= c1[0]; x++) for (let y = c0[1]; y <= c1[1]; y++) this.index[y * this.spalten + x].push(i);
    });
  }

  private zelle(E: number, N: number): [number, number] {
    const x = Math.min(this.spalten - 1, Math.max(0, Math.floor((E - this.grenzen.minE) / this.zellGroesse)));
    const y = Math.min(this.zeilen - 1, Math.max(0, Math.floor((N - this.grenzen.minN) / this.zellGroesse)));
    return [x, y];
  }

  /** Geländehöhe an (E, N) durch lineare Interpolation im Dreieck; null außerhalb des DGM. */
  hoehe(E: number, N: number): number | null {
    const g = this.grenzen;
    if (E < g.minE || E > g.maxE || N < g.minN || N > g.maxN) return null;
    const [x, y] = this.zelle(E, N);
    for (const i of this.index[y * this.spalten + x]) {
      const [a, b, c] = this.dreiecke[i].map((j) => this.punkte[j]);
      const det = (b.N - c.N) * (a.E - c.E) + (c.E - b.E) * (a.N - c.N);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((b.N - c.N) * (E - c.E) + (c.E - b.E) * (N - c.N)) / det;
      const l2 = ((c.N - a.N) * (E - c.E) + (a.E - c.E) * (N - c.N)) / det;
      const l3 = 1 - l1 - l2;
      const eps = -1e-9;
      if (l1 >= eps && l2 >= eps && l3 >= eps) return l1 * a.H + l2 * b.H + l3 * c.H;
    }
    return null;
  }
}

function entferneDoppelte(punkte: Gelaendepunkt[]): Gelaendepunkt[] {
  const gesehen = new Set<string>();
  const ergebnis: Gelaendepunkt[] = [];
  for (const p of punkte) {
    if (![p.E, p.N, p.H].every(Number.isFinite)) continue;
    const key = `${p.E.toFixed(4)}|${p.N.toFixed(4)}`;
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    ergebnis.push(p);
  }
  return ergebnis;
}

/** Delaunay-Triangulation nach Bowyer-Watson (lokal verschoben für numerische Stabilität). */
function delaunay(punkte: Gelaendepunkt[]): Dreieck[] {
  const n = punkte.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of punkte) {
    minX = Math.min(minX, p.E); maxX = Math.max(maxX, p.E);
    minY = Math.min(minY, p.N); maxY = Math.max(maxY, p.N);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const xs = punkte.map((p) => p.E - cx);
  const ys = punkte.map((p) => p.N - cy);
  const d = Math.max(maxX - minX, maxY - minY, 1) * 20;
  xs.push(-d, 0, d);
  ys.push(-d, d, -d);

  interface Tri { a: number; b: number; c: number; ux: number; uy: number; r2: number }
  const umkreis = (a: number, b: number, c: number): Tri => {
    const ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b], qx = xs[c], qy = ys[c];
    const D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = qx * qx + qy * qy;
    const ux = (a2 * (by - qy) + b2 * (qy - ay) + c2 * (ay - by)) / D;
    const uy = (a2 * (qx - bx) + b2 * (ax - qx) + c2 * (bx - ax)) / D;
    return { a, b, c, ux, uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };

  let dreiecke: Tri[] = [umkreis(n, n + 1, n + 2)];
  // Zufällige Einfügereihenfolge verbessert die Laufzeit bei geordneten Messdaten
  const reihenfolge = [...Array(n).keys()].sort((i, j) => ((i * 2654435761) % 4294967296) - ((j * 2654435761) % 4294967296));
  for (const i of reihenfolge) {
    const px = xs[i], py = ys[i];
    const schlecht: Tri[] = [];
    const gut: Tri[] = [];
    for (const t of dreiecke) {
      if ((px - t.ux) ** 2 + (py - t.uy) ** 2 < t.r2 * (1 + 1e-12)) schlecht.push(t);
      else gut.push(t);
    }
    const kanten = new Map<string, [number, number]>();
    for (const t of schlecht) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        if (kanten.has(key)) kanten.delete(key);
        else kanten.set(key, [u, v]);
      }
    }
    for (const [u, v] of kanten.values()) {
      const t = umkreis(u, v, i);
      if (Number.isFinite(t.r2)) gut.push(t);
    }
    dreiecke = gut;
  }
  return dreiecke.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c] as Dreieck);
}

/** Geländeschnitt entlang einer Punktfolge (z. B. der Achse). */
export function gelaendeschnitt(
  dgm: DGM,
  punkte: { station: number; E: number; N: number }[],
): { station: number; hoehe: number }[] {
  const ergebnis: { station: number; hoehe: number }[] = [];
  for (const p of punkte) {
    const h = dgm.hoehe(p.E, p.N);
    if (h !== null) ergebnis.push({ station: p.station, hoehe: h });
  }
  return ergebnis;
}
