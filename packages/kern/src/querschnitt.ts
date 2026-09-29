/**
 * Regelquerschnitt (RQ), Deckenbuch und Querprofile.
 *
 * Der Querschnitt besteht je Seite aus Spuren, die von der Achse nach außen
 * aufgereiht sind (Fahrbahn, Rinne, Bordstein, Gehweg, Bankett …). Entlang der
 * Achse können Breiten, Querneigungen und Bordanschläge bereichsweise geändert
 * werden (Aufweitungen, Verwindungen, Absenkungen). Daraus entsteht das
 * Deckenbuch: je Station Abstand und Höhe aller Randpunkte.
 *
 * Vorzeichen: Abstand < 0 links, > 0 rechts der Achse. Querneigung in Prozent,
 * positiv = Gefälle von der Achse nach außen. Höhensprung positiv = Kante steigt
 * nach außen (z. B. Bordanschlag +0,12 m).
 */

import type { Achse } from "./achse";
import type { DGM } from "./dgm";
import type { Gradiente } from "./gradiente";

export type SpurArt = "fahrbahn" | "rinne" | "bordstein" | "gehweg" | "radweg" | "parken" | "bankett" | "gruen" | "mulde";
export type Seite = "links" | "rechts";

export interface Spur {
  name: string;
  art: SpurArt;
  /** Breite in m */
  breite: number;
  /** Querneigung in %, positiv = fällt nach außen */
  neigung: number;
  /** Höhensprung am inneren Spurrand in m (z. B. Bordanschlag) */
  sprung?: number;
}

export interface Boeschung {
  /** Böschungsneigung 1:n im Auftrag (Damm) */
  auftrag: number;
  /** Böschungsneigung 1:n im Abtrag (Einschnitt) */
  abtrag: number;
  /** Größte Suchbreite bis zum Geländeanschluss in m */
  maxBreite?: number;
}

/** Bereichsweise Änderung einer Spur, linear von `von` bis `bis`. */
export interface SpurAenderung {
  seite: Seite;
  /** Index der Spur auf dieser Seite (0 = an der Achse) */
  spur: number;
  stationVon: number;
  stationBis: number;
  /** Breite am Bereichsanfang/-ende (leer = unverändert) */
  breiteVon?: number;
  breiteBis?: number;
  /** Höhensprung im Bereich (z. B. 0,03 m für eine Bordabsenkung) */
  sprung?: number;
  /** Länge der Übergänge für den Höhensprung in m (Standard 1 m) */
  uebergang?: number;
}

/** Querneigung der Fahrbahn an einer Station (Verwindung: linear dazwischen). */
export interface Querneigungspunkt {
  station: number;
  links: number;
  rechts: number;
}

export interface Querschnitt {
  name: string;
  links: Spur[];
  rechts: Spur[];
  boeschung: Boeschung;
  aenderungen: SpurAenderung[];
  querneigungen: Querneigungspunkt[];
}

export interface Randpunkt {
  seite: Seite;
  /** Index des Randes: 0 = Achse, i = äußerer Rand der Spur i−1 */
  index: number;
  /** Bezeichnung, z. B. „Fahrbahnrand“ */
  name: string;
  art: SpurArt | "achse" | "boeschung";
  abstand: number;
  hoehe: number;
  /** Punkt liegt oben auf einem Höhensprung (Bordoberkante) */
  oben?: boolean;
}

export interface Querprofil {
  station: number;
  /** Achshöhe (Gradiente) */
  hoehe: number;
  /** Deckenpunkte von links außen nach rechts außen */
  punkte: Randpunkt[];
  /** Geländelinie quer zur Achse */
  gelaende: { abstand: number; hoehe: number }[];
  /** Flächen zwischen Planung und Gelände (m²) */
  auftrag: number;
  abtrag: number;
}

const ART_NAME: Record<SpurArt, string> = {
  fahrbahn: "Fahrbahn",
  rinne: "Rinne",
  bordstein: "Bordstein",
  gehweg: "Gehweg",
  radweg: "Radweg",
  parken: "Parkstreifen",
  bankett: "Bankett",
  gruen: "Grünstreifen",
  mulde: "Mulde",
};

