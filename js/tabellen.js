/* Windbericht · Modell-Matrix, Stundentabelle, Modelltabelle */
"use strict";

/* Modell-Matrix mit Umschalter: Wind, Böe oder Regen je Modell und Stunde. Nur Anzeige, die Ampel bleibt unverändert.
   Regen: Klassen nach üblicher Einteilung (leicht bis 2,5 mm/h, mäßig bis 7,5, darüber stark); gelber Rand ab der Prüfschwelle der Ampel. */
let mxMode = (() => { try{ return localStorage.getItem("wb_mx") || "wind"; }catch(e){ return "wind"; } })();
const RAIN_LIGHT = 2.5, RAIN_MOD = 7.5;
function renderMatrix(){
  const idxs = dayIdx().filter(i => isWork(state.times[i]));
  const rain = mxMode === "regen", lim = mxMode === "boe" ? site.gust : site.wind;
  // gleiche Regel wie überall: rot erst ÜBER der Grenze, gelb ab 75 %; angezeigt mit einer Nachkommastelle
  const cls = v => v==null ? "m-none" : v > lim ? "m-stop" : v >= lim*.75 ? "m-warn" : "m-go";
  // knapp über der Grenze (gerundet gleich dem Grenzwert): zwei Nachkommastellen, damit Rot nachvollziehbar ist
  const num = v => { const d = U().d, r = x => Math.round(cw(x)*10**d)/10**d; return v > lim && r(v) <= r(lim) ? fw(v, d+1) : fw(v); };
  const rcls = v => v==null ? "m-none" : v >= RAIN_MOD ? "r-3" : v >= RAIN_LIGHT ? "r-2" : v >= 0.1 ? "r-1" : "r-0";
  const rtxt = (v, storm) => v==null ? "·" : (v < 0.05 ? "0" : fmt(v,1)) + (storm ? "⚡" : "");
  const u = usableModels().sort((a,b)=> (b.m.hi-a.m.hi));
  const head = `<tr><th></th>${idxs.map(i=>`<th>${hh(state.times[i])}</th>`).join("")}</tr>`;
  const cellOf = (s, i, r) => {
    if(rain) return `<td class="${rcls(s?.rain)}${s?.rain!=null && s.rain >= RAIN_WARN ? " r-w" : ""}" data-i="${i}" title="${esc(r.m.name)} ${hh(state.times[i])} Uhr: Regen ${s?.rain==null ? "–" : fmt(s.rain,1)} mm/h${s?.wc>=95 ? ", Gewittersignal" : ""}">${rtxt(s?.rain, s?.wc>=95)}</td>`;
    const v = mxMode === "boe" ? s?.g : s?.v;
    return `<td class="${cls(v)}" data-i="${i}" title="${esc(r.m.name)} ${hh(state.times[i])} Uhr: Wind ${fwu(s?.v)}, Böe ${fwu(s?.g)}">${v!=null ? num(v) : "·"}</td>`;
  };
  const rows = u.map(r => `<tr><th class="mname">${esc(r.m.name)} <small>${esc(r.m.org)} · ${esc(r.m.res)}</small></th>${idxs.map(i => cellOf(r.series[i], i, r)).join("")}</tr>`).join("");
  const med = `<tr class="medrow"><th class="mname">Median <small>alle Modelle</small></th>${idxs.map(i => { const h = state.hours[i];
    if(rain) return `<td class="${rcls(h.rain)}${h.rain!=null && h.rain >= RAIN_WARN ? " r-w" : ""}" data-i="${i}" style="font-weight:700">${rtxt(h.rain, h.storms > 0)}</td>`;
    const v = mxMode === "boe" ? h.gMed : h.med; return `<td class="${cls(v)}" data-i="${i}" style="font-weight:700">${v==null?"·":num(v)}</td>`; }).join("")}</tr>`;
  $("matrix").innerHTML = `<table>${head}${rows}${med}</table>`;
  $("matrix").querySelectorAll("td[data-i]").forEach(td => td.onclick = () => selectHour(+td.dataset.i));
  $("mxDay").textContent = dayLabel(state.day);
  $("mxNote").hidden = rain;
  $("mxNote").innerHTML = mxMode === "boe" ? `Böe je Modell und Stunde in <span class="wu">${WU()}</span>. Gelb ab 75 % des Grenzwerts für die Böe, rot darüber. Zeigt, ob nur ein Ausreißer warnt oder fast alle.`
    : `Wind je Modell und Stunde in <span class="wu">${WU()}</span>. Gelb ab 75 % des Grenzwerts, rot über dem Grenzwert. Mit der Maus über ein Feld fahren zeigt auch die Böe. Zeigt, ob nur ein Ausreißer warnt oder fast alle.`;
  $("mxLegend").hidden = !rain;
  $("mxLegend").textContent = rain ? `Regen in mm/h. Hellblau: leicht (bis ${fmt(RAIN_LIGHT,1)}), mittelblau: mäßig (bis ${fmt(RAIN_MOD,1)}), dunkelblau: stark. Gelber Rand: ab ${fmt(RAIN_WARN,1)} mm/h (Prüfen in der Ampel). ⚡ Gewittersignal. Nur Anzeige, die Ampel ändert sich dadurch nicht.` : "";
  document.querySelectorAll("#mxSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === mxMode)));
  highlightSel();
}
document.querySelectorAll("#mxSeg button").forEach(b => b.onclick = () => { mxMode = b.dataset.m; try{ localStorage.setItem("wb_mx", mxMode); }catch(e){} renderMatrix(); });

function hourRows(hs, dots){
  return hs.map(h => `<tr>
    <td class="num">${dots?`<span class="dot d-${h.lamp}"></span> `:LAMP_TXT[h.lamp]+" "}${hh(h.t)}:00</td>
    <td class="num ${h.med>site.wind?"over":""}">${fw(h.med)}</td>
    <td class="num">${fw(h.min)}–${fw(h.max)}</td>
    <td class="num ${h.gMed>site.gust?"over":""}">${fw(h.gMed)}</td>
    <td class="num">${dirName(h.dir.mean)}</td>
    <td class="num">${h.n ? h.over+"/"+h.n : "–"}</td>
    <td class="num ${h.pEns>=ENS_WARN?"over":""}">${riskTen(h.pEns)}</td>
    <td class="num">${fmt(h.rain)}</td>
    <td class="num">${h.cape==null?"–":Math.round(h.cape)}</td>
    <td class="num ${h.tW!=null && h.tW<minTemp()?"over":""}">${fmt(h.tW,0)}</td>
    <td class="num">${fmt(h.chill,0)}</td>
    <td class="why-cell">${esc(h.why.filter(w=>w.l!=="go").map(w=>shortWhy(w.t)).join(" · ")) || "–"}</td></tr>`).join("");
}

const HOUR_HEAD = `<thead><tr><th>Uhr</th><th>Wind <span class="wu">m/s</span></th><th>Spanne</th><th>Böe</th><th>Richtung</th><th title="Anzahl der Modelle mit Wind oder Böe über euren Grenzwerten">Modelle über Grenze</th><th title="Anteil der Szenarien, in denen Wind oder Böe über Grenze liegen">Zu windig</th><th>Regen</th><th>CAPE</th><th>°C Arbeit</th><th>Gefühlt</th><th>Gründe</th></tr></thead>`;
function renderHourTable(){ $("hourTable").innerHTML = HOUR_HEAD + "<tbody>" + hourRows(dayHours(state.day), true) + "</tbody>"; }

function renderModelTable(){
  const idxs = dayIdx().filter(i => isWork(state.times[i]));
  const label = {ok:["Aktiv","b-ok"], extrap:["Hochgerechnet","b-ext"], outside:["Deckt Standort nicht ab","b-out"], error:["Nicht abrufbar","b-err"]};
  const order = {ok:0, extrap:1, outside:2, error:3};
  const rows = [...state.results].sort((a,b)=> order[a.status]-order[b.status] || (b.m.hi-a.m.hi)).map(r => {
    const can = r.status==="ok" || r.status==="extrap", off = can && isExcluded(r);
    const [txt, cls] = off ? ["Ausgeschlossen","b-out"] : label[r.status];
    let mx="–", first="–";
    if(r.series){
      const pts = idxs.map(i=>r.series[i] ? {t:state.times[i], ...r.series[i]} : null).filter(Boolean);
      if(pts.length){ mx = fmt(Math.max(...pts.map(p=>p.v))); const f = pts.find(p=>p.v>site.wind || (p.g!=null && p.g>site.gust)); first = f ? hh(f.t)+" Uhr" : "nie"; }
    }
    return `<tr class="${off ? "excl" : ""}"><td class="use">${can ? `<input type="checkbox" data-model="${esc(r.m.id)}" ${off ? "" : "checked"} aria-label="${esc(r.m.name)} (${esc(r.m.org)}) verwenden">` : ""}</td>
      <td>${esc(r.m.name)} <span class="muted">· ${esc(r.m.org)}</span></td><td>${esc(r.m.res)}</td>
      <td><span class="badge ${cls}" title="${esc(r.reason||"")}">${txt}</span></td><td class="num">${mx}</td><td class="num">${first}</td>
      <td class="num raw"><a href="${esc(apiUrl(r.m))}" target="_blank" rel="noopener" title="Rohdaten dieses Modells direkt von Open-Meteo">JSON</a> · <a href="${esc(apiUrl(r.m,"csv"))}" target="_blank" rel="noopener" title="Als CSV, z. B. für Excel">CSV</a></td></tr>`;
  });
  $("modelTable").innerHTML = `<thead><tr><th title="Häkchen: Modell geht in die Bewertung ein">Nutzen</th><th>Modell</th><th>Auflösung</th><th>Status</th><th>Max. Wind</th><th>Über Grenze ab</th><th class="raw">Rohdaten</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  $("modelTable").querySelectorAll("input[data-model]").forEach(c => c.onchange = () => setModelUsed(c.dataset.model, c.checked));
  renderRanking();
}
