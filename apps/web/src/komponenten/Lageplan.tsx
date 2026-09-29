import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DGM,
  ENTWURFSKLASSEN,
  type PolygonPunkt,
  type Projekt,
  type Projektergebnis,
  formatStation,
  formatZahl,
} from "@gbi/kern";
import type { Modus } from "../zustand";
import { useGroesse } from "./useGroesse";

interface Props {
  projekt: Projekt;
  ergebnis: Projektergebnis;
  modus: Modus;
  auswahl: number | null;
  onAuswahl: (i: number | null) => void;
  aendern: (f: (p: Projekt) => Projekt, o?: { zusammenfassen?: boolean }) => void;
  abschliessen: () => void;
}

interface Sicht {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FARBE = { gerade: "#1e293b", kreisbogen: "#2563eb", klothoide: "#ea580c" } as const;

export function Lageplan({ projekt, ergebnis, modus, auswahl, onAuswahl, aendern, abschliessen }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, groesse] = useGroesse<HTMLDivElement>();
  const [sicht, setSicht] = useState<Sicht | null>(null);
  const [maus, setMaus] = useState<{ E: number; N: number } | null>(null);
  const ziehen = useRef<{ art: "punkt"; index: number } | { art: "schwenken"; x: number; y: number; sicht: Sicht } | null>(null);

  const polygon = projekt.achse.modus === "polygon" ? projekt.achse.polygon : null;
  const achse = ergebnis.achse;

  const grenzen = useMemo(() => {
    const pts: { E: number; N: number }[] = [];
    if (polygon) pts.push(...polygon);
    if (achse) pts.push(...achse.polylinie(50));
    if (pts.length < 2 && ergebnis.dgm) {
      const g = ergebnis.dgm.grenzen;
      pts.push({ E: g.minE, N: g.minN }, { E: g.maxE, N: g.maxN });
    }
    if (pts.length === 0) return null;
    const minE = Math.min(...pts.map((p) => p.E));
    const maxE = Math.max(...pts.map((p) => p.E));
    const minN = Math.min(...pts.map((p) => p.N));
    const maxN = Math.max(...pts.map((p) => p.N));
    return { minE, maxE, minN, maxN };
  }, [polygon, achse, ergebnis.dgm]);

  const einpassen = useCallback(() => {
    if (!groesse.w || !groesse.h) return;
    const g = grenzen ?? { minE: 0, maxE: 1000, minN: 0, maxN: 1000 };
    const breite = Math.max(g.maxE - g.minE, 50) * 1.15;
    const hoehe = Math.max(g.maxN - g.minN, 50) * 1.15;
    const faktor = Math.max(breite / groesse.w, hoehe / groesse.h);
    const w = groesse.w * faktor;
    const h = groesse.h * faktor;
    const cE = (g.minE + g.maxE) / 2;
    const cN = (g.minN + g.maxN) / 2;
    setSicht({ x: cE - w / 2, y: -cN - h / 2, w, h });
  }, [grenzen, groesse.w, groesse.h]);

  // Beim ersten Anzeigen und bei Größenänderung des Fensters einpassen bzw. Seitenverhältnis halten
  useEffect(() => {
    if (!groesse.w || !groesse.h) return;
    setSicht((s) => {
      if (!s) return null;
      const h = (s.w * groesse.h) / groesse.w;
      return { ...s, y: s.y + (s.h - h) / 2, h };
    });
  }, [groesse.w, groesse.h]);
  useEffect(() => {
    if (!sicht && groesse.w) einpassen();
  }, [sicht, groesse.w, einpassen]);

  const massstab = sicht && groesse.w ? sicht.w / groesse.w : 1; // Welteinheiten je Pixel

  const weltPunkt = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { E: 0, N: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { E: p.x, N: -p.y };
  };

