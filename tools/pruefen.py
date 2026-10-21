"""Prüft einen JSON-Export des Windberichts gegen die Rohdaten von Open-Meteo.

Holt für jedes Modell im Export die Rohdaten neu, rechnet den Wind im
Arbeitsbereich, die Richtung und die geschätzte Böe unabhängig von der App nach
und vergleicht. Bestätigt, dass die App die Daten unverändert übernimmt und
richtig rechnet. Ob die Prognose zur Wirklichkeit passt, prüft es nicht.

Aufruf:  python tools/pruefen.py windbericht_Standort_2026-10-21.json

Wichtig: Direkt nach dem Export ausführen. Die Modelle rechnen mehrmals am Tag
neu; ist der Export älter als ein neuer Modelllauf, weichen die Werte ab.
"""
import hashlib
import json
import math
import statistics
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

LEVELS = [10, 80, 120, 180]
TOL = 0.01  # m/s

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def clamp(v, a, b):
    return min(b, max(a, v))


def wind_at(lv, z):
    """Wind in Höhe z aus [(Höhe, Wind)], gleiche Regeln wie in der App."""
    if not lv:
        return None
    if len(lv) == 1:
        z0, v0 = lv[0]
        return v0 * (z / z0) ** 0.2
    if z <= lv[0][0]:
        return lv[0][1] * (max(z, 2) / lv[0][0]) ** 0.2
    if z >= lv[-1][0]:
        (z1, v1), (z2, v2) = lv[-2], lv[-1]
        a = 0.14
        if v1 > 0.5 and v2 > 0.5:
            a = clamp(math.log(v2 / v1) / math.log(z2 / z1), 0.05, 0.4)
        return v2 * (z / z2) ** a
    for (z1, v1), (z2, v2) in zip(lv, lv[1:]):
        if z1 <= z <= z2:
            return v1 + (v2 - v1) * (z - z1) / (z2 - z1)
    return None


def main(path):
    exp = json.load(open(path, encoding="utf-8"))

    # Prüfsumme: SHA-256 über die Daten ohne das Feld "pruefsumme", kompakt wie JSON.stringify
    if "pruefsumme" in exp:
        data = {k: v for k, v in exp.items() if k != "pruefsumme"}
        calc = hashlib.sha256(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
        if calc == exp["pruefsumme"]:
            print(f"Prüfsumme OK: {calc}  (muss mit der Zahl im gedruckten Bericht übereinstimmen)")
        else:
            print(f"PRÜFSUMME FALSCH: Datei {exp['pruefsumme']} / berechnet {calc}. Die Datei wurde verändert.")
            return 1
    else:
        print("Hinweis: Datei enthält keine Prüfsumme (älterer Export).")
    site = exp["standort"]
    work, top = exp["bereich"]["arbeitshoehe"], exp["bereich"]["bis"]
    heights = sorted({work, top, *[z for z in LEVELS if work < z < top]})

    print(f"Standort: {site['name']} ({site['lat']}, {site['lon']}) · Bereich {exp['bereich']['text']} · Tag {exp['tag']}")
    if exp.get("abgerufen"):
        age = datetime.now(timezone.utc) - datetime.fromisoformat(exp["abgerufen"].replace("Z", "+00:00"))
        print(f"Export abgerufen vor {age.total_seconds() / 60:.0f} min")
        if age.total_seconds() > 3600:
            print("  Hinweis: älter als 1 h, Abweichungen können von neuen Modellläufen kommen.")

    problems, checked = [], 0
    per_hour = {}
    for m in exp["modelle"]:
        if m["status"] not in ("ok", "extrap") or not m.get("werte"):
            continue
        try:
            # In UTC abfragen: Open-Meteo rechnet Ortszeiten mit festem Versatz,
            # über eine Zeitumstellung hinweg wären sie verschoben.
            h = json.load(urllib.request.urlopen(m["abfrage"].replace("timezone=auto", "timezone=GMT"), timeout=30))["hourly"]
        except urllib.error.URLError as e:
            problems.append(f"{m['name']}: Abruf fehlgeschlagen ({e})")
            continue
        idx = {}
        for i, t in enumerate(h["time"]):
            idx.setdefault(t, i)
        for w in m["werte"]:
            if w is None or w.get("utc") not in idx:
                continue
            key = w["utc"]
            i = idx[key]
            lv = [(z, h[f"wind_speed_{z}m"][i]) for z in LEVELS if h.get(f"wind_speed_{z}m") and h[f"wind_speed_{z}m"][i] is not None]
            v = max(x for x in (wind_at(lv, z) for z in heights) if x is not None)
            dirs = [(z, h[f"wind_direction_{z}m"][i]) for z in LEVELS if h.get(f"wind_direction_{z}m") and h[f"wind_direction_{z}m"][i] is not None]
            d = min(dirs, key=lambda x: abs(x[0] - work))[1] if dirs else None
            g10, v10 = h["wind_gusts_10m"][i], h["wind_speed_10m"][i]
            g = None if g10 is None or v10 is None else v * (1 + (clamp(g10 / max(v10, 1), 1, 2.5) - 1) * 0.6)
            per_hour.setdefault(key, []).append(v)
            checked += 1
            bad = []
            if abs(v - w["wind"]) > TOL:
                bad.append(f"Wind App {w['wind']:.2f} / neu {v:.2f}")
            if d != w["richtung"]:
                bad.append(f"Richtung App {w['richtung']} / neu {d}")
            if (g is None) != (w["boe"] is None) or (g is not None and abs(g - w["boe"]) > TOL):
                bad.append(f"Böe App {w['boe']} / neu {g}")
            if bad:
                problems.append(f"{m['name']} ({m['anbieter']}) {w['zeit']}: " + "; ".join(bad))

    for s in exp["stunden"]:
        vs = per_hour.get(s.get("utc"))
        if vs and s["median"] is not None and abs(statistics.median(vs) - s["median"]) > TOL:
            problems.append(f"Median {s['zeit']}: App {s['median']:.2f} / neu {statistics.median(vs):.2f}")

    print(f"Geprüft: {checked} Modellwerte, {len(exp['stunden'])} Stunden-Mediane")
    if problems:
        print(f"{len(problems)} Abweichung(en):")
        for p in problems:
            print("  " + p)
        return 1
    print("OK: Alle Werte stimmen mit den Rohdaten überein.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
