/* Windbericht · Windverlauf, Regen & Gewitter, Höhenprofil, Windrichtung, Zeitmarker */
"use strict";

// Farbkästchen im Infofenster mit der Linienfarbe füllen (Linien haben nur eine Strichfarbe)
if(typeof Chart !== "undefined") Chart.defaults.plugins.tooltip.callbacks.labelColor = ctx => {
  const c = ctx.dataset.borderColor && ctx.dataset.borderColor !== "transparent" ? ctx.dataset.borderColor : ctx.dataset.backgroundColor;
  return {borderColor:c, backgroundColor:c};
};

/* Schmale Bildschirme: Der Wertekasten (Tooltip) verdeckt dort die Linien. Stattdessen stehen die Werte der gewählten Stunde als Zeile über dem Diagramm. */
const isNarrow = () => matchMedia("(max-width: 700px)").matches;
function narrowReadout(opt, id){
  const el = $(id); if(!el) return;
  const on = isNarrow(); el.hidden = !on;
  if(!on) return;
  opt.plugins.tooltip.enabled = false;
  el.style.minHeight = ""; el.dataset.mh = "0";
  opt.plugins.tooltip.external = ({tooltip:t}) => {
    if(!t.dataPoints?.length) return;   // alten Inhalt stehen lassen, sonst springt das Diagramm
    el.innerHTML = `<b>${esc((t.title||[]).join(" "))} Uhr</b>` + t.body.map((b, i) => `<span title="${esc(b.lines.join(" "))}"><i style="background:${t.labelColors[i]?.backgroundColor}"></i>${esc(b.lines.join(" "))}</span>`).join("");
    // Höhe nur wachsen lassen: so springt die Zeile beim Wischen nicht, wenn sich Zahlen oder Anzahl der Einträge ändern
    const mh = Math.max(+el.dataset.mh || 0, el.offsetHeight); el.dataset.mh = mh; el.style.minHeight = mh + "px";
  };
}
matchMedia("(max-width: 700px)").addEventListener?.("change", () => { if(state.hours.length){ renderChart(); renderRain(); renderTemp(); } });

