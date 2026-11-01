/* AtHeight · Windverlauf, Regen & Gewitter, Höhenprofil, Windrichtung, Zeitmarker */
"use strict";

// Farbkästchen im Infofenster mit der Linienfarbe füllen (Linien haben nur eine Strichfarbe)
if(typeof Chart !== "undefined") Chart.defaults.plugins.tooltip.callbacks.labelColor = ctx => {
  const c = ctx.dataset.borderColor && ctx.dataset.borderColor !== "transparent" ? ctx.dataset.borderColor : ctx.dataset.backgroundColor;
  return {borderColor:c, backgroundColor:c};
};

/* Werte der gewählten Stunde als Zeile über dem Diagramm statt Wertekasten (Tooltip): der verdeckt sonst die Linien.
   Am Handy zweispaltig, am PC so viele Spalten, wie Platz ist. */
const isNarrow = () => matchMedia("(max-width: 700px)").matches;
function narrowReadout(opt, id){
  const el = $(id); if(!el) return;
  el.hidden = false;
  opt.plugins.tooltip.enabled = false;
  el.style.minHeight = ""; el.dataset.mh = "0";
  opt.plugins.tooltip.external = ({tooltip:t}) => {
    if(!t.dataPoints?.length) return;   // alten Inhalt stehen lassen, sonst springt das Diagramm
    el.innerHTML = `<b>${esc((t.title||[]).join(" "))}${UHR()}</b>` + t.body.map((b, i) => `<span title="${esc(b.lines.join(" "))}"><i style="background:${t.labelColors[i]?.backgroundColor}"></i>${esc(b.lines.join(" "))}</span>`).join("");
    // Höhe nur wachsen lassen: so springt die Zeile beim Wischen nicht, wenn sich Zahlen oder Anzahl der Einträge ändern
    // höchstens bis zur Maximalhöhe (Vollbild quer: darüber wird in der Zeile gescrollt)
    const cap = parseFloat(getComputedStyle(el).maxHeight) || Infinity;
    const mh = Math.min(cap, Math.max(+el.dataset.mh || 0, el.offsetHeight)); el.dataset.mh = mh; el.style.minHeight = mh + "px";
  };
}
matchMedia("(max-width: 700px)").addEventListener?.("change", () => { if(state.hours.length){ renderChart(); renderRain(); renderTemp(); } });

// Titel im Wertekasten: Tag und Uhrzeit (mehrere Tage im Bild)
function csTipTitle(items){ const c = items[0]?.chart, gi = c?.$idxs?.[items[0].dataIndex]; return gi==null ? "" : `${dayLabel(state.times[gi].slice(0,10), true)}, ${hh(state.times[gi])}`; }

