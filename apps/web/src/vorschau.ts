/**
 * Vorschau-Build (z. B. als geteilte Webseite ohne Server): Der KI-Assistent
 * braucht den GBI-Server und steht dort nicht zur Verfügung. Gesetzt über VITE_VORSCHAU=1.
 */
export const VORSCHAU = import.meta.env.VITE_VORSCHAU === "1";

export const VORSCHAU_HINWEIS =
  "Vorschau ohne Server: Der KI-Assistent ist nur im lokal gestarteten Programm verfügbar (npm run dev).";
