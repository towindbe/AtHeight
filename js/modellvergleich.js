/* Windbericht · Modellvergleich: Vortagesprognose gegen Messstationen */
"use strict";

/* ---------- Modell-Rangliste: Vortagesprognose gegen Messwerte der nächsten Station ----------
   Vergleicht für die letzten 14 Tage, was jedes Modell am Vortag für 10 m vorhergesagt hat,
   mit Wind und Spitzenböe der nächsten Station (DWD über Bright Sky, GeoSphere Austria). Nur Arbeitsstunden. */
const RANK_DAYS = 30, RANK_MAX_KM = 60, RANK_NARROW = 0.3;   // Tage, km; Spanne unter 30 % = Modelle liegen eng beieinander
const rankKey = () => `wb_rank_${site.lat.toFixed(3)}_${site.lon.toFixed(3)}`;
function distKm(a, b, c, d){
  const x = (c-a)*RAD, y = (d-b)*RAD, h = Math.sin(x/2)**2 + Math.cos(a*RAD)*Math.cos(c*RAD)*Math.sin(y/2)**2;
  return 2*6371*Math.asin(Math.sqrt(h));
}
const isoDay = ms => new Date(ms).toISOString().slice(0,10);
async function stationDwd(start, end){
  try{
    const q = new URLSearchParams({lat:site.lat, lon:site.lon, date:start, last_date:isoDay(Date.parse(end)+864e5), units:"si", tz:"Etc/UTC", max_dist:String(RANK_MAX_KM*1000)});
    const r = await fetch("https://api.brightsky.dev/weather?"+q); if(!r.ok) return null;
    const j = await r.json();
    // Bright Sky füllt Lücken mit weiter entfernten Stationen auf; verwendet wird nur die nächste Station
    const src = (j.sources||[]).filter(x => x.observation_type==="historical").sort((a,b) => a.distance-b.distance)[0];
    if(!src) return null;
    const obs = new Map();
    (j.weather||[]).forEach(w => { if(w.source_id===src.id && w.wind_speed!=null) obs.set(w.timestamp.slice(0,13), {v:w.wind_speed, g:w.wind_gust_speed}); });
    return obs.size ? {name:src.station_name, src:"DWD", lat:src.lat, lon:src.lon, alt:src.height, dist:src.distance/1000, obs} : null;
  }catch(e){ return null; }
}
let geoMeta = null;
async function stationGeo(start, end){
  try{
    const base = "https://dataset.api.hub.geosphere.at/v1/station/historical/klima-v2-1h";
    geoMeta = geoMeta || await (await fetch(base+"/metadata")).json();
    const cand = (geoMeta.stations||[]).filter(x => x.is_active).map(x => ({...x, d:distKm(site.lat, site.lon, x.lat, x.lon)}))
      .filter(x => x.d <= RANK_MAX_KM).sort((a,b) => a.d-b.d).slice(0,3);
    for(const st of cand){
      const q = new URLSearchParams({parameters:"ff,ffx", station_ids:String(st.id), start:start+"T00:00", end:end+"T23:00", output_format:"geojson"});
      const j = await (await fetch(base+"?"+q)).json();
      const pr = j.features?.[0]?.properties?.parameters; if(!pr) continue;
      const obs = new Map();
      (j.timestamps||[]).forEach((t,i) => { const v = pr.ff?.data[i]; if(v!=null) obs.set(t.slice(0,13), {v, g:pr.ffx?.data[i] ?? null}); });
      if(obs.size > 24) return {name:st.name, src:"GeoSphere", lat:st.lat, lon:st.lon, alt:st.altitude, dist:st.d, obs};
    }
  }catch(e){}
  return null;
}
async function prevRun(m, st, start, end){
  const q = new URLSearchParams({latitude:st.lat, longitude:st.lon, models:m.id, wind_speed_unit:"ms", timezone:"GMT", start_date:start, end_date:end,
    hourly:"wind_speed_10m_previous_day1,wind_gusts_10m_previous_day1"});
  for(let attempt = 0; attempt < 2; attempt++){       // Archiv antwortet nicht immer sofort: ein zweiter Versuch
    try{
      const j = await (await fetch("https://previous-runs-api.open-meteo.com/v1/forecast?"+q)).json();
      if(j.hourly) return j.hourly;
      if(j.error && /no data/i.test(j.reason||"")) return null;   // gibt es für dieses Modell nicht
    }catch(e){}
    await new Promise(r => setTimeout(r, 800));
  }
  return null;
}
// höchstens n Abfragen gleichzeitig
async function pool(items, n, fn){
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({length:Math.min(n, items.length)}, async () => { while(k < items.length){ const i = k++; out[i] = await fn(items[i]); } }));
  return out;
}
const quantile = (a, q) => { const s = [...a].sort((x,y) => x-y); return s.length ? s[Math.min(s.length-1, Math.floor(q*s.length))] : null; };
/* Kennzahlen je Modell:
   mae   mittlerer Fehler; bias Grundtendenz (+ zu viel, − zu wenig)
   cen   Fehler im Verlauf = mittlerer Fehler nach Abzug der eigenen Grundtendenz (bevorzugt keine glatten Modelle)
   csi   Trefferquote windige Stunden: windigste 25 % laut Station gegen windigste 25 % laut Modell
         (je Seite eigene Schwelle, ein Versatz stört also nicht); Treffer / (Treffer + verpasst + Fehlalarm) */
