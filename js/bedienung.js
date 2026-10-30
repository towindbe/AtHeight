/* JobsiteWX · Knöpfe, Einstellungen, Drucken */
"use strict";

/* ---------- Bedienung ---------- */
function toggleSettings(open){
  $("settings").hidden = !open; $("settingsBtn").setAttribute("aria-expanded", String(open));
  $("settingsBtn").classList.toggle("pulse-hint", !open && siteChosen && !site.checked);
  if(open){ toggleFavs(false); $("settings").scrollIntoView({behavior:"smooth", block:"start"}); }
}
$("siteMeta").onclick = () => toggleSettings(true);
$("nowBox").addEventListener("click", e => {
  if(!e.target.closest("#ensInfoBtn")) return;
  const open = $("ensInfo").hidden; $("ensInfo").hidden = !open; if(open) showHelp($("ensInfo"));
  $("ensInfoBtn").setAttribute("aria-expanded", String(open));
});
$("setupBtn").onclick = () => toggleSettings(true);
$("settingsBtn").onclick = () => toggleSettings($("settings").hidden);
$("cancelBtn").onclick = () => { fillSettings(); toggleSettings(false); };
$("saveBtn").onclick = () => {
  const num = (id, d) => { const v = parseFloat($(id).value); return isNaN(v) ? d : v; };
  const prev = site;
  site = {name: $("s_name").value.trim() || "Standort", lat:clamp(num("s_lat",site.lat),-90,90), lon:clamp(num("s_lon",site.lon),-180,180),
    hub:clamp(num("s_hub",site.hub),20,250), rotor:clamp(num("s_rotor",site.rotor),0,250),
    work: $("s_work").value.trim()==="" ? null : clamp(Math.round(num("s_work",0)),10,300), access:$("s_access").value,
    wind:windField("s_wind",site.wind), gust:windField("s_gust",site.gust), nightWind:windField("s_nwind",nightWind()), nightGust:windField("s_ngust",nightGust()), minTemp:clamp(Math.round(num("s_mintemp",minTemp())),-50,20), from:clamp(Math.round(num("s_from",site.from)),0,23), to:clamp(Math.round(num("s_to",site.to)),0,23)};
  if(prev.excluded?.length && sameSpot(site, prev)) site.excluded = prev.excluded;   // von Hand ausgeschlossene Modelle bleiben, solange der Standort gleich ist
  site.windkraft = $("s_windkraft").checked;
  site.coatRh = clamp(Math.round(num("s_coatrh",coatRh())),30,100); site.coatDew = clamp(num("s_coatdew",coatDew()),0,10); site.coatStop = $("s_coatstop").checked;
  if(!site.windkraft){   // ohne Windenergieanlage: Arbeitshöhe ist die Bezugshöhe, kein Rotor, kein Zugang von der Gondel
    const w = clamp(site.work ?? prev.work ?? prev.hub, 10, 300);
    site.work = w; site.hub = w; site.rotor = 0; if(site.access === "nacelle") site.access = "ground";
  }
  if(site.to < site.from) [site.from, site.to] = [site.to, site.from];
  site.checked = true;
  // ist die Anlage gespeichert, wird der Eintrag mit aktualisiert
  const favs = loadFavs(), k = siteChosen ? favs.findIndex(f => sameSpot(f.site, prev)) : -1;
  if(k >= 0){ favs[k] = {name:site.name, site:{...site}}; saveFavs(favs); }
  siteReady(); saveSite(); toggleSettings(false);
  if(map) map.setView([site.lat, site.lon], Math.max(map.getZoom(), 13));
  $("mapNote").textContent = "Ort suchen oder direkt auf die Anlage tippen. Der Marker lässt sich verschieben. Pfeil: Windrichtung zur gewählten Stunde. Regenradar: DWD, nur Deutschland und Grenzgebiete.";
  load();
};
$("s_windkraft").onchange = applyEinsatzUI;
$("coatBtn").onclick = toggleCoat;
/* Erklärtexte (Klasse help) sind eingeklappt; jede Karte mit solchen Texten bekommt ein „?“ an der Überschrift */
document.querySelectorAll(".card").forEach(card => {
  const h = card.querySelector("h2");
  if(!h || !card.querySelector(".help") || h.querySelector(".info-btn")) return;
  const b = document.createElement("button");
  b.type = "button"; b.className = "info-btn help-btn"; b.textContent = "?";
  b.title = "Erklärung ein- oder ausblenden"; b.setAttribute("aria-expanded", "false");
  b.onclick = () => { const on = card.classList.toggle("show-help"); b.setAttribute("aria-expanded", String(on));
    if(on) showHelp([...card.querySelectorAll(".help")].find(n => n.offsetParent !== null)); };
  // neben die Überschrift (manche Überschriften werden per Text neu gesetzt); steht sie allein, eine Kopfzeile darum bauen
  if(h.parentElement === card){ const head = document.createElement("div"); head.className = "card-head"; h.before(head); head.appendChild(h); }
  const wrap = document.createElement("span"); wrap.className = "h-wrap"; h.before(wrap); wrap.append(h, b);
});
// Symbol-Platzhalter füllen (vor allem anderen, damit Knöpfe ihre Symbole haben)
document.querySelectorAll("[data-ico]").forEach(e => { e.outerHTML = icon(e.dataset.ico); });
/* Design: Standard dunkel auf allen Geräten, per Knopf hell (für draußen). Diagramme lesen ihre Farben beim Zeichnen, deshalb neu zeichnen */
function applyTheme(t){
  if(t==="light") document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme;
  $("themeBtn").innerHTML = icon(t==="light" ? "moon" : "sun");
  $("themeBtn").title = t==="light" ? "Dunkles Design" : "Helles Design (für draußen)";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t==="light" ? "#eef1f4" : "#0d1217");
}
let theme = (() => { try{ return localStorage.getItem("wb_theme")==="light" ? "light" : "dark"; }catch(e){ return "dark"; } })();
applyTheme(theme);
$("themeBtn").onclick = () => {
  theme = theme==="light" ? "dark" : "light";
  try{ localStorage.setItem("wb_theme", theme); }catch(e){}
  applyTheme(theme); if(state.hours.length) render();
};
// Zahnrad neben dem Beschichten-Modus: Einstellungen öffnen, direkt zu den Grenzen springen und sie kurz hervorheben
$("coatGear").onclick = () => {
  fillSettings(); toggleSettings(true);
  setTimeout(() => {
    $("coatSet").scrollIntoView({behavior:"smooth", block:"center"});
    $("coatSet").classList.remove("flash"); void $("coatSet").offsetWidth; $("coatSet").classList.add("flash");
    $("s_coatrh").focus({preventScroll:true});
  }, 350);
};
$("gpsBtn").onclick = () => {
  if(!navigator.geolocation){ $("gpsBtn").textContent = "GPS nicht verfügbar"; return; }
  navigator.geolocation.getCurrentPosition(p => { if(marker){ toggleSettings(false); pointToMap(); setPos(L.latLng(p.coords.latitude, p.coords.longitude)); } else { $("s_lat").value=p.coords.latitude.toFixed(4); $("s_lon").value=p.coords.longitude.toFixed(4);} if(map) map.setView([p.coords.latitude,p.coords.longitude],15); },
    () => { $("gpsBtn").textContent = "Standortfreigabe abgelehnt"; });
};
$("reloadBtn").onclick = load;
$("rankBtn").onclick = computeRanking;
$("staleBtn").onclick = load;
$("searchForm").onsubmit = e => { e.preventDefault(); const q = $("searchInput").value.trim(); if(q.length>=2 && map) search(q); };
$("pickApply").onclick = () => { if(pending) applyPending(); };
$("pickCancel").onclick = cancelPending;
document.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { if(state.fetchedAt) showQuick(b.dataset.q); });
/* Modellauswahl im Windverlauf auf- und zuklappen; Zustand merken */
function mpickOpen(on){
  $("mBody").hidden = !on; $("mToggle").setAttribute("aria-expanded", String(on));
  $("mToggle").querySelector(".mt-arrow").textContent = on ? "▾" : "▸";
  try{ localStorage.setItem("wb_mpick", on ? "1" : "0"); }catch(e){}
}
$("mToggle").onclick = () => mpickOpen($("mBody").hidden);
mpickOpen((() => { try{ return localStorage.getItem("wb_mpick")==="1"; }catch(e){ return false; } })());
$("nowPrev").onclick = () => selectHour(state.sel - 1);
$("nowNext").onclick = () => selectHour(state.sel + 1);
/* Windfelder in den Einstellungen: angezeigt in der gewählten Einheit, gemerkt in m/s (data-ms),
   damit ein Wechsel der Einheit die Grenzwerte nicht durch Rundung verschiebt */
