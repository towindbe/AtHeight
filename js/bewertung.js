/* Windbericht · Ampelregeln mit Gründen, Stundenberechnung, Tageszusammenfassung */
"use strict";

/* Modelle, die in die Bewertung eingehen: aktiv und nicht von Hand ausgeschlossen */
const isExcluded = r => (site.excluded||[]).includes(r.m.id);
const isUsed = r => (r.status==="ok" || r.status==="extrap") && !isExcluded(r);
function computeHours(results, times){
  const usable = results.filter(isUsed);
  return times.map((t,i) => {
    const pts = usable.map(r => ({r, s:r.series[i]})).filter(x => x.s);
    const vs = pts.map(x=>x.s.v), gs = pts.map(x=>x.s.g).filter(v=>v!=null);
    const h = {t, i, n:pts.length, med:median(vs), min:vs.length?Math.min(...vs):null, max:vs.length?Math.max(...vs):null,
      gMed:median(gs), gMax:gs.length?Math.max(...gs):null,
      rain:median(pts.map(x=>x.s.rain).filter(v=>v!=null)),
      rainN:pts.filter(x => x.s.rain!=null).length, rainYes:pts.filter(x => x.s.rain!=null && x.s.rain >= 0.1).length,   // Einigkeit der Modelle beim Regen
      cape:median(pts.map(x=>x.s.cape).filter(v=>v!=null)),
      t2:median(pts.map(x=>x.s.t2).filter(v=>v!=null)),
      tW:median(pts.map(x=>x.s.tW).filter(v=>v!=null)), app:median(pts.map(x=>x.s.app).filter(v=>v!=null)),
      uv:extras.uv?.get(t) ?? null,
      storms:pts.filter(x => x.s.wc!=null && x.s.wc>=95).length,
      over:pts.filter(x => x.s.v > site.wind || (x.s.g!=null && x.s.g > site.gust)).length,
      dir:circMean(pts.map(x=>x.s.dir).filter(v=>v!=null))};
    h.dark = isDark(t);
    h.chill = windChill(h.tW, h.med);
    const a = localMs(t);
    h.warns = allWarnings().filter(w => w.start < a + 36e5 && w.end > a);
    const ens = (extras.ens||[]).filter(e => e.ok && e.p.has(t)).map(e => e.p.get(t));
    h.pEns = ens.length ? ens.reduce((s,x) => s + x.p, 0) / ens.length : null;   // jedes Ensemble zählt gleich
    h.nEns = ens.reduce((s,x) => s + x.n, 0);
    Object.assign(h, rate(h));
    return h;
  });
}
// Häkchen in der Modelltabelle: neu bewerten ohne neuen Abruf
function setModelUsed(id, used){
  const ex = new Set(site.excluded||[]);
  used ? ex.delete(id) : ex.add(id);
  if(!state.results.some(r => (r.status==="ok"||r.status==="extrap") && !ex.has(r.m.id))){ alert("Mindestens ein Modell muss in die Bewertung eingehen."); renderModelTable(); return; }
  const prev = site;
  site = {...site, excluded:[...ex]};
  const favs = loadFavs(), k = favs.findIndex(f => sameSpot(f.site, prev));
  if(k >= 0){ favs[k] = {name:site.name, site:{...site}}; saveFavs(favs); }
  saveSite();
  state.hours = computeHours(state.results, state.times);
  render();
}
function defaultSel(day){
  const now = state.times.findIndex(t => t.slice(0,13)===nowKey());
  if(now>=0 && state.times[now].startsWith(day) && isWork(state.times[now])) return now;
  const i = state.times.findIndex(t => t.startsWith(day) && hourOf(t)===site.from);
  return i>=0 ? i : state.times.findIndex(t=>t.startsWith(day));
}

