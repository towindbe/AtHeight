/* AtHeight · Entscheidung, Kacheln, Zeitleiste, Tagauswahl, Hinweis bei alten Daten */
"use strict";

/* ---------- Darstellung ---------- */
function render(){
  fillSettings();
  renderHero(); renderTimeline(); renderDayTabs();
  renderChart(); renderSelected(); renderRain(); renderTemp(); renderMatrix();
  renderHourTable(); renderModelTable(); renderOutlook();
  if(typeof applyUnitLabels==="function") applyUnitLabels();
}
function renderSelected(){ renderNow(); renderCompass(); renderProfile(); updateMap(); highlightSel(); if(typeof renderSticky==="function") renderSticky(); }

/* Felder je nach Einsatzart: Nabe, Rotor und Gondel-Zugang nur an Windenergieanlagen */
function applyEinsatzUI(){
  const on = $("s_windkraft").checked;
  $("lbl_hub").hidden = $("lbl_rotor").hidden = !on;
  $("opt_nacelle").hidden = $("opt_nacelle").disabled = !on;
  if(!on && $("s_access").value === "nacelle") $("s_access").value = "ground";
  $("s_work").placeholder = on ? T("= Nabe", "= hub") : T("z. B. 40", "e.g. 40");
}
function fillSettings(){
  $("s_name").value = site.name; $("s_lat").value = site.lat; $("s_lon").value = site.lon;
  $("s_work").value = site.work ?? ""; $("s_access").value = accessMode();
  $("s_hub").value = site.hub; $("s_rotor").value = site.rotor; $("s_unit").value = windUnit;
  $("s_windkraft").checked = isWind(); applyEinsatzUI(); $("lbl_turbine").hidden = !isWind();
  setWindField("s_wind", site.wind); setWindField("s_gust", site.gust); setWindField("s_nwind", nightWind()); setWindField("s_ngust", nightGust());
  $("s_from").value = site.from; $("s_to").value = site.to; $("s_mintemp").value = minTemp();
  $("s_coatrh").value = coatRh(); $("s_coatdew").value = coatDew(); $("s_coatstop").checked = !!site.coatStop;
  $("siteTitle").textContent = site.name;
  // Eckdaten: am PC als Chips „Beschriftung Wert“, am Handy als drei Kennzahlen mit kleiner Beschriftung darüber (CSS)
  const kz = (lab, val) => `<span><small>${lab}</small> <b>${val}</b></span>`;
  $("siteMeta").innerHTML = kz(T("Arbeitshöhe", "Work height"), zoneTxt()) + kz(T("Grenze Wind/Böe", "Limit wind/gust"), `${fw(site.wind)} / ${fwu(site.gust)}`)
    + kz(T("Arbeitszeit", "Working hours"), `${String(site.from).padStart(2,"0")}–${site.to}${UHR()}`);
  // Hinweis, bis die Werte dieser Baustelle einmal bestätigt wurden
  const todo = siteChosen && !site.checked;
  $("setupHint").hidden = !todo;
  $("settingsBtn").classList.toggle("pulse-hint", todo && $("settings").hidden);
}

