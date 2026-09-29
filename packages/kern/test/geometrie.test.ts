import { describe, expect, it } from "vitest";
import {
  Achse,
  bogenGeometrie,
  gerade,
  gonZuRad,
  klothoide,
  klothoideAusParameter,
  kreisbogen,
  poseImElement,
  radZuGon,
  trassiereTangentenpolygon,
  formatStation,
} from "../src";

/** Reihenentwicklung der Einheitsklothoide (lokales System: X längs, Y quer). */
function klothoideReihe(A: number, L: number) {
  const X = L - L ** 5 / (40 * A ** 4) + L ** 9 / (3456 * A ** 8) - L ** 13 / (599040 * A ** 12);
  const Y = L ** 3 / (6 * A ** 2) - L ** 7 / (336 * A ** 6) + L ** 11 / (42240 * A ** 10) - L ** 15 / (9676800 * A ** 14);
  return { X, Y };
}

describe("Elemente", () => {
  it("Gerade läuft in Richtung des Richtungswinkels", () => {
    const p = poseImElement(gerade(100), { E: 0, N: 0, t: gonZuRad(100) }, 100);
    expect(p.E).toBeCloseTo(100, 9);
    expect(p.N).toBeCloseTo(0, 9);
  });

  it("Kreisbogen: Viertelkreis nach rechts", () => {
    const R = 50;
    const p = poseImElement(kreisbogen(R, (Math.PI / 2) * R), { E: 0, N: 0, t: 0 }, (Math.PI / 2) * R);
    expect(p.E).toBeCloseTo(50, 9);
    expect(p.N).toBeCloseTo(50, 9);
    expect(radZuGon(p.t)).toBeCloseTo(100, 9);
  });

  it("Kreisbogen: Linkskurve dreht gegen den Uhrzeigersinn", () => {
    const R = -50;
    const p = poseImElement(kreisbogen(R, (Math.PI / 2) * 50), { E: 0, N: 0, t: 0 }, (Math.PI / 2) * 50);
    expect(p.E).toBeCloseTo(-50, 9);
    expect(p.N).toBeCloseTo(50, 9);
  });

  it("Klothoide stimmt mit der Reihenentwicklung überein", () => {
    const A = 200;
    const R = 400;
    const L = (A * A) / R;
    const e = klothoide(L, Infinity, R);
    const p = poseImElement(e, { E: 0, N: 0, t: 0 }, L);
    const soll = klothoideReihe(A, L);
    expect(p.N).toBeCloseTo(soll.X, 9);
    expect(p.E).toBeCloseTo(soll.Y, 9);
    expect(p.t).toBeCloseTo(L / (2 * R), 12);
  });

  it("Klothoide aus Parameter A", () => {
    const e = klothoideAusParameter(150, Infinity, 300);
    expect(e.laenge).toBeCloseTo(75, 12);
  });
});

describe("Achse", () => {
  const achse = new Achse({
    start: { E: 1000, N: 2000 },
    richtung: gonZuRad(50),
    stationAnfang: 100,
    elemente: [gerade(120), klothoide(80, Infinity, 300), kreisbogen(300, 150), klothoide(80, 300, Infinity), gerade(200)],
  });

  it("Länge und Stationen", () => {
    expect(achse.laenge).toBeCloseTo(630, 9);
    expect(achse.stationEnde).toBeCloseTo(730, 9);
    expect(achse.elementStationen()).toEqual([100, 220, 300, 450, 530]);
  });

  it("Richtung und Lage sind an den Elementübergängen stetig", () => {
    for (const st of achse.elementStationen().slice(1)) {
      const a = achse.pose(st - 1e-7);
      const b = achse.pose(st + 1e-7);
      expect(Math.hypot(a.E - b.E, a.N - b.N)).toBeLessThan(1e-6);
      expect(Math.abs(a.t - b.t)).toBeLessThan(1e-8);
    }
  });

  it("Hauptpunkte werden bezeichnet", () => {
    expect(achse.hauptpunkte().map((h) => h.bezeichnung)).toEqual(["AA", "UA", "BA", "BE", "UE", "AE"]);
  });

  it("Stationieren liefert Station und Versatz zurück", () => {
    for (const [st, q] of [[150, 5], [260, -12.5], [380, 3], [500, 20], [700, -1]]) {
      const p = achse.punkt(st, q);
      const s = achse.stationieren(p.E, p.N);
      expect(s.station).toBeCloseTo(st, 5);
      expect(s.versatz).toBeCloseTo(q, 5);
      expect(s.innerhalb).toBe(true);
    }
  });

  it("Punkt vor dem Achsanfang liegt außerhalb", () => {
    const p = achse.punkt(100);
    const s = achse.stationieren(p.E - 50 * Math.sin(gonZuRad(50)), p.N - 50 * Math.cos(gonZuRad(50)));
    expect(s.innerhalb).toBe(false);
  });
});

describe("Tangentenpolygon", () => {
  const polygon = [
    { E: 0, N: 0 },
    { E: 400, N: 600, R: 500, A1: 200, A2: 250 },
    { E: 1100, N: 700, R: 350, A1: 150, A2: 150 },
    { E: 1300, N: 1400 },
  ];

  it("Die Achse endet im letzten Polygonpunkt und in Richtung der letzten Seite", () => {
    const t = trassiereTangentenpolygon(polygon);
    expect(t.meldungen.filter((m) => m.ebene === "fehler")).toEqual([]);
    const ende = t.achse.pose(t.achse.stationEnde);
    expect(ende.E).toBeCloseTo(1300, 6);
    expect(ende.N).toBeCloseTo(1400, 6);
    expect(ende.t).toBeCloseTo(Math.atan2(200, 700), 9);
  });

  it("Tangentenlängen stimmen mit der Lage der Bogenanfänge überein", () => {
    const t = trassiereTangentenpolygon(polygon);
    const b = t.boegen[0];
    const ua = t.achse.pose(b.stationAnfang);
    expect(Math.hypot(ua.E - 400, ua.N - 600)).toBeCloseTo(b.T1, 6);
    const ue = t.achse.pose(b.stationEnde);
    expect(Math.hypot(ue.E - 400, ue.N - 600)).toBeCloseTo(b.T2, 6);
  });

  it("Symmetrischer Kreisbogen ohne Klothoide: T = R·tan(γ/2)", () => {
    const g = bogenGeometrie(gonZuRad(40), 300)!;
    expect(g.T1).toBeCloseTo(300 * Math.tan(gonZuRad(20)), 9);
    expect(g.T2).toBeCloseTo(g.T1, 9);
  });

  it("Meldet sich überschneidende Bögen", () => {
    const t = trassiereTangentenpolygon([
      { E: 0, N: 0 },
      { E: 0, N: 100, R: 2000, A1: 0, A2: 0 },
      { E: 100, N: 200 },
    ]);
    expect(t.meldungen.some((m) => m.ebene === "fehler" && m.text.includes("überschneiden"))).toBe(true);
  });
});

describe("Formatierung", () => {
  it("Station", () => {
    expect(formatStation(1234.5)).toBe("1+234,500");
    expect(formatStation(0)).toBe("0+000,000");
    expect(formatStation(999.9996)).toBe("1+000,000");
  });
});
