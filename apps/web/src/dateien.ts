import { type Gelaendepunkt, type Projekt, importiereLandXml, importiereVestraAchsliste } from "@gbi/kern";

interface DownloadsNamespace {
  save(r: { filename: string; data: string | Uint8Array }): Promise<{ status: string }>;
}
declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

// Dateitypen, die eine eingebettete Vorschau (claude.ai) direkt anbieten darf
const VORSCHAU_ENDUNGEN = ["txt", "json", "md", "csv", "html", "svg", "pdf", "zip"];

/**
 * Bietet eine Datei zum Speichern an. In der eingebetteten Vorschau über die
 * Downloads-Freigabe der Seite (Dateitypen außerhalb der Liste werden als ZIP
 * verpackt), sonst als normaler Browser-Download. Liefert eine Meldung für die
 * Oberfläche oder null.
 */
export async function anbieten(name: string, inhalt: string | Uint8Array, typ = "application/octet-stream"): Promise<string | null> {
  const downloads = window.claude ? ((await window.claude.use("downloads").catch(() => null)) as DownloadsNamespace | null) : null;
  if (!downloads) {
    herunterladen(name, inhalt, typ);
    return null;
  }
  let dateiname = name;
  let daten: string | Uint8Array = inhalt;
  const endung = name.split(".").pop()?.toLowerCase() ?? "";
  if (!VORSCHAU_ENDUNGEN.includes(endung)) {
    const { erzeugeZip } = await import("./zip");
    daten = erzeugeZip([{ name, daten: inhalt }]);
    dateiname = `${name}.zip`;
  }
  try {
    await downloads.save({ filename: dateiname, data: daten });
    return dateiname === name ? null : `${name} als ZIP gespeichert`;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "declined") return "Speichern abgebrochen";
    if (code === "rate_limited") return "Es ist bereits ein Speichern-Dialog offen";
    return "Speichern ist in dieser Ansicht nicht möglich – Programm lokal starten";
  }
}

export function herunterladen(dateiname: string, inhalt: string | Uint8Array, typ = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([inhalt as BlobPart], { type: typ }));
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

export const dateiname = (name: string) => name.replace(/[^\p{L}\p{N}_ -]+/gu, "").trim().replace(/\s+/g, "_") || "projekt";

export function projektSpeichern(p: Projekt) {
  return anbieten(`${dateiname(p.name)}.gbi.json`, JSON.stringify(p, null, 1), "application/json");
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

/** Öffnet GBI-Projekt (.json), LandXML (.xml), VESTRA-Achsliste (.lst) oder Geländepunkte (.csv/.txt). */
export async function dateiImportieren(datei: File, aktuell: Projekt): Promise<Importergebnis> {
  const name = datei.name.toLowerCase();
  // VESTRA-Listen sind meist Windows-1252 kodiert
  const text = name.endsWith(".lst") ? await leseText(datei) : await datei.text();
  if (name.endsWith(".lst")) {
    const l = importiereVestraAchsliste(text);
    return {
      projekt: { ...aktuell, name: aktuell.name, stationAnfang: l.definition.stationAnfang, achse: { modus: "elemente", definition: l.definition } },
      meldungen: [`VESTRA-Achse „${l.name}“ mit ${l.definition.elemente.length} Elementen importiert`, ...l.warnungen],
    };
  }
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

async function leseText(datei: File): Promise<string> {
  const bytes = new Uint8Array(await datei.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
