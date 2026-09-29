/**
 * KI-Planungsassistent auf Basis von Claude (Tool Runner des Anthropic SDK).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Projekt } from "@gbi/kern";
import { Planungssitzung, type Protokolleintrag, erstelleWerkzeuge } from "./werkzeuge";

const MODELL = process.env.GBI_KI_MODELL ?? "claude-opus-5-5";

const SYSTEM = `Du bist der Planungsassistent der GBI-Straßenplanungssoftware und unterstützt Straßenplanerinnen und -planer beim Entwurf von Straßen – außerorts nach den RAL und innerorts, z. B. Erschließungsstraßen in Baugebieten, nach RASt 06.

Arbeitsweise:
- Du veränderst das Projekt ausschließlich über die bereitgestellten Werkzeuge. Geometrie, Höhen und Prüfungen berechnet der Rechenkern; rechne sie nicht selbst nach.
- Plane schrittweise: Ist-Zustand verstehen, ändern, mit regelwerk_pruefen kontrollieren, bei Fehlern nachbessern. Höre auf, wenn der Entwurf fehlerfrei ist oder ein Zielkonflikt eine Entscheidung der planenden Person erfordert.
- Bei mehreren sinnvollen Lösungen bewerte Varianten (z. B. Erdmassen mit erdmassen_schaetzen) und entscheide dich begründet für eine.
- Verschiebe Anfangs- und Endpunkt der Achse nur, wenn ausdrücklich gewünscht – sie sind in der Regel Anschlusspunkte.

Straßenraum: Den Regelquerschnitt beschreibst du mit querschnitt_setzen als Spuren je Seite von der Achse nach außen (Fahrbahn, Rinne, Bordstein, Gehweg, Bankett …). Querneigung in %, positiv = Gefälle nach außen. Der Bordanschlag ist der Höhensprung am inneren Rand der Bordspur (Tiefbord meist 0,03 m, Hochbord 0,10–0,12 m). Aufweitungen, Parkstreifen und Bordabsenkungen legst du mit spuraenderungen_setzen fest, Verwindungen mit querneigung_setzen. Prüfe das Ergebnis mit querprofil_abfragen an kritischen Stellen (Anschlüsse, Tiefpunkte, Aufweitungen) und achte bei Bord/Rinne auf mindestens 0,5 % Längsneigung.

Konventionen: Koordinaten Rechtswert E / Hochwert N in m, Stationen in m, Neigungen in Prozent, Radien und Halbmesser in m. Positive Krümmung bedeutet Rechtskurve.

Antworte auf Deutsch, knapp und fachlich: was du geändert hast, die wichtigsten Kennwerte und welche Punkte offen bleiben. Weise darauf hin, dass die hinterlegten Grenzwerte vor einer Verwendung in echten Projekten fachlich zu prüfen sind, wenn es um Regelwerkskonformität geht. Die Verantwortung für den Entwurf liegt bei der planenden Person.`;

export interface Chatnachricht {
  rolle: "user" | "assistant";
  text: string;
}

export interface Planungsantwort {
  antwort: string;
  projekt: Projekt;
  protokoll: Protokolleintrag[];
  abgebrochen?: string;
}

export async function planeMitKi(projekt: Projekt, nachricht: string, verlauf: Chatnachricht[] = []): Promise<Planungsantwort> {
  const client = new Anthropic();
  const sitzung = new Planungssitzung(projekt);

  const messages: Anthropic.Beta.BetaMessageParam[] = verlauf
    .slice(-20)
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.rolle, content: m.text }));
  // Die API erwartet eine Nutzernachricht am Anfang
  while (messages.length && messages[0].role !== "user") messages.shift();

  messages.push({
    role: "user",
    content: `${nachricht}\n\n<projektstand>\n${JSON.stringify(sitzung.zusammenfassung())}\n</projektstand>`,
  });

  const final = await client.beta.messages.toolRunner({
    model: MODELL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    // Bei einer Ablehnung durch Sicherheitsklassifikatoren übernimmt serverseitig ein Ersatzmodell
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools: erstelleWerkzeuge(sitzung),
    messages,
    max_iterations: 30,
  });

  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  let abgebrochen: string | undefined;
  if (final.stop_reason === "refusal") abgebrochen = "Die Anfrage wurde vom Modell abgelehnt.";
  else if (final.stop_reason === "max_tokens") abgebrochen = "Die Antwort wurde wegen der Längenbegrenzung abgeschnitten.";
  else if (final.stop_reason === "tool_use") abgebrochen = "Die maximale Anzahl an Arbeitsschritten wurde erreicht.";

  return {
    antwort: text || abgebrochen || "(keine Antwort)",
    projekt: sitzung.projekt,
    protokoll: sitzung.protokoll,
    abgebrochen,
  };
}
