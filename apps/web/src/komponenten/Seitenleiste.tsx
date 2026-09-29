import { useMemo, useState } from "react";
import { QuerschnittPanel } from "./QuerschnittPanel";
import { Zahl } from "./Zahl";
import {
  ENTWURFSKLASSEN,
  type EntwurfsklasseId,
  type Neigungswechsel,
  type PolygonPunkt,
  type Projekt,
  type Projektergebnis,
  automatischeRadien,
  elementTabelle,
  formatProzent,
  formatStation,
  formatZahl,
  gradienteAusGelaende,
  radZuGon,
  schaetzeErdmassen,
} from "@gbi/kern";
import { KiAssistent, type KiNachricht } from "./KiAssistent";

type Reiter = "lage" | "hoehe" | "rq" | "elemente" | "pruefung" | "ki";

interface Props {
  projekt: Projekt;
  ergebnis: Projektergebnis;
  aendern: (f: Projekt | ((p: Projekt) => Projekt)) => void;
  auswahlPunkt: number | null;
  auswahlNwp: number | null;
  meldung: (text: string) => void;
  station: number;
  kiNachrichten: KiNachricht[];
  setKiNachrichten: React.Dispatch<React.SetStateAction<KiNachricht[]>>;
}

export function Seitenleiste(props: Props) {
  const [reiter, setReiter] = useState<Reiter>("lage");
  const fehler = props.ergebnis.pruefung.filter((p) => p.ebene === "fehler").length;
  const warnungen = props.ergebnis.pruefung.filter((p) => p.ebene === "warnung").length;
  return (
    <aside className="seitenleiste">
      <nav className="reiter">
        {(
          [
            ["lage", "Lage"],
            ["hoehe", "Höhe"],
            ["rq", "RQ"],
            ["elemente", "Elemente"],
            ["pruefung", "Prüfung"],
            ["ki", "KI"],
          ] as [Reiter, string][]
        ).map(([id, text]) => (
          <button key={id} className={reiter === id ? "aktiv" : ""} onClick={() => setReiter(id)}>
            {text}
            {id === "pruefung" && (fehler > 0 || warnungen > 0) && (
              <span className={`zaehler ${fehler > 0 ? "fehler" : "warnung"}`}>{fehler || warnungen}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="reiter-inhalt">
        {reiter === "lage" && <LagePanel {...props} />}
        {reiter === "hoehe" && <HoehePanel {...props} />}
        {reiter === "rq" && <QuerschnittPanel projekt={props.projekt} ergebnis={props.ergebnis} aendern={props.aendern} station={props.station} />}
        {reiter === "elemente" && <ElementePanel {...props} />}
        {reiter === "pruefung" && <PruefungPanel {...props} />}
        {reiter === "ki" && (
          <KiAssistent
            projekt={props.projekt}
            aendern={props.aendern}
            nachrichten={props.kiNachrichten}
            setNachrichten={props.setKiNachrichten}
          />
        )}
      </div>
    </aside>
  );
}

function LagePanel({ projekt, ergebnis, aendern, auswahlPunkt, meldung }: Props) {
  const ekl = ENTWURFSKLASSEN[projekt.ekl];
  const polygon = projekt.achse.modus === "polygon" ? projekt.achse.polygon : null;

  const setzePunkt = (i: number, aenderung: Partial<PolygonPunkt>) =>
    aendern((p) =>
      p.achse.modus === "polygon"
        ? { ...p, achse: { modus: "polygon", polygon: p.achse.polygon.map((q, j) => (j === i ? { ...q, ...aenderung } : q)) } }
        : p,
    );

  return (
    <div className="panel">
      <label className="feld">
        Entwurfsklasse
        <select value={projekt.ekl} onChange={(e) => aendern((p) => ({ ...p, ekl: e.target.value as EntwurfsklasseId }))}>
          {Object.values(ENTWURFSKLASSEN).map((k) => (
            <option key={k.id} value={k.id}>
              {k.bezeichnung}
            </option>
          ))}
        </select>
      </label>
      <div className="kennwerte">
        <span>V<sub>plan</sub> {ekl.planungsgeschwindigkeit} km/h</span>
        <span>R {ekl.radiusBereich[0]}–{ekl.radiusBereich[1]} m</span>
        <span>s<sub>max</sub> {formatProzent(ekl.laengsneigungMax, 1)}</span>
      </div>
      <label className="feld">
        Stationierungsbeginn [m]
        <Zahl wert={projekt.stationAnfang} onChange={(v) => aendern((p) => ({ ...p, stationAnfang: v ?? 0 }))} />
      </label>

      {!polygon ? (
        <p className="hinweis">
          Die Achse stammt aus einem Import und liegt als Elementfolge vor. Zum Bearbeiten ein neues Tangentenpolygon zeichnen
          („Neu“ → Polygonpunkte setzen).
        </p>
      ) : (
        <>
          <h3>Tangentenpolygon</h3>
          <table className="tabelle">
            <thead>
              <tr>
                <th>Pkt</th>
                <th>Rechtswert</th>
                <th>Hochwert</th>
                <th>R</th>
                <th>A1</th>
                <th>A2</th>
              </tr>
            </thead>
            <tbody>
              {polygon.map((p, i) => {
                const innen = i > 0 && i < polygon.length - 1;
                return (
                  <tr key={i} className={auswahlPunkt === i ? "gewaehlt" : ""}>
                    <td>P{i + 1}</td>
                    <td><Zahl wert={p.E} onChange={(v) => v !== undefined && setzePunkt(i, { E: v })} /></td>
                    <td><Zahl wert={p.N} onChange={(v) => v !== undefined && setzePunkt(i, { N: v })} /></td>
                    <td>{innen && <Zahl wert={p.R} stellen={1} min={1} onChange={(v) => setzePunkt(i, { R: v })} />}</td>
                    <td>{innen && <Zahl wert={p.A1} stellen={1} min={0} onChange={(v) => setzePunkt(i, { A1: v })} />}</td>
                    <td>{innen && <Zahl wert={p.A2} stellen={1} min={0} onChange={(v) => setzePunkt(i, { A2: v })} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {polygon.length < 2 && <p className="hinweis">Werkzeug „Polygonpunkte setzen“ wählen und im Lageplan klicken.</p>}
          <div className="knopfreihe">
            <button
              disabled={polygon.length < 3}
              onClick={() => {
                const v = automatischeRadien(polygon, ekl);
                aendern((p) => ({ ...p, achse: { modus: "polygon", polygon: v.punkte } }));
                meldung(v.hinweise.length ? v.hinweise.join(" · ") : "Radien und Klothoiden nach Entwurfsklasse gesetzt");
              }}
            >
              Radien automatisch
            </button>
          </div>
          {ergebnis.boegen.length > 0 && (
            <>
              <h3>Bögen</h3>
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Pkt</th>
                    <th>γ [gon]</th>
                    <th>L Bogen</th>
                    <th>T1</th>
                    <th>T2</th>
                  </tr>
                </thead>
                <tbody>
                  {ergebnis.boegen.map((b) => (
                    <tr key={b.punkt}>
                      <td>P{b.punkt + 1}</td>
                      <td>{formatZahl(radZuGon(b.gamma), 3)}</td>
                      <td>{formatZahl(b.LBogen, 2)}</td>
                      <td>{formatZahl(b.T1, 2)}</td>
                      <td>{formatZahl(b.T2, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
      {ergebnis.achse && (
        <p className="zusammenfassung">
          Achslänge {formatZahl(ergebnis.achse.laenge, 2)} m · {formatStation(ergebnis.achse.stationAnfang)} bis{" "}
          {formatStation(ergebnis.achse.stationEnde)}
        </p>
      )}
    </div>
  );
}

function HoehePanel({ projekt, ergebnis, aendern, auswahlNwp, meldung }: Props) {
  const ekl = ENTWURFSKLASSEN[projekt.ekl];
  const [kronenbreite, setKronenbreite] = useState(11);
  const nwp = projekt.gradiente;
  const setzeNwp = (i: number, aenderung: Partial<Neigungswechsel>) =>
    aendern((p) => ({ ...p, gradiente: p.gradiente.map((q, j) => (j === i ? { ...q, ...aenderung } : q)) }));

  const massen = useMemo(() => {
    if (!ergebnis.gradiente || ergebnis.gelaendeschnitt.length < 2) return null;
    return schaetzeErdmassen(ergebnis.gradiente, ergebnis.gelaendeschnitt, { kronenbreite });
  }, [ergebnis.gradiente, ergebnis.gelaendeschnitt, kronenbreite]);

  return (
    <div className="panel">
      <div className="kennwerte">
        <span>s<sub>max</sub> {formatProzent(ekl.laengsneigungMax, 1)}</span>
        <span>H<sub>K,min</sub> {formatZahl(ekl.kuppeMin, 0)} m</span>
        <span>H<sub>W,min</sub> {formatZahl(ekl.wanneMin, 0)} m</span>
      </div>
      <div className="knopfreihe">
        <button
          disabled={!ergebnis.achse || !ergebnis.dgm}
          title={!ergebnis.dgm ? "Zuerst Gelände laden" : undefined}
          onClick={() => {
            try {
              const g = gradienteAusGelaende(ergebnis.achse!, ergebnis.dgm!, ekl);
              aendern((p) => ({ ...p, gradiente: g.nwp }));
              meldung(g.hinweise.length ? g.hinweise.join(" · ") : `Gradiente mit ${g.nwp.length} NWP aus dem Gelände erzeugt`);
            } catch (e) {
              meldung((e as Error).message);
            }
          }}
        >
          Gradiente aus Gelände
        </button>
        <button
          disabled={!ergebnis.achse}
          onClick={() => {
            const a = ergebnis.achse!;
            const h = (st: number) => {
              const p = a.punkt(st);
              return Math.round((ergebnis.dgm?.hoehe(p.E, p.N) ?? 100) * 1000) / 1000;
            };
            aendern((p) => ({
              ...p,
              gradiente: [
                { station: a.stationAnfang, hoehe: h(a.stationAnfang) },
                { station: a.stationEnde, hoehe: h(a.stationEnde) },
              ],
            }));
          }}
        >
          Neu beginnen
        </button>
      </div>
      <h3>Neigungswechselpunkte</h3>
      <table className="tabelle">
        <thead>
          <tr>
            <th>NWP</th>
            <th>Station</th>
            <th>Höhe</th>
            <th>H</th>
            <th>s danach</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {nwp.map((p, i) => {
            const innen = i > 0 && i < nwp.length - 1;
            const s = ergebnis.gradiente?.neigungen[i];
            return (
              <tr key={i} className={auswahlNwp === i ? "gewaehlt" : ""}>
                <td>{i + 1}</td>
                <td><Zahl wert={p.station} onChange={(v) => v !== undefined && setzeNwp(i, { station: v })} /></td>
                <td><Zahl wert={p.hoehe} stellen={3} onChange={(v) => v !== undefined && setzeNwp(i, { hoehe: v })} /></td>
                <td>{innen && <Zahl wert={p.H} stellen={0} min={0} onChange={(v) => setzeNwp(i, { H: v })} />}</td>
                <td className={s !== undefined && Math.abs(s) > ekl.laengsneigungMax ? "wert-fehler" : ""}>
                  {s !== undefined && i < nwp.length - 1 ? formatProzent(s) : ""}
                </td>
                <td>
                  {nwp.length > 2 && (
                    <button className="klein" title="NWP löschen" onClick={() => aendern((q) => ({ ...q, gradiente: q.gradiente.filter((_, j) => j !== i) }))}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {nwp.length < 2 && <p className="hinweis">Noch keine Gradiente. „Gradiente aus Gelände“ oder „Neu beginnen“ wählen.</p>}

      {massen && (
        <>
          <h3>Erdmassen (überschlägig)</h3>
          <label className="feld inline">
            Kronenbreite [m]
            <Zahl wert={kronenbreite} stellen={1} min={3} onChange={(v) => v && setKronenbreite(v)} />
          </label>
          <table className="tabelle kompakt">
            <tbody>
              <tr><td>Auftrag</td><td>{formatZahl(massen.auftrag, 0)} m³</td></tr>
              <tr><td>Abtrag</td><td>{formatZahl(massen.abtrag, 0)} m³</td></tr>
              <tr><td>Bilanz</td><td>{formatZahl(massen.bilanz, 0)} m³</td></tr>
              <tr><td>max. Damm / Einschnitt</td><td>{formatZahl(massen.maxDamm, 2)} / {formatZahl(massen.maxEinschnitt, 2)} m</td></tr>
            </tbody>
          </table>
          <p className="hinweis">Trapezprofil, Böschung 1:1,5, ebenes Gelände quer zur Achse – nur für Variantenvergleiche.</p>
        </>
      )}
    </div>
  );
}

function ElementePanel({ ergebnis }: Props) {
  const achse = ergebnis.achse;
  if (!achse) return <p className="hinweis">Noch keine Achse.</p>;
  const typText = { gerade: "Gerade", kreisbogen: "Kreisbogen", klothoide: "Klothoide" };
  return (
    <div className="panel">
      <h3>Achselemente</h3>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Nr</th>
            <th>Typ</th>
            <th>Station</th>
            <th>Länge</th>
            <th>R Anf.</th>
            <th>R Ende</th>
            <th>A</th>
          </tr>
        </thead>
        <tbody>
          {elementTabelle(achse).map((e) => (
            <tr key={e.nr}>
              <td>{e.nr}</td>
              <td>{typText[e.typ]}</td>
              <td>{formatStation(e.stationAnfang, 2)}</td>
              <td>{formatZahl(e.laenge, 3)}</td>
              <td>{formatZahl(e.radiusAnfang, 1)}</td>
              <td>{formatZahl(e.radiusEnde, 1)}</td>
              <td>{Number.isFinite(e.A) ? formatZahl(e.A, 1) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hinweis">Radien: positiv = Rechtskurve, negativ = Linkskurve.</p>
      <h3>Hauptpunkte</h3>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Pkt</th>
            <th>Station</th>
            <th>Rechtswert</th>
            <th>Hochwert</th>
            <th>t [gon]</th>
          </tr>
        </thead>
        <tbody>
          {achse.hauptpunkte().map((h, i) => (
            <tr key={i}>
              <td>{h.bezeichnung}</td>
              <td>{formatStation(h.station, 3)}</td>
              <td>{formatZahl(h.E, 3)}</td>
              <td>{formatZahl(h.N, 3)}</td>
              <td>{formatZahl(radZuGon(h.t), 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PruefungPanel({ ergebnis, projekt }: Props) {
  const [okZeigen, setOkZeigen] = useState(false);
  const liste = ergebnis.pruefung.filter((p) => okZeigen || p.ebene !== "ok");
  const symbol = { fehler: "✖", warnung: "▲", hinweis: "ℹ", ok: "✔" };
  return (
    <div className="panel">
      <p className="hinweis">
        Prüfung gegen {ENTWURFSKLASSEN[projekt.ekl].bezeichnung}. Die hinterlegten Grenzwerte sind vor dem produktiven Einsatz
        fachlich zu verifizieren.
      </p>
      <label className="feld inline">
        <input type="checkbox" checked={okZeigen} onChange={(e) => setOkZeigen(e.target.checked)} /> Erfüllte Prüfungen anzeigen
      </label>
      <ul className="pruefliste">
        {liste.map((p, i) => (
          <li key={i} className={p.ebene}>
            <span className="symbol">{symbol[p.ebene]}</span>
            <span>
              {p.text}
              {p.station !== undefined && <small> · Station {formatStation(p.station, 1)}</small>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
