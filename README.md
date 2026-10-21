# Windberg Windbericht

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
