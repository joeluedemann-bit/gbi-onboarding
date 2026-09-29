/**
 * Winkel- und Richtungskonventionen.
 *
 * Der Kern arbeitet im geodätischen System:
 *  - Koordinaten als Rechtswert E (Ost) und Hochwert N (Nord), Einheit Meter
 *  - Richtungswinkel t im Bogenmaß, von Gitternord im Uhrzeigersinn gezählt
 *  - Krümmung k > 0 bedeutet Rechtskurve (in Stationierungsrichtung), k < 0 Linkskurve
 *
 * Für Ein- und Ausgaben an der Oberfläche wird üblicherweise gon verwendet.
 */

export const VOLLKREIS = 2 * Math.PI;
const GON_IN_RAD = Math.PI / 200;

export function gonZuRad(gon: number): number {
  return gon * GON_IN_RAD;
}

export function radZuGon(rad: number): number {
  return rad / GON_IN_RAD;
}

/** Normiert einen Richtungswinkel auf [0, 2π). */
export function normiereRichtung(t: number): number {
  const r = t % VOLLKREIS;
  return r < 0 ? r + VOLLKREIS : r;
}

/** Normiert eine Winkeldifferenz auf (-π, π]. */
export function normiereDifferenz(d: number): number {
  let r = normiereRichtung(d);
  if (r > Math.PI) r -= VOLLKREIS;
  return r;
}

/** Richtungswinkel von (E1, N1) nach (E2, N2). */
export function richtungswinkel(dE: number, dN: number): number {
  return normiereRichtung(Math.atan2(dE, dN));
}

export function strecke(dE: number, dN: number): number {
  return Math.hypot(dE, dN);
}