/* Plugin: Arbeitszeit hinterlegen + gewählte Stunde markieren */
const markPlugin = {id:"marks", beforeDatasetsDraw(c){
  if(!c.$idxs) return;
  const {ctx, chartArea:a, scales:{x}} = c; ctx.save();
  ctx.beginPath(); ctx.rect(a.left, a.top, a.right-a.left, a.bottom-a.top); ctx.clip();   // nicht über die Achsenbeschriftung malen
  const step = x.getPixelForValue(1)-x.getPixelForValue(0);
  c.$idxs.forEach((gi,k) => {
    if(!isWork(state.times[gi])){ ctx.fillStyle = css("--raised"); ctx.fillRect(x.getPixelForValue(k)-step/2, a.top, step, a.bottom-a.top); }
  });
  // ausgeblendete Nacht: schraffierter Streifen zwischen letzter Abend- und erster Morgenstunde
  nightCuts(c.$idxs).forEach(k => {
    const x0 = x.getPixelForValue(k-1), x1 = x.getPixelForValue(k), w = x1 - x0;
    ctx.fillStyle = css("--raised"); ctx.fillRect(x0, a.top, w, a.bottom - a.top);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, a.top, w, a.bottom - a.top); ctx.clip();
    ctx.strokeStyle = css("--muted"); ctx.globalAlpha = .45; ctx.lineWidth = 1;
    for(let y = a.top - w; y < a.bottom + w; y += 6){ ctx.beginPath(); ctx.moveTo(x0, y + w); ctx.lineTo(x1, y); ctx.stroke(); }
    ctx.restore();
  });
  // Tageswechsel: senkrechte Linie
  ctx.strokeStyle = css("--muted"); ctx.lineWidth = 1; ctx.globalAlpha = .6;
  dayRuns(c.$idxs).slice(1).forEach(([k0]) => { const px = x.getPixelForValue(k0) - step/2; ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke(); });
  ctx.restore();
}, daylightDraw(c){
  // Tageslicht: je Tag ein gelblicher Balken von Dämmerungsbeginn bis -ende mit Sonnensymbol
  if(!c.$idxs?.length) return;
  const {ctx, chartArea:a, scales:{x}} = c, step = x.getPixelForValue(1) - x.getPixelForValue(0);
  const toH = t => +t.slice(0,2) + +t.slice(3,5)/60, y = a.bottom + 8, sun = "#f2b632";
  let lastR = -Infinity;   // rechter Rand der zuletzt geschriebenen Uhrzeit: aneinanderstoßende Uhrzeiten (Nacht ausgeblendet) nicht übereinander schreiben
  ctx.save();
  dayRuns(c.$idxs).forEach(([k0, , d]) => {
    const dl = daylight(d); if(!dl.start || !dl.end) return;
    const h0 = hourOf(state.times[c.$idxs[k0]]), p0 = x.getPixelForValue(k0);
    const xs = Math.max(a.left, p0 + (toH(dl.start) - h0)*step), xe = Math.min(a.right, p0 + (toH(dl.end) - h0)*step);
    if(xe <= xs) return;
    // eigener Streifen unterhalb der Zeichenfläche (Platz über ticks.padding), überdeckt keine Daten
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
    const ws = ctx.measureText(dl.start).width, we = ctx.measureText(dl.end).width;
    if(xs - 5 - ws > lastR + 4){ ctx.textAlign = "right"; ctx.fillText(dl.start, xs - 5, y + 0.5); }
    ctx.textAlign = "left"; ctx.fillText(dl.end, xe + 5, y + 0.5); lastR = xe + 5 + we;
  });
  ctx.restore();
}, dayNames(c){
  // Tagesname unten links in jedem Tag; beim Scrollen bleibt er am linken Rand stehen, bis der Tag vorbei ist
  const {ctx, chartArea:a, scales:{x}} = c, step = x.getPixelForValue(1) - x.getPixelForValue(0), [vl, vr] = csVis(c);
  ctx.save(); ctx.font = "600 10px " + css("--f-body"); ctx.textBaseline = "bottom"; ctx.textAlign = "left";
  dayRuns(c.$idxs).forEach(([k0, k1, d]) => {
    const t = dayLabel(d, true), w = ctx.measureText(t).width + 8;
    const lx = Math.min(Math.max(x.getPixelForValue(k0) - step/2, vl) + 3, x.getPixelForValue(k1) + step/2 - w - 3);
    if(lx + w < vl || lx > vr) return;
    ctx.fillStyle = css("--surface"); ctx.globalAlpha = .85; ctx.fillRect(lx, a.bottom - 17, w, 15); ctx.globalAlpha = 1;
    ctx.fillStyle = d === state.day ? css("--fg") : css("--muted"); ctx.fillText(t, lx + 4, a.bottom - 4);
  });
  ctx.restore();
}, afterDatasetsDraw(c){
  markPlugin.daylightDraw(c);   // vor dem Infofenster zeichnen, damit es obenauf liegt
  if(!c.$idxs) return;
  markPlugin.dayNames(c);
  csPlaceMark(c);   // oranger Zeiger: eigenes Element fest in der Mitte (Fadenkreuz), wird nicht in die Zeichenfläche gemalt
}};
/* Beschriftung der Grenzlinien rechts am sichtbaren Rand */
const limitLabels = {id:"limitLabels", afterDatasetsDraw(c){
  const {ctx, chartArea:ca, scales:{y}} = c, a = {top:ca.top, bottom:ca.bottom, right:csVis(c)[1]};
  const items = [[site.wind, `${T("Grenze Wind", "Wind limit")} ${fwu(site.wind)}`], [site.gust, `${T("Grenze Böe", "Gust limit")} ${fwu(site.gust)}`]]
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
/* Antippen (Finger) oder Klicken (Maus) wählt eine Stunde und holt sie unter den Zeiger.
   Wischen mit dem Finger scrollt (seitlich die Diagramme, senkrecht die Seite); mit der Maus verschiebt Ziehen den Ausschnitt. */
function attachScrub(canvasId, chartKey){
  const cv = $(canvasId); if(!cv) return;
  let p = null;
  cv.style.touchAction = "pan-x pan-y"; cv.style.cursor = "grab";
  const pick = e => {
    const c = charts[chartKey]; if(!c || !c.$idxs) return;
    const r = cv.getBoundingClientRect(), v = c.scales.x.getValueForPixel(e.clientX - r.left);
    const gi = c.$idxs[Math.max(0, Math.min(c.$idxs.length - 1, Math.round(v)))];
    if(gi != null) selectHour(gi);
  };
  cv.addEventListener("pointerdown", e => {
    p = {x:e.clientX, y:e.clientY, mouse:e.pointerType === "mouse", sl:charts[chartKey]?.$sc?.scrollLeft, moved:false};
    if(p.mouse) try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  });
  cv.addEventListener("pointermove", e => {
    if(!p?.mouse) return;
    const dx = e.clientX - p.x, sc = charts[chartKey]?.$sc; if(Math.abs(dx) > 3) p.moved = true;
    if(p.moved && sc){ sc.scrollLeft = p.sl - dx; cv.style.cursor = "grabbing"; }
  });
  cv.addEventListener("pointerup", e => { if(p && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) pick(e); p = null; cv.style.cursor = "grab"; });
  ["pointercancel", "lostpointercapture"].forEach(t => cv.addEventListener(t, () => { p = null; cv.style.cursor = "grab"; }));
}

/* ---------- Diagramme über alle Tage: Fadenkreuz ----------
   Wind, Regen und Temperatur zeigen alle Prognosetage nebeneinander, sichtbar ist etwa ein Tag. Der orange Zeiger steht fest
   in der Mitte, die Kurven laufen beim Wischen darunter durch. Die Stunde unter dem Zeiger ist die gewählte: Werte, Kompass,
   Profil, Karte und Tag zeigen immer genau diese eine Stunde. Die drei Diagramme und beide Arbeitsfenster-Leisten laufen
   gemeinsam; Antippen einer Stunde holt sie unter den Zeiger. Die Diagramme haben keinen leeren Rand: Am Anfang und Ende
   verlässt der Zeiger die Mitte und steht auf der gewählten Stunde; sobald gewischt wird, ist er wieder in der Mitte. */
const CS = {main:"chart", rain:"rain", temp:"temp"};   // Diagramm -> Canvas
const AX = 30, AX_NONE = 8, AX_TOP = 20;   // feste Breite der y-Achsen (px, schmal für das Handy; die Einheit steht einmal oben); rechts ohne Achse nur ein schmaler Rand
const fixAxis = s => { s.width = AX; };
const csR = {};   // Breite rechts je Diagramm
const csPad = c => AX + (csR[c.$key] ?? AX);   // links + rechts
let csCenter = null, csDataKey = "";   // Mitte als Stunde (Index in state.times mit Bruchteil; x,5 = Mitte der Stunde x)
/* Nacht ausgeblendet: dort springt die Zeit (z. B. 19 -> 06 Uhr). Linien und Flächen werden an dieser Stelle unterbrochen,
   sonst sähe es aus wie ein durchgehender Verlauf über Nacht. */
const nightCuts = idxs => idxs ? idxs.reduce((r, gi, k) => (k && gi - idxs[k-1] > 1 ? [...r, k] : r), []) : [];
const nightCut = ctx => { const ix = ctx.chart.$idxs; if(!ix) return false;
  for(let k = ctx.p0DataIndex + 1; k <= ctx.p1DataIndex; k++) if(ix[k] - ix[k-1] > 1) return true; return false; };
const NIGHT_GAP = {borderColor:ctx => nightCut(ctx) ? "transparent" : undefined, backgroundColor:ctx => nightCut(ctx) ? "transparent" : undefined};
// zusammenhängende Stunden eines Tages: [erster Index, letzter Index, Tag]
const dayRuns = idxs => idxs.reduce((r, gi, k) => { const d = state.times[gi].slice(0,10), l = r[r.length-1];
  if(l && l[2] === d) l[1] = k; else r.push([k, k, d]); return r; }, []);
// sichtbarer Bereich in Canvas-Pixeln, ohne die stehenden Achsen (die Zeichenfläche beginnt um den freien Rand $S versetzt)
const csVis = c => { const a = c.chartArea, sc = c.$sc; if(!sc) return [a.left, a.right]; const o = sc.scrollLeft - c.$S;
  return [Math.max(a.left, o + AX), Math.min(a.right, o + c.$cw - (csR[c.$key] ?? AX))]; };
// so viele Stunden passen in die Breite: ein ganzer Tag, ohne Nacht die Stunden eines durchschnittlichen Tages
const csVisible = idxs => state.nightOff ? Math.max(6, Math.round(idxs.length / dayRuns(idxs).length)) : 24;
const csKOf = (idxs, gi) => { const g = Math.floor(gi), k = idxs.findIndex(i => i >= g); return k < 0 ? idxs.length : k + (idxs[k] === g ? gi - g : 0); };
const csGiOf = (idxs, k) => { const kk = Math.max(0, Math.min(idxs.length - 1, Math.floor(k))); return idxs[kk] + Math.max(0, Math.min(.999, k - kk)); };
/* Zeiger am Rand statt Leerraum: Diagramme und Leisten beginnen ohne freien Rand. Im Großteil steht der Zeiger fest in der Mitte;
   auf der ersten und letzten halben Breite wandert er beim Wischen bis an den Rand, so kommt trotzdem jede Stunde unter ihn.
   s = Scrollposition, u = Lage der Stunde auf der Zeichenfläche, V = sichtbare Breite, max = größte Scrollposition (alles in px).
   edgeP: wo der Zeiger im sichtbaren Bereich steht (0 … V); edgeU/edgeS rechnen Scrollposition und Stunde ineinander um. */
function edgeP(s, V, max){ const H = V/2, R = Math.min(H, max/2); if(!(R > 0)) return null;
  return s < R ? H*s/R : s > max - R ? V - H*(max - s)/R : H; }
const edgeU = (s, V, max) => { const p = edgeP(s, V, max); return p == null ? null : s + p; };
function edgeS(u, V, max){ const H = V/2, R = Math.min(H, max/2); if(!(R > 0)) return 0; const k = 1 + H/R;
  return clamp(u < R + H ? u/k : u > max - R + H ? (u - V + H*max/R)/k : u - H, 0, max); }
// Diagramme: Stunde (Index mit Bruchteil) <-> Scrollposition; Stunde k reicht von k bis k+1.
// Gerechnet ab der Mitte der ersten Stunde bis zur Mitte der letzten: ganz am Anfang steht der Zeiger auf der ersten Stunde, ohne Versatz
const csV = c => c.$cw - csPad(c) - c.$step;
const csScrollOf = (c, gi) => c.$S + edgeS(csKOf(c.$idxs, gi) * c.$step - c.$step/2, csV(c), c.$max - c.$S);
const csMidOf = c => { const s = c.$sc.scrollLeft - c.$S, u = edgeU(s, csV(c), c.$max - c.$S);
  return csGiOf(c.$idxs, ((u ?? s + csV(c)/2) + c.$step/2) / c.$step); };

function csWrap(id){
  const cv = $(id); if(!cv || cv.parentElement.classList.contains("cs-cv")) return;
  const el = cls => { const d = document.createElement("div"); d.className = cls; return d; };
  const box = cv.parentElement, sc = el("cs-scroll"), inner = el("cs-inner"), wrap = el("cs-cv"), mark = el("cs-mark");
  box.classList.add("cs"); box.insertBefore(sc, cv); wrap.appendChild(cv); inner.appendChild(wrap); sc.appendChild(inner);
  ["l", "r"].forEach(k => { const a = document.createElement("canvas"); a.className = "cs-ax " + k; a.setAttribute("aria-hidden", "true"); box.appendChild(a); });
  mark.hidden = true; mark.setAttribute("aria-hidden", "true"); mark.innerHTML = "<b></b>"; box.appendChild(mark);
  sc.addEventListener("scroll", () => csScrolled(sc), {passive:true});
}
/* Breite festlegen, bevor das Diagramm entsteht: alle Stunden nebeneinander, sichtbar etwa ein Tag */
function csPrepare(key, idxs){
  csWrap(CS[key]);
  const cv = $(CS[key]), sc = cv.closest(".cs-scroll"); if(!sc) return;
  const vis = Math.min(idxs.length, csVisible(idxs)), cw = sc.clientWidth, pad = AX + (csR[key] ?? AX), step = (cw - pad) / vis;
  cv.parentElement.style.width = Math.round(pad + idxs.length * step) + "px";
}
/* feste Achsenbreiten: so stehen die Stunden genau, und die Achsen lassen sich als Kopie stehen lassen */
function csAxes(opt, key){
  opt.scales.x.offset = true;
  opt.datasets = {line:{segment:NIGHT_GAP}};
  opt.scales.y.afterFit = fixAxis;
  // Einheit einmal oben an der Achse statt als gedrehter Titel (spart Breite)
  const unit = sc => { const t = sc?.title; if(!t) return ""; const u = t.display ? t.text : ""; t.display = false; return u || ""; };
  opt.csUnit = {l:unit(opt.scales.y), r:unit(opt.scales.y2)};
  const y2 = opt.scales.y2 && opt.scales.y2.display !== false;
  if(y2){ opt.scales.y2.afterFit = fixAxis; csR[key] = AX; }
  else csR[key] = AX_NONE;
  opt.layout = {padding:{top:AX_TOP, right:y2 ? 0 : AX_NONE}};
}
/* Die Achsen links und rechts als Kopie stehen lassen, während die Kurven seitlich laufen; auf der Zeichenfläche selbst werden
   sie danach gelöscht, sonst stünden sie am Anfang und Ende doppelt */
const csAxisPlugin = {id:"csAxis", afterDraw(c){
  const box = c.canvas.closest(".cs"); if(!box) return;
  const src = c.canvas, r = src.width / (src.clientWidth || 1), H = src.height, bg = css("--surface");
  const ar = csR[c.$key] ?? AX, un = c.options.csUnit || {};
  c.ctx.save(); c.ctx.font = "600 10px " + css("--f-body"); c.ctx.fillStyle = css("--muted"); c.ctx.textAlign = "center"; c.ctx.textBaseline = "top";
  if(un.l) c.ctx.fillText(un.l, AX/2, 3);
  if(un.r) c.ctx.fillText(un.r, src.clientWidth - ar/2, 3);
  c.ctx.restore();
  [["l", 0, AX], ["r", src.clientWidth - ar, ar]].forEach(([k, x0, aw]) => {
    const o = box.querySelector(".cs-ax." + k); if(!o) return;
    const w = Math.round(aw*r);
    if(o.width !== w || o.height !== H){ o.width = w; o.height = H; }
    o.style.width = aw + "px"; o.style.height = src.clientHeight + "px";
    const g = o.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, w, H);
    g.drawImage(src, Math.round(x0*r), 0, w, H, 0, 0, w, H);
  });
  const ctx = c.ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, Math.round(AX*r), H); ctx.clearRect(Math.floor((src.clientWidth - ar)*r), 0, Math.ceil(ar*r) + 1, H);
  ctx.restore();
}};
/* oranger Zeiger: in der Mitte des sichtbaren Bereichs, mit der Uhrzeit der gewählten Stunde; am Anfang und Ende wandert er
   zum Rand (edgeP). Gerechnet aus der gewünschten Lage, ohne etwas nachzumessen. */
