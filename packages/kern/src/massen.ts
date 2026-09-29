/**
 * Überschlägige Erdmassenermittlung aus Gradiente und Geländeschnitt.
 *
 * Vereinfachtes Trapezprofil: Kronenbreite b, Böschungsneigung 1:n, ebenes
 * Gelände quer zur Achse. Für Variantenvergleiche und die Entwurfsautomatik
 * gedacht – nicht für die Abrechnung (dafür: Querprofile nach REB).
 */

import type { Gradiente } from "./gradiente";

export interface MassenOptionen {
  /** Kronenbreite in m */
  kronenbreite?: number;
  /** Böschungsneigung 1:n */
  boeschung?: number;
}

export interface Massenergebnis {
  /** Auftrag (Damm) in m³ */
  auftrag: number;
  /** Abtrag (Einschnitt) in m³ */
  abtrag: number;
  /** Auftrag − Abtrag */
  bilanz: number;
  /** Größte Dammhöhe bzw. Einschnittstiefe in m */
  maxDamm: number;
  maxEinschnitt: number;
  profile: { station: number; differenz: number; flaeche: number }[];
}

export function schaetzeErdmassen(
  gradiente: Gradiente,
  gelaende: { station: number; hoehe: number }[],
  optionen: MassenOptionen = {},
): Massenergebnis {
  const b = optionen.kronenbreite ?? 11;
  const n = optionen.boeschung ?? 1.5;
  const profile = gelaende
    .filter((p) => p.station >= gradiente.stationAnfang - 1e-6 && p.station <= gradiente.stationEnde + 1e-6)
    .map((p) => {
      const differenz = gradiente.hoehe(p.station) - p.hoehe;
      const h = Math.abs(differenz);
      return { station: p.station, differenz, flaeche: h * (b + n * h) };
    });
  let auftrag = 0;
  let abtrag = 0;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const c = profile[i];
    const dx = c.station - a.station;
    const vA = Math.sign(a.differenz) * a.flaeche;
    const vC = Math.sign(c.differenz) * c.flaeche;
    // Mittelflächenverfahren, bei Vorzeichenwechsel am Nulldurchgang geteilt
    if (vA * vC >= 0) {
      const v = ((vA + vC) / 2) * dx;
      if (v > 0) auftrag += v;
      else abtrag -= v;
    } else {
      const x0 = (a.differenz / (a.differenz - c.differenz)) * dx;
      const t1 = (vA / 2) * x0;
      const t2 = (vC / 2) * (dx - x0);
      for (const v of [t1, t2]) {
        if (v > 0) auftrag += v;
        else abtrag -= v;
      }
    }
  }
  const diffs = profile.map((p) => p.differenz);
  return {
    auftrag,
    abtrag,
    bilanz: auftrag - abtrag,
    maxDamm: Math.max(0, ...diffs),
    maxEinschnitt: Math.max(0, ...diffs.map((d) => -d)),
    profile,
  };
}