/* Ampel pro Stunde. Jede Regel hinterlegt ihren Grund; "info" ändert die Ampel nicht. */
function rate(h){
  if(!h.n) return {lamp:"none", why:[]};
  const why = [], add = (l, t) => why.push({l, t});
  if(h.med!=null && h.med > site.wind) add("stop", `Mittelwind ${fmt(h.med)} m/s über ${fmt(site.wind)}`);
  else if(h.max!=null && h.max > site.wind) add("warn", "Einzelne Modelle über Mittelwind-Grenze");
  if(h.gMed!=null && h.gMed > site.gust) add("stop", `Böe ${fmt(h.gMed)} m/s über ${fmt(site.gust)}`);
  else if(h.gMax!=null && h.gMax > site.gust) add("warn", "Einzelne Modelle mit Böe über Grenze");
  if(h.storms >= Math.max(2, Math.ceil(h.n/3))) add("stop", `Gewitter in ${h.storms} von ${h.n} Modellen`);
  else if(h.storms >= 1) add("warn", `Gewittersignal in ${h.storms} Modell${h.storms>1?"en":""}`);
  if(h.cape!=null && h.cape >= CAPE_STOP) add("stop", `Gewitterenergie CAPE ${Math.round(h.cape)} J/kg`);
  else if(h.cape!=null && h.cape >= CAPE_WARN) add("warn", `Gewitterenergie CAPE ${Math.round(h.cape)} J/kg`);
  if(h.rain!=null && h.rain >= RAIN_WARN) add("warn", `Regen ${fmt(h.rain)} mm/h`);
  if(h.dark) add("warn", "Nacht (außerhalb der bürgerlichen Dämmerung)");
  if(h.pEns!=null && h.pEns >= ENS_WARN) add("warn", `Zu windig in ${riskTen(h.pEns)} Szenarien`);
  else if(h.pEns!=null && h.pEns >= ENS_INFO) add("info", `Zu windig in ${riskTen(h.pEns)} Szenarien`);
  (h.warns||[]).forEach(w => add(!w.relevant ? "info" : w.lvl >= 3 ? "stop" : "warn", `Amtliche Warnung ${w.src}: ${w.title}`));
  if(h.chill!=null && h.chill <= CHILL_WARN) add("warn", `Gefühlt ${fmt(h.chill,0)} °C in ${workH()} m: Erfrierungsgefahr`);
  else if(h.chill!=null && h.chill <= CHILL_INFO) add("info", `Gefühlt ${fmt(h.chill,0)} °C in ${workH()} m: Kälteschutz`);
  if(h.app!=null && h.app >= HEAT_INFO) add("info", `Hitze: gefühlt ${fmt(h.app,0)} °C am Boden`);
  if(h.uv!=null && h.uv >= UV_INFO) add("info", `UV-Index ${fmt(h.uv,0)}: Sonnenschutz`);
  const lamp = why.some(w => w.l==="stop") ? "stop" : why.some(w => w.l==="warn") ? "warn" : "go";
  return {lamp, why};
}

const isWork = t => hourOf(t)>=site.from && hourOf(t)<=site.to;
const dayHours = day => state.hours.filter(h => h.t.startsWith(day) && isWork(h.t));
const usableModels = () => state.results.filter(isUsed);

function dayLabel(d, short){
  const today = state.times[0].slice(0,10);
  const dt = new Date(d+"T12:00:00");
  const diff = Math.round((dt - new Date(today+"T12:00:00"))/864e5);
  const rel = ["Heute","Morgen","Übermorgen"][diff] || "";
  if(short) return rel || dt.toLocaleDateString("de-DE",{weekday:"short"});
  return rel + " · " + dt.toLocaleDateString("de-DE",{weekday:"short", day:"2-digit", month:"2-digit"});
}

function buildSummary(hs){
  if(!hs.length || !hs.some(h=>h.n)) return {lamp:"none", head:"Für diesen Tag liegen keine Modelldaten vor.", text:""};
  const c = {go:0,warn:0,stop:0};
  hs.forEach(h => { if(c[h.lamp]!=null) c[h.lamp]++; });
  let best=null, cur=null;
  hs.forEach(h => { if(h.lamp==="go"){ cur = cur ? {...cur, end:h.t, len:cur.len+1} : {start:h.t, end:h.t, len:1}; if(!best||cur.len>best.len) best=cur; } else cur=null; });
  let lamp, head;
  if(c.go===hs.length){ lamp="go"; head=`Ganzer Arbeitstag im grünen Bereich (${site.from}–${site.to} Uhr).`; }
  else if(best && best.len>=2){ lamp = best.len>=4 ? "warn" : "warn"; const win = `${hh(best.start)}–${String(hourOf(best.end)+1).padStart(2,"0")} Uhr`; head=`Grün nur ${win} (${best.len} h), übrige Stunden prüfen.`; if(c.stop===0 && best.len>=hs.length-2){ lamp="go"; head=`Grün ${win}, Randstunden prüfen.`; } }
  else if(c.stop===hs.length){ lamp="stop"; head="Kein Arbeitsfenster: Grenzwerte ganztägig überschritten."; }
  else if(c.stop > hs.length/2){ lamp="stop"; head=`Überwiegend Stop: in ${c.stop} von ${hs.length} Stunden über Grenzwert.`; }
  else { lamp="warn"; head="Kein sicheres grünes Fenster, nur Stunden mit Prüfbedarf."; }
  const parts = [];
  const firstStop = hs.find(h => h.lamp==="stop");
  if(firstStop && c.stop!==hs.length) parts.push(`Ab ${hh(firstStop.t)} Uhr liegen ${firstStop.over} von ${firstStop.n} Modellen über euren Grenzwerten.`);
  const peak = hs.reduce((a,h) => h.med!=null && (!a || h.med>a.med) ? h : a, null);
  if(peak) parts.push(`Stärkster Wind gegen ${hh(peak.t)} Uhr: ${fmt(peak.med)} m/s (Spanne ${fmt(peak.min)}–${fmt(peak.max)}), Böen ca. ${fmt(peak.gMed)} m/s.`);
  const st = hs.find(h=>h.storms>0);
  if(st) parts.push(`Gewittersignal ab ${hh(st.t)} Uhr.`);
  const spread = median(hs.filter(h=>h.max!=null).map(h=>h.max-h.min));
  if(spread!=null) parts.push(spread < 2.5 ? "Modelle weitgehend einig." : spread < 5 ? "Modelle streuen mäßig." : "Modelle streuen stark, Lage unsicher.");
  return {lamp, head, text:parts.join(" "), counts:c, best, spread};
}
