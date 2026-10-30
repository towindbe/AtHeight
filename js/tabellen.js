/* Windbericht · Modell-Matrix, Stundentabelle, Modelltabelle */
"use strict";

/* Modell-Matrix mit Umschalter: Wind, Böe, Regen, Feuchte oder Wolken je Modell und Stunde. Nur Anzeige, die Ampel bleibt unverändert.
   Regen: Klassen nach üblicher Einteilung (leicht bis 2,5 mm/h, mäßig bis 7,5, darüber stark); gelber Rand ab der Prüfschwelle der Ampel.
   Feuchte: relative Luftfeuchte in 2 m; ab 95 % ist mit Nebel oder nassen Oberflächen zu rechnen. Wolken: Gesamtbedeckung als Symbol. */
let mxMode = (() => { try{ return localStorage.getItem("wb_mx") || "wind"; }catch(e){ return "wind"; } })();
const RAIN_LIGHT = 2.5, RAIN_MOD = 7.5;
const RH_MID = 85, RH_HI = 95;
const rhCls = v => v==null ? "m-none" : v >= RH_HI ? "f-3" : v >= RH_MID ? "f-2" : v >= 60 ? "f-1" : "f-0";
// Bewölkung in Achteln wie im Wetterbericht: klar, heiter, wolkig, stark bewölkt, bedeckt; nachts Mond statt Sonne
function cloudSym(cc, dark){
  if(cc==null) return ["·", "keine Angabe"];
  const o = Math.round(cc/12.5);
  if(o <= 1) return [dark ? "🌙" : "☀️", "klar"];
  if(o <= 3) return [dark ? "🌙" : "🌤️", "heiter"];
  if(o <= 5) return [dark ? "☁️" : "⛅", "wolkig"];
  if(o <= 6) return [dark ? "☁️" : "🌥️", "stark bewölkt"];
  return ["☁️", "bedeckt"];
}
function renderMatrix(){
  const idxs = dayIdx().filter(i => isWork(state.times[i]));
  const rain = mxMode === "regen", feu = mxMode === "feuchte", wol = mxMode === "wolken", lim = mxMode === "boe" ? site.gust : site.wind;
  // gleiche Regel wie überall: rot erst ÜBER der Grenze, gelb ab 75 %; angezeigt mit einer Nachkommastelle
  const cls = v => v==null ? "m-none" : v > lim ? "m-stop" : v >= lim*.75 ? "m-warn" : "m-go";
  // knapp über der Grenze (gerundet gleich dem Grenzwert): zwei Nachkommastellen, damit Rot nachvollziehbar ist
  const num = v => { const d = U().d, r = x => Math.round(cw(x)*10**d)/10**d; return v > lim && r(v) <= r(lim) ? fw(v, d+1) : fw(v); };
  const rcls = v => v==null ? "m-none" : v >= RAIN_MOD ? "r-3" : v >= RAIN_LIGHT ? "r-2" : v >= 0.1 ? "r-1" : "r-0";
  const rtxt = (v, storm) => v==null ? "·" : (v < 0.05 ? "0" : fmt(v,1)) + (storm ? "⚡" : "");
  const u = usableModels().sort((a,b)=> (b.m.hi-a.m.hi));
  const head = `<tr><th></th>${idxs.map(i=>`<th>${hh(state.times[i])}</th>`).join("")}</tr>`;
  const rhTd = (v, i, tip, b) => `<td class="${rhCls(v)}${coatOn(state.day) && v!=null && v > coatRh() ? " r-w" : ""}" data-i="${i}" title="${tip}"${b ? ' style="font-weight:700"' : ""}>${v==null ? "·" : Math.round(v)}</td>`;
  const ccTd = (v, i, tip) => { const [sym, txt] = cloudSym(v, isDark(state.times[i]));
    return `<td class="cl" data-i="${i}" title="${tip}: ${txt}${v==null ? "" : " (" + Math.round(v) + " %)"}" style="--cc:${v==null ? 0 : (v/100).toFixed(2)}">${sym}</td>`; };
  const cellOf = (s, i, r) => {
    if(feu) return rhTd(s?.rh, i, `${esc(r.m.name)} ${hh(state.times[i])} Uhr: Luftfeuchte ${s?.rh==null ? "–" : Math.round(s.rh)+" %"}`);
    if(wol) return ccTd(s?.cc, i, `${esc(r.m.name)} ${hh(state.times[i])} Uhr`);
    if(rain) return `<td class="${rcls(s?.rain)}${s?.rain!=null && s.rain >= RAIN_WARN ? " r-w" : ""}" data-i="${i}" title="${esc(r.m.name)} ${hh(state.times[i])} Uhr: Regen ${s?.rain==null ? "–" : fmt(s.rain,1)} mm/h${s?.wc>=95 ? ", Gewittersignal" : ""}">${rtxt(s?.rain, s?.wc>=95)}</td>`;
    const v = mxMode === "boe" ? s?.g : s?.v;
    return `<td class="${cls(v)}" data-i="${i}" title="${esc(r.m.name)} ${hh(state.times[i])} Uhr: Wind ${fwu(s?.v)}, Böe ${fwu(s?.g)}">${v!=null ? num(v) : "·"}</td>`;
  };
  const rows = u.map(r => `<tr><th class="mname">${esc(r.m.name)} <small>${esc(r.m.org)} · ${esc(r.m.res)}</small></th>${idxs.map(i => cellOf(r.series[i], i, r)).join("")}</tr>`).join("");
  const med = `<tr class="medrow"><th class="mname">Median <small>alle Modelle</small></th>${idxs.map(i => { const h = state.hours[i];
    if(feu) return rhTd(h.rh, i, `Median ${hh(state.times[i])} Uhr: Luftfeuchte ${h.rh==null ? "–" : Math.round(h.rh)+" %"}`, true);
    if(wol) return ccTd(h.cc, i, `Median ${hh(state.times[i])} Uhr`);
    if(rain) return `<td class="${rcls(h.rain)}${h.rain!=null && h.rain >= RAIN_WARN ? " r-w" : ""}" data-i="${i}" style="font-weight:700">${rtxt(h.rain, h.storms > 0)}</td>`;
    const v = mxMode === "boe" ? h.gMed : h.med; return `<td class="${cls(v)}" data-i="${i}" style="font-weight:700">${v==null?"·":num(v)}</td>`; }).join("")}</tr>`;
  $("matrix").innerHTML = `<table>${head}${rows}${med}</table>`;
  $("matrix").querySelectorAll("td[data-i]").forEach(td => td.onclick = () => selectHour(+td.dataset.i));
  $("mxDay").textContent = dayLabel(state.day);
  $("mxNote").hidden = rain || feu || wol;
  $("mxNote").innerHTML = mxMode === "boe" ? `Böe je Modell und Stunde in <span class="wu">${WU()}</span>. Gelb ab 75 % des Grenzwerts für die Böe, rot darüber. Zeigt, ob nur ein Ausreißer warnt oder fast alle.`
    : `Wind je Modell und Stunde in <span class="wu">${WU()}</span>. Gelb ab 75 % des Grenzwerts, rot über dem Grenzwert. Mit der Maus über ein Feld fahren zeigt auch die Böe. Zeigt, ob nur ein Ausreißer warnt oder fast alle.`;
  $("mxLegend").hidden = !(rain || feu || wol);
  $("mxLegend").textContent = feu ? `Relative Luftfeuchte in % (2 m über Boden). Grün ab 60 %, kräftiger ab ${RH_MID} %, dunkel ab ${RH_HI} %: Nebel, Tau oder nasse Oberflächen wahrscheinlich.${coatOn(state.day) ? ` Gelber Rand: über ${coatRh()} % (Grenze Beschichten).` : ""} Nur Anzeige, die Ampel ändert sich dadurch nicht.`
    : wol ? `Bewölkung gesamt: ☀️ klar · 🌤️ heiter · ⛅ wolkig · 🌥️ stark bewölkt · ☁️ bedeckt, nachts 🌙 bei klarem Himmel. Je kräftiger das Grau hinter dem Symbol, desto dichter die Wolken. Mit der Maus über ein Feld fahren zeigt den Wert in %. Nur Anzeige.`
    : rain ? `Regen in mm/h. Hellblau: leicht (bis ${fmt(RAIN_LIGHT,1)}), mittelblau: mäßig (bis ${fmt(RAIN_MOD,1)}), dunkelblau: stark. Gelber Rand: ab ${fmt(RAIN_WARN,1)} mm/h (Prüfen in der Ampel). ⚡ Gewittersignal. Nur Anzeige, die Ampel ändert sich dadurch nicht.` : "";
  document.querySelectorAll("#mxSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === mxMode)));
  highlightSel();
}
document.querySelectorAll("#mxSeg button").forEach(b => b.onclick = () => { mxMode = b.dataset.m; try{ localStorage.setItem("wb_mx", mxMode); }catch(e){} renderMatrix(); });

/* Stundentabelle: eingefärbt wird nur, was eine Regel auslöst, mit denselben Schwellen wie Ampel, Matrix und Bericht.
   Gelb (c-warn): Prüfschwelle bzw. ab 75 % des Grenzwerts. Rot (c-stop): über Grenze. Kräftig gelb (c-wet): Taupunkt erreicht. */
function hourCells(h){
  const coat = coatOn(h.t.slice(0,10)), stopC = coat && site.coatStop;
  const lim = (v, l) => v==null ? "" : v > l ? "c-stop" : v >= l*.75 ? "c-warn" : "";
  const dew = h.dew==null ? "" : stopC && h.dew < coatDew() ? "c-stop" : h.dew <= 0 ? "c-wet" : h.dew <= DEW_INFO || (coat && h.dew < coatDew()) ? "c-warn" : "";
  return {
    wind:lim(h.med, site.wind), gust:lim(h.gMed, site.gust),
    span:h.max!=null && h.max > site.wind ? "c-warn" : "",
    over:!h.n || !h.over ? "" : h.over > h.n/2 ? "c-stop" : "c-warn",
    ens:h.pEns==null ? "" : h.pEns >= ENS_WARN ? "c-stop" : h.pEns >= ENS_INFO ? "c-warn" : "",
    rain:h.rain!=null && h.rain >= RAIN_WARN ? "c-warn" : "",
    cape:h.cape==null ? "" : h.cape >= CAPE_STOP ? "c-stop" : h.cape >= CAPE_WARN ? "c-warn" : "",
    temp:h.tW!=null && h.tW < minTemp() ? "c-stop" : "",
    rh:coat && h.rh!=null && h.rh > coatRh() ? (stopC ? "c-stop" : "c-warn") : "",
    dew};
}
function hourRows(hs, dots){
  return hs.map(h => { const c = hourCells(h); return `<tr>
    <td class="num">${dots?`<span class="dot d-${h.lamp}"></span> `:LAMP_TXT[h.lamp]+" "}${hh(h.t)}:00</td>
    <td class="num ${c.wind}">${fw(h.med)}</td>
    <td class="num ${c.span}">${fw(h.min)}–${fw(h.max)}</td>
    <td class="num ${c.gust}">${fw(h.gMed)}</td>
    <td class="num">${dirName(h.dir.mean)}</td>
    <td class="num ${c.over}">${h.n ? h.over+"/"+h.n : "–"}</td>
    <td class="num ${c.ens}">${riskTen(h.pEns)}</td>
    <td class="num ${c.rain}">${fmt(h.rain)}</td>
    <td class="num ${c.cape}">${h.cape==null?"–":Math.round(h.cape)}</td>
    <td class="num ${c.temp}">${fmt(h.tW,0)}</td>
    <td class="num">${fmt(h.chill,0)}</td>
    <td class="num ${c.rh}">${h.rh==null ? "–" : Math.round(h.rh)}</td>
    <td class="num ${c.dew}" title="${h.dew==null ? "" : h.dew <= 0 ? "Taupunkt erreicht: Nebel oder Wolke in Arbeitshöhe, alles nass" : h.dew <= DEW_INFO ? "Kondenswasser möglich" : ""}">${h.dew==null ? "–" : h.dew <= 0 ? "Tau" : fmt(h.dew,1)}</td>
    <td class="why-cell">${esc(h.why.filter(w=>w.l!=="go").map(w=>shortWhy(w.t)).join(" · ")) || "–"}</td></tr>`; }).join("");
}

const HOUR_HEAD = `<thead><tr><th>Uhr</th><th>Wind <span class="wu">m/s</span></th><th>Spanne</th><th>Böe</th><th>Richtung</th><th title="Anzahl der Modelle mit Wind oder Böe über euren Grenzwerten">Modelle über Grenze</th><th title="Anteil der Szenarien, in denen Wind oder Böe über Grenze liegen">Zu windig</th><th>Regen</th><th>CAPE</th><th>°C Arbeit</th><th>Gefühlt</th><th title="Relative Luftfeuchte in 2 m">Feuchte %</th><th title="Taupunktabstand: wie weit die Temperatur in Arbeitshöhe über dem Taupunkt (2 m) liegt; Tau = Taupunkt erreicht">Taupunktabstand K</th><th>Gründe</th></tr></thead>`;
function renderHourTable(){ $("hourTable").innerHTML = HOUR_HEAD + "<tbody>" + hourRows(dayHours(state.day), true) + "</tbody>"; $("hourDay").textContent = dayLabel(state.day); }

function renderModelTable(){
  $("modelDay").textContent = dayLabel(state.day);
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
    const lv = can ? r.series.find(Boolean)?.lv : null, zs = lv ? lv.map(l => l[0]) : [], top = zs.length ? Math.max(...zs) : null;
    const status = !off && r.status==="extrap" && top!=null ? `Hochgerechnet ab ${top} m` : txt;
    const heights = zs.length ? `<br><small class="muted">Daten: ${zs.join(", ")} m</small>` : "";
    const cp = can ? cellPos(r) : null;
    const lage = !cp ? "–" : cp.far ? `abweichend (${fmt(cp.dist,1)} km ${cp.dir})` : cp.edge ? `Rand (${cp.dir})` : "Mitte";
    return `<tr class="${off ? "excl" : ""}"><td class="use">${can ? `<input type="checkbox" data-model="${esc(r.m.id)}" ${off ? "" : "checked"} aria-label="${esc(r.m.name)} (${esc(r.m.org)}) verwenden">` : ""}</td>
      <td>${esc(r.m.name)} <span class="muted">· ${esc(r.m.org)}</span></td><td>${esc(r.m.res)}</td>
      <td class="${cp && (cp.edge || cp.far) ? "cell-edge" : ""}" title="${cp ? `Standort liegt ${fmt(cp.dist,1)} km von der Mitte der Modellzelle (Zellgröße ${fmt(cp.res,1)} km) entfernt` : ""}">${lage}</td>
      <td><span class="badge ${cls}" title="${esc(r.status==="extrap" ? "Das Modell liefert keine Winddaten bis zur Arbeitshöhe. Der Wind darüber ist aus den höchsten gelieferten Höhen hochgerechnet." : r.reason||"")}">${status}</span>${heights}</td><td class="num">${mx}</td><td class="num">${first}</td>
      <td class="num raw"><a href="${esc(apiUrl(r.m))}" target="_blank" rel="noopener" title="Rohdaten dieses Modells direkt von Open-Meteo">JSON</a> · <a href="${esc(apiUrl(r.m,"csv"))}" target="_blank" rel="noopener" title="Als CSV, z. B. für Excel">CSV</a></td></tr>`;
  });
  $("modelTable").innerHTML = `<thead><tr><th title="Häkchen: Modell geht in die Bewertung ein">Nutzen</th><th>Modell</th><th>Auflösung</th><th title="Lage des Standorts in der Gitterzelle des Modells">Lage in der Zelle</th><th>Status</th><th>Max. Wind</th><th>Über Grenze ab</th><th class="raw">Rohdaten</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  $("modelTable").querySelectorAll("input[data-model]").forEach(c => c.onchange = () => setModelUsed(c.dataset.model, c.checked));
  renderRanking();
}
