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
      rh:median(pts.map(x=>x.s.rh).filter(v=>v!=null)), cc:median(pts.map(x=>x.s.cc).filter(v=>v!=null)),   // Feuchte und Bewölkung: nur Anzeige
      td:median(pts.map(x=>x.s.td).filter(v=>v!=null)),
      uv:extras.uv?.get(t) ?? null,
      storms:pts.filter(x => x.s.wc!=null && x.s.wc>=95).length,
      over:pts.filter(x => x.s.v > site.wind || (x.s.g!=null && x.s.g > site.gust)).length,
      dir:dirMean(pts)};
    h.dark = isDark(t);
    h.chill = windChill(h.tW, h.med);
    // Abstand Temperatur in Arbeitshöhe zum Taupunkt (2 m). Oben ist der Taupunkt etwas niedriger, der Abstand also eher größer: vorsichtige Schätzung
    h.dew = h.tW!=null && h.td!=null ? h.tW - h.td : null;
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
  const why = [], add = (l, t, cat) => why.push(cat ? {l, t, cat} : {l, t});
  if(h.med!=null && h.med > site.wind) add("stop", `Wind ${fwu(h.med)} über ${fw(site.wind)}`);
  else if(h.max!=null && h.max > site.wind) add("warn", "Einzelne Modelle über Wind-Grenze");
  if(h.gMed!=null && h.gMed > site.gust) add("stop", `Böe ${fwu(h.gMed)} über ${fw(site.gust)}`);
  else if(h.gMax!=null && h.gMax > site.gust) add("warn", "Einzelne Modelle mit Böe über Grenze");
  if(h.storms >= Math.max(2, Math.ceil(h.n/3))) add("stop", `Gewitter in ${h.storms} von ${h.n} Modellen`);
  else if(h.storms >= 1) add("warn", `Gewittersignal in ${h.storms} Modell${h.storms>1?"en":""}`);
  if(h.cape!=null && h.cape >= CAPE_STOP) add("stop", `Gewitterenergie CAPE ${Math.round(h.cape)} J/kg`);
  else if(h.cape!=null && h.cape >= CAPE_WARN) add("warn", `Gewitterenergie CAPE ${Math.round(h.cape)} J/kg`);
  if(h.rain!=null && h.rain >= RAIN_WARN) add("warn", `Regen ${fmt(h.rain)} mm/h`);
  if(h.dark) add("info", "Nacht");
  if(h.pEns!=null && h.pEns >= ENS_WARN) add("warn", `Zu windig in ${riskTen(h.pEns)} der Szenarien`);
  else if(h.pEns!=null && h.pEns >= ENS_INFO) add("info", `Zu windig in ${riskTen(h.pEns)} der Szenarien`);
  (h.warns||[]).forEach(w => add(!w.relevant ? "info" : w.lvl >= 3 ? "stop" : "warn", `Amtliche Warnung ${w.src}: ${w.title}`));
  if(h.tW!=null && h.tW < minTemp()) add("stop", `${fmt(h.tW,1)} °C in ${workH()} m: unter Mindesttemperatur ${fmt(minTemp(),0)} °C`);
  else if(h.chill!=null && h.chill <= CHILL_INFO) add("info", `Gefühlt ${fmt(h.chill,0)} °C in ${workH()} m: Kälteschutz`);
  if(h.app!=null && h.app >= HEAT_INFO) add("info", `Hitze: gefühlt ${fmt(h.app,0)} °C am Boden`);
  if(h.uv!=null && h.uv >= UV_INFO) add("info", `UV-Index ${fmt(h.uv,0)}: Sonnenschutz`);
  // Kondenswasser steht einmal je Tag im Überblick und in der Taupunkt-Zeile, nicht in jeder Stunde
  if(coatOn(h.t.slice(0,10))){   // Beschichten-Modus: Hinweis, auf Wunsch (Einstellungen) Stop
    const cl = site.coatStop ? "stop" : "info", k = fmt(coatDew(), coatDew()%1 ? 1 : 0);
    if(h.rh!=null && h.rh > coatRh()) add(cl, `Beschichten: Luftfeuchte ${Math.round(h.rh)} % (Grenze ${coatRh()} %)`, "coat");
    if(h.dew!=null && h.dew < coatDew()) add(cl, `Beschichten: ${h.dew <= 0 ? "Taupunkt erreicht" : `Taupunktabstand ${fmt(h.dew,1)} K`} (Grenze mind. ${k} K)`, "coat");
  }
  const lamp = why.some(w => w.l==="stop") ? "stop" : why.some(w => w.l==="warn") ? "warn" : "go";
  // Stop allein wegen Beschichtung (nicht wegen Wetter): wird im Überblick und Bericht getrennt genannt
  const coatOnly = lamp==="stop" && why.filter(w => w.l==="stop").every(w => w.cat==="coat");
  // Ampel nur nach Wetter (ohne Beschichten): für Anzeigen, die zum Wind gehören, z. B. die Windrichtungspfeile
  const wx = why.filter(w => w.cat!=="coat"), lampW = wx.some(w => w.l==="stop") ? "stop" : wx.some(w => w.l==="warn") ? "warn" : "go";
  return {lamp, why, coatOnly, lampW};
}

