/**
 * LandXML 1.2: Export und Import von Achsen (CoordGeom), Gradienten (Profile)
 * und Geländemodellen (Surface). Damit lassen sich Daten mit VESTRA und
 * anderen Entwurfsprogrammen austauschen.
 *
 * Hinweis: LandXML schreibt Koordinaten in der Reihenfolge „Hochwert Rechtswert“.
 */

import { XMLParser } from "fast-xml-parser";
import { Achse, type AchsDefinition } from "./achse";
import { type Element, type Pose, kruemmung, poseImElement, radius } from "./elemente";
import type { Gelaendepunkt, DGM } from "./dgm";
import type { Gradiente, Neigungswechsel } from "./gradiente";
import { normiereRichtung, richtungswinkel, strecke } from "./winkel";

export interface LandXmlExportDaten {
  projektname: string;
  achsname?: string;
  achse: Achse;
  gradiente?: Gradiente | null;
  dgm?: DGM | null;
}

const f = (x: number, stellen = 4) => x.toFixed(stellen);
const pt = (p: { E: number; N: number }) => `${f(p.N)} ${f(p.E)}`;
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const radiusText = (k: number) => (k === 0 ? "INF" : f(Math.abs(radius(k))));

/** Schnittpunkt der Tangenten zweier Posen (null bei nahezu parallelen Tangenten). */
function tangentenschnitt(a: Pose, b: Pose): { E: number; N: number } | null {
  const dA = { E: Math.sin(a.t), N: Math.cos(a.t) };
  const dB = { E: Math.sin(b.t), N: Math.cos(b.t) };
  const kreuz = dA.E * dB.N - dA.N * dB.E;
  if (Math.abs(kreuz) < 1e-9) return null;
  const wE = b.E - a.E;
  const wN = b.N - a.N;
  const s = (wE * dB.N - wN * dB.E) / kreuz;
  if (s < 0) return null;
  return { E: a.E + s * dA.E, N: a.N + s * dA.N };
}

export function exportiereLandXml(d: LandXmlExportDaten): string {
  const { achse } = d;
  const name = esc(d.achsname ?? "Achse 1");
  const zeilen: string[] = [];
  const jetzt = new Date();
  zeilen.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  zeilen.push(
    `<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${jetzt.toISOString().slice(0, 10)}" time="${jetzt.toISOString().slice(11, 19)}">`,
  );
  zeilen.push(`  <Units><Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="HPA" angularUnit="grads" directionUnit="grads"/></Units>`);
  zeilen.push(`  <Project name="${esc(d.projektname)}"/>`);
  zeilen.push(`  <Application name="GBI Straßenplanung" manufacturer="GBI" version="0.1"/>`);

  if (d.dgm) zeilen.push(...surfaceXml(d.dgm));

  zeilen.push(`  <Alignments name="${esc(d.projektname)}">`);
  zeilen.push(`    <Alignment name="${name}" length="${f(achse.laenge)}" staStart="${f(achse.stationAnfang)}">`);
  zeilen.push(`      <CoordGeom>`);
  const stationen = achse.elementStationen();
  achse.elemente.forEach((e, i) => {
    const st = stationen[i];
    const a = achse.pose(st);
    const b = achse.pose(st + e.laenge);
    const rot = e.kAnfang + e.kEnde > 0 ? "cw" : "ccw";
    const pi = tangentenschnitt(a, b);
    if (e.typ === "gerade") {
      zeilen.push(`        <Line length="${f(e.laenge)}" staStart="${f(st)}"><Start>${pt(a)}</Start><End>${pt(b)}</End></Line>`);
    } else if (e.typ === "kreisbogen") {
      const R = 1 / e.kAnfang;
      const mitte = achse.punkt(st, R);
      zeilen.push(
        `        <Curve rot="${rot}" crvType="arc" radius="${f(Math.abs(R))}" length="${f(e.laenge)}" staStart="${f(st)}"><Start>${pt(a)}</Start><Center>${pt(mitte)}</Center><End>${pt(b)}</End>${pi ? `<PI>${pt(pi)}</PI>` : ""}</Curve>`,
      );
    } else {
      zeilen.push(
        `        <Spiral length="${f(e.laenge)}" radiusStart="${radiusText(e.kAnfang)}" radiusEnd="${radiusText(e.kEnde)}" rot="${rot}" spiType="clothoid" staStart="${f(st)}"><Start>${pt(a)}</Start>${pi ? `<PI>${pt(pi)}</PI>` : ""}<End>${pt(b)}</End></Spiral>`,
      );
    }
  });
  zeilen.push(`      </CoordGeom>`);

  if (d.gradiente) {
    const g = d.gradiente;
    zeilen.push(`      <Profile name="${name}">`);
    zeilen.push(`        <ProfAlign name="Gradiente">`);
    g.nwp.forEach((p, i) => {
      const a = g.ausrundungen.find((x) => x.nwp === i);
      if (a) zeilen.push(`          <ParaCurve length="${f(2 * a.T)}">${f(p.station)} ${f(p.hoehe)}</ParaCurve>`);
      else zeilen.push(`          <PVI>${f(p.station)} ${f(p.hoehe)}</PVI>`);
    });
    zeilen.push(`        </ProfAlign>`);
    zeilen.push(`      </Profile>`);
  }
  zeilen.push(`    </Alignment>`);
  zeilen.push(`  </Alignments>`);
  zeilen.push(`</LandXML>`);
  return zeilen.join("\n") + "\n";
}

