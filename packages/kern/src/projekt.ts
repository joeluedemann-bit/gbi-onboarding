/**
 * Projektmodell: alle Eingaben eines Entwurfs als serialisierbares JSON sowie
 * die zentrale Berechnung aller abgeleiteten Größen.
 */

import { Achse, type AchsDefinition, elementTabelle } from "./achse";
import { DGM, type Gelaendepunkt, gelaendeschnitt } from "./dgm";
import { klothoidenParameter } from "./elemente";
import { Gradiente, type Neigungswechsel } from "./gradiente";
import { type Pruefpunkt, pruefeEntwurf } from "./pruefung";
import { ENTWURFSKLASSEN, type EntwurfsklasseId } from "./regelwerk";
import { type Querschnitt, pruefeQuerschnitt } from "./querschnitt";
import { type BogenInfo, type Meldung, type PolygonPunkt, type TrassierungsErgebnis, trassiereTangentenpolygon } from "./trassierung";

export type AchsEingabe =
  | { modus: "polygon"; polygon: PolygonPunkt[] }
  | { modus: "elemente"; definition: AchsDefinition };

export interface Projekt {
  format: "gbi-strassenplanung";
  version: 1;
  name: string;
  ekl: EntwurfsklasseId;
  stationAnfang: number;
  achse: AchsEingabe;
  gradiente: Neigungswechsel[];
  gelaende: Gelaendepunkt[];
  /** Regelquerschnitt und Deckenbuch-Änderungen (optional) */
  querschnitt?: Querschnitt;
}

export interface Projektergebnis {
  achse: Achse | null;
  trassierung: TrassierungsErgebnis | null;
  boegen: BogenInfo[];
  gradiente: Gradiente | null;
  dgm: DGM | null;
  gelaendeschnitt: { station: number; hoehe: number }[];
  pruefung: Pruefpunkt[];
  fehler: string[];
}

export function leeresProjekt(name = "Neues Projekt"): Projekt {
  return {
    format: "gbi-strassenplanung",
    version: 1,
    name,
    ekl: "EKL3",
    stationAnfang: 0,
    achse: { modus: "polygon", polygon: [] },
    gradiente: [],
    gelaende: [],
  };
}

export interface BerechnungsCache {
  /** Bereits berechnetes DGM für `projekt.gelaende` (spart die Vermaschung bei jeder Änderung) */
  dgm?: DGM | null;
}

export function erzeugeDgm(gelaende: Gelaendepunkt[]): DGM | null {
  return gelaende.length >= 3 ? new DGM(gelaende) : null;
}

export function berechneProjekt(p: Projekt, cache: BerechnungsCache = {}): Projektergebnis {
  const fehler: string[] = [];
  const meldungen: { bereich: "lageplan" | "hoehenplan"; meldung: Meldung }[] = [];
  let achse: Achse | null = null;
  let trassierung: TrassierungsErgebnis | null = null;
  let boegen: BogenInfo[] = [];

  try {
    if (p.achse.modus === "polygon") {
      if (p.achse.polygon.length >= 2) {
        trassierung = trassiereTangentenpolygon(p.achse.polygon, p.stationAnfang);
        achse = trassierung.achse;
        boegen = trassierung.boegen;
        trassierung.meldungen.forEach((m) => meldungen.push({ bereich: "lageplan", meldung: m }));
      }
    } else {
      achse = new Achse(p.achse.definition);
      boegen = boegenAusElementen(achse);
    }
  } catch (e) {
    fehler.push(`Achse: ${(e as Error).message}`);
  }

  let gradiente: Gradiente | null = null;
  try {
    if (p.gradiente.length >= 2) {
      gradiente = new Gradiente(p.gradiente);
      gradiente.meldungen.forEach((m) => meldungen.push({ bereich: "hoehenplan", meldung: m }));
    }
  } catch (e) {
    fehler.push(`Gradiente: ${(e as Error).message}`);
  }

  let dgm: DGM | null = null;
  try {
    dgm = cache.dgm !== undefined ? cache.dgm : erzeugeDgm(p.gelaende);
  } catch (e) {
    fehler.push(`Gelände: ${(e as Error).message}`);
  }

  const schnitt =
    achse && dgm
      ? gelaendeschnitt(
          dgm,
          achse.rasterStationen(Math.max(2, Math.min(10, achse.laenge / 300))).map((station) => ({ station, ...achse!.punkt(station) })),
        )
      : [];

  const ekl = ENTWURFSKLASSEN[p.ekl] ?? ENTWURFSKLASSEN.EKL3;
  const pruefung = pruefeEntwurf({
    ekl,
    boegen,
    gradiente,
    stationAnfang: achse?.stationAnfang,
    stationEnde: achse?.stationEnde,
    meldungen,
  });
  if (p.querschnitt) {
    for (const m of pruefeQuerschnitt(p.querschnitt, gradiente)) {
      pruefung.push({ ebene: m.ebene, bereich: "querschnitt", text: m.text, station: m.station });
    }
  }
  for (const f of fehler) pruefung.unshift({ ebene: "fehler", bereich: "allgemein", text: f });

  return { achse, trassierung, boegen, gradiente, dgm, gelaendeschnitt: schnitt, pruefung, fehler };
}