export function spurArtName(art: SpurArt): string {
  return ART_NAME[art];
}

/** Vorlagen für häufige Querschnitte (Werte als Ausgangspunkt, bitte projektbezogen prüfen). */
export const QUERSCHNITT_VORLAGEN: Record<string, () => Querschnitt> = {
  "Anliegerstraße 5,50 m, Hochbord mit Rinne, Gehwege": () => ({
    name: "Anliegerstraße 5,50 m",
    links: [
      { name: "Fahrbahn", art: "fahrbahn", breite: 2.75, neigung: 2.5 },
      { name: "Rinne", art: "rinne", breite: 0.3, neigung: 5 },
      { name: "Hochbord", art: "bordstein", breite: 0.15, neigung: 0, sprung: 0.12 },
      { name: "Gehweg", art: "gehweg", breite: 2.5, neigung: -2.5 },
    ],
    rechts: [
      { name: "Fahrbahn", art: "fahrbahn", breite: 2.75, neigung: 2.5 },
      { name: "Rinne", art: "rinne", breite: 0.3, neigung: 5 },
      { name: "Hochbord", art: "bordstein", breite: 0.15, neigung: 0, sprung: 0.12 },
      { name: "Gehweg", art: "gehweg", breite: 2.5, neigung: -2.5 },
    ],
    boeschung: { auftrag: 1.5, abtrag: 1.5, maxBreite: 30 },
    aenderungen: [],
    querneigungen: [],
  }),
  "Wohnweg 4,75 m, einseitig geneigt, Tiefbord": () => ({
    name: "Wohnweg 4,75 m",
    links: [
      { name: "Fahrbahn", art: "fahrbahn", breite: 2.375, neigung: -2.5 },
      { name: "Tiefbord", art: "bordstein", breite: 0.1, neigung: 0 },
      { name: "Bankett", art: "bankett", breite: 0.5, neigung: 6 },
    ],
    rechts: [
      { name: "Fahrbahn", art: "fahrbahn", breite: 2.375, neigung: 2.5 },
      { name: "Rinne", art: "rinne", breite: 0.3, neigung: 5 },
      { name: "Tiefbord", art: "bordstein", breite: 0.1, neigung: 0 },
      { name: "Bankett", art: "bankett", breite: 0.5, neigung: 6 },
    ],
    boeschung: { auftrag: 1.5, abtrag: 1.5, maxBreite: 30 },
    aenderungen: [],
    querneigungen: [],
  }),
  "Gemeindeverbindungsstraße 5,50 m, Bankett": () => ({
    name: "GVS 5,50 m",
    links: [
      { name: "Fahrbahn", art: "fahrbahn", breite: 2.75, neigung: 2.5 },
      { name: "Bankett", art: "bankett", breite: 1.5, neigung: 12 },
    ],
    rechts: [
      { name: "Fahrbahn", art: "fahrbahn", breite: 2.75, neigung: 2.5 },
      { name: "Bankett", art: "bankett", breite: 1.5, neigung: 12 },
    ],
    boeschung: { auftrag: 1.5, abtrag: 1.5, maxBreite: 30 },
    aenderungen: [],
    querneigungen: [],
  }),
};

export function standardQuerschnitt(): Querschnitt {
  return QUERSCHNITT_VORLAGEN["Anliegerstraße 5,50 m, Hochbord mit Rinne, Gehwege"]();
}

/** Glatter Übergangsfaktor 0…1 für Bereiche mit Rampen an beiden Enden. */
function bereichsfaktor(st: number, von: number, bis: number, rampe: number): number {
  if (st < von - rampe || st > bis + rampe) return 0;
  if (st < von) return (st - (von - rampe)) / rampe;
  if (st > bis) return ((bis + rampe) - st) / rampe;
  return 1;
}

