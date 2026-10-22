/* Windbericht · mitlaufende Kurzleiste (Ampel, gewählte Stunde, Sprungmarken), sobald die große Ampel aus dem Bild ist */
"use strict";

const NAV_SECTIONS = [["chartCard","Wind"], ["sec-richtung","Richtung"], ["sec-regen","Regen"], ["sec-temp","Temperatur"],
  ["sec-modelle","Modelle"], ["sec-ausblick","Ausblick"], ["sec-bericht","Bericht"]];
let stickyPast = false;   // große Ampel ist nach oben aus dem Bild gescrollt

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
}

function initSticky(){
  $("sbNav").innerHTML = NAV_SECTIONS.map(([id, t]) => `<button type="button" data-go="${id}">${t}</button>`).join("");
  $("sbNav").addEventListener("click", e => {
    const b = e.target.closest("button[data-go]"), el = b && $(b.dataset.go);
    if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
  });
  $("sbPrev").onclick = () => selectHour(state.sel - 1);
  $("sbNext").onclick = () => selectHour(state.sel + 1);
  if("IntersectionObserver" in window){
    new IntersectionObserver(([en]) => { stickyPast = !en.isIntersecting && en.boundingClientRect.top < 0; renderSticky(); }).observe($("lamp"));
  }
}
initSticky();
