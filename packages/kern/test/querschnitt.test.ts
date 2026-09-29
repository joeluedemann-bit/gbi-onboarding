import { describe, expect, it } from "vitest";
import {
  Achse,
  DGM,
  Gradiente,
  type Querschnitt,
  deckenbuch,
  deckenbuchCsv,
  dxfBytes,
  dxfText,
  gerade,
  gonZuRad,
  hoehenplanDxf,
  importiereVestraAchsliste,
  kreisbogen,
  lageplanDxf,
  querprofil,
  querprofileDxf,
  randpunkte,
  regelquerschnittDxf,
  spurenBei,
  standardQuerschnitt,
  vergleicheMitHauptpunkten,
} from "../src";

const achse = new Achse({ start: { E: 1000, N: 2000 }, richtung: gonZuRad(100), stationAnfang: 0, elemente: [gerade(100)] });
const gradiente = new Gradiente([
  { station: 0, hoehe: 100 },
  { station: 100, hoehe: 101 },
]);

function rq(): Querschnitt {
  return {
    name: "Test",
    links: [
      { name: "Fahrbahn", art: "fahrbahn", breite: 2.75, neigung: 2.5 },
      { name: "Bord", art: "bordstein", breite: 0.15, neigung: 0, sprung: 0.12 },
      { name: "Gehweg", art: "gehweg", breite: 2, neigung: -2 },
    ],
    rechts: [{ name: "Fahrbahn", art: "fahrbahn", breite: 2.75, neigung: 2.5 }],
    boeschung: { auftrag: 1.5, abtrag: 1.5 },
    aenderungen: [],
    querneigungen: [],
  };
}

describe("Querschnitt und Deckenbuch", () => {
  it("Randpunkte: Breiten, Neigung und Bordanschlag", () => {
    const p = randpunkte(rq(), "links", 0, 100);
    expect(p.map((x) => x.abstand)).toEqual([-2.75, -2.75, -2.75, -2.9, -4.9]);
    expect(p[0].hoehe).toBeCloseTo(100 - 0.06875, 9);
    expect(p[2].hoehe).toBeCloseTo(p[1].hoehe + 0.12, 9);
    expect(p[4].hoehe).toBeCloseTo(p[3].hoehe + 0.04, 9); // Gehweg steigt 2 % nach außen
  });

  it("Aufweitung wird linear interpoliert", () => {
    const q = rq();
    q.aenderungen.push({ seite: "rechts", spur: 0, stationVon: 20, stationBis: 40, breiteVon: 2.75, breiteBis: 5.75 });
    expect(spurenBei(q, "rechts", 10)[0].breite).toBeCloseTo(2.75, 9);
    expect(spurenBei(q, "rechts", 30)[0].breite).toBeCloseTo(4.25, 9);
    expect(spurenBei(q, "rechts", 40)[0].breite).toBeCloseTo(5.75, 9);
    expect(spurenBei(q, "rechts", 41)[0].breite).toBeCloseTo(2.75, 9);
  });

  it("Bordabsenkung mit Übergängen", () => {
    const q = rq();
    q.aenderungen.push({ seite: "links", spur: 1, stationVon: 50, stationBis: 55, sprung: 0.03, uebergang: 1 });
    expect(spurenBei(q, "links", 48)[1].sprung).toBeCloseTo(0.12, 9);
    expect(spurenBei(q, "links", 49.5)[1].sprung).toBeCloseTo(0.075, 9);
    expect(spurenBei(q, "links", 52)[1].sprung).toBeCloseTo(0.03, 9);
  });

  it("Verwindung: Querneigung linear zwischen Querneigungspunkten", () => {
    const q = rq();
    q.querneigungen = [
      { station: 10, links: 2.5, rechts: 2.5 },
      { station: 30, links: -2.5, rechts: 2.5 },
    ];
    expect(spurenBei(q, "links", 20)[0].neigung).toBeCloseTo(0, 9);
    expect(spurenBei(q, "links", 40)[0].neigung).toBeCloseTo(-2.5, 9);
  });

  it("Deckenbuch liefert Koordinaten senkrecht zur Achse", () => {
    const db = deckenbuch(achse, gradiente, rq(), 50);
    expect(db.map((z) => z.station)).toEqual([0, 50, 100]);
    const z = db[1];
    const achsPunkt = z.punkte.find((p) => p.art === "achse")!;
    expect(achsPunkt.hoehe).toBeCloseTo(100.5, 9);
    const links = z.punkte[0];
    // Achse läuft nach Osten: links = Norden
    expect(links.E).toBeCloseTo(1050, 9);
    expect(links.N).toBeCloseTo(2004.9, 9);
  });

  it("Querprofil mit Böschung zum Gelände (ebenes Gelände 1 m unter der Achse)", () => {
    const pts = [];
    for (let x = 900; x <= 1200; x += 20) for (let y = 1950; y <= 2050; y += 20) pts.push({ E: x, N: y, H: 99 });
    const dgm = new DGM(pts);
    const g = new Gradiente([
      { station: 0, hoehe: 100 },
      { station: 100, hoehe: 100 },
    ]);
    const qp = querprofil(achse, g, rq(), 50, dgm);
    const fuss = qp.punkte.filter((p) => p.art === "boeschung");
    expect(fuss).toHaveLength(2);
    const rechts = fuss.find((p) => p.abstand > 0)!;
    const rand = 100 - 2.75 * 0.025;
    expect(rechts.hoehe).toBeCloseTo(99, 4);
    expect(rechts.abstand).toBeCloseTo(2.75 + (rand - 99) * 1.5, 3);
    expect(qp.auftrag).toBeGreaterThan(5);
    expect(qp.abtrag).toBeCloseTo(0, 6);
  });

  it("Standardvorlage ist vollständig", () => {
    const q = standardQuerschnitt();
    expect(q.links.length).toBeGreaterThan(2);
    expect(q.rechts.some((s) => s.art === "bordstein")).toBe(true);
  });
});

