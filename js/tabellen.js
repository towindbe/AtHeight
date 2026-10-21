/* Windbericht · Modell-Matrix, Stundentabelle, Modelltabelle */
"use strict";

function renderMatrix(){
  const idxs = dayIdx().filter(i => isWork(state.times[i]));
  // gleiche Regel wie überall: rot erst ÜBER der Grenze, gelb ab 75 %; angezeigt mit einer Nachkommastelle
  const cls = v => v==null ? "m-none" : v > site.wind ? "m-stop" : v >= site.wind*.75 ? "m-warn" : "m-go";
  // knapp über der Grenze (gerundet gleich dem Grenzwert): zwei Nachkommastellen, damit Rot nachvollziehbar ist
  const num = v => v > site.wind && Math.round(v*10)/10 <= site.wind ? fmt(v,2) : fmt(v);
  const u = usableModels().sort((a,b)=> (b.m.hi-a.m.hi));
  const head = `<tr><th></th>${idxs.map(i=>`<th>${hh(state.times[i])}</th>`).join("")}</tr>`;
  const rows = u.map(r => `<tr><th class="mname">${esc(r.m.name)} <small>${esc(r.m.org)} · ${esc(r.m.res)}</small></th>${idxs.map(i => { const s=r.series[i]; return `<td class="${cls(s?.v)}" data-i="${i}" title="${esc(r.m.name)} ${hh(state.times[i])} Uhr: Wind ${fmt(s?.v)} m/s, Böe ${fmt(s?.g)} m/s">${s?num(s.v):"·"}</td>`; }).join("")}</tr>`).join("");
  const med = `<tr class="medrow"><th class="mname">Median <small>alle Modelle</small></th>${idxs.map(i => { const v=state.hours[i].med; return `<td class="${cls(v)}" data-i="${i}" style="font-weight:700">${v==null?"·":num(v)}</td>`; }).join("")}</tr>`;
  $("matrix").innerHTML = `<table>${head}${rows}${med}</table>`;
  $("matrix").querySelectorAll("td[data-i]").forEach(td => td.onclick = () => selectHour(+td.dataset.i));
  $("mxDay").textContent = dayLabel(state.day);
  highlightSel();
}

const HOUR_HEAD = `<thead><tr><th>Uhr</th><th>Wind</th><th>Spanne</th><th>Böe</th><th>Richtung</th><th title="Anzahl der Modelle mit Mittelwind oder Böe über euren Grenzwerten">Modelle über Grenze</th><th>Szenarien</th><th>Regen</th><th>CAPE</th><th>°C Arbeit</th><th>Gefühlt</th><th>Gründe</th></tr></thead>`;
function hourRows(hs, dots){
  return hs.map(h => `<tr>
    <td class="num">${dots?`<span class="dot d-${h.lamp}"></span> `:LAMP_TXT[h.lamp]+" "}${hh(h.t)}:00</td>
    <td class="num ${h.med>site.wind?"over":""}">${fmt(h.med)}</td>
    <td class="num">${fmt(h.min)}–${fmt(h.max)}</td>
    <td class="num ${h.gMed>site.gust?"over":""}">${fmt(h.gMed)}</td>
    <td class="num">${dirName(h.dir.mean)}</td>
    <td class="num">${h.n ? h.over+"/"+h.n : "–"}</td>
    <td class="num ${h.pEns>=ENS_WARN?"over":""}">${h.pEns==null ? "–" : Math.round(h.pEns*100)+" %"}</td>
    <td class="num">${fmt(h.rain)}</td>
    <td class="num">${h.cape==null?"–":Math.round(h.cape)}</td>
    <td class="num">${fmt(h.tW,0)}</td>
    <td class="num">${fmt(h.chill,0)}</td>
    <td class="why-cell">${esc(h.why.filter(w=>w.l!=="go").map(w=>w.t).join(" · ")) || "–"}</td></tr>`).join("");
}
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