/* Plugin: Arbeitszeit hinterlegen + gewählte Stunde markieren */
const markPlugin = {id:"marks", beforeDatasetsDraw(c){
  if(!c.$idxs) return;
  const {ctx, chartArea:a, scales:{x}} = c; ctx.save();
  ctx.beginPath(); ctx.rect(a.left, a.top, a.right-a.left, a.bottom-a.top); ctx.clip();   // nicht über die Achsenbeschriftung malen
  const step = x.getPixelForValue(1)-x.getPixelForValue(0);
  c.$idxs.forEach((gi,k) => {
    if(!isWork(state.times[gi])){ ctx.fillStyle = css("--raised"); ctx.fillRect(x.getPixelForValue(k)-step/2, a.top, step, a.bottom-a.top); }
  });
  ctx.restore();
}, daylightDraw(c){
  // Tageslicht: gelblicher Balken von Dämmerungsbeginn bis -ende mit Sonnensymbol
  if(!c.$idxs?.length) return;
  const dl = daylight(state.times[c.$idxs[0]].slice(0,10)); if(!dl.start || !dl.end) return;
  const {ctx, chartArea:a, scales:{x}} = c, step = x.getPixelForValue(1) - x.getPixelForValue(0);
  const h0 = hourOf(state.times[c.$idxs[0]]), toH = t => +t.slice(0,2) + +t.slice(3,5)/60;
  const xs = Math.max(a.left, x.getPixelForValue(0) + (toH(dl.start) - h0)*step), xe = Math.min(a.right, x.getPixelForValue(0) + (toH(dl.end) - h0)*step);
  if(xe <= xs) return;
  // eigener Streifen unterhalb der Zeichenfläche (Platz über ticks.padding), überdeckt keine Daten
  const y = a.bottom + 8, sun = "#f2b632";
  ctx.save();
  ctx.strokeStyle = sun; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(xs, y); ctx.lineTo(xe, y); ctx.stroke();
  // kleine Sonne in der Mitte, mit Hintergrund freigestellt
  const cx = (xs + xe)/2;
  ctx.fillStyle = css("--surface"); ctx.beginPath(); ctx.arc(cx, y, 7.5, 0, 2*Math.PI); ctx.fill();
  ctx.fillStyle = sun; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(cx, y, 2.8, 0, 2*Math.PI); ctx.fill();
  for(let k = 0; k < 8; k++){ const w = k*Math.PI/4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(w)*4.4, y + Math.sin(w)*4.4); ctx.lineTo(cx + Math.cos(w)*6.4, y + Math.sin(w)*6.4); ctx.stroke(); }
  // Uhrzeiten links und rechts neben dem Balken
  ctx.font = "600 9.5px " + css("--f-mono"); ctx.textBaseline = "middle";
  ctx.textAlign = "right"; ctx.fillText(dl.start, xs - 5, y + 0.5);
  ctx.textAlign = "left"; ctx.fillText(dl.end, xe + 5, y + 0.5);
  ctx.restore();
}, afterDatasetsDraw(c){
  markPlugin.daylightDraw(c);   // vor dem Infofenster zeichnen, damit es obenauf liegt
  // Verschiebbarer Zeitmarker: Linie mit Griff und Uhrzeit
  if(!c.$idxs) return;
  const sk = c.$idxs.indexOf(state.sel); if(sk < 0) return;
  const {ctx, chartArea:a, scales:{x}} = c, px = x.getPixelForValue(sk), acc = css("--accent");
  ctx.save();
  ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
  const label = hh(state.times[state.sel]) + " Uhr";
  ctx.font = "600 11px " + css("--f-body"); const w = ctx.measureText(label).width + 14, h = 18;
  const bx = Math.min(Math.max(px - w/2, a.left), a.right - w);
  ctx.fillStyle = acc; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, a.top, w, h, 9) : ctx.rect(bx, a.top, w, h); ctx.fill();
  ctx.fillStyle = css("--accent-ink"); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, bx + w/2, a.top + h/2 + 0.5);
  ctx.restore();
}};
/* Beschriftung der Grenzlinien rechts am Rand */
const limitLabels = {id:"limitLabels", afterDatasetsDraw(c){
  const {ctx, chartArea:a, scales:{y}} = c;
  const items = [["lim", site.wind, `Grenze Wind ${fwu(site.wind)}`], ["glim", site.gust, `Grenze Böe ${fwu(site.gust)}`]]
    .filter(([k]) => !state.hide.has(k)).map(([, v, t]) => [v, t])
    .map(([v, t]) => ({t, py:y.getPixelForValue(cw(v))})).filter(o => o.py >= a.top && o.py <= a.bottom).sort((p,q) => p.py-q.py);
  // liegen die Linien dicht beieinander, Beschriftungen auseinanderziehen
  for(let k = 1; k < items.length; k++) if(items[k].py - items[k-1].py < 13) items[k].py = items[k-1].py + 13;
  ctx.save(); ctx.font = "600 10.5px " + css("--f-body"); ctx.textAlign = "right"; ctx.textBaseline = "bottom";
  items.forEach(o => {
    const w = ctx.measureText(o.t).width;
    // oben ist der Griff des Zeitmarkers: dort die Beschriftung unter die Linie setzen
    const top = o.py - 14 < a.top + 20 ? o.py + 2 : o.py - 14;
    ctx.fillStyle = css("--surface"); ctx.globalAlpha = .75; ctx.fillRect(a.right - w - 8, top, w + 6, 13); ctx.globalAlpha = 1;
    ctx.fillStyle = css("--stop"); ctx.fillText(o.t, a.right - 5, top + 12);
  });
  ctx.restore();
}};
/* Zeitmarker mit Maus oder Finger ziehen (waagrecht); senkrechtes Wischen scrollt weiter die Seite */
function attachScrub(canvasId, chartKey){
  const cv = $(canvasId); if(!cv) return;
  let drag = false;
  cv.style.touchAction = "pan-y"; cv.style.cursor = "ew-resize";
  const pick = e => {
    const c = charts[chartKey]; if(!c || !c.$idxs) return;
    const r = cv.getBoundingClientRect(), v = c.scales.x.getValueForPixel(e.clientX - r.left);
    const k = Math.max(0, Math.min(c.$idxs.length - 1, Math.round(v))), gi = c.$idxs[k];
    if(gi!=null && gi!==state.sel) selectHour(gi);
  };
  cv.addEventListener("pointerdown", e => { drag = true; try{ cv.setPointerCapture(e.pointerId); }catch(err){} pick(e); });
  cv.addEventListener("pointermove", e => { if(drag) pick(e); });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(t => cv.addEventListener(t, () => { drag = false; }));
}

