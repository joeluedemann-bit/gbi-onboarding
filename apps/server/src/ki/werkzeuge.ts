/**
 * Werkzeuge des KI-Planungsassistenten. Jedes Werkzeug arbeitet über den
 * Rechenkern auf dem Projekt der aktuellen Anfrage – die KI rechnet also nie
 * selbst Geometrie, sondern entscheidet und prüft.
 */

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  type DGM,
  ENTWURFSKLASSEN,
  type Projekt,
  type Projektergebnis,
  automatischeRadien,
  berechneProjekt,
  erzeugeDgm,
  gradienteAusGelaende,
  projektZusammenfassung,
  schaetzeErdmassen,
} from "@gbi/kern";

export interface Protokolleintrag {
  werkzeug: string;
  eingabe: unknown;
  ergebnis: string;
}

/** Zustand einer KI-Anfrage: das bearbeitete Projekt und ein Protokoll der Werkzeugaufrufe. */
export class Planungssitzung {
  projekt: Projekt;
  readonly protokoll: Protokolleintrag[] = [];
  private dgm: DGM | null;

  constructor(projekt: Projekt) {
    this.projekt = structuredClone(projekt);
    this.dgm = erzeugeDgm(this.projekt.gelaende);
  }

  berechne(): Projektergebnis {
    return berechneProjekt(this.projekt, { dgm: this.dgm });
  }

  zusammenfassung() {
    return projektZusammenfassung(this.projekt, this.berechne());
  }

  /** Kurzer Status nach einer Änderung: was ist offen? */
  kurzstatus() {
    const e = this.berechne();
    const zaehle = (ebene: string) => e.pruefung.filter((p) => p.ebene === ebene).length;
    return {
      achslaenge: e.achse ? Math.round(e.achse.laenge * 100) / 100 : null,
      fehler: zaehle("fehler"),
      warnungen: zaehle("warnung"),
      offenePunkte: e.pruefung.filter((p) => p.ebene === "fehler" || p.ebene === "warnung").map((p) => p.text),
    };
  }

  protokolliere(werkzeug: string, eingabe: unknown, ergebnis: unknown): string {
    const text = typeof ergebnis === "string" ? ergebnis : JSON.stringify(ergebnis);
    this.protokoll.push({ werkzeug, eingabe, ergebnis: text.length > 400 ? text.slice(0, 400) + " …" : text });
    return text;
  }
}

const polygonPunkt = z.object({
  E: z.number().describe("Rechtswert in m"),
  N: z.number().describe("Hochwert in m"),
  R: z.number().positive().optional().describe("Kreisbogenradius in m (nur innere Punkte)"),
  A1: z.number().min(0).optional().describe("Klothoidenparameter vor dem Bogen, 0 = keine Klothoide"),
  A2: z.number().min(0).optional().describe("Klothoidenparameter nach dem Bogen, 0 = keine Klothoide"),
});