  const punktSetzen = (i: number, E: number, N: number, zusammenfassen: boolean) => {
    aendern(
      (p) => {
        if (p.achse.modus !== "polygon") return p;
        const polygon = p.achse.polygon.map((q, j) => (j === i ? { ...q, E, N } : q));
        return { ...p, achse: { modus: "polygon", polygon } };
      },
      { zusammenfassen },
    );
  };

  const onPointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!sicht || ev.button !== 0) return;
    const ziel = (ev.target as Element).closest("[data-punkt]");
    if (ziel && polygon) {
      const index = Number(ziel.getAttribute("data-punkt"));
      onAuswahl(index);
      ziehen.current = { art: "punkt", index };
      svgRef.current!.setPointerCapture(ev.pointerId);
      return;
    }
    if (modus === "polygon" && polygon) {
      const w = weltPunkt(ev.clientX, ev.clientY);
      const ekl = ENTWURFSKLASSEN[projekt.ekl];
      const R = ekl.radiusBereich[0];
      aendern((p) => {
        if (p.achse.modus !== "polygon") return p;
        const alt = p.achse.polygon;
        const neu: PolygonPunkt[] = alt.map((q, j) =>
          j === alt.length - 1 && alt.length >= 2 && !q.R ? { ...q, R, A1: Math.round(R / 2), A2: Math.round(R / 2) } : q,
        );
        neu.push({ E: Math.round(w.E * 100) / 100, N: Math.round(w.N * 100) / 100 });
        return { ...p, achse: { modus: "polygon", polygon: neu } };
      });
      onAuswahl(polygon.length);
      return;
    }
    onAuswahl(null);
    ziehen.current = { art: "schwenken", x: ev.clientX, y: ev.clientY, sicht };
    svgRef.current!.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const w = weltPunkt(ev.clientX, ev.clientY);
    setMaus(w);
    const z = ziehen.current;
    if (!z) return;
    if (z.art === "punkt") {
      punktSetzen(z.index, Math.round(w.E * 100) / 100, Math.round(w.N * 100) / 100, true);
    } else {
      const f = z.sicht.w / groesse.w;
      setSicht({ ...z.sicht, x: z.sicht.x - (ev.clientX - z.x) * f, y: z.sicht.y - (ev.clientY - z.y) * f });
    }
  };

  const onPointerUp = () => {
    if (ziehen.current?.art === "punkt") abschliessen();
    ziehen.current = null;
  };

  const onWheel = (ev: React.WheelEvent<SVGSVGElement>) => {
    if (!sicht) return;
    const w = weltPunkt(ev.clientX, ev.clientY);
    const f = Math.exp(ev.deltaY * 0.0015);
    setSicht({
      x: w.E - (w.E - sicht.x) * f,
      y: -w.N - (-w.N - sicht.y) * f,
      w: sicht.w * f,
      h: sicht.h * f,
    });
  };

  const onContextMenu = (ev: React.MouseEvent<SVGSVGElement>) => {
    const ziel = (ev.target as Element).closest("[data-punkt]");
    if (!ziel || !polygon || polygon.length <= 2) return;
    ev.preventDefault();
    const index = Number(ziel.getAttribute("data-punkt"));
    aendern((p) => (p.achse.modus === "polygon" ? { ...p, achse: { modus: "polygon", polygon: p.achse.polygon.filter((_, j) => j !== index) } } : p));
    onAuswahl(null);
  };

  const mausInfo = useMemo(() => {
    if (!maus) return null;
    const st = achse ? achse.stationieren(maus.E, maus.N) : null;
    const h = ergebnis.dgm?.hoehe(maus.E, maus.N) ?? null;
    return { st, h };
  }, [maus, achse, ergebnis.dgm]);

  const stationsmarken = useMemo(() => {
    if (!achse) return [];
    const intervall = massstab > 4 ? 500 : massstab > 1.5 ? 200 : 100;
    return achse.rasterStationen(intervall).filter((s) => Math.abs(s % intervall) < 1e-6 || s === achse.stationAnfang).map((station) => ({ station, pose: achse.pose(station) }));
  }, [achse, massstab]);

  const elementLinien = useMemo(() => {
    if (!achse) return [];
    const linien: { typ: keyof typeof FARBE; d: string }[] = [];
    const pts = achse.polylinie(10, 0.05 * Math.max(massstab, 0.2));
    let aktuell: { typ: keyof typeof FARBE; pts: string[] } | null = null;
    for (const p of pts) {
      const typ = achse.elemente[p.elementIndex]?.typ ?? "gerade";
      const s = `${p.E.toFixed(3)},${(-p.N).toFixed(3)}`;
      if (!aktuell || aktuell.typ !== typ) {
        if (aktuell) {
          aktuell.pts.push(s);
          linien.push({ typ: aktuell.typ, d: "M" + aktuell.pts.join("L") });
        }
        aktuell = { typ, pts: [s] };
      } else aktuell.pts.push(s);
    }
    if (aktuell) linien.push({ typ: aktuell.typ, d: "M" + aktuell.pts.join("L") });
    return linien;
  }, [achse, massstab]);

  const px = (n: number) => n * massstab;

  return (
    <div className="plan">
      <div className="plan-titel">
        Lageplan
        <span className="legende">
          <i style={{ background: FARBE.gerade }} /> Gerade <i style={{ background: FARBE.kreisbogen }} /> Kreisbogen{" "}
          <i style={{ background: FARBE.klothoide }} /> Klothoide
        </span>
        <button className="klein" onClick={einpassen} title="Gesamte Achse anzeigen">
          Einpassen
        </button>
      </div>
      <div className="zeichenflaeche" ref={box}>
      {sicht && (
        <svg
          ref={svgRef}
          className={`zeichnung modus-${modus}`}
          viewBox={`${sicht.x} ${sicht.y} ${sicht.w} ${sicht.h}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setMaus(null)}
          onWheel={onWheel}
          onContextMenu={onContextMenu}
        >
          {ergebnis.dgm && <Gelaende dgm={ergebnis.dgm} />}

          {polygon && polygon.length > 1 && (
            <polyline
              className="polygon"
              points={polygon.map((p) => `${p.E},${-p.N}`).join(" ")}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {elementLinien.map((l, i) => (
            <path key={i} d={l.d} className="achslinie" stroke={FARBE[l.typ]} vectorEffect="non-scaling-stroke" />
          ))}

          {achse?.hauptpunkte().map((h, i) => (
            <line
              key={i}
              x1={h.E - px(7) * Math.cos(h.t)}
              y1={-(h.N + px(7) * Math.sin(h.t))}
              x2={h.E + px(7) * Math.cos(h.t)}
              y2={-(h.N - px(7) * Math.sin(h.t))}
              className="hauptpunkt"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {stationsmarken.map(({ station, pose }) => {
            const q = px(16);
            const x = pose.E - q * Math.cos(pose.t);
            const y = -(pose.N + q * Math.sin(pose.t));
            return (
              <g key={station}>
                <line x1={pose.E} y1={-pose.N} x2={x} y2={y} className="stationsstrich" vectorEffect="non-scaling-stroke" />
                <text x={x} y={y} fontSize={px(11)} className="stationstext" textAnchor="end" dominantBaseline="middle">
                  {formatStation(station, 0)}
                </text>
              </g>
            );
          })}

          {polygon?.map((p, i) => (
            <g key={i} data-punkt={i} className={`pi ${auswahl === i ? "gewaehlt" : ""}`}>
              <circle cx={p.E} cy={-p.N} r={px(7)} vectorEffect="non-scaling-stroke" />
              <text x={p.E + px(10)} y={-p.N - px(10)} fontSize={px(12)}>
                P{i + 1}
                {p.R && i > 0 && i < polygon.length - 1 ? ` R=${p.R}` : ""}
              </text>
            </g>
          ))}
        </svg>
      )}
      </div>
      <div className="statuszeile">
        {mausInfo && maus ? (
          <>
            E {formatZahl(maus.E, 2)} · N {formatZahl(maus.N, 2)}
            {mausInfo.h !== null && <> · Gelände {formatZahl(mausInfo.h, 2)} m</>}
            {mausInfo.st?.innerhalb && (
              <>
                {" "}
                · Station {formatStation(mausInfo.st.station, 2)} · Abstand {formatZahl(mausInfo.st.versatz, 2)} m
              </>
            )}
          </>
        ) : modus === "polygon" ? (
          "Klick: Polygonpunkt anfügen · Ziehen: Punkt verschieben · Rechtsklick: Punkt löschen"
        ) : (
          "Ziehen: verschieben · Mausrad: zoomen · Punkt anklicken: bearbeiten"
        )}
        {projekt.achse.modus === "elemente" && <span className="hinweis"> · Achse aus Import (Elementfolge, nicht per Polygon bearbeitbar)</span>}
      </div>
    </div>
  );
}

/** Geländedarstellung: Höhenschichten und Höhenlinien (5 m, Zählkurven 25 m). */
const Gelaende = memo(function Gelaende({ dgm }: { dgm: DGM }) {
  const { dreiecke, linien, zaehllinien } = useMemo(() => {
    const { minH, maxH } = dgm.grenzen;
    const spanne = Math.max(maxH - minH, 1);
    const farben = [
      [220, 236, 214],
      [199, 226, 190],
      [233, 226, 190],
      [226, 205, 170],
      [214, 190, 160],
    ];
    const farbe = (h: number) => {
      const t = Math.min(0.9999, Math.max(0, (h - minH) / spanne)) * (farben.length - 1);
      const i = Math.floor(t);
      const f = t - i;
      const c = farben[i].map((v, k) => Math.round(v + (farben[i + 1][k] - v) * f));
      return `rgb(${c.join(",")})`;
    };
    const P = dgm.punkte;
    const dreiecke = dgm.dreiecke.map(([a, b, c]) => ({
      d: `M${P[a].E},${-P[a].N}L${P[b].E},${-P[b].N}L${P[c].E},${-P[c].N}Z`,
      farbe: farbe((P[a].H + P[b].H + P[c].H) / 3),
    }));

    const aequidistanz = spanne > 150 ? 10 : spanne > 40 ? 5 : 1;
    const linien: string[] = [];
    const zaehllinien: string[] = [];
    for (const [a, b, c] of dgm.dreiecke) {
      const v = [P[a], P[b], P[c]];
      const lo = Math.ceil(Math.min(v[0].H, v[1].H, v[2].H) / aequidistanz) * aequidistanz;
      const hi = Math.max(v[0].H, v[1].H, v[2].H);
      for (let z = lo; z <= hi; z += aequidistanz) {
        const schnitt: string[] = [];
        for (const [p, q] of [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]) {
          if ((p.H - z) * (q.H - z) < 0) {
            const t = (z - p.H) / (q.H - p.H);
            schnitt.push(`${(p.E + t * (q.E - p.E)).toFixed(2)},${(-(p.N + t * (q.N - p.N))).toFixed(2)}`);
          }
        }
        if (schnitt.length === 2) (Math.abs(z % (aequidistanz * 5)) < 1e-9 ? zaehllinien : linien).push(`M${schnitt[0]}L${schnitt[1]}`);
      }
    }
    return { dreiecke, linien: linien.join(""), zaehllinien: zaehllinien.join("") };
  }, [dgm]);

  return (
    <g className="gelaende">
      {dreiecke.map((d, i) => (
        <path key={i} d={d.d} fill={d.farbe} stroke={d.farbe} strokeWidth={0.5} />
      ))}
      <path d={linien} className="hoehenlinie" vectorEffect="non-scaling-stroke" />
      <path d={zaehllinien} className="zaehllinie" vectorEffect="non-scaling-stroke" />
    </g>
  );
});
