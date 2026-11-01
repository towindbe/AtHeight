/* Verwaltung der Zugangs-Token: Seite unter /admin, Daten unter /admin/api/…
   Geschützt durch das Secret ADMIN_KEY (Header X-Admin-Key). */
import seite from "./admin.html";

const json = (status, daten) => new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const heute = () => new Date().toISOString().slice(0, 10);
const plusTage = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const VERLAUF_TAGE = 90;   // so lange bleibt der Tagesverlauf gespeichert
const TOKEN_FORM = /^[a-f0-9]{24}$/;

// Vergleich in gleicher Zeit, damit die Antwortdauer das Passwort nicht verrät
function gleich(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

async function liste(env) {
  const h = heute(), out = [];
  await env.ZAEHLER.prepare("DELETE FROM zaehler WHERE tag < ?").bind(plusTage(-VERLAUF_TAGE)).run();   // alte Zähler aufräumen
  const verlauf = new Map();   // token -> [{tag, n}], neueste zuerst
  for(const r of (await env.ZAEHLER.prepare("SELECT token, tag, n FROM zaehler ORDER BY tag DESC").all()).results){
    if(!verlauf.has(r.token)) verlauf.set(r.token, []);
    verlauf.get(r.token).push({ tag: r.tag, n: r.n });
  }
  const summe = (v, tage) => v.filter(x => x.tag > plusTage(-tage)).reduce((s, x) => s + x.n, 0);
  let cursor;
  do {
    const r = await env.TOKENS.list({ prefix: "t:", cursor });
    for (const k of r.keys) {
      const token = k.name.slice(2), info = await env.TOKENS.get(k.name, "json");
      if (!info) continue;
      const v = verlauf.get(token) || [], heuteN = (v.find(x => x.tag === h) || {}).n || 0;
      const rest = Math.round((Date.parse(info.bis + "T12:00:00Z") - Date.parse(h + "T12:00:00Z")) / 864e5);
      out.push({ token, name: info.name, bis: info.bis, limit: info.limit || parseInt(env.STANDARD_LIMIT, 10), heute: heuteN, tage7: summe(v, 7), tage30: summe(v, 30), verlauf: v, rest });
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out.sort((a, b) => a.bis.localeCompare(b.bis));
}

export async function admin(req, env, url) {
  const pfad = url.pathname.replace(/\/+$/, "");
  if (pfad === "/admin") {
    return new Response(seite, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (!env.ADMIN_KEY) return json(503, { fehler: "ADMIN_KEY nicht gesetzt" });
  if (!gleich(req.headers.get("X-Admin-Key") || "", env.ADMIN_KEY)) return json(401, { fehler: "Passwort falsch" });

  const teile = pfad.split("/");   // ["", "admin", "api", "tokens", <token>, <aktion>]
  if (teile[2] !== "api" || teile[3] !== "tokens") return json(404, { fehler: "unbekannt" });
  const token = teile[4];

  if (!token && req.method === "GET") return json(200, { app: env.APP_URL || "", tokens: await liste(env) });

  if (!token && req.method === "POST") {
    const d = await req.json().catch(() => ({}));
    const tage = Math.floor(+d.tage), limit = Math.floor(+d.limit) || 0, name = String(d.name || "").trim().slice(0, 80);
    if (!name || !(tage >= 1 && tage <= 3650)) return json(400, { fehler: "Name und Tage (1–3650) angeben" });
    const neu = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, "0")).join("");
    const info = { name, bis: plusTage(tage), ...(limit > 0 ? { limit } : {}) };
    await env.TOKENS.put("t:" + neu, JSON.stringify(info));
    return json(200, { token: neu, ...info });
  }

  if (token && TOKEN_FORM.test(token)) {
    const info = await env.TOKENS.get("t:" + token, "json");
    if (!info) return json(404, { fehler: "Token nicht gefunden" });
    if (teile[5] === "verlaengern" && req.method === "POST") {
      const tage = Math.floor(+(await req.json().catch(() => ({}))).tage);
      if (!(tage >= 1 && tage <= 3650)) return json(400, { fehler: "Tage (1–3650) angeben" });
      info.bis = plusTage(tage);   // Name und Limit bleiben erhalten
      await env.TOKENS.put("t:" + token, JSON.stringify(info));
      return json(200, { token, ...info });
    }
    if (teile[5] === "bearbeiten" && req.method === "POST") {
      // Name, Ablaufdatum und Tageslimit im laufenden Betrieb ändern; Token und Zähler bleiben gleich
      const d = await req.json().catch(() => ({}));
      const name = String(d.name || "").trim().slice(0, 80), bis = String(d.bis || ""), limit = Math.floor(+d.limit);
      if (!name) return json(400, { fehler: "Name angeben" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bis) || isNaN(Date.parse(bis)) || bis > plusTage(3650)) return json(400, { fehler: "Gültig bis: Datum angeben (höchstens 10 Jahre)" });
      if (!(limit >= 1 && limit <= 100000)) return json(400, { fehler: "Abfragen pro Tag (1–100000) angeben" });
      const neu = { ...info, name, bis, limit };
      await env.TOKENS.put("t:" + token, JSON.stringify(neu));
      return json(200, { token, ...neu });
    }
    if (!teile[5] && req.method === "DELETE") {
      await env.TOKENS.delete("t:" + token);
      return json(200, { gesperrt: token });
    }
  }
  return json(404, { fehler: "unbekannt" });
}
