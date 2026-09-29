/**
 * Planerzeugung als DXF: Lageplan, Deckenhöhenplan, Höhenplan, Querprofile, Regelquerschnitt.
 *
 * Alle Pläne werden im Modellbereich in Metern gezeichnet. Höhen- und
 * Querprofilpläne sind maßstabsgerecht aufbereitet (Längen 1:1 in m, Höhen
 * im Höhenplan mit Überhöhung), damit sie im Layout mit festem Maßstab
 * geplottet werden können.
 */

import type { Achse } from "./achse";
import type { DGM } from "./dgm";
import { DxfZeichnung } from "./dxf";
import { formatStation, formatZahl } from "./format";
import type { Gradiente } from "./gradiente";
import {
  type Querschnitt,
  type Seite,
  deckenbuch,
  deckenbuchStationen,
  querprofil,
  randlinien,
  randpunkte,
  spurenBei,
} from "./querschnitt";

export interface PlanDaten {
  projektname: string;
  achsname: string;
  achse: Achse;
  gradiente?: Gradiente | null;
  querschnitt?: Querschnitt | null;
  dgm?: DGM | null;
}

const LAYER_ART: Record<string, { layer: string; farbe: number }> = {
  fahrbahn: { layer: "RAND_FAHRBAHN", farbe: 7 },
  rinne: { layer: "RINNE", farbe: 8 },
  bordstein: { layer: "BORDSTEIN", farbe: 30 },
  gehweg: { layer: "RAND_GEHWEG", farbe: 7 },
  radweg: { layer: "RAND_RADWEG", farbe: 1 },
  parken: { layer: "RAND_PARKEN", farbe: 7 },
  bankett: { layer: "BANKETT", farbe: 3 },
  gruen: { layer: "GRUEN", farbe: 3 },
  mulde: { layer: "MULDE", farbe: 5 },
};

const f2 = (x: number) => formatZahl(x, 2);
const f3 = (x: number) => formatZahl(x, 3);

function neueZeichnung() {
  return new DxfZeichnung([
    { name: "ACHSE", farbe: 1, linientyp: "DASHDOT" },
    { name: "ACHSE_STATION", farbe: 1 },
    { name: "ACHSE_HAUPTPUNKT", farbe: 1 },
    { name: "BESCHRIFTUNG", farbe: 7 },
    { name: "BOESCHUNG", farbe: 3, linientyp: "DASHED" },
    { name: "GELAENDE", farbe: 32 },
    { name: "GRADIENTE", farbe: 1 },
    { name: "DECKENHOEHE", farbe: 5 },
    { name: "RAHMEN", farbe: 7 },
    { name: "BAND", farbe: 8 },
    ...Object.values(LAYER_ART).map((l) => ({ name: l.layer, farbe: l.farbe })),
  ]);
}

function schriftfeld(z: DxfZeichnung, x: number, y: number, titel: string, d: PlanDaten, massstab: string) {
  const b = 180;
  const h = 40;
  z.polylinie("RAHMEN", [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }], true);
  z.linie("RAHMEN", x, y + 25, x + b, y + 25);
  z.text("BESCHRIFTUNG", x + 4, y + 30, 5, titel);
  z.text("BESCHRIFTUNG", x + 4, y + 16, 3.5, d.projektname);
  z.text("BESCHRIFTUNG", x + 4, y + 8, 3, `${d.achsname} · Maßstab ${massstab}`);
  z.text("BESCHRIFTUNG", x + 4, y + 2, 2.5, `Erstellt mit GBI Straßenplanung · ${new Date().toLocaleDateString("de-DE")}`);
}

