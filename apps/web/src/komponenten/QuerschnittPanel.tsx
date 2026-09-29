import { useState } from "react";
import {
  type Projekt,
  type Projektergebnis,
  QUERSCHNITT_VORLAGEN,
  type Querschnitt,
  type Seite,
  type Spur,
  type SpurArt,
  formatStation,
  formatZahl,
  randpunkte,
  spurArtName,
} from "@gbi/kern";
import { Zahl } from "./Zahl";

interface Props {
  projekt: Projekt;
  ergebnis: Projektergebnis;
  aendern: (f: Projekt | ((p: Projekt) => Projekt)) => void;
  station: number;
}

const ARTEN: SpurArt[] = ["fahrbahn", "rinne", "bordstein", "gehweg", "radweg", "parken", "bankett", "gruen", "mulde"];

export function QuerschnittPanel({ projekt, aendern, station }: Props) {
  const q = projekt.querschnitt;
  const [vorlage, setVorlage] = useState(Object.keys(QUERSCHNITT_VORLAGEN)[0]);

  const setzeQ = (f: (q: Querschnitt) => Querschnitt) => aendern((p) => (p.querschnitt ? { ...p, querschnitt: f(p.querschnitt) } : p));

  const vorlageSetzen = (
    <div className="knopfreihe">
      <select value={vorlage} onChange={(e) => setVorlage(e.target.value)}>
        {Object.keys(QUERSCHNITT_VORLAGEN).map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <button onClick={() => aendern((p) => ({ ...p, querschnitt: QUERSCHNITT_VORLAGEN[vorlage]() }))}>{q ? "Vorlage übernehmen" : "Querschnitt anlegen"}</button>
    </div>
  );

  if (!q) {
    return (
      <div className="panel">
        <p className="hinweis">Noch kein Regelquerschnitt. Eine Vorlage wählen oder den KI-Assistenten beschreiben lassen, z. B. „Fahrbahn 5,70 m einseitig 2,5 %, beidseitig Tiefbord mit 3 cm Anschlag und Großpflasterrinne“.</p>
        {vorlageSetzen}
      </div>
    );
  }

  const setzeSpur = (seite: Seite, i: number, a: Partial<Spur>) =>
    setzeQ((q) => ({ ...q, [seite]: q[seite].map((s, j) => (j === i ? { ...s, ...a } : s)) }));

  const spurTabelle = (seite: Seite) => (
    <>
      <h3>{seite === "links" ? "Links der Achse" : "Rechts der Achse"} (von innen nach außen)</h3>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th>Art</th>
            <th>Breite</th>
            <th>q [%]</th>
            <th>Sprung</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {q[seite].map((s, i) => (
            <tr key={i}>
              <td><input className="zahl text" value={s.name} onChange={(e) => setzeSpur(seite, i, { name: e.target.value })} /></td>
              <td>
                <select className="klein" value={s.art} onChange={(e) => setzeSpur(seite, i, { art: e.target.value as SpurArt })}>
                  {ARTEN.map((a) => (
                    <option key={a} value={a}>{spurArtName(a)}</option>
                  ))}
                </select>
              </td>
              <td><Zahl wert={s.breite} stellen={3} min={0} onChange={(v) => v !== undefined && setzeSpur(seite, i, { breite: v })} /></td>
              <td><Zahl wert={s.neigung} stellen={2} onChange={(v) => v !== undefined && setzeSpur(seite, i, { neigung: v })} /></td>
              <td><Zahl wert={s.sprung ?? 0} stellen={3} onChange={(v) => setzeSpur(seite, i, { sprung: v || undefined })} /></td>
              <td>
                <button className="klein" title="Spur löschen" onClick={() => setzeQ((q) => ({ ...q, [seite]: q[seite].filter((_, j) => j !== i) }))}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="knopfreihe">
        <button className="klein" onClick={() => setzeQ((q) => ({ ...q, [seite]: [...q[seite], { name: "Neue Spur", art: "gehweg", breite: 1, neigung: 2.5 }] }))}>
          + Spur außen
        </button>
      </div>
    </>
  );

  return (
    <div className="panel">
      <label className="feld">
        Bezeichnung
        <input value={q.name} onChange={(e) => setzeQ((q) => ({ ...q, name: e.target.value }))} />
      </label>
      <RqSkizze q={q} station={station} />
      <p className="hinweis">q positiv = Gefälle nach außen, negativ = Anstieg nach außen. Sprung = Höhenunterschied am inneren Spurrand (Bordanschlag).</p>
      {spurTabelle("links")}
      {spurTabelle("rechts")}

      <h3>Böschung</h3>
      <div className="knopfreihe">
        <label className="feld inline">Auftrag 1:<Zahl wert={q.boeschung.auftrag} stellen={2} min={0.1} onChange={(v) => v && setzeQ((q) => ({ ...q, boeschung: { ...q.boeschung, auftrag: v } }))} /></label>
        <label className="feld inline">Abtrag 1:<Zahl wert={q.boeschung.abtrag} stellen={2} min={0.1} onChange={(v) => v && setzeQ((q) => ({ ...q, boeschung: { ...q.boeschung, abtrag: v } }))} /></label>
      </div>

      <h3>Querneigungsverlauf (Fahrbahn)</h3>
      <table className="tabelle">
        <thead>
          <tr><th>Station</th><th>q links [%]</th><th>q rechts [%]</th><th /></tr>
        </thead>
        <tbody>
          {q.querneigungen.map((p, i) => (
            <tr key={i}>
              <td><Zahl wert={p.station} onChange={(v) => v !== undefined && setzeQ((q) => ({ ...q, querneigungen: q.querneigungen.map((x, j) => (j === i ? { ...x, station: v } : x)) }))} /></td>
              <td><Zahl wert={p.links} onChange={(v) => v !== undefined && setzeQ((q) => ({ ...q, querneigungen: q.querneigungen.map((x, j) => (j === i ? { ...x, links: v } : x)) }))} /></td>
              <td><Zahl wert={p.rechts} onChange={(v) => v !== undefined && setzeQ((q) => ({ ...q, querneigungen: q.querneigungen.map((x, j) => (j === i ? { ...x, rechts: v } : x)) }))} /></td>
              <td><button className="klein" onClick={() => setzeQ((q) => ({ ...q, querneigungen: q.querneigungen.filter((_, j) => j !== i) }))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="knopfreihe">
        <button className="klein" onClick={() => setzeQ((q) => ({ ...q, querneigungen: [...q.querneigungen, { station: Math.round(station * 1000) / 1000, links: 2.5, rechts: 2.5 }].sort((a, b) => a.station - b.station) }))}>
          + an Station {formatStation(station, 1)}
        </button>
      </div>

      <h3>Aufweitungen und Absenkungen</h3>
      <table className="tabelle">
        <thead>
          <tr><th>Seite</th><th>Spur</th><th>von</th><th>bis</th><th>Breite von</th><th>bis</th><th>Sprung</th><th /></tr>
        </thead>
        <tbody>
          {q.aenderungen.map((a, i) => {
            const setze = (x: Partial<typeof a>) => setzeQ((q) => ({ ...q, aenderungen: q.aenderungen.map((y, j) => (j === i ? { ...y, ...x } : y)) }));
            return (
              <tr key={i}>
                <td>
                  <select className="klein" value={a.seite} onChange={(e) => setze({ seite: e.target.value as Seite })}>
                    <option value="links">L</option>
                    <option value="rechts">R</option>
                  </select>
                </td>
                <td>
                  <select className="klein" value={a.spur} onChange={(e) => setze({ spur: Number(e.target.value) })}>
                    {q[a.seite].map((s, j) => (
                      <option key={j} value={j}>{s.name}</option>
                    ))}
                  </select>
                </td>
                <td><Zahl wert={a.stationVon} stellen={2} onChange={(v) => v !== undefined && setze({ stationVon: v })} /></td>
                <td><Zahl wert={a.stationBis} stellen={2} onChange={(v) => v !== undefined && setze({ stationBis: v })} /></td>
                <td><Zahl wert={a.breiteVon} stellen={3} onChange={(v) => setze({ breiteVon: v })} /></td>
                <td><Zahl wert={a.breiteBis} stellen={3} onChange={(v) => setze({ breiteBis: v })} /></td>
                <td><Zahl wert={a.sprung} stellen={3} onChange={(v) => setze({ sprung: v })} /></td>
                <td><button className="klein" onClick={() => setzeQ((q) => ({ ...q, aenderungen: q.aenderungen.filter((_, j) => j !== i) }))}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="knopfreihe">
        <button className="klein" onClick={() => setzeQ((q) => ({ ...q, aenderungen: [...q.aenderungen, { seite: "rechts", spur: 0, stationVon: Math.round(station), stationBis: Math.round(station) + 10 }] }))}>
          + Änderung ab Station {formatStation(Math.round(station), 0)}
        </button>
      </div>
      <p className="hinweis">Leere Breite = unverändert. Sprung z. B. 0,03 für eine Bordabsenkung an einer Einfahrt (mit 1 m Übergang).</p>
      <hr />
      {vorlageSetzen}
    </div>
  );
}

/** Kleine Skizze des Querschnitts an einer Station (Höhen 5-fach überhöht). */
function RqSkizze({ q, station }: { q: Querschnitt; station: number }) {
  const l = randpunkte(q, "links", station, 0);
  const r = randpunkte(q, "rechts", station, 0);
  const pts = [...[...l].reverse(), { abstand: 0, hoehe: 0, art: "achse" as const }, ...r];
  const aMax = Math.max(...pts.map((p) => Math.abs(p.abstand)), 1);
  const hMin = Math.min(...pts.map((p) => p.hoehe));
  const hMax = Math.max(...pts.map((p) => p.hoehe));
  const W = 400;
  const H = 110;
  const sx = (W - 20) / (2 * aMax);
  const sy = Math.min(sx * 5, (H - 40) / Math.max(hMax - hMin, 0.01));
  const x = (a: number) => W / 2 + a * sx;
  const y = (h: number) => 20 + (hMax - h) * sy;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rq-skizze">
      <line x1={x(0)} x2={x(0)} y1={5} y2={H - 5} className="achse-qp" />
      <polyline points={pts.map((p) => `${x(p.abstand)},${y(p.hoehe)}`).join(" ")} fill="none" stroke="#334155" strokeWidth={2} />
      {[...l, ...r]
        .filter((p) => p.name.endsWith("außen"))
        .filter((p, i, alle) => alle.findIndex((q) => Math.abs(x(q.abstand) - x(p.abstand)) < 30) === i)
        .map((p, i) => (
          <text key={i} x={x(p.abstand)} y={H - 6} textAnchor="middle" className="qp-text">
            {formatZahl(Math.abs(p.abstand), 2)}
          </text>
        ))}
    </svg>
  );
}
