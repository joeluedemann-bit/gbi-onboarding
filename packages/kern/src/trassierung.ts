/**
 * Trassierung über ein Tangentenpolygon.
 *
 * An jedem inneren Polygonpunkt (Tangentenschnittpunkt, TS) wird die Folge
 * Klothoide – Kreisbogen – Klothoide eingerechnet (auch unsymmetrisch, A1 ≠ A2,
 * oder ohne Klothoiden mit A = 0). Die Geraden dazwischen ergeben sich aus den
 * Tangentenlängen.
 */

import { Achse, type AchsDefinition } from "./achse";
import { type Element, gerade, klothoide, kreisbogen, poseImElement } from "./elemente";
import { normiereDifferenz, richtungswinkel, strecke } from "./winkel";

export interface PolygonPunkt {
  E: number;
  N: number;
  /** Kreisbogenradius (Betrag, m) – nur an inneren Punkten */
  R?: number;
  /** Klothoidenparameter vor dem Bogen (0 = keine Klothoide) */
  A1?: number;
  /** Klothoidenparameter nach dem Bogen (0 = keine Klothoide) */
  A2?: number;
}

export type MeldungsEbene = "fehler" | "warnung" | "hinweis";

export interface Meldung {
  ebene: MeldungsEbene;
  text: string;
  /** Index des Polygonpunkts, falls zuordenbar */
  punkt?: number;
  station?: number;
}

export interface BogenGeometrie {
  /** Ablenkwinkel (rad, > 0 Rechtskurve) */
  gamma: number;
  R: number;
  A1: number;
  A2: number;
  L1: number;
  L2: number;
  /** Kreisbogenlänge */
  LBogen: number;
  /** Mittelpunktswinkel des Kreisbogens (rad) */
  alpha: number;
  /** Tangentenlänge vom Klothoidenanfang bis zum TS */
  T1: number;
  /** Tangentenlänge vom TS bis zum Klothoidenende */
  T2: number;
}

export interface BogenInfo extends BogenGeometrie {
  punkt: number;
  stationAnfang: number;
  stationEnde: number;
}

export interface TrassierungsErgebnis {
  definition: AchsDefinition;
  achse: Achse;
  boegen: BogenInfo[];
  /** Länge der Zwischengeraden je Polygonseite (i → i+1) */
  zwischengeraden: number[];
  meldungen: Meldung[];
}

/** Endpunkt einer Klothoide (Gerade → Radius R) im lokalen Tangentensystem. */
function klothoidenEndpunkt(L: number, R: number): { X: number; Y: number } {
  if (L <= 0) return { X: 0, Y: 0 };
  const p = poseImElement(klothoide(L, Infinity, R), { E: 0, N: 0, t: 0 }, L);
  return { X: p.N, Y: p.E };
}

/**
 * Geometrie eines Bogens Klothoide – Kreis – Klothoide für einen Ablenkwinkel.
 * Gibt `null` zurück, wenn der Bogen geometrisch nicht möglich ist
 * (Klothoiden zu lang für den Ablenkwinkel).
 */
export function bogenGeometrie(gamma: number, R: number, A1 = 0, A2 = 0): BogenGeometrie | null {
  const g = Math.abs(gamma);
  if (!(R > 0) || g < 1e-9 || g >= Math.PI - 1e-9) return null;
  const L1 = A1 > 0 ? (A1 * A1) / R : 0;
  const L2 = A2 > 0 ? (A2 * A2) / R : 0;
  const tau1 = L1 / (2 * R);
  const tau2 = L2 / (2 * R);
  const alpha = g - tau1 - tau2;
  if (alpha < -1e-12) return null;

  const k1 = klothoidenEndpunkt(L1, R);
  const k2 = klothoidenEndpunkt(L2, R);
  const dR1 = k1.Y - R * (1 - Math.cos(tau1));
  const dR2 = k2.Y - R * (1 - Math.cos(tau2));
  const Xm1 = k1.X - R * Math.sin(tau1);
  const Xm2 = k2.X - R * Math.sin(tau2);
  const p1 = R + dR1;
  const p2 = R + dR2;
  const sg = Math.sin(g);
  const cg = Math.cos(g);
  const T1 = Xm1 + (p2 - p1 * cg) / sg;
  const T2 = Xm2 + (p1 - p2 * cg) / sg;
  return { gamma, R, A1, A2, L1, L2, LBogen: Math.max(0, alpha) * R, alpha: Math.max(0, alpha), T1, T2 };
}

