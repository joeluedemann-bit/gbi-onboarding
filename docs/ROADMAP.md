# Roadmap

Ziel ist ein schrittweiser Ersatz von VESTRA INFRAVISION für die Standardaufgaben der GBI. Jede Phase endet mit einem nutzbaren Stand. Die Reihenfolge richtet sich danach, was im Tagesgeschäft am meisten Zeit spart.

## Phase 1 – Entwurfskern und Web-App ✅ (Version 0.1)

- Achse (Gerade, Kreisbogen, Klothoide), Tangentenpolygon, Stationierung
- Gradiente mit Ausrundungen, DGM, Geländeschnitt
- Regelwerksprüfung RAL (Grenzwerte noch fachlich zu verifizieren)
- Automatische Radienwahl und Gradiente aus Gelände, überschlägige Erdmassen
- KI-Assistent mit Werkzeugzugriff auf den Rechenkern
- LandXML-Austausch, Web-Oberfläche mit Lage- und Höhenplan

## Phase 1b – Straßenraum und Pläne ✅ (Version 0.2)

- Regelquerschnitt, Deckenbuch mit Aufweitungen, Verwindungen und Bordabsenkungen
- Querprofile mit Böschung, Deckenhöhen, Deckenbuch als CSV
- DXF-Pläne: Lageplan, Deckenhöhenplan, Höhenplan, Querprofile, RQ
- KI-Werkzeuge für Querschnitt, Querneigung, Spuränderungen, Querprofil- und Deckenbuchabfrage
- VESTRA-Achslisten-Import, Abgleich an Planstraße A (< 1 mm)

## Nächste Schritte (Stufe 2)

- [ ] Planlayouts mit Blattrahmen und Schriftfeld nach GBI-Vorlage (aus den Referenzplänen RQ/HP/QP/Deckenhöhenplan)
- [ ] Layer- und Farbschema nach „VESTRA Farben gemäß C01-Format“
- [ ] Freistellen über WIPEOUT (DXF 2000+) statt Freistellflächen
- [ ] Bordsteine als Einzelobjekte (Typ, Anschlag, Absenkungen, Radien an Einmündungen)
- [ ] Mehrere Achsen je Projekt (Planstraßen A–E) mit Anschlüssen
- [ ] Oberbau je Spur (Schichten), Mengen nach REB aus den Querprofilen

## Phase 2 – Fachliche Absicherung und Datenaustausch

- [ ] RAL-Grenzwerte fachlich prüfen, fehlende Kriterien ergänzen (Relationstrassierung/Radienfolge, Mindestlängen Bogen/Gerade, Haltesichtweite)
- [ ] Weitere Regelwerke: RAA (Autobahnen), RASt 06 (Stadtstraßen)
- [ ] Vergleichstests gegen VESTRA: dieselbe Achse in beiden Programmen, Abweichungen der Absteckpunkte < 1 mm
- [ ] REB-Datenarten (z. B. DA 040 Achse sowie Gradienten- und Querprofildaten), OKSTRA-Import
- [ ] Koordinatensysteme (ETRS89/UTM, Gauß-Krüger) und Höhensysteme (DHHN2016)
- [ ] DXF-Export Lage- und Höhenplan

## Phase 3 – Querschnitt, Querprofile, Mengen

- [ ] Regelquerschnitte nach RAL (RQ 9, RQ 11, RQ 11,5+, RQ 15,5, RQ 21)
- [ ] Querneigung und Verwindung (Anrampung), Prüfung Schrägneigung und Entwässerung
- [ ] Querprofile aus DGM, Böschungen, Mengenermittlung nach REB-VB 21.013
- [ ] 3D-Modell der Straße (Oberflächen), Export IFC 4.3 (IfcAlignment, IfcRoad)

## Phase 4 – Automatisierte Planung ausbauen

- [ ] Variantengenerator: mehrere Linienführungen zwischen Zwangspunkten, bewertet nach Länge, Erdmassen, Regelwerk und Kosten
- [ ] Optimierung der Gradiente nach Massenausgleich unter allen Randbedingungen
- [ ] Zwangspunkte und Sperrflächen (Schutzgebiete, Bebauung, Leitungen) als Eingabe für Automatik und KI
- [ ] KI: Erläuterungsbericht und Entwurfsbegründung aus dem Projekt erzeugen
- [ ] Sichtweitennachweis (Halte- und Überholsichtweite) im 3D-Modell

## Phase 5 – Planerstellung und Desktop

- [ ] Planlayouts (Lageplan, Höhenplan, Querprofile) als PDF/DWG mit Schriftfeld nach Vorgabe
- [ ] Desktop-Anwendung (Tauri) auf demselben Rechenkern, offline nutzbar
- [ ] Mehrbenutzerbetrieb: Projektablage auf dem Server, Versionen, Rechte

## Offene Entscheidungen

- **Rechenkern-Leistung:** Bei sehr großen DGM (> 1 Mio. Punkte) Vermaschung und Höhenabfrage nach Rust/WebAssembly verlagern.
- **CAD-Kern:** Für die Planerstellung eine eigene Zeichenkomponente oder eine Bibliothek (z. B. für DWG) verwenden.
- **Datenhaltung:** Projektdateien lokal (wie heute) oder zentrale Datenbank (PostgreSQL/PostGIS).
