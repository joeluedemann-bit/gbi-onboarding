/**
 * Regelbasierte Entwurfsautomatik. Sie liefert einen ersten, regelwerkskonformen
 * Entwurf, den Planer oder KI-Assistent anschließend verfeinern.
 */

import type { Achse } from "./achse";
import { type DGM, gelaendeschnitt } from "./dgm";
import { Gradiente, type Neigungswechsel } from "./gradiente";
import { type Entwurfsklasse, klothoidenBereich } from "./regelwerk";
import { type PolygonPunkt, ablenkwinkel, bogenGeometrie } from "./trassierung";
import { strecke } from "./winkel";

const RADIEN = [
  5000, 4000, 3000, 2500, 2000, 1800, 1500, 1200, 1000, 900, 800, 700, 600, 550, 500, 450, 400, 350, 300, 275, 250,
  225, 200, 180, 160, 150, 140, 125, 110, 100, 90, 80, 70, 60, 50, 40, 30,
];

export interface RadienOptionen {
  /** Mindestlänge der Zwischengeraden zwischen zwei Bögen (m) */
  zwischengeradeMin?: number;
  /** Verhältnis A/R für die Klothoiden (Regelwerksbereich 1/3 … 1) */
  klothoidenVerhaeltnis?: number;
}

export interface RadienVorschlag {
  punkte: PolygonPunkt[];
  hinweise: string[];
}

/**
 * Wählt an jedem inneren Polygonpunkt den größten Radius aus dem empfohlenen
 * Bereich der Entwurfsklasse, der auf die verfügbaren Tangentenlängen passt.
 * Gemeinsam genutzte Polygonseiten werden hälftig auf die Nachbarbögen verteilt.
 */
export function automatischeRadien(
  punkte: PolygonPunkt[],
  ekl: Entwurfsklasse,
  optionen: RadienOptionen = {},
): RadienVorschlag {
  const zgMin = optionen.zwischengeradeMin ?? 0;
  const verhaeltnis = optionen.klothoidenVerhaeltnis ?? 0.5;
  const n = punkte.length;
  const hinweise: string[] = [];
  const ergebnis = punkte.map((p) => ({ ...p }));
  const seiten = punkte.slice(1).map((p, i) => strecke(p.E - punkte[i].E, p.N - punkte[i].N));

  for (let i = 1; i < n - 1; i++) {
    const gamma = ablenkwinkel(punkte, i);
    if (Math.abs(gamma) < 1e-6) continue;
    const verfuegbarEin = i - 1 === 0 ? seiten[i - 1] - zgMin : seiten[i - 1] / 2 - zgMin / 2;
    const verfuegbarAus = i + 1 === n - 1 ? seiten[i] - zgMin : seiten[i] / 2 - zgMin / 2;

    const passt = (R: number, A: number) => {
      const g = bogenGeometrie(gamma, R, A, A);
      return g !== null && g.T1 <= verfuegbarEin && g.T2 <= verfuegbarAus;
    };

    let gewaehlt: { R: number; A: number } | null = null;
    const obergrenze = ekl.radiusBereich[1];
    // 1. Versuch: im empfohlenen Bereich mit Standard-Klothoide, 2.: kürzere Klothoide
    for (const faktor of [verhaeltnis, 1 / 3]) {
      for (const R of RADIEN) {
        if (R > obergrenze || R < ekl.radiusMin) continue;
        const A = runde(R * faktor, 5, klothoidenBereich(R));
        if (passt(R, A)) {
          gewaehlt = { R, A };
          break;
        }
      }
      if (gewaehlt) break;
    }
    // 3. Versuch: unterhalb des Mindestradius (Regelwerksverstoß wird gemeldet)
    if (!gewaehlt) {
      for (const R of RADIEN) {
        if (R >= ekl.radiusMin) continue;
        const A = runde(R / 3, 5, klothoidenBereich(R));
        if (passt(R, A)) {
          gewaehlt = { R, A };
          hinweise.push(
            `Punkt ${i + 1}: Platz reicht nur für R = ${R} m (unter Mindestradius ${ekl.radiusMin} m) – Polygon anpassen`,
          );
          break;
        }
        if (passt(R, 0)) {
          gewaehlt = { R, A: 0 };
          hinweise.push(`Punkt ${i + 1}: nur Kreisbogen R = ${R} m ohne Klothoiden möglich – Polygon anpassen`);
          break;
        }
      }
    }
    if (!gewaehlt) {
      hinweise.push(`Punkt ${i + 1}: kein passender Bogen gefunden – Polygonseiten zu kurz`);
      continue;
    }
    ergebnis[i] = { ...ergebnis[i], R: gewaehlt.R, A1: gewaehlt.A, A2: gewaehlt.A };
  }
  return { punkte: ergebnis, hinweise };
}