/** Ablenkwinkel am inneren Polygonpunkt i (rad, > 0 = Rechtskurve). */
export function ablenkwinkel(punkte: PolygonPunkt[], i: number): number {
  const a = punkte[i - 1];
  const b = punkte[i];
  const c = punkte[i + 1];
  const tEin = richtungswinkel(b.E - a.E, b.N - a.N);
  const tAus = richtungswinkel(c.E - b.E, c.N - b.N);
  return normiereDifferenz(tAus - tEin);
}

export function trassiereTangentenpolygon(punkte: PolygonPunkt[], stationAnfang = 0): TrassierungsErgebnis {
  if (punkte.length < 2) throw new Error("Das Tangentenpolygon braucht mindestens zwei Punkte");
  const meldungen: Meldung[] = [];
  const n = punkte.length;
  const seiten = punkte.slice(1).map((p, i) => strecke(p.E - punkte[i].E, p.N - punkte[i].N));
  seiten.forEach((s, i) => {
    if (s < 1e-6) throw new Error(`Polygonpunkte ${i + 1} und ${i + 2} fallen zusammen`);
  });

  // Bogengeometrie je innerem Punkt
  const geometrien: (BogenGeometrie | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n - 1; i++) {
    const p = punkte[i];
    const gamma = ablenkwinkel(punkte, i);
    if (Math.abs(gamma) < 1e-9) {
      meldungen.push({ ebene: "hinweis", punkt: i, text: `Punkt ${i + 1}: keine Richtungsänderung, kein Bogen nötig` });
      continue;
    }
    if (!(p.R && p.R > 0)) {
      meldungen.push({ ebene: "fehler", punkt: i, text: `Punkt ${i + 1}: kein Radius angegeben` });
      continue;
    }
    let A1 = p.A1 ?? 0;
    let A2 = p.A2 ?? 0;
    let geo = bogenGeometrie(gamma, p.R, A1, A2);
    if (!geo) {
      // Klothoiden so weit verkürzen, dass ein Kreisbogen übrig bleibt
      const tauSumme = ((A1 * A1 + A2 * A2) / (p.R * p.R)) / 2;
      const faktor = Math.sqrt((0.8 * Math.abs(gamma)) / tauSumme);
      A1 *= faktor;
      A2 *= faktor;
      geo = bogenGeometrie(gamma, p.R, A1, A2);
      meldungen.push({
        ebene: "fehler",
        punkt: i,
        text: `Punkt ${i + 1}: Klothoiden zu lang für den Ablenkwinkel – A auf ${A1.toFixed(1)} / ${A2.toFixed(1)} reduziert`,
      });
    }
    geometrien[i] = geo;
  }

  // Zwischengeraden
  const zwischengeraden = seiten.map((s, i) => {
    const tAus = geometrien[i]?.T2 ?? 0;
    const tEin = geometrien[i + 1]?.T1 ?? 0;
    const rest = s - tAus - tEin;
    if (rest < -1e-6) {
      meldungen.push({
        ebene: "fehler",
        punkt: i,
        text: `Polygonseite ${i + 1}–${i + 2}: Bögen überschneiden sich um ${(-rest).toFixed(2)} m (Radius oder A verkleinern)`,
      });
    }
    return rest;
  });

  // Elementfolge aufbauen
  const elemente: Element[] = [];
  const boegen: BogenInfo[] = [];
  let station = stationAnfang;
  const hinzu = (e: Element) => {
    if (e.laenge > 1e-9) {
      elemente.push(e);
      station += e.laenge;
    }
  };
  for (let i = 0; i < n - 1; i++) {
    hinzu(gerade(Math.max(0, zwischengeraden[i])));
    const geo = geometrien[i + 1];
    if (geo) {
      const vz = Math.sign(geo.gamma);
      const R = vz * geo.R;
      const anfang = station;
      if (geo.L1 > 0) hinzu(klothoide(geo.L1, Infinity, R));
      if (geo.LBogen > 0) hinzu(kreisbogen(R, geo.LBogen));
      if (geo.L2 > 0) hinzu(klothoide(geo.L2, R, Infinity));
      boegen.push({ ...geo, punkt: i + 1, stationAnfang: anfang, stationEnde: station });
    }
  }

  const definition: AchsDefinition = {
    start: { E: punkte[0].E, N: punkte[0].N },
    richtung: richtungswinkel(punkte[1].E - punkte[0].E, punkte[1].N - punkte[0].N),
    stationAnfang,
    elemente,
  };
  return { definition, achse: new Achse(definition), boegen, zwischengeraden, meldungen };
}