/* Hinweis bei alten Daten: die Modelle rechnen mehrmals täglich neu */
const STALE_MS = 3*36e5;
/* Testversion: Resttage aus dem Antwortkopf des Proxys (nur mit Zugangs-Token) */
function zeigeTest(){
  const b = $("testBox");
  b.hidden = !testStand;
  if(!testStand) return;
  const n = testStand.rest, bis = new Date(testStand.bis+"T12:00:00").toLocaleDateString(LOC(), {day:"2-digit", month:"2-digit", year:"numeric"});
  b.textContent = n > 0 ? T(`Testversion: noch ${n} ${n===1 ? "Tag" : "Tage"} (bis ${bis})`, `Trial version: ${n} ${n===1 ? "day" : "days"} left (until ${bis})`) : n === 0 ? T(`Testversion: heute letzter Tag (bis ${bis})`, `Trial version: last day today (until ${bis})`) : T(`Testzeitraum beendet (${bis})`, `Trial period ended (${bis})`);
}
function fmtAge(ms){ const m = Math.round(ms/6e4), h = Math.floor(m/60); return h ? `${h} h ${m%60} min` : `${m} min`; }
function checkStale(){
  if(!state.fetchedAt) return;
  const age = Date.now() - state.fetchedAt, off = !!state.offlineAt, stale = off || age > STALE_MS;
  $("staleBox").hidden = !stale;
  if(off) $("staleText").textContent = T(`Keine Verbindung: gespeicherter Stand von ${state.fetchedAt.toLocaleString(LOC(),{weekday:"short", hour:"2-digit", minute:"2-digit"})} (${fmtAge(age)} alt). Nicht für die Freigabe verwenden, sobald wieder Netz da ist neu laden.`, `No connection: saved data from ${state.fetchedAt.toLocaleString(LOC(),{weekday:"short", hour:"2-digit", minute:"2-digit"})} (${fmtAge(age)} old). Do not use for release; reload as soon as you are online again.`);
  else if(stale) $("staleText").textContent = T(`Wetterdaten sind ${fmtAge(age)} alt (Abruf ${state.fetchedAt.toLocaleString(LOC(),{weekday:"short", hour:"2-digit", minute:"2-digit"})}). Vor der Freigabe neu laden.`, `Weather data is ${fmtAge(age)} old (fetched ${state.fetchedAt.toLocaleString(LOC(),{weekday:"short", hour:"2-digit", minute:"2-digit"})}). Reload before release.`);
}
setInterval(checkStale, 6e4);
document.addEventListener("visibilitychange", () => { if(!document.hidden) checkStale(); });
function renderHero(){
  let sum = buildSummary(dayHours(state.day));
  // Solange Höhen und Grenzwerte der Baustelle nicht bestätigt sind, gibt es keine Bewertung (die Werte sind nur Beispiele)
  const unconfirmed = siteChosen && !site.checked;
  document.body.classList.toggle("unconfirmed", unconfirmed);
  if(unconfirmed) sum = {...sum, lamp:"none", head:T("Erst Höhen und Grenzwerte bestätigen", "Confirm heights and limits first"), text:T("Die Werte dieser Baustelle sind noch Beispielwerte. Bitte unter Einstellungen prüfen und „Übernehmen“ antippen, erst dann gilt die Bewertung.", "The values of this site are still example values. Please check them under Settings and tap “Apply”; only then does the assessment apply.")};
  state.summary = sum;
  $("confirmCta").hidden = !unconfirmed;
  if(unconfirmed){ $("lamp").className = "lamp pending"; $("lamp").innerHTML = icon("gear", 18) + `<span>${T("OFFEN", "PENDING")}</span>`; }   // statt leerer Lampe: noch einzurichten
  else{ $("lamp").className = "lamp " + sum.lamp; $("lamp").innerHTML = (LAMP_ICON[sum.lamp] || "") + `<span>${LAMP_TXT[sum.lamp]}</span>`; }
  const dl = daylight(state.day);
  $("heroDay").textContent = `${kurzDatum(state.day)} · ${T("Arbeitszeit", "Working hours")} ${site.from}–${site.to}${UHR()}` + (dl.start && dl.end ? ` · ${T("hell", "daylight")} ${dl.start}–${dl.end}` : "");
  $("headline").textContent = sum.head; $("summary").textContent = sum.text;
  renderInstrument(sum);
  $("rainNote").textContent = rainSummary(dayHours(state.day));
  $("dewNote").textContent = dewDaySummary(dayHours(state.day));
  renderCoatBar();
  renderChange();
  checkStale();
  const u = usableModels();
  // Warnungen, die den gewählten Tag berühren
  const {ws, kind, note} = warnState(state.day);
  $("warnBox").hidden = false;
  $("warnBox").className = "warnbox needs-data " + kind;
  $("warnBox").innerHTML = kind==="list"
    ? `<b>${T("Amtliche Warnungen", "Official warnings")}</b>` + ws.map(w => `<div class="wb-${!w.relevant ? "info" : w.lvl>=3 ? "stop" : "warn"}">
      <span>${esc(w.src)}: ${esc(w.title)}</span><small>${esc(fmtWhen(w.start))} ${T("bis", "to")} ${esc(fmtWhen(w.end))}</small></div>`).join("") + (note ? `<small>${esc(note)}</small>` : "")
    : kind==="ok" ? `<b>${T("Keine amtlichen Warnungen", "No official warnings")}</b><small>${esc(note.replace(/^(Keine amtlichen Warnungen für |No official warnings for )/, "").replace(/\.$/, ""))}</small>`
    : `<b>${T("Amtliche Warnungen", "Official warnings")}</b><small>${esc(note)}</small>`;
  const sg = spreadGroups(state.day);
  $("spreadBox").hidden = !sg || !sg.all;
  if(sg && sg.all){
    const row = (t, g) => g ? `<span class="sg"><span>${t} (${g.n}):</span><b>${fw(g.lo)}–${fwu(g.hi)}</b><small>${T("Mitte", "middle")} ${fw(g.med)}</small></span>` : "";
    $("spreadBox").className = "spreadbox needs-data s-" + sg.lvl;
    $("spreadBox").innerHTML = sg.lvl==="unsicher"
      ? `<b>${T("Lage unsicher: die Modelle sind sich nicht einig", "Situation uncertain: the models disagree")}</b>
      <small>${T("Höchster Wind in der Arbeitszeit je Modellgruppe (hochauflösend 1–5 km, sonst 7–25 km):", "Highest wind during working hours per model group (high resolution 1–5 km, otherwise 7–25 km):")}</small>
      ${row(T("Hochauflösend", "High resolution"), sg.hi)}${row(T("Regional/Global", "Regional/global"), sg.lo)}
      ${sg.hi ? "" : `<small>${T("Hochauflösende Modelle reichen nur 1–2 Tage weit.", "High-resolution models only reach 1–2 days ahead.")}</small>`}
      <small>${T("Am stürmischsten", "Windiest")}: ${esc(sg.top.r.m.name)} (${esc(sg.top.r.m.org)}) ${T("mit", "with")} ${fwu(sg.top.v)}${sg.pMax!=null ? ` · ${T("Zu windig bis", "Too windy up to")} ${riskTen(sg.pMax)} ${T("der Szenarien", "of scenarios")}` : ""}.</small>
      <small>${T("Ausreißer nicht einfach ausschließen, sie können recht haben. Neuere Läufe abwarten, vor der Abfahrt neu laden, vor Ort messen.", "Do not simply exclude outliers, they may be right. Wait for newer runs, reload before leaving, measure on site.")}</small>`
      : `<b>${sg.lvl==="einig" ? T("Modelle weitgehend einig", "Models largely agree") : T("Modelle streuen mäßig", "Models spread moderately")}</b>
      ${row(T("Höchster Wind in der Arbeitszeit, alle Modelle", "Highest wind during working hours, all models"), sg.all)}
      ${sg.lvl==="maessig" ? `<small>${T("Am stürmischsten", "Windiest")}: ${esc(sg.top.r.m.name)} (${esc(sg.top.r.m.org)}) ${T("mit", "with")} ${fwu(sg.top.v)}.</small>` : ""}`;
  }
  // Randlage in der Modellzelle: nur Hinweis, wenn bei mehreren hochauflösenden Modellen die Nachbarzelle nahe liegt
  const hiRes = usableModels().filter(r => r.m.hi), edgy = hiRes.map(r => ({r, c:cellPos(r)})).filter(x => x.c && (x.c.edge || x.c.far));
  const showCell = hiRes.length >= 2 && edgy.length >= 2 && edgy.length >= 0.3*hiRes.length;
  $("cellBox").hidden = !showCell;
  if(showCell) $("cellBox").innerHTML = `<b>${T("Standort liegt am Rand der Modellzelle", "Site lies at the edge of the model cell")}</b>
    <small>${T("Bei", "For")} ${edgy.length} ${T("von", "of")} ${hiRes.length} ${T("hochauflösenden Modellen", "high-resolution models")} (${edgy.slice(0,4).map(x => `${esc(x.r.m.name)} ${x.c.dir}`).join(", ")}${edgy.length > 4 ? " …" : ""}). ${T("Die Nachbarzelle kann anderen Wind rechnen, besonders am Ufer, an Kuppen und im Tal. Vor Ort messen.", "The neighbouring cell may compute different wind, especially on shores, hilltops and in valleys. Measure on site.")}</small>`;
  const nt = nightText(nightRig(state.day));
  $("rigBox").hidden = !nt;
  if(nt){ $("rigBox").className = "rigbox needs-data r-" + nt.lvl; $("rigBox").innerHTML = `<b>${esc(nt.head)}</b><small>${esc(nt.text)}</small>`; }
  const wsrc = [extras.dwd?.ok===false ? T("DWD nicht abrufbar", "DWD unavailable") : null, extras.geo?.ok===false ? T("GeoSphere nicht abrufbar", "GeoSphere unavailable") : null].filter(Boolean);
  $("status").textContent = T(`Abgerufen ${state.fetchedAt.toLocaleString(LOC(),{dateStyle:"short",timeStyle:"short"})} · ${u.length} Modelle aktiv, davon ${u.filter(r=>r.m.hi).length} hochauflösend`, `Fetched ${state.fetchedAt.toLocaleString(LOC(),{dateStyle:"short",timeStyle:"short"})} · ${u.length} models active, ${u.filter(r=>r.m.hi).length} of them high resolution`)
    + ` · ${T("Warnungen", "Warnings")}: ${wsrc.length ? wsrc.join(", ") : ws.length ? ws.length + T(" am gewählten Tag", " on the selected day") : T("keine", "none")}`
    + ` · ${T("Ensemble (Szenarien)", "Ensemble (scenarios)")}: ${(extras.ens||[]).filter(e => e.ok).map(e => `${e.name} (${e.members})`).join(" + ") || T("nicht verfügbar", "not available")}`;
}