function renderChart(){
  if(typeof Chart==="undefined"){ $("chartTitle").textContent = "Wind (Diagramm nicht geladen)"; return; }
  renderNightBtns();
  const idxs = chartIdx(), labels = idxs.map(i => hh(state.times[i]));
  const H = idxs.map(i=>state.hours[i]), r2 = v => v==null?null:+cw(v).toFixed(2);
  const fg = css("--fg"), stop = css("--stop");
  let ds = [];
  const hid = k => state.hide.has(k);
  if(!hid("band")){
    ds.push({label:"Minimum", data:H.map(h=>r2(h.min)), borderColor:"transparent", pointRadius:0, fill:false, tension:.3});
    ds.push({label:"Maximum", data:H.map(h=>r2(h.max)), borderColor:css("--band-line"), borderWidth:.8, backgroundColor:css("--band"), pointRadius:0, fill:"-1", tension:.3});
  }
  usableModels().filter(r => state.show.has(r.m.id)).forEach(r => ds.push({label:r.m.name+" · "+r.m.org, data:idxs.map(i => r.series[i] ? r2(r.series[i].v) : null),
    borderColor:modelColor(r.m), borderWidth:1.8, borderDash:r.m.hi?[]:[5,3], pointRadius:0, tension:.3, spanGaps:true}));
  if(!hid("median")) ds.push({label:"Median", data:H.map(h=>r2(h.med)), borderColor:fg, borderWidth:3, pointRadius:0, tension:.3});
  if(!hid("gust")) ds.push({label:"Böe (gesch.)", data:H.map(h=>r2(h.gMed)), borderColor:css("--gust"), backgroundColor:css("--gust"), borderWidth:1.8, borderDash:[2,3], pointRadius:0, tension:.3});
  if(!hid("lim")) ds.push({label:"Grenzwert", data:idxs.map(()=>cw(site.wind)), borderColor:stop, borderWidth:1.6, borderDash:[7,4], pointRadius:0});
  if(!hid("glim")) ds.push({label:"Grenze Böe", data:idxs.map(()=>cw(site.gust)), borderColor:stop, borderWidth:1, borderDash:[2,4], pointRadius:0});
  const opt = chartBase(WU()+" · "+zoneTxt()); opt.scales.x.ticks.padding = 18;   // Platz für den Tageslicht-Streifen
  opt.plugins.tooltip = {filter: it => !["Minimum","Grenzwert","Grenze Böe"].includes(it.dataset.label), callbacks:{label:c => `${c.dataset.label}: ${fmt(c.parsed.y, U().d)} ${WU()}`}}; narrowReadout(opt, "roMain");
  if(charts.main) charts.main.destroy();
  charts.main = new Chart($("chart"), {type:"line", data:{labels, datasets:ds}, options:opt, plugins:[markPlugin, limitLabels]});
  charts.main.$idxs = idxs; charts.main.update("none"); if(isNarrow()) syncTooltip(charts.main);
  $("chartTitle").textContent = "Windverlauf · " + zoneTxt();
  renderChips(); renderLegend();
}
/* Legende unter dem Windverlauf: Antippen blendet Median, Spanne, Böe und Grenzlinien ein/aus (nur Anzeige) */
function renderLegend(){
  document.querySelectorAll("#chartLegend button").forEach(b => b.setAttribute("aria-pressed", String(!state.hide.has(b.dataset.s))));
}
function toggleLine(s){
  state.hide.has(s) ? state.hide.delete(s) : state.hide.add(s);
  try{ localStorage.setItem("wb_hide", JSON.stringify([...state.hide])); }catch(e){}
  s.startsWith("t_") ? renderTemp() : renderChart();
}
/* „Nachtstunden ausblenden“: gilt für Wind, Regen und Temperatur gemeinsam (nur Anzeige) */
function renderNightBtns(){ document.querySelectorAll(".night-btn").forEach(b => b.setAttribute("aria-pressed", String(state.nightOff))); }
function toggleNight(){
  state.nightOff = !state.nightOff;
  try{ localStorage.setItem("wb_night", state.nightOff ? "1" : "0"); }catch(e){}
  renderChart(); renderRain(); renderTemp();
}
const modelColor = m => COLORS[MODELS.indexOf(m) % COLORS.length];
/* Modell-Chips unter dem Windverlauf: einzelne Modelle ein- und ausblenden (ändert die Bewertung nicht) */
function renderChips(note){
  const u = usableModels().sort((a,b) => (b.m.hi-a.m.hi));
  $("modelChips").innerHTML = u.map(r => { const on = state.show.has(r.m.id);
    return `<button type="button" class="mchip ${on?"on":""}" style="--c:${modelColor(r.m)}" data-id="${r.m.id}" aria-pressed="${on}" title="${esc(r.m.org)} · ${esc(r.m.res)}${r.m.hi?"":" (gestrichelt)"}"><i></i>${esc(r.m.name)}${r.m.name==="HARMONIE" ? ` <small>${esc(r.m.org)}</small>` : ""}</button>`; }).join("");
  $("modelChips").querySelectorAll(".mchip").forEach(b => b.onclick = () => { const id = b.dataset.id; state.show.has(id) ? state.show.delete(id) : state.show.add(id); setShown(state.show); });
  $("chipNote").textContent = note || "Nur Anzeige: Ampel und Median nutzen weiter alle aktiven Modelle.";
  const n = u.filter(r => state.show.has(r.m.id)).length;
  $("mCount").textContent = n ? `· ${n} eingeblendet` : "";
}
function setShown(ids, note){
  state.show = new Set(ids);
  try{ localStorage.setItem("wb_show", JSON.stringify([...state.show])); }catch(e){}
  renderChart(); if(note) renderChips(note);
}
let wantBest = false;
function showQuick(q){
  const u = usableModels();
  if(q==="all") return setShown(u.map(r => r.m.id));
  if(q==="none") return setShown([]);
  if(q==="hi") return setShown(u.filter(r => r.m.hi).map(r => r.m.id), u.some(r => r.m.hi) ? null : "Für diesen Standort liefert kein hochauflösendes Modell Daten.");
  // am besten bewertet: aus dem Modellvergleich dieser Anlage
  const rk = rankGroups();
  if(!rk){ wantBest = true; renderChips("Noch kein Modellvergleich für diese Anlage: wird jetzt berechnet (unten bei „Welche Modelle treffen hier?“) …"); computeRanking(); return; }
  if(rk.narrow) return setShown(u.filter(r => r.m.hi).map(r => r.m.id), "Laut Modellvergleich treffen hier alle Modelle etwa gleich gut. Eingeblendet: die hochauflösenden.");
  const ids = rk.good.filter(id => u.some(r => r.m.id===id));
  setShown(ids, `Am besten bewertet laut Modellvergleich (${ids.length}). Nur Anzeige, Ampel und Median nutzen weiter alle aktiven Modelle.`);
}

