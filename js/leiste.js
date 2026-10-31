/* AtHeight · mitlaufende Kurzleiste (Ampel, gewählte Stunde, Sprungmarken), sobald das Arbeitsfenster nach oben aus dem Bild ist */
"use strict";

const NAV_SECTIONS = () => [["chartCard","Wind"], ["sec-richtung",T("Richtung","Direction")], ["sec-regen",T("Regen","Rain")], ["sec-temp",T("Temperatur","Temperature")],
  ["sec-modelle",T("Modelle","Models")], ["sec-ausblick",T("Ausblick","Outlook")], ["sec-bericht",T("Bericht","Report")]];
let stickyPast = false;   // Arbeitsfenster ist nach oben aus dem Bild gescrollt

const dayList = () => [...new Set(state.times.map(t => t.slice(0,10)))];
function stepDay(n){ const days = dayList(), d = days[days.indexOf(state.day) + n]; if(d) goDay(d); }
function renderSticky(){
  const bar = $("stickyBar"); if(!bar) return;
  const h = state.hours[state.sel], day = state.summary;
  if(!h || !day){ bar.hidden = true; return; }
  bar.hidden = !stickyPast;
  $("sbLamp").className = "sb-lamp c-" + day.lamp;
  $("sbLamp").textContent = LAMP_TXT[day.lamp];
  sbHourText(h);
  const days = dayList(), k = days.indexOf(state.day);
  $("sbPrev").disabled = k <= 0;
  $("sbNext").disabled = k < 0 || k >= days.length - 1;
  renderStickyDays();
  renderStrip();
}
const sbHourText = h => { $("sbHour").innerHTML = `<b>${esc(dayLabel(h.t.slice(0,10), true))}, ${hh(h.t)}${UHR()}</b> <span class="dot d-${h.lamp}"></span> ${esc(fw(h.med))} · ${T("Böe", "Gust")} ${esc(fwu(h.gMed))}`; };
/* Tagesauswahl in der Kurzleiste (ersetzt die Pfeile in den einzelnen Abschnitten): kurz beschriftet, Punkt in Ampelfarbe des Tages */
function renderStickyDays(){
  const days = [...new Set(state.times.map(t => t.slice(0,10)))];
  const key = days.join() + "|" + state.day + "|" + days.map(d => buildSummary(dayHours(d)).lamp).join();
  if($("sbDays").dataset.key === key) return;
  $("sbDays").dataset.key = key;
  $("sbDays").innerHTML = days.map(d => { const l = buildSummary(dayHours(d)).lamp, lab = dayLabel(d, true);
    const short = lab === T("Übermorgen", "Day after") ? new Date(d+"T12:00:00").toLocaleDateString(LOC(), {weekday:"short"}) : lab;
    return `<button type="button" data-day="${d}" aria-pressed="${d===state.day}" aria-label="${esc(lab)}: ${LAMP_TXT[l]}"><i class="dot d-${l}"></i>${esc(short)}</button>`; }).join("");
}
/* schmales Arbeitsfenster: eine Zelle je Stunde wie die große Zeitleiste; Wischen verschiebt den Ausschnitt (wie die Diagramme), Antippen wählt die Stunde */
let stripKey = "";
function renderStrip(){
  const box = $("sbStrip"), key = state.fetchedAt + "|" + state.hours.map(h => h.lamp[0]).join("") + "|" + site.from + "-" + site.to;   // Ampelfarben im Schlüssel: neu zeichnen, wenn sich die Bewertung ändert
  if(key !== stripKey){
    stripKey = key;
    const nk = nowKey();
    box.innerHTML = state.hours.map((h, k) => {
      const first = k===0 || h.t.slice(0,10) !== state.hours[k-1].t.slice(0,10);
      return `<button type="button" class="tl-cell c-${h.lamp} ${isWork(h.t)?"":"off"} ${h.dark?"dark":""} ${h.t.slice(0,13)===nk?"nowc":""} ${first?"dstart":""}" data-i="${h.i}" aria-label="${esc(dayLabel(h.t.slice(0,10), true))} ${hh(h.t)}${UHR()}: ${LAMP_TXT[h.lamp]}, ${esc(fwu(h.med))}"><span>${first ? esc(dayLabel(h.t.slice(0,10))) : hourOf(h.t)%3===0 ? hh(h.t) : ""}</span></button>`;
    }).join("");
  }
  box.querySelectorAll(".tl-cell").forEach(b => b.classList.toggle("sel", +b.dataset.i === state.sel));
  // gleicher Ausschnitt wie die Diagramme (erst nach dem Einblenden messbar)
  if(csCenter != null) requestAnimationFrame(() => barFollow(csCenter));
}

// Sprungmarken der Kurzleiste (beim Sprachwechsel neu aufgebaut)
function initStickyNav(){ $("sbNav").innerHTML = NAV_SECTIONS().map(([id, t]) => `<button type="button" data-go="${id}">${t}</button>`).join(""); $("sbDays").dataset.key = ""; }
function initSticky(){
  initStickyNav();
  $("sbNav").addEventListener("click", e => {
    const b = e.target.closest("button[data-go]"), el = b && $(b.dataset.go);
    if(!el) return;
    el.scrollIntoView({behavior:"smooth", block:"start"});
  });
  $("sbStrip").addEventListener("click", e => { const b = e.target.closest(".tl-cell"); if(b) selectHour(+b.dataset.i); });
  $("sbDays").addEventListener("click", e => { const b = e.target.closest("button[data-day]"); if(b && b.dataset.day !== state.day) goDay(b.dataset.day); });
  $("sbPrev").onclick = () => stepDay(-1);
  $("sbNext").onclick = () => stepDay(1);
  if("IntersectionObserver" in window){
    new IntersectionObserver(([en]) => { stickyPast = !en.isIntersecting && en.boundingClientRect.top < 0; renderSticky(); }).observe($("sec-zeit"));
  }
}
initSticky();

/* Navigation unten (Handy): springt zum Abschnitt; markiert den Abschnitt, der gerade die Bildschirmmitte kreuzt */
function initBottomNav(){
  const nav = $("bottomNav"); if(!nav) return;
  const mark = id => nav.querySelectorAll("button").forEach(b => b.setAttribute("aria-current", b.dataset.go===id ? "page" : "false"));
  nav.addEventListener("click", e => { const b = e.target.closest("button[data-go]"), el = b && $(b.dataset.go); if(!el) return; mark(b.dataset.go); el.scrollIntoView({behavior:"smooth", block:"start"}); });
  if("IntersectionObserver" in window){
    const io = new IntersectionObserver(ens => ens.forEach(en => { if(en.isIntersecting) mark(en.target.id); }), {rootMargin:"-45% 0px -50% 0px"});
    nav.querySelectorAll("button[data-go]").forEach(b => { const el = $(b.dataset.go); if(el) io.observe(el); });
  }
}
initBottomNav();
