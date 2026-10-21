/* Windbericht · Entscheidung, Kacheln, Zeitleiste, Tagauswahl, Hinweis bei alten Daten */
"use strict";

/* ---------- Darstellung ---------- */
function render(){
  fillSettings();
  renderHero(); renderTimeline(); renderDayTabs();
  renderChart(); renderSelected(); renderRain(); renderTemp(); renderMatrix();
  renderHourTable(); renderModelTable(); renderOutlook();
  if(typeof applyUnitLabels==="function") applyUnitLabels();
}
function renderSelected(){ renderNow(); renderCompass(); renderProfile(); updateMap(); highlightSel(); }

function fillSettings(){
  $("s_name").value = site.name; $("s_lat").value = site.lat; $("s_lon").value = site.lon;
  $("s_work").value = site.work ?? ""; $("s_access").value = accessMode();
  $("s_hub").value = site.hub; $("s_rotor").value = site.rotor; $("s_unit").value = windUnit;
  setWindField("s_wind", site.wind); setWindField("s_gust", site.gust); setWindField("s_nwind", nightWind()); setWindField("s_ngust", nightGust());
  $("s_from").value = site.from; $("s_to").value = site.to;
  $("siteTitle").textContent = site.name;
  $("siteMeta").innerHTML = `<span>Arbeit ${zoneTxt()}</span><span>Grenze ${fw(site.wind)} · Böe ${fwu(site.gust)}</span><span>${site.from}–${site.to} Uhr</span>`;
  // Hinweis, bis die Werte dieser Anlage einmal bestätigt wurden
  const todo = siteChosen && !site.checked;
  $("setupHint").hidden = !todo;
  $("settingsBtn").classList.toggle("pulse-hint", todo && $("settings").hidden);
}

/* Hinweis bei alten Daten: die Modelle rechnen mehrmals täglich neu */
const STALE_MS = 3*36e5;
function fmtAge(ms){ const m = Math.round(ms/6e4), h = Math.floor(m/60); return h ? `${h} h ${m%60} min` : `${m} min`; }
function checkStale(){
  if(!state.fetchedAt) return;
  const age = Date.now() - state.fetchedAt, stale = age > STALE_MS;
  $("staleBox").hidden = !stale;
  if(stale) $("staleText").textContent = `Wetterdaten sind ${fmtAge(age)} alt (Abruf ${state.fetchedAt.toLocaleString("de-DE",{weekday:"short", hour:"2-digit", minute:"2-digit"})}). Vor der Freigabe neu laden.`;
}
setInterval(checkStale, 6e4);
document.addEventListener("visibilitychange", () => { if(!document.hidden) checkStale(); });
function renderHero(){
  const sum = buildSummary(dayHours(state.day));
  state.summary = sum;
  $("lamp").className = "lamp " + sum.lamp; $("lamp").innerHTML = (LAMP_ICON[sum.lamp] || "") + `<span>${LAMP_TXT[sum.lamp]}</span>`;
  const dl = daylight(state.day);
  $("heroDay").textContent = `${new Date(state.day+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short", day:"2-digit", month:"2-digit"})} · Arbeitszeit ${site.from}–${site.to} Uhr` + (dl.start && dl.end ? ` · hell ${dl.start}–${dl.end}` : "");
  $("headline").textContent = sum.head; $("summary").textContent = sum.text;
  checkStale();
  const u = usableModels();
  // Warnungen, die den gewählten Tag berühren
  const {ws, kind, note} = warnState(state.day);
  $("warnBox").hidden = false;
  $("warnBox").className = "warnbox needs-data " + kind;
  $("warnBox").innerHTML = kind==="list"
    ? `<b>Amtliche Warnungen</b>` + ws.map(w => `<div class="wb-${!w.relevant ? "info" : w.lvl>=3 ? "stop" : "warn"}">
      <span>${esc(w.src)}: ${esc(w.title)}</span><small>${esc(fmtWhen(w.start))} bis ${esc(fmtWhen(w.end))}</small></div>`).join("") + (note ? `<small>${esc(note)}</small>` : "")
    : `<span>${kind==="ok" ? "✓ " : ""}${esc(note)}</span>`;
  const nt = nightText(nightRig(state.day));
  $("rigBox").hidden = !nt;
  if(nt){ $("rigBox").className = "rigbox needs-data r-" + nt.lvl; $("rigBox").innerHTML = `<b>${nt.lvl==="go" ? "✓ " : "⚠ "}${esc(nt.head)}</b><small>${esc(nt.text)}</small>`; }
  const wsrc = [extras.dwd?.ok===false ? "DWD nicht abrufbar" : null, extras.geo?.ok===false ? "GeoSphere nicht abrufbar" : null].filter(Boolean);
  $("status").textContent = `Abgerufen ${state.fetchedAt.toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})} · ${u.length} Modelle aktiv, davon ${u.filter(r=>r.m.hi).length} hochauflösend`
    + ` · Warnungen: ${wsrc.length ? wsrc.join(", ") : ws.length ? ws.length+" am gewählten Tag" : "keine"}`
    + ` · Szenarien: ${(extras.ens||[]).filter(e => e.ok).map(e => `${e.name} (${e.members})`).join(" + ") || "nicht verfügbar"}`;
}