function csPlaceMark(c){
  const mark = c.canvas?.closest(".cs")?.querySelector(".cs-mark"); if(!mark || !c.chartArea || !c.$sc) return;
  const t = state.times[state.sel]; mark.hidden = !t; if(!t) return;
  const a = c.chartArea, gi = csCenter ?? state.sel + .5, p = csKOf(c.$idxs, gi) * c.$step - (csScrollOf(c, gi) - c.$S);
  mark.style.left = (AX + p) + "px"; mark.style.top = a.top + "px"; mark.style.height = (a.bottom - a.top) + "px";
  mark.firstChild.textContent = hh(t) + UHR();
}
const csMarks = () => Object.keys(CS).forEach(k => { if(charts[k]) csPlaceMark(charts[k]); });
/* nach dem Aufbau: gewählte Stunde unter den Zeiger */
function csAfter(key){
  const c = charts[key], sc = $(CS[key])?.closest(".cs-scroll"); if(!c || !sc) return;
  c.$sc = sc; c.$key = key; sc.dataset.key = key;
  c.$cw = sc.clientWidth; c.$max = sc.scrollWidth - c.$cw;   // gemerkt: beim Scrollen nichts nachmessen (jedes Messen nach dem Verschieben bremst)
  c.$step = c.chartArea.width / c.$idxs.length; c.$S = c.canvas.parentElement.offsetLeft;
  const dk = state.fetchedAt + "|" + site.lat + "," + site.lon;
  if(dk !== csDataKey){ csDataKey = dk; csCenter = null; }
  if(csCenter == null) csCenter = state.sel + .5;
  csSetCenter(key, csCenter); barFollow(csCenter);
}
function csSetCenter(key, gi, noDraw){
  const c = charts[key]; if(!c?.$sc) return;
  const sc = c.$sc;
  sc.scrollLeft = sc._want = csScrollOf(c, gi);
  if(!noDraw) c.draw();   // der Zeiger steht fest in der Mitte: beim Mitziehen nichts an ihm schreiben (sonst rechnet der Browser das Layout je Diagramm neu)
}
/* Stunde unter den Zeiger holen (Antippen, Tag-Tasten, Einrasten nach dem Wischen); noDraw: gezeichnet wird danach ohnehin (syncCharts) */
function csShowHour(i, noDraw){
  csCenter = i + .5; Object.keys(CS).forEach(o => csSetCenter(o, csCenter, noDraw)); barFollow(csCenter);
}
// vom Programm gesetzte Position (nicht weiterreichen, sonst schaukeln sich Diagramme und Leisten gegenseitig auf)
const csOwn = el => { if(el._want != null && Math.abs(el.scrollLeft - el._want) < 1.5) return true; el._want = null; return false; };
/* Beim Wischen: die anderen sofort nachziehen und nur das Leichte aktualisieren (Zeiger-Uhrzeit, Kopfzeile, Markierungen).
   In der Pause rastet die Stunde ein, und alles Weitere (Werte, Kompass, Profil, Karte, Tag, Tabellen) folgt. */
function csLive(){
  const gi = Math.floor(csCenter); if(gi === state.sel || !state.hours[gi]) return;
  state.sel = gi; csMarks(); highlightSel();
  if(typeof sbHourText === "function") sbHourText(state.hours[gi]);
  keepPlace(() => compassLive(gi));
}
/* Beim Wischen soll die Seite nicht springen, wenn sich darüber etwas in der Höhe ändert (Wertezeile, Kompass, Hinweise):
   die gerade gewischte Leiste bzw. das Diagramm bleibt an derselben Stelle auf dem Bildschirm */