/** Wirksame Spuren einer Seite an einer Station (Änderungen und Querneigungsverlauf eingerechnet). */
export function spurenBei(q: Querschnitt, seite: Seite, station: number): Spur[] {
  const spuren = (seite === "links" ? q.links : q.rechts).map((s) => ({ ...s }));

  // Fahrbahnquerneigung aus dem Querneigungsverlauf (linear interpoliert, außerhalb konstant)
  const qn = [...q.querneigungen].sort((a, b) => a.station - b.station);
  if (qn.length > 0) {
    let wert: number;
    if (station <= qn[0].station) wert = qn[0][seite];
    else if (station >= qn[qn.length - 1].station) wert = qn[qn.length - 1][seite];
    else {
      const i = qn.findIndex((p) => p.station >= station);
      const a = qn[i - 1];
      const b = qn[i];
      wert = a[seite] + ((b[seite] - a[seite]) * (station - a.station)) / (b.station - a.station);
    }
    for (const s of spuren) if (s.art === "fahrbahn") s.neigung = wert;
  }

  for (const a of q.aenderungen) {
    if (a.seite !== seite || !spuren[a.spur]) continue;
    const s = spuren[a.spur];
    if (station >= a.stationVon && station <= a.stationBis && (a.breiteVon !== undefined || a.breiteBis !== undefined)) {
      const b0 = a.breiteVon ?? s.breite;
      const b1 = a.breiteBis ?? b0;
      const t = a.stationBis > a.stationVon ? (station - a.stationVon) / (a.stationBis - a.stationVon) : 0;
      s.breite = Math.max(0, b0 + (b1 - b0) * t);
    }
    if (a.sprung !== undefined) {
      const f = bereichsfaktor(station, a.stationVon, a.stationBis, a.uebergang ?? 1);
      if (f > 0) s.sprung = (s.sprung ?? 0) * (1 - f) + a.sprung * f;
    }
  }
  return spuren;
}

/** Randpunkte einer Seite an einer Station (ohne Böschung), von der Achse nach außen. */
export function randpunkte(q: Querschnitt, seite: Seite, station: number, achshoehe: number): Randpunkt[] {
  const vz = seite === "links" ? -1 : 1;
  const punkte: Randpunkt[] = [];
  let abstand = 0;
  let hoehe = achshoehe;
  spurenBei(q, seite, station).forEach((s, i) => {
    if (s.sprung) {
      punkte.push({ seite, index: i, name: `${s.name} innen`, art: s.art, abstand: vz * abstand, hoehe });
      hoehe += s.sprung;
      punkte.push({ seite, index: i, name: `${s.name} oben`, art: s.art, abstand: vz * abstand, hoehe, oben: true });
    }
    abstand += s.breite;
    hoehe -= (s.breite * s.neigung) / 100;
    punkte.push({ seite, index: i + 1, name: `${s.name} außen`, art: s.art, abstand: vz * abstand, hoehe });
  });
  return punkte;
}

function gelaendeQuer(achse: Achse, dgm: DGM, station: number, abstand: number): number | null {
  const p = achse.punkt(station, abstand);
  return dgm.hoehe(p.E, p.N);
}

/** Böschung vom äußeren Rand bis zum Gelände (Auftrag fällt, Abtrag steigt nach außen). */
function boeschungspunkt(
  achse: Achse,
  dgm: DGM,
  q: Querschnitt,
  station: number,
  rand: Randpunkt,
): Randpunkt | null {
  const vz = rand.abstand < 0 ? -1 : 1;
  const g0 = gelaendeQuer(achse, dgm, station, rand.abstand);
  if (g0 === null) return null;
  if (Math.abs(g0 - rand.hoehe) < 0.005) return null;
  const auftrag = g0 < rand.hoehe;
  const n = auftrag ? q.boeschung.auftrag : q.boeschung.abtrag;
  const max = q.boeschung.maxBreite ?? 30;
  const linie = (x: number) => rand.hoehe + (auftrag ? -1 : 1) * (x / n);
  const diff = (x: number) => {
    const g = gelaendeQuer(achse, dgm, station, rand.abstand + vz * x);
    return g === null ? null : linie(x) - g;
  };
  const d0 = rand.hoehe - g0;
  let a = 0;
  const schritt = 0.25;
  for (let x = schritt; x <= max; x += schritt) {
    const d = diff(x);
    if (d === null) return null;
    if (Math.sign(d) !== Math.sign(d0)) {
      // Nulldurchgang zwischen a und x: Bisektion
      let lo = a;
      let hi = x;
      for (let k = 0; k < 30; k++) {
        const m = (lo + hi) / 2;
        const dm = diff(m);
        if (dm === null) break;
        if (Math.sign(dm) === Math.sign(d0)) lo = m;
        else hi = m;
      }
      const xb = (lo + hi) / 2;
      return {
        seite: rand.seite,
        index: rand.index + 1,
        name: auftrag ? "Böschungsfuß" : "Böschungsoberkante",
        art: "boeschung",
        abstand: rand.abstand + vz * xb,
        hoehe: linie(xb),
      };
    }
    a = x;
  }
  return null;
}