/** Lageplan mit Achse, Stationierung, Spurrändern, Bordsteinen und Böschungslinien (Koordinaten im Landessystem). */
export function lageplanDxf(d: PlanDaten, optionen: { deckenhoehen?: boolean; intervall?: number } = {}): string {
  const z = neueZeichnung();
  const { achse } = d;
  // Achse
  z.polylinie("ACHSE", achse.polylinie(2, 0.005).map((p) => ({ x: p.E, y: p.N })));
  for (const h of achse.hauptpunkte()) {
    const q = 1.5;
    z.linie("ACHSE_HAUPTPUNKT", h.E - q * Math.cos(h.t), h.N + q * Math.sin(h.t), h.E + q * Math.cos(h.t), h.N - q * Math.sin(h.t));
  }
  const texte: (() => void)[] = [];
  for (const st of achse.rasterStationen(20)) {
    const p = achse.pose(st);
    const q = Math.abs(st % 100) < 1e-6 ? 1.5 : 0.8;
    z.linie("ACHSE_STATION", p.E - q * Math.cos(p.t), p.N + q * Math.sin(p.t), p.E + q * Math.cos(p.t), p.N - q * Math.sin(p.t));
    const winkel = 90 - (p.t * 180) / Math.PI; // Richtungswinkel → mathematischer Winkel
    const txt = achse.punkt(st, -2);
    texte.push(() => z.text("ACHSE_STATION", txt.E, txt.N, 0.8, formatStation(st, 0), { drehung: winkel - 90, ausrichtung: "rechts", vertikalMitte: true, freistellen: true }));
  }

  if (d.querschnitt) {
    for (const l of randlinien(achse, d.querschnitt, 1)) {
      const la = LAYER_ART[l.art] ?? { layer: "RAND" };
      z.polylinie(la.layer, l.punkte.map((p) => ({ x: p.E, y: p.N })));
    }
    // Böschungsfuß/-oberkante
    if (d.gradiente && d.dgm) {
      const stationen = deckenbuchStationen(achse, d.querschnitt, 5, d.gradiente).filter(
        (s) => s >= d.gradiente!.stationAnfang && s <= d.gradiente!.stationEnde,
      );
      for (const seite of ["links", "rechts"] as Seite[]) {
        const linie: { x: number; y: number }[] = [];
        for (const st of stationen) {
          const qp = querprofil(achse, d.gradiente, d.querschnitt, st, d.dgm);
          const b = qp.punkte.find((p) => p.art === "boeschung" && p.seite === seite);
          if (b) {
            const p = achse.punkt(st, b.abstand);
            linie.push({ x: p.E, y: p.N });
          } else if (linie.length > 1) {
            z.polylinie("BOESCHUNG", linie.splice(0));
          } else linie.length = 0;
        }
        if (linie.length > 1) z.polylinie("BOESCHUNG", linie);
      }
    }
    if (optionen.deckenhoehen && d.gradiente) {
      // Beschriftet wird nur, wo Platz ist: zuerst Bordoberkanten und Fahrbahnränder, dann die übrigen Ränder
      const rang = (p: { art: string; oben?: boolean; name: string }) =>
        p.oben ? 0 : p.art === "fahrbahn" ? 1 : p.name.endsWith("außen") ? 2 : 3;
      for (const zeile of deckenbuch(achse, d.gradiente, d.querschnitt, optionen.intervall ?? 10)) {
        const pose = achse.pose(zeile.station);
        const gewaehlt: number[] = [];
        for (const p of [...zeile.punkte].filter((p) => p.art !== "achse" && !(p.name.endsWith("innen") && !p.oben)).sort((a, b) => rang(a) - rang(b))) {
          if (gewaehlt.some((a) => Math.abs(a - p.abstand) < 0.6)) continue;
          gewaehlt.push(p.abstand);
          z.kreis("DECKENHOEHE", p.E, p.N, 0.06);
          // Text quer zur Achse, außen neben dem Punkt
          const winkel = 90 - (pose.t * 180) / Math.PI;
          const nach = p.abstand < 0 ? -1 : 1;
          const t = achse.punkt(zeile.station, p.abstand + nach * 0.15);
          texte.push(() => z.text("DECKENHOEHE", t.E, t.N, 0.3, f2(p.hoehe), { drehung: winkel - 90 + (nach < 0 ? 180 : 0), vertikalMitte: true, freistellen: true }));
        }
      }
    }
  }
  texte.forEach((t) => t());
  return z.toString();
}

