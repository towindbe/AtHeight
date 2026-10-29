/* Windbericht · Datenabruf: Wettermodelle, Szenarien, UV, amtliche Warnungen; load() */
"use strict";

/* ---------- Daten laden ---------- */
function apiUrl(m, format){
  const p = new URLSearchParams({latitude:site.lat, longitude:site.lon, hourly:VARS.join(","), models:m.id,
    wind_speed_unit:"ms", timezone:"auto", forecast_days:"3"});
  if(format) p.set("format", format);
  return "https://api.open-meteo.com/v1/forecast?" + p.toString();
}
/* Abruf mit Zeitlimit: hängt ein Dienst, bricht die Abfrage nach FETCH_TIMEOUT ab */
const FETCH_TIMEOUT = 20000;
function fetchT(url, ms = FETCH_TIMEOUT){
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  return fetch(url, {signal:c.signal}).finally(() => clearTimeout(t));
}
async function fetchModel(m){
  const r = await fetchModelOnce(m);
  // bei Verbindungs- oder Serverfehler bzw. Nutzungsgrenze einmal nach kurzer Pause wiederholen
  if(r.status==="error" && /Keine Verbindung|Zeitüberschreitung|HTTP (429|5\d\d)|too many/i.test(r.reason||"")){
    await new Promise(x => setTimeout(x, 1500));
    return fetchModelOnce(m);
  }
  return r;
}
async function fetchModelOnce(m){
  try{
    const r = await fetchT(apiUrl(m));
    const j = await r.json().catch(() => ({}));
    if(/no data is available for this location/i.test(j.reason||"")) return {m, status:"outside", reason:j.reason};
    if(!r.ok || j.error) return {m, status:"error", reason: j.reason || (r.status===429 ? "HTTP 429 Too Many Requests" : "HTTP "+r.status)};
    fixTimes(j.hourly, j.timezone, j.utc_offset_seconds||0);
    return {m, status:"ok", hourly:j.hourly, tz:j.timezone, off:j.utc_offset_seconds||0, elev:j.elevation, glat:j.latitude, glon:j.longitude};
  }catch(e){ return {m, status:"error", reason: e.name==="AbortError" ? "Zeitüberschreitung" : "Keine Verbindung"}; }
}

/* Zusätzliche Quellen neben den Wettermodellen. Fällt eine aus, läuft die App ohne sie weiter. */
let extras = {};
async function loadExtras(){
  const ex = {};
  try{
    const p = new URLSearchParams({latitude:site.lat, longitude:site.lon, hourly:"uv_index", timezone:"auto", forecast_days:"3"});
    const j = await (await fetchT("https://api.open-meteo.com/v1/forecast?"+p)).json();
    if(j.hourly){ fixTimes(j.hourly, j.timezone, j.utc_offset_seconds||0); ex.uv = new Map(j.hourly.time.map((t,i) => [t, j.hourly.uv_index[i]])); }
  }catch(e){}
  [ex.dwd, ex.geo, ex.ens] = await Promise.all([loadDwdWarnings(), loadGeoWarnings(), Promise.all(ENSEMBLES.map(loadEnsemble))]);
  return ex;
}
/* Ensemble: jeder Lauf wird wie ein eigenes Modell auf den Arbeitsbereich gerechnet.
   Ergebnis je Stunde: Anteil der Läufe mit Wind oder Böe über euren Grenzwerten. */
