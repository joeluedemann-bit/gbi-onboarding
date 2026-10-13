# GBI Straßenplanung

Eigene Straßenplanungssoftware der GBI mit **Trassierung, Gradiente, Geländemodell, Regelwerksprüfung und KI-gestützter Entwurfsautomatisierung**.
Langfristiges Ziel: VESTRA INFRAVISION für die eigenen Standardaufgaben ablösen. Der Weg dahin: zuerst eine Web-App, später eine Desktop-Anwendung auf demselben Rechenkern.

> Eigenentwicklung: Die Software enthält keinen Code und keine Daten von VESTRA oder AKG. Sie baut auf öffentlich zugänglichen Verfahren und Regelwerken auf (Klothoidentrassierung, RAL, LandXML). Daten werden über offene Formate mit VESTRA und anderen Programmen ausgetauscht.

## Funktionsumfang (Version 0.1)

| Bereich | Umfang |
|---|---|
| **Achse** | Gerade, Kreisbogen, Klothoide (auch Ei-Klothoide), Stationierung, Hauptpunkte, Lotfußpunkt (Station/Abstand) |
| **Trassierung** | Tangentenpolygon mit Klothoide – Kreisbogen – Klothoide je Tangentenschnittpunkt, unsymmetrisch (A1 ≠ A2), Überschneidungsprüfung |
| **Gradiente** | Neigungswechselpunkte mit quadratischen Kuppen- und Wannenausrundungen, Hoch-/Tiefpunkte, Überschneidungsprüfung |
| **Gelände** | DGM als Delaunay-Dreiecksvermaschung, Höhenlinien, Geländeschnitt entlang der Achse |
| **Regelwerk** | Prüfung nach RAL-Entwurfsklassen EKL 1–4: Mindestradius, Radienbereich, Klothoidenparameter (R/3 ≤ A ≤ R), Höchstlängsneigung, Kuppen-/Wannenhalbmesser |
| **Automatik** | Radienwahl passend zu den Tangentenlängen, geländenahe Gradiente (Vereinfachung, Ausgleichung, Neigungsbegrenzung, Ausrundungen) |
| **Querschnitt** | Regelquerschnitt aus Spuren (Fahrbahn, Rinne, Bordstein, Gehweg, Bankett …) mit Breite, Querneigung und Bordanschlag, Vorlagen |
| **Deckenbuch** | Randpunkte je Station mit Abstand, Höhe und Koordinaten; Aufweitungen, Verwindungen (Querneigungsverlauf), Bordabsenkungen |
| **Querprofile** | Querprofil an jeder Station mit Böschung bis zum Gelände, Auftrags-/Abtragsflächen |
| **Erdmassen** | Überschlägige Massen (Trapezprofil) für Variantenvergleiche |
| **KI-Assistent** | Claude plant über dieselben Funktionen wie die Oberfläche, prüft selbst gegen das Regelwerk und bessert nach |
| **Pläne (DXF → DWG)** | Lageplan, Deckenhöhenplan, Höhenplan mit Bändern und Krümmungsbild, Querprofile, Regelquerschnitt; Beschriftungen freigestellt, Umlaute in Windows-1252 |
| **Austausch** | LandXML 1.2 Export/Import, VESTRA-Achsliste (AXEL####.LST) Import, Deckenbuch als CSV, Geländepunkte als CSV/TXT, Projektdatei (JSON) |
| **Oberfläche** | Lageplan mit Höhenschichten, Höhenplan mit Krümmungsbild, interaktives Bearbeiten, Rückgängig/Wiederholen, Autosicherung |

**Wichtig:** Die hinterlegten RAL-Grenzwerte (`packages/kern/src/regelwerk.ts`) müssen vor dem Einsatz in echten Projekten fachlich gegen die gültige Ausgabe der RAL geprüft werden. Die Verantwortung für den Entwurf liegt bei der planenden Person, auch wenn die KI ihn erstellt hat.

## Schnellstart

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev          # Server (Port 8787) und Web-App (http://localhost:5173)
```

Beim ersten Start öffnet sich ein Beispielprojekt mit synthetischem Gelände.

### KI-Assistent einrichten

Der KI-Assistent läuft auf dem Server, der API-Schlüssel verlässt den Server nicht:

```bash
# Linux/macOS
export ANTHROPIC_API_KEY=sk-ant-...
# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-..."

npm run dev
```

Standardmodell ist `claude-opus-5-5`, änderbar über `GBI_KI_MODELL`. Lehnt das Modell eine Anfrage ab, übernimmt serverseitig automatisch ein Ersatzmodell (Anthropic „server-side fallback“).

### Pläne als DWG

Die Pläne werden als DXF (AutoCAD R12) erzeugt: Menü **Export**. AutoCAD und BricsCAD öffnen sie direkt, dort „Speichern unter → DWG“. Für viele Dateien auf einmal eignet sich der kostenlose ODA File Converter (DXF → DWG im Stapel). Freistellflächen hinter Beschriftungen liegen auf dem Layer `FREISTELLEN` (Farbe 255, beim Plotten weiß).

### Abgleich mit VESTRA

Am Projekt „Planstraße A“ (Seukendorf) nachgerechnet:
- Achse aus der VESTRA-Ergebnisliste: Hauptpunkte < 1 mm Lage, ≤ 1 cc Richtung; 135 Absteckpunkte der Achse < 1 mm
- Gradiente aus dem Höhenplan: 48 Stationen < 1 mm, Tangentenlängen und Stich identisch

### Weitere Befehle

```bash
npm test             # Tests des Rechenkerns
npm run typecheck    # Typprüfung aller Pakete
npm run check        # Typprüfung + Tests + Build (wie die CI)
npm start            # Web-App bauen und über den Server ausliefern (http://localhost:8787)
```

## KI-Entwickler (Bot)

Änderungswünsche setzt ein KI-Entwickler (Claude Code als GitHub Action) um:

1. **Auftrag:** Issue mit der Vorlage „Änderungswunsch“ anlegen (setzt das Label `ki-entwickler`).
2. **Umsetzung:** Der Bot legt einen Zweig `ki/…` an, ändert den Code und ergänzt Tests.
3. **Test:** `npm run check` muss fehlerfrei laufen; zusätzlich prüft die CI den Pull Request.
4. **Vorlage:** Der Bot öffnet einen Pull Request mit Beschreibung und offenen Punkten. Nachbesserungen per Kommentar `@claude …`.
5. **Freigabe:** Eine Person prüft und mergt. Danach erstellt der Workflow „Freigabe“ ein Release mit dem Web-App-Build.

Einrichtung: Repository-Secret `ANTHROPIC_API_KEY` anlegen und die Claude GitHub App installieren (https://github.com/apps/claude). Arbeitsregeln des Bots: `CLAUDE.md`.

## Aufbau

```
packages/kern     Rechenkern in TypeScript, ohne Oberfläche. Läuft im Browser, auf dem Server und später in der Desktop-App.
  elemente.ts       Gerade/Kreisbogen/Klothoide, numerische Integration (Gauß-Legendre)
  achse.ts          Achse, Stationierung, Hauptpunkte, Lotfußpunkt
  trassierung.ts    Tangentenpolygon → Elementfolge
  gradiente.ts      Neigungswechsel, Ausrundungen
  dgm.ts            Delaunay-DGM, Höhenabfrage
  regelwerk.ts      Grenzwerte der Entwurfsklassen (zentral, leicht anpassbar)
  pruefung.ts       Regelwerksprüfung
  automatik.ts      Radienwahl, Gradiente aus Gelände
  massen.ts         Überschlägige Erdmassen
  landxml.ts        LandXML 1.2 Export/Import
  vestra.ts         Import VESTRA-Achsliste (Textausgabe), Vergleich mit Hauptpunkten
  querschnitt.ts    Regelquerschnitt, Deckenbuch, Querprofile, Spurränder
  dxf.ts            DXF-Schreiber (R12, Windows-1252, Freistellen)
  plaene.ts         Lageplan, Deckenhöhenplan, Höhenplan, Querprofile, RQ als DXF
  projekt.ts        Projektmodell (JSON) und Gesamtberechnung
apps/server       Express-Server: KI-Assistent (Claude, Werkzeugaufrufe auf den Rechenkern), Auslieferung der Web-App
apps/web          React-Web-App: Lageplan, Höhenplan, Seitenleiste, KI-Chat
```

### Konventionen

- Koordinaten: Rechtswert **E**, Hochwert **N** in m (LandXML schreibt „N E“)
- Richtungswinkel von Gitternord im Uhrzeigersinn, Anzeige in gon
- Krümmung/Radius **positiv = Rechtskurve** in Stationierungsrichtung
- Neigungen dimensionslos im Kern (0,02 = 2 %), Anzeige in Prozent

### Wie die KI arbeitet

Der Assistent rechnet keine Geometrie selbst. Er ruft Werkzeuge auf (`tangentenpolygon_setzen`, `radien_automatisch`, `gradiente_automatisch`, `erdmassen_schaetzen`, `regelwerk_pruefen` …), die den Rechenkern verwenden. So bleiben die Ergebnisse nachvollziehbar und reproduzierbar. Jeder Arbeitsschritt wird im Chat protokolliert, und jede KI-Änderung lässt sich mit Rückgängig zurücknehmen.

## Roadmap

Siehe [docs/ROADMAP.md](docs/ROADMAP.md).
