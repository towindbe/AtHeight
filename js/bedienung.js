/* Windbericht · Knöpfe, Einstellungen, Drucken */
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
  const open = $("ensInfo").hidden; $("ensInfo").hidden = !open;
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
    work: $("s_work").value.trim()==="" ? null : clamp(Math.round(num("s_work",0)),10,300), path:$("s_path").checked,
    wind:num("s_wind",site.wind), gust:num("s_gust",site.gust), from:clamp(Math.round(num("s_from",site.from)),0,23), to:clamp(Math.round(num("s_to",site.to)),0,23)};
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
document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
  state.view = b.dataset.view;
  document.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", String(x===b)));
  if(state.fetchedAt) renderChart();
});
$("printBtn").onclick = async () => { if(!state.fetchedAt) return; await buildReport(); window.print(); };
const appTitle = document.title;
window.addEventListener("beforeprint", () => { if(state.fetchedAt) document.title = `Tagesbericht ${site.name} ${state.day}`; });
window.addEventListener("afterprint", () => { document.title = appTitle; });
$("jsonBtn").onclick = async () => {
  if(!state.fetchedAt) return;
  const {snap, hash} = await buildReport();
  const blob = new Blob([JSON.stringify({...snap, pruefsumme:hash}, null, 2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `windbericht_${site.name.replace(/\W+/g,"_")}_${state.day}.json`; document.body.appendChild(a); a.click(); a.remove();
};
/* Hell/Dunkel: Standard dunkel, Wahl wird gespeichert; Diagramme lesen die Farben neu */
function applyTheme(light){
  if(light) document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme;
  try{ localStorage.setItem("wb_theme", light ? "light" : "dark"); }catch(e){}
  $("themeBtn").textContent = light ? "☾" : "☀";
  $("themeBtn").title = $("themeBtn").ariaLabel = light ? "Dunkle Ansicht" : "Helle Ansicht";
  $("themeBtn").setAttribute("aria-pressed", String(light));
  document.querySelector('meta[name="theme-color"]').content = light ? "#eef1f4" : "#0d1217";
  if(state.fetchedAt) render();
}
$("themeBtn").onclick = () => applyTheme(document.documentElement.dataset.theme !== "light");
if(document.documentElement.dataset.theme === "light") applyTheme(true);   // Knopf und Browserleiste passend zur gespeicherten Wahl