let csActive = null;
function keepPlace(fn){
  const el = csActive?.isConnected ? csActive : null, y0 = el?.getBoundingClientRect().top;
  fn();
  if(el == null) return;
  const dy = el.getBoundingClientRect().top - y0;
  if(Math.abs(dy) > .5) (el.closest(".chart-max") || document.scrollingElement).scrollBy(0, dy);
}
/* Uhrzeit am Zeiger nur beim Wischen (in der Ruhe steht sie in Kopfzeile und Wertezeile); blendet kurz nach dem Einrasten aus */
let csRest = 0, csHide = 0;
function csSettle(){
  clearTimeout(csRest); clearTimeout(csHide);
  document.documentElement.classList.add("cs-live");
  csRest = setTimeout(() => { keepPlace(() => selectHour(Math.floor(csCenter)));
    csHide = setTimeout(() => document.documentElement.classList.remove("cs-live"), 700); }, 150);
}
function csScrolled(sc){
  if(csOwn(sc)) return;
  const key = sc.dataset.key, c = charts[key]; if(!c?.$sc) return;
  csCenter = csMidOf(c);
  Object.keys(CS).forEach(o => { if(o !== key) csSetCenter(o, csCenter, true); });
  csMarks();   // Zeiger am Rand mitwandern lassen bzw. zurück in die Mitte (nur Lage, nichts gemessen)
  csActive = sc; barFollow(csCenter); csLive(); csSettle();
}
/* Großes und kleines Arbeitsfenster (Kurzleiste oben): gleiche Mitte wie die Diagramme; die Zelle in der Mitte ist die gewählte */
const BARS = () => [$("tlScroll"), $("sbStrip"), $("dirStrip"), $("dewRow")];
const barOn = box => box._vis !== false && (box.id !== "sbStrip" || !$("stickyBar").hidden);   // nur Leisten, die zu sehen sind (_vis: ResizeObserver in csInit)
// Lage der Zellen einmal messen (neu, wenn die Leiste neu aufgebaut, eingeblendet oder breiter/schmaler wird)
function barCells(box){
  const sel = box.dataset.cells || "[data-i]", first = box.querySelector(sel);   // Taupunkt-Tabelle: nur die Stundenzeile
  if(box._pos && box._pos.first === first && box._pos.w) return box._pos;
  const b0 = box.getBoundingClientRect().left - box.scrollLeft;
  const list = [...box.querySelectorAll(sel)].map(e => ({i:+e.dataset.i, x:e.getBoundingClientRect().left - b0, w:e.offsetWidth}));
  const w = box.clientWidth, max = box.scrollWidth - w, f = list[0], l = list[list.length - 1];
  // lead/tail: bis zur Mitte der ersten bzw. ab der Mitte der letzten Stunde (davor z. B. Tagesname oder stehende Beschriftung);
  // ganz am Anfang und Ende steht die Auswahl so genau auf der ersten bzw. letzten Stunde
  return box._pos = {first, w, max, list, map:new Map(list.map(o => [o.i, o])), lead:f ? f.x + f.w/2 : 0, tail:l ? max + w - (l.x + l.w/2) : 0};
}
function barFollow(gi, except){
  BARS().forEach(box => {
    if(!box || box === except || !barOn(box)) return;
    const P = barCells(box); if(!P.w || !P.list.length) return;
    const p = P.map.get(Math.floor(gi));
    let x;
    if(p) x = p.x + p.w*(gi - Math.floor(gi));
    else{ const n = P.list.find(o => o.i > gi), l = P.list[P.list.length - 1]; x = n ? n.x - 2 : l.x + l.w; }   // Stunde fehlt (Pfeilreihe: Nacht): an die Lücke davor
    box.scrollLeft = box._want = edgeS(x - P.lead, P.w - P.lead - P.tail, P.max);
  });
}
function barScrolled(box){
  if(csOwn(box)) return;
  const P = barCells(box), L = P.list;
  if(!L.length || !P.w) return;
  const V = P.w - P.lead - P.tail, mid = P.lead + (edgeU(box.scrollLeft, V, P.max) ?? box.scrollLeft + V/2);
  let lo = 0, hi = L.length - 1;   // Zelle unter der Mitte (Zellen sind nach Lage sortiert)
  while(lo < hi){ const m = (lo + hi + 1) >> 1; if(L[m].x <= mid) lo = m; else hi = m - 1; }
  const p = L[lo];
  csCenter = p.i + Math.max(0, Math.min(.999, (mid - p.x) / p.w));
  Object.keys(CS).forEach(o => csSetCenter(o, csCenter, true));
  csMarks();
  csActive = box; barFollow(csCenter, box); csLive(); csSettle();
}
/* nach einem Tageswechsel: Tagesangaben und Taupunkt-Zeile nachziehen (die Diagramme zeichnet danach syncCharts) */
function chartDayChanged(){
  ["chartDay", "rainDay", "tempDay"].forEach(id => { $(id).textContent = dayLabel(state.day); });
  renderDewRow();
}
function csInit(){
  Object.values(CS).forEach(csWrap);
  BARS().forEach(box => box.addEventListener("scroll", () => barScrolled(box), {passive:true}));
  $("dirStrip").addEventListener("click", e => { const b = e.target.closest(".dir-cell"); if(b) selectHour(+b.dataset.i); });
  $("dewRow").addEventListener("click", e => { const c = e.target.closest("[data-i]"); if(c) selectHour(+c.dataset.i); });
  // ausgeblendete Leisten nicht bei jedem Wischen neu vermessen; beim Einblenden auf die Mitte holen
  if("ResizeObserver" in window){
    const ro = new ResizeObserver(es => es.forEach(e => { const b = e.target, v = e.contentRect.width > 0;
      b._pos = null; if(v && b._vis === false && csCenter != null){ b._vis = v; barFollow(csCenter); } b._vis = v; }));
    BARS().forEach(b => b && ro.observe(b));
  }
  // andere Breite (Drehen, Fenster): Stundenbreite neu berechnen, gewählte Stunde bleibt in der Mitte
  let w = innerWidth, t = 0;
  addEventListener("resize", () => { if(innerWidth === w) return; w = innerWidth; BARS().forEach(b => { b._pos = null; }); clearTimeout(t);
    t = setTimeout(() => { if(state.hours.length){ renderChart(); renderRain(); renderTemp(); } }, 150); });
}

function renderChart(){
  if(typeof Chart==="undefined"){ $("chartTitle").textContent = T("Wind (Diagramm nicht geladen)", "Wind (chart not loaded)"); return; }
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
  if(!hid("gust")) ds.push({label:T("Böe (gesch.)", "Gust (est.)"), data:H.map(h=>r2(h.gMed)), borderColor:css("--gust"), backgroundColor:css("--gust"), borderWidth:1.8, borderDash:[2,3], pointRadius:0, tension:.3});
  // Grenzlinien immer sichtbar (nicht ausblendbar)
  ds.push({label:T("Grenzwert", "Limit"), data:idxs.map(()=>cw(site.wind)), borderColor:stop, borderWidth:1.6, borderDash:[7,4], pointRadius:0});
  ds.push({label:T("Grenze Böe", "Gust limit"), data:idxs.map(()=>cw(site.gust)), borderColor:stop, borderWidth:1, borderDash:[2,4], pointRadius:0});
  const opt = chartBase(WU()+" · "+zoneTxt()); opt.scales.x.ticks.padding = 18;   // Platz für den Tageslicht-Streifen
  opt.plugins.tooltip = {filter: it => !["Minimum", T("Grenzwert", "Limit"), T("Grenze Böe", "Gust limit")].includes(it.dataset.label), callbacks:{title:csTipTitle, label:c => `${c.dataset.label}: ${fmt(c.parsed.y, U().d)} ${WU()}`}}; narrowReadout(opt, "roMain");
  csAxes(opt, "main");
  if(charts.main) charts.main.destroy();
  csPrepare("main", idxs);
  charts.main = new Chart($("chart"), {type:"line", data:{labels, datasets:ds}, options:opt, plugins:[markPlugin, limitLabels, csAxisPlugin]});
  charts.main.$idxs = idxs; charts.main.update("none"); csAfter("main"); syncTooltip(charts.main);
  $("chartTitle").textContent = T("Windverlauf · ", "Wind · ") + zoneTxt();
  $("chartDay").textContent = dayLabel(state.day);
  renderChips(); renderLegend();
}
/* Ruhige Legende unter den Diagrammen: zeigt nur, was gerade zu sehen ist (nicht klickbar).
   Ein- und ausgeblendet wird im Feld „Anzeige“ (Schalter mit data-s). */