function surfaceXml(dgm: DGM): string[] {
  const z: string[] = [];
  z.push(`  <Surfaces>`);
  z.push(`    <Surface name="Gelände">`);
  z.push(`      <Definition surfType="TIN">`);
  z.push(`        <Pnts>`);
  dgm.punkte.forEach((p, i) => z.push(`          <P id="${i + 1}">${f(p.N)} ${f(p.E)} ${f(p.H)}</P>`));
  z.push(`        </Pnts>`);
  z.push(`        <Faces>`);
  for (const [a, b, c] of dgm.dreiecke) z.push(`          <F>${a + 1} ${b + 1} ${c + 1}</F>`);
  z.push(`        </Faces>`);
  z.push(`      </Definition>`);
  z.push(`    </Surface>`);
  z.push(`  </Surfaces>`);
  return z;
}

// ---------------------------------------------------------------------------
// Import

export interface ImportierteAchse {
  name: string;
  definition: AchsDefinition;
  gradiente: Neigungswechsel[];
  /** Größte Abweichung der nachgerechneten Elementendpunkte von den Datei-Koordinaten (m) */
  maxAbweichung: number;
}

export interface LandXmlImport {
  achsen: ImportierteAchse[];
  gelaende: Gelaendepunkt[];
  warnungen: string[];
}

type Knoten = Record<string, unknown>;

function kinder(knoten: Knoten, tag: string): Knoten[] {
  const inhalt = knoten[tag];
  return Array.isArray(inhalt) ? (inhalt as Knoten[]) : [];
}

function tagName(k: Knoten): string | undefined {
  return Object.keys(k).find((x) => x !== ":@" && x !== "#text");
}

function attr(k: Knoten, name: string): string | undefined {
  const a = k[":@"] as Record<string, string> | undefined;
  return a?.[`@_${name}`];
}

function text(k: Knoten, tag: string): string {
  const inhalt = kinder(k, tag);
  return inhalt.map((x) => (x["#text"] !== undefined ? String(x["#text"]) : "")).join(" ").trim();
}

function suche(knoten: Knoten[], tag: string): Knoten[] {
  const ergebnis: Knoten[] = [];
  for (const k of knoten) {
    const t = tagName(k);
    if (!t) continue;
    if (t === tag) ergebnis.push(k);
    ergebnis.push(...suche(kinder(k, t), tag));
  }
  return ergebnis;
}

function zahlen(s: string): number[] {
  return s.split(/[\s,]+/).filter(Boolean).map(Number);
}

function punkt(k: Knoten, tag: string): { E: number; N: number } | null {
  const z = zahlen(text(k, tag));
  return z.length >= 2 && Number.isFinite(z[0]) && Number.isFinite(z[1]) ? { N: z[0], E: z[1] } : null;
}

function radiusAttr(k: Knoten, name: string): number {
  const v = attr(k, name);
  if (v === undefined || /^inf/i.test(v)) return Infinity;
  const r = Number(v);
  return r === 0 ? Infinity : r;
}