export function querprofil(
  achse: Achse,
  gradiente: Gradiente,
  q: Querschnitt,
  station: number,
  dgm?: DGM | null,
): Querprofil {
  const h = gradiente.hoehe(station);
  const links = randpunkte(q, "links", station, h);
  const rechts = randpunkte(q, "rechts", station, h);
  const achsPunkt: Randpunkt = { seite: "rechts", index: 0, name: "Achse", art: "achse", abstand: 0, hoehe: h };

  let gelaende: { abstand: number; hoehe: number }[] = [];
  if (dgm) {
    const bl = boeschungspunkt(achse, dgm, q, station, links[links.length - 1] ?? achsPunkt);
    const br = boeschungspunkt(achse, dgm, q, station, rechts[rechts.length - 1] ?? achsPunkt);
    if (bl) links.push(bl);
    if (br) rechts.push(br);
    const aussen = Math.max(
      Math.abs(links[links.length - 1]?.abstand ?? 0),
      Math.abs(rechts[rechts.length - 1]?.abstand ?? 0),
    ) + 3;
    for (let x = -aussen; x <= aussen + 1e-9; x += 0.5) {
      const g = gelaendeQuer(achse, dgm, station, x);
      if (g !== null) gelaende.push({ abstand: x, hoehe: g });
    }
  }
  const punkte = [...links.reverse(), achsPunkt, ...rechts];

  // Flächen Auftrag/Abtrag über die Planungslinie (Trapezregel auf gemeinsamen Stützstellen)
  let auftrag = 0;
  let abtrag = 0;
  if (gelaende.length > 1) {
    const planung = (x: number) => {
      for (let i = 1; i < punkte.length; i++) {
        const a = punkte[i - 1];
        const b = punkte[i];
        if (x >= a.abstand && x <= b.abstand) {
          if (b.abstand - a.abstand < 1e-9) return Math.max(a.hoehe, b.hoehe);
          return a.hoehe + ((b.hoehe - a.hoehe) * (x - a.abstand)) / (b.abstand - a.abstand);
        }
      }
      return null;
    };
    const x0 = punkte[0].abstand;
    const x1 = punkte[punkte.length - 1].abstand;
    const dx = 0.1;
    for (let x = x0; x < x1 - 1e-9; x += dx) {
      const xm = Math.min(x + dx / 2, x1);
      const p = planung(xm);
      const g = gelaendeQuer(achse, dgm!, station, xm);
      if (p === null || g === null) continue;
      const w = Math.min(dx, x1 - x);
      if (p > g) auftrag += (p - g) * w;
      else abtrag += (g - p) * w;
    }
  }
  return { station, hoehe: h, punkte, gelaende, auftrag, abtrag };
}

/** Stationen für Deckenbuch und Querprofile: Raster plus Hauptpunkte und Änderungsgrenzen. */
export function deckenbuchStationen(achse: Achse, q: Querschnitt, intervall: number, gradiente?: Gradiente | null): number[] {
  const s = new Set<number>(achse.rasterStationen(intervall));
  for (const h of achse.hauptpunkte()) s.add(h.station);
  for (const a of q.aenderungen) {
    s.add(a.stationVon);
    s.add(a.stationBis);
    if (a.sprung !== undefined) {
      s.add(a.stationVon - (a.uebergang ?? 1));
      s.add(a.stationBis + (a.uebergang ?? 1));
    }
  }
  for (const p of q.querneigungen) s.add(p.station);
  if (gradiente) for (const a of gradiente.ausrundungen) {
    s.add(a.stationAnfang);
    s.add(a.stationEnde);
  }
  return [...s]
    .map((x) => Math.round(x * 1000) / 1000)
    .filter((x, i, arr) => x >= achse.stationAnfang - 1e-6 && x <= achse.stationEnde + 1e-6 && arr.indexOf(x) === i)
    .sort((a, b) => a - b);
}

