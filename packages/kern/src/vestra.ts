/**
 * Import von VESTRA-Achslisten (Textausgabe „Ergebnisliste“, Dateien AXEL####.LST).
 *
 * Gelesen wird die dokumentierte Listenausgabe, nicht das interne Projektformat.
 * Je Element stehen drei Zeilen:
 *
 *   <Typ>  Station  R  Klothoide  PHI-T  YH  XH
 *          Stat-Diff  T1  T2  D-PHI  YT  XT
 *                     S  PHI-S  YM  XM
 *
 * Y = Rechtswert, X = Hochwert, Richtungen in gon, R < 0 = Linkskurve.
 * Die letzte Zeile ohne Typ enthält den Achsendpunkt.
 */

import { Achse, type AchsDefinition } from "./achse";
import type { Element } from "./elemente";
import { gonZuRad, strecke } from "./winkel";

export interface VestraHauptpunkt {
  station: number;
  E: number;
  N: number;
  /** Richtungswinkel in gon */
  richtungGon: number;
  typ: string;
}

export interface VestraAchsliste {
  name: string;
  achsnummer: number | null;
  definition: AchsDefinition;
  /** Hauptpunkte laut Liste (Elementanfänge und Achsende) */
  hauptpunkte: VestraHauptpunkt[];
  warnungen: string[];
}

export interface Achsvergleich {
  /** Größte Lageabweichung der nachgerechneten Hauptpunkte (m) */
  maxLage: number;
  /** Größte Richtungsabweichung (gon) */
  maxRichtungGon: number;
  punkte: { station: number; typ: string; dLage: number; dRichtungGon: number }[];
}

const ZAHL = String.raw`[-+]?\d+(?:\.\d+)?`;
const ELEMENTZEILE = new RegExp(String.raw`^\s*([A-Za-zÄÖÜäöüß]+)\s+((?:${ZAHL}\s+){5}${ZAHL})\s*$`);
const NUR_ZAHLEN = (anzahl: number) => new RegExp(String.raw`^\s*((?:${ZAHL}\s+){${anzahl - 1}}${ZAHL})\s*$`);
const SECHS = NUR_ZAHLEN(6);
const VIER = NUR_ZAHLEN(4);

const zahlen = (s: string) => s.trim().split(/\s+/).map(Number);

