import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Projekt } from "@gbi/kern";
import { type Chatnachricht, planeMitKi } from "./ki/assistent";

const app = express();
app.use(express.json({ limit: "50mb" }));

app.get("/api/status", (_req, res) => {
  res.json({
    version: "0.1.0",
    kiKonfiguriert: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  });
});

app.post("/api/ki/planen", async (req, res) => {
  const { projekt, nachricht, verlauf } = req.body as { projekt?: Projekt; nachricht?: string; verlauf?: Chatnachricht[] };
  if (!projekt || projekt.format !== "gbi-strassenplanung" || typeof nachricht !== "string" || !nachricht.trim()) {
    res.status(400).json({ fehler: "Projekt und Nachricht werden benötigt" });
    return;
  }
  try {
    res.json(await planeMitKi(projekt, nachricht, Array.isArray(verlauf) ? verlauf : []));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      res.status(401).json({ fehler: "Der KI-Dienst ist nicht angemeldet: ANTHROPIC_API_KEY auf dem Server setzen." });
    } else if (e instanceof Anthropic.RateLimitError) {
      res.status(429).json({ fehler: "Der KI-Dienst ist ausgelastet – bitte gleich noch einmal versuchen." });
    } else if (e instanceof Anthropic.APIError) {
      res.status(502).json({ fehler: `KI-Dienst: ${e.message}` });
    } else {
      console.error(e);
      res.status(500).json({ fehler: (e as Error).message });
    }
  }
});

// Im Produktivbetrieb liefert der Server auch die gebaute Web-App aus
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`GBI Straßenplanung – Server läuft auf http://localhost:${port}`);
});
