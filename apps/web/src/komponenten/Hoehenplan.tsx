import { useMemo, useRef, useState } from "react";
import {
  ENTWURFSKLASSEN,
  type Neigungswechsel,
  type Projekt,
  type Projektergebnis,
  formatProzent,
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

const RAND = { links: 58, rechts: 16, oben: 14, unten: 78 };
const BAND = 34; // Höhe des Krümmungsbands

function schoeneSchrittweite(spanne: number, ziel: number) {
  const roh = spanne / ziel;
  const p = 10 ** Math.floor(Math.log10(roh));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= roh) return f * p;
  return 10 * p;
}

export function Hoehenplan({ projekt, ergebnis, modus, auswahl, onAuswahl, aendern, abschliessen }: Props) {
  const [box, groesse] = useGroesse<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const ziehen = useRef<number | null>(null);
  const [maus, setMaus] = useState<{ station: number; hoehe: number } | null>(null);
  const { achse, gradiente, gelaendeschnitt } = ergebnis;
  const nwp = projekt.gradiente;

  const bereich = useMemo(() => {
    const stationen: number[] = [];
    const hoehen: number[] = [];
    if (achse) stationen.push(achse.stationAnfang, achse.stationEnde);
    for (const p of nwp) {
      stationen.push(p.station);
      hoehen.push(p.hoehe);
    }
    for (const p of gelaendeschnitt) hoehen.push(p.hoehe);
    if (gradiente) for (const p of gradiente.polylinie(20)) hoehen.push(p.hoehe);
    if (stationen.length === 0) stationen.push(0, 1000);
    if (hoehen.length === 0) hoehen.push(0, 100);
    let s0 = Math.min(...stationen);
    let s1 = Math.max(...stationen);
    if (s1 - s0 < 10) s1 = s0 + 10;
    const ds = (s1 - s0) * 0.02;
    s0 -= ds;
    s1 += ds;
    let h0 = Math.min(...hoehen);
    let h1 = Math.max(...hoehen);
    if (h1 - h0 < 5) {
      h0 -= 2.5;
      h1 += 2.5;
    }
    const dh = (h1 - h0) * 0.12;
    return { s0, s1, h0: h0 - dh, h1: h1 + dh };
  }, [achse, nwp, gelaendeschnitt, gradiente]);

  const breite = Math.max(groesse.w - RAND.links - RAND.rechts, 10);
  const hoehe = Math.max(groesse.h - RAND.oben - RAND.unten, 10);
  const x = (s: number) => RAND.links + ((s - bereich.s0) / (bereich.s1 - bereich.s0)) * breite;
  const y = (h: number) => RAND.oben + (1 - (h - bereich.h0) / (bereich.h1 - bereich.h0)) * hoehe;
  const station = (px: number) => bereich.s0 + ((px - RAND.links) / breite) * (bereich.s1 - bereich.s0);
  const hoeheBei = (py: number) => bereich.h0 + (1 - (py - RAND.oben) / hoehe) * (bereich.h1 - bereich.h0);
  const ueberhoehung = breite / (bereich.s1 - bereich.s0) > 0 ? (hoehe / (bereich.h1 - bereich.h0)) / (breite / (bereich.s1 - bereich.s0)) : 1;

  const lokal = (ev: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { px: ev.clientX - r.left, py: ev.clientY - r.top };
  };

  const setzeNwp = (liste: Neigungswechsel[], zusammenfassen = false) =>
    aendern((p) => ({ ...p, gradiente: liste }), { zusammenfassen });

  const onPointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (ev.button !== 0) return;
    const ziel = (ev.target as Element).closest("[data-nwp]");
    if (ziel) {
      const i = Number(ziel.getAttribute("data-nwp"));
      onAuswahl(i);
      ziehen.current = i;
      svgRef.current!.setPointerCapture(ev.pointerId);
      return;
    }
    if (modus === "nwp") {
      const { px, py } = lokal(ev);
      const st = Math.round(station(px) * 100) / 100;
      const h = Math.round(hoeheBei(py) * 1000) / 1000;
      const ekl = ENTWURFSKLASSEN[projekt.ekl];
      const neu = [...nwp, { station: st, hoehe: h, H: ekl.kuppeMin }].sort((a, b) => a.station - b.station);
      // Endpunkte erhalten keine Ausrundung
      if (neu.length > 0) {
        neu[0] = { ...neu[0], H: 0 };
        neu[neu.length - 1] = { ...neu[neu.length - 1], H: 0 };
        for (let i = 1; i < neu.length - 1; i++) if (!neu[i].H) neu[i] = { ...neu[i], H: ekl.kuppeMin };
      }
      setzeNwp(neu);
      onAuswahl(neu.findIndex((p) => p.station === st));
      return;
    }
    onAuswahl(null);
  };

  const onPointerMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const { px, py } = lokal(ev);
    setMaus({ station: station(px), hoehe: hoeheBei(py) });
    const i = ziehen.current;
    if (i === null) return;
    const neu = nwp.map((p) => ({ ...p }));
    const p = neu[i];
    p.hoehe = Math.round(hoeheBei(py) * 1000) / 1000;
    if (i > 0 && i < neu.length - 1) {
      const st = station(px);
      p.station = Math.round(Math.min(Math.max(st, neu[i - 1].station + 1), neu[i + 1].station - 1) * 100) / 100;
    }
    setzeNwp(neu, true);
  };

  const onPointerUp = () => {
    if (ziehen.current !== null) abschliessen();
    ziehen.current = null;
  };

  // Gitter
  const hSchritt = schoeneSchrittweite(bereich.h1 - bereich.h0, Math.max(3, hoehe / 45));
  const sSchritt = schoeneSchrittweite(bereich.s1 - bereich.s0, Math.max(3, breite / 110));
  const hLinien: number[] = [];
  for (let h = Math.ceil(bereich.h0 / hSchritt) * hSchritt; h <= bereich.h1; h += hSchritt) hLinien.push(h);
  const sLinien: number[] = [];
  for (let s = Math.ceil(bereich.s0 / sSchritt) * sSchritt; s <= bereich.s1; s += sSchritt) sLinien.push(s);

  const gradPfad = gradiente ? "M" + gradiente.polylinie(Math.max(1, (bereich.s1 - bereich.s0) / 800)).map((p) => `${x(p.station).toFixed(1)},${y(p.hoehe).toFixed(1)}`).join("L") : "";
  const gelPfad = gelaendeschnitt.length > 1 ? "M" + gelaendeschnitt.map((p) => `${x(p.station).toFixed(1)},${y(p.hoehe).toFixed(1)}`).join("L") : "";

  // Krümmungsband
  const bandY0 = RAND.oben + hoehe + 36 + BAND / 2;
  const kruemmung = useMemo(() => {
    if (!achse) return "";
    let kMax = 0;
    const pts = achse.polylinie(20);
    for (const p of pts) kMax = Math.max(kMax, Math.abs(p.k));
    if (kMax === 0) kMax = 1;
    return pts.map((p) => ({ s: p.station, k: p.k / kMax }));
  }, [achse]);
  const bandPfad = Array.isArray(kruemmung) && kruemmung.length ? "M" + kruemmung.map((p) => `${x(p.s).toFixed(1)},${(bandY0 - (p.k * BAND) / 2).toFixed(1)}`).join("L") : "";

  const mausWerte = maus && gradiente && maus.station >= gradiente.stationAnfang && maus.station <= gradiente.stationEnde ? {
    hoehe: gradiente.hoehe(maus.station),
    neigung: gradiente.neigung(maus.station),
    gelaende: gelaendeHoeheBei(gelaendeschnitt, maus.station),
  } : null;

  return (
    <div className="plan">
      <div className="plan-titel">
        Höhenplan
        <span className="legende">
          <i style={{ background: "#a16207" }} /> Gelände <i style={{ background: "#dc2626" }} /> Gradiente · Überhöhung 1:{formatZahl(ueberhoehung, 0)}
        </span>
      </div>
      <div className="zeichenflaeche" ref={box}>
        {groesse.w > 0 && (
          <svg
            ref={svgRef}
            className={`zeichnung modus-${modus}`}
            width={groesse.w}
            height={groesse.h}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setMaus(null)}
          >
            <rect x={RAND.links} y={RAND.oben} width={breite} height={hoehe} className="hp-flaeche" />
            {hLinien.map((h) => (
              <g key={`h${h}`}>
                <line x1={RAND.links} x2={RAND.links + breite} y1={y(h)} y2={y(h)} className="gitter" />
                <text x={RAND.links - 6} y={y(h)} className="achsbeschriftung" textAnchor="end" dominantBaseline="middle">
                  {formatZahl(h, hSchritt < 1 ? 1 : 0)}
                </text>
              </g>
            ))}
            {sLinien.map((s) => (
              <g key={`s${s}`}>
                <line x1={x(s)} x2={x(s)} y1={RAND.oben} y2={RAND.oben + hoehe} className="gitter" />
                <text x={x(s)} y={RAND.oben + hoehe + 14} className="achsbeschriftung" textAnchor="middle">
                  {formatStation(s, 0)}
                </text>
              </g>
            ))}

            {gelPfad && (
              <>
                <path d={`${gelPfad}L${x(gelaendeschnitt[gelaendeschnitt.length - 1].station)},${RAND.oben + hoehe}L${x(gelaendeschnitt[0].station)},${RAND.oben + hoehe}Z`} className="gelaende-flaeche" />
                <path d={gelPfad} className="gelaende-linie" />
              </>
            )}

            {nwp.length > 1 && <polyline points={nwp.map((p) => `${x(p.station)},${y(p.hoehe)}`).join(" ")} className="tangentenzug" />}

            {gradiente?.ausrundungen.map((a) => (
              <g key={a.nwp}>
                <line x1={x(a.stationAnfang)} x2={x(a.stationAnfang)} y1={y(gradiente.hoehe(a.stationAnfang)) - 8} y2={y(gradiente.hoehe(a.stationAnfang)) + 8} className="ausrundungsgrenze" />
                <line x1={x(a.stationEnde)} x2={x(a.stationEnde)} y1={y(gradiente.hoehe(a.stationEnde)) - 8} y2={y(gradiente.hoehe(a.stationEnde)) + 8} className="ausrundungsgrenze" />
              </g>
            ))}

            {gradPfad && <path d={gradPfad} className="gradiente" />}

            {gradiente?.neigungen.map((s, i) => {
              const a = gradiente.nwp[i];
              const b = gradiente.nwp[i + 1];
              const xm = (x(a.station) + x(b.station)) / 2;
              const ym = (y(a.hoehe) + y(b.hoehe)) / 2;
              if (x(b.station) - x(a.station) < 60) return null;
              return (
                <text key={i} x={xm} y={ym - 8} className="neigungstext" textAnchor="middle">
                  {s >= 0 ? "+" : ""}
                  {formatProzent(s)}
                </text>
              );
            })}

            {nwp.map((p, i) => {
              const a = gradiente?.ausrundungen.find((q) => q.nwp === i);
              return (
                <g key={i} data-nwp={i} className={`nwp ${auswahl === i ? "gewaehlt" : ""}`}>
                  <circle cx={x(p.station)} cy={y(p.hoehe)} r={6} />
                  {a && (
                    <text x={x(p.station)} y={y(p.hoehe) + (a.art === "kuppe" ? -12 : 20)} textAnchor="middle" className="nwp-text">
                      {a.art === "kuppe" ? "Hk" : "Hw"} = {formatZahl(a.H, 0)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Krümmungsband */}
            <text x={RAND.links - 6} y={bandY0 - BAND / 2 + 4} className="achsbeschriftung" textAnchor="end">R</text>
            <text x={RAND.links - 6} y={bandY0 + BAND / 2} className="achsbeschriftung" textAnchor="end">L</text>
            <line x1={RAND.links} x2={RAND.links + breite} y1={bandY0} y2={bandY0} className="gitter" />
            {bandPfad && <path d={bandPfad} className="kruemmungsband" />}
            <text x={RAND.links + 4} y={bandY0 - BAND / 2 - 4} className="achsbeschriftung">Krümmungsbild</text>

            {maus && maus.station >= bereich.s0 && maus.station <= bereich.s1 && (
              <line x1={x(maus.station)} x2={x(maus.station)} y1={RAND.oben} y2={RAND.oben + hoehe} className="fadenkreuz" />
            )}
          </svg>
        )}
      </div>
      <div className="statuszeile">
        {maus ? (
          <>
            Station {formatStation(maus.station, 2)}
            {mausWerte && (
              <>
                {" "}
                · Gradiente {formatZahl(mausWerte.hoehe, 3)} m · Neigung {formatProzent(mausWerte.neigung)}
                {mausWerte.gelaende !== null && (
                  <>
                    {" "}
                    · Gelände {formatZahl(mausWerte.gelaende, 2)} m · {mausWerte.hoehe >= mausWerte.gelaende ? "Damm" : "Einschnitt"}{" "}
                    {formatZahl(Math.abs(mausWerte.hoehe - mausWerte.gelaende), 2)} m
                  </>
                )}
              </>
            )}
          </>
        ) : modus === "nwp" ? (
          "Klick: Neigungswechselpunkt einfügen · Ziehen: NWP verschieben"
        ) : (
          "NWP anklicken und ziehen, um die Gradiente zu ändern"
        )}
      </div>
    </div>
  );
}

function gelaendeHoeheBei(schnitt: { station: number; hoehe: number }[], st: number): number | null {
  for (let i = 1; i < schnitt.length; i++) {
    const a = schnitt[i - 1];
    const b = schnitt[i];
    if (st >= a.station && st <= b.station) return a.hoehe + ((b.hoehe - a.hoehe) * (st - a.station)) / (b.station - a.station || 1);
  }
  return null;
}
