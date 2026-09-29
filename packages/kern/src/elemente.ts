/**
 * Trassierungselemente der Achse: Gerade, Kreisbogen, Klothoide.
 *
 * Alle drei Elemente werden einheitlich über einen linearen Krümmungsverlauf
 * beschrieben (k(s) = kAnfang + (kEnde - kAnfang) * s / L). Damit lassen sich
 * auch Ei-Klothoiden (Übergang zwischen zwei Radien) ohne Sonderfall abbilden.
 */

import { normiereRichtung } from "./winkel";

export type ElementTyp = "gerade" | "kreisbogen" | "klothoide";

export interface Element {
  typ: ElementTyp;
  /** Elementlänge in m */
  laenge: number;
  /** Krümmung am Elementanfang in 1/m (> 0 = Rechtskurve) */
  kAnfang: number;
  /** Krümmung am Elementende in 1/m (> 0 = Rechtskurve) */
  kEnde: number;
}

/** Lage eines Punktes auf der Achse: Koordinaten und Richtungswinkel (rad). */
export interface Pose {
  E: number;
  N: number;
  t: number;
}

export function gerade(laenge: number): Element {
  return { typ: "gerade", laenge, kAnfang: 0, kEnde: 0 };
}

/** Kreisbogen mit Radius R (> 0 Rechtskurve, < 0 Linkskurve). */
export function kreisbogen(R: number, laenge: number): Element {
  if (!Number.isFinite(R) || R === 0) throw new Error("Kreisbogen benötigt einen endlichen Radius ≠ 0");
  return { typ: "kreisbogen", laenge, kAnfang: 1 / R, kEnde: 1 / R };
}

/**
 * Klothoide von Radius rAnfang nach rEnde (Infinity für die Gerade).
 * Vorzeichen der Radien wie beim Kreisbogen.
 */
export function klothoide(laenge: number, rAnfang: number, rEnde: number): Element {
  return { typ: "klothoide", laenge, kAnfang: kruemmung(rAnfang), kEnde: kruemmung(rEnde) };
}

/** Klothoide über Parameter A statt Länge: L = A² · |kEnde − kAnfang|. */
export function klothoideAusParameter(A: number, rAnfang: number, rEnde: number): Element {
  const dk = Math.abs(kruemmung(rEnde) - kruemmung(rAnfang));
  if (dk === 0) throw new Error("Klothoide benötigt unterschiedliche Anfangs- und Endradien");
  return klothoide(A * A * dk, rAnfang, rEnde);
}

export function kruemmung(R: number): number {
  return Number.isFinite(R) && R !== 0 ? 1 / R : 0;
}

export function radius(k: number): number {
  return k === 0 ? Infinity : 1 / k;
}

/** Klothoidenparameter A (nur für Klothoiden sinnvoll, sonst NaN). */
export function klothoidenParameter(e: Element): number {
  const dk = Math.abs(e.kEnde - e.kAnfang);
  if (e.typ !== "klothoide" || dk === 0) return NaN;
  return Math.sqrt(e.laenge / dk);
}

/** Krümmung an der Stelle s (0 ≤ s ≤ L) innerhalb des Elements. */
export function kruemmungBei(e: Element, s: number): number {
  if (e.laenge <= 0) return e.kAnfang;
  return e.kAnfang + ((e.kEnde - e.kAnfang) * s) / e.laenge;
}

/** Richtungsänderung vom Elementanfang bis zur Stelle s. */
export function richtungsaenderung(e: Element, s: number): number {
  const c = e.laenge > 0 ? (e.kEnde - e.kAnfang) / (2 * e.laenge) : 0;
  return e.kAnfang * s + c * s * s;
}

/** Knoten und Gewichte der Gauß-Legendre-Quadratur auf [-1, 1] (Newton-Iteration). */
function gaussLegendre(n: number): { knoten: number[]; gewichte: number[] } {
  const knoten: number[] = [];
  const gewichte: number[] = [];
  for (let i = 1; i <= n; i++) {
    let x = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 1;
    for (let iter = 0; iter < 100; iter++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    knoten.push(x);
    gewichte.push(2 / ((1 - x * x) * dp * dp));
  }
  return { knoten, gewichte };
}

const { knoten: GL_KNOTEN, gewichte: GL_GEWICHTE } = gaussLegendre(8);

/**
 * Pose an der Stelle s eines Elements, ausgehend von der Anfangspose.
 * Gerade und Kreisbogen werden geschlossen berechnet, Klothoiden numerisch
 * (abschnittsweise Gauß-Legendre, Genauigkeit deutlich unter 1e-9 m).
 */
export function poseImElement(e: Element, start: Pose, s: number): Pose {
  const t0 = start.t;
  const dk = e.kEnde - e.kAnfang;

  if (dk === 0 && e.kAnfang === 0) {
    return { E: start.E + s * Math.sin(t0), N: start.N + s * Math.cos(t0), t: t0 };
  }

  if (dk === 0) {
    const k = e.kAnfang;
    const t = t0 + k * s;
    return {
      E: start.E + (Math.cos(t0) - Math.cos(t)) / k,
      N: start.N + (Math.sin(t) - Math.sin(t0)) / k,
      t: normiereRichtung(t),
    };
  }

  const dtGesamt = Math.abs(richtungsaenderung(e, s));
  const abschnitte = Math.max(1, Math.ceil(s / 10), Math.ceil(dtGesamt / 0.05));
  const h = s / abschnitte;
  let dE = 0;
  let dN = 0;
  for (let i = 0; i < abschnitte; i++) {
    const a = i * h;
    for (let j = 0; j < GL_KNOTEN.length; j++) {
      const u = a + (h / 2) * (GL_KNOTEN[j] + 1);
      const t = t0 + richtungsaenderung(e, u);
      const w = (h / 2) * GL_GEWICHTE[j];
      dE += w * Math.sin(t);
      dN += w * Math.cos(t);
    }
  }
  return { E: start.E + dE, N: start.N + dN, t: normiereRichtung(t0 + richtungsaenderung(e, s)) };
}

export function elementBezeichnung(e: Element): string {
  switch (e.typ) {
    case "gerade":
      return "Gerade";
    case "kreisbogen":
      return e.kAnfang > 0 ? "Kreisbogen (rechts)" : "Kreisbogen (links)";
    case "klothoide":
      return (e.kAnfang + e.kEnde > 0 ? "Klothoide (rechts)" : "Klothoide (links)");
  }
}