export function erstelleWerkzeuge(s: Planungssitzung) {
  const polygon = () => {
    if (s.projekt.achse.modus !== "polygon") {
      throw new Error("Die Achse liegt als importierte Elementfolge vor; zuerst mit tangentenpolygon_setzen ein Polygon festlegen");
    }
    return s.projekt.achse.polygon;
  };

  const ausfuehren = <T>(name: string, fn: (eingabe: T) => unknown) => async (eingabe: T) => {
    try {
      return s.protokolliere(name, eingabe, fn(eingabe));
    } catch (e) {
      return s.protokolliere(name, eingabe, { fehler: (e as Error).message });
    }
  };

  return [
    betaZodTool({
      name: "projekt_lesen",
      description:
        "Liefert den vollständigen aktuellen Projektstand: Entwurfsklasse, Tangentenpolygon, Achselemente, Bögen, Gradiente, Geländeumfang und alle offenen Prüfergebnisse.",
      inputSchema: z.object({}),
      run: ausfuehren("projekt_lesen", () => s.zusammenfassung()),
    }),

    betaZodTool({
      name: "entwurfsklasse_setzen",
      description: "Setzt die Entwurfsklasse nach RAL (EKL1 bis EKL4). Sie bestimmt die Grenzwerte der Prüfung.",
      inputSchema: z.object({ ekl: z.enum(["EKL1", "EKL2", "EKL3", "EKL4"]) }),
      run: ausfuehren("entwurfsklasse_setzen", ({ ekl }: { ekl: keyof typeof ENTWURFSKLASSEN }) => {
        s.projekt.ekl = ekl;
        return { ok: true, entwurfsklasse: ENTWURFSKLASSEN[ekl], status: s.kurzstatus() };
      }),
    }),

    betaZodTool({
      name: "tangentenpolygon_setzen",
      description:
        "Ersetzt das Tangentenpolygon der Achse. Erster und letzter Punkt sind Anfang und Ende; an jedem inneren Punkt wird Klothoide–Kreisbogen–Klothoide eingerechnet (R, A1, A2). Fehlende Radien können danach mit radien_automatisch ergänzt werden.",
      inputSchema: z.object({ punkte: z.array(polygonPunkt).min(2) }),
      run: ausfuehren("tangentenpolygon_setzen", ({ punkte }: { punkte: z.infer<typeof polygonPunkt>[] }) => {
        s.projekt.achse = { modus: "polygon", polygon: punkte };
        return { ok: true, status: s.kurzstatus() };
      }),
    }),

    betaZodTool({
      name: "polygonpunkt_aendern",
      description:
        "Ändert einen einzelnen Polygonpunkt (Nummer ab 1): Lage (E, N) und/oder Bogenparameter (R, A1, A2). Nicht angegebene Werte bleiben unverändert.",
      inputSchema: z.object({
        punkt: z.number().int().min(1),
        E: z.number().optional(),
        N: z.number().optional(),
        R: z.number().positive().optional(),
        A1: z.number().min(0).optional(),
        A2: z.number().min(0).optional(),
      }),
      run: ausfuehren("polygonpunkt_aendern", (e: { punkt: number; E?: number; N?: number; R?: number; A1?: number; A2?: number }) => {
        const pg = polygon();
        const p = pg[e.punkt - 1];
        if (!p) throw new Error(`Punkt ${e.punkt} existiert nicht (Polygon hat ${pg.length} Punkte)`);
        const { punkt: _, ...aenderung } = e;
        pg[e.punkt - 1] = { ...p, ...Object.fromEntries(Object.entries(aenderung).filter(([, v]) => v !== undefined)) };
        return { ok: true, punkt: pg[e.punkt - 1], status: s.kurzstatus() };
      }),
    }),

    betaZodTool({
      name: "polygonpunkt_einfuegen",
      description: "Fügt einen Polygonpunkt vor der angegebenen Nummer ein (nach dem letzten Punkt: Anzahl + 1).",
      inputSchema: z.object({ vorPunkt: z.number().int().min(1), punkt: polygonPunkt }),
      run: ausfuehren("polygonpunkt_einfuegen", (e: { vorPunkt: number; punkt: z.infer<typeof polygonPunkt> }) => {
        const pg = polygon();
        pg.splice(Math.min(e.vorPunkt - 1, pg.length), 0, e.punkt);
        return { ok: true, anzahlPunkte: pg.length, status: s.kurzstatus() };
      }),
    }),

    betaZodTool({
      name: "polygonpunkt_loeschen",
      description: "Löscht einen Polygonpunkt (Nummer ab 1).",
      inputSchema: z.object({ punkt: z.number().int().min(1) }),
      run: ausfuehren("polygonpunkt_loeschen", ({ punkt }: { punkt: number }) => {
        const pg = polygon();
        if (pg.length <= 2) throw new Error("Das Polygon braucht mindestens zwei Punkte");
        pg.splice(punkt - 1, 1);
        return { ok: true, anzahlPunkte: pg.length, status: s.kurzstatus() };
      }),
    }),

    betaZodTool({
      name: "radien_automatisch",
      description:
        "Wählt an allen inneren Polygonpunkten den größten Radius im empfohlenen Bereich der Entwurfsklasse, der auf die Tangentenlängen passt, mit Klothoiden A = Verhältnis · R. Überschreibt vorhandene R/A-Werte.",
      inputSchema: z.object({
        zwischengeradeMin: z.number().min(0).optional().describe("Mindestlänge der Zwischengeraden in m (Standard 0)"),
        klothoidenVerhaeltnis: z.number().min(1 / 3).max(1).optional().describe("A/R, Standard 0,5"),
      }),
      run: ausfuehren("radien_automatisch", (o: { zwischengeradeMin?: number; klothoidenVerhaeltnis?: number }) => {
        const pg = polygon();
        const v = automatischeRadien(pg, ENTWURFSKLASSEN[s.projekt.ekl], o);
        s.projekt.achse = { modus: "polygon", polygon: v.punkte };
        return { ok: true, hinweise: v.hinweise, boegen: v.punkte.slice(1, -1).map((p, i) => ({ punkt: i + 2, R: p.R, A1: p.A1, A2: p.A2 })), status: s.kurzstatus() };
      }),
    }),

    betaZodTool({
      name: "gelaende_abfragen",
      description:
        "Geländehöhen aus dem DGM: entweder an einzelnen Koordinaten (punkte) oder als Längsschnitt entlang der aktuellen Achse (schritt in m).",
      inputSchema: z.object({
        punkte: z.array(z.object({ E: z.number(), N: z.number() })).max(200).optional(),
        schritt: z.number().min(5).max(200).optional(),
      }),
      run: ausfuehren("gelaende_abfragen", (e: { punkte?: { E: number; N: number }[]; schritt?: number }) => {
        const r = s.berechne();
        if (!r.dgm) throw new Error("Kein Geländemodell geladen");
        if (e.punkte) return e.punkte.map((p) => ({ ...p, H: r.dgm!.hoehe(p.E, p.N) }));
        if (!r.achse) throw new Error("Keine Achse vorhanden");
        const schritt = e.schritt ?? Math.max(10, Math.ceil(r.achse.laenge / 150 / 5) * 5);
        return r.achse.rasterStationen(schritt).map((station) => {
          const p = r.achse!.punkt(station);
          const h = r.dgm!.hoehe(p.E, p.N);
          return { station: Math.round(station * 100) / 100, gelaende: h === null ? null : Math.round(h * 100) / 100 };
        });
      }),
    }),

    betaZodTool({
      name: "gradiente_setzen",
      description:
        "Ersetzt die Gradiente durch Neigungswechselpunkte (Station, Höhe, Ausrundungshalbmesser H). Erster und letzter NWP sollten Achsanfang und -ende abdecken; innere NWP brauchen H > 0.",
      inputSchema: z.object({
        nwp: z
          .array(z.object({ station: z.number(), hoehe: z.number(), H: z.number().min(0).optional() }))
          .min(2),
      }),
      run: ausfuehren("gradiente_setzen", ({ nwp }: { nwp: { station: number; hoehe: number; H?: number }[] }) => {
        s.projekt.gradiente = nwp;
        return { ok: true, status: s.kurzstatus() };
      }),
    }),

    betaZodTool({
      name: "gradiente_automatisch",
      description:
        "Erzeugt eine geländenahe Gradiente: Geländeschnitt vereinfachen, Höchstlängsneigung der EKL einhalten, Ausrundungen mit Mindesthalbmesser · Faktor einpassen. Guter Startpunkt, danach mit erdmassen_schaetzen bewerten.",
      inputSchema: z.object({
        toleranz: z.number().min(0.1).max(20).optional().describe("Zulässige Abweichung vom Gelände bei der Vereinfachung in m (Standard 2)"),
        nwpAbstandMin: z.number().min(20).optional().describe("Mindestabstand der NWP in m (Standard 150)"),
        halbmesserFaktor: z.number().min(1).max(5).optional().describe("Faktor auf die Mindesthalbmesser (Standard 1,5)"),
        hoehenversatz: z.number().min(-10).max(10).optional().describe("Anhebung der Gradiente über Gelände in m (Standard 0)"),
      }),
      run: ausfuehren("gradiente_automatisch", (o: { toleranz?: number; nwpAbstandMin?: number; halbmesserFaktor?: number; hoehenversatz?: number }) => {
        const r = s.berechne();
        if (!r.achse) throw new Error("Keine Achse vorhanden");
        if (!r.dgm) throw new Error("Kein Geländemodell geladen");
        const g = gradienteAusGelaende(r.achse, r.dgm, ENTWURFSKLASSEN[s.projekt.ekl], o);
        s.projekt.gradiente = g.nwp;
        return { ok: true, nwp: g.nwp, hinweise: g.hinweise, status: s.kurzstatus() };
      }),
    }),

    betaZodTool({
      name: "erdmassen_schaetzen",
      description:
        "Überschlägige Erdmassen (Auftrag, Abtrag, Bilanz in m³, max. Damm/Einschnitt) aus Gradiente und Gelände mit vereinfachtem Trapezprofil. Für Variantenvergleiche.",
      inputSchema: z.object({
        kronenbreite: z.number().min(3).max(60).optional().describe("Kronenbreite in m (Standard 11)"),
        boeschung: z.number().min(0.5).max(5).optional().describe("Böschungsneigung 1:n (Standard 1,5)"),
      }),
      run: ausfuehren("erdmassen_schaetzen", (o: { kronenbreite?: number; boeschung?: number }) => {
        const r = s.berechne();
        if (!r.gradiente) throw new Error("Keine Gradiente vorhanden");
        if (r.gelaendeschnitt.length < 2) throw new Error("Kein Geländeschnitt verfügbar");
        const m = schaetzeErdmassen(r.gradiente, r.gelaendeschnitt, o);
        const rd = (x: number) => Math.round(x);
        return { auftrag_m3: rd(m.auftrag), abtrag_m3: rd(m.abtrag), bilanz_m3: rd(m.bilanz), maxDamm_m: Math.round(m.maxDamm * 100) / 100, maxEinschnitt_m: Math.round(m.maxEinschnitt * 100) / 100 };
      }),
    }),

    betaZodTool({
      name: "regelwerk_pruefen",
      description: "Prüft den aktuellen Entwurf gegen die Grenzwerte der Entwurfsklasse und liefert alle Fehler, Warnungen und Hinweise.",
      inputSchema: z.object({}),
      run: ausfuehren("regelwerk_pruefen", () => s.berechne().pruefung),
    }),
  ];
}