export function importiereVestraAchsliste(text: string): VestraAchsliste {
  const zeilen = text.replace(/^﻿/, "").split(/\r?\n/);
  const name = zeilen.map((z) => z.match(/Bezeichnung:\s*(.+?)\s*$/)?.[1]).find(Boolean) ?? "VESTRA-Achse";
  const nr = zeilen.map((z) => z.match(/Ergebnisliste,\s*Achsnummer\s+(\d+)/)?.[1]).find(Boolean);
  const warnungen: string[] = [];

  // Ergebnisliste ab der ersten Überschrift lesen (Eingabedaten davor überspringen)
  const start = zeilen.findIndex((z) => /Ergebnisliste/.test(z));
  if (start < 0) throw new Error("Keine „Ergebnisliste“ in der Datei gefunden");

  interface Roh {
    typ: string;
    station: number;
    R: number;
    A: number;
    phiGon: number;
    E: number;
    N: number;
    laenge: number;
    dPhiGon: number;
  }
  const roh: Roh[] = [];
  let ende: VestraHauptpunkt | null = null;

  for (let i = start; i < zeilen.length; i++) {
    const m = zeilen[i].match(ELEMENTZEILE);
    if (m && !/^(Station|Stat)$/i.test(m[1])) {
      const [station, R, A, phiGon, E, N] = zahlen(m[2]);
      const z2 = zeilen[i + 1]?.match(SECHS);
      if (!z2) {
        warnungen.push(`Zeile ${i + 2}: Fortsetzungszeile zu „${m[1]}“ fehlt`);
        continue;
      }
      const [laenge, , , dPhiGon] = zahlen(z2[1]);
      roh.push({ typ: m[1], station, R, A, phiGon, E, N, laenge, dPhiGon });
      i += 1;
      if (zeilen[i + 1]?.match(VIER)) i += 1;
      continue;
    }
    // Endzeile: sechs Zahlen ohne Typ, nach dem letzten Element
    const e = zeilen[i].match(SECHS);
    if (e && roh.length > 0) {
      const [station, , , phiGon, E, N] = zahlen(e[1]);
      const letztes = roh[roh.length - 1];
      if (Math.abs(station - (letztes.station + letztes.laenge)) < 0.01 && E > 1000) {
        ende = { station, E, N, richtungGon: phiGon, typ: "Ende" };
      }
    }
  }
  if (roh.length === 0) throw new Error("Keine Achselemente in der Ergebnisliste gefunden");

  const kruemmung = (r: Roh) => (r.typ === "Gerade" || r.R === 0 ? 0 : 1 / r.R);

  const elemente: Element[] = roh.map((r, i) => {
    if (/^Gerade$/i.test(r.typ)) return { typ: "gerade", laenge: r.laenge, kAnfang: 0, kEnde: 0 };
    if (/^(Radius|Kreis|Bogen)/i.test(r.typ)) {
      // Die Länge steht nur auf mm gerundet in der Liste. Bei kleinen Radien ist die
      // Länge aus der Richtungsänderung (0,1 mgon) genauer: L = |R| · |ΔΦ|.
      const ausWinkel = Math.abs(r.R * gonZuRad(r.dPhiGon));
      const genauer = Math.abs(r.R) * gonZuRad(0.00005) < 0.0005 && Math.abs(ausWinkel - r.laenge) < 0.002;
      return { typ: "kreisbogen", laenge: genauer ? ausWinkel : r.laenge, kAnfang: 1 / r.R, kEnde: 1 / r.R };
    }
    if (/^Klothoide/i.test(r.typ)) {
      // Krümmungsverlauf aus den Nachbarelementen; A dient der Kontrolle
      const kA = i > 0 ? kruemmung(roh[i - 1]) : 0;
      const kE = i < roh.length - 1 ? kruemmung(roh[i + 1]) : 0;
      if (r.A > 0) {
        const L = r.A * r.A * Math.abs(kE - kA);
        if (Math.abs(L - r.laenge) > 0.01) {
          warnungen.push(`Klothoide bei Station ${r.station.toFixed(3)}: Länge ${r.laenge} passt nicht zu A = ${r.A} (erwartet ${L.toFixed(3)})`);
        }
      }
      return { typ: "klothoide", laenge: r.laenge, kAnfang: kA, kEnde: kE };
    }
    warnungen.push(`Unbekannter Elementtyp „${r.typ}“ bei Station ${r.station.toFixed(3)} als Gerade übernommen`);
    return { typ: "gerade", laenge: r.laenge, kAnfang: 0, kEnde: 0 };
  });

  // Stationslücken prüfen
  for (let i = 1; i < roh.length; i++) {
    const soll = roh[i - 1].station + roh[i - 1].laenge;
    if (Math.abs(soll - roh[i].station) > 0.002) {
      warnungen.push(`Stationslücke vor Station ${roh[i].station.toFixed(3)} (${(roh[i].station - soll).toFixed(3)} m)`);
    }
  }

  const a = roh[0];
  const definition: AchsDefinition = {
    start: { E: a.E, N: a.N },
    richtung: gonZuRad(a.phiGon),
    stationAnfang: a.station,
    elemente,
  };
  const hauptpunkte: VestraHauptpunkt[] = roh.map((r) => ({ station: r.station, E: r.E, N: r.N, richtungGon: r.phiGon, typ: r.typ }));
  if (ende) hauptpunkte.push(ende);
  return { name, achsnummer: nr ? Number(nr) : null, definition, hauptpunkte, warnungen };
}

/** Vergleicht eine nachgerechnete Achse mit den Hauptpunkten aus VESTRA. */
export function vergleicheMitHauptpunkten(achse: Achse, hauptpunkte: VestraHauptpunkt[]): Achsvergleich {
  // Hauptpunkte gehören zu den Elementgrenzen; dort vergleichen, nicht an der
  // gerundeten Listenstation (bei kleinen Radien verfälscht das die Richtung).
  const grenzen = [...achse.elementStationen(), achse.stationEnde];
  const zuordnen = grenzen.length === hauptpunkte.length;
  const punkte = hauptpunkte.map((h, i) => {
    const st = zuordnen ? grenzen[i] : h.station;
    const p = i < grenzen.length - 1 || !zuordnen ? achse.pose(st) : achse.pose(achse.stationEnde);
    let dt = (p.t / Math.PI) * 200 - h.richtungGon;
    dt = ((dt % 400) + 600) % 400 - 200;
    return { station: h.station, typ: h.typ, dLage: strecke(p.E - h.E, p.N - h.N), dRichtungGon: dt };
  });
  return {
    maxLage: Math.max(0, ...punkte.map((p) => p.dLage)),
    maxRichtungGon: Math.max(0, ...punkte.map((p) => Math.abs(p.dRichtungGon))),
    punkte,
  };
}

