import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Projekt, beispielProjekt, berechneProjekt, erzeugeDgm } from "@gbi/kern";

const SPEICHER_SCHLUESSEL = "gbi-strassenplanung:projekt";
const MAX_SCHRITTE = 100;

function ladeGespeichert(): Projekt {
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (roh) {
      const p = JSON.parse(roh) as Projekt;
      if (p.format === "gbi-strassenplanung") return p;
    }
  } catch {
    /* Speicher nicht verfügbar – Beispiel verwenden */
  }
  return beispielProjekt();
}

/**
 * Projektzustand mit Rückgängig/Wiederholen und automatischer Sicherung im Browser.
 * `aendern(..., { zusammenfassen: true })` fasst fortlaufende Änderungen (z. B. Ziehen) zu einem Schritt zusammen.
 */
export function useProjekt() {
  const [projekt, setProjekt] = useState<Projekt>(ladeGespeichert);
  // Der aktuelle Stand und der Verlauf werden in Refs geführt, damit die Updater
  // frei von Nebeneffekten bleiben (React ruft sie im StrictMode doppelt auf).
  const aktuell = useRef(projekt);
  const zurueck = useRef<Projekt[]>([]);
  const vor = useRef<Projekt[]>([]);
  const zusammenfassen = useRef(false);

  const setze = useCallback((p: Projekt) => {
    aktuell.current = p;
    setProjekt(p);
  }, []);

  const aendern = useCallback(
    (neu: Projekt | ((p: Projekt) => Projekt), optionen: { zusammenfassen?: boolean } = {}) => {
      const alt = aktuell.current;
      const n = typeof neu === "function" ? neu(alt) : neu;
      if (n === alt) return;
      if (!(optionen.zusammenfassen && zusammenfassen.current)) {
        zurueck.current.push(alt);
        if (zurueck.current.length > MAX_SCHRITTE) zurueck.current.shift();
        vor.current = [];
      }
      zusammenfassen.current = Boolean(optionen.zusammenfassen);
      setze(n);
    },
    [setze],
  );

  const abschliessen = useCallback(() => {
    zusammenfassen.current = false;
  }, []);

  const rueckgaengig = useCallback(() => {
    const p = zurueck.current.pop();
    if (!p) return;
    vor.current.push(aktuell.current);
    zusammenfassen.current = false;
    setze(p);
  }, [setze]);

  const wiederholen = useCallback(() => {
    const p = vor.current.pop();
    if (!p) return;
    zurueck.current.push(aktuell.current);
    zusammenfassen.current = false;
    setze(p);
  }, [setze]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(projekt));
      } catch {
        /* z. B. Speicher voll – ohne Autosicherung weiterarbeiten */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [projekt]);

  // Das DGM wird nur neu vermascht, wenn sich die Geländepunkte ändern
  const dgm = useMemo(() => {
    try {
      return erzeugeDgm(projekt.gelaende);
    } catch {
      return null;
    }
  }, [projekt.gelaende]);
  const ergebnis = useMemo(() => berechneProjekt(projekt, { dgm }), [projekt, dgm]);

  return {
    projekt,
    ergebnis,
    aendern,
    abschliessen,
    rueckgaengig,
    wiederholen,
    kannRueckgaengig: zurueck.current.length > 0,
    kannWiederholen: vor.current.length > 0,
  };
}

export type ProjektZustand = ReturnType<typeof useProjekt>;

export type Modus = "auswahl" | "polygon" | "nwp";