const legItem = (cls, txt, sty) => `<span><i class="${cls}"${sty ? ` style="${sty}"` : ""}></i>${esc(txt)}</span>`;
function syncSwitches(panel){
  document.querySelectorAll(`#${panel} input[data-s]`).forEach(i => { i.checked = !state.hide.has(i.dataset.s); });
}
function renderLegend(){
  const on = k => !state.hide.has(k), MAXM = 3;
  const ms = usableModels().filter(r => state.show.has(r.m.id));
  const items = [
    on("median") && legItem("lg-med", "Median"),
    on("band") && legItem("lg-band", T("Spanne", "Spread")),
    on("gust") && legItem("lg-gust", T("Böe", "Gust")),
    legItem("lg-lim", T("Grenze Wind", "Wind limit")),
    legItem("lg-glim", T("Grenze Böe", "Gust limit")),
    ...ms.slice(0, MAXM).map(r => legItem("lg-model", r.m.name, `--c:${modelColor(r.m)};border-top-style:${r.m.hi ? "solid" : "dashed"}`))
  ].filter(Boolean);
  const more = ms.length - MAXM;
  if(more > 0) items.push(`<span class="lg-more">+ ${more} ${more === 1 ? T("Modell", "model") : T("Modelle", "models")}</span>`);
  $("chartLegend").innerHTML = items.join("");
  syncSwitches("chartView");
}
function renderTempLegend(){
  const on = k => !state.hide.has(k);
  $("tempLegend").innerHTML = [
    legItem("lg-temp", T("Temperatur", "Temperature")),
    on("t_feel") && legItem("lg-feel", T("Gefühlt", "Feels like")),
    on("t_dew") && legItem("lg-dew", T("Taupunkt", "Dew point")),
    on("t_rh") && legItem("lg-rh", T("Luftfeuchte", "Humidity"))
  ].filter(Boolean).join("");
  syncSwitches("tempView");
}
function toggleLine(s){
  state.hide.has(s) ? state.hide.delete(s) : state.hide.add(s);
  try{ localStorage.setItem("wb_hide", JSON.stringify([...state.hide])); }catch(e){}
  s.startsWith("t_") ? renderTemp() : renderChart();
}
/* „Nacht ausblenden“: gilt für Wind, Regen und Temperatur gemeinsam (nur Anzeige) */
function renderNightBtns(){
  const off = state.nightOff;
  document.querySelectorAll(".night-btn").forEach(b => {
    b.setAttribute("aria-pressed", String(off));
    b.querySelector(".nl").textContent = off ? T("Nacht einblenden", "Show night") : T("Nacht ausblenden", "Hide night");
    b.setAttribute("aria-label", b.querySelector(".nl").textContent);
    b.title = off ? "Dunkle Stunden außerhalb der Arbeitszeit in den Diagrammen wieder einblenden" : "Dunkle Stunden außerhalb der Arbeitszeit in den Diagrammen ausblenden";
  });
}
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
    return `<button type="button" class="mchip ${on?"on":""}" style="--c:${modelColor(r.m)}" data-id="${r.m.id}" aria-pressed="${on}" title="${esc(r.m.org)} · ${esc(r.m.res)}${r.m.hi?"":T(" (gestrichelt)", " (dashed)")}"><i></i>${esc(r.m.name)}${r.m.name==="HARMONIE" ? ` <small>${esc(r.m.org)}</small>` : ""}</button>`; }).join("");
  $("modelChips").querySelectorAll(".mchip").forEach(b => b.onclick = () => { const id = b.dataset.id; state.show.has(id) ? state.show.delete(id) : state.show.add(id); setBestMode(false); setShown(state.show, " "); });
  // Schnellwahl: der Knopf, dessen Auswahl gerade gilt, ist gedrückt
  const ids = u.filter(r => state.show.has(r.m.id)).map(r => r.m.id), hi = u.filter(r => r.m.hi).map(r => r.m.id);
  const cur = state.showBest ? "best" : !ids.length ? "none" : ids.length === u.length ? "all" : ids.length === hi.length && hi.every(id => ids.includes(id)) ? "hi" : "";
  document.querySelectorAll("[data-q]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.q === cur)));
  $("chipNote").textContent = note || T("Nur Anzeige: Ampel und Median nutzen weiter alle aktiven Modelle.", "Display only: traffic light and median still use all active models.");
}
function setShown(ids, note){
  state.show = new Set(ids);
  try{ localStorage.setItem("wb_show", JSON.stringify([...state.show])); }catch(e){}
  renderChart(); if(note) renderChips(note.trim() ? note : undefined);
}
let wantBest = false;
function setBestMode(on){ state.showBest = on; try{ localStorage.setItem("wb_showbest", on ? "1" : "0"); }catch(e){} }
function showQuick(q){
  const u = usableModels();
  setBestMode(q === "best");
  if(q==="all") return setShown(u.map(r => r.m.id), " ");
  if(q==="none") return setShown([], " ");
  if(q==="hi") return setShown(u.filter(r => r.m.hi).map(r => r.m.id), u.some(r => r.m.hi) ? " " : T("Für diesen Standort liefert kein hochauflösendes Modell Daten.", "No high-resolution model provides data for this site."));
  applyBest(true);
}
/* „Am besten bewertet“: Auswahl aus dem Modellvergleich der aktuellen Baustelle bilden. Wird bei jedem neuen Vergleich,
   Baustellenwechsel und Abruf erneut aufgerufen (aus renderRanking), damit Grafik und Vergleich nie auseinanderlaufen. */
function applyBest(start){
  const u = usableModels(), rk = rankGroups();
  if(!rk){
    let done = false; try{ done = !!localStorage.getItem(rankKey()); }catch(e){}   // Vergleich lief, ergab aber zu wenig Daten
    renderChips(done ? T("Für diese Baustelle ist kein Modellvergleich möglich (zu wenige Messwerte), Auswahl bleibt.", "No model comparison possible for this site (too few measurements), selection kept.")
      : T("Noch kein Modellvergleich für diese Baustelle: wird jetzt berechnet (unten bei „Welche Modelle treffen hier?“) …", "No model comparison for this site yet: calculating now (below under “Which models are accurate here?”) …"));
    if(start && !done && !$("rankBtn").disabled){ wantBest = true; computeRanking(); }
    return;
  }
  const narrow = rk.narrow, ids = narrow ? u.filter(r => r.m.hi).map(r => r.m.id) : rk.good.filter(id => u.some(r => r.m.id===id));
  const note = narrow ? T("Laut Modellvergleich treffen hier alle Modelle etwa gleich gut. Eingeblendet: die hochauflösenden.", "According to the model comparison all models are about equally accurate here. Shown: the high-resolution ones.")
    : T(`Am besten bewertet laut Modellvergleich dieser Baustelle (${ids.length}). Nur Anzeige, Ampel und Median nutzen weiter alle aktiven Modelle.`, `Best rated according to this site’s model comparison (${ids.length}). Display only, traffic light and median still use all active models.`);
  const same = ids.length === state.show.size && ids.every(id => state.show.has(id));
  if(same) renderChips(note); else setShown(ids, note);
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
  opt.scales.x.ticks.autoSkip = true;
  opt.scales.y.suggestedMax = 2;
  opt.scales.y2 = {position:"right", beginAtZero:true, suggestedMax:1000, grid:{display:false}, ticks:{color:css("--muted"), font:{family:"Barlow", size:10}}, title:{display:true, text:"CAPE J/kg", color:css("--muted")}};
  opt.plugins.tooltip = {callbacks:{title:csTipTitle, label:c => c.dataset.yAxisID==="y2" ? `CAPE: ${Math.round(c.parsed.y)} J/kg`
    : `${T("Regen", "Rain")}: ${fmt(c.parsed.y)} mm` + (H[c.dataIndex]?.rainN ? ` · ${H[c.dataIndex].rainYes} ${T("von", "of")} ${H[c.dataIndex].rainN} ${T("Modellen", "models")}` : "")}}; narrowReadout(opt, "roRain");
  csAxes(opt, "rain");
  if(charts.rain) charts.rain.destroy();
  csPrepare("rain", idxs);
  charts.rain = new Chart($("rain"), {data:{labels, datasets:[
    {type:"bar", label:T("Regen", "Rain"), data:H.map(h=>h.rain==null?null:+h.rain.toFixed(2)), backgroundColor:H.map(h => rainColor(h)), borderColor:css("--band-line"), borderRadius:2},
    {type:"line", label:"CAPE", yAxisID:"y2", data:H.map(h=>h.cape==null?null:Math.round(h.cape)), borderColor:css("--warn"), borderWidth:2, pointRadius:0, tension:.3},
  ]}, options:opt, plugins:[markPlugin, csAxisPlugin]});
  charts.rain.$idxs = idxs; charts.rain.update("none"); csAfter("rain"); syncTooltip(charts.rain);
  $("rainDay").textContent = dayLabel(state.day);
}

