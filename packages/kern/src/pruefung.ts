/**
 * Regelwerksprüfung eines Entwurfs gegen die Werte der Entwurfsklasse.
 */

import type { Gradiente } from "./gradiente";
import { type Entwurfsklasse, klothoidenBereich } from "./regelwerk";
import type { BogenInfo, Meldung } from "./trassierung";

export type PruefEbene = "fehler" | "warnung" | "hinweis" | "ok";

export interface Pruefpunkt {
  ebene: PruefEbene;
  bereich: "lageplan" | "hoehenplan" | "allgemein";
  text: string;
  station?: number;
}

export interface PruefEingabe {
  ekl: Entwurfsklasse;
  boegen?: BogenInfo[];
  gradiente?: Gradiente | null;
  stationAnfang?: number;
  stationEnde?: number;
  /** Meldungen aus Trassierung / Gradientenberechnung */
  meldungen?: { bereich: "lageplan" | "hoehenplan"; meldung: Meldung }[];
}

const pct = (s: number) => `${(s * 100).toFixed(2).replace(".", ",")} %`;
const m = (x: number) => `${Math.round(x).toLocaleString("de-DE")} m`;

export function pruefeEntwurf(e: PruefEingabe): Pruefpunkt[] {
  const ergebnis: Pruefpunkt[] = [];
  const { ekl } = e;

  for (const { bereich, meldung } of e.meldungen ?? []) {
    ergebnis.push({ ebene: meldung.ebene, bereich, text: meldung.text, station: meldung.station });
  }

  // Lageplan
  for (const b of e.boegen ?? []) {
    const nr = `Bogen an Punkt ${b.punkt + 1}`;
    if (b.R < ekl.radiusMin) {
      ergebnis.push({ ebene: "fehler", bereich: "lageplan", station: b.stationAnfang, text: `${nr}: R = ${m(b.R)} unterschreitet den Mindestradius ${m(ekl.radiusMin)} (${ekl.id})` });
    } else if (b.R > ekl.radiusBereich[1]) {
      ergebnis.push({ ebene: "hinweis", bereich: "lageplan", station: b.stationAnfang, text: `${nr}: R = ${m(b.R)} liegt über dem empfohlenen Bereich ${m(ekl.radiusBereich[0])} – ${m(ekl.radiusBereich[1])}` });
    } else {
      ergebnis.push({ ebene: "ok", bereich: "lageplan", station: b.stationAnfang, text: `${nr}: R = ${m(b.R)} im empfohlenen Bereich` });
    }
    const [aMin, aMax] = klothoidenBereich(b.R);
    for (const [name, A] of [["A1", b.A1], ["A2", b.A2]] as const) {
      if (A <= 0) {
        ergebnis.push({ ebene: "warnung", bereich: "lageplan", station: b.stationAnfang, text: `${nr}: ohne Übergangsbogen (${name} = 0) – Klothoide empfohlen` });
      } else if (A < aMin - 1e-6 || A > aMax + 1e-6) {
        ergebnis.push({ ebene: "warnung", bereich: "lageplan", station: b.stationAnfang, text: `${nr}: ${name} = ${A.toFixed(0)} außerhalb R/3 ≤ A ≤ R (${aMin.toFixed(0)} – ${aMax.toFixed(0)})` });
      }
    }
  }

  // Höhenplan
  const g = e.gradiente;
  if (g) {
    g.neigungen.forEach((s, i) => {
      const station = g.nwp[i].station;
      if (Math.abs(s) > ekl.laengsneigungMax + 1e-9) {
        ergebnis.push({ ebene: "fehler", bereich: "hoehenplan", station, text: `Längsneigung ${pct(s)} ab Station ${m(station)} überschreitet ${pct(ekl.laengsneigungMax)}` });
      }
    });
    for (const a of g.ausrundungen) {
      const min = a.art === "kuppe" ? ekl.kuppeMin : ekl.wanneMin;
      const name = a.art === "kuppe" ? "Kuppe" : "Wanne";
      const station = g.nwp[a.nwp].station;
      if (a.H < min) {
        ergebnis.push({ ebene: "fehler", bereich: "hoehenplan", station, text: `${name} an NWP ${a.nwp + 1}: H = ${m(a.H)} unterschreitet ${m(min)}` });
      } else {
        ergebnis.push({ ebene: "ok", bereich: "hoehenplan", station, text: `${name} an NWP ${a.nwp + 1}: H = ${m(a.H)}` });
      }
    }
    for (let i = 1; i < g.nwp.length - 1; i++) {
      const ds = Math.abs(g.neigungen[i] - g.neigungen[i - 1]);
      if (ds > 1e-4 && !((g.nwp[i].H ?? 0) > 0)) {
        ergebnis.push({ ebene: "fehler", bereich: "hoehenplan", station: g.nwp[i].station, text: `NWP ${i + 1}: Neigungswechsel ohne Ausrundung` });
      }
    }
    if (e.stationAnfang !== undefined && e.stationEnde !== undefined) {
      if (g.stationAnfang > e.stationAnfang + 0.01 || g.stationEnde < e.stationEnde - 0.01) {
        ergebnis.push({ ebene: "warnung", bereich: "hoehenplan", text: "Die Gradiente deckt die Achse nicht vollständig ab" });
      }
    }
  } else {
    ergebnis.push({ ebene: "hinweis", bereich: "hoehenplan", text: "Noch keine Gradiente festgelegt" });
  }

  ergebnis.push({ ebene: "hinweis", bereich: "allgemein", text: `Grenzwerte: ${ekl.bezeichnung}, Quelle: ${ekl.quelle}` });
  const rang: Record<PruefEbene, number> = { fehler: 0, warnung: 1, hinweis: 2, ok: 3 };
  return ergebnis.sort((a, b) => rang[a.ebene] - rang[b.ebene] || (a.station ?? 0) - (b.station ?? 0));
}