export interface Deckenbuchzeile {
  station: number;
  achshoehe: number;
  punkte: (Randpunkt & { E: number; N: number })[];
}

/** Deckenbuch: je Station alle Randpunkte mit Abstand, Höhe und Koordinaten. */
export function deckenbuch(achse: Achse, gradiente: Gradiente, q: Querschnitt, intervall = 10): Deckenbuchzeile[] {
  return deckenbuchStationen(achse, q, intervall, gradiente)
    .filter((st) => st >= gradiente.stationAnfang - 1e-6 && st <= gradiente.stationEnde + 1e-6)
    .map((station) => {
      const h = gradiente.hoehe(station);
      const punkte = [...randpunkte(q, "links", station, h).reverse(), { seite: "rechts" as Seite, index: 0, name: "Achse", art: "achse" as const, abstand: 0, hoehe: h }, ...randpunkte(q, "rechts", station, h)];
      return {
        station,
        achshoehe: h,
        punkte: punkte.map((p) => ({ ...p, ...achse.punkt(station, p.abstand) })),
      };
    });
}

/** Linien der Spurränder im Lageplan (für Darstellung und DXF). */
export function randlinien(
  achse: Achse,
  q: Querschnitt,
  schritt = 2,
): { seite: Seite; index: number; art: SpurArt; name: string; punkte: { E: number; N: number; station: number }[] }[] {
  const stationen = deckenbuchStationen(achse, q, schritt);
  const linien: ReturnType<typeof randlinien> = [];
  for (const seite of ["links", "rechts"] as Seite[]) {
    const spuren = seite === "links" ? q.links : q.rechts;
    spuren.forEach((s, i) => {
      linien.push({
        seite,
        index: i + 1,
        art: s.art,
        name: s.name,
        punkte: stationen.map((station) => {
          const sp = spurenBei(q, seite, station);
          const abstand = sp.slice(0, i + 1).reduce((summe, x) => summe + x.breite, 0);
          return { station, ...achse.punkt(station, seite === "links" ? -abstand : abstand) };
        }),
      });
    });
  }
  return linien;
}

/** Prüfungen des Querschnitts (Entwässerung, Plausibilität). */
export function pruefeQuerschnitt(q: Querschnitt, gradiente?: Gradiente | null): { ebene: "fehler" | "warnung" | "hinweis"; text: string; station?: number }[] {
  const meldungen: { ebene: "fehler" | "warnung" | "hinweis"; text: string; station?: number }[] = [];
  for (const seite of ["links", "rechts"] as Seite[]) {
    for (const s of seite === "links" ? q.links : q.rechts) {
      if (!(s.breite >= 0)) meldungen.push({ ebene: "fehler", text: `${seite}: Spur „${s.name}“ hat eine ungültige Breite` });
      if (s.art === "fahrbahn" && Math.abs(s.neigung) < 2.5 - 1e-9) {
        meldungen.push({ ebene: "warnung", text: `${seite}: Querneigung der Fahrbahn ${s.neigung.toFixed(1)} % unter 2,5 % (Entwässerung prüfen)` });
      }
    }
  }
  const hatBord = [...q.links, ...q.rechts].some((s) => s.art === "bordstein" || s.art === "rinne");
  if (hatBord && gradiente) {
    gradiente.neigungen.forEach((s, i) => {
      if (Math.abs(s) < 0.005 - 1e-9) {
        meldungen.push({
          ebene: "warnung",
          station: gradiente.nwp[i].station,
          text: `Längsneigung ${(s * 100).toFixed(2)} % unter 0,5 % bei Bord/Rinne – Pendelrinne oder Mindestgefälle vorsehen`,
        });
      }
    });
  }
  return meldungen;
}