// Regenbalken: je mehr Modelle Regen vorhersagen (ab 0,1 mm), desto kräftiger die Farbe
function rainColor(h){
  const hex = css("--band-line").replace("#",""), [r,g,b] = [0,2,4].map(k => parseInt(hex.slice(k,k+2),16));
  const share = h.rainN ? h.rainYes/h.rainN : 0;
  return `rgba(${r},${g},${b},${(0.2 + 0.8*share).toFixed(2)})`;
}
function renderRain(){
  if(typeof Chart==="undefined") return;
  const idxs = chartIdx(), labels = idxs.map(i => hh(state.times[i])), H = idxs.map(i=>state.hours[i]);
  const opt = chartBase("mm/h"); opt.scales.x.ticks.padding = 18;   // Platz für den Tageslicht-Streifen
  opt.scales.x.ticks.autoSkip = true; opt.scales.x.ticks.maxTicksLimit = 12;
  opt.scales.y.suggestedMax = 2;
  opt.scales.y2 = {position:"right", beginAtZero:true, suggestedMax:1000, grid:{display:false}, ticks:{color:css("--muted"), font:{family:"Barlow", size:10}}, title:{display:true, text:"CAPE J/kg", color:css("--muted")}};
  opt.plugins.tooltip = {callbacks:{label:c => c.dataset.yAxisID==="y2" ? `CAPE: ${Math.round(c.parsed.y)} J/kg`
    : `Regen: ${fmt(c.parsed.y)} mm` + (H[c.dataIndex]?.rainN ? ` · ${H[c.dataIndex].rainYes} von ${H[c.dataIndex].rainN} Modellen` : "")}}; narrowReadout(opt, "roRain");
  if(charts.rain) charts.rain.destroy();
  charts.rain = new Chart($("rain"), {data:{labels, datasets:[
    {type:"bar", label:"Regen", data:H.map(h=>h.rain==null?null:+h.rain.toFixed(2)), backgroundColor:H.map(h => rainColor(h)), borderColor:css("--band-line"), borderRadius:2},
    {type:"line", label:"CAPE", yAxisID:"y2", data:H.map(h=>h.cape==null?null:Math.round(h.cape)), borderColor:css("--warn"), borderWidth:2, pointRadius:0, tension:.3},
  ]}, options:opt, plugins:[markPlugin]});
  charts.rain.$idxs = idxs; charts.rain.update("none"); if(isNarrow()) syncTooltip(charts.rain);
  $("rainDay").textContent = dayLabel(state.day);
}

/* Temperatur-Diagramm: nur die Feuchte-Grenze fürs Beschichten als Linie (im Beschichten-Modus).
   Kondenswasser steht nicht mehr als Fläche im Diagramm, sondern in der Taupunkt-Zeile darunter (eine Zelle je Arbeitsstunde). */
