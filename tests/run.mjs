// Automatischer Test von AtHeight.
//
// Öffnet die App in einem Browser ohne Fenster, spielt aufgezeichnete Antworten der
// Wetterdienste ab (tests/fixtures/api.json) und friert die Uhrzeit ein. So ist das
// Ergebnis bei jedem Lauf identisch. Dann wird ein fester Ablauf durchgespielt und das
// Ergebnis mit tests/expected.json verglichen.
//
//   node tests/run.mjs            Test (vergleicht mit expected.json)
//   node tests/run.mjs --accept   gewollte Änderung: aktuelles Ergebnis als Referenz übernehmen
//   node tests/run.mjs --lang=en  dasselbe für die englische Oberfläche (Referenz tests/expected.en.json)
//   node tests/run.mjs --record   neue Aufzeichnung + neue Referenz (nur bewusst ausführen!)
//
// Lokal wird Microsoft Edge verwendet (anderer Browser: WB_BROWSER=chrome node tests/run.mjs), auf GitHub Actions Chromium.
import {chromium} from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(ROOT, "tests", "fixtures", "api.json");
// Sprache: --lang=en prüft die englische Oberfläche gegen eine eigene Referenz (expected.en.json)
const LANG = process.argv.find(a => a.startsWith("--lang="))?.slice(7) === "en" ? "en" : "de";
const EXP = path.join(ROOT, "tests", LANG === "en" ? "expected.en.json" : "expected.json");
const RECORD = process.argv.includes("--record");
const ACCEPT = process.argv.includes("--accept");
const RECORD_MISSING = process.argv.includes("--record-missing");   // neue Datenquellen nachzeichnen, Rest bleibt   // gewollte Änderung: Ergebnis als neue Referenz übernehmen
const OUT = process.argv.find(a => a.startsWith("--out="))?.slice(6);

// Wetter- und Warndienste: werden aufgezeichnet bzw. abgespielt
const API = /open-meteo\.com|workers\.dev|api\.brightsky\.dev|hub\.geosphere\.at|warnungen\.zamg\.at|maps\.dwd\.de/;
// Kartenkacheln und Radarbilder sind für den Test unwichtig
const TILES = /arcgisonline\.com|tile\.openstreetmap\.org/;

// kleiner Webserver für den Projektordner
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".json":"application/json"};
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {"Content-Type": TYPES[path.extname(p)] || "application/octet-stream"});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const fixture = RECORD ? {fixed: Date.now(), responses: {}} : JSON.parse(fs.readFileSync(FIX, "utf8"));
const missing = []; let added = 0;

const browser = await chromium.launch(process.env.CI ? {} : {channel: process.env.WB_BROWSER || "msedge"});
const page = await browser.newPage({viewport: {width: 1100, height: 900}, locale: "de-DE", timezoneId: "Europe/Berlin"});
const errors = [];
page.on("pageerror", e => errors.push("Seitenfehler: " + e.message));
page.on("console", m => { if(m.type()==="error" && !/Failed to load resource/.test(m.text())) errors.push("Konsole: " + m.text()); });

// Uhrzeit einfrieren (vor allen Skripten der Seite)
await page.addInitScript(fixed => {
  const RD = Date;
  class FD extends RD { constructor(...a){ a.length ? super(...a) : super(fixed); } static now(){ return fixed; } }
  window.Date = FD;
}, fixture.fixed);

// englische Oberfläche: Sprache vor dem Laden setzen
await page.addInitScript(lang => { try{ if(lang === "en") localStorage.setItem("wb_lang", "en"); }catch(e){} }, LANG);