/** Höhenplan mit Gelände, Gradiente, Ausrundungen und Beschriftungsband (Längen 1:1000, Höhen 1:100 → Überhöhung 10). */
export function hoehenplanDxf(d: PlanDaten, optionen: { ueberhoehung?: number; gelaende?: { station: number; hoehe: number }[] } = {}): string {
  const z = neueZeichnung();
  const g = d.gradiente;
  if (!g) throw new Error("Für den Höhenplan wird eine Gradiente benötigt");
  const u = optionen.ueberhoehung ?? 10;
  const s0 = d.achse.stationAnfang;
  const s1 = d.achse.stationEnde;
  const hoehen = [...g.nwp.map((p) => p.hoehe), ...(optionen.gelaende ?? []).map((p) => p.hoehe)];
  const bezug = Math.floor(Math.min(...hoehen) - 2);
  const x = (s: number) => s - s0;
  const y = (h: number) => (h - bezug) * u;
  const bandHoehe = 8;
  const baender = ["Neigungen", "Gradiente", "Gelände", "Station", "Krümmung"];

  // Bänder
  const bandY = (i: number) => -(i + 1) * bandHoehe;
  for (let i = 0; i <= baender.length; i++) z.linie("BAND", -30, -i * bandHoehe, x(s1), -i * bandHoehe);
  baender.forEach((t, i) => z.text("BAND", -29, bandY(i) + bandHoehe / 2, 2.2, t, { vertikalMitte: true }));
  z.linie("BAND", 0, 0, 0, -baender.length * bandHoehe);
  z.linie("BAND", -30, 0, -30, -baender.length * bandHoehe);
  z.text("BESCHRIFTUNG", -29, 3, 2.5, `Bezugshöhe ${formatZahl(bezug, 2)} m NHN · Überhöhung 1:${u}`);

  // Gelände
  if (optionen.gelaende && optionen.gelaende.length > 1) {
    z.polylinie("GELAENDE", optionen.gelaende.map((p) => ({ x: x(p.station), y: y(p.hoehe) })));
  }
  // Gradiente und Tangentenzug
  z.polylinie("GRADIENTE", g.polylinie(1).map((p) => ({ x: x(p.station), y: y(p.hoehe) })));
  z.polylinie("BAND", g.nwp.map((p) => ({ x: x(p.station), y: y(p.hoehe) })));

  const texte: (() => void)[] = [];
  // Stationen im Raster und an Hauptpunkten
  const stationen = new Set<number>(d.achse.rasterStationen(20));
  g.nwp.forEach((p) => stationen.add(p.station));
  g.ausrundungen.forEach((a) => {
    stationen.add(a.stationAnfang);
    stationen.add(a.stationEnde);
  });
  for (const st of [...stationen].filter((s) => s >= g.stationAnfang && s <= g.stationEnde).sort((a, b) => a - b)) {
    const xs = x(st);
    z.linie("BAND", xs, 0, xs, y(g.hoehe(st)));
    texte.push(() => z.text("BAND", xs + 0.6, bandY(1) + 0.6, 1.8, f3(g.hoehe(st)), { drehung: 90 }));
    const gel = optionen.gelaende ? interpoliere(optionen.gelaende, st) : null;
    if (gel !== null) texte.push(() => z.text("BAND", xs + 0.6, bandY(2) + 0.6, 1.8, f2(gel), { drehung: 90 }));
    texte.push(() => z.text("BAND", xs + 0.6, bandY(3) + 0.6, 1.8, formatStation(st, 2), { drehung: 90 }));
  }
  // Neigungen
  g.neigungen.forEach((s, i) => {
    const a = x(g.nwp[i].station);
    const b = x(g.nwp[i + 1].station);
    z.linie("BAND", a, bandY(0), b, bandY(0) + bandHoehe);
    texte.push(() => z.text("BAND", (a + b) / 2, bandY(0) + bandHoehe / 2, 2, `${s >= 0 ? "+" : ""}${formatZahl(s * 100, 2)} %  L = ${f2(g.nwp[i + 1].station - g.nwp[i].station)}`, { ausrichtung: "mitte", vertikalMitte: true, freistellen: true }));
  });
  // Ausrundungen
  for (const a of g.ausrundungen) {
    const p = g.nwp[a.nwp];
    texte.push(() =>
      z.text("GRADIENTE", x(p.station), y(p.hoehe) + (a.art === "kuppe" ? 6 : -9), 2, `${a.art === "kuppe" ? "Hk" : "Hw"} = ${formatZahl(a.H, 0)}  T = ${f2(a.T)}  f = ${f3(a.f)}`, { ausrichtung: "mitte", freistellen: true }),
    );
  }
  // Krümmungsband
  const kMitte = bandY(4) + bandHoehe / 2;
  let kMax = 0;
  const kp = d.achse.polylinie(2);
  kp.forEach((p) => (kMax = Math.max(kMax, Math.abs(p.k))));
  z.polylinie("ACHSE", kp.map((p) => ({ x: x(p.station), y: kMitte + (kMax ? (p.k / kMax) * (bandHoehe * 0.4) : 0) })));
  texte.forEach((t) => t());
  schriftfeld(z, x(s1) - 180, bandY(baender.length) - 50, "Höhenplan", d, `1:1000/1:${1000 / u}`);
  return z.toString();
}