/* Instrument im Überblick: Arbeitsfenster groß, Stundenleiste der Arbeitszeit (antippen wählt die Stunde), drei Kennzahlen.
   Im Beschichten-Modus: Feuchte, Taupunktabstand und Wind. Farben nach denselben Schwellen wie überall. */
function renderInstrument(sum){
  const hs = dayHours(state.day).filter(h => h.n), p2 = n => String(n).padStart(2, "0");
  let win = null;
  if(sum.lamp !== "none" && hs.length){
    if(sum.counts?.go === hs.length) win = `${p2(site.from)}–${p2(site.to)}`;
    else if(sum.best) win = `${hh(sum.best.start)}–${p2(hourOf(sum.best.end) + 1)}`;
  }
  /* Ohne klares Fenster statt eines Strichs ein kurzer Text in kleinerer Schrift */
  const noData = sum.lamp === "none" || !hs.length;
  $("instWin").textContent = win ?? (noData ? T("keine Daten", "no data") : T("kein Fenster", "no window"));
  $("instWin").classList.toggle("empty", !win);
  $("instUnit").textContent = win ? T("Uhr", "h") : "";
  $("instStrip").innerHTML = hs.map(h => `<button type="button" class="ic c-${h.lamp}${h.i===state.sel ? " sel" : ""}" data-i="${h.i}" aria-label="${hh(h.t)}${UHR()}: ${LAMP_TXT[h.lamp]}"><span>${hourOf(h.t) % 3 === 0 ? hh(h.t) : ""}</span></button>`).join("");
  $("instStrip").querySelectorAll(".ic").forEach(b => b.onclick = () => selectHour(+b.dataset.i));
  const max = k => { const v = hs.map(h => h[k]).filter(x => x!=null); return v.length ? Math.max(...v) : null; };
  const min = k => { const v = hs.map(h => h[k]).filter(x => x!=null); return v.length ? Math.min(...v) : null; };
  const lim = (v, l) => v==null ? "" : v > l ? "m-stop" : v >= l*.75 ? "m-warn" : "";
  const tile = (label, value, unit, cls) => `<div class="${cls}"><small>${label}</small><b>${value ?? "–"}<i>${value==null ? "" : unit}</i></b></div>`;
  const wMax = max("med"), gMax = max("gMed");
  if(coatOn(state.day)){
    const rh = max("rh"), dew = min("dew"), bad = site.coatStop ? "m-stop" : "m-warn";
    $("instMetrics").innerHTML = tile(T("Feuchte max", "Humidity max"), rh==null ? null : Math.round(rh), "%", rh!=null && rh > coatRh() ? bad : "")
      + tile(T("Taupunktabst.", "Dew pt spread"), dew==null ? null : dew <= 0 ? T("Tau", "Dew") : fmt(dew,1), dew!=null && dew > 0 ? "°C" : "", dew!=null && dew < coatDew() ? bad : "")
      + tile("Wind max", wMax==null ? null : fw(wMax), WU(), lim(wMax, site.wind));
  } else {
    const tMin = min("tW"), tMax = max("tW");
    $("instMetrics").innerHTML = tile("Wind max", wMax==null ? null : fw(wMax), WU(), lim(wMax, site.wind))
      + tile(T("Böe max", "Gust max"), gMax==null ? null : fw(gMax), WU(), lim(gMax, site.gust))
      + tile(T("Temp.", "Temp."), tMin==null ? null : (Math.round(tMin)===Math.round(tMax) ? fmt(tMin,0) : `${fmt(tMin,0)}…${fmt(tMax,0)}`), "°C", tMin!=null && tMin < minTemp() ? "m-stop" : "");
  }
}
/* Schalter „Beschichten-Modus“ im Überblick (gilt für alle Tage bis zum Ausschalten, höchstens 7 Tage); ist er an, steht der Modus mit Grenzen und Ergebnis gut sichtbar daneben */
function renderCoatBar(){
  const on = coatOn(state.day), k = v => fmt(v, v%1 ? 1 : 0);
  document.body.classList.toggle("coat-on", on);   // im Beschichten-Modus bleibt die Temperatur auch in der einfachen Ansicht sichtbar
  $("coatBar").classList.toggle("on", on);
  $("coatBtn").setAttribute("aria-pressed", String(on));
  $("coatLbl").textContent = on ? T("Beschichten-Modus an", "Coating mode on") : T("Beschichten-Modus", "Coating mode");
  $("coatInfo").textContent = on ? T(`Grenzen: höchstens ${coatRh()} % Feuchte, Taupunktabstand mind. ${k(coatDew())} °C${site.coatStop ? ", setzt die Ampel auf STOP" : " (nur Hinweis)"}. `, `Limits: at most ${coatRh()} % humidity, dew point spread at least ${k(coatDew())} °C${site.coatStop ? ", sets the traffic light to STOP" : " (note only)"}. `) + coatDaySummary(dayHours(state.day)) : "";
}
function toggleCoat(){
  setCoat(coatOn(state.day) ? null : coatDefaultEnd());
  state.hours = computeHours(state.results, state.times);
  render();
}
function renderNow(){
  const h = state.hours[state.sel]; if(!h) return;
  $("nowLabel").textContent = `${dayLabel(h.t.slice(0,10),true)}, ${hh(h.t)}${UHR()}`;
  $("nowOff").hidden = isWork(h.t);
  $("nowSel").className = `now-sel s-${h.lamp}`;
  $("nowPrev").disabled = state.sel <= 0;
  $("nowNext").disabled = state.sel >= state.hours.length - 1;
  $("nowWhy").innerHTML = (h.why.length ? h.why : [{l:"go", t:T("Alle Werte unter euren Grenzwerten", "All values below your limits")}])
    .map(w => `<li class="w-${w.l}"><span class="dot d-${w.l==="info"?"none":w.l}"></span>${esc(w.t)}</li>`).join("");
  const cells = [
    ["Wind "+zoneTxt(), fw(h.med), WU()+" Median", h.med>site.wind],
    [T("Böe ", "Gust ")+zoneTxt(), fw(h.gMed), WU()+T(" geschätzt", " estimated"), h.gMed>site.gust],
    [T("Richtung", "Direction"), dirName(h.dir.mean), h.dir.mean==null ? "" : Math.round(h.dir.mean)+"° · "+workH()+" m", false],
    [T("Modelle", "Models"), h.n ? `${h.over}/${h.n}` : "–", T("über Grenze", "above limit"), h.over>0 && h.over>=h.n/2],
    [`${T("Zu windig", "Too windy")} <button type="button" class="info-btn" id="ensInfoBtn" aria-expanded="false" aria-controls="ensInfo" title="${T("Was bedeutet das?", "What does this mean?")}">?</button>`, h.pEns==null ? "–" : riskTen(h.pEns), h.pEns==null ? T("Szenarien nicht verfügbar", "Scenarios not available") : riskHtml(h.pEns, h.nEns).replace(/>[^<]*<\/span>$/, `>${T("der", "of")} ${h.nEns} ${T("Szenarien", "scenarios")}</span>`), h.pEns!=null && h.pEns>=ENS_WARN],
    [T("Temperatur ", "Temperature ")+workH()+" m", h.tW==null ? "–" : fmt(h.tW,0)+" °C", h.chill==null ? "" : T("gefühlt ", "feels like ")+fmt(h.chill,0)+" °C", h.tW!=null && h.tW<minTemp()]
  ];
  const infoOpen = $("ensInfo") && !$("ensInfo").hidden;
  $("nowBox").innerHTML = cells.map(([a,b,c,o]) => `<div class="${o?"over":""}"><small>${a}</small><b>${b}</b><small>${c}</small></div>`).join("");
  $("ensInfoBtn")?.setAttribute("aria-expanded", String(infoOpen));
}

