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