const DEW_COLOR = "#b48ee6", RH_COLOR = "#3a9a9a";
const coatLimitPlugin = {id:"coatLimit", afterDatasetsDraw(c){
  const {ctx, chartArea:a, scales:{y2}} = c;
  if(!coatOn(state.day) || state.hide.has("t_rh") || !y2) return;
  const py = y2.getPixelForValue(coatRh()), t = `Grenze Feuchte ${coatRh()} %`, lc = site.coatStop ? css("--stop") : css("--warn");
  ctx.save(); ctx.strokeStyle = lc; ctx.lineWidth = 1.2; ctx.setLineDash([6,4]);
  ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = "600 10.5px " + css("--f-body"); ctx.textAlign = "right"; ctx.textBaseline = "bottom";
  const w = ctx.measureText(t).width; ctx.fillStyle = css("--surface"); ctx.globalAlpha = .75; ctx.fillRect(a.right - w - 8, py - 14, w + 6, 13); ctx.globalAlpha = 1;
  ctx.fillStyle = lc; ctx.fillText(t, a.right - 5, py - 2);
  ctx.restore();
}};
// Text unter dem Temperatur-Diagramm: sagt, was ausgeblendet ist (ausgeblendet bleibt gespeichert)
function tempNote(){
  const off = [["t_feel","Gefühlt"],["t_dew","Taupunkt"],["t_rh","Luftfeuchte"]].filter(([k]) => state.hide.has(k)).map(([,t]) => t);
  return (off.length ? `Ausgeblendet: ${off.join(", ")} (in der Legende antippen zum Einblenden). ` : "Antippen in der Legende blendet Linien aus. ")
    + "Taupunkt und Luftfeuchte gelten für 2 m über Boden.";
}
/* Taupunkt-Zeile: je Arbeitsstunde der Abstand der Temperatur in Arbeitshöhe zum Taupunkt (2 m).
   „Tau“ = Taupunkt erreicht. Im Beschichten-Modus zusätzlich die Luftfeuchte, Farben nach euren Grenzen. */
function renderDewRow(){
  const hs = dayHours(state.day), coat = coatOn(state.day), stopC = coat && site.coatStop, k = v => fmt(v, v%1 ? 1 : 0);
  if(!hs.some(h => h.dew!=null)){ $("dewRow").innerHTML = ""; $("dewRowNote").textContent = "Für diesen Tag liegen keine Werte zum Taupunkt vor."; return; }
  const over = coat ? (h => h.dew < coatDew()) : (h => h.dew <= DEW_INFO);
  const dCls = h => h.dew==null ? "m-none" : stopC && coatViol(h) ? "m-stop" : h.dew <= 0 ? "d-wet" : over(h) ? "d-near" : "d-ok";
  const rCls = h => h.rh==null ? "m-none" : h.rh > coatRh() ? (stopC ? "m-stop" : "d-near") : "d-ok";
  const td = (h, cls, txt, tip) => `<td class="${cls}" data-i="${h.i}" title="${esc(tip)}">${txt}</td>`;
  const row = (name, cell) => `<tr><th class="mname">${name}</th>${hs.map(cell).join("")}</tr>`;
  let rows = row(`Abstand Taupunkt <small>K</small>`, h => td(h, dCls(h), h.dew==null ? "·" : h.dew <= 0 ? "Tau" : fmt(h.dew,1),
    h.dew==null ? "" : `${hh(h.t)} Uhr: ${fmt(h.tW,1)} °C in ${workH()} m, Taupunkt (2 m) ${fmt(h.td,1)} °C: ${h.dew <= 0 ? "Taupunkt erreicht" : fmt(h.dew,1) + " K Abstand"}`));
  if(coat) rows += row(`Luftfeuchte <small>%</small>`, h => td(h, rCls(h), h.rh==null ? "·" : Math.round(h.rh), `${hh(h.t)} Uhr: Luftfeuchte ${h.rh==null ? "–" : Math.round(h.rh) + " %"} (Grenze ${coatRh()} %)`));
  $("dewRow").innerHTML = `<table><tr><th></th>${hs.map(h => `<th>${hh(h.t)}</th>`).join("")}</tr>${rows}</table>`;
  $("dewRow").querySelectorAll("td[data-i]").forEach(c => c.onclick = () => selectHour(+c.dataset.i));
  $("dewRowNote").textContent = coat
    ? `Beschichten-Modus: mind. ${k(coatDew())} K Abstand und höchstens ${coatRh()} % Feuchte. ${stopC ? "Rot: Grenze überschritten, Ampel STOP." : "Gelb: Grenze überschritten (Hinweis)."} „Tau“: Taupunkt erreicht, Nebel oder Wolke in Arbeitshöhe, alles nass.`
    : `Zahl: Abstand der Temperatur in Arbeitshöhe zum Taupunkt in K. „Tau“ (gelb): Taupunkt erreicht, Nebel oder Wolke in Arbeitshöhe, Stahl und Seile nass. Hellgelb: bis ${k(DEW_INFO)} K, Kondenswasser möglich. Darüber rechnet die Prognose nicht mit Kondenswasser; Oberflächen können trotzdem kälter sein.`;
}
function renderTemp(){
  if(typeof Chart==="undefined") return;
  const idxs = chartIdx(), labels = idxs.map(i => hh(state.times[i])), H = idxs.map(i=>state.hours[i]);
  const r1 = v => v==null ? null : +v.toFixed(1);
  const hid = k => state.hide.has(k);
  const vals = H.flatMap(h => [h.tW, hid("t_feel") ? null : h.chill, hid("t_dew") ? null : h.td]).filter(v => v!=null), lo = vals.length ? Math.min(...vals) : 0;
  const opt = chartBase("°C"); opt.scales.x.ticks.padding = 18;   // Platz für den Tageslicht-Streifen
  opt.scales.y.beginAtZero = false;
  // Luftfeuchte auf eigener Achse rechts (0–100 %), nur Anzeige
  opt.scales.y2 = {display:!hid("t_rh"), position:"right", min:0, max:100, grid:{display:false}, ticks:{color:css("--muted"), font:{family:"Barlow", size:10}, stepSize:25}, title:{display:true, text:"Feuchte %", color:css("--muted")}};
  opt.plugins.tooltip = {filter: it => !it.dataset.ref, callbacks:{label:c => c.dataset.yAxisID==="y2" ? `Luftfeuchte: ${Math.round(c.parsed.y)} %`
    : c.dataset.dew ? `${c.dataset.label}: ${fmt(c.parsed.y)} °C` + (H[c.dataIndex]?.dew==null ? "" : H[c.dataIndex].dew <= 0 ? " · Taupunkt erreicht" : ` · Abstand ${fmt(H[c.dataIndex].dew,1)} K`)
    : `${c.dataset.label}: ${fmt(c.parsed.y)} °C`}}; narrowReadout(opt, "roTemp");
  const ds = [
    {label:"Temperatur "+workH()+" m", data:H.map(h => r1(h.tW)), borderColor:css("--accent"), borderWidth:2.5, pointRadius:0, tension:0},
    hid("t_feel") ? null : {label:"Gefühlt", data:H.map(h => r1(h.chill)), borderColor:css("--band-line"), borderWidth:2, borderDash:[5,4], pointRadius:0, tension:0},
    hid("t_dew") ? null : {label:"Taupunkt (2 m)", dew:true, data:H.map(h => r1(h.td)), borderColor:DEW_COLOR, borderWidth:2.2, borderDash:[3,3], pointRadius:0, tension:0},
    hid("t_rh") ? null : {label:"Luftfeuchte", yAxisID:"y2", data:H.map(h => h.rh==null ? null : Math.round(h.rh)), borderColor:RH_COLOR, backgroundColor:"rgba(58,154,154,.10)", fill:"origin", borderWidth:1.5, pointRadius:0, tension:0}
  ].filter(Boolean);
  // Bezugslinien nur, wenn sie in die Nähe kommen: 0 °C (Frost), −10 °C (Kälteschutz)
  if(lo < 6) ds.push({label:"0 °C", ref:true, data:idxs.map(() => 0), borderColor:css("--muted"), borderWidth:1, borderDash:[2,3], pointRadius:0});
  if(lo < -5) ds.push({label:"−10 °C", ref:true, data:idxs.map(() => CHILL_INFO), borderColor:css("--band-line"), borderWidth:1, borderDash:[2,3], pointRadius:0});
  if(charts.temp) charts.temp.destroy();
  charts.temp = new Chart($("temp"), {type:"line", data:{labels, datasets:ds}, options:opt, plugins:[markPlugin, coatLimitPlugin]});
  charts.temp.$idxs = idxs; charts.temp.update("none"); if(isNarrow()) syncTooltip(charts.temp);
  $("tempTitle").textContent = "Temperatur · " + workH() + " m & Feuchte";
  $("tempDay").textContent = dayLabel(state.day);
  $("tempNote").textContent = tempNote();
  renderDewRow();
  document.querySelectorAll("#tempLegend button").forEach(b => b.setAttribute("aria-pressed", String(!hid(b.dataset.s))));
}