describe("DXF-Pläne", () => {
  const daten = { projektname: "Test Äöü", achsname: "Achse 1", achse, gradiente, querschnitt: rq() };

  it("Grundaufbau R12 mit Layern und Umlauten als Unicode-Escape", () => {
    const dxf = lageplanDxf(daten, { deckenhoehen: true });
    expect(dxf.startsWith("0\r\nSECTION\r\n2\r\nHEADER")).toBe(true);
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("BORDSTEIN");
    expect(dxf).toContain("DECKENHOEHE");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(dxfText("Höhe")).toBe("Höhe");
    expect(dxfText("α")).toBe("\\U+03B1");
    expect([...dxfBytes("Hö€")]).toEqual([0x48, 0xf6, 0x80]);
  });

  it("Höhenplan, Querprofile und RQ werden erzeugt", () => {
    expect(hoehenplanDxf(daten)).toContain("GRADIENTE");
    expect(querprofileDxf(daten, { intervall: 50 })).toContain("Station");
    expect(regelquerschnittDxf(daten)).toContain("Regelquerschnitt");
  });

  it("Deckenbuch als CSV", () => {
    const csv = deckenbuchCsv(daten, 50).split("\r\n");
    expect(csv[0]).toBe("Station;Punkt;Abstand;Höhe;Rechtswert;Hochwert");
    expect(csv.length).toBeGreaterThan(10);
  });
});

describe("VESTRA-Achsliste", () => {
  // Liste im Format der VESTRA-Ergebnisliste, aus einer bekannten Geometrie erzeugt
  const soll = new Achse({
    start: { E: 5000, N: 1000 },
    richtung: gonZuRad(50),
    stationAnfang: 0,
    elemente: [gerade(20), kreisbogen(-30, 15), gerade(10), kreisbogen(100, 25), gerade(5)],
  });
  const f = (x: number, n: number) => x.toFixed(n);
  const zeilen = ["    Bezeichnung: Teststraße", " ", "    Ergebnisliste, Achsnummer     7", " "];
  const st = soll.elementStationen();
  soll.elemente.forEach((e, i) => {
    const p = soll.pose(st[i]);
    const ende = soll.pose(st[i] + e.laenge);
    const R = e.typ === "gerade" ? 0 : 1 / e.kAnfang;
    const dphi = ((ende.t - p.t + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    zeilen.push(` ${e.typ === "gerade" ? "Gerade" : "Radius"}  ${f(st[i], 3)}  ${f(R, 3)}  0.000  ${f((p.t * 200) / Math.PI, 4)}  ${f(p.E, 3)}  ${f(p.N, 3)}`);
    zeilen.push(`                 ${f(e.laenge, 3)}  0.000  0.000  ${f((dphi * 200) / Math.PI, 4)}  0.000  0.000`);
    zeilen.push(`                                   ${f(e.laenge, 3)}  0.0000  0.000  0.000`);
  });
  const e = soll.pose(soll.stationEnde);
  zeilen.push(`               ${f(soll.stationEnde, 3)}  0.000  0.000  ${f((e.t * 200) / Math.PI, 4)}  ${f(e.E, 3)}  ${f(e.N, 3)}`);

  it("liest Elemente, Name und Achsnummer und rechnet die Hauptpunkte auf mm nach", () => {
    const l = importiereVestraAchsliste(zeilen.join("\n"));
    expect(l.name).toBe("Teststraße");
    expect(l.achsnummer).toBe(7);
    expect(l.warnungen).toEqual([]);
    expect(l.definition.elemente.map((x) => x.typ)).toEqual(["gerade", "kreisbogen", "gerade", "kreisbogen", "gerade"]);
    expect(l.definition.elemente[1].kAnfang).toBeCloseTo(-1 / 30, 12);
    const v = vergleicheMitHauptpunkten(new Achse(l.definition), l.hauptpunkte);
    expect(v.maxLage).toBeLessThan(0.001);
    expect(v.maxRichtungGon).toBeLessThan(0.0002);
  });
});