// Die App läuft nur mit Zugangs-Token: ein Testtoken setzen und die Proxy-Adresse auf die direkte Open-Meteo-Adresse zurückführen,
// damit die Aufzeichnungen (tests/fixtures) unverändert bleiben
await page.addInitScript(() => { try{ localStorage.setItem("wb_token", "0123456789abcdef"); }catch(e){} });
const direkt = u => u.replace(/^https:\/\/[^/]*workers\.dev\/([a-z-]+)\/(.*?)\?t=[a-f0-9]+&/, "https://$1.open-meteo.com/$2?");
await page.route(TILES, r => r.fulfill({status: 204, body: ""}));
await page.route(API, async route => {
  const url = direkt(route.request().url());
  if(RECORD){
    const resp = await route.fetch({url});
    const body = await resp.text();
    fixture.responses[url] = {status: resp.status(), body};
    return route.fulfill({status: resp.status(), body, headers: {"content-type": "application/json", "access-control-allow-origin": "*"}});
  }
  let hit = fixture.responses[url];
  if(!hit && RECORD_MISSING){
    const resp = await route.fetch({url}); hit = fixture.responses[url] = {status: resp.status(), body: await resp.text()}; added++;
  }
  if(!hit){ missing.push(url); return route.fulfill({status: 599, body: '{"error":true,"reason":"nicht aufgezeichnet"}', headers: {"access-control-allow-origin": "*"}}); }
  return route.fulfill({status: hit.status, body: hit.body, headers: {"content-type": "application/json", "access-control-allow-origin": "*"}});
});

await page.goto(base + "/index.html");
await page.waitForFunction(() => typeof load === "function" && document.body.classList.contains("no-site"));

// Fester Ablauf. Ergebnis: Werte und sichtbare Texte, die sich nicht ändern dürfen.
const result = await page.evaluate(async () => {
  const out = {};
  const text = sel => (document.querySelector(sel)?.innerText || "").replace(/[ \t]+/g, " ").trim();
  const hours = () => state.hours.map(h => ({t:h.t, lamp:h.lamp, why:h.why.map(w => w.l+":"+w.t), n:h.n, med:h.med, min:h.min, max:h.max, gMed:h.gMed,
    over:h.over, pEns:h.pEns, tW:h.tW, chill:h.chill, dark:h.dark, rain:h.rain, cape:h.cape, dir:h.dir.mean, warns:(h.warns||[]).length}));

  out.erststart = text("#headline");
  siteChosen = true; document.body.classList.remove("no-site");
  site = {...DEFAULT_SITE, name:"Testanlage", lat:47.955, lon:9.64, hub:125, rotor:149, work:80, path:true, access:"nacelle", wind:12, gust:15, from:6, to:19, checked:true};
  await load();

  out.modelle = state.results.map(r => r.m.id + ":" + r.status);
  out.stunden = hours();
  out.ansicht = {kopf:text("header.top"), entscheidung:text("#headline"), zusammenfassung:text("#summary"), tag:text("#heroDay"),
    warnungen:text("#warnBox"), kacheln:text("#nowBox"), gruende:text("#nowWhy"), zeitleiste:document.querySelectorAll("#timeline .tl-cell").length,
    matrix:text("#matrix"), stundentabelle:text("#hourTable"), modelltabelle:text("#modelTable")};

  selectHour(state.sel + 4);
  out.andereStunde = {label:text("#nowLabel"), kacheln:text("#nowBox"), gruende:text("#nowWhy"), profil:text("#profileHour"), richtung:text("#compassFacts")};

  document.querySelectorAll("#dayTabs button")[1].click();
  out.morgen = {entscheidung:text("#headline"), zusammenfassung:text("#summary"), tage:text("#dayTabs")};
  document.querySelectorAll("#dayTabs button")[0].click();

  await computeRanking();
  out.modellvergleich = text("#rankOut").replace(/Berechnet [^.]*\./, "");

  r_project.value = "Testprojekt"; r_turbine.value = "Testtyp, WEA 1"; r_team.value = "A. Test"; r_lead.value = "B. Test";
  r_task.value = "Turmreparatur"; r_decision.value = "Eingeschränkt freigegeben"; r_notes.value = "Bemerkung\nzweite Zeile";
  const rep = await buildReport();
  out.bericht = {text: report.innerText.replace(/\s+/g, " ").trim(), pruefsumme: rep.hash};
  out.export = rep.snap;

  if(outlookPromise) await outlookPromise;
  out.ausblick = text("#outlook");

  // Zugang vom Boden: Bereich 10 m bis Arbeitshöhe
  site = {...site, access:"ground"}; state.hours = computeHours(state.results, state.times);
  out.vomBoden = {bereich: zoneTxt(), stunden: state.hours.filter((h,i) => i%6===0).map(h => h.lamp + " " + (h.med==null ? "-" : h.med.toFixed(3)))};
  site = {...site, access:"nacelle"}; state.hours = computeHours(state.results, state.times);

  setModelUsed("gfs_global", false);
  out.ohneGFS = hours().map(h => h.lamp + " " + (h.med==null ? "-" : h.med.toFixed(3)));
  setModelUsed("gfs_global", true);
  return out;
});