/* Temperatur-Diagramm: nur die Feuchte-Grenze fürs Beschichten als Linie (im Beschichten-Modus).
   Kondenswasser steht nicht mehr als Fläche im Diagramm, sondern in der Taupunkt-Zeile darunter (eine Zelle je Arbeitsstunde). */
const DEW_COLOR = "#b48ee6", RH_COLOR = "#3a9a9a";
const coatLimitPlugin = {id:"coatLimit", afterDatasetsDraw(c){
  const {ctx, scales:{y2}} = c, [vl, vr] = csVis(c), a = {left:vl, right:vr};
  if(!coatOn(state.day) || state.hide.has("t_rh") || !y2) return;
  const py = y2.getPixelForValue(coatRh()), t = `Grenze Feuchte ${coatRh()} %`, lc = site.coatStop ? css("--stop") : css("--warn");
  ctx.save(); ctx.strokeStyle = lc; ctx.lineWidth = 1.2; ctx.setLineDash([6,4]);
  ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = "600 10.5px " + css("--f-body"); ctx.textAlign = "right"; ctx.textBaseline = "bottom";
  const w = ctx.measureText(t).width; ctx.fillStyle = css("--surface"); ctx.globalAlpha = .75; ctx.fillRect(a.right - w - 8, py - 14, w + 6, 13); ctx.globalAlpha = 1;
  ctx.fillStyle = lc; ctx.fillText(t, a.right - 5, py - 2);
  ctx.restore();
}};
// Text unter dem Temperatur-Diagramm (was ausgeblendet ist, steht im Feld „Anzeige“)
function tempNote(){
  return T("Taupunkt und Luftfeuchte gelten für 2 m über Boden.", "Dew point and humidity apply to 2 m above ground.");
}
/* Taupunkt-Zeile: je Arbeitsstunde der Abstand der Temperatur in Arbeitshöhe zum Taupunkt (2 m).
   „Tau“ = Taupunkt erreicht. Im Beschichten-Modus zusätzlich die Luftfeuchte, Farben nach euren Grenzen. */
function renderDewRow(){
  // über alle Tage (Arbeitsstunden), Tagesnamen in einer Kopfzeile; läuft wie die Pfeilreihe mit der Mitte der Diagramme
  const hs = state.hours.filter(h => isWork(h.t)), coat = coatOn(state.day), stopC = coat && site.coatStop, k = v => fmt(v, v%1 ? 1 : 0);
  const box = $("dewRow");
  if(!hs.some(h => h.dew!=null)){ box.innerHTML = ""; box._html = ""; $("dewRowNote").textContent = T("Es liegen keine Werte zum Taupunkt vor.", "No dew point values available."); return; }
  const cH = h => coatOn(h.t.slice(0,10)), sH = h => cH(h) && site.coatStop;   // Beschichten-Modus gilt für alle Tage
  const dCls = h => h.dew==null ? "m-none" : sH(h) && coatViol(h) ? "m-stop" : h.dew <= 0 ? "d-wet" : (cH(h) ? h.dew < coatDew() : h.dew <= DEW_INFO) ? "d-near" : "d-ok";
  const rCls = h => h.rh==null || !cH(h) ? "m-none" : h.rh > coatRh() ? (sH(h) ? "m-stop" : "d-near") : "d-ok";
  const ds = (h, k) => k===0 || h.t.slice(0,10) !== hs[k-1].t.slice(0,10) ? " dstart" : "";
  const td = (h, k, cls, txt, tip) => `<td class="${cls}${ds(h, k)}" data-i="${h.i}" title="${esc(tip)}">${txt}</td>`;
  const row = (name, cell) => `<tr><th class="mname">${name}</th>${hs.map(cell).join("")}</tr>`;
  let rows = row(`${T("Abstand", "Spread")} <small>°C</small>`, (h, k) => td(h, k, dCls(h), h.dew==null ? "·" : h.dew <= 0 ? T("Tau", "Dew") : fmt(h.dew,1),
    h.dew==null ? "" : T(`${hh(h.t)} Uhr: ${fmt(h.tW,1)} °C in ${workH()} m, Taupunkt (2 m) ${fmt(h.td,1)} °C: ${h.dew <= 0 ? "Taupunkt erreicht" : "Taupunktabstand " + fmt(h.dew,1) + " °C"}`, `${hh(h.t)}h: ${fmt(h.tW,1)} °C at ${workH()} m, dew point (2 m) ${fmt(h.td,1)} °C: ${h.dew <= 0 ? "dew point reached" : "dew point spread " + fmt(h.dew,1) + " °C"}`)));
  if(hs.some(cH)) rows += row(`${T("Feuchte", "Humidity")} <small>%</small>`, (h, k) => td(h, k, rCls(h), h.rh==null || !cH(h) ? "·" : Math.round(h.rh), T(`${hh(h.t)} Uhr: Luftfeuchte ${h.rh==null ? "–" : Math.round(h.rh) + " %"} (Grenze ${coatRh()} %)`, `${hh(h.t)}h: humidity ${h.rh==null ? "–" : Math.round(h.rh) + " %"} (limit ${coatRh()} %)`)));
  const days = dayRuns(hs.map(h => h.i)).map(([a, b, d]) => `<th class="dd${a ? " dstart" : ""}" colspan="${b - a + 1}">${esc(dayLabel(d, true))}</th>`).join("");
  const html = `<table><tr><th class="mname"></th>${days}</tr><tr class="dew-h"><th class="mname"></th>${hs.map((h, k) => `<th class="${ds(h, k)}" data-i="${h.i}">${hh(h.t)}</th>`).join("")}</tr>${rows}</table>`;
  if(html !== box._html){   // nur neu aufbauen, wenn sich etwas geändert hat (sonst müsste die Lage jedes Mal neu gemessen werden)
    box._html = html; box.innerHTML = html; box.dataset.cells = "tr.dew-h th[data-i]";
    highlightSel();
    if(csCenter != null) requestAnimationFrame(() => barFollow(csCenter));
  }
  $("dewRowNote").textContent = coat
    ? T(`Beschichten-Modus: Taupunktabstand mind. ${k(coatDew())} °C und höchstens ${coatRh()} % Feuchte. ${stopC ? "Rot: Grenze überschritten, Ampel STOP." : "Gelb: Grenze überschritten (Hinweis)."} „Tau“: Taupunkt erreicht, Nebel oder Wolke in Arbeitshöhe, alles nass.`, `Coating mode: dew point spread at least ${k(coatDew())} °C and at most ${coatRh()} % humidity. ${stopC ? "Red: limit exceeded, traffic light STOP." : "Yellow: limit exceeded (note)."} “Dew”: dew point reached, fog or cloud at working height, everything wet.`)
    : T(`Zahl: Taupunktabstand in °C, also wie weit die Temperatur in Arbeitshöhe über dem Taupunkt liegt. „Tau“ (gelb): Taupunkt erreicht, Nebel oder Wolke in Arbeitshöhe, Oberflächen und Seile nass. Hellgelb: bis ${k(DEW_INFO)} °C, Kondenswasser möglich. Darüber rechnet die Prognose nicht mit Kondenswasser; Oberflächen können trotzdem kälter sein.`, `Number: dew point spread in °C, i.e. how far the temperature at working height is above the dew point. “Dew” (yellow): dew point reached, fog or cloud at working height, surfaces and ropes wet. Light yellow: up to ${k(DEW_INFO)} °C, condensation possible. Above that the forecast does not expect condensation; surfaces may still be colder.`);
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
  opt.scales.y2 = {display:!hid("t_rh"), position:"right", min:0, max:100, grid:{display:false}, ticks:{color:css("--muted"), font:{family:"Barlow", size:10}, stepSize:25}, title:{display:true, text:"%", color:css("--muted")}};
  opt.plugins.tooltip = {filter: it => !it.dataset.ref, callbacks:{title:csTipTitle, label:c => c.dataset.yAxisID==="y2" ? `${T("Luftfeuchte", "Humidity")}: ${Math.round(c.parsed.y)} %`
    : c.dataset.dew ? `${c.dataset.label}: ${fmt(c.parsed.y)} °C` + (H[c.dataIndex]?.dew==null ? "" : H[c.dataIndex].dew <= 0 ? T(" · Taupunkt erreicht", " · dew point reached") : ` · ${T("Taupunktabstand", "dew point spread")} ${fmt(H[c.dataIndex].dew,1)} °C`)
    : `${c.dataset.label}: ${fmt(c.parsed.y)} °C`}}; narrowReadout(opt, "roTemp");
  const ds = [
    {label:T("Temperatur ", "Temperature ")+workH()+" m", data:H.map(h => r1(h.tW)), borderColor:css("--accent"), borderWidth:2.5, pointRadius:0, tension:0},
    hid("t_feel") ? null : {label:T("Gefühlt", "Feels like"), data:H.map(h => r1(h.chill)), borderColor:css("--band-line"), borderWidth:2, borderDash:[5,4], pointRadius:0, tension:0},
    hid("t_dew") ? null : {label:T("Taupunkt (2 m)", "Dew point (2 m)"), dew:true, data:H.map(h => r1(h.td)), borderColor:DEW_COLOR, borderWidth:2.2, borderDash:[3,3], pointRadius:0, tension:0},
    hid("t_rh") ? null : {label:T("Luftfeuchte", "Humidity"), yAxisID:"y2", data:H.map(h => h.rh==null ? null : Math.round(h.rh)), borderColor:RH_COLOR, backgroundColor:"rgba(58,154,154,.10)", fill:"origin", borderWidth:1.5, pointRadius:0, tension:0}
  ].filter(Boolean);
  // Bezugslinien nur, wenn sie in die Nähe kommen: 0 °C (Frost), −10 °C (Kälteschutz)
  if(lo < 6) ds.push({label:"0 °C", ref:true, data:idxs.map(() => 0), borderColor:css("--muted"), borderWidth:1, borderDash:[2,3], pointRadius:0});
  if(lo < -5) ds.push({label:"−10 °C", ref:true, data:idxs.map(() => CHILL_INFO), borderColor:css("--band-line"), borderWidth:1, borderDash:[2,3], pointRadius:0});
  csAxes(opt, "temp");
  if(charts.temp) charts.temp.destroy();
  csPrepare("temp", idxs);
  charts.temp = new Chart($("temp"), {type:"line", data:{labels, datasets:ds}, options:opt, plugins:[markPlugin, coatLimitPlugin, csAxisPlugin]});
  charts.temp.$idxs = idxs; charts.temp.update("none"); csAfter("temp"); syncTooltip(charts.temp);
  $("tempTitle").textContent = T("Temperatur · ", "Temperature · ") + workH() + T(" m & Feuchte", " m & humidity");
  $("tempDay").textContent = dayLabel(state.day);
  $("tempNote").textContent = tempNote();
  renderDewRow();
  renderTempLegend();
}

