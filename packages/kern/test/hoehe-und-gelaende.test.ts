import { describe, expect, it } from "vitest";
import {
  DGM,
  ENTWURFSKLASSEN,
  Gradiente,
  automatischeRadien,
  beispielProjekt,
  berechneProjekt,
  gradienteAusGelaende,
  trassiereTangentenpolygon,
} from "../src";

describe("Gradiente", () => {
  const g = new Gradiente([
    { station: 0, hoehe: 100 },
    { station: 300, hoehe: 112, H: 5000 }, // +4 % → −2 %: Kuppe
    { station: 700, hoehe: 104, H: 4000 }, // −2 % → +1 %: Wanne
    { station: 1000, hoehe: 107 },
  ]);

  it("Tangentenneigungen", () => {
    expect(g.neigungen[0]).toBeCloseTo(0.04, 12);
    expect(g.neigungen[1]).toBeCloseTo(-0.02, 12);
    expect(g.neigungen[2]).toBeCloseTo(0.01, 12);
  });

  it("Ausrundung: T, Stich und Art", () => {
    const [kuppe, wanne] = g.ausrundungen;
    expect(kuppe.art).toBe("kuppe");
    expect(kuppe.T).toBeCloseTo(150, 9);
    expect(kuppe.f).toBeCloseTo(2.25, 9);
    expect(wanne.art).toBe("wanne");
    expect(wanne.T).toBeCloseTo(60, 9);
  });

  it("Höhe im NWP liegt um den Stich unter bzw. über dem Tangentenschnitt", () => {
    expect(g.hoehe(300)).toBeCloseTo(112 - 2.25, 9);
    expect(g.hoehe(700)).toBeCloseTo(104 + 0.45, 9);
  });

  it("Höhe und Neigung sind an den Ausrundungsgrenzen stetig", () => {
    for (const a of g.ausrundungen) {
      for (const st of [a.stationAnfang, a.stationEnde]) {
        expect(g.hoehe(st - 1e-6)).toBeCloseTo(g.hoehe(st + 1e-6), 6);
        expect(g.neigung(st - 1e-6)).toBeCloseTo(g.neigung(st + 1e-6), 6);
      }
    }
  });

  it("Scheitel der Kuppe", () => {
    const k = g.ausrundungen[0];
    // Neigung 0 bei x = s1 · H ab Ausrundungsanfang
    expect(k.scheitel!.station).toBeCloseTo(150 + 0.04 * 5000, 9);
    expect(g.neigung(k.scheitel!.station)).toBeCloseTo(0, 9);
  });

  it("Meldet sich überschneidende Ausrundungen", () => {
    const h = new Gradiente([
      { station: 0, hoehe: 100 },
      { station: 100, hoehe: 105, H: 10000 },
      { station: 200, hoehe: 100, H: 10000 },
      { station: 300, hoehe: 105 },
    ]);
    expect(h.meldungen.some((m) => m.ebene === "fehler")).toBe(true);
  });
});

describe("DGM", () => {
  it("Reproduziert eine schiefe Ebene exakt", () => {
    const punkte = [];
    for (let x = 0; x <= 100; x += 10) for (let y = 0; y <= 100; y += 10) punkte.push({ E: 5000 + x + (y % 20) * 0.3, N: 8000 + y, H: 0 });
    for (const p of punkte) p.H = 50 + 0.1 * (p.E - 5000) - 0.05 * (p.N - 8000);
    const dgm = new DGM(punkte);
    expect(dgm.dreiecke.length).toBeGreaterThan(150);
    for (const [E, N] of [[5012.3, 8045.6], [5080, 8020], [5050.5, 8099]]) {
      expect(dgm.hoehe(E, N)).toBeCloseTo(50 + 0.1 * (E - 5000) - 0.05 * (N - 8000), 9);
    }
    expect(dgm.hoehe(4000, 8000)).toBeNull();
  });
});

describe("Automatik", () => {
  it("Radienvorschlag liefert eine fehlerfreie Trassierung im empfohlenen Bereich", () => {
    const ekl = ENTWURFSKLASSEN.EKL3;
    const polygon = [
      { E: 0, N: 0 },
      { E: 500, N: 700 },
      { E: 1300, N: 800 },
      { E: 1600, N: 1600 },
    ];
    const v = automatischeRadien(polygon, ekl);
    expect(v.hinweise).toEqual([]);
    for (const p of v.punkte.slice(1, -1)) {
      expect(p.R).toBeGreaterThanOrEqual(ekl.radiusBereich[0]);
      expect(p.R).toBeLessThanOrEqual(ekl.radiusBereich[1]);
      expect(p.A1!).toBeGreaterThanOrEqual(p.R! / 3);
    }
    const t = trassiereTangentenpolygon(v.punkte);
    expect(t.meldungen.filter((m) => m.ebene === "fehler")).toEqual([]);
  });

  it("Gradiente aus dem Gelände ist regelwerkskonform", () => {
    const p = beispielProjekt();
    const e = berechneProjekt(p);
    expect(e.achse).not.toBeNull();
    const ekl = ENTWURFSKLASSEN[p.ekl];
    const { nwp } = gradienteAusGelaende(e.achse!, e.dgm!, ekl);
    const g = new Gradiente(nwp);
    expect(g.meldungen.filter((m) => m.ebene === "fehler")).toEqual([]);
    for (const s of g.neigungen) expect(Math.abs(s)).toBeLessThanOrEqual(ekl.laengsneigungMax + 1e-9);
    for (const a of g.ausrundungen) expect(a.H).toBeGreaterThanOrEqual(a.art === "kuppe" ? ekl.kuppeMin : ekl.wanneMin);
    expect(g.stationAnfang).toBeCloseTo(e.achse!.stationAnfang, 1);
    expect(g.stationEnde).toBeCloseTo(e.achse!.stationEnde, 1);
  });
});

describe("Projektberechnung", () => {
  it("Beispielprojekt ohne Lagefehler", () => {
    const e = berechneProjekt(beispielProjekt());
    expect(e.fehler).toEqual([]);
    expect(e.pruefung.filter((p) => p.ebene === "fehler" && p.bereich === "lageplan")).toEqual([]);
    expect(e.gelaendeschnitt.length).toBeGreaterThan(10);
  });
});

describe("Erdmassen", () => {
  it("Konstanter Damm: V = L · h · (b + n·h)", async () => {
    const { schaetzeErdmassen } = await import("../src");
    const g = new Gradiente([
      { station: 0, hoehe: 102 },
      { station: 100, hoehe: 102 },
    ]);
    const gelaende = [0, 25, 50, 75, 100].map((station) => ({ station, hoehe: 100 }));
    const m = schaetzeErdmassen(g, gelaende, { kronenbreite: 10, boeschung: 1.5 });
    expect(m.auftrag).toBeCloseTo(100 * 2 * (10 + 1.5 * 2), 9);
    expect(m.abtrag).toBe(0);
    expect(m.maxDamm).toBeCloseTo(2, 9);
  });
});
