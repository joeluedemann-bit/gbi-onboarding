/**
 * Beispielprojekt mit synthetischem Gelände für Demonstration und Tests.
 */

import type { Gelaendepunkt } from "./dgm";
import { type Projekt, leeresProjekt } from "./projekt";

/** Ursprung im Bereich UTM Zone 32 (nur als realistische Größenordnung) */
export const BEISPIEL_URSPRUNG = { E: 412000, N: 5712000 };

export function beispielGelaende(abstand = 40): Gelaendepunkt[] {
  const punkte: Gelaendepunkt[] = [];
  for (let x = 0; x <= 2400; x += abstand) {
    for (let y = 0; y <= 1400; y += abstand) {
      const H =
        140 +
        22 * Math.sin(x / 380) +
        14 * Math.cos(y / 260) +
        9 * Math.sin((x + 2 * y) / 210) +
        0.012 * x;
      punkte.push({ E: BEISPIEL_URSPRUNG.E + x, N: BEISPIEL_URSPRUNG.N + y, H: Math.round(H * 1000) / 1000 });
    }
  }
  return punkte;
}

export function beispielProjekt(): Projekt {
  const o = BEISPIEL_URSPRUNG;
  const p = leeresProjekt("Beispiel: Ortsumgehung");
  p.ekl = "EKL3";
  p.achse = {
    modus: "polygon",
    polygon: [
      { E: o.E + 100, N: o.N + 250 },
      { E: o.E + 750, N: o.N + 520, R: 450, A1: 200, A2: 200 },
      { E: o.E + 1350, N: o.N + 300, R: 400, A1: 180, A2: 180 },
      { E: o.E + 2250, N: o.N + 1100 },
    ],
  };
  p.gelaende = beispielGelaende();
  return p;
}
