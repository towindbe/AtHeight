/* AtHeight-Proxy: prüft Test-Token und leitet Abfragen an Open-Meteo weiter.
   Aufruf: <Proxy>/<dienst>/<pfad>?...&t=<token>   (dienst z. B. api, ensemble-api) */
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
    const rest_tage = Math.ceil((Date.parse(info.bis + "T23:59:59Z") - Date.now()) / 864e5);
    const kopf = { "X-Token-Bis": info.bis, "X-Token-Rest": String(Math.max(rest_tage, 0)) };
    if (heute > info.bis) return antwort(403, "abgelaufen", kopf);

    // Tageszähler (ungefähr genau, für ein Testlimit ausreichend)
    const zk = `z:${token}:${heute}`;
    const n = parseInt(await env.TOKENS.get(zk) || "0", 10);
    if (n >= (info.limit || parseInt(env.STANDARD_LIMIT, 10))) return antwort(429, "limit", kopf);
    await env.TOKENS.put(zk, String(n + 1), { expirationTtl: 172800 });

    const ziel = new URL(`https://${env.OM_PREFIX || ""}${dienst}.open-meteo.com/${rest.join("/")}`);
    ziel.search = url.search;
    if (env.OM_KEY) ziel.searchParams.set("apikey", env.OM_KEY);

    const r = await fetch(ziel, { cf: { cacheTtl: 300, cacheEverything: true } });
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries({ ...CORS, ...kopf })) h.set(k, v);
    return new Response(r.body, { status: r.status, headers: h });
  },
};
