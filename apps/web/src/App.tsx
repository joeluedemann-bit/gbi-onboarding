import { useCallback, useEffect, useState } from "react";
import { beispielProjekt, leeresProjekt } from "@gbi/kern";
import { dateiAuswaehlen, dateiImportieren, projektSpeichern } from "./dateien";
import { ExportMenue } from "./komponenten/ExportMenue";
import { Querprofilansicht } from "./komponenten/Querprofil";
import { Hoehenplan } from "./komponenten/Hoehenplan";
import type { KiNachricht } from "./komponenten/KiAssistent";
import { Lageplan } from "./komponenten/Lageplan";
import { Seitenleiste } from "./komponenten/Seitenleiste";
import { VORSCHAU, VORSCHAU_HINWEIS } from "./vorschau";
import { type Modus, useProjekt } from "./zustand";

export function App() {
  const zustand = useProjekt();
  const { projekt, ergebnis, aendern, abschliessen, rueckgaengig, wiederholen } = zustand;
  const [modus, setModus] = useState<Modus>("auswahl");
  const [auswahlPunkt, setAuswahlPunkt] = useState<number | null>(null);
  const [auswahlNwp, setAuswahlNwp] = useState<number | null>(null);
  const [meldungText, setMeldungText] = useState<string | null>(null);
  const [kiNachrichten, setKiNachrichten] = useState<KiNachricht[]>([]);
  const [planSchluessel, setPlanSchluessel] = useState(0);
  const [qpStation, setQpStation] = useState(0);
  const [unten, setUnten] = useState<"hoehenplan" | "querprofil">("hoehenplan");
  const zeigeQuerprofil = (s: number) => {
    setQpStation(s);
    setUnten("querprofil");
  };

  const meldung = useCallback((text: string) => setMeldungText(text), []);
  useEffect(() => {
    if (!meldungText) return;
    const t = setTimeout(() => setMeldungText(null), 6000);
    return () => clearTimeout(t);
  }, [meldungText]);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) wiederholen();
        else rueckgaengig();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        wiederholen();
      } else if (e.key === "Escape") {
        setModus("auswahl");
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [rueckgaengig, wiederholen]);

  const neuLaden = (p: typeof projekt, text: string) => {
    aendern(p);
    setAuswahlPunkt(null);
    setAuswahlNwp(null);
    setPlanSchluessel((k) => k + 1); // Lageplan neu einpassen
    meldung(text);
  };

  const oeffnen = async () => {
    const datei = await dateiAuswaehlen(".json,.xml,.landxml,.csv,.txt,.lst");
    if (!datei) return;
    try {
      const r = await dateiImportieren(datei, projekt);
      neuLaden(r.projekt, r.meldungen.join(" · "));
    } catch (e) {
      meldung(`Import fehlgeschlagen: ${(e as Error).message}`);
    }
  };

  return (
    <div className="app">
      <header className="kopf">
        <div className="marke">
          <strong>GBI</strong> Straßenplanung
          {VORSCHAU && <span className="vorschau-marke" title={VORSCHAU_HINWEIS}>Vorschau</span>}
        </div>
        <input
          className="projektname"
          value={projekt.name}
          onChange={(e) => aendern((p) => ({ ...p, name: e.target.value }))}
          aria-label="Projektname"
        />
        <div className="werkzeuge">
          <div className="gruppe">
            <button
              onClick={() => {
                const p = leeresProjekt();
                p.gelaende = projekt.gelaende;
                neuLaden(p, "Neues Projekt (Gelände übernommen) – jetzt Polygonpunkte setzen");
                setModus("polygon");
              }}
            >
              Neu
            </button>
            <button onClick={() => neuLaden(beispielProjekt(), "Beispielprojekt geladen")}>Beispiel</button>
            <button onClick={oeffnen} title="GBI-Projekt (.json), LandXML (.xml), VESTRA-Achsliste (AXEL….LST) oder Geländepunkte (.csv/.txt)">
              Öffnen / Import
            </button>
            <button onClick={async () => { const t = await projektSpeichern(projekt); if (t) meldung(t); }}>Speichern</button>
<ExportMenue projekt={projekt} ergebnis={ergebnis} meldung={meldung} />
          </div>
          <div className="gruppe">
            <button onClick={rueckgaengig} disabled={!zustand.kannRueckgaengig} title="Rückgängig (Strg+Z)">
              ↶
            </button>
            <button onClick={wiederholen} disabled={!zustand.kannWiederholen} title="Wiederholen (Strg+Y)">
              ↷
            </button>
          </div>
          <div className="gruppe modi">
            {(
              [
                ["auswahl", "Auswahl"],
                ["polygon", "Polygonpunkte setzen"],
                ["nwp", "NWP setzen"],
              ] as [Modus, string][]
            ).map(([m, text]) => (
              <button key={m} className={modus === m ? "aktiv" : ""} onClick={() => setModus(m)}>
                {text}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="arbeitsflaeche">
        <section className="plaene">
          <div className="lageplan-bereich">
            <Lageplan
              key={planSchluessel}
              projekt={projekt}
              ergebnis={ergebnis}
              modus={modus}
              auswahl={auswahlPunkt}
              onAuswahl={setAuswahlPunkt}
              aendern={aendern}
              abschliessen={abschliessen}
              station={qpStation}
              onStation={zeigeQuerprofil}
            />
          </div>
          <div className="hoehenplan-bereich">
            <div className="unten-umschalter">
              <button className={unten === "hoehenplan" ? "aktiv" : ""} onClick={() => setUnten("hoehenplan")}>Höhenplan</button>
              <button className={unten === "querprofil" ? "aktiv" : ""} onClick={() => setUnten("querprofil")}>Querprofil</button>
            </div>
            {unten === "hoehenplan" ? (
              <Hoehenplan
                projekt={projekt}
                ergebnis={ergebnis}
                modus={modus}
                auswahl={auswahlNwp}
                onAuswahl={setAuswahlNwp}
                aendern={aendern}
                abschliessen={abschliessen}
                onStation={zeigeQuerprofil}
                station={qpStation}
              />
            ) : (
              <Querprofilansicht projekt={projekt} ergebnis={ergebnis} station={qpStation} onStation={setQpStation} />
            )}
          </div>
        </section>
        <Seitenleiste
          projekt={projekt}
          ergebnis={ergebnis}
          aendern={aendern}
          auswahlPunkt={auswahlPunkt}
          auswahlNwp={auswahlNwp}
          meldung={meldung}
          station={qpStation}
          kiNachrichten={kiNachrichten}
          setKiNachrichten={setKiNachrichten}
        />
      </main>
      {meldungText && (
        <div className="meldung" role="status" onClick={() => setMeldungText(null)}>
          {meldungText}
        </div>
      )}
    </div>
  );
}