function runde(wert: number, raster: number, [min, max]: [number, number]): number {
  let r = Math.round(wert / raster) * raster;
  if (r < min) r = Math.ceil(min / raster) * raster;
  if (r > max) r = Math.floor(max / raster) * raster;
  return r;
}

export interface GradientenOptionen {
  /** Abtastabstand des Geländes (m) */
  abtastung?: number;
  /** Zulässige Abweichung der Gradiente vom Gelände bei der Vereinfachung (m) */
  toleranz?: number;
  /** Mindestabstand zwischen NWP (m) */
  nwpAbstandMin?: number;
  /** Faktor auf die Mindesthalbmesser (1,5 = 50 % Reserve) */
  halbmesserFaktor?: number;
  /** Höhe der Gradiente über Gelände (m), z. B. für Dammlage */
  hoehenversatz?: number;
}

/**
 * Erzeugt eine Gradiente, die dem Gelände folgt: Geländeschnitt vereinfachen
 * (Douglas-Peucker), Längsneigungen begrenzen, Ausrundungen einpassen.
 */
export function gradienteAusGelaende(
  achse: Achse,
  dgm: DGM,
  ekl: Entwurfsklasse,
  optionen: GradientenOptionen = {},
): { nwp: Neigungswechsel[]; hinweise: string[] } {
  const abtastung = optionen.abtastung ?? 10;
  const toleranz = optionen.toleranz ?? 2;
  const abstandMin = optionen.nwpAbstandMin ?? 150;
  const faktor = optionen.halbmesserFaktor ?? 1.5;
  const versatz = optionen.hoehenversatz ?? 0;
  const hinweise: string[] = [];

  const stationen = achse.rasterStationen(abtastung);
  const schnitt = gelaendeschnitt(
    dgm,
    stationen.map((station) => ({ station, ...achse.punkt(station) })),
  );
  if (schnitt.length < 2) throw new Error("Die Achse liegt nicht (ausreichend) im Geländemodell");
  if (schnitt.length < stationen.length) hinweise.push("Teile der Achse liegen außerhalb des Geländemodells");

  // 1. Vereinfachen
  let punkte = douglasPeucker(schnitt.map((p) => ({ station: p.station, hoehe: p.hoehe + versatz })), toleranz);

  // 2. Mindestabstand: zu dicht liegende NWP entfernen (kleinsten Neigungswechsel zuerst)
  let geaendert = true;
  while (geaendert && punkte.length > 2) {
    geaendert = false;
    for (let i = 1; i < punkte.length - 1; i++) {
      const zuDicht = punkte[i].station - punkte[i - 1].station < abstandMin || punkte[i + 1].station - punkte[i].station < abstandMin;
      if (zuDicht) {
        punkte = entferneKleinstenKnick(punkte, (j) => punkte[j].station - punkte[j - 1].station < abstandMin || punkte[j + 1].station - punkte[j].station < abstandMin);
        geaendert = true;
        break;
      }
    }
  }

  // 3. Höchstlängsneigung einhalten: Anfangs- und Endhöhe (Anschlüsse) bleiben fest,
  //    innere NWP werden im Vorwärts- und Rückwärtslauf in den zulässigen Bereich geschoben
  const sMax = ekl.laengsneigungMax;
  const begrenze = (i: number, j: number) => {
    const dz = sMax * Math.abs(punkte[i].station - punkte[j].station);
    punkte[i].hoehe = Math.min(Math.max(punkte[i].hoehe, punkte[j].hoehe - dz), punkte[j].hoehe + dz);
  };
  for (let durchlauf = 0; durchlauf < 5; durchlauf++) {
    for (let i = 1; i < punkte.length - 1; i++) begrenze(i, i - 1);
    for (let i = punkte.length - 2; i > 0; i--) begrenze(i, i + 1);
  }
  for (let i = 1; i < punkte.length; i++) {
    const s = (punkte[i].hoehe - punkte[i - 1].hoehe) / (punkte[i].station - punkte[i - 1].station);
    if (Math.abs(s) > sMax + 1e-6) {
      hinweise.push(
        `Längsneigung ${(s * 100).toFixed(2)} % zwischen Station ${punkte[i - 1].station.toFixed(0)} und ${punkte[i].station.toFixed(0)} ist durch Anfangs-/Endhöhe erzwungen`,
      );
    }
  }

  // 4. Ausrundungen: Mindesthalbmesser × Faktor, bei Platzmangel reduzieren
  let nwp: Neigungswechsel[] = punkte.map((p) => ({ station: runde2(p.station), hoehe: runde3(p.hoehe) }));
  for (let versuch = 0; versuch < 50; versuch++) {
    nwp = setzeHalbmesser(nwp, ekl.kuppeMin, ekl.wanneMin, faktor);
    const g = new Gradiente(nwp);
    if (g.meldungen.every((m) => m.ebene !== "fehler") || nwp.length <= 2) break;
    // Überschneidung bleibt auch mit Mindesthalbmessern: kleinsten Knick entfernen
    const pts = nwp.map((p) => ({ station: p.station, hoehe: p.hoehe }));
    nwp = entferneKleinstenKnick(pts, () => true).map((p) => ({ station: p.station, hoehe: p.hoehe }));
  }
  return { nwp, hinweise };
}

