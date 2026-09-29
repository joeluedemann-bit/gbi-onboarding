import { describe, expect, it } from "vitest";
import { Achse, DGM, Gradiente, exportiereLandXml, importiereLandXml, trassiereTangentenpolygon } from "../src";

describe("LandXML", () => {
  const t = trassiereTangentenpolygon(
    [
      { E: 412000, N: 5712000 },
      { E: 412400, N: 5712600, R: 500, A1: 200, A2: 250 },
      { E: 413100, N: 5712700, R: 350, A1: 150, A2: 150 },
      { E: 413300, N: 5713400 },
    ],
    1000,
  );
  const gradiente = new Gradiente([
    { station: 1000, hoehe: 100 },
    { station: 1500, hoehe: 110, H: 6000 },
    { station: 2100, hoehe: 104, H: 5000 },
    { station: t.achse.stationEnde, hoehe: 108 },
  ]);
  const dgm = new DGM([
    { E: 412000, N: 5712000, H: 100 },
    { E: 413500, N: 5712000, H: 105 },
    { E: 413500, N: 5713500, H: 110 },
    { E: 412000, N: 5713500, H: 102 },
  ]);

  const xml = exportiereLandXml({ projektname: "Test & Co", achse: t.achse, gradiente, dgm });

  it("schreibt gültige Grundstruktur", () => {
    expect(xml).toContain('<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2"');
    expect(xml).toContain("Test &amp; Co");
    expect(xml).toContain('spiType="clothoid"');
    expect(xml).toContain('radiusStart="INF"');
  });

  it("Rundreise Export → Import reproduziert die Achse", () => {
    const imp = importiereLandXml(xml);
    expect(imp.warnungen).toEqual([]);
    expect(imp.achsen).toHaveLength(1);
    const a = imp.achsen[0];
    expect(a.maxAbweichung).toBeLessThan(1e-3);
    const achse2 = new Achse(a.definition);
    expect(achse2.stationAnfang).toBeCloseTo(1000, 6);
    expect(achse2.laenge).toBeCloseTo(t.achse.laenge, 3);
    for (const st of [1000, 1234.5, 1600, 2000, t.achse.stationEnde]) {
      const p1 = t.achse.pose(st);
      const p2 = achse2.pose(st);
      expect(Math.hypot(p1.E - p2.E, p1.N - p2.N)).toBeLessThan(2e-3);
    }
  });

  it("Rundreise der Gradiente inkl. Halbmesser", () => {
    const g = importiereLandXml(xml).achsen[0].gradiente;
    expect(g).toHaveLength(4);
    expect(g[1].H).toBeCloseTo(6000, 0);
    expect(g[2].H).toBeCloseTo(5000, 0);
  });

  it("liest Geländepunkte", () => {
    const imp = importiereLandXml(xml);
    expect(imp.gelaende).toHaveLength(4);
    expect(imp.gelaende[2]).toEqual({ E: 413500, N: 5713500, H: 110 });
  });

  it("liest Achsen mit Namensraum-Präfix und Linkskurven", () => {
    const fremd = `<?xml version="1.0"?>
<lx:LandXML xmlns:lx="http://www.landxml.org/schema/LandXML-1.2">
 <lx:Alignments><lx:Alignment name="A1" staStart="0">
  <lx:CoordGeom>
   <lx:Line><lx:Start>0 0</lx:Start><lx:End>100 0</lx:End></lx:Line>
   <lx:Curve rot="ccw" radius="100" length="157.07963267948966"><lx:Start>100 0</lx:Start><lx:Center>100 -100</lx:Center><lx:End>200 -100</lx:End></lx:Curve>
  </lx:CoordGeom>
 </lx:Alignment></lx:Alignments>
</lx:LandXML>`;
    const imp = importiereLandXml(fremd);
    expect(imp.achsen).toHaveLength(1);
    expect(imp.achsen[0].maxAbweichung).toBeLessThan(1e-6);
    const achse = new Achse(imp.achsen[0].definition);
    const ende = achse.pose(achse.stationEnde);
    expect(ende.E).toBeCloseTo(-100, 6);
    expect(ende.N).toBeCloseTo(200, 6);
  });
});