function renderTimeline(){
  const days = [...new Set(state.times.map(t=>t.slice(0,10)))];
  const nk = nowKey();
  $("timeline").innerHTML = days.map(d => {
    const cells = state.hours.filter(h=>h.t.startsWith(d)).map(h =>
      `<button type="button" class="tl-cell c-${h.lamp} ${isWork(h.t)?"":"off"} ${h.dark?"dark":""} ${h.t.slice(0,13)===nk?"nowc":""}" data-i="${h.i}" title="${esc(h.why.map(w=>w.t).join(" · "))}" aria-label="${dayLabel(d,true)} ${hh(h.t)}${UHR()}: ${LAMP_TXT[h.lamp]}, ${fwu(h.med)}"><span>${hourOf(h.t)%3===0?hh(h.t):""}</span></button>`).join("");
    return `<div class="tl-day ${d===state.day?"cur":""}" data-day="${d}"><span class="eyebrow">${esc(dayLabel(d))}</span><div class="tl-hours">${cells}</div></div>`;
  }).join("");
  $("timeline").querySelectorAll(".tl-cell").forEach(b => b.onclick = () => selectHour(+b.dataset.i));
  scrollTimeline();
}
function scrollTimeline(){
  // nur seitlich scrollen, die Seite selbst bleibt stehen
  const box = $("tlScroll"), el = $("timeline").querySelector(`[data-i="${state.sel}"]`);
  if(!el) return;
  // Tag möglichst ab seinem Anfang zeigen, sonst die Stunde mittig
  const day = el.closest(".tl-day");
  box.scrollLeft = el.offsetLeft + el.offsetWidth - day.offsetLeft < box.clientWidth
    ? day.offsetLeft : el.offsetLeft - box.clientWidth/2 + el.offsetWidth/2;
  box._want = box.scrollLeft;   // vom Programm verschoben: Diagramme nicht nachziehen
}
function highlightSel(){
  $("timeline").querySelectorAll(".tl-cell").forEach(b => b.classList.toggle("sel", +b.dataset.i===state.sel));
  $("instStrip").querySelectorAll(".ic").forEach(b => b.classList.toggle("sel", +b.dataset.i===state.sel));
  document.querySelectorAll(".mx td[data-i]").forEach(td => td.classList.toggle("selcol", +td.dataset.i===state.sel));
}
/* Stunde wählen (Antippen, Pfeile, Einrasten nach dem Wischen): alles zeigt diese Stunde, Diagramme und Leisten holen sie in die Mitte */
function selectHour(i){
  state.sel = i;
  const d = state.times[i].slice(0,10);
  if(d!==state.day){ state.day = d; dayChanged(); }
  renderSelected();
  if(typeof csShowHour==="function") csShowHour(i, true);   // Stunde unter den Zeiger in der Mitte holen (gezeichnet wird in syncCharts)
  syncCharts();
}
const syncCharts = () => ["main","rain","temp"].forEach(k => { if(charts[k]) syncTooltip(charts[k]); });
/* Tag gewechselt: alles außer den Diagrammen neu aufbauen (die zeigen ohnehin alle Tage) */
function dayChanged(){
  renderHero(); renderDayTabs(); markTimelineDay();
  renderMatrix(); renderHourTable(); renderModelTable();
  if(typeof chartDayChanged==="function") chartDayChanged();
}
function markTimelineDay(){ $("timeline").querySelectorAll(".tl-day").forEach(e => e.classList.toggle("cur", e.dataset.day === state.day)); }
/* Wertekasten (Tooltip) jedes Diagramms folgt der gewählten Stunde, auch wenn in einem anderen Diagramm gezogen wird */
function syncTooltip(c){
  const k = c.$idxs ? c.$idxs.indexOf(state.sel) : -1;
  const act = [];
  if(k >= 0) c.data.datasets.forEach((d,di) => { if(c.isDatasetVisible(di) && d.data[k] != null && !d.ref) act.push({datasetIndex:di, index:k}); });
  c.setActiveElements(act);
  try{ const el = act.length ? c.getDatasetMeta(act[0].datasetIndex).data[k] : null;
    c.tooltip.setActiveElements(act, el ? {x:el.x, y:el.y} : {x:0, y:0}); }catch(err){}
  c.update("none");
}