function renderProfile(){
  if(typeof Chart==="undefined") return;
  const i = state.sel, h = state.hours[i]; if(!h) return;
  $("profileNote").textContent = isWind() ? "Wind vom Boden bis über die Blattspitze zur gewählten Stunde." : "Wind vom Boden bis über die Arbeitshöhe zur gewählten Stunde.";
  const tip = site.hub + site.rotor/2, zs = [];
  for(let z=10; z<=Math.max(200, tip+10); z+=10) zs.push(z);
  const per = usableModels().map(r => r.series[i]).filter(Boolean);
  const prof = zs.map(z => { const v = per.map(s => windAt(s.lv, z).v).filter(x=>x!=null); return {z, med:median(v), min:v.length?Math.min(...v):null, max:v.length?Math.max(...v):null}; });
  const P = (k) => prof.map(p => p[k]==null?null:{x:+cw(p[k]).toFixed(2), y:p.z});
  const opt = chartBase("");
  opt.scales.x = {type:"linear", beginAtZero:true, ticks:{color:css("--muted"), font:{family:"Barlow", size:10}}, grid:{color:css("--line")}, title:{display:true, text:WU(), color:css("--muted")}};
  opt.scales.y = {type:"linear", min:0, max:zs[zs.length-1], ticks:{color:css("--muted"), font:{family:"Barlow", size:10}, stepSize:40}, grid:{color:css("--line")}, title:{display:true, text:"Höhe über Grund (m)", color:css("--muted")}};
  opt.interaction = {mode:"nearest", intersect:false, axis:"y"};
  opt.plugins.tooltip = {callbacks:{label:c => `${c.dataset.label}: ${fmt(c.parsed.x, U().d)} ${WU()} in ${c.parsed.y} m`}};
  const lowTip = Math.max(0, site.hub - site.rotor/2);
  const refPlugin = {id:"ref", beforeDatasetsDraw(c){
    // hinter den Linien: Rotorfläche und Band der Modellspanne (Fläche zwischen Minimum und Maximum je Höhe)
    const {ctx, chartArea:a, scales:{x,y}} = c; ctx.save();
    ctx.beginPath(); ctx.rect(a.left, a.top, a.right-a.left, a.bottom-a.top); ctx.clip();
    ctx.fillStyle = css("--raised"); ctx.fillRect(a.left, y.getPixelForValue(tip), a.right-a.left, y.getPixelForValue(lowTip)-y.getPixelForValue(tip));
    const pts = prof.filter(p => p.min!=null && p.max!=null);
    if(pts.length > 1){
      ctx.beginPath();
      pts.forEach((p,k) => ctx[k ? "lineTo" : "moveTo"](x.getPixelForValue(cw(p.max)), y.getPixelForValue(p.z)));
      [...pts].reverse().forEach(p => ctx.lineTo(x.getPixelForValue(cw(p.min)), y.getPixelForValue(p.z)));
      ctx.closePath(); ctx.fillStyle = css("--band"); ctx.fill();
    }
    ctx.restore();
  }, afterDatasetsDraw(c){
    const {ctx, chartArea:a, scales:{x,y}} = c; ctx.save();
    ctx.strokeStyle = css("--accent"); ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(a.left, y.getPixelForValue(site.hub)); ctx.lineTo(a.right, y.getPixelForValue(site.hub)); ctx.stroke();
    ctx.strokeStyle = css("--stop"); ctx.beginPath(); ctx.moveTo(x.getPixelForValue(cw(site.wind)), a.top); ctx.lineTo(x.getPixelForValue(cw(site.wind)), a.bottom); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = css("--muted"); ctx.font = "10px Barlow";
    ctx.fillText((isWind() ? "Nabe " : "Arbeitshöhe ")+site.hub+" m", a.left+4, y.getPixelForValue(site.hub)-4);
    if(workH() !== site.hub){
      ctx.strokeStyle = css("--go"); ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(a.left, y.getPixelForValue(workH())); ctx.lineTo(a.right, y.getPixelForValue(workH())); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = css("--go"); ctx.fillText("Arbeit "+workH()+" m", a.left+4, y.getPixelForValue(workH())-4);
    }
    if(isWind()){ ctx.fillStyle = css("--muted"); ctx.fillText("Blattspitze "+Math.round(tip)+" m", a.left+4, y.getPixelForValue(tip)+12); }
    ctx.restore();
  }};
  if(charts.profile) charts.profile.destroy();
  charts.profile = new Chart($("profile"), {type:"line", data:{datasets:[
    {label:"Minimum", data:P("min"), borderColor:css("--band-line"), borderWidth:.8, pointRadius:0, fill:false},
    {label:"Maximum", data:P("max"), borderColor:css("--band-line"), borderWidth:.8, pointRadius:0, fill:false},
    {label:"Median", data:P("med"), borderColor:css("--fg"), borderWidth:3, pointRadius:0}
  ]}, options:opt, plugins:[refPlugin]});
  $("profileHour").textContent = `${dayLabel(state.times[i].slice(0,10),true)} · ${hh(state.times[i])} Uhr`;
}

