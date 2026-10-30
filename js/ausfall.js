/* JobsiteWX · Wetter-Ausfallprotokoll: an welchen Tagen und Stunden lag der Wind über euren Grenzwerten?
   Grundlage sind gemessene Werte der nächsten Station (DWD / GeoSphere, 10 m), hochgerechnet auf den Arbeitsbereich mit dem
   Höhenverhältnis der archivierten Modellrechnung (Open-Meteo Historical Forecast). Fehlt ein Messwert, steht an dieser Stelle der Modellwert. */
"use strict";

const AF_MAX_DAYS = 92, AF_CHUNK = 31;
const addDays = (d, n) => isoDay(Date.parse(d+"T12:00:00Z") + n*864e5);
const AF_TXT = {moeglich:"MÖGLICH", eingeschraenkt:"BEGRENZT", ausfall:"AUSFALL"}, AF_CLS = {moeglich:"go", eingeschraenkt:"warn", ausfall:"stop"};
let afData = null;
/* Das Protokoll gilt nur für Standort, Arbeitsbereich, Arbeitszeit und Grenzwerte, mit denen es berechnet wurde */
const afKey = () => JSON.stringify([site.lat, site.lon, site.work || site.hub, site.hub, accessMode(), site.wind, site.gust, site.from, site.to]);
function afCheck(){
  if(!afData || afData.key === afKey()) return;
  afData = null; $("afOut").innerHTML = ""; $("afPrint").hidden = $("afJson").hidden = true; $("af_project").value = "";
}

/* Station über den ganzen Zeitraum: in Blöcken abrufen und zusammenführen; verwendet wird die nächste Station des ersten Blocks */
async function afStation(start, end){
  const chunks = [];
  for(let s = start; s <= end; s = addDays(s, AF_CHUNK)){ const e = addDays(s, AF_CHUNK-1); chunks.push([s, e > end ? end : e]); }
  const parts = await pool(chunks, 2, async ([a, b]) => (await Promise.all([stationDwd(a, b), stationGeo(a, b)])).filter(Boolean).sort((x, y) => x.dist-y.dist)[0] || null);
  const ref = parts.find(Boolean); if(!ref) return null;
  const obs = new Map(); parts.forEach(p => { if(p && p.name===ref.name) p.obs.forEach((v, k) => obs.set(k, v)); });
  return {...ref, obs};
}
async function afModel(start, end){
  const today = isoDay(Date.now());
  const q = new URLSearchParams({latitude:site.lat, longitude:site.lon, start_date:start, end_date:end > today ? today : end, wind_speed_unit:"ms", timezone:"GMT",
    hourly:"wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_gusts_10m"});
  try{ const j = await (await fetchT("https://historical-forecast-api.open-meteo.com/v1/forecast?"+q, 45000)).json(); return j.hourly || null; }
  catch(e){ return null; }
}