/* Höhenprofil, Kompass und Pfeilreihe zeigen eine Stunde: die gewählte (Antippen, Zeiger ziehen) oder beim Scrollen
   die Stunde in der Mitte des sichtbaren Ausschnitts. Ihre Überschrift nennt immer die gezeigte Stunde. */
function renderProfile(i = state.sel){
  if(typeof Chart==="undefined") return;
  const h = state.hours[i]; if(!h) return;
  $("profileNote").textContent = isWind() ? T("Wind vom Boden bis über die Blattspitze zur gewählten Stunde.", "Wind from the ground to above the blade tip at the selected hour.") : T("Wind vom Boden bis über die Arbeitshöhe zur gewählten Stunde.", "Wind from the ground to above working height at the selected hour.");
  const tip = site.hub + site.rotor/2, zs = [];
  for(let z=10; z<=Math.max(200, tip+10); z+=10) zs.push(z);
  const per = usableModels().map(r => r.series[i]).filter(Boolean);
  const prof = zs.map(z => { const v = per.map(s => windAt(s.lv, z).v).filter(x=>x!=null); return {z, med:median(v), min:v.length?Math.min(...v):null, max:v.length?Math.max(...v):null}; });
  const P = (k) => prof.map(p => p[k]==null?null:{x:+cw(p[k]).toFixed(2), y:p.z});
  const opt = chartBase("");
  opt.scales.x = {type:"linear", beginAtZero:true, ticks:{color:css("--muted"), font:{family:"Barlow", size:10}}, grid:{color:css("--line")}, title:{display:true, text:WU(), color:css("--muted")}};
  opt.scales.y = {type:"linear", min:0, max:zs[zs.length-1], ticks:{color:css("--muted"), font:{family:"Barlow", size:10}, stepSize:40}, grid:{color:css("--line")}, title:{display:true, text:T("Höhe über Grund (m)", "Height above ground (m)"), color:css("--muted")}};
  opt.interaction = {mode:"nearest", intersect:false, axis:"y"};
  opt.plugins.tooltip = {callbacks:{label:c => `${c.dataset.label}: ${fmt(c.parsed.x, U().d)} ${WU()} ${T("in", "at")} ${c.parsed.y} m`}};
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
    ctx.fillText((isWind() ? T("Nabe ", "Hub ") : T("Arbeitshöhe ", "Working height "))+site.hub+" m", a.left+4, y.getPixelForValue(site.hub)-4);
    if(workH() !== site.hub){
      ctx.strokeStyle = css("--go"); ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(a.left, y.getPixelForValue(workH())); ctx.lineTo(a.right, y.getPixelForValue(workH())); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = css("--go"); ctx.fillText(T("Arbeit ", "Work ")+workH()+" m", a.left+4, y.getPixelForValue(workH())-4);
    }
    if(isWind()){ ctx.fillStyle = css("--muted"); ctx.fillText(T("Blattspitze ", "Blade tip ")+Math.round(tip)+" m", a.left+4, y.getPixelForValue(tip)+12); }
    ctx.restore();
  }};
  if(charts.profile) charts.profile.destroy();
  charts.profile = new Chart($("profile"), {type:"line", data:{datasets:[
    {label:"Minimum", data:P("min"), borderColor:css("--band-line"), borderWidth:.8, pointRadius:0, fill:false},
    {label:"Maximum", data:P("max"), borderColor:css("--band-line"), borderWidth:.8, pointRadius:0, fill:false},
    {label:"Median", data:P("med"), borderColor:css("--fg"), borderWidth:3, pointRadius:0}
  ]}, options:opt, plugins:[refPlugin]});
  $("profileHour").textContent = `${dayLabel(state.times[i].slice(0,10),true)} · ${hh(state.times[i])}${UHR()}`;
}

