/* Windbericht · Karte, Standortwahl, Ortssuche, Erststart */
"use strict";

/* ---------- Karte ---------- */
function initMap(){
  if(typeof L==="undefined"){ $("map").innerHTML = '<p class="note" style="padding:12px">Karte konnte nicht geladen werden.</p>'; return; }
  map = L.map("map", {zoomControl:true, attributionControl:true}).setView([site.lat, site.lon], 14);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');   // ohne Flaggen-Symbol
  satLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom:19, attribution:"Map data © Esri, Maxar, Earthstar Geographics"}).addTo(map);
  marker = L.marker([site.lat, site.lon], {draggable:true, title:"Anlage"}).addTo(map);
  rotorCircle = L.circle([site.lat, site.lon], {radius:site.rotor/2, color:"#ff7a33", weight:2, fillOpacity:.08}).addTo(map);
  rotorCircle.setStyle({opacity: site.rotor ? 1 : 0, fillOpacity: site.rotor ? .08 : 0});
  marker.on("dragend", () => setPos(marker.getLatLng(), true));
  map.on("click", e => setPos(e.latlng));
  $("mapMaxBtn").onclick = () => mapMax(!$("mapCard").classList.contains("map-max"));
  document.addEventListener("keydown", e => { if(e.key==="Escape" && $("mapCard").classList.contains("map-max")) mapMax(false); });
  $("radarBtn").onclick = () => radarToggle($("radarBtn").getAttribute("aria-pressed")!=="true");
  $("radarPlay").onclick = () => radarPlay(!radar.playing);
  $("radarSlider").oninput = e => { radarPlay(false); radarShow(+e.target.value); };
  map.on("moveend", () => { if(radar.on){ clearTimeout(radar.rebuild); radar.rebuild = setTimeout(radarFrames, 300); } });
}