async function afRechnen(von, bis){
  const start = addDays(von, -1);   // Puffer für den Zeitzonenversatz
  const [st, mh] = await Promise.all([afStation(start, bis), afModel(start, bis)]);
  if(!mh) throw new Error("Die archivierten Modelldaten konnten nicht geladen werden.");
  const byDay = new Map();
  mh.time.forEach((t, i) => {
    const loc = toLocalStr(Date.parse(t+":00Z"), state.tz); if(!loc) return;
    const day = loc.slice(0,10); if(day < von || day > bis || !isWork(loc)) return;
    const lv = levelsAt(mh, i), zm = zoneWind(lv).v; if(zm==null) return;
    const m10 = mh.wind_speed_10m?.[i], gm = gustAt(mh, i, zm), o = st?.obs.get(t.slice(0,13));
    let v = zm, g = gm, src = "modell";
    if(o && m10!=null){
      // gemessener 10-m-Wind mal Höhenverhältnis der Modellrechnung; Böe mit demselben Faktor wie im Tagesbericht (60 % des 10-m-Böenfaktors)
      v = o.v * clamp(zm / Math.max(m10, 1), 0.5, 4);
      g = o.g!=null ? v * (1 + (clamp(o.g / Math.max(o.v, 1), 1, 2.5) - 1)*0.6) : gustAt(mh, i, v);
      src = "station";
    }
    if(!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({h:+loc.slice(11,13), v, g, vm:zm, src, over: v > site.wind || (g!=null && g > site.gust)});
  });
  const tage = [];
  for(let d = von; d <= bis; d = addDays(d, 1)){
    const hs = (byDay.get(d) || []).sort((a, b) => a.h-b.h), n = hs.length;
    if(!n){ tage.push({tag:d, n:0}); continue; }
    const over = hs.filter(h => h.over).length;
    let run = 0, best = 0; hs.forEach(h => { run = h.over ? 0 : run+1; best = Math.max(best, run); });
    const mx = k => hs.reduce((a, h) => h[k]!=null && (a==null || h[k] > a) ? h[k] : a, null);
    tage.push({tag:d, n, ueber:over, fenster:best, windMax:mx("v"), boeMax:mx("g"), modellWindMax:mx("vm"), luecken:hs.filter(h => h.src==="modell").length,
      status: over > n/2 ? "ausfall" : over > 0 ? "eingeschraenkt" : "moeglich"});
  }
  const ok = tage.filter(t => t.n);
  const summen = {tage:tage.length, mitDaten:ok.length, ausfalltage:ok.filter(t => t.status==="ausfall").length, begrenzt:ok.filter(t => t.status==="eingeschraenkt").length,
    moeglich:ok.filter(t => t.status==="moeglich").length, arbeitsstunden:ok.reduce((s, t) => s+t.n, 0), ausfallstunden:ok.reduce((s, t) => s+t.ueber, 0), luecken:ok.reduce((s, t) => s+t.luecken, 0)};
  return {erstellt:new Date().toISOString(), version:ownVersion() || "unbekannt", zeitraum:{von, bis}, standort:{name:site.name, lat:site.lat, lon:site.lon}, arbeitszeit:{von:site.from, bis:site.to}, bereich:zoneTxt(),
    grenzwerte:{wind:site.wind, boe:site.gust, einheit:"m/s"}, station:st ? {name:st.name, quelle:st.src, entfernungKm:+st.dist.toFixed(1), hoehe:st.alt ?? null} : null,
    modell:"Open-Meteo Historical Forecast (best match), 10-m-Wind der Station auf den Arbeitsbereich hochgerechnet", projekt:$("af_project").value, tage, summen};
}

const afDay = d => new Date(d+"T12:00:00").toLocaleDateString("de-DE", {weekday:"short", day:"2-digit", month:"2-digit", year:"2-digit"});
function afRows(data){
  return data.tage.map(t => t.n ? `<tr><td class="l">${esc(afDay(t.tag))}</td><td class="l"><span class="rp-pill ${AF_CLS[t.status]}">${AF_TXT[t.status]}</span></td>
    <td class="${t.windMax > data.grenzwerte.wind ? "over" : ""}">${fw(t.windMax)}</td><td class="${t.boeMax!=null && t.boeMax > data.grenzwerte.boe ? "over" : ""}">${t.boeMax==null ? "–" : fw(t.boeMax)}</td>
    <td>${t.ueber} / ${t.n}</td><td>${t.fenster} h</td><td>${fw(t.modellWindMax)}</td><td>${t.luecken || "–"}</td></tr>`
    : `<tr><td class="l">${esc(afDay(t.tag))}</td><td class="l" colspan="7">keine Daten</td></tr>`).join("");
}
const afHead = () => `<thead><tr><th class="l">Tag</th><th class="l">Einstufung</th><th>Wind max (${WU()})</th><th>Böe max (${WU()})</th><th title="Arbeitsstunden mit Wind oder Böe über dem Grenzwert">Std. über Grenze</th>
  <th title="Längste Folge von Stunden unter beiden Grenzwerten">Längstes Fenster</th><th title="Höchster Windwert der Modellrechnung als Gegenprobe">Modell Wind max</th><th title="Stunden ohne Messwert, dort gilt der Modellwert">Std. ohne Messwert</th></tr></thead>`;
function afSummary(d){
  const s = d.summen, st = d.station;
  return `<b>${s.ausfalltage} von ${s.mitDaten} Tagen ohne Arbeitsmöglichkeit</b> (mehr als die Hälfte der Arbeitszeit über Grenzwert), ${s.begrenzt} Tage mit Einschränkung, ${s.moeglich} Tage ohne Überschreitung.
    Insgesamt ${s.ausfallstunden} von ${s.arbeitsstunden} Arbeitsstunden über dem Grenzwert (${s.arbeitsstunden ? Math.round(100*s.ausfallstunden/s.arbeitsstunden) : 0} %).`;
}
const afMethod = d => `${d.station ? `Messstation ${esc(d.station.name)} (${esc(d.station.quelle)}), ${fmt(d.station.entfernungKm,1)} km entfernt${d.station.hoehe!=null ? `, ${Math.round(d.station.hoehe)} m ü. NN` : ""}.` : "Keine Messstation im Umkreis gefunden, es gelten die Werte der Modellrechnung."}
  Die Station misst in 10 m Höhe. Ihr Wind ist mit dem Höhenverhältnis der archivierten Modellrechnung auf den Arbeitsbereich ${esc(d.bereich)} hochgerechnet (stärkster Wind im Bereich; Böe aus dem gemessenen Böenfaktor geschätzt).
  Eine Messstation in einiger Entfernung bildet die Lage an der Anlage nur angenähert ab. Stunden ohne Messwert sind mit dem Modellwert gefüllt und in der letzten Spalte ausgewiesen.
  Gewertet werden nur Arbeitsstunden (${d.arbeitszeit.von}–${d.arbeitszeit.bis} Uhr) und nur Wind und Böe; Gewitter, Regen, Frost und amtliche Warnungen sind nicht enthalten.`;

async function afShow(){
  const out = $("afOut"), von = $("af_von").value, bis = $("af_bis").value, yesterday = addDays(isoDay(Date.now()), -1);
  const err = m => { out.innerHTML = `<p class="note err">${esc(m)}</p>`; $("afPrint").hidden = $("afJson").hidden = true; };
  if(!state.fetchedAt) return err("Bitte zuerst die Wetterdaten laden.");
  if(!site.checked) return err("Bitte zuerst unter Einstellungen die Höhen und Grenzwerte dieser Anlage prüfen und „Übernehmen“ antippen.");
  if(!von || !bis || von > bis) return err("Bitte einen gültigen Zeitraum wählen (von ≤ bis).");
  if(bis > yesterday) return err("Der Zeitraum darf höchstens bis gestern reichen, für heute liegen noch keine vollständigen Messwerte vor.");
  if((Date.parse(bis) - Date.parse(von))/864e5 + 1 > AF_MAX_DAYS) return err(`Der Zeitraum darf höchstens ${AF_MAX_DAYS} Tage umfassen.`);
  $("afBtn").disabled = true; out.innerHTML = `<p class="note">Lade Messwerte und Modelldaten für ${esc(afDay(von))} bis ${esc(afDay(bis))} …</p>`;
  try{
    const key = afKey(), data = await afRechnen(von, bis);
    afData = {data, hash: await sha256(JSON.stringify(data)), key};
    out.innerHTML = `<p class="af-sum">${afSummary(data)}</p><div class="af-scroll"><table class="af-t">${afHead()}<tbody>${afRows(data)}</tbody></table></div>
      <p class="note">${afMethod(data)}</p><p class="note mono">Prüfsumme (SHA-256): ${afData.hash}</p>`;
    $("afPrint").hidden = $("afJson").hidden = false;
  }catch(e){ err(e.message || "Berechnung nicht möglich."); }
  finally{ $("afBtn").disabled = false; }
}
function afPrint(){
  if(!afData) return;
  const {data, hash} = afData, r = $("report");
  r.innerHTML = `<div class="rp-head"><div><div class="eyebrow">Wetter-Ausfallprotokoll</div><h1>${esc(data.standort.name)}</h1>
      <div class="sub">${esc(afDay(data.zeitraum.von))} bis ${esc(afDay(data.zeitraum.bis))}${data.projekt ? ` · ${esc(data.projekt)}` : ""} · Arbeitszeit ${data.arbeitszeit.von}–${data.arbeitszeit.bis} Uhr</div></div></div>
    <div class="rp-sec rp-box"><div class="rp-big">${afSummary(data)}</div></div>
    <div class="rp-sec rp-box"><h3>Grenzwerte</h3>Arbeitsbereich ${esc(data.bereich)} · max. Windstärke ${fwu(data.grenzwerte.wind)} · max. Böe ${fwu(data.grenzwerte.boe)}</div>
    <div class="rp-sec"><h3>Tage im Zeitraum</h3><table class="rp-t af-rp">${afHead()}<tbody>${afRows(data)}</tbody></table>
      <div class="rp-small" style="margin-top:3px">Rot: über Grenzwert · Einstufung AUSFALL: mehr als die Hälfte der Arbeitsstunden über Grenzwert · BEGRENZT: mindestens eine Stunde darüber</div></div>
    <div class="rp-sec rp-small"><b>Grundlagen.</b> ${afMethod(data)} Erstellt ${new Date(data.erstellt).toLocaleString("de-DE")} mit JobsiteWX-Version ${esc(data.version)}. Datenquellen: ${data.station ? esc(data.station.quelle) + ", " : ""}Open-Meteo.com (CC BY 4.0). Der Bericht ist eine Auswertung von Wetterdaten und ersetzt keine Messung an der Anlage.</div>
    <div class="sig"><div>Datum, Unterschrift Aufsichtführender</div><div>Datum, Unterschrift Auftraggeber (optional)</div></div>
    <div class="rp-small" style="margin-top:8px">Prüfsumme (SHA-256) der Auswertungsdaten: <span class="mono">${hash}</span> · dieselbe Zahl steht in der zugehörigen JSON-Datei.</div>`;
  r.style.zoom = "";
  const t = document.title; document.title = `Ausfallprotokoll ${site.name} ${data.zeitraum.von} bis ${data.zeitraum.bis}`;
  window.print(); setTimeout(() => { document.title = t; }, 500);
}
function afJson(){
  if(!afData) return;
  const blob = new Blob([JSON.stringify({...afData.data, pruefsumme:afData.hash}, null, 2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `ausfallprotokoll_${site.name.replace(/\W+/g,"_")}_${afData.data.zeitraum.von}_${afData.data.zeitraum.bis}.json`; document.body.appendChild(a); a.click(); a.remove();
}
/* Standardzeitraum: seit Monatsbeginn bis gestern (am Monatsersten der Vormonat) */
(function afInit(){
  const y = addDays(isoDay(Date.now()), -1), first = y.slice(0,8) + "01";
  $("af_von").value = first; $("af_bis").value = y; $("af_bis").max = y; $("af_von").max = y;
  $("afBtn").onclick = afShow; $("afPrint").onclick = afPrint; $("afJson").onclick = afJson;
})();