function renderCompass(i = state.sel){
  if(!state.hours[i]) return;
  drawCompass(i);
  renderDirStrip(i);
}
/* Kompass beim Wischen mitdrehen: je Stunde, die unter den Zeiger kommt, aber nur wenn der Kompass gerade zu sehen ist */
let compassSeen = false;
if("IntersectionObserver" in window) new IntersectionObserver(es => { compassSeen = es[es.length-1].isIntersecting; }).observe($("compass"));
function compassLive(i){ if(compassSeen && !document.hidden && state.hours[i]) drawCompass(i); }
function drawCompass(i){
  const h = state.hours[i];
  const dirs = usableModels().map(r => r.series[i]).filter(s => s && s.dir!=null);
  const fg = "var(--fg)", muted = "var(--muted)";
  const ticks = Array.from({length:36},(_,k)=>{ const a=k*10*Math.PI/180, r1=k%9===0?78:84; return `<line x1="${100+r1*Math.sin(a)}" y1="${100-r1*Math.cos(a)}" x2="${100+90*Math.sin(a)}" y2="${100-90*Math.cos(a)}" stroke="${muted}" stroke-width="${k%9===0?1.5:.6}"/>`; }).join("");
  const lab = [["N",0],[T("O", "E"),90],["S",180],["W",270]].map(([t,d]) => { const a=d*Math.PI/180; return `<text x="${100+66*Math.sin(a)}" y="${104-66*Math.cos(a)}" text-anchor="middle" font-size="13" font-weight="600" font-family="Barlow Condensed, sans-serif" fill="${fg}">${t}</text>`; }).join("");
  // Striche: Wind kommt aus Richtung d -> Strich vom Rand zur Mitte
  const lines = dirs.map(s => { const a=s.dir*Math.PI/180; return `<line x1="${100+88*Math.sin(a)}" y1="${100-88*Math.cos(a)}" x2="${100+48*Math.sin(a)}" y2="${100-48*Math.cos(a)}" stroke="var(--band-line)" stroke-width="2" stroke-linecap="round" opacity=".75"/>`; }).join("");
  const calm = h.med!=null && h.med < DIR_CALM;   // Schwachwind: Richtung wechselt, Pfeil nur blass
  let arrow = "";
  if(h.dir.mean!=null){
    arrow = `<g transform="rotate(${h.dir.mean} 100 100)"${calm?' opacity=".4"':""}><line x1="100" y1="14" x2="100" y2="150" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/><polygon points="100,170 88,146 112,146" fill="var(--accent)"/></g>`;
  }
  $("compass").innerHTML = `<svg viewBox="0 0 200 200" role="img" aria-label="${T("Windrichtung", "Wind direction")} ${dirName(h.dir.mean)}"><circle cx="100" cy="100" r="90" fill="var(--raised)" stroke="var(--line)"/>${ticks}${lines}${lab}${arrow}<circle cx="100" cy="100" r="5" fill="${fg}"/></svg>`;
  const sp = h.dir.spread;
  $("compassFacts").innerHTML = `
    <dt>${T("Wind aus", "Wind from")}</dt><dd>${h.dir.mean==null?"–":dirName(h.dir.mean)+" · "+Math.round(h.dir.mean)+"°"}</dd>
    <dt>${T("Weht nach", "Blows to")}</dt><dd>${h.dir.mean==null?"–":dirName((h.dir.mean+180)%360)}</dd>
    <dt>${T("Streuung", "Spread")}</dt><dd>${calm ? `<span class="dir-calm">${T("schwacher Wind, Richtung wechselnd", "light wind, direction variable")}</span>` : sp==null?"–":"±"+Math.round(sp)+"° "+(sp<20?T("(einig)","(agree)"):sp<45?T("(mäßig)","(moderate)"):T("(unsicher)","(uncertain)"))}</dd>
    <dt>${T("Stärke", "Strength")}</dt><dd>${fwu(h.med)} · ${T("Böe", "Gust")} ${fw(h.gMed)}</dd>
    <dt>${T("Modelle", "Models")}</dt><dd>${dirs.length}</dd>`;
  $("compassHour").textContent = `${dayLabel(state.times[i].slice(0,10),true)} · ${hh(state.times[i])}${UHR()}`;
}

/* Richtung je Arbeitsstunde als Pfeilreihe, dazu Lee-Seite und Winddrehung */
const DIR_TURN = 45;      // ab dieser Drehung (Grad) Hinweis
const DIR_CALM = 2;       // darunter (m/s) zählt die Richtung für die Drehung nicht und wird blass gezeigt
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
/* Pfeilreihe über alle Tage (Arbeitsstunden, Tage durch Namen getrennt); läuft wie die Leisten mit der Mitte der Diagramme */
let dirKey = "";
function renderDirStrip(sel = state.sel){
  const all = state.hours.filter(h => isWork(h.t)), hs = dayHours(state.day), box = $("dirStrip");
  if(!all.length){ box.innerHTML = ""; $("dirTurn").innerHTML = ""; dirKey = ""; return; }
  const key = state.fetchedAt + "|" + LOC() + "|" + all.map(h => h.i + (h.lampW || h.lamp)[0] + Math.round(h.dir.mean ?? -1) + (h.med != null && h.med < DIR_CALM ? "c" : "")).join();
  if(key !== dirKey){
    dirKey = key;
    box.innerHTML = all.map((h, k) => {
      const d = h.dir.mean, day = h.t.slice(0,10);
      const arrow = d==null ? `<span class="dir-na">–</span>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(${(d+180)%360} 12 12)"><line x1="12" y1="20" x2="12" y2="7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><polygon points="12,2 6.5,10 17.5,10" fill="currentColor"/></g></svg>`;
      const sep = k===0 || day !== all[k-1].t.slice(0,10) ? `<i class="dir-day">${esc(dayLabel(day, true))}</i>` : "";
      return sep + `<button type="button" class="dir-cell d-${h.lampW || h.lamp} ${h.med!=null && h.med < DIR_CALM ? "calm" : ""}" data-i="${h.i}" title="${esc(dayLabel(day, true))} ${hh(h.t)}${UHR()}: ${T("aus", "from")} ${dirName(d)}${d==null?"":" ("+Math.round(d)+"°)"}, ${fwu(h.med)}">${arrow}<span>${hh(h.t)}</span></button>`;
    }).join("");
    if(csCenter != null) requestAnimationFrame(() => barFollow(csCenter));
  }
  box.querySelectorAll(".dir-cell").forEach(b => b.classList.toggle("sel", +b.dataset.i === sel));
  // Lee-Seite zur gewählten Stunde
  const cur = state.hours[sel], lee = cur && cur.dir.mean!=null ? dirName((cur.dir.mean+180)%360) : null;
  // größte Drehung zwischen zwei Arbeitsstunden mit Wind
  const ws = hs.filter(h => h.dir.mean!=null && h.med!=null && h.med >= DIR_CALM);
  let best = null;
  for(let a = 0; a < ws.length; a++) for(let b = a+1; b < ws.length; b++){
    const x = angDiff(ws[a].dir.mean, ws[b].dir.mean);
    if(!best || x > best.x) best = {x, a:ws[a], b:ws[b]};
  }
  const turn = !best || best.x < DIR_TURN
    ? `<span class="dir-ok">${T("Richtung bleibt stabil", "Direction stays stable")}${best ? ` (max. ${Math.round(best.x)}°)` : ""}</span>`
    : `<span class="dir-warn">${T(`Wind dreht um ca. ${Math.round(best.x)}°: ${hh(best.a.t)} Uhr aus ${dirName(best.a.dir.mean)}, ${hh(best.b.t)} Uhr aus ${dirName(best.b.dir.mean)}. Lee-Seite wechselt.`, `Wind turns by approx. ${Math.round(best.x)}°: ${hh(best.a.t)}h from ${dirName(best.a.dir.mean)}, ${hh(best.b.t)}h from ${dirName(best.b.dir.mean)}. Lee side changes.`)}</span>`;
  $("dirTurn").innerHTML = `<span><b>${T("Lee-Seite", "Lee side")}</b> ${hh(cur.t)}${UHR()}: ${lee ?? "–"}</span>${turn}`;
}
