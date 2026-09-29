/**
 * Grenz- und Richtwerte nach Entwurfsklassen (EKL) der RAL 2012.
 *
 * ACHTUNG: Die Zahlenwerte sind aus der Entwicklung heraus hinterlegt und
 * müssen vor dem produktiven Einsatz von einer fachkundigen Person gegen die
 * aktuell gültige Ausgabe der RAL geprüft werden. Sie sind bewusst an einer
 * Stelle gebündelt, damit sie leicht angepasst oder um weitere Regelwerke
 * (RAA, RASt) ergänzt werden können.
 */

export type EntwurfsklasseId = "EKL1" | "EKL2" | "EKL3" | "EKL4";

export interface Entwurfsklasse {
  id: EntwurfsklasseId;
  bezeichnung: string;
  regelwerk: string;
  /** Planungsgeschwindigkeit km/h */
  planungsgeschwindigkeit: number;
  /** Empfohlener Radienbereich (m) */
  radiusBereich: [number, number];
  /** Kurvenmindestradius (m) */
  radiusMin: number;
  /** Höchstlängsneigung (dimensionslos, 0.045 = 4,5 %) */
  laengsneigungMax: number;
  /** Kuppenmindesthalbmesser (m) */
  kuppeMin: number;
  /** Wannenmindesthalbmesser (m) */
  wanneMin: number;
  /** Hinweis zur Datenqualität */
  quelle: string;
}

const QUELLE = "RAL 2012 (Werte vor produktivem Einsatz fachlich prüfen)";

export const ENTWURFSKLASSEN: Record<EntwurfsklasseId, Entwurfsklasse> = {
  EKL1: {
    id: "EKL1",
    bezeichnung: "EKL 1 – Fernstraße (Kraftfahrstraße)",
    regelwerk: "RAL",
    planungsgeschwindigkeit: 110,
    radiusBereich: [500, 900],
    radiusMin: 500,
    laengsneigungMax: 0.045,
    kuppeMin: 8000,
    wanneMin: 4000,
    quelle: QUELLE,
  },
  EKL2: {
    id: "EKL2",
    bezeichnung: "EKL 2 – Überregionalstraße",
    regelwerk: "RAL",
    planungsgeschwindigkeit: 100,
    radiusBereich: [400, 900],
    radiusMin: 400,
    laengsneigungMax: 0.055,
    kuppeMin: 6000,
    wanneMin: 3500,
    quelle: QUELLE,
  },
  EKL3: {
    id: "EKL3",
    bezeichnung: "EKL 3 – Regionalstraße",
    regelwerk: "RAL",
    planungsgeschwindigkeit: 90,
    radiusBereich: [300, 600],
    radiusMin: 300,
    laengsneigungMax: 0.065,
    kuppeMin: 5000,
    wanneMin: 3000,
    quelle: QUELLE,
  },
  EKL4: {
    id: "EKL4",
    bezeichnung: "EKL 4 – Nahbereichsstraße",
    regelwerk: "RAL",
    planungsgeschwindigkeit: 70,
    radiusBereich: [200, 400],
    radiusMin: 200,
    laengsneigungMax: 0.08,
    kuppeMin: 3000,
    wanneMin: 2000,
    quelle: QUELLE,
  },
};

/** Zulässiger Bereich des Klothoidenparameters: R/3 ≤ A ≤ R. */
export function klothoidenBereich(R: number): [number, number] {
  return [R / 3, R];
}
