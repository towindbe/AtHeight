/* AtHeight-Proxy: prüft Test-Token und leitet Abfragen an Open-Meteo weiter.
   Aufruf: <Proxy>/<dienst>/<pfad>?...&t=<token>   (dienst z. B. api, ensemble-api) */
import { admin } from "./admin.js";

const DIENSTE = ["api", "ensemble-api", "historical-forecast-api", "previous-runs-api", "geocoding-api"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "X-Token-Bis, X-Token-Rest",
};
const antwort = (status, fehler, extra = {}) =>
  new Response(JSON.stringify({ error: true, reason: fehler }), {
    status, headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });

export default {
  async fetch(req, env) {
    const url0 = new URL(req.url);
    if (url0.pathname === "/admin" || url0.pathname.startsWith("/admin/")) return admin(req, env, url0);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "GET") return antwort(405, "methode");

    const url = new URL(req.url);
    const [, dienst, ...rest] = url.pathname.split("/");
    if (!DIENSTE.includes(dienst)) return antwort(404, "dienst");

    const token = url.searchParams.get("t");
    url.searchParams.delete("t");
    if (!token) return antwort(401, "token");
    const info = await env.TOKENS.get("t:" + token, "json");   // {name, bis:"2026-12-31", limit?}
    if (!info) return antwort(401, "token");

    const heute = new Date().toISOString().slice(0, 10);
    // Resttage = volle Tage nach heute; 0 = letzter gültiger Tag, -1 = abgelaufen
    const kopf = { "X-Token-Bis": info.bis, "X-Token-Rest": String(heute > info.bis ? -1 : Math.round((Date.parse(info.bis) - Date.parse(heute)) / 864e5)) };
    if (heute > info.bis) return antwort(403, "abgelaufen", kopf);

    // Tageszähler in D1: ein Befehl zählt hoch und liefert den neuen Stand (genau, auch bei vielen gleichzeitigen Abfragen)
    const z = await env.ZAEHLER.prepare("INSERT INTO zaehler (token, tag, n) VALUES (?, ?, 1) ON CONFLICT (token, tag) DO UPDATE SET n = n + 1 RETURNING n")
      .bind(token, heute).first();
    if (z.n > (info.limit || parseInt(env.STANDARD_LIMIT, 10))) return antwort(429, "limit", kopf);

    const ziel = new URL(`https://${env.OM_PREFIX || ""}${dienst}.open-meteo.com/${rest.join("/")}`);
    ziel.search = url.search;
    if (env.OM_KEY) ziel.searchParams.set("apikey", env.OM_KEY);

    // nur Erfolge 5 Minuten zwischenspeichern; Fehler (z. B. 429 „Too many concurrent requests“) nie, sonst bekämen
    // alle Abrufe derselben Abfrage den Fehler, bis der Zwischenspeicher abläuft
    const r = await fetch(ziel, { cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 300, "300-599": -1 } } });
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries({ ...CORS, ...kopf })) h.set(k, v);
    return new Response(r.body, { status: r.status, headers: h });
  },
};