function renderCompass(){
  const i = state.sel, h = state.hours[i]; if(!h) return;
  const dirs = usableModels().map(r => r.series[i]).filter(s => s && s.dir!=null);
  const fg = "var(--fg)", muted = "var(--muted)";
  const ticks = Array.from({length:36},(_,k)=>{ const a=k*10*Math.PI/180, r1=k%9===0?78:84; return `<line x1="${100+r1*Math.sin(a)}" y1="${100-r1*Math.cos(a)}" x2="${100+90*Math.sin(a)}" y2="${100-90*Math.cos(a)}" stroke="${muted}" stroke-width="${k%9===0?1.5:.6}"/>`; }).join("");
  const lab = [["N",0],["O",90],["S",180],["W",270]].map(([t,d]) => { const a=d*Math.PI/180; return `<text x="${100+66*Math.sin(a)}" y="${104-66*Math.cos(a)}" text-anchor="middle" font-size="13" font-weight="600" font-family="Barlow Condensed, sans-serif" fill="${fg}">${t}</text>`; }).join("");
  // Striche: Wind kommt aus Richtung d -> Strich vom Rand zur Mitte
  const lines = dirs.map(s => { const a=s.dir*Math.PI/180; return `<line x1="${100+88*Math.sin(a)}" y1="${100-88*Math.cos(a)}" x2="${100+48*Math.sin(a)}" y2="${100-48*Math.cos(a)}" stroke="var(--band-line)" stroke-width="2" stroke-linecap="round" opacity=".75"/>`; }).join("");
  const calm = h.med!=null && h.med < DIR_CALM;   // Schwachwind: Richtung wechselt, Pfeil nur blass
  let arrow = "";
  if(h.dir.mean!=null){
    arrow = `<g transform="rotate(${h.dir.mean} 100 100)"${calm?' opacity=".4"':""}><line x1="100" y1="14" x2="100" y2="150" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/><polygon points="100,170 88,146 112,146" fill="var(--accent)"/></g>`;
  }
  $("compass").innerHTML = `<svg viewBox="0 0 200 200" role="img" aria-label="Windrichtung ${dirName(h.dir.mean)}"><circle cx="100" cy="100" r="90" fill="var(--raised)" stroke="var(--line)"/>${ticks}${lines}${lab}${arrow}<circle cx="100" cy="100" r="5" fill="${fg}"/></svg>`;
  const sp = h.dir.spread;
  $("compassFacts").innerHTML = `
    <dt>Wind aus</dt><dd>${h.dir.mean==null?"–":dirName(h.dir.mean)+" · "+Math.round(h.dir.mean)+"°"}</dd>
    <dt>Weht nach</dt><dd>${h.dir.mean==null?"–":dirName((h.dir.mean+180)%360)}</dd>
    <dt>Streuung</dt><dd>${calm ? `<span class="dir-calm">schwacher Wind, Richtung wechselnd</span>` : sp==null?"–":"±"+Math.round(sp)+"° "+(sp<20?"(einig)":sp<45?"(mäßig)":"(unsicher)")}</dd>
    <dt>Stärke</dt><dd>${fwu(h.med)} · Böe ${fw(h.gMed)}</dd>
    <dt>Modelle</dt><dd>${dirs.length}</dd>`;
  $("compassHour").textContent = `${dayLabel(state.times[i].slice(0,10),true)} · ${hh(state.times[i])} Uhr`;
  renderDirStrip();
}

