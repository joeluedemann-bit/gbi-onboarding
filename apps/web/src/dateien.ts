import { type Gelaendepunkt, type Projekt, type Projektergebnis, exportiereLandXml, importiereLandXml } from "@gbi/kern";

export function herunterladen(dateiname: string, inhalt: string, typ = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dateiAuswaehlen(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const dateiname = (name: string) => name.replace(/[^\p{L}\p{N}_ -]+/gu, "").trim().replace(/\s+/g, "_") || "projekt";

export function projektSpeichern(p: Projekt) {
  herunterladen(`${dateiname(p.name)}.gbi.json`, JSON.stringify(p, null, 1), "application/json");
}

export function landXmlSpeichern(p: Projekt, e: Projektergebnis) {
  if (!e.achse) throw new Error("Es ist keine Achse vorhanden");
  const xml = exportiereLandXml({ projektname: p.name, achse: e.achse, gradiente: e.gradiente, dgm: e.dgm });
  herunterladen(`${dateiname(p.name)}.xml`, xml, "application/xml");
}

/** Geländepunkte aus CSV/TXT: je Zeile mindestens „E N H“ (letzte drei Zahlen, Trenner ; , Tab oder Leerzeichen). */
export function leseGelaendeText(text: string): Gelaendepunkt[] {
  const punkte: Gelaendepunkt[] = [];
  for (const zeile of text.split(/\r?\n/)) {
    const t = zeile.trim();
    if (!t || t.startsWith("#")) continue;
    const felder = t.includes(";") ? t.split(";").map((f) => f.replace(",", ".")) : t.split(/[\s,\t]+/);
    const zahlen = felder
      .map((x) => x.trim())
      .filter((x) => x !== "")
      .map(Number)
      .filter(Number.isFinite);
    if (zahlen.length >= 3) {
      const [E, N, H] = zahlen.slice(-3);
      punkte.push({ E, N, H });
    }
  }
  return punkte;
}

export interface Importergebnis {
  projekt: Projekt;
  meldungen: string[];
}

/** Öffnet GBI-Projekt (.json), LandXML (.xml) oder Geländepunkte (.csv/.txt). */
export async function dateiImportieren(datei: File, aktuell: Projekt): Promise<Importergebnis> {
  const text = await datei.text();
  const name = datei.name.toLowerCase();
  if (name.endsWith(".json")) {
    const p = JSON.parse(text) as Projekt;
    if (p.format !== "gbi-strassenplanung") throw new Error("Keine GBI-Projektdatei");
    return { projekt: p, meldungen: [`Projekt „${p.name}“ geöffnet`] };
  }
  if (name.endsWith(".xml") || name.endsWith(".landxml")) {
    const imp = importiereLandXml(text);
    const meldungen = [...imp.warnungen];
    let projekt = { ...aktuell };
    if (imp.achsen.length > 0) {
      const a = imp.achsen[0];
      projekt = {
        ...projekt,
        name: aktuell.name,
        stationAnfang: a.definition.stationAnfang,
        achse: { modus: "elemente", definition: a.definition },
        gradiente: a.gradiente.length >= 2 ? a.gradiente : projekt.gradiente,
      };
      meldungen.push(`Achse „${a.name}“ mit ${a.definition.elemente.length} Elementen importiert`);
      if (imp.achsen.length > 1) meldungen.push(`Datei enthält ${imp.achsen.length} Achsen – nur die erste wurde übernommen`);
    }
    if (imp.gelaende.length >= 3) {
      projekt.gelaende = imp.gelaende;
      meldungen.push(`${imp.gelaende.length} Geländepunkte importiert`);
    }
    if (imp.achsen.length === 0 && imp.gelaende.length < 3) throw new Error("Keine Achse und kein Gelände in der Datei gefunden");
    return { projekt, meldungen };
  }
  const gelaende = leseGelaendeText(text);
  if (gelaende.length < 3) throw new Error("Keine Geländepunkte erkannt (erwartet: je Zeile E N H)");
  return { projekt: { ...aktuell, gelaende }, meldungen: [`${gelaende.length} Geländepunkte importiert`] };
}
