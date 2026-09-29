import { useEffect, useRef, useState } from "react";
import {
  type PlanDaten,
  type Projekt,
  type Projektergebnis,
  deckenbuchCsv,
  dxfBytes,
  exportiereLandXml,
  hoehenplanDxf,
  lageplanDxf,
  querprofileDxf,
  regelquerschnittDxf,
} from "@gbi/kern";
import { anbieten, dateiname } from "../dateien";
import { erzeugeZip } from "../zip";

interface Props {
  projekt: Projekt;
  ergebnis: Projektergebnis;
  meldung: (text: string) => void;
}

interface Eintrag {
  text: string;
  hinweis: string;
  bereit: boolean;
  erzeugen: (d: PlanDaten) => { name: string; inhalt: string; typ: string };
}

export function ExportMenue({ projekt, ergebnis, meldung }: Props) {
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const zu = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, []);

  const basis = dateiname(projekt.name);
  const hatAchse = Boolean(ergebnis.achse);
  const hatGrad = Boolean(ergebnis.gradiente);
  const hatQ = Boolean(projekt.querschnitt);
  const dxf = "application/dxf";

  const eintraege: Eintrag[] = [
    { text: "Lageplan (DXF)", hinweis: "Achse, Stationierung, Spurränder, Bordsteine, Böschungen", bereit: hatAchse, erzeugen: (d) => ({ name: `${basis}_Lageplan.dxf`, inhalt: lageplanDxf(d), typ: dxf }) },
    { text: "Deckenhöhenplan (DXF)", hinweis: "Lageplan mit Höhen aller Randpunkte alle 10 m", bereit: hatAchse && hatGrad && hatQ, erzeugen: (d) => ({ name: `${basis}_Deckenhoehenplan.dxf`, inhalt: lageplanDxf(d, { deckenhoehen: true, intervall: 10 }), typ: dxf }) },
    { text: "Höhenplan (DXF)", hinweis: "Gradiente, Gelände, Bänder, Krümmungsbild · 1:1000/1:100", bereit: hatAchse && hatGrad, erzeugen: (d) => ({ name: `${basis}_Hoehenplan.dxf`, inhalt: hoehenplanDxf(d, { gelaende: ergebnis.gelaendeschnitt }), typ: dxf }) },
    { text: "Querprofile (DXF)", hinweis: "alle 20 m und an Hauptpunkten · 1:100", bereit: hatAchse && hatGrad && hatQ, erzeugen: (d) => ({ name: `${basis}_Querprofile.dxf`, inhalt: querprofileDxf(d, { intervall: 20 }), typ: dxf }) },
    { text: "Regelquerschnitt (DXF)", hinweis: "Spuren mit Breiten und Neigungen", bereit: hatAchse && hatQ, erzeugen: (d) => ({ name: `${basis}_RQ.dxf`, inhalt: regelquerschnittDxf(d), typ: dxf }) },
    { text: "Deckenbuch (CSV)", hinweis: "Station, Punkt, Abstand, Höhe, Koordinaten – für Excel und Absteckung", bereit: hatAchse && hatGrad && hatQ, erzeugen: (d) => ({ name: `${basis}_Deckenbuch.csv`, inhalt: "﻿" + deckenbuchCsv(d, 10), typ: "text/csv" }) },
    {
      text: "Planpaket (ZIP)",
      hinweis: "alle Pläne als DXF, Deckenbuch und LandXML in einer Datei",
      bereit: hatAchse,
      erzeugen: (d) => ({ name: `${basis}_Planpaket.zip`, inhalt: "", typ: "application/zip" }),
    },
    { text: "LandXML", hinweis: "Achse, Gradiente, Gelände für VESTRA und andere Programme", bereit: hatAchse, erzeugen: (d) => ({ name: `${basis}.xml`, inhalt: exportiereLandXml({ projektname: projekt.name, achse: d.achse, gradiente: d.gradiente, dgm: d.dgm }), typ: "application/xml" }) },
  ];

  const ausfuehren = async (e: Eintrag) => {
    setOffen(false);
    if (!ergebnis.achse) return;
    const d: PlanDaten = {
      projektname: projekt.name,
      achsname: projekt.name,
      achse: ergebnis.achse,
      gradiente: ergebnis.gradiente,
      querschnitt: projekt.querschnitt,
      dgm: ergebnis.dgm,
    };
    try {
      if (e.text.startsWith("Planpaket")) {
        // Alle verfügbaren Dateien, DXF in Windows-1252
        const inhalte = eintraege
          .filter((x) => x.bereit && !x.text.startsWith("Planpaket"))
          .map((x) => x.erzeugen(d))
          .map((r) => ({ name: r.name, daten: r.name.endsWith(".dxf") ? dxfBytes(r.inhalt) : r.inhalt }));
        const text = await anbieten(`${basis}_Planpaket.zip`, erzeugeZip(inhalte), "application/zip");
        meldung(text ?? `Planpaket mit ${inhalte.length} Dateien erstellt`);
        return;
      }
      const r = e.erzeugen(d);
      // DXF in Windows-1252 schreiben (Umlaute für AutoCAD/BricsCAD)
      const text = await anbieten(r.name, r.name.endsWith(".dxf") ? dxfBytes(r.inhalt) : r.inhalt, r.typ);
      if (text) meldung(text);
      else if (r.name.endsWith(".dxf")) meldung(`${r.name} erstellt – in AutoCAD/BricsCAD öffnen und als DWG speichern`);
    } catch (err) {
      meldung((err as Error).message);
    }
  };

  return (
    <div className="menue" ref={ref}>
      <button onClick={() => setOffen((o) => !o)} disabled={!hatAchse}>
        Export ▾
      </button>
      {offen && (
        <div className="menue-liste">
          {eintraege.map((e) => (
            <button key={e.text} disabled={!e.bereit} onClick={() => ausfuehren(e)} title={e.bereit ? undefined : "Dafür fehlen Achse, Gradiente oder Regelquerschnitt"}>
              <strong>{e.text}</strong>
              <small>{e.hinweis}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