/* Richtung je Arbeitsstunde als Pfeilreihe, dazu Lee-Seite und Winddrehung */
const DIR_TURN = 45;      // ab dieser Drehung (Grad) Hinweis
const DIR_CALM = 2;       // darunter (m/s) zählt die Richtung für die Drehung nicht und wird blass gezeigt
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
function renderDirStrip(){
  const hs = dayHours(state.day);
  if(!hs.length){ $("dirStrip").innerHTML = ""; $("dirTurn").innerHTML = ""; return; }
  $("dirStrip").innerHTML = hs.map(h => {
    const d = h.dir.mean;
    const arrow = d==null ? `<span class="dir-na">–</span>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(${(d+180)%360} 12 12)"><line x1="12" y1="20" x2="12" y2="7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><polygon points="12,2 6.5,10 17.5,10" fill="currentColor"/></g></svg>`;
    return `<button type="button" class="dir-cell d-${h.lamp} ${h.i===state.sel?"sel":""} ${h.med!=null && h.med < DIR_CALM ? "calm" : ""}" data-i="${h.i}" title="${hh(h.t)} Uhr: aus ${dirName(d)}${d==null?"":" ("+Math.round(d)+"°)"}, ${fwu(h.med)}">${arrow}<span>${hh(h.t)}</span></button>`;
  }).join("");
  $("dirStrip").querySelectorAll(".dir-cell").forEach(b => b.onclick = () => selectHour(+b.dataset.i));
  // Lee-Seite zur gewählten Stunde
  const cur = state.hours[state.sel], lee = cur && cur.dir.mean!=null ? dirName((cur.dir.mean+180)%360) : null;
  // größte Drehung zwischen zwei Arbeitsstunden mit Wind
  const ws = hs.filter(h => h.dir.mean!=null && h.med!=null && h.med >= DIR_CALM);
  let best = null;
  for(let a = 0; a < ws.length; a++) for(let b = a+1; b < ws.length; b++){
    const x = angDiff(ws[a].dir.mean, ws[b].dir.mean);
    if(!best || x > best.x) best = {x, a:ws[a], b:ws[b]};
  }
  const turn = !best || best.x < DIR_TURN
    ? `<span class="dir-ok">Richtung bleibt stabil${best ? ` (max. ${Math.round(best.x)}°)` : ""}</span>`
    : `<span class="dir-warn">Wind dreht um ca. ${Math.round(best.x)}°: ${hh(best.a.t)} Uhr aus ${dirName(best.a.dir.mean)}, ${hh(best.b.t)} Uhr aus ${dirName(best.b.dir.mean)}. Lee-Seite wechselt.</span>`;
  $("dirTurn").innerHTML = `<span><b>Lee-Seite</b> ${hh(cur.t)} Uhr: ${lee ?? "–"}</span>${turn}`;
}