function mapMax(on, stay){
  $("mapCard").classList.toggle("map-max", on);
  document.body.classList.toggle("map-open", on);
  $("mapMaxBtn").setAttribute("aria-pressed", String(on));
  $("mapMaxBtn").textContent = on ? "✕ Schließen" : "⤢ Vergrößern";
  setTimeout(() => { map.invalidateSize(); if(!on && !stay) $("mapCard").scrollIntoView({block:"start"}); }, 60);
  if(on && matchMedia("(pointer:fine)").matches) $("searchInput").focus({preventScroll:true});   // am Handy keine Tastatur aufklappen
}
let pending = null, pendingName = null, pendingDrag = false;
let siteChosen = (() => { try{ return localStorage.getItem("wb_site")!==null; }catch(e){ return true; } })();
function showMarker(on){
  if(!map) return;
  [marker, rotorCircle].forEach(l => on ? (!map.hasLayer(l) && l.addTo(map)) : map.removeLayer(l));
}
function setPos(ll, fromDrag){
  pending = ll; pendingDrag = !!fromDrag && siteChosen;
  showMarker(true); stopPulse();
  marker.setLatLng(ll); rotorCircle.setLatLng(ll);
  if(arrowMarker){ map.removeLayer(arrowMarker); arrowMarker=null; }
  $("pickTitle").textContent = fromDrag ? "Standort verschoben" : "Neuer Standort";
  $("pickText").textContent = `${ll.lat.toFixed(5)}° N, ${ll.lng.toFixed(5)}° E`;
  $("pickName").value = pendingName || (fromDrag && siteChosen ? site.name : "");
  $("pickForm").hidden = false;
  $("pickBar").hidden = false; $("pickApply").disabled = false;
}
function siteReady(){
  if(siteChosen) return;
  siteChosen = true;
  document.body.classList.remove("no-site"); stopPulse(); showMarker(true);
  setTimeout(() => map && map.invalidateSize(), 50);
}
function applyPending(){
  if(!pending) return;
  const lat = +pending.lat.toFixed(5), lon = +pending.lng.toFixed(5);
  const name = $("pickName").value.trim() || pendingName || `Standort ${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  site = {...site, lat, lon, name, checked: pendingDrag ? site.checked : false, excluded: pendingDrag ? site.excluded : []};
  if($("pickFav").checked) upsertFav();
  pending = null; pendingName = null;
  $("pickBar").hidden = true; map.getContainer().classList.remove("picking");
  siteReady(); saveSite(); fillSettings(); load();
  if($("mapCard").classList.contains("map-max")) mapMax(false, true);
  window.scrollTo({top:0, behavior:"smooth"});
}
function cancelPending(){
  pending = null; pendingName = null; $("pickBar").hidden = true; map.getContainer().classList.remove("picking");
  if(!siteChosen){ showMarker(false); startPulse(); return; }
  updateMap(); map.setView([site.lat, site.lon], Math.max(map.getZoom(), 13));
}
/* Hinweis auf die Karte: Rahmen pulsiert wie in TargetMate */
let pulseTimer = null;
function startPulse(ms){
  clearTimeout(pulseTimer);
  $("map").classList.add("pulse-hint");
  if(ms) pulseTimer = setTimeout(stopPulse, ms);
}
function stopPulse(){ clearTimeout(pulseTimer); $("map").classList.remove("pulse-hint"); }
function pointToMap(ms){
  toggleFavs(false);
  $("mapCard").scrollIntoView({behavior:"smooth", block:"start"});
  startPulse(ms);
}
function startFirstRun(){
  document.body.classList.add("no-site");
  $("lamp").className = "lamp"; $("lamp").textContent = "–";
  $("headline").textContent = "Noch keine Anlage gewählt.";
  $("summary").textContent = "Ort suchen und die Anlage auf der Karte antippen. Danach erscheint hier die Bewertung für euren Arbeitstag.";
  $("siteTitle").textContent = "Anlage wählen"; $("siteMeta").innerHTML = "";
  if(map){ showMarker(false); map.setView([48.4, 11.3], 6); }
  setTimeout(() => pointToMap(), 300);
}
async function search(q){
  const box = $("searchResults");
  box.hidden = false; box.innerHTML = `<li><button type="button" disabled>Suche…</button></li>`;
  let items = [];
  try{
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + new URLSearchParams({q, format:"jsonv2", limit:"6", "accept-language":"de", addressdetails:"1"}));
    const j = await r.json();
    items = j.map(x => ({name:x.name || x.display_name.split(",")[0], detail:x.display_name, lat:+x.lat, lon:+x.lon, type:x.type}));
  }catch(e){}
  if(!items.length){
    try{
      const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?" + new URLSearchParams({name:q, count:"6", language:"de"}));
      const j = await r.json();
      items = (j.results||[]).map(x => ({name:x.name, detail:[x.admin2, x.admin1, x.country].filter(Boolean).join(", "), lat:x.latitude, lon:x.longitude}));
    }catch(e){}
  }
  if(!items.length){ box.innerHTML = `<li><button type="button" disabled>Nichts gefunden. Versuch es mit Ortsname oder Postleitzahl.</button></li>`; return; }
  box.innerHTML = items.map((x,k) => `<li><button type="button" data-k="${k}">${esc(x.name)}<small>${esc(x.detail)}</small></button></li>`).join("");
  box.querySelectorAll("button[data-k]").forEach(b => b.onclick = () => {
    const x = items[+b.dataset.k];
    box.hidden = true; $("searchInput").value = x.name;
    pendingName = x.name;
    map.setView([x.lat, x.lon], 15);
    map.getContainer().classList.add("picking");
    $("pickTitle").textContent = x.name;
    $("pickText").textContent = "Jetzt die Anlage auf der Karte antippen.";
    $("pickForm").hidden = true;
    $("pickBar").hidden = false; pending = null; $("pickApply").disabled = true;
    startPulse(8000);
  });
}
function updateMap(){
  if(!map) return;
  const ll = [site.lat, site.lon];
  marker.setLatLng(ll); rotorCircle.setLatLng(ll).setRadius(site.rotor/2); rotorCircle.setStyle({opacity: site.rotor ? 1 : 0, fillOpacity: site.rotor ? .08 : 0});
  const h = state.hours[state.sel];
  if(arrowMarker){ map.removeLayer(arrowMarker); arrowMarker=null; }
  if(h && h.dir.mean!=null){
    const col = {go:"#46c27b", warn:"#e6b04c", stop:"#e5484d", none:"#999"}[h.lamp];
    const svg = `<svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(${h.dir.mean}deg)"><line x1="60" y1="18" x2="60" y2="96" stroke="#000" stroke-opacity=".45" stroke-width="9" stroke-linecap="round"/><line x1="60" y1="18" x2="60" y2="94" stroke="${col}" stroke-width="5" stroke-linecap="round"/><polygon points="60,110 48,88 72,88" fill="${col}" stroke="#000" stroke-opacity=".45"/></svg>`;
    arrowMarker = L.marker(ll, {icon:L.divIcon({className:"wind-arrow", html:svg, iconSize:[120,120], iconAnchor:[60,60]}), interactive:false, keyboard:false}).addTo(map);
    marker.bindTooltip(`${hh(h.t)} Uhr · ${fwu(h.med)} aus ${dirName(h.dir.mean)}`, {direction:"top", offset:[0,-36]});
  }
}