/* Über Nacht (Arbeitsende bis Arbeitsbeginn am Folgetag): dürfen Seile und Bühne hängen bleiben?
   Bewertet wird der Median der Modelle von 10 m bis Nabe; einzelne Modelle darüber ergeben einen Prüfhinweis. */
const nightWind = () => site.nightWind ?? 15, nightGust = () => site.nightGust ?? 20;
function nightRig(day){
  if(!day || !state.times?.length) return null;
  const next = new Date(Date.parse(day+"T12:00:00Z") + 864e5).toISOString().slice(0,10);
  const idx = state.times.map((t,i) => i).filter(i => { const t = state.times[i], h = hourOf(t);
    return (t.startsWith(day) && h > site.to) || (t.startsWith(next) && h < site.from); });
  if(!idx.length) return null;
  const usable = state.results.filter(isUsed);
  const hrs = idx.map(i => {
    const s = usable.map(r => r.series[i]).filter(x => x && x.vR!=null);
    const gs = s.map(x => x.gR).filter(v => v!=null);
    return {t:state.times[i], n:s.length, v:median(s.map(x => x.vR)), g:median(gs),
      vMax:s.length ? Math.max(...s.map(x => x.vR)) : null, gMax:gs.length ? Math.max(...gs) : null};
  }).filter(h => h.n);
  if(!hrs.length) return null;
  const pick = k => hrs.reduce((a,h) => h[k]!=null && (!a || h[k] > a[k]) ? h : a, null);
  const pv = pick("v"), pg = pick("g"), mv = pick("vMax"), mg = pick("gMax");
  const over = (pv && pv.v > nightWind()) || (pg && pg.g > nightGust());
  const some = (mv && mv.vMax > nightWind()) || (mg && mg.gMax > nightGust());
  const firstOver = hrs.find(h => h.v > nightWind() || (h.g!=null && h.g > nightGust()));
  return {lvl: over ? "stop" : some ? "warn" : "go", from:hrs[0].t, to:hrs[hrs.length-1].t, complete: idx.length === (23 - site.to) + site.from,
    v:pv?.v ?? null, g:pg?.g ?? null, gT:pg?.t ?? null, vMax:mv?.vMax ?? null, gMax:mg?.gMax ?? null, firstOver:firstOver?.t ?? null};
}
function nightText(n){
  if(!n) return null;
  const span = `${hh(n.from)}–${String((hourOf(n.to)+1)%24).padStart(2,"0")} Uhr`;
  const lim = `Grenze ${fw(nightWind())} / ${fwu(nightGust())} (Wind / Böe, 10 m bis ${topWord()})`;
  const part = n.complete ? "" : " (Prognose endet früher)";
  if(n.lvl==="stop") return {lvl:"stop", head:"Seile und Bühne über Nacht: Beschädigungsrisiko hoch, abbauen", text:`${span}${part}: über Grenze ab ${hh(n.firstOver)} Uhr, Böen bis ${fwu(n.g)} gegen ${hh(n.gT)} Uhr, Wind bis ${fwu(n.v)} · ${lim}`};
  if(n.lvl==="warn") return {lvl:"warn", head:"Seile und Bühne über Nacht: Beschädigungsrisiko erhöht, prüfen", text:`${span}${part}: Böen bis ${fwu(n.g)}, einzelne Modelle bis ${fwu(Math.max(n.gMax ?? 0, n.vMax ?? 0))} · ${lim}`};
  return {lvl:"go", head:"Seile und Bühne über Nacht: Beschädigungsrisiko gering", text:`${span}${part}: Böen bis ${fwu(n.g)}, Wind bis ${fwu(n.v)} · ${lim}`};
}
/* Windrichtung der Modelle, nach Windstärke gewichtet: Modelle mit fast keinem Wind würfeln die Richtung und zählen weniger */
function dirMean(pts){
  const d = pts.filter(x => x.s.dir!=null);
  return circMean(d.map(x => x.s.dir), d.map(x => Math.max(x.s.v ?? 0, 0.2)));
}