function interpoliere(reihe: { station: number; hoehe: number }[], st: number): number | null {
  for (let i = 1; i < reihe.length; i++) {
    const a = reihe[i - 1];
    const b = reihe[i];
    if (st >= a.station && st <= b.station) return a.hoehe + ((b.hoehe - a.hoehe) * (st - a.station)) / (b.station - a.station || 1);
  }
  return null;
}

/** Querprofile im Raster (unverzerrt, 1 Einheit = 1 m) mit Höhen- und Abstandsband. */
export function querprofileDxf(d: PlanDaten, optionen: { intervall?: number; spalten?: number } = {}): string {
  const { achse, gradiente: g, querschnitt: q } = d;
  if (!g || !q) throw new Error("Für Querprofile werden Gradiente und Querschnitt benötigt");
  const z = neueZeichnung();
  const stationen = deckenbuchStationen(achse, q, optionen.intervall ?? 20, g).filter((s) => s >= g.stationAnfang && s <= g.stationEnde);
  const spalten = optionen.spalten ?? 3;
  const zelleB = 40;
  const zelleH = 30;
  stationen.forEach((st, i) => {
    const qp = querprofil(achse, g, q, st, d.dgm);
    const ox = (i % spalten) * zelleB + zelleB / 2;
    const oy = -Math.floor(i / spalten) * zelleH;
    const bezug = Math.floor(Math.min(qp.hoehe, ...qp.gelaende.map((p) => p.hoehe), ...qp.punkte.map((p) => p.hoehe)) - 1);
    const X = (a: number) => ox + a;
    const Y = (h: number) => oy + (h - bezug);
    // Bezugslinie und Band
    const breite = Math.max(...qp.punkte.map((p) => Math.abs(p.abstand)), ...qp.gelaende.map((p) => Math.abs(p.abstand)), 5);
    z.linie("BAND", X(-breite), Y(bezug), X(breite), Y(bezug));
    z.text("BESCHRIFTUNG", X(0), Y(bezug) - 5.2, 1.2, `Station ${formatStation(st, 3)}`, { ausrichtung: "mitte" });
    z.text("BESCHRIFTUNG", X(-breite), Y(bezug) + 0.3, 0.6, `NHN ${formatZahl(bezug, 1)}`);
    if (qp.gelaende.length > 1) z.polylinie("GELAENDE", qp.gelaende.map((p) => ({ x: X(p.abstand), y: Y(p.hoehe) })));
    z.polylinie("RAND_FAHRBAHN", qp.punkte.map((p) => ({ x: X(p.abstand), y: Y(p.hoehe) })));
    z.linie("ACHSE", X(0), Y(bezug), X(0), Y(qp.hoehe) + 1.5);
    const texte: (() => void)[] = [];
    // Höhen und Abstände im Band unter der Bezugslinie (senkrecht, nach unten laufend)
    const beschriftet: number[] = [];
    for (const p of qp.punkte) {
      if (p.art !== "achse" && p.name.endsWith("innen") && !p.oben) continue;
      z.linie("BAND", X(p.abstand), Y(bezug), X(p.abstand), Y(p.hoehe));
      if (beschriftet.some((a) => Math.abs(a - p.abstand) < 0.4)) continue;
      beschriftet.push(p.abstand);
      texte.push(() => z.text("BAND", X(p.abstand), Y(bezug) - 0.2, 0.3, `${f3(p.hoehe)}  ${f2(p.abstand)}`, { drehung: 90, ausrichtung: "rechts", vertikalMitte: true }));
    }
    texte.push(() => z.text("BESCHRIFTUNG", X(0), Y(bezug) - 6.3, 0.7, `Auftrag ${f2(qp.auftrag)} m²  Abtrag ${f2(qp.abtrag)} m²`, { ausrichtung: "mitte" }));
    texte.forEach((t) => t());
  });
  const zeilen = Math.ceil(stationen.length / spalten);
  schriftfeld(z, spalten * zelleB - 180, -zeilen * zelleH - 50, "Querprofile", d, "1:100");
  return z.toString();
}

