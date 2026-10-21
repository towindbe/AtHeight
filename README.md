# Windbericht für Höhenarbeit

Wind- und Wetterbericht in Nabenhöhe für Seilarbeiten an Windenergieanlagen. Eigenständige Web-App (eine HTML-Datei, kein Build).

- Ruft rund 16 Wettermodelle über die [Open-Meteo](https://open-meteo.com) Forecast API ab und rechnet den Wind auf Nabenhöhe.
- Regelbasierte Ampel pro Stunde, Tagesbericht mit Freigabe, Druck/PDF und JSON-Export.

**Hinweis:** Entscheidungshilfe, keine Freigabe. Die Arbeitsfreigabe trifft der Aufsichtführende.

Wetterdaten: Open-Meteo.com (CC BY 4.0), nur für nicht-kommerzielle Nutzung kostenlos.

## Lokal starten

```
python -m http.server 8765
```

Dann http://localhost:8765/windbericht.html öffnen.

## Werte prüfen

- **Rohdaten:** In der Tabelle „Modelle am Standort“ führt pro Modell ein Link (JSON oder CSV) direkt zur API-Abfrage, die die App verwendet.
- **Prüfskript:** Im Tagesbericht „Rohdaten speichern (JSON)“ klicken, dann direkt danach:

```
python tools/pruefen.py windbericht_Standort_JJJJ-MM-TT.json
```

Das Skript holt die Rohdaten neu, rechnet Wind im Arbeitsbereich, Richtung, Böe und Median unabhängig nach und meldet jede Abweichung (Exit-Code 1). Es prüft, ob die App richtig lädt und rechnet, nicht, ob die Prognose stimmt. Weil die Modelle mehrmals täglich neu rechnen, sollte der Export höchstens eine Stunde alt sein.

## Prüfsumme im Tagesbericht

Drucken und „Rohdaten speichern (JSON)“ verwenden dieselben, eingefrorenen Berichtsdaten. Die SHA-256-Prüfsumme im PDF steht auch in der JSON-Datei (Feld `pruefsumme`) und wird über die Daten ohne dieses Feld berechnet (`JSON.stringify`, kompakt). `tools/pruefen.py` kontrolliert sie mit. Die Prüfsumme belegt, dass Datei und Bericht zusammengehören und unverändert sind. Fälschungssicher wird sie erst, wenn sie zusätzlich unveränderlich abgelegt wird (z. B. per E-Mail an den Auftraggeber).

## Aufbau

Kein Build-Schritt, läuft direkt auf GitHub Pages.

| Datei | Inhalt |
|---|---|
| `windbericht.html` | Seitenaufbau (`index.html` leitet dorthin weiter) |
| `css/windbericht.css` | Gestaltung inkl. Druck des Tagesberichts |
| `js/konfiguration.js` | Modelle, Schwellen, Standard-Anlage, App-Zustand |
| `js/hilfen.js` | Formatierung, Zeitzonen |
| `js/physik.js` | Höhenrechnung, Böe, Temperatur, Windchill |
| `js/daten.js` | Abruf: Modelle, Szenarien, UV, Warnungen |
| `js/tageslicht.js` | Sonnenstand, Dämmerung |
| `js/bewertung.js` | Ampelregeln mit Gründen, Tageszusammenfassung |
| `js/anzeige.js` | Entscheidung, Kacheln, Zeitleiste |
| `js/diagramme.js` | Windverlauf, Regen, Höhenprofil, Windrichtung, Zeitmarker |
| `js/tabellen.js` | Matrix, Stunden- und Modelltabelle |
| `js/modellvergleich.js` | Vergleich mit Messstationen |
| `js/karte.js`, `js/radar.js` | Karte, Standortwahl, Regenradar |
| `js/bericht.js` | Tagesbericht, Prüfsumme, Export |
| `js/anlagen.js`, `js/bedienung.js` | Gespeicherte Anlagen, Knöpfe, Einstellungen |
| `js/start.js` | Start der App (zuletzt geladen) |

Die Skripte sind klassische Skripte (kein `type="module"`) und teilen sich den globalen Gültigkeitsbereich; die Reihenfolge in `windbericht.html` ist wichtig.
**Bei jeder Veröffentlichung** den Parameter `?v=` aller Dateien in `windbericht.html` erhöhen, sonst mischen Browser alte und neue Dateien.

## Automatischer Test

```
npm install
npm test
```

`tests/run.mjs` öffnet die App ohne Fenster (lokal Edge, auf GitHub Chromium), spielt aufgezeichnete Antworten der Wetterdienste ab (`tests/fixtures/api.json`), friert die Uhrzeit ein und vergleicht Bewertung, Texte, Modellvergleich, Tagesbericht und Prüfsumme mit `tests/expected.json`. Läuft bei jedem Push über GitHub Actions (`.github/workflows/test.yml`).

Ändert sich das Verhalten **gewollt** (z. B. neue Regel oder anderer Text): `npm run test:accept` übernimmt das neue Ergebnis als Referenz (mit denselben aufgezeichneten Wetterdaten); vor dem Commit mit `git diff tests/expected.json` prüfen, dass sich nur das Gewollte geändert hat. `npm run test:record` zeichnet zusätzlich neue Wetterdaten auf (nur selten nötig).
