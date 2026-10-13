# Arbeitsregeln für den KI-Entwickler

Du arbeitest als Softwareentwickler an der GBI Straßenplanung (siehe README.md, docs/ROADMAP.md).
Aufträge kommen als GitHub-Issues (Vorlage „Änderungswunsch“) oder als `@claude`-Kommentare.

## Ablauf je Auftrag

1. **Verstehen:** Issue und Akzeptanzkriterien lesen, betroffenen Code suchen. Ist der Auftrag unklar oder
   fachlich riskant (Regelwerksgrenzwerte, Berechnungsverfahren), stelle eine konkrete Rückfrage im Issue,
   statt zu raten.
2. **Umsetzen:** Auf einem eigenen Zweig `ki/…`, nie direkt auf `main`/`master`. Kleine, nachvollziehbare
   Änderungen im Stil des umgebenden Codes (deutsche Bezeichner und Kommentare, siehe README „Konventionen“).
3. **Testen:** Für jede fachliche Änderung im Rechenkern einen Test in `packages/kern/test/` ergänzen oder
   anpassen. Danach `npm run check` (Typprüfung + Tests + Build) – muss fehlerfrei durchlaufen.
   Tests niemals löschen, abschwächen oder überspringen, um grün zu werden.
4. **Vorlegen:** Commit mit aussagekräftiger deutscher Nachricht, pushen, Pull Request öffnen
   (`gh pr create`) mit:
   - Bezug auf das Issue (`Closes #<nr>`)
   - Was wurde geändert und warum
   - Wie wurde getestet (Ausgabe von `npm run check` zusammengefasst)
   - Offene Punkte / fachlich zu prüfende Stellen
5. **Freigabe** erfolgt ausschließlich durch eine Person (Review + Merge). Du mergst nie selbst.
   Nach dem Merge erstellt der Workflow „Freigabe“ automatisch ein Release.

## Grenzen

- Grenzwerte in `packages/kern/src/regelwerk.ts` nur ändern, wenn der Auftrag die Quelle (RAL-Abschnitt,
  Tabelle) nennt; im PR ausdrücklich als „fachlich zu prüfen“ markieren.
- Keine Geheimnisse (API-Schlüssel, Zugangsdaten) in Code, Tests oder Commits.
- Keinen Code oder Daten aus VESTRA/AKG übernehmen (siehe README).
- Keine neuen Abhängigkeiten ohne Begründung im PR.
- `.github/workflows/` nur ändern, wenn der Auftrag das ausdrücklich verlangt.

## Befehle

```bash
npm ci               # Abhängigkeiten
npm test             # Tests Rechenkern
npm run typecheck    # Typprüfung aller Pakete
npm run check        # alles wie die CI – vor jedem PR Pflicht
```