export function importiereLandXml(xml: string): LandXmlImport {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    removeNSPrefix: true,
  });
  const baum = parser.parse(xml) as Knoten[];
  const warnungen: string[] = [];
  const achsen: ImportierteAchse[] = [];

  for (const al of suche(baum, "Alignment")) {
    const name = attr(al, "name") ?? `Achse ${achsen.length + 1}`;
    const stationAnfang = Number(attr(al, "staStart") ?? 0) || 0;
    const coordGeom = kinder(al, "Alignment").find((k) => tagName(k) === "CoordGeom");
    if (!coordGeom) {
      warnungen.push(`${name}: keine CoordGeom-Geometrie gefunden`);
      continue;
    }
    const elemente: Element[] = [];
    const sollEnden: ({ E: number; N: number } | null)[] = [];
    let start: Pose | null = null;

    for (const k of kinder(coordGeom, "CoordGeom")) {
      const tag = tagName(k)!;
      const pStart = punktAusKind(k, tag, "Start");
      const pEnde = punktAusKind(k, tag, "End");
      let e: Element;
      if (tag === "Line") {
        const L = Number(attr(k, "length")) || (pStart && pEnde ? strecke(pEnde.E - pStart.E, pEnde.N - pStart.N) : 0);
        e = { typ: "gerade", laenge: L, kAnfang: 0, kEnde: 0 };
      } else if (tag === "Curve") {
        const vz = attr(k, "rot") === "cw" ? 1 : -1;
        const R = Number(attr(k, "radius"));
        let L = Number(attr(k, "length"));
        if (!(L > 0) && pStart && pEnde) {
          const sehne = strecke(pEnde.E - pStart.E, pEnde.N - pStart.N);
          L = 2 * R * Math.asin(Math.min(1, sehne / (2 * R)));
        }
        e = { typ: "kreisbogen", laenge: L, kAnfang: vz / R, kEnde: vz / R };
      } else if (tag === "Spiral") {
        const vz = attr(k, "rot") === "cw" ? 1 : -1;
        const typ = attr(k, "spiType");
        if (typ && typ !== "clothoid") warnungen.push(`${name}: Übergangsbogen „${typ}“ wird als Klothoide behandelt`);
        e = {
          typ: "klothoide",
          laenge: Number(attr(k, "length")),
          kAnfang: vz * kruemmung(radiusAttr(k, "radiusStart")),
          kEnde: vz * kruemmung(radiusAttr(k, "radiusEnd")),
        };
      } else {
        warnungen.push(`${name}: Element „${tag}“ wird nicht unterstützt und übersprungen`);
        continue;
      }
      if (!(e.laenge > 0)) {
        warnungen.push(`${name}: Element „${tag}“ ohne Länge übersprungen`);
        continue;
      }
      if (!start && pStart) {
        // Anfangsrichtung aus der Sehne: tatsächliche minus lokale Sehnenrichtung
        const lokal = poseImElement(e, { E: 0, N: 0, t: 0 }, e.laenge);
        if (pEnde) {
          const tIst = richtungswinkel(pEnde.E - pStart.E, pEnde.N - pStart.N);
          const tLokal = richtungswinkel(lokal.E, lokal.N);
          start = { E: pStart.E, N: pStart.N, t: normiereRichtung(tIst - tLokal) };
        }
      }
      elemente.push(e);
      sollEnden.push(pEnde);
    }
    if (!start || elemente.length === 0) {
      warnungen.push(`${name}: Anfangspunkt oder -richtung nicht bestimmbar`);
      continue;
    }
    const definition: AchsDefinition = { start: { E: start.E, N: start.N }, richtung: start.t, stationAnfang, elemente };
    const achse = new Achse(definition);
    let maxAbweichung = 0;
    const stationen = achse.elementStationen();
    elemente.forEach((e, i) => {
      const soll = sollEnden[i];
      if (!soll) return;
      const ist = achse.pose(stationen[i] + e.laenge);
      maxAbweichung = Math.max(maxAbweichung, strecke(ist.E - soll.E, ist.N - soll.N));
    });
    if (maxAbweichung > 0.01) {
      warnungen.push(`${name}: nachgerechnete Geometrie weicht bis ${maxAbweichung.toFixed(3)} m von den Dateikoordinaten ab`);
    }
    achsen.push({ name, definition, gradiente: leseProfil(al), maxAbweichung });
  }

  const gelaende: Gelaendepunkt[] = [];
  for (const pnts of suche(baum, "Pnts")) {
    for (const p of kinder(pnts, "Pnts")) {
      if (tagName(p) !== "P") continue;
      const z = zahlen(text(p, "P"));
      if (z.length >= 3) gelaende.push({ N: z[0], E: z[1], H: z[2] });
    }
  }
  return { achsen, gelaende, warnungen };
}

function punktAusKind(k: Knoten, tag: string, kind: string): { E: number; N: number } | null {
  const knoten = kinder(k, tag).find((x) => tagName(x) === kind);
  return knoten ? punkt(knoten, kind) : null;
}

function leseProfil(al: Knoten): Neigungswechsel[] {
  const profAlign = suche(kinder(al, "Alignment"), "ProfAlign")[0];
  if (!profAlign) return [];
  const roh: { station: number; hoehe: number; L?: number; R?: number }[] = [];
  for (const k of kinder(profAlign, "ProfAlign")) {
    const tag = tagName(k);
    if (!tag) continue;
    const z = zahlen(text(k, tag));
    if (z.length < 2) continue;
    if (tag === "PVI") roh.push({ station: z[0], hoehe: z[1] });
    else if (tag === "ParaCurve") roh.push({ station: z[0], hoehe: z[1], L: Number(attr(k, "length")) });
    else if (tag === "CircCurve") roh.push({ station: z[0], hoehe: z[1], R: Number(attr(k, "radius")) });
  }
  return roh.map((p, i) => {
    if (i === 0 || i === roh.length - 1) return { station: p.station, hoehe: p.hoehe };
    const s1 = (p.hoehe - roh[i - 1].hoehe) / (p.station - roh[i - 1].station);
    const s2 = (roh[i + 1].hoehe - p.hoehe) / (roh[i + 1].station - p.station);
    const ds = Math.abs(s2 - s1);
    let H = 0;
    if (p.L && ds > 0) H = p.L / ds;
    else if (p.R) H = p.R;
    return { station: p.station, hoehe: p.hoehe, H: Math.round(H * 1000) / 1000 };
  });
}