function setWindField(id, ms){
  const el = $(id); el.dataset.ms = ms ?? ""; el.step = U().step;
  el.value = ms==null ? "" : +(ms * U().f).toFixed(windUnit==="ms" ? 2 : 1);
}
function windField(id, d){ const v = parseFloat($(id).dataset.ms); return isNaN(v) || v <= 0 ? d : v; }
["s_wind","s_gust","s_nwind","s_ngust"].forEach(id => $(id).oninput = () => { const v = parseFloat($(id).value); if(!isNaN(v)) $(id).dataset.ms = v / U().f; });
function applyUnitLabels(){
  document.querySelectorAll(".wu").forEach(e => e.textContent = WU());
  document.querySelectorAll("span[data-ms]").forEach(e => e.textContent = fwu(+e.dataset.ms, 0));
}
$("s_unit").onchange = () => {
  const keep = ["s_wind","s_gust","s_nwind","s_ngust"].map(id => [id, parseFloat($(id).dataset.ms)]);
  windUnit = UNITS[$("s_unit").value] ? $("s_unit").value : "ms";
  try{ localStorage.setItem("wb_unit", windUnit); }catch(e){}
  keep.forEach(([id, ms]) => setWindField(id, isNaN(ms) ? null : ms));
  applyUnitLabels();
  if(state.fetchedAt){ state.hours = computeHours(state.results, state.times); render(); }
  renderRanking();
};
applyUnitLabels();
const needConfirm = () => { if(site.checked) return false; alert("Bitte zuerst unter Einstellungen die Höhen und Grenzwerte dieser Anlage prüfen und „Übernehmen“ antippen."); return true; };
$("printBtn").onclick = async () => { if(!state.fetchedAt || needConfirm()) return; await buildReport(); window.print(); };
const appTitle = document.title;
window.addEventListener("beforeprint", () => { if(state.fetchedAt) document.title = `Tagesbericht ${site.name} ${state.day}`; });
window.addEventListener("afterprint", () => { document.title = appTitle; });
$("jsonBtn").onclick = async () => {
  if(!state.fetchedAt || needConfirm()) return;
  const {snap, hash} = await buildReport();
  const blob = new Blob([JSON.stringify({...snap, pruefsumme:hash}, null, 2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `windbericht_${site.name.replace(/\W+/g,"_")}_${state.day}.json`; document.body.appendChild(a); a.click(); a.remove();
};
/* Nur dunkles Design: eine früher gespeicherte helle Wahl entfernen */
try{ localStorage.removeItem("wb_theme"); }catch(e){}
/* Infoseite einblenden (? in der Kopfzeile oder Link in der Fußzeile) */
function infoShow(on){
  if(on && $("infoFrame").src.endsWith("about:blank")) $("infoFrame").src = "info.html?v=2026-10-21w";
  $("infoOverlay").hidden = !on; document.body.classList.toggle("info-open", on);
  if(on) $("infoClose").focus(); else $("infoBtn").focus();
}
$("infoBtn").onclick = () => infoShow(true);
$("infoLink").onclick = e => { e.preventDefault(); infoShow(true); };
$("infoClose").onclick = () => infoShow(false);
document.addEventListener("keydown", e => { if(e.key==="Escape" && !$("infoOverlay").hidden) infoShow(false); });

/* Windverlauf vergrößern (wie die Karte) */
function chartMax(on){
  $("chartCard").classList.toggle("chart-max", on);
  document.body.classList.toggle("map-open", on);
  $("chartMaxBtn").setAttribute("aria-pressed", String(on));
  $("chartMaxBtn").textContent = on ? "✕ Schließen" : "⤢ Vergrößern";
  // am Handy echtes Vollbild und quer, wenn der Browser das erlaubt (sonst bleibt es bei der großen Darstellung)
  const card = $("chartCard");
  if(on){
    if(card.requestFullscreen && matchMedia("(pointer:coarse)").matches) card.requestFullscreen().then(() => screen.orientation?.lock?.("landscape")).catch(() => {});
  }else{
    try{ screen.orientation?.unlock?.(); }catch(e){}
    if(document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setTimeout(() => card.scrollIntoView({block:"start"}), 60);
  }
}
document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && $("chartCard").classList.contains("chart-max")) chartMax(false); });
$("tempLegend").addEventListener("click", e => { const b = e.target.closest("button[data-s]"); if(b) toggleLine(b.dataset.s); });
document.querySelectorAll(".night-btn").forEach(b => b.onclick = toggleNight);
$("chartLegend").addEventListener("click", e => { const b = e.target.closest("button[data-s]"); if(b) toggleLine(b.dataset.s); });
$("chartMaxBtn").onclick = () => chartMax(!$("chartCard").classList.contains("chart-max"));
document.addEventListener("keydown", e => { if(e.key==="Escape" && $("chartCard").classList.contains("chart-max")) chartMax(false); });