/** Bögen (Klothoide – Kreis – Klothoide) aus einer Elementfolge ableiten, z. B. nach LandXML-Import. */
export function boegenAusElementen(achse: Achse): BogenInfo[] {
  const el = achse.elemente;
  const st = achse.elementStationen();
  const boegen: BogenInfo[] = [];
  el.forEach((e, i) => {
    if (e.typ !== "kreisbogen") return;
    const vor = el[i - 1];
    const nach = el[i + 1];
    const A1 = vor?.typ === "klothoide" && Math.abs(vor.kEnde - e.kAnfang) < 1e-9 ? klothoidenParameter(vor) : 0;
    const A2 = nach?.typ === "klothoide" && Math.abs(nach.kAnfang - e.kEnde) < 1e-9 ? klothoidenParameter(nach) : 0;
    const L1 = A1 > 0 ? vor.laenge : 0;
    const L2 = A2 > 0 ? nach.laenge : 0;
    boegen.push({
      punkt: boegen.length,
      gamma: NaN,
      R: Math.abs(1 / e.kAnfang),
      A1,
      A2,
      L1,
      L2,
      LBogen: e.laenge,
      alpha: e.laenge * Math.abs(e.kAnfang),
      T1: NaN,
      T2: NaN,
      stationAnfang: st[i] - L1,
      stationEnde: st[i] + e.laenge + L2,
    });
  });
  return boegen;
}

const r = (x: number, n = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : null);

/** Kompakte, JSON-taugliche Zusammenfassung eines Projekts (für Berichte und die KI). */
export function projektZusammenfassung(p: Projekt, e: Projektergebnis) {
  const ekl = ENTWURFSKLASSEN[p.ekl];
  return {
    name: p.name,
    entwurfsklasse: { id: ekl.id, bezeichnung: ekl.bezeichnung, radiusMin: ekl.radiusMin, radiusBereich: ekl.radiusBereich, laengsneigungMaxProzent: ekl.laengsneigungMax * 100, kuppeMin: ekl.kuppeMin, wanneMin: ekl.wanneMin },
    achsmodus: p.achse.modus,
    tangentenpolygon:
      p.achse.modus === "polygon"
        ? p.achse.polygon.map((q, i) => ({ nr: i + 1, E: r(q.E), N: r(q.N), R: q.R ?? null, A1: q.A1 ?? null, A2: q.A2 ?? null }))
        : null,
    achse: e.achse
      ? {
          stationAnfang: r(e.achse.stationAnfang),
          stationEnde: r(e.achse.stationEnde),
          laenge: r(e.achse.laenge),
          elemente: elementTabelle(e.achse).map((x) => ({
            ...x,
            stationAnfang: r(x.stationAnfang),
            laenge: r(x.laenge),
            radiusAnfang: r(x.radiusAnfang, 1),
            radiusEnde: r(x.radiusEnde, 1),
            A: r(x.A, 1),
          })),
        }
      : null,
    boegen: e.boegen.map((b) => ({ punkt: b.punkt + 1, R: r(b.R, 1), A1: r(b.A1, 1), A2: r(b.A2, 1), bogenlaenge: r(b.LBogen, 2), T1: r(b.T1, 2), T2: r(b.T2, 2), stationAnfang: r(b.stationAnfang, 2), stationEnde: r(b.stationEnde, 2) })),
    zwischengeraden: e.trassierung?.zwischengeraden.map((z) => r(z, 2)) ?? null,
    gradiente: e.gradiente
      ? {
          nwp: e.gradiente.nwp.map((q, i) => ({ nr: i + 1, station: r(q.station, 2), hoehe: r(q.hoehe), H: q.H ?? 0 })),
          neigungenProzent: e.gradiente.neigungen.map((s) => r(s * 100, 3)),
          ausrundungen: e.gradiente.ausrundungen.map((a) => ({ nwp: a.nwp + 1, art: a.art, H: a.H, T: r(a.T, 2), anfang: r(a.stationAnfang, 2), ende: r(a.stationEnde, 2) })),
        }
      : null,
    gelaende: e.dgm
      ? { punkte: e.dgm.punkte.length, hoeheMin: r(e.dgm.grenzen.minH, 2), hoeheMax: r(e.dgm.grenzen.maxH, 2), grenzen: { minE: r(e.dgm.grenzen.minE, 1), maxE: r(e.dgm.grenzen.maxE, 1), minN: r(e.dgm.grenzen.minN, 1), maxN: r(e.dgm.grenzen.maxN, 1) } }
      : null,
    querschnitt: p.querschnitt ?? null,
    pruefung: e.pruefung.filter((q) => q.ebene !== "ok").map((q) => ({ ebene: q.ebene, bereich: q.bereich, text: q.text, station: q.station !== undefined ? r(q.station, 1) : undefined })),
  };
}
