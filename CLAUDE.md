# CLAUDE.md – AtHeight

**Diese Datei wird in jeder Sitzung mitgelesen und kostet Nutzung. Sie muss kurz bleiben (höchstens ~60 Zeilen):
nur Regeln und Grundsatzentscheidungen, keine Geschichte, nichts, was schon in README.md oder im Code steht.
Erledigtes wieder streichen.**

Wetter-Check für Höhenarbeit (Ampel KLAR/PRÜFEN/STOP je Arbeitsstunde). Betreiber: Tobias Windberg (Rope Access, Innsbruck).
Mit ihm **auf Deutsch**, in kleinen Schritten, kurz erklärt; vor größerem Umbau fragen. Aufbau und Test: siehe README.md.

## Arbeitsweise
- **Vor jeder Arbeit `git fetch` und vom aktuellen `main` starten.** Es wird lokal und in der Cloud gearbeitet,
  aber **nie zwei Sitzungen gleichzeitig** an der App.
- Vor dem Push: `npm test` muss grün sein (prüft **Deutsch und Englisch**, Referenzen `tests/expected.json` und
  `tests/expected.en.json`). Gewollte Änderung: `npm run test:accept`, Unterschiede vorher ansehen.
- Bei jeder Änderung den Versionsstempel `?v=` in `index.html` und `info.html` erhöhen (alle Vorkommen gleich).
- Pushen nur nach OK von Tobias. Commit-Nachrichten auf Deutsch.

## Sprache (Deutsch/Englisch)
- Jeder neue sichtbare Text braucht beide Sprachen: im Code `T("deutsch", "english")` (nicht `L` – so heißt Leaflet),
  im HTML `data-en`, `data-en-title`, `data-en-aria`, `data-en-ph`. Datum/Zahl mit `LOC()`/`fmt()`, Uhrzeit mit `UHR()`.
- Interne Kennwörter (z. B. Fehlergründe, die der Code vergleicht) bleiben deutsch.
- Noch offen: Tagesbericht und Infoseite sind nur deutsch.
- Fachbegriffe EN: CLEAR/CHECK/STOP, gust, hub, lee side, work window, coating mode, dew point spread, supervisor.

## Grundsatzentscheidungen
- Ampel **nur nach festen Regeln**, nie KI als Entscheider. App ist Entscheidungshilfe, Freigabe trifft der Aufsichtführende.
- Nur Modell-APIs (Open-Meteo, DWD, GeoSphere), kein Scraping. Open-Meteo gratis nur nicht-kommerziell.
- Modelle nie automatisch wegnehmen; „einzelne Modelle über Grenze → PRÜFEN“ gilt immer.
- Feuchte, Taupunkt, Wolken: nur Anzeige, außer Beschichten-Modus mit STOP-Häkchen (dann als „Stop nur wegen
  Beschichtung“ getrennt vom Wetter). Beschichten-Modus ist je Standort nur ein oder aus (gilt für alle Tage, kein automatisches Ende).
- Design: **dunkel ist Standard** auf allen Geräten, hell nur per Knopf. Linien-Icons statt Emojis. Tippflächen ≥ 44 px.
- Texte branchenneutral halten (nicht nur Windkraft); Windkraft-Begriffe nur bei „Einsatz an einer Windenergieanlage“.