function renderNow(){
  const h = state.hours[state.sel]; if(!h) return;
  $("nowLabel").textContent = `${dayLabel(h.t.slice(0,10),true)}, ${hh(h.t)} Uhr`;
  $("nowOff").hidden = isWork(h.t);
  $("nowSel").className = `now-sel s-${h.lamp}`;
  $("nowPrev").disabled = state.sel <= 0;
  $("nowNext").disabled = state.sel >= state.hours.length - 1;
  $("nowWhy").innerHTML = (h.why.length ? h.why : [{l:"go", t:"Alle Werte unter euren Grenzwerten"}])
    .map(w => `<li class="w-${w.l}"><span class="dot d-${w.l==="info"?"none":w.l}"></span>${esc(w.t)}</li>`).join("");
  const cells = [
    ["Wind "+zoneTxt(), fw(h.med), WU()+" Median", h.med>site.wind],
    ["Böe "+zoneTxt(), fw(h.gMed), WU()+" geschätzt", h.gMed>site.gust],
    ["Richtung", dirName(h.dir.mean), h.dir.mean==null ? "" : Math.round(h.dir.mean)+"° · "+workH()+" m", false],
    ["Modelle", h.n ? `${h.over}/${h.n}` : "–", "über Grenze", h.over>0 && h.over>=h.n/2],
    ['Zu windig <button type="button" class="info-btn" id="ensInfoBtn" aria-expanded="false" aria-controls="ensInfo" title="Was bedeutet das?">?</button>', h.pEns==null ? "–" : riskTen(h.pEns), h.pEns==null ? "Szenarien nicht verfügbar" : riskHtml(h.pEns, h.nEns).replace(/>[^<]*<\/span>$/, `>der ${h.nEns} Szenarien</span>`), h.pEns!=null && h.pEns>=ENS_WARN],
    ["Temperatur "+workH()+" m", h.tW==null ? "–" : fmt(h.tW,0)+" °C", h.chill==null ? "" : "gefühlt "+fmt(h.chill,0)+" °C", h.chill!=null && h.chill<=CHILL_WARN]
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
      `<button type="button" class="tl-cell c-${h.lamp} ${isWork(h.t)?"":"off"} ${h.dark?"dark":""} ${h.t.slice(0,13)===nk?"nowc":""}" data-i="${h.i}" title="${esc(h.why.map(w=>w.t).join(" · "))}" aria-label="${dayLabel(d,true)} ${hh(h.t)} Uhr: ${LAMP_TXT[h.lamp]}, ${fwu(h.med)}"><span>${hourOf(h.t)%3===0?hh(h.t):""}</span></button>`).join("");
    return `<div class="tl-day ${d===state.day?"cur":""}"><span class="eyebrow">${esc(dayLabel(d))}</span><div class="tl-hours">${cells}</div></div>`;
  }).join("");
  $("timeline").querySelectorAll(".tl-cell").forEach(b => b.onclick = () => selectHour(+b.dataset.i, true));
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
}
function highlightSel(){
  $("timeline").querySelectorAll(".tl-cell").forEach(b => b.classList.toggle("sel", +b.dataset.i===state.sel));
  document.querySelectorAll(".mx td[data-i]").forEach(td => td.classList.toggle("selcol", +td.dataset.i===state.sel));
}
function selectHour(i, fromTimeline){
  state.sel = i;
  const d = state.times[i].slice(0,10);
  if(d!==state.day){ state.day = d; renderHero(); renderDayTabs(); renderTimeline(); renderChart(); renderRain(); renderTemp(); renderMatrix(); renderHourTable(); renderModelTable(); }
  renderSelected();
  if(charts.main) charts.main.update("none");
  if(charts.rain) charts.rain.update("none");
  if(charts.temp) charts.temp.update("none");
}

function renderDayTabs(){
  const days = [...new Set(state.times.map(t=>t.slice(0,10)))];
  $("dayTabs").innerHTML = days.map(d => { const l = buildSummary(dayHours(d)).lamp;
    return `<button type="button" data-day="${d}" aria-pressed="${d===state.day}" aria-label="${esc(dayLabel(d,true))}: ${LAMP_TXT[l]}"><i class="dot d-${l}"></i>${esc(dayLabel(d,true))}</button>`; }).join("");
  $("dayTabs").querySelectorAll("button").forEach(b => b.onclick = () => {
    state.day = b.dataset.day; state.sel = defaultSel(state.day);
    renderHero(); renderDayTabs(); renderTimeline(); renderChart(); renderRain(); renderTemp(); renderMatrix(); renderHourTable(); renderModelTable(); renderSelected();
  });
}

function chartBase(yTitle){
  const muted = css("--muted"), line = css("--line");
  return {responsive:true, maintainAspectRatio:false, animation:false, interaction:{mode:"index", intersect:false},
    plugins:{legend:{display:false}},
    scales:{x:{ticks:{color:muted, font:{family:"IBM Plex Mono", size:10}, maxRotation:0, autoSkip:true}, grid:{color:line}},
      y:{beginAtZero:true, ticks:{color:muted, font:{family:"IBM Plex Mono", size:10}}, grid:{color:line}, title:{display:!!yTitle, text:yTitle, color:muted}}}};
}
const dayIdx = () => state.times.map((t,i)=>[t,i]).filter(([t])=>t.startsWith(state.day)).map(([,i])=>i);
