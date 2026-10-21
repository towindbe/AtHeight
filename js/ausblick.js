/* Windbericht · 7-Tage-Ausblick (grob): Globalmodelle und ECMWF-Szenarien, je Tag in der Arbeitszeit */
"use strict";

const OUTLOOK_MODELS = [
  {id:"ecmwf_ifs", name:"ECMWF IFS"}, {id:"icon_global", name:"ICON Global"},
  {id:"gfs_global", name:"GFS"}, {id:"gem_global", name:"GEM"}
];
const OUTLOOK_DAYS = 7, OUTLOOK_DETAIL_DAYS = 3;
let outlook = null, outlookPromise = null;

// Schlüssel: neu rechnen, wenn Standort, Arbeitsbereich, Grenzwerte oder Arbeitszeit sich ändern
const outlookKey = () => [site.lat, site.lon, workH(), zoneBottom(), zoneTop(), site.wind, site.gust, site.from, site.to].join("|");

async function loadOutlook(){
  const key = outlookKey();
  if(outlook && outlook.key === key && outlook.fetchedAt === state.fetchedAt) return renderOutlook();
  $("outlook").innerHTML = `<p class="note">Lade den 7-Tage-Ausblick…</p>`;
  const [det, ens] = await Promise.all([Promise.all(OUTLOOK_MODELS.map(outlookModel)), outlookEnsemble()]);
  if(key !== outlookKey()) return;   // inzwischen anderer Standort oder andere Grenzen
  outlook = {key, fetchedAt:state.fetchedAt, days:outlookDays(det.filter(Boolean), ens), models:det.filter(Boolean).map(d => d.name), ens};
  renderOutlook();
}
async function outlookModel(m){
  try{
    const q = new URLSearchParams({latitude:site.lat, longitude:site.lon, hourly:VARS.join(","), models:m.id,
      wind_speed_unit:"ms", timezone:"auto", forecast_days:String(OUTLOOK_DAYS)});
    const j = await (await fetchT("https://api.open-meteo.com/v1/forecast?"+q)).json();
    if(!j.hourly) return null;
    fixTimes(j.hourly, j.timezone, j.utc_offset_seconds||0);
    return {...m, h:j.hourly};
  }catch(e){ return null; }
}
// Szenarien: Anteil der Läufe, in denen der Tag mindestens eine Arbeitsstunde über Grenze hat
async function outlookEnsemble(){
  try{
    const q = new URLSearchParams({latitude:site.lat, longitude:site.lon, models:"ecmwf_ifs025_ensemble", timezone:"auto",
      forecast_days:String(OUTLOOK_DAYS), wind_speed_unit:"ms", hourly:"wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_gusts_10m"});
    const j = await (await fetchT("https://ensemble-api.open-meteo.com/v1/ensemble?"+q)).json();
    if(!j.hourly) return null;
    fixTimes(j.hourly, j.timezone, j.utc_offset_seconds||0);
    const h = j.hourly;
    const members = Object.keys(h).filter(k => k==="wind_speed_80m" || k.startsWith("wind_speed_80m_member")).map(k => k.slice("wind_speed_80m".length));
    const days = new Map();   // Tag -> {over:Set(member), n:Set(member)}
    h.time.forEach((t, i) => {
      if(!isWork(t)) return;
      const d = t.slice(0,10); if(!days.has(d)) days.set(d, {over:new Set(), n:new Set()});
      const e = days.get(d);
      members.forEach(m => {
        const lv = [10,80,120].map(z => [z, h[`wind_speed_${z}m${m}`]?.[i]]).filter(([,v]) => v!=null && !isNaN(v));
        const v = lv.length ? zoneWind(lv).v : null; if(v==null) return;
        const g10 = h["wind_gusts_10m"+m]?.[i], v10 = h["wind_speed_10m"+m]?.[i];
        const g = g10==null || v10==null ? null : v * (1 + (clamp(g10/Math.max(v10,1), 1, 2.5) - 1)*0.6);
        e.n.add(m); if(v > site.wind || (g!=null && g > site.gust)) e.over.add(m);
      });
    });
    const p = new Map(); days.forEach((e, d) => { if(e.n.size >= 10) p.set(d, {p:e.over.size/e.n.size, n:e.n.size}); });
    return {members:members.length, p};
  }catch(e){ return null; }
}
function outlookDays(models, ens){
  const days = [...new Set(models.flatMap(m => m.h.time.map(t => t.slice(0,10))))].sort().slice(0, OUTLOOK_DAYS);
  return days.map(d => {
    // je Modell: Höchstwerte und Summen in der Arbeitszeit dieses Tages
    const per = models.map(m => {
      let vMax=null, gMax=null, rain=0, rainN=0, storm=false, tMin=null, tMax=null;
      m.h.time.forEach((t, i) => {
        if(!t.startsWith(d) || !isWork(t)) return;
        const lv = levelsAt(m.h, i), v = zoneWind(lv).v; if(v==null) return;
        const g = gustAt(m.h, i, v), tw = tempAt(m.h, i, workH());
        vMax = Math.max(vMax ?? -1, v); if(g!=null) gMax = Math.max(gMax ?? -1, g);
        if(m.h.precipitation?.[i]!=null){ rain += m.h.precipitation[i]; rainN++; }
        if((m.h.weather_code?.[i] ?? 0) >= 95) storm = true;
        if(tw!=null){ tMin = Math.min(tMin ?? 99, tw); tMax = Math.max(tMax ?? -99, tw); }
      });
      return vMax==null ? null : {vMax, gMax, rain: rainN ? rain : null, storm, tMin, tMax};
    }).filter(Boolean);
    if(!per.length) return {d, n:0};
    const vs = per.map(x => x.vMax), gs = per.map(x => x.gMax).filter(v => v!=null);
    const o = {d, n:per.length, vMed:median(vs), vLo:Math.min(...vs), vHi:Math.max(...vs), gMed:gs.length ? median(gs) : null, gHi:gs.length ? Math.max(...gs) : null,
      rain:median(per.map(x => x.rain).filter(v => v!=null)), storm:per.filter(x => x.storm).length/per.length,
      tMin:median(per.map(x => x.tMin).filter(v => v!=null)), tMax:median(per.map(x => x.tMax).filter(v => v!=null)),
      pEns:ens?.p.get(d)?.p ?? null};
    // grobe Tendenz, Regeln wie im Detail, aber auf Tageshöchstwerte bezogen
    o.lamp = (o.vMed > site.wind || (o.gMed!=null && o.gMed > site.gust) || o.storm >= 0.5) ? "stop"
      : (o.vHi > site.wind || (o.gHi!=null && o.gHi > site.gust) || (o.pEns!=null && o.pEns >= ENS_WARN) || o.storm > 0 || (o.rain!=null && o.rain >= 3)) ? "warn" : "go";
    return o;
  });
}
function renderOutlook(){
  if(!$("outlook")) return;
  if(!outlook || outlook.key !== outlookKey()){ if(state.fetchedAt && !outlookPromise) outlookPromise = loadOutlook().finally(() => { outlookPromise = null; }); return; }
  if(!outlook.days.length){ $("outlook").innerHTML = `<p class="note">Der Ausblick ist gerade nicht verfügbar.</p>`; return; }
  const detail = new Set([...new Set(state.times.map(t => t.slice(0,10)))].slice(0, OUTLOOK_DETAIL_DAYS));
  const cards = outlook.days.map(o => {
    const isDetail = detail.has(o.d);
    // Tage mit Detailprognose: Ampel und Wind wie oben, damit beides übereinstimmt
    let lamp = o.lamp, vTxt = o.n ? fwu(o.vMed,0) : "–", vSpan = o.n ? `${fw(o.vLo,0)}–${fw(o.vHi,0)}` : "", gTxt = o.gMed!=null ? fw(o.gMed,0) : "–";
    let rain = o.rain, storm = o.storm, tMin = o.tMin, tMax = o.tMax;
    if(isDetail){
      // gleiche Bedeutung wie bei den Tendenz-Tagen: Tageshöchstwert je Modell, davon Median und Spanne
      const hs = dayHours(o.d).filter(h => h.n);
      // nur Modelle, die mindestens 3/4 der Arbeitsstunden abdecken (Kurzfristmodelle enden nach ~2 Tagen)
      const maxima = usableModels().filter(r => hs.filter(h => r.series[h.i]).length >= hs.length*0.75)
        .map(r => Math.max(...hs.map(h => r.series[h.i]?.v ?? -1))).filter(v => v >= 0);
      if(hs.length && maxima.length){
        lamp = buildSummary(hs).lamp;
        vTxt = fwu(median(maxima),0); vSpan = `${fw(Math.min(...maxima),0)}–${fw(Math.max(...maxima),0)}`;
        gTxt = fw(Math.max(...hs.map(h => h.gMed ?? 0)),0);
        rain = hs.reduce((s,h) => s + (h.rain ?? 0), 0); storm = hs.some(h => h.storms > 0) ? 1 : 0;
        const ts = hs.map(h => h.tW).filter(v => v!=null); if(ts.length){ tMin = Math.min(...ts); tMax = Math.max(...ts); }
      }
    }
    const date = new Date(o.d+"T12:00:00");
    return `<button type="button" class="ol-day ${isDetail ? "detail" : ""} ${o.d===state.day ? "cur" : ""}" data-day="${o.d}" ${isDetail ? "" : "disabled"}
        aria-label="${esc(date.toLocaleDateString("de-DE",{weekday:"long", day:"numeric", month:"long"}))}: ${LAMP_TXT[lamp]}">
      <span class="ol-date"><b>${esc(dayLabel(o.d,true))}</b> ${esc(date.toLocaleDateString("de-DE",{day:"2-digit", month:"2-digit"}))}</span>
      <span class="rp-pill ${lamp}">${LAMP_TXT[lamp]}</span>
      <span class="ol-kind">${isDetail ? "Detail oben" : "Tendenz"}</span>
      <span class="ol-row"><small>Wind max</small><b>${vTxt}</b></span>
      <span class="ol-row" title="Höchster Wind des Tages: vom vorsichtigsten bis zum stürmischsten Modell. Schmal = einig, breit = unsicher."><small>Spanne</small>${vSpan}</span>
      <span class="ol-row"><small>Böe max</small>${gTxt} ${WU()}</span>
      <span class="ol-row"><small>Zu windig</small>${riskHtml(o.pEns, outlook.ens?.members)}</span>
      <span class="ol-row"><small>Regen</small>${rain==null ? "–" : fmt(rain,1)+" mm"}${storm > 0 ? ` <span title="Gewittersignal">⚡</span>` : ""}</span>
      <span class="ol-row"><small>°C</small>${tMin==null ? "–" : `${fmt(tMin,0)} … ${fmt(tMax,0)}`}</span>
    </button>`;
  }).join("");
  $("outlook").innerHTML = `<div class="ol-scroll"><div class="ol-days">${cards}</div></div>
    <p class="note">Grobe Tendenz für eure Arbeitszeit und den Arbeitsbereich ${esc(zoneTxt())}: höchster Wind und höchste Böe des Tages (Median von ${esc(outlook.models.join(", "))}), Regensumme, Temperatur von–bis.
      <i>Zu windig</i>: ${outlook.ens ? `Anteil der ${outlook.ens.members} ECMWF-Szenarien, in denen an diesem Tag mindestens eine Arbeitsstunde über eurer Grenze liegt.` : "Szenarien gerade nicht abrufbar."} Ab Tag 4 nur zur Planung; für die Freigabe gilt die Detailprognose.</p>`;
  $("outlook").querySelectorAll(".ol-day.detail").forEach(b => b.onclick = () => {
    state.day = b.dataset.day; state.sel = defaultSel(state.day); render();
    document.querySelector(".hero").scrollIntoView({behavior:"smooth", block:"start"});
  });
}

$("olInfoBtn").onclick = () => { const open = $("olInfo").hidden; $("olInfo").hidden = !open; $("olInfoBtn").setAttribute("aria-expanded", String(open)); };
