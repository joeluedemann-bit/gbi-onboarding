/**
 * Achse als Folge von Trassierungselementen mit Stationierung.
 */

import {
  type Element,
  type Pose,
  kruemmungBei,
  poseImElement,
  radius,
  klothoidenParameter,
} from "./elemente";
import { normiereRichtung } from "./winkel";

export interface AchsDefinition {
  /** Anfangspunkt der Achse */
  start: { E: number; N: number };
  /** Anfangsrichtungswinkel in rad */
  richtung: number;
  /** Station am Achsanfang in m */
  stationAnfang: number;
  elemente: Element[];
}

export interface Achspunkt extends Pose {
  station: number;
  /** Krümmung in 1/m (> 0 = Rechtskurve) */
  k: number;
  elementIndex: number;
}

export interface Hauptpunkt {
  station: number;
  E: number;
  N: number;
  t: number;
  /** Übliche Kurzbezeichnung: AA, UA (Übergangsbogenanfang), BA, BE, UE, AE */
  bezeichnung: string;
}

export interface Stationierung {
  station: number;
  /** Abstand senkrecht zur Achse, > 0 rechts der Achse */
  versatz: number;
  /** Lotfußpunkt liegt innerhalb der Achse */
  innerhalb: boolean;
}

interface Abschnitt {
  element: Element;
  stationAnfang: number;
  poseAnfang: Pose;
}

export class Achse {
  readonly definition: AchsDefinition;
  private readonly abschnitte: Abschnitt[];
  readonly laenge: number;

  constructor(definition: AchsDefinition) {
    this.definition = definition;
    this.abschnitte = [];
    let pose: Pose = { E: definition.start.E, N: definition.start.N, t: normiereRichtung(definition.richtung) };
    let station = definition.stationAnfang;
    for (const element of definition.elemente) {
      if (!(element.laenge >= 0)) throw new Error("Elementlänge muss ≥ 0 sein");
      this.abschnitte.push({ element, stationAnfang: station, poseAnfang: pose });
      pose = poseImElement(element, pose, element.laenge);
      station += element.laenge;
    }
    this.laenge = station - definition.stationAnfang;
  }

  get stationAnfang(): number {
    return this.definition.stationAnfang;
  }

  get stationEnde(): number {
    return this.definition.stationAnfang + this.laenge;
  }

  get elemente(): readonly Element[] {
    return this.definition.elemente;
  }

  /** Stationen der Elementanfänge (Index wie `elemente`). */
  elementStationen(): number[] {
    return this.abschnitte.map((a) => a.stationAnfang);
  }

