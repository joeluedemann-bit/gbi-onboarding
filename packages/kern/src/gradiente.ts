/**
 * Gradiente (Höhenplan): Tangentenzug über Neigungswechselpunkte (NWP)
 * mit quadratischen Ausrundungen (Kuppen und Wannen).
 */

import type { Meldung } from "./trassierung";

export interface Neigungswechsel {
  /** Station des NWP in m */
  station: number;
  /** Höhe des NWP (Tangentenschnittpunkt) in m */
  hoehe: number;
  /** Ausrundungshalbmesser H in m (0 oder leer = keine Ausrundung) */
  H?: number;
}

export interface Ausrundung {
  /** Index des NWP */
  nwp: number;
  art: "kuppe" | "wanne";
  H: number;
  /** Tangentenlänge T = H/2 · |s2 − s1| */
  T: number;
  stationAnfang: number;
  stationEnde: number;
  /** Stich (größter Abstand zwischen Tangente und Ausrundung) f = T² / (2H) */
  f: number;
  /** Station und Höhe des Hoch- bzw. Tiefpunkts, falls er in der Ausrundung liegt */
  scheitel?: { station: number; hoehe: number };
}

export class Gradiente {
  readonly nwp: Neigungswechsel[];
  /** Tangentenneigungen zwischen den NWP (dimensionslos, 0.02 = 2 %) */
  readonly neigungen: number[];
  readonly ausrundungen: Ausrundung[];
  readonly meldungen: Meldung[] = [];

  constructor(nwp: Neigungswechsel[]) {
    if (nwp.length < 2) throw new Error("Die Gradiente braucht mindestens zwei Neigungswechselpunkte");
    this.nwp = [...nwp].sort((a, b) => a.station - b.station);
    for (let i = 1; i < this.nwp.length; i++) {
      if (this.nwp[i].station - this.nwp[i - 1].station < 1e-6) {
        throw new Error(`NWP ${i} und ${i + 1} haben dieselbe Station`);
      }
    }
    this.neigungen = this.nwp.slice(1).map((p, i) => (p.hoehe - this.nwp[i].hoehe) / (p.station - this.nwp[i].station));

    this.ausrundungen = [];
    for (let i = 1; i < this.nwp.length - 1; i++) {
      const H = this.nwp[i].H ?? 0;
      if (!(H > 0)) continue;
      const s1 = this.neigungen[i - 1];
      const s2 = this.neigungen[i];
      const ds = s2 - s1;
      if (Math.abs(ds) < 1e-12) continue;
      const T = (H * Math.abs(ds)) / 2;
      const stationAnfang = this.nwp[i].station - T;
      const stationEnde = this.nwp[i].station + T;
      const a: Ausrundung = {
        nwp: i,
        art: ds < 0 ? "kuppe" : "wanne",
        H,
        T,
        stationAnfang,
        stationEnde,
        f: (T * T) / (2 * H),
      };
      // Scheitel: Neigung 0 innerhalb der Ausrundung
      if (s1 * s2 < 0) {
        const x = (-s1 * 2 * T) / ds;
        const st = stationAnfang + x;
        a.scheitel = { station: st, hoehe: this.hoehe(st, [a]) };
      }
      this.ausrundungen.push(a);
    }

    // Überschneidungen und Lage prüfen
    for (let j = 0; j < this.ausrundungen.length; j++) {
      const a = this.ausrundungen[j];
      const vorher = j > 0 ? this.ausrundungen[j - 1].stationEnde : this.nwp[0].station;
      if (a.stationAnfang < vorher - 1e-6) {
        this.meldungen.push({
          ebene: "fehler",
          station: this.nwp[a.nwp].station,
          text:
            j > 0
              ? `Ausrundungen an NWP ${a.nwp} und ${a.nwp + 1} überschneiden sich (H verkleinern oder NWP verschieben)`
              : `Ausrundung an NWP ${a.nwp + 1} reicht vor den Gradientenanfang`,
        });
      }
    }
    const letzte = this.ausrundungen[this.ausrundungen.length - 1];
    if (letzte && letzte.stationEnde > this.nwp[this.nwp.length - 1].station + 1e-6) {
      this.meldungen.push({
        ebene: "fehler",
        station: this.nwp[letzte.nwp].station,
        text: `Ausrundung an NWP ${letzte.nwp + 1} reicht über das Gradientenende hinaus`,
      });
    }
  }

  get stationAnfang(): number {
    return this.nwp[0].station;
  }

  get stationEnde(): number {
    return this.nwp[this.nwp.length - 1].station;
  }

  /** Tangentenhöhe (ohne Ausrundung) an einer Station. */
  tangentenhoehe(station: number): number {
    const p = this.nwp;
    let i = 0;
    while (i < p.length - 2 && station > p[i + 1].station) i++;
    return p[i].hoehe + this.neigungen[i] * (station - p[i].station);
  }

  /** Gradientenhöhe an einer Station (inkl. Ausrundungen). */
  hoehe(station: number, ausrundungen: Ausrundung[] = this.ausrundungen): number {
    const z = this.tangentenhoehe(station);
    for (const a of ausrundungen) {
      if (station > a.stationAnfang && station < a.stationEnde) {
        // Parabel: Abweichung von der Tangente = x² / (2H), x ab dem nähergelegenen Tangentenpunkt
        const x = station < this.nwp[a.nwp].station ? station - a.stationAnfang : a.stationEnde - station;
        const y = (x * x) / (2 * a.H);
        return a.art === "kuppe" ? z - y : z + y;
      }
    }
    return z;
  }

  /** Längsneigung an einer Station (inkl. Ausrundungen). */
  neigung(station: number): number {
    for (const a of this.ausrundungen) {
      if (station > a.stationAnfang && station < a.stationEnde) {
        const s1 = this.neigungen[a.nwp - 1];
        const s2 = this.neigungen[a.nwp];
        return s1 + ((s2 - s1) * (station - a.stationAnfang)) / (2 * a.T);
      }
    }
    const p = this.nwp;
    let i = 0;
    while (i < p.length - 2 && station > p[i + 1].station) i++;
    return this.neigungen[i];
  }

  /** Punktfolge zur Darstellung. */
  polylinie(schritt = 5): { station: number; hoehe: number }[] {
    const stationen = new Set<number>();
    for (let s = this.stationAnfang; s < this.stationEnde; s += schritt) stationen.add(s);
    stationen.add(this.stationEnde);
    for (const a of this.ausrundungen) {
      stationen.add(a.stationAnfang);
      stationen.add(a.stationEnde);
      for (let k = 1; k < 20; k++) stationen.add(a.stationAnfang + (k / 20) * 2 * a.T);
    }
    return [...stationen]
      .filter((s) => s >= this.stationAnfang && s <= this.stationEnde)
      .sort((a, b) => a - b)
      .map((station) => ({ station, hoehe: this.hoehe(station) }));
  }
}

/** Ausrundungshalbmesser, der bei gegebener Tangentenlänge möglich ist. */
export function halbmesserFuerTangente(T: number, s1: number, s2: number): number {
  const ds = Math.abs(s2 - s1);
  return ds > 0 ? (2 * T) / ds : Infinity;
}
