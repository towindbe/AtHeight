/* AtHeight · Modell-Matrix, Stundentabelle, Modelltabelle */
"use strict";

/* Modell-Matrix mit Umschalter: Wind, Böe, Regen, Feuchte oder Wolken je Modell und Stunde. Nur Anzeige, die Ampel bleibt unverändert.
   Regen: Klassen nach üblicher Einteilung (leicht bis 2,5 mm/h, mäßig bis 7,5, darüber stark); gelber Rand ab der Prüfschwelle der Ampel.
   Feuchte: relative Luftfeuchte in 2 m; ab 95 % ist mit Nebel oder nassen Oberflächen zu rechnen. Wolken: Gesamtbedeckung als Symbol. */
let mxMode = (() => { try{ return localStorage.getItem("wb_mx") || "wind"; }catch(e){ return "wind"; } })();
const RAIN_LIGHT = 2.5, RAIN_MOD = 7.5;
const RH_MID = 85, RH_HI = 95;
const rhCls = v => v==null ? "m-none" : v >= RH_HI ? "f-3" : v >= RH_MID ? "f-2" : v >= 60 ? "f-1" : "f-0";
// Bewölkung in Achteln wie im Wetterbericht: klar, heiter, wolkig, stark bewölkt, bedeckt; nachts Mond statt Sonne (Linien-Symbole, Farbe = Textfarbe)
function cloudSym(cc, dark){
  if(cc==null) return ["·", T("keine Angabe", "no data"), ""];
  const o = Math.round(cc/12.5);
  if(o <= 1) return [icon(dark ? "moon" : "sun", 22), T("klar", "clear"), dark ? "cl-moon" : "cl-sun"];
  if(o <= 3) return [icon(dark ? "moonfew" : "sunfew", 22), T("heiter", "mostly sunny"), dark ? "cl-moonc" : "cl-sunc"];
  if(o <= 5) return dark ? [icon("cloud", 22), T("wolkig", "partly cloudy"), "cl-cloud"] : [icon("cloudsun", 22), T("wolkig", "partly cloudy"), "cl-sunc"];
  if(o <= 6) return [icon("cloud", 22), T("stark bewölkt", "mostly cloudy"), "cl-cloud"];
  return [icon("clouds", 22), T("bedeckt", "overcast"), "cl-cloud"];
}
function renderMatrix(){
  const idxs = dayIdx().filter(i => isWork(state.times[i]));
  const rain = mxMode === "regen", feu = mxMode === "feuchte", wol = mxMode === "wolken", lim = mxMode === "boe" ? site.gust : site.wind;
  // gleiche Regel wie überall: rot erst ÜBER der Grenze, gelb ab 75 %; angezeigt mit einer Nachkommastelle
  const cls = v => v==null ? "m-none" : v > lim ? "m-stop" : v >= lim*.75 ? "m-warn" : "m-go";
  // knapp über der Grenze (gerundet gleich dem Grenzwert): zwei Nachkommastellen, damit Rot nachvollziehbar ist
  const num = v => { const d = U().d, r = x => Math.round(cw(x)*10**d)/10**d; return v > lim && r(v) <= r(lim) ? fw(v, d+1) : fw(v); };
  const rcls = v => v==null ? "m-none" : v >= RAIN_MOD ? "r-3" : v >= RAIN_LIGHT ? "r-2" : v >= 0.1 ? "r-1" : "r-0";
  const rtxt = (v, storm) => v==null ? "·" : (v < 0.05 ? "0" : fmt(v,1)) + (storm ? " " + icon("bolt", 14) : "");
  const u = usableModels().sort((a,b)=> (b.m.hi-a.m.hi));
  const head = `<tr><th></th>${idxs.map(i=>`<th>${hh(state.times[i])}</th>`).join("")}</tr>`;
  const rhTd = (v, i, tip, b) => `<td class="${rhCls(v)}${coatOn(state.day) && v!=null && v > coatRh() ? " r-w" : ""}" data-i="${i}" title="${tip}"${b ? ' style="font-weight:700"' : ""}>${v==null ? "·" : Math.round(v)}</td>`;
  const ccTd = (v, i, tip) => { const [sym, txt, kind] = cloudSym(v, isDark(state.times[i]));
    return `<td class="cl ${kind}" data-i="${i}" title="${tip}: ${txt}${v==null ? "" : " (" + Math.round(v) + " %)"}" style="--cc:${v==null ? 0 : (v/100).toFixed(2)}">${sym}</td>`; };
  const cellOf = (s, i, r) => {
    if(feu) return rhTd(s?.rh, i, `${esc(r.m.name)} ${hh(state.times[i])}${UHR()}: ${T("Luftfeuchte", "humidity")} ${s?.rh==null ? "–" : Math.round(s.rh)+" %"}`);
    if(wol) return ccTd(s?.cc, i, `${esc(r.m.name)} ${hh(state.times[i])}${UHR()}`);
    if(rain) return `<td class="${rcls(s?.rain)}${s?.rain!=null && s.rain >= RAIN_WARN ? " r-w" : ""}" data-i="${i}" title="${esc(r.m.name)} ${hh(state.times[i])}${UHR()}: ${T("Regen", "rain")} ${s?.rain==null ? "–" : fmt(s.rain,1)} mm/h${s?.wc>=95 ? T(", Gewittersignal", ", thunderstorm signal") : ""}">${rtxt(s?.rain, s?.wc>=95)}</td>`;
    const v = mxMode === "boe" ? s?.g : s?.v;
    return `<td class="${cls(v)}" data-i="${i}" title="${esc(r.m.name)} ${hh(state.times[i])}${UHR()}: Wind ${fwu(s?.v)}, ${T("Böe", "gust")} ${fwu(s?.g)}">${v!=null ? num(v) : "·"}</td>`;
  };
  const rows = u.map(r => `<tr><th class="mname">${esc(r.m.name)} <small>${esc(r.m.org)} · ${esc(r.m.res)}</small></th>${idxs.map(i => cellOf(r.series[i], i, r)).join("")}</tr>`).join("");
  const med = `<tr class="medrow"><th class="mname">Median <small>${T("alle Modelle", "all models")}</small></th>${idxs.map(i => { const h = state.hours[i];
    if(feu) return rhTd(h.rh, i, `Median ${hh(state.times[i])}${UHR()}: ${T("Luftfeuchte", "humidity")} ${h.rh==null ? "–" : Math.round(h.rh)+" %"}`, true);
    if(wol) return ccTd(h.cc, i, `Median ${hh(state.times[i])}${UHR()}`);
    if(rain) return `<td class="${rcls(h.rain)}${h.rain!=null && h.rain >= RAIN_WARN ? " r-w" : ""}" data-i="${i}" style="font-weight:700">${rtxt(h.rain, h.storms > 0)}</td>`;
    const v = mxMode === "boe" ? h.gMed : h.med; return `<td class="${cls(v)}" data-i="${i}" style="font-weight:700">${v==null?"·":num(v)}</td>`; }).join("")}</tr>`;
  $("matrix").innerHTML = `<table>${head}${rows}${med}</table>`;
  $("matrix").querySelectorAll("td[data-i]").forEach(td => td.onclick = () => selectHour(+td.dataset.i));
  $("mxDay").textContent = dayLabel(state.day);
  $("mxNote").hidden = rain || feu || wol;
  $("mxNote").innerHTML = mxMode === "boe" ? T(`Böe je Modell und Stunde in <span class="wu">${WU()}</span>. Gelb ab 75 % des Grenzwerts für die Böe, rot darüber. Zeigt, ob nur ein Ausreißer warnt oder fast alle.`, `Gust per model and hour in <span class="wu">${WU()}</span>. Yellow from 75 % of the gust limit, red above. Shows whether only one outlier warns or almost all.`)
    : T(`Wind je Modell und Stunde in <span class="wu">${WU()}</span>. Gelb ab 75 % des Grenzwerts, rot über dem Grenzwert. Mit der Maus über ein Feld fahren zeigt auch die Böe. Zeigt, ob nur ein Ausreißer warnt oder fast alle.`, `Wind per model and hour in <span class="wu">${WU()}</span>. Yellow from 75 % of the limit, red above the limit. Hovering over a cell also shows the gust. Shows whether only one outlier warns or almost all.`);
  $("mxLegend").hidden = !(rain || feu || wol);
  $("mxLegend").innerHTML = feu ? T(`Relative Luftfeuchte in % (2 m über Boden). Grün ab 60 %, kräftiger ab ${RH_MID} %, dunkel ab ${RH_HI} %: Nebel, Tau oder nasse Oberflächen wahrscheinlich.${coatOn(state.day) ? ` Gelber Rand: über ${coatRh()} % (Grenze Beschichten).` : ""} Nur Anzeige, die Ampel ändert sich dadurch nicht.`, `Relative humidity in % (2 m above ground). Green from 60 %, stronger from ${RH_MID} %, dark from ${RH_HI} %: fog, dew or wet surfaces likely.${coatOn(state.day) ? ` Yellow border: above ${coatRh()} % (coating limit).` : ""} Display only, the traffic light does not change.`)
    : wol ? T(`Bewölkung gesamt: ${icon("sun",16)} klar · ${icon("sunfew",16)} heiter · ${icon("cloudsun",16)} wolkig · ${icon("cloud",16)} stark bewölkt · ${icon("clouds",16)} bedeckt, nachts ${icon("moon",16)} bei klarem Himmel. Je kräftiger das Grau hinter dem Symbol, desto dichter die Wolken. Mit der Maus über ein Feld fahren zeigt den Wert in %. Nur Anzeige.`, `Total cloud cover: ${icon("sun",16)} clear · ${icon("sunfew",16)} mostly sunny · ${icon("cloudsun",16)} partly cloudy · ${icon("cloud",16)} mostly cloudy · ${icon("clouds",16)} overcast, at night ${icon("moon",16)} for a clear sky. The stronger the grey behind the symbol, the denser the clouds. Hovering over a cell shows the value in %. Display only.`)
    : rain ? T(`Regen in mm/h. Hellblau: leicht (bis ${fmt(RAIN_LIGHT,1)}), mittelblau: mäßig (bis ${fmt(RAIN_MOD,1)}), dunkelblau: stark. Gelber Rand: ab ${fmt(RAIN_WARN,1)} mm/h (Prüfen in der Ampel). ${icon("bolt",14)} Gewittersignal. Nur Anzeige, die Ampel ändert sich dadurch nicht.`, `Rain in mm/h. Light blue: light (up to ${fmt(RAIN_LIGHT,1)}), mid blue: moderate (up to ${fmt(RAIN_MOD,1)}), dark blue: heavy. Yellow border: from ${fmt(RAIN_WARN,1)} mm/h (check in the traffic light). ${icon("bolt",14)} thunderstorm signal. Display only, the traffic light does not change.`) : "";
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
    <td class="num ${c.dew}" title="${h.dew==null ? "" : h.dew <= 0 ? T("Taupunkt erreicht: Nebel oder Wolke in Arbeitshöhe, alles nass", "Dew point reached: fog or cloud at working height, everything wet") : h.dew <= DEW_INFO ? T("Kondenswasser möglich", "Condensation possible") : ""}">${h.dew==null ? "–" : h.dew <= 0 ? T("Tau", "Dew") : fmt(h.dew,1)}</td>
    ${whyCell(h.why.filter(w=>w.l!=="go").map(w=>shortWhy(w.t)).join(" · "))}</tr>`; }).join("");
}

const HOUR_HEAD = () => `<thead><tr><th>${T("Uhr", "Time")}</th><th>Wind <span class="wu">${WU()}</span></th><th>${T("Spanne", "Spread")}</th><th>${T("Böe", "Gust")}</th><th>${T("Richtung", "Direction")}</th><th title="${T("Anzahl der Modelle mit Wind oder Böe über euren Grenzwerten", "Number of models with wind or gust above your limits")}">${T("Modelle über Grenze", "Models above limit")}</th><th title="${T("Anteil der Szenarien, in denen Wind oder Böe über Grenze liegen", "Share of scenarios with wind or gust above the limit")}">${T("Zu windig", "Too windy")}</th><th>${T("Regen", "Rain")}</th><th>CAPE</th><th>${T("°C Arbeit", "°C work")}</th><th>${T("Gefühlt", "Feels like")}</th><th title="${T("Relative Luftfeuchte in 2 m", "Relative humidity at 2 m")}">${T("Feuchte %", "Humidity %")}</th><th title="${T("Taupunktabstand: wie weit die Temperatur in Arbeitshöhe über dem Taupunkt (2 m) liegt; Tau = Taupunkt erreicht", "Dew point spread: how far the temperature at working height is above the dew point (2 m); Dew = dew point reached")}">${T("Taupunktabstand °C", "Dew pt spread °C")}</th><th>${T("Gründe", "Reasons")}</th></tr></thead>`;
function renderHourTable(){ $("hourTable").innerHTML = HOUR_HEAD() + "<tbody>" + hourRows(dayHours(state.day), true) + "</tbody>"; $("hourDay").textContent = dayLabel(state.day); }
/* Gründe einzeilig (sonst werden die Zeilen bei viel Text sehr hoch); Antippen klappt den ganzen Text auf */
const whyCell = t => `<td class="why-cell" title="${esc(t)}"><span>${esc(t) || "–"}</span></td>`;
$("hourTable").addEventListener("click", e => { const c = e.target.closest("td.why-cell"); if(c) c.classList.toggle("open"); });

function renderModelTable(){
  $("modelDay").textContent = dayLabel(state.day);
  const idxs = dayIdx().filter(i => isWork(state.times[i]));
  const label = {ok:[T("Aktiv","Active"),"b-ok"], extrap:[T("Hochgerechnet","Extrapolated"),"b-ext"], outside:[T("Deckt Standort nicht ab","Does not cover site"),"b-out"], error:[T("Nicht abrufbar","Unavailable"),"b-err"]};
  const order = {ok:0, extrap:1, outside:2, error:3};
  const rows = [...state.results].sort((a,b)=> order[a.status]-order[b.status] || (b.m.hi-a.m.hi)).map(r => {
    const can = r.status==="ok" || r.status==="extrap", off = can && isExcluded(r);
    const [txt, cls] = off ? [T("Ausgeschlossen","Excluded"),"b-out"] : label[r.status];
    let mx="–", first="–";
    if(r.series){
      const pts = idxs.map(i=>r.series[i] ? {t:state.times[i], ...r.series[i]} : null).filter(Boolean);
      if(pts.length){ mx = fmt(Math.max(...pts.map(p=>p.v))); const f = pts.find(p=>p.v>site.wind || (p.g!=null && p.g>site.gust)); first = f ? hh(f.t)+UHR() : T("nie", "never"); }
    }
    const lv = can ? r.series.find(Boolean)?.lv : null, zs = lv ? lv.map(l => l[0]) : [], top = zs.length ? Math.max(...zs) : null;
    const status = !off && r.status==="extrap" && top!=null ? `${T("Hochgerechnet ab", "Extrapolated from")} ${top} m` : txt;
    const heights = zs.length ? `<br><small class="muted">${T("Daten", "Data")}: ${zs.join(", ")} m</small>` : "";
    const cp = can ? cellPos(r) : null;
    const lage = !cp ? "–" : cp.far ? `${T("abweichend", "offset")} (${fmt(cp.dist,1)} km ${cp.dir})` : cp.edge ? `${T("Rand", "edge")} (${cp.dir})` : T("Mitte", "centre");
    return `<tr class="${off ? "excl" : ""}"><td class="use">${can ? `<input type="checkbox" data-model="${esc(r.m.id)}" ${off ? "" : "checked"} aria-label="${esc(r.m.name)} (${esc(r.m.org)}) ${T("verwenden", "use")}">` : ""}</td>
      <td>${esc(r.m.name)} <span class="muted">· ${esc(r.m.org)}</span></td><td>${esc(r.m.res)}</td>
      <td class="${cp && (cp.edge || cp.far) ? "cell-edge" : ""}" title="${cp ? T(`Standort liegt ${fmt(cp.dist,1)} km von der Mitte der Modellzelle (Zellgröße ${fmt(cp.res,1)} km) entfernt`, `Site is ${fmt(cp.dist,1)} km from the centre of the model cell (cell size ${fmt(cp.res,1)} km)`) : ""}">${lage}</td>
      <td><span class="badge ${cls}" title="${esc(r.status==="extrap" ? T("Das Modell liefert keine Winddaten bis zur Arbeitshöhe. Der Wind darüber ist aus den höchsten gelieferten Höhen hochgerechnet.", "The model provides no wind data up to working height. The wind above is extrapolated from the highest heights provided.") : r.reason||"")}">${status}</span>${heights}</td><td class="num">${mx}</td><td class="num">${first}</td>
      <td class="num raw"><a href="${esc(apiUrl(r.m, null, true))}" target="_blank" rel="noopener" title="${T("Rohdaten dieses Modells direkt von Open-Meteo", "Raw data of this model directly from Open-Meteo")}">JSON</a> · <a href="${esc(apiUrl(r.m, "csv", true))}" target="_blank" rel="noopener" title="${T("Als CSV, z. B. für Excel", "As CSV, e.g. for Excel")}">CSV</a></td></tr>`;
  });
  $("modelTable").innerHTML = `<thead><tr><th title="${T("Häkchen: Modell geht in die Bewertung ein", "Tick: model is included in the assessment")}">${T("Nutzen", "Use")}</th><th>${T("Modell", "Model")}</th><th>${T("Auflösung", "Resolution")}</th><th title="${T("Lage des Standorts in der Gitterzelle des Modells", "Position of the site in the model grid cell")}">${T("Lage in der Zelle", "Position in cell")}</th><th>Status</th><th>Max. Wind</th><th>${T("Über Grenze ab", "Above limit from")}</th><th class="raw">${T("Rohdaten", "Raw data")}</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  $("modelTable").querySelectorAll("input[data-model]").forEach(c => c.onchange = () => setModelUsed(c.dataset.model, c.checked));
  renderRanking();
}