  private abschnittIndex(station: number): number {
    const a = this.abschnitte;
    if (a.length === 0) return -1;
    let lo = 0;
    let hi = a.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (a[mid].stationAnfang <= station) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Pose an einer Station (wird auf den Achsbereich begrenzt). */
  pose(station: number): Achspunkt {
    if (this.abschnitte.length === 0) {
      const d = this.definition;
      return { E: d.start.E, N: d.start.N, t: d.richtung, station: d.stationAnfang, k: 0, elementIndex: -1 };
    }
    const st = Math.min(Math.max(station, this.stationAnfang), this.stationEnde);
    const i = this.abschnittIndex(st);
    const ab = this.abschnitte[i];
    const s = Math.min(st - ab.stationAnfang, ab.element.laenge);
    const p = poseImElement(ab.element, ab.poseAnfang, s);
    return { ...p, station: st, k: kruemmungBei(ab.element, s), elementIndex: i };
  }

  /** Punkt an Station mit seitlichem Versatz (> 0 rechts der Achse). */
  punkt(station: number, versatz = 0): { E: number; N: number } {
    const p = this.pose(station);
    return { E: p.E + versatz * Math.cos(p.t), N: p.N - versatz * Math.sin(p.t) };
  }

  hauptpunkte(): Hauptpunkt[] {
    const ergebnis: Hauptpunkt[] = [];
    const n = this.abschnitte.length;
    for (let i = 0; i <= n; i++) {
      const station = i < n ? this.abschnitte[i].stationAnfang : this.stationEnde;
      const p = this.pose(station);
      const vor = i > 0 ? this.abschnitte[i - 1].element : undefined;
      const nach = i < n ? this.abschnitte[i].element : undefined;
      ergebnis.push({ station, E: p.E, N: p.N, t: p.t, bezeichnung: hauptpunktBezeichnung(vor, nach) });
    }
    return ergebnis;
  }

  /**
   * Punktfolge zur Darstellung. Enthält alle Hauptpunkte; in gekrümmten
   * Bereichen wird so verdichtet, dass die Pfeilhöhe unter `toleranz` bleibt.
   */
  polylinie(maxSchritt = 10, toleranz = 0.02): Achspunkt[] {
    const punkte: Achspunkt[] = [];
    this.abschnitte.forEach((ab, i) => {
      const e = ab.element;
      const kMax = Math.max(Math.abs(e.kAnfang), Math.abs(e.kEnde));
      // Pfeilhöhe f ≈ s² k / 8  →  s = sqrt(8 f / k)
      const schrittKurve = kMax > 0 ? Math.sqrt((8 * toleranz) / kMax) : Infinity;
      const schritt = Math.max(0.5, Math.min(maxSchritt, schrittKurve));
      const anzahl = e.typ === "gerade" ? 1 : Math.max(1, Math.ceil(e.laenge / schritt));
      for (let j = 0; j < anzahl; j++) {
        const s = (e.laenge * j) / anzahl;
        const p = poseImElement(e, ab.poseAnfang, s);
        punkte.push({ ...p, station: ab.stationAnfang + s, k: kruemmungBei(e, s), elementIndex: i });
      }
    });
    if (this.abschnitte.length > 0) punkte.push(this.pose(this.stationEnde));
    return punkte;
  }

  /** Stationen in festem Raster (z. B. alle 20 m), jeweils inkl. Anfang und Ende. */
  rasterStationen(intervall: number): number[] {
    const stationen: number[] = [this.stationAnfang];
    let s = Math.ceil(this.stationAnfang / intervall + 1e-9) * intervall;
    while (s < this.stationEnde - 1e-9) {
      stationen.push(s);
      s += intervall;
    }
    if (this.laenge > 0) stationen.push(this.stationEnde);
    return stationen;
  }

  /** Station und Versatz eines beliebigen Punktes (Lotfußpunkt auf die Achse). */
  stationieren(E: number, N: number): Stationierung {
    const abstand2 = (st: number) => {
      const p = this.pose(st);
      return (p.E - E) ** 2 + (p.N - N) ** 2;
    };
    // Grobsuche im Raster, dann Feinsuche per Goldenem Schnitt
    const schritt = Math.max(0.5, Math.min(5, this.laenge / 200));
    let bestS = this.stationAnfang;
    let bestD = Infinity;
    for (let s = this.stationAnfang; s <= this.stationEnde + 1e-9; s += schritt) {
      const d = abstand2(Math.min(s, this.stationEnde));
      if (d < bestD) {
        bestD = d;
        bestS = Math.min(s, this.stationEnde);
      }
    }
    let a = Math.max(this.stationAnfang, bestS - schritt);
    let b = Math.min(this.stationEnde, bestS + schritt);
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a);
    let d = a + g * (b - a);
    let fc = abstand2(c);
    let fd = abstand2(d);
    for (let i = 0; i < 80 && b - a > 1e-10; i++) {
      if (fc < fd) {
        b = d;
        d = c;
        fd = fc;
        c = b - g * (b - a);
        fc = abstand2(c);
      } else {
        a = c;
        c = d;
        fc = fd;
        d = a + g * (b - a);
        fd = abstand2(d);
      }
    }
    const station = (a + b) / 2;
    const p = this.pose(station);
    const dE = E - p.E;
    const dN = N - p.N;
    const laengs = dE * Math.sin(p.t) + dN * Math.cos(p.t);
    const versatz = dE * Math.cos(p.t) - dN * Math.sin(p.t);
    const tol = 1e-6;
    const innerhalb =
      (station > this.stationAnfang + tol || laengs >= -tol) && (station < this.stationEnde - tol || laengs <= tol);
    return { station, versatz, innerhalb };
  }
}

function hauptpunktBezeichnung(vor?: Element, nach?: Element): string {
  if (!vor) return "AA";
  if (!nach) return "AE";
  if (nach.typ === "klothoide" && vor.typ === "gerade") return "UA";
  if (nach.typ === "kreisbogen") return vor.typ === "kreisbogen" ? "KW" : "BA";
  if (vor.typ === "kreisbogen") return "BE";
  if (vor.typ === "klothoide" && nach.typ === "gerade") return "UE";
  if (vor.typ === "klothoide" && nach.typ === "klothoide") return "WP";
  return "HP";
}

/** Tabellarische Elementbeschreibung (z. B. für Berichte und die KI). */
export function elementTabelle(achse: Achse) {
  const stationen = achse.elementStationen();
  return achse.elemente.map((e, i) => ({
    nr: i + 1,
    typ: e.typ,
    stationAnfang: stationen[i],
    laenge: e.laenge,
    radiusAnfang: radius(e.kAnfang),
    radiusEnde: radius(e.kEnde),
    A: klothoidenParameter(e),
  }));
}
