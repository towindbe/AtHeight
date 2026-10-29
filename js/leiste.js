/* Windbericht · mitlaufende Kurzleiste (Ampel, gewählte Stunde, Sprungmarken), sobald das Arbeitsfenster nach oben aus dem Bild ist */
"use strict";

const NAV_SECTIONS = [["chartCard","Wind"], ["sec-richtung","Richtung"], ["sec-regen","Regen"], ["sec-temp","Temperatur"],
  ["sec-modelle","Modelle"], ["sec-ausblick","Ausblick"], ["sec-bericht","Bericht"]];
let stickyPast = false;   // Arbeitsfenster ist nach oben aus dem Bild gescrollt

function renderSticky(){
  const bar = $("stickyBar"); if(!bar) return;
  const h = state.hours[state.sel], day = state.summary;
  if(!h || !day){ bar.hidden = true; return; }
  bar.hidden = !stickyPast;
  $("sbLamp").className = "sb-lamp c-" + day.lamp;
  $("sbLamp").textContent = LAMP_TXT[day.lamp];
  $("sbHour").innerHTML = `<b>${esc(dayLabel(h.t.slice(0,10), true))}, ${hh(h.t)} Uhr</b> <span class="dot d-${h.lamp}"></span> ${esc(fw(h.med))} · Böe ${esc(fwu(h.gMed))}`;
  $("sbPrev").disabled = state.sel <= 0;
  $("sbNext").disabled = state.sel >= state.hours.length - 1;
  renderStrip();
}
/* schmales Arbeitsfenster: eine Zelle je Stunde, wie die große Zeitleiste, zum seitlichen Durchscrollen */
let stripKey = "";
function renderStrip(){
  const box = $("sbStrip"), key = state.fetchedAt + "|" + state.hours.map(h => h.lamp[0]).join("") + "|" + site.from + "-" + site.to;   // Ampelfarben im Schlüssel: neu zeichnen, wenn sich die Bewertung ändert
  if(key !== stripKey){
    stripKey = key;
    const nk = nowKey();
    box.innerHTML = state.hours.map((h, k) => {
      const first = k===0 || h.t.slice(0,10) !== state.hours[k-1].t.slice(0,10);
      return `<button type="button" class="tl-cell c-${h.lamp} ${isWork(h.t)?"":"off"} ${h.dark?"dark":""} ${h.t.slice(0,13)===nk?"nowc":""} ${first?"dstart":""}" data-i="${h.i}" aria-label="${esc(dayLabel(h.t.slice(0,10), true))} ${hh(h.t)} Uhr: ${LAMP_TXT[h.lamp]}, ${esc(fwu(h.med))}"><span>${first ? esc(dayLabel(h.t.slice(0,10))) : hourOf(h.t)%3===0 ? hh(h.t) : ""}</span></button>`;
    }).join("");
  }
  let selBtn = null;
  box.querySelectorAll(".tl-cell").forEach(b => { const on = +b.dataset.i === state.sel; b.classList.toggle("sel", on); if(on) selBtn = b; });
  // gewählte Stunde in die Mitte der Leiste holen (erst nach dem Einblenden messbar; nicht, solange gerade gewischt wird)
  requestAnimationFrame(() => {
    if(!selBtn || !box.clientWidth || Date.now() < stripBusyUntil) return;
    const want = selBtn.offsetLeft + selBtn.offsetWidth/2 - box.clientWidth/2;
    if(Math.abs(want - box.scrollLeft) > 1){ stripIgnoreUntil = Date.now() + 150; box.scrollLeft = want; }
  });
}
/* Wischen durch die Leiste wählt immer die Stunde in der Mitte: Wert oben, Diagramme, Tabellen und Karte laufen mit */
let stripBusyUntil = 0, stripIgnoreUntil = 0, stripRaf = 0;
function stripScrubbed(){
  stripRaf = 0;
  const box = $("sbStrip"), mid = box.scrollLeft + box.clientWidth/2;
  let best = null, bd = Infinity;
  box.querySelectorAll(".tl-cell").forEach(b => { const d = Math.abs(b.offsetLeft + b.offsetWidth/2 - mid); if(d < bd){ bd = d; best = b; } });
  if(best && +best.dataset.i !== state.sel) selectHour(+best.dataset.i);
}

function initSticky(){
  $("sbNav").innerHTML = NAV_SECTIONS.map(([id, t]) => `<button type="button" data-go="${id}">${t}</button>`).join("");
  $("sbNav").addEventListener("click", e => {
    const b = e.target.closest("button[data-go]"), el = b && $(b.dataset.go);
    if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
  });
  $("sbStrip").addEventListener("scroll", () => {
    if(Date.now() < stripIgnoreUntil) return;
    stripBusyUntil = Date.now() + 500;
    if(!stripRaf) stripRaf = requestAnimationFrame(stripScrubbed);
  }, {passive:true});
  $("sbStrip").addEventListener("click", e => { const b = e.target.closest(".tl-cell"); if(b) selectHour(+b.dataset.i); });
  $("sbPrev").onclick = () => selectHour(state.sel - 1);
  $("sbNext").onclick = () => selectHour(state.sel + 1);
  if("IntersectionObserver" in window){
    new IntersectionObserver(([en]) => { stickyPast = !en.isIntersecting && en.boundingClientRect.top < 0; renderSticky(); }).observe($("sec-zeit"));
  }
}
initSticky();