/** Regelquerschnitt: Spuren mit Breiten, Neigungen und Höhensprüngen (1 Einheit = 1 m). */
export function regelquerschnittDxf(d: PlanDaten, station?: number): string {
  const q = d.querschnitt;
  if (!q) throw new Error("Es ist kein Querschnitt festgelegt");
  const z = neueZeichnung();
  const st = station ?? d.achse.stationAnfang;
  const texte: (() => void)[] = [];
  for (const seite of ["links", "rechts"] as Seite[]) {
    const pts = randpunkte(q, seite, st, 0);
    z.polylinie("RAND_FAHRBAHN", [{ x: 0, y: 0 }, ...pts.map((p) => ({ x: p.abstand, y: p.hoehe * 5 }))]);
    let a0 = 0;
    spurenBei(q, seite, st).forEach((s) => {
      const vz = seite === "links" ? -1 : 1;
      const a1 = a0 + s.breite;
      const xm = (vz * (a0 + a1)) / 2;
      z.linie("BAND", vz * a1, -2.2, vz * a1, -1.2);
      if (s.breite >= 0.9) {
        texte.push(() => z.text("BESCHRIFTUNG", xm, -2, 0.25, f2(s.breite), { ausrichtung: "mitte" }));
        texte.push(() => z.text("BESCHRIFTUNG", xm, 0.6, 0.2, s.name, { ausrichtung: "mitte" }));
        if (s.art !== "bordstein") texte.push(() => z.text("BESCHRIFTUNG", xm, 0.95, 0.2, `${formatZahl(s.neigung, 1)} %`, { ausrichtung: "mitte" }));
      } else {
        // Schmale Spuren (Rinne, Bord): senkrecht beschriften
        texte.push(() => z.text("BESCHRIFTUNG", xm, -2.1, 0.18, f2(s.breite), { drehung: 90, vertikalMitte: true }));
        const zusatz = s.art === "bordstein" ? (s.sprung ? ` (${formatZahl(s.sprung * 100, 0)} cm)` : "") : ` ${formatZahl(s.neigung, 1)} %`;
        texte.push(() => z.text("BESCHRIFTUNG", xm, 0.5, 0.18, `${s.name}${zusatz}`, { drehung: 90, vertikalMitte: true }));
      }
      a0 = a1;
    });
  }
  z.linie("BAND", -12, -2.2, 12, -2.2);
  z.linie("ACHSE", 0, -2.5, 0, 2);
  texte.forEach((t) => t());
  z.text("BESCHRIFTUNG", 0, 3, 0.5, `Regelquerschnitt ${q.name}`, { ausrichtung: "mitte" });
  z.text("BESCHRIFTUNG", 0, 2.4, 0.25, "Höhen 5-fach überhöht", { ausrichtung: "mitte" });
  return z.toString();
}

/** Deckenbuch als CSV (Semikolon, deutsches Zahlenformat) für Absteckung und Excel. */
export function deckenbuchCsv(d: PlanDaten, intervall = 10): string {
  const { achse, gradiente: g, querschnitt: q } = d;
  if (!g || !q) throw new Error("Für das Deckenbuch werden Gradiente und Querschnitt benötigt");
  const zeilen = ["Station;Punkt;Abstand;Höhe;Rechtswert;Hochwert"];
  const zahl = (x: number, n = 3) => x.toFixed(n).replace(".", ",");
  for (const z of deckenbuch(achse, g, q, intervall)) {
    for (const p of z.punkte) {
      zeilen.push([zahl(z.station), `${p.seite === "links" && p.art !== "achse" ? "L " : p.art === "achse" ? "" : "R "}${p.name}`, zahl(p.abstand), zahl(p.hoehe), zahl(p.E), zahl(p.N)].join(";"));
    }
  }
  return zeilen.join("\r\n") + "\r\n";
}