async function loadEnsemble(e){
  try{
    const q = new URLSearchParams({latitude:site.lat, longitude:site.lon, models:e.id, timezone:"auto", forecast_days:"3", wind_speed_unit:"ms",
      hourly:"wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_gusts_10m"});
    const j = await (await fetchT("https://ensemble-api.open-meteo.com/v1/ensemble?"+q)).json();
    if(j.error || !j.hourly) return {...e, ok:false, reason:j.reason||"keine Daten"};
    fixTimes(j.hourly, j.timezone, j.utc_offset_seconds||0);
    const h = j.hourly;
    const members = Object.keys(h).filter(k => k==="wind_speed_80m" || k.startsWith("wind_speed_80m_member")).map(k => k.slice("wind_speed_80m".length));
    const p = new Map();
    h.time.forEach((t, i) => {
      if(p.has(t)) return;
      let n = 0, over = 0;
      members.forEach(m => {
        const lv = [10,80,120].map(z => [z, h[`wind_speed_${z}m${m}`]?.[i]]).filter(([,v]) => v!=null && !isNaN(v));
        if(!lv.length) return;
        const v = zoneWind(lv).v; if(v==null) return;
        const g10 = h["wind_gusts_10m"+m]?.[i], v10 = h["wind_speed_10m"+m]?.[i];
        const g = g10==null || v10==null ? null : v * (1 + (clamp(g10/Math.max(v10,1), 1, 2.5) - 1)*0.6);
        n++; if(v > site.wind || (g!=null && g > site.gust)) over++;
      });
      if(n >= 5) p.set(t, {p:over/n, n});
    });
    return {...e, ok:true, members:members.length, p};
  }catch(err){ return {...e, ok:false, reason:"Keine Verbindung"}; }
}
/* Amtliche Warnungen. Ergebnis: {ok, list:[{src, lvl, title, text, relevant, start, end}]} oder {ok:false} */
const DWD_LVL = {Minor:1, Moderate:2, Severe:3, Extreme:4};
const DWD_RELEVANT = ["THUNDERSTORM","WIND","TORNADO","HAIL","GLAZE","SNOWDRIFT","SNOWFALL","RAIN"];
async function loadDwdWarnings(){
  try{
    const q = new URLSearchParams({service:"WFS", version:"2.0.0", request:"GetFeature", typeName:"dwd:Warnungen_Gemeinden", outputFormat:"application/json",
      propertyName:"EVENT,SEVERITY,EC_GROUP,ONSET,EXPIRES,HEADLINE", CQL_FILTER:`INTERSECTS(THE_GEOM,POINT(${site.lat} ${site.lon}))`});
    const area = new URLSearchParams({service:"WFS", version:"2.0.0", request:"GetFeature", typeName:"dwd:Warngebiete_Gemeinden", outputFormat:"application/json",
      propertyName:"NAME", count:"1", CQL_FILTER:`INTERSECTS(SHAPE,POINT(${site.lat} ${site.lon}))`});
    const [j, a] = await Promise.all([q, area].map(x => fetchT("https://maps.dwd.de/geoserver/dwd/ows?"+x).then(r => r.json())));
    if(!a.features?.length) return {ok:true, list:[], outside:true};   // Standort nicht in Deutschland
    const seen = new Set(), list = [];
    (j.features||[]).forEach(f => {
      const p = f.properties, key = p.HEADLINE+p.ONSET+p.EXPIRES;
      if(seen.has(key)) return; seen.add(key);
      list.push({src:"DWD", lvl:DWD_LVL[p.SEVERITY]||1, title:p.HEADLINE || p.EVENT, start:Date.parse(p.ONSET), end:p.EXPIRES ? Date.parse(p.EXPIRES) : Infinity,
        relevant:String(p.EC_GROUP||"").split(";").some(g => DWD_RELEVANT.includes(g.trim()))});
    });
    return {ok:true, list, area:a.features[0].properties.NAME};
  }catch(e){ return {ok:false, list:[]}; }
}
const GEO_TYPE = {1:"Sturm", 2:"Regen", 3:"Schnee", 4:"Glatteis", 5:"Gewitter", 6:"Hitze", 7:"Kälte"};
const GEO_LEVEL = {1:"gelb", 2:"orange", 3:"rot"};
async function loadGeoWarnings(){
  try{
    const r = await fetchT(`https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon=${site.lon}&lat=${site.lat}&lang=de`);
    if(r.status===404) return {ok:true, list:[], outside:true};   // Standort nicht in Österreich
    const j = await r.json();
    const list = (j.properties?.warnings||[]).map(w => {
      // Felder je nach Abfrage: rawinfo {wtype, wlevel, start, end} in Sekunden, sonst warntypid/warnstufeid
      const p = w.properties || w, raw = p.rawinfo || p;
      const t = +(raw.wtype ?? p.warntypid), l = +(raw.wlevel ?? p.warnstufeid);
      const time = v => /^\d+$/.test(String(v)) ? +v*1000 : NaN;
      const start = time(raw.start), end = time(raw.end);
      return {src:"GeoSphere", lvl:l, title:`${GEO_TYPE[t]||"Warnung"}, Warnstufe ${GEO_LEVEL[l]||l}`,
        start:isNaN(start) ? -Infinity : start, end:isNaN(end) ? Infinity : end, relevant:t>=1 && t<=5};
    });
    return {ok:true, list, area:j.properties?.location?.properties?.name};
  }catch(e){ return {ok:false, list:[]}; }
}
/* Zusammenfassung der Warnlage für den Tag: Liste, Entwarnung oder Hinweis auf Lücken */
function warnState(day){
  const d0 = localMs(day+"T00:00"), d1 = d0 + 864e5;
  const ws = allWarnings().filter(w => w.start < d1 && w.end > d0).sort((a,b) => b.lvl-a.lvl);
  const srcs = [["DWD", extras.dwd], ["GeoSphere Austria", extras.geo]];
  const failed = srcs.filter(([,x]) => x && !x.ok).map(([n]) => n);
  const covering = srcs.filter(([,x]) => x?.ok && !x.outside).map(([n,x]) => `${x.area || "Standort"} (${n})`);
  let kind, note;
  if(ws.length) kind = "list";
  else if(failed.length) { kind = "na"; note = `Amtliche Warnungen nicht abrufbar (${failed.join(", ")}). Bitte selbst prüfen.`; }
  else if(covering.length) { kind = "ok"; note = `Keine amtlichen Warnungen für ${covering.join(" und ")} am gewählten Tag.`; }
  else { kind = "na"; note = "Für diesen Standort sind keine amtlichen Warnungen eingebunden (nur DWD und GeoSphere Austria). Bitte beim zuständigen Wetterdienst selbst prüfen."; }
  if(ws.length && failed.length) note = `Nicht abrufbar: ${failed.join(", ")}.`;
  return {ws, kind, note};
}
const allWarnings = () => [...(extras.dwd?.list||[]), ...(extras.geo?.list||[])];
const fmtWhen = ms => !isFinite(ms) ? "offen" : new Date(ms).toLocaleString("de-DE", {timeZone:state.tz, weekday:"short", day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"});
async function load(){
  if(typeof afCheck==="function") afCheck();   // Ausfallprotokoll gilt nur für die Anlage, für die es berechnet wurde
  $("errorBox").hidden = true;
  $("headline").textContent = "Lade Wettermodelle…"; $("summary").textContent = ""; $("lamp").className="lamp"; $("lamp").textContent="…";
  $("reloadBtn").disabled = true;
  // Ladebalken: ein Schritt je Wettermodell plus Zusatzdaten (Szenarien, Warnungen, UV)
  const total = MODELS.length + 1; let done = 0;
  const tick = () => { done++; $("loadFill").style.width = Math.round(100*done/total) + "%";
    $("loadText").textContent = done <= MODELS.length ? `${Math.min(done, MODELS.length)} von ${MODELS.length} Modellen` : "Szenarien und Warnungen"; };
  $("loadFill").style.width = "0%"; $("loadText").textContent = `0 von ${MODELS.length} Modellen`; $("loadBar").hidden = false;
  let [raw, ex] = await Promise.all([Promise.all(MODELS.map(m => fetchModel(m).then(r => (tick(), r)))), loadExtras().then(r => (tick(), r))]);
  $("loadBar").hidden = true;
  $("reloadBtn").disabled = false;
  let okAny = raw.find(r => r.status==="ok"), offlineAt = null;
  if(okAny){ if(raw.filter(r => r.status==="ok").length >= MODELS.length/2) cacheSave(raw, ex); }
  else{
    // keine Verbindung: zuletzt gespeicherten Stand dieses Standorts verwenden, deutlich als alt gekennzeichnet
    const old = await cacheLoad();
    if(old){ raw = old.raw; ex = old.ex; offlineAt = old.at; okAny = raw.find(r => r.status==="ok"); }
  }
  extras = ex;
  if(!okAny){
    // Grund benennen: Limit bei Open-Meteo, keine Verbindung oder sonstiger Fehler
    const reasons = raw.map(r => r.reason || "");
    const msg = reasons.some(x => /429|too many|limit/i.test(x))
      ? "Open-Meteo meldet zu viele Anfragen (Nutzungsgrenze). Bitte in ein paar Minuten erneut versuchen."
      : reasons.every(x => x==="Zeitüberschreitung" || x==="Keine Verbindung") && reasons.includes("Zeitüberschreitung")
        ? "Die Wetterdienste antworten nicht (Zeitüberschreitung). Bitte in einem Moment erneut versuchen."
      : reasons.every(x => x==="Keine Verbindung")
        ? "Keine Verbindung zu Open-Meteo. Bitte Internetverbindung prüfen."
        : `Wetterdaten konnten nicht geladen werden (${reasons.find(Boolean) || "unbekannter Fehler"}).`;
    $("errorBox").hidden = false;
    $("errorBox").innerHTML = `${esc(msg)} <button class="link" id="retryBtn" type="button">Erneut versuchen</button>`;
    $("retryBtn").onclick = load;
    $("headline").textContent = "Keine Daten"; return;
  }
  const times = [...new Set(okAny.hourly.time)];
  const results = raw.map(r => {
    if(r.status!=="ok") return r;
    const h = r.hourly, idx = new Map();
    h.time.forEach((t,i) => { if(!idx.has(t)) idx.set(t,i); });
    const series = times.map(t => {
      const i = idx.get(t); if(i==null) return null;
      const lv = levelsAt(h, i);
      const hw = zoneWind(lv);
      if(hw.v==null) return null;
      const vR = rigWind(lv);
      return {v:hw.v, ext:hw.ext, g:gustAt(h,i,hw.v), vR, gR:gustAt(h,i,vR), dir:dirAt(lv, workH()), lv,
        rain:h.precipitation?.[i], cape:h.cape?.[i], wc:h.weather_code?.[i], t2:h.temperature_2m?.[i],
        tW:tempAt(h, i, workH()), app:h.apparent_temperature?.[i], rh:h.relative_humidity_2m?.[i], cc:h.cloud_cover?.[i]};
    });
    const n = series.filter(Boolean).length;
    if(n===0) return {...r, status:"outside", series};
    return {...r, status: series.some(s => s && s.ext) ? "extrap" : "ok", series, n};
  });
  state.off = okAny.off; state.tz = okAny.tz; state.elev = okAny.elev;
  const hours = computeHours(results, times);
  const nk = nowKey(), today = nk.slice(0,10);
  const startDay = new Date().getHours() > site.to ? times.find(t => t.slice(0,10) > today)?.slice(0,10) : today;
  const keepDay = state.day && times.some(t=>t.startsWith(state.day)) ? state.day : (startDay && times.some(t=>t.startsWith(startDay)) ? startDay : times[0].slice(0,10));
  state = {...state, results, times, hours, fetchedAt:offlineAt || new Date(), offlineAt, day:keepDay, tz:okAny.tz};
  state.sel = defaultSel(state.day);
  if(!offlineAt) snapUpdate();
  render();
  outlookPromise = loadOutlook().finally(() => { outlookPromise = null; autoRank(); });   // Ausblick, danach Modellvergleich im Hintergrund
}