function rankModel(pairs){
  const n = pairs.length; if(n < 24) return null;
  const e = pairs.map(x => x.f - x.o), bias = e.reduce((s,v) => s+v, 0)/n;
  const mae = e.reduce((s,v) => s+Math.abs(v), 0)/n, cen = e.reduce((s,v) => s+Math.abs(v-bias), 0)/n;
  const to = quantile(pairs.map(x => x.o), 0.75), tf = quantile(pairs.map(x => x.f), 0.75);
  let hit=0, miss=0, fa=0; pairs.forEach(x => { const O = x.o >= to, F = x.f >= tf; if(O&&F) hit++; else if(O) miss++; else if(F) fa++; });
  const g = pairs.filter(x => x.fg!=null && x.og!=null), gmae = g.length >= 24 ? g.reduce((s,x) => s+Math.abs(x.fg-x.og), 0)/g.length : null;
  return {n, mae, bias, cen, csi: hit+miss+fa ? hit/(hit+miss+fa) : null, gmae};
}
async function computeRanking(){
  const btn = $("rankBtn"); btn.disabled = true; $("rankOut").innerHTML = `<p class="note">${T(`Suche Station und lade Vortagesprognosen der letzten ${RANK_DAYS} Tage…`, `Searching for a station and loading previous-day forecasts of the last ${RANK_DAYS} days…`)}</p>`;
  try{
    const end = isoDay(Date.now() - 864e5), start = isoDay(Date.now() - RANK_DAYS*864e5);
    const sts = (await Promise.all([stationDwd(start, end), stationGeo(start, end)])).filter(Boolean).sort((a,b) => a.dist-b.dist);
    const st = sts[0];
    if(!st){ $("rankOut").innerHTML = `<p class="note">${T(`Keine Messstation von DWD oder GeoSphere im Umkreis von ${RANK_MAX_KM} km gefunden.`, `No DWD or GeoSphere station found within ${RANK_MAX_KM} km.`)}</p>`; return; }
    const models = state.results.filter(r => r.status==="ok" || r.status==="extrap").map(r => r.m);
    const runs = await pool(models, 4, m => prevRun(m, st, start, end));
    const rows = models.map((m, k) => {
      const h = runs[k]; if(!h) return null;
      const pairs = [];
      h.time.forEach((t, i) => {
        const o = st.obs.get(t.slice(0,13)), f = h.wind_speed_10m_previous_day1?.[i]; if(!o || f==null) return;
        const loc = toLocalStr(Date.parse(t+":00Z"), state.tz); if(!loc || !isWork(loc)) return;
        pairs.push({o:o.v, f, og:o.g, fg:h.wind_gusts_10m_previous_day1?.[i] ?? null});
      });
      const r = rankModel(pairs); return r && {id:m.id, ...r};
    }).filter(Boolean);
    // Rangfolge: Fehler im Verlauf und Treffer windig zählen gleich (Summe der beiden Plätze)
    const place = (arr, key, asc) => { const s = [...arr].sort((a,b) => asc ? a[key]-b[key] : (b[key]??-1)-(a[key]??-1)); arr.forEach(r => r["p_"+key] = s.indexOf(r)+1); };
    place(rows, "cen", true); place(rows, "csi", false);
    rows.sort((a,b) => (a.p_cen + a.p_csi) - (b.p_cen + b.p_csi) || a.cen - b.cen);
    const res = {v:2, date:new Date().toISOString(), start, end, models:models.map(m => m.id), station:{name:st.name, src:st.src, dist:st.dist, alt:st.alt}, elev:state.elev ?? null, rows};
    try{ localStorage.setItem(rankKey(), JSON.stringify(res)); }catch(e){}
    renderRanking();
    if(wantBest){ wantBest = false; showQuick("best"); }
  } finally { btn.disabled = false; if(wantBest){ wantBest = false; renderChips(T("Modellvergleich nicht möglich, Details unten bei „Welche Modelle treffen hier?“.", "Model comparison not possible, details below under “Which models are accurate here?”.")); } }
}
/* Modellvergleich automatisch im Hintergrund, wenn für die Anlage keiner vorliegt oder er älter als 7 Tage ist */
const RANK_MAX_AGE = 7*864e5;
function autoRank(){
  if(navigator.webdriver) return;   // im automatischen Test keine zusätzlichen Abrufe
  let res = null; try{ res = JSON.parse(localStorage.getItem(rankKey())||"null"); }catch(e){}
  if(res && res.v===2 && Date.now() - Date.parse(res.date) < RANK_MAX_AGE) return;
  if(!$("rankBtn").disabled) computeRanking();
}
/* Gruppen aus dem gespeicherten Modellvergleich (null, wenn noch keiner vorliegt) */
function rankGroups(){
  let res = null; try{ res = JSON.parse(localStorage.getItem(rankKey())||"null"); }catch(e){}
  if(!res || res.v !== 2 || !res.rows?.length) return null;
  const cens = res.rows.map(r => r.cen), best = Math.min(...cens), worst = Math.max(...cens), bestCsi = Math.max(...res.rows.map(r => r.csi ?? 0));
  const isPoor = r => (r.cen > best*1.4 && r.cen > best+0.5) || (r.csi!=null && r.csi <= bestCsi*0.6);
  const isGood = r => r.cen <= best*1.15 && (r.csi==null || r.csi >= bestCsi*0.85);
  const narrow = (worst - best)/best < RANK_NARROW && !res.rows.some(isPoor);
  return {narrow, good:res.rows.filter(r => !narrow && !isPoor(r) && isGood(r)).map(r => r.id)};
}
function renderRanking(){
  if(!$("rankOut")) return;
  let res = null; try{ res = JSON.parse(localStorage.getItem(rankKey())||"null"); }catch(e){}
  if(res && res.v !== 2) res = null;   // ältere Berechnung ohne neue Kennzahlen
  $("rankBtn").textContent = res ? T("Vergleich neu berechnen", "Recalculate comparison") : T("Modelle vergleichen", "Compare models");
  if(!res){ $("rankOut").innerHTML = ""; return; }
  if(!res.rows.length){ $("rankOut").innerHTML = `<p class="note">${T(`Für ${esc(res.station.name)} lagen zu wenige vergleichbare Stunden vor.`, `Too few comparable hours for ${esc(res.station.name)}.`)}</p>`; return; }
  const byId = id => MODELS.find(m => m.id===id), name = id => { const m = byId(id); return m ? `${m.name} (${m.org})` : id; };
  const cens = res.rows.map(r => r.cen), best = Math.min(...cens), worst = Math.max(...cens), bestCsi = Math.max(...res.rows.map(r => r.csi ?? 0));
  // Gruppen statt Rangfolge: kleine Unterschiede sollen keine Reihenfolge vortäuschen
  const isPoor = r => (r.cen > best*1.4 && r.cen > best+0.5) || (r.csi!=null && r.csi <= bestCsi*0.6);
  const isGood = r => r.cen <= best*1.15 && (r.csi==null || r.csi >= bestCsi*0.85);
  const poor = res.rows.filter(isPoor), narrow = (worst - best)/best < RANK_NARROW && !poor.length;
  const group = r => narrow ? "same" : isPoor(r) ? "poor" : isGood(r) ? "good" : "mid";
  const GROUP = {good:[T("gut","good"),"g-good"], mid:[T("Mittelfeld","midfield"),"g-mid"], poor:[T("deutlich schlechter","clearly worse"),"g-poor"], same:[T("gleichwertig","equivalent"),"g-mid"]};
  const order = {good:0, mid:1, poor:2, same:0};
  const good = res.rows.filter(r => group(r)==="good");
  const rows = [...res.rows].sort((a,b) => order[group(a)]-order[group(b)] || name(a.id).localeCompare(name(b.id), "de"));
  const biases = res.rows.map(r => r.bias), medBias = median(biases);
  const sameSign = biases.every(b => b < 0) || biases.every(b => b > 0);
  const st = res.station, dAlt = res.elev!=null && st.alt!=null ? Math.round(res.elev - st.alt) : null;
  const pct = v => v==null ? "–" : Math.round(v*100)+" %";
  $("rankOut").innerHTML = `
    <p class="rank-sum">${narrow
      ? T(`<b>Alle Modelle treffen hier etwa gleich gut</b> (Fehler im Verlauf ${fw(best,U().d+1)}–${fwu(worst,U().d+1)}). Für oder gegen einzelne Modelle lässt sich daraus keine Empfehlung ableiten.`, `<b>All models are about equally accurate here</b> (pattern error ${fw(best,U().d+1)}–${fwu(worst,U().d+1)}). No recommendation for or against single models can be derived.`)
      : `<b>${T("Gut", "Good")}:</b> ${good.map(r => esc(name(r.id))).join(", ")}.
         ${poor.length ? `<br><b>${T("Deutlich schlechter", "Clearly worse")}:</b> ${poor.map(r => esc(name(r.id))).join(", ")}. ${T("Ausschließen kannst du sie oben per Häkchen.", "You can exclude them above with the tick box.")}` : ""}
         <br><span class="muted">${T("Die übrigen liegen im Mittelfeld. Innerhalb einer Gruppe sind die Unterschiede gering, deshalb alphabetisch sortiert.", "The rest are midfield. Differences within a group are small, so they are sorted alphabetically.")}</span>`}
      ${sameSign && Math.abs(medBias) >= 0.5 ? `<br><span class="muted">${T("Alle Modelle liegen hier in dieselbe Richtung daneben", "All models are off in the same direction here")} (${T("im Mittel", "on average")} ${medBias>0 ? "+" : "−"}${fwu(Math.abs(medBias))}, ${medBias>0 ? T("Station misst weniger", "station measures less") : T("Station misst mehr", "station measures more")} ${T("als die Modelle", "than the models")}). ${T("Das liegt eher an der Lage der Station als an den Modellen und zählt deshalb nicht für die Einstufung.", "This is more likely due to the station location than the models, so it does not count for the rating.")}</span>` : ""}</p>
    <div class="scroll"><table class="t rank-t"><thead><tr><th>${T("Einstufung", "Rating")}</th><th>${T("Modell", "Model")}</th><th title="${T("Mittlerer Fehler nach Abzug der Grundtendenz", "Mean error after removing the bias")}">${T("Fehler Verlauf", "Pattern error")}</th><th title="${T("Windigste 25 % der Stunden richtig erkannt", "Windiest 25 % of hours correctly detected")}">${T("Treffer windig", "Windy hits")}</th><th>${T("Fehler gesamt", "Total error")}</th><th>${T("Tendenz", "Bias")}</th><th>${T("Fehler Böe", "Gust error")}</th><th>${T("Stunden", "Hours")}</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${group(r)==="poor" ? "poor" : group(r)==="good" ? "top" : ""}"><td><span class="gpill ${GROUP[group(r)][1]}">${GROUP[group(r)][0]}</span></td><td>${esc(name(r.id))}${(site.excluded||[]).includes(r.id) ? ` <span class="muted">(${T("ausgeschlossen", "excluded")})</span>` : ""}</td>
      <td class="num">${fwu(r.cen,U().d+1)}</td><td class="num">${pct(r.csi)}</td><td class="num">${fwu(r.mae,U().d+1)}</td>
      <td class="num">${r.bias>=0 ? "+" : "−"}${fw(Math.abs(r.bias))} ${Math.abs(r.bias)<0.3 ? "" : r.bias>0 ? T("zu viel", "too high") : T("zu wenig", "too low")}</td>
      <td class="num">${r.gmae==null ? "–" : fwu(r.gmae)}</td><td class="num">${r.n}</td></tr>`).join("")}
    </tbody></table></div>
    ${(() => { const miss = (res.models||[]).filter(id => !res.rows.some(r => r.id===id)); return miss.length ? `<p class="note">${T("Ohne Vergleichsdaten (keine archivierten Vortagesprognosen)", "No comparison data (no archived previous-day forecasts)")}: ${miss.map(id => esc(name(id))).join(", ")}.</p>` : ""; })()}
    <p class="note">${T(`<b>So wird gerechnet:</b> für die letzten ${RANK_DAYS} Tage (${esc(new Date(res.start).toLocaleDateString(LOC()))}–${esc(new Date(res.end).toLocaleDateString(LOC()))}, nur Arbeitsstunden, bis zu ${Math.max(...res.rows.map(r => r.n))} Stunden je Modell) die Vortagesprognose jedes Modells für 10 m Höhe gegen die Messwerte der Station <b>${esc(st.name)}</b> (${esc(st.src)}, ${fmt(st.dist,1)} km entfernt${st.alt!=null ? `, ${Math.round(st.alt)} m ü. NN` : ""}${dAlt!=null && Math.abs(dAlt) > 150 ? `, ${Math.abs(dAlt)} m ${dAlt>0 ? "tiefer" : "höher"} als der Standort` : ""}).
      <i>Fehler Verlauf</i>: mittlerer Fehler, nachdem die Grundtendenz des Modells abgezogen ist; so werden glatte, grobe Modelle nicht bevorzugt.
      <i>Treffer windig</i>: Anteil der windigsten 25 % der Stunden, die das Modell richtig erkannt hat. <i>gut</i>: höchstens 15 % mehr Fehler im Verlauf als das beste Modell und mind. 85 % von dessen Trefferquote; <i>deutlich schlechter</i>: mind. 40 % und 0,5 m/s mehr Fehler oder höchstens 60 % der besten Trefferquote. Unterscheiden sich alle um weniger als 30 %, gelten sie als gleichwertig.
      Gilt für Bodenwind in der Region, nicht für die Nabenhöhe. Berechnet ${esc(new Date(res.date).toLocaleString(LOC(),{dateStyle:"short", timeStyle:"short"}))}.`, `<b>How it is calculated:</b> for the last ${RANK_DAYS} days (${esc(new Date(res.start).toLocaleDateString(LOC()))}–${esc(new Date(res.end).toLocaleDateString(LOC()))}, working hours only, up to ${Math.max(...res.rows.map(r => r.n))} hours per model) each model’s previous-day forecast for 10 m height against the measurements of station <b>${esc(st.name)}</b> (${esc(st.src)}, ${fmt(st.dist,1)} km away${st.alt!=null ? `, ${Math.round(st.alt)} m a.s.l.` : ""}${dAlt!=null && Math.abs(dAlt) > 150 ? `, ${Math.abs(dAlt)} m ${dAlt>0 ? "lower" : "higher"} than the site` : ""}).
      <i>Pattern error</i>: mean error after the model’s bias is removed, so smooth, coarse models are not favoured.
      <i>Windy hits</i>: share of the windiest 25 % of hours the model detected correctly. <i>good</i>: at most 15 % more pattern error than the best model and at least 85 % of its hit rate; <i>clearly worse</i>: at least 40 % and 0.5 m/s more error or at most 60 % of the best hit rate. If all differ by less than 30 %, they count as equivalent.
      Applies to near-ground wind in the region, not to hub height. Calculated ${esc(new Date(res.date).toLocaleString(LOC(),{dateStyle:"short", timeStyle:"short"}))}.`)}</p>`;
}