function setzeHalbmesser(nwp: Neigungswechsel[], kuppeMin: number, wanneMin: number, faktor: number): Neigungswechsel[] {
  const n = nwp.length;
  const s = nwp.slice(1).map((p, i) => (p.hoehe - nwp[i].hoehe) / (p.station - nwp[i].station));
  const ergebnis = nwp.map((p) => ({ station: p.station, hoehe: p.hoehe, H: 0 }));
  // Verfügbare Tangentenlänge: halbe Nachbarabstände (an den Enden voller Abstand)
  for (let i = 1; i < n - 1; i++) {
    const ds = s[i] - s[i - 1];
    if (Math.abs(ds) < 1e-6) continue;
    const Hmin = ds < 0 ? kuppeMin : wanneMin;
    const links = i - 1 === 0 ? nwp[i].station - nwp[0].station : (nwp[i].station - nwp[i - 1].station) / 2;
    const rechts = i + 1 === n - 1 ? nwp[n - 1].station - nwp[i].station : (nwp[i + 1].station - nwp[i].station) / 2;
    const Hplatz = (2 * Math.min(links, rechts)) / Math.abs(ds);
    let H = Math.min(Hmin * faktor, Math.max(Hplatz, Hmin));
    H = Math.floor(H / 100) * 100 || Hmin;
    ergebnis[i].H = Math.max(H, Hmin);
  }
  return ergebnis;
}

function entferneKleinstenKnick<T extends { station: number; hoehe: number }>(punkte: T[], kandidat: (i: number) => boolean): T[] {
  let bestI = -1;
  let bestKnick = Infinity;
  for (let i = 1; i < punkte.length - 1; i++) {
    if (!kandidat(i)) continue;
    const s1 = (punkte[i].hoehe - punkte[i - 1].hoehe) / (punkte[i].station - punkte[i - 1].station);
    const s2 = (punkte[i + 1].hoehe - punkte[i].hoehe) / (punkte[i + 1].station - punkte[i].station);
    const knick = Math.abs(s2 - s1);
    if (knick < bestKnick) {
      bestKnick = knick;
      bestI = i;
    }
  }
  return bestI < 0 ? punkte : punkte.filter((_, i) => i !== bestI);
}

function douglasPeucker<T extends { station: number; hoehe: number }>(punkte: T[], toleranz: number): T[] {
  if (punkte.length <= 2) return punkte.map((p) => ({ ...p }));
  const a = punkte[0];
  const b = punkte[punkte.length - 1];
  let maxD = -1;
  let maxI = 0;
  for (let i = 1; i < punkte.length - 1; i++) {
    const p = punkte[i];
    const h = a.hoehe + ((b.hoehe - a.hoehe) * (p.station - a.station)) / (b.station - a.station);
    const d = Math.abs(p.hoehe - h);
    if (d > maxD) {
      maxD = d;
      maxI = i;
    }
  }
  if (maxD <= toleranz) return [{ ...a }, { ...b }];
  const links = douglasPeucker(punkte.slice(0, maxI + 1), toleranz);
  const rechts = douglasPeucker(punkte.slice(maxI), toleranz);
  return [...links.slice(0, -1), ...rechts];
}

const runde2 = (x: number) => Math.round(x * 100) / 100;
const runde3 = (x: number) => Math.round(x * 1000) / 1000;