function renderDayTabs(){
  const days = [...new Set(state.times.map(t=>t.slice(0,10)))];
  $("dayTabs").innerHTML = days.map(d => { const l = buildSummary(dayHours(d)).lamp;
    return `<button type="button" data-day="${d}" aria-pressed="${d===state.day}" aria-label="${esc(dayLabel(d,true))}: ${LAMP_TXT[l]}"><i class="dot d-${l}"></i>${esc(dayLabel(d,true))}</button>`; }).join("");
  $("dayTabs").querySelectorAll("button").forEach(b => b.onclick = () => goDay(b.dataset.day));
  $("zeitDay").textContent = $("reportDay").textContent = dayLabel(state.day);
}
/* Tag wechseln (Tages-Reiter oben und in der Kurzleiste): alles läuft mit */
function goDay(d){
  state.day = d; state.sel = defaultSel(state.day);
  renderHero(); renderDayTabs(); renderTimeline(); renderMatrix(); renderHourTable(); renderModelTable();
  if(typeof chartDayChanged==="function") chartDayChanged();
  renderSelected();
  if(typeof csShowHour==="function") csShowHour(state.sel, true);
  syncCharts();
}


function chartBase(yTitle){
  const muted = css("--muted"), line = css("--line");
  return {responsive:true, maintainAspectRatio:false, animation:false, interaction:{mode:"index", intersect:false},
    plugins:{legend:{display:false}},
    scales:{x:{ticks:{color:muted, font:{family:"Barlow", size:10}, maxRotation:0, autoSkip:true}, grid:{color:line}},
      y:{beginAtZero:true, ticks:{color:muted, font:{family:"Barlow", size:10}}, grid:{color:line}, title:{display:!!yTitle, text:yTitle, color:muted}}}};
}
const dayIdx = () => state.times.map((t,i)=>[t,i]).filter(([t])=>t.startsWith(state.day)).map(([,i])=>i);
// Stunden für die Diagramme: alle Prognosetage; auf Wunsch ohne Nacht, dunkle Stunden in der Arbeitszeit bleiben immer sichtbar
const chartIdx = () => { const d = state.times.map((t,i) => i); if(!state.nightOff) return d;
  const f = d.filter(i => !(state.hours[i]?.dark && !isWork(state.times[i]))); return f.length ? f : d; };