await browser.close();
if(RECORD_MISSING && added){ fs.writeFileSync(FIX, JSON.stringify(fixture)); console.log(`${added} neue Antworten zur Aufzeichnung hinzugefügt.`); }
server.close();

if(RECORD){
  fs.mkdirSync(path.dirname(FIX), {recursive: true});
  fs.writeFileSync(FIX, JSON.stringify(fixture));
  fs.writeFileSync(EXP, JSON.stringify(result, null, 1));
  console.log(`Aufgezeichnet: ${Object.keys(fixture.responses).length} Antworten, Referenz gespeichert.`);
  if(errors.length){ console.log("Fehler beim Aufzeichnen:\n  " + errors.join("\n  ")); process.exit(1); }
  process.exit(0);
}
if(OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
if(ACCEPT){
  if(errors.length || missing.length){ console.log("Nicht übernommen, es gibt Fehler: " + [...errors, ...missing].join(" | ")); process.exit(1); }
  fs.writeFileSync(EXP, JSON.stringify(result, null, 1));
  console.log(`Neue Referenz übernommen (${path.relative(ROOT, EXP)}). Änderungen vor dem Commit mit git diff prüfen.`);
  process.exit(0);
}

// Vergleich mit der Referenz
const expected = JSON.parse(fs.readFileSync(EXP, "utf8"));
const diffs = [];
// Die Prüfsumme hängt an den letzten Nachkommastellen und unterscheidet sich je nach Betriebssystem.
// Geprüft wird deshalb, ob sie korrekt aus den Berichtsdaten berechnet ist (wie in tools/pruefen.py).
const calc = crypto.createHash("sha256").update(JSON.stringify(result.export), "utf8").digest("hex");
if(calc !== result.bericht.pruefsumme) diffs.push(`bericht.pruefsumme: passt nicht zu den Berichtsdaten (${result.bericht.pruefsumme} / ${calc})`);
delete expected.bericht.pruefsumme; delete result.bericht.pruefsumme;
for(const r of [expected, result]){ r.bericht.text = r.bericht.text.replace(/[0-9a-f]{64}/g, "<pruefsumme>").replace(/Version \d{4}-\d{2}-\d{2}[a-z]*/g, "Version <v>"); if(r.export) delete r.export.version; }   // Version ändert sich bei jedem Update
// Zahlen dürfen in den letzten Stellen abweichen (Fließkomma unter Windows/Linux), Texte nicht
const sameNum = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
(function cmp(a, b, p){
  if(typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a===null) !== (b===null)) return diffs.push(`${p}: erwartet ${JSON.stringify(a)?.slice(0,120)}, erhalten ${JSON.stringify(b)?.slice(0,120)}`);
  if(a && typeof a === "object"){
    for(const k of new Set([...Object.keys(a), ...Object.keys(b)])) cmp(a[k], b[k], p ? `${p}.${k}` : k);
  } else if(typeof a === "number" ? !sameNum(a, b) : a !== b) diffs.push(`${p}: erwartet ${JSON.stringify(a)?.slice(0,160)}, erhalten ${JSON.stringify(b)?.slice(0,160)}`);
})(expected, result, "");

if(missing.length) errors.push(`${missing.length} Abfragen nicht in der Aufzeichnung, z. B. ${missing[0].slice(0,140)}`);
if(diffs.length || errors.length){
  console.log(`TEST FEHLGESCHLAGEN: ${diffs.length} Abweichung(en), ${errors.length} Fehler`);
  [...errors, ...diffs.slice(0, 40)].forEach(d => console.log("  " + d));
  // auf GitHub zusätzlich als Annotation, damit die Ursache ohne Anmeldung beim Lauf sichtbar ist
  if(process.env.GITHUB_ACTIONS) [...errors, ...diffs].slice(0, 10).forEach(d => console.log("::error title=Ablauftest::" + d.replace(/%/g, "%25").replace(/\s+/g, " ")));
  process.exit(1);
}
console.log("TEST OK: App verhält sich wie die Referenz, keine Fehler.");