/* Große Streuung: hochauflösende und gröbere Modelle getrennt zeigen (Tageshöchstwert Wind in der Arbeitszeit).
   Nur zur Einordnung; es wird kein Modell aus der Bewertung genommen. */
const SPREAD_HINT = 5;   // ab dieser mittleren Spanne (m/s) gilt die Lage als unsicher, wie in der Tageszusammenfassung
function spreadGroups(day){
  const hs = dayHours(day).filter(h => h.n);
  const sum = buildSummary(hs);
  if(!hs.length || sum.spread==null) return null;
  const maxima = usableModels().filter(r => hs.filter(h => r.series[h.i]).length >= hs.length*0.75)
    .map(r => ({r, v:Math.max(...hs.map(h => r.series[h.i]?.v ?? -1))})).filter(x => x.v >= 0);
  const grp = list => list.length ? {n:list.length, lo:Math.min(...list.map(x=>x.v)), hi:Math.max(...list.map(x=>x.v)), med:median(list.map(x=>x.v))} : null;
  const top = maxima.reduce((a,x) => !a || x.v > a.v ? x : a, null);
  const pMax = hs.reduce((a,h) => h.pEns!=null && (a==null || h.pEns > a) ? h.pEns : a, null);
  const lvl = sum.spread < 2.5 ? "einig" : sum.spread < SPREAD_HINT ? "maessig" : "unsicher";
  return {lvl, spread:sum.spread, all:grp(maxima), hi:grp(maxima.filter(x => x.r.m.hi)), lo:grp(maxima.filter(x => !x.r.m.hi)), top, pMax};
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

/* Regen-Tendenz in Worten für die Arbeitszeit: Regen (Median der Modelle ab 0,1 mm/h) und Schauer möglich (mind. ein Viertel der Modelle sieht Regen) */
function rainSummary(hs){
  hs = hs.filter(h => h.n);
  if(!hs.length) return "";
  const cls = h => h.rain!=null && h.rain >= 0.1 ? "wet" : h.rainN && h.rainYes/h.rainN >= 0.25 ? "maybe" : "";
  const win = (a, b) => `${hh(a.t)}–${String(hourOf(b.t)+1).padStart(2,"0")} Uhr`;
  const spans = []; let cur = null;
  hs.forEach(h => { const c = cls(h);
    if(c && cur && cur.c===c) cur.end = h; else { cur = c ? {c, start:h, end:h, mm:0} : null; if(cur) spans.push(cur); }
    if(cur) cur.mm += h.rain || 0; });
  if(!spans.length) return "Regen-Tendenz: trocken in der Arbeitszeit.";
  const mm = hs.reduce((s,h) => s + (cls(h) ? (h.rain || 0) : 0), 0);
  const peak = hs.reduce((a,h) => h.rain!=null && (!a || h.rain > a.rain) ? h : a, null);
  const parts = [];
  if(hourOf(spans[0].start.t) > hourOf(hs[0].t)) parts.push(`trocken bis ${hh(spans[0].start.t)} Uhr`);
  spans.forEach(s => parts.push(`${s.c==="wet" ? "Regen" : "Schauer möglich"} ${win(s.start, s.end)}`));
  if(hourOf(spans[spans.length-1].end.t) < hourOf(hs[hs.length-1].t)) parts.push("danach trocken");
  let t = `Regen-Tendenz: ${parts.join(", ")}.`;
  if(mm >= 0.1) t += ` Zusammen etwa ${fmt(mm,1)} mm in der Arbeitszeit`;
  if(peak && peak.rain >= 0.1) t += `${mm >= 0.1 ? ", " : " "}am stärksten gegen ${hh(peak.t)} Uhr (${fmt(peak.rain,1)} mm/h, ${peak.rainYes} von ${peak.rainN} Modellen)`;
  return t + (mm >= 0.1 || (peak && peak.rain >= 0.1) ? "." : "");
}
/* Zeitbereiche als Text, z. B. "06–09, 11 Uhr" (Stunden der Liste gelten als aufeinanderfolgend) */
function rangeTxt(hs, test){
  const r = []; let s = null;
  hs.forEach((h, k) => { const on = test(h); if(on && s==null) s = k; if(!on && s!=null){ r.push([s, k-1]); s = null; } });
  if(s!=null) r.push([s, hs.length-1]);
  if(!r.length) return "";
  if(r.length===1 && r[0][0]===0 && r[0][1]===hs.length-1) return "in der ganzen Arbeitszeit";
  return r.map(([a, b]) => a===b ? hh(hs[a].t) : hh(hs[a].t) + "–" + hh(hs[b].t)).join(", ") + " Uhr";
}
/* Kondenswasser einmal je Tag (Arbeitszeit): Taupunkt erreicht bzw. knapp */
function dewDaySummary(hs){
  const wet = rangeTxt(hs, h => h.dew!=null && h.dew <= 0), near = rangeTxt(hs, h => h.dew!=null && h.dew > 0 && h.dew <= DEW_INFO);
  if(!wet && !near) return "";
  return "Kondenswasser: " + [wet && `Taupunkt erreicht ${wet} (Nebel/Wolke, alles nass)`, near && `knapp ${near} (bis ${fmt(DEW_INFO,0)} K)`].filter(Boolean).join(" · ") + ".";
}
/* Beschichten-Modus: wann an diesem Tag die Grenzen überschritten sind */
const coatViol = h => !!h && ((h.dew!=null && h.dew < coatDew()) || (h.rh!=null && h.rh > coatRh()));
function coatDaySummary(hs){
  if(!hs.length || !coatOn(hs[0].t.slice(0,10))) return "";
  const bad = rangeTxt(hs, coatViol);
  return bad ? `Beschichten nicht zulässig ${bad}${site.coatStop ? " (Ampel STOP)" : ""}.` : "Beschichten: Grenzen in der ganzen Arbeitszeit eingehalten.";
}
function buildSummary(hs){
  if(!hs.length || !hs.some(h=>h.n)) return {lamp:"none", head:"Für diesen Tag liegen keine Modelldaten vor.", text:""};
  const c = {go:0,warn:0,stop:0};
  hs.forEach(h => { if(c[h.lamp]!=null) c[h.lamp]++; });
  let best=null, cur=null;
  hs.forEach(h => { if(h.lamp==="go"){ cur = cur ? {...cur, end:h.t, len:cur.len+1} : {start:h.t, end:h.t, len:1}; if(!best||cur.len>best.len) best=cur; } else cur=null; });
  let lamp, head;
  if(c.go===hs.length){ lamp="go"; head=`Ganzer Arbeitstag klar (${site.from}–${site.to} Uhr).`; }
  else if(best && best.len>=2){ lamp = best.len>=4 ? "warn" : "warn"; const win = `${hh(best.start)}–${String(hourOf(best.end)+1).padStart(2,"0")} Uhr`; head=`Klar nur ${win} (${best.len} h), übrige Stunden prüfen.`; if(c.stop===0 && best.len>=hs.length-2){ lamp="go"; head=`Grün ${win}, Randstunden prüfen.`; } }
  else if(c.stop===hs.length){ lamp="stop"; head = hs.every(h => h.coatOnly) ? "Kein Fenster fürs Beschichten: Feuchte oder Taupunkt ganztägig außerhalb eurer Grenzen." : "Kein Arbeitsfenster: Grenzwerte ganztägig überschritten."; }
  else if(c.stop > hs.length/2){ lamp="stop"; head = hs.filter(h => h.lamp==="stop").every(h => h.coatOnly) ? `Überwiegend Stop wegen Beschichtung: in ${c.stop} von ${hs.length} Stunden Feuchte oder Taupunkt außerhalb eurer Grenzen.` : `Überwiegend Stop: in ${c.stop} von ${hs.length} Stunden über Grenzwert.`; }
  else { lamp="warn"; head="Kein klares Fenster, nur Stunden mit Prüfbedarf."; }
  const parts = [];
  const firstStop = hs.find(h => h.lamp==="stop" && !h.coatOnly);
  if(firstStop && c.stop!==hs.length) parts.push(`Ab ${hh(firstStop.t)} Uhr liegen ${firstStop.over} von ${firstStop.n} Modellen über euren Grenzwerten.`);
  const co = rangeTxt(hs, h => h.coatOnly);
  if(co) parts.push(`Stop nur wegen Beschichtung (Feuchte/Taupunkt, nicht Wetter): ${co}.`);
  const peak = hs.reduce((a,h) => h.med!=null && (!a || h.med>a.med) ? h : a, null);
  if(peak) parts.push(`Stärkster Wind gegen ${hh(peak.t)} Uhr: ${fwu(peak.med)} (Spanne ${fw(peak.min)}–${fw(peak.max)}), Böen ca. ${fwu(peak.gMed)}.`);
  const st = hs.find(h=>h.storms>0);
  if(st) parts.push(`Gewittersignal ab ${hh(st.t)} Uhr.`);
  const spread = median(hs.filter(h=>h.max!=null).map(h=>h.max-h.min));
  if(spread!=null) parts.push(spread < 2.5 ? "Modelle weitgehend einig." : spread < 5 ? "Modelle streuen mäßig." : "Modelle streuen stark, Lage unsicher.");
  return {lamp, head, text:parts.join(" "), counts:c, best, spread};
}
