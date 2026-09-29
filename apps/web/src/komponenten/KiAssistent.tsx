import { useEffect, useRef, useState } from "react";
import type { Projekt } from "@gbi/kern";

export interface KiNachricht {
  rolle: "user" | "assistant" | "fehler";
  text: string;
  protokoll?: { werkzeug: string; eingabe: unknown; ergebnis: string }[];
}

interface Props {
  projekt: Projekt;
  aendern: (p: Projekt) => void;
  nachrichten: KiNachricht[];
  setNachrichten: React.Dispatch<React.SetStateAction<KiNachricht[]>>;
}

const VORSCHLAEGE = [
  "Regelquerschnitt: Fahrbahn 5,70 m einseitig 2,5 % nach rechts, beidseitig Großpflasterrinne 16 cm und Tiefbord 15 cm mit 3 cm Anschlag, Bankett 0,50 m. Prüfe drei Querprofile.",
  "Setze passende Radien und Klothoiden nach der Entwurfsklasse und prüfe das Ergebnis.",
  "Entwirf eine Gradiente mit möglichst ausgeglichener Erdmassenbilanz.",
  "Prüfe den Entwurf und behebe alle Regelwerksverstöße.",
  "Vergleiche zwei Gradientenvarianten (geländenah und +1 m) hinsichtlich der Erdmassen.",
];

export function KiAssistent({ projekt, aendern, nachrichten, setNachrichten }: Props) {
  const [eingabe, setEingabe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [konfiguriert, setKonfiguriert] = useState<boolean | null>(null);
  const ende = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setKonfiguriert(Boolean(s.kiKonfiguriert)))
      .catch(() => setKonfiguriert(false));
  }, []);

  useEffect(() => {
    ende.current?.scrollIntoView({ behavior: "smooth" });
  }, [nachrichten, laeuft]);

  const senden = async (text: string) => {
    if (!text.trim() || laeuft) return;
    const verlauf = nachrichten.filter((n) => n.rolle !== "fehler").map((n) => ({ rolle: n.rolle, text: n.text }));
    setNachrichten((n) => [...n, { rolle: "user", text }]);
    setEingabe("");
    setLaeuft(true);
    try {
      const antwort = await fetch("/api/ki/planen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projekt, nachricht: text, verlauf }),
      });
      const daten = await antwort.json();
      if (!antwort.ok) throw new Error(daten.fehler ?? `Fehler ${antwort.status}`);
      aendern(daten.projekt as Projekt);
      setNachrichten((n) => [...n, { rolle: "assistant", text: daten.antwort, protokoll: daten.protokoll }]);
    } catch (e) {
      const meldung = e instanceof TypeError ? "Server nicht erreichbar – läuft „npm run dev“?" : (e as Error).message;
      setNachrichten((n) => [...n, { rolle: "fehler", text: meldung }]);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div className="ki">
      {konfiguriert === false && (
        <p className="hinweis warnung">
          Der KI-Dienst ist auf dem Server nicht eingerichtet. Dazu vor dem Start die Umgebungsvariable ANTHROPIC_API_KEY setzen
          (siehe README).
        </p>
      )}
      <div className="ki-verlauf">
        {nachrichten.length === 0 && (
          <div className="ki-start">
            <p>
              Der Assistent plant über dieselben Funktionen wie die Oberfläche: Polygon, Radien, Gradiente, Erdmassen und
              Regelwerksprüfung. Jede Änderung lässt sich mit „Rückgängig“ zurücknehmen.
            </p>
            {VORSCHLAEGE.map((v) => (
              <button key={v} className="vorschlag" onClick={() => senden(v)} disabled={laeuft}>
                {v}
              </button>
            ))}
          </div>
        )}
        {nachrichten.map((n, i) => (
          <div key={i} className={`ki-nachricht ${n.rolle}`}>
            <div className="ki-text">{n.text}</div>
            {n.protokoll && n.protokoll.length > 0 && (
              <details className="ki-protokoll">
                <summary>{n.protokoll.length} Arbeitsschritte</summary>
                <ol>
                  {n.protokoll.map((p, j) => (
                    <li key={j}>
                      <code>{p.werkzeug}</code> {JSON.stringify(p.eingabe) !== "{}" && <small>{JSON.stringify(p.eingabe)}</small>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        ))}
        {laeuft && <div className="ki-nachricht assistant laeuft">Plane … (das kann bis zu einigen Minuten dauern)</div>}
        <div ref={ende} />
      </div>
      <form
        className="ki-eingabe"
        onSubmit={(e) => {
          e.preventDefault();
          senden(eingabe);
        }}
      >
        <textarea
          value={eingabe}
          placeholder="Planungsauftrag, z. B. „Halte überall mindestens R = 400 m ein“"
          onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              senden(eingabe);
            }
          }}
          rows={3}
        />
        <button type="submit" disabled={laeuft || !eingabe.trim()}>
          Senden
        </button>
      </form>
      {nachrichten.length > 0 && (
        <button className="klein" onClick={() => setNachrichten([])} disabled={laeuft}>
          Gespräch leeren
        </button>
      )}
    </div>
  );
}
