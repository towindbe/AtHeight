/* Windbericht · Regenradar als Animation */
"use strict";

/* ---------- Regenradar als Animation (DWD, 5-Minuten-Bilder) ----------
   Pro Zeitschritt ein Bild für den sichtbaren Ausschnitt (WMS GetMap), vorab geladen. */
const RADAR_URL = "https://maps.dwd.de/geoserver/dwd/wms";
const RADAR_PAST = 90, RADAR_AHEAD = 120, RADAR_STEP = 10;   // Minuten
const radar = {on:false, playing:true, frames:[], idx:0, overlay:null, timer:null, rebuild:null};
function radarToggle(on){
  radar.on = on;
  $("radarBtn").setAttribute("aria-pressed", String(on));
  $("radarBar").hidden = $("radarTime").hidden = !on;
  if(on){
    if(map.getZoom() > 9) map.setZoom(8);   // weit genug heraus, um anziehende Schauer zu sehen
    radarFrames(); radarPlay(true);
  } else {
    radarPlay(false);
    if(radar.overlay){ map.removeLayer(radar.overlay); radar.overlay = null; }
    radar.arrowI = null; if(typeof updateMap === "function") updateMap();   // Pfeil wieder für die gewählte Stunde
  }
}
function radarFrames(){
  if(!radar.on) return;
  // Letztes sicher verfügbares Bild: jetzt, auf 5 min abgerundet, minus 10 min Verarbeitung
  const now = Date.now(), last = Math.floor(now/3e5)*3e5 - 6e5;
  const times = [];
  for(let m = -RADAR_PAST; m <= RADAR_AHEAD; m += RADAR_STEP) times.push(last + m*6e4);
  const b = map.getBounds(), crs = map.options.crs, sw = crs.project(b.getSouthWest()), ne = crs.project(b.getNorthEast());
  const size = map.getSize(), k = Math.min(1, 1024/Math.max(size.x, size.y));
  const prev = radar.frames[radar.idx]?.t;
  radar.frames = times.map(t => {
    const q = new URLSearchParams({service:"WMS", version:"1.3.0", request:"GetMap", layers:"dwd:Niederschlagsradar", styles:"", format:"image/png", transparent:"true",
      crs:"EPSG:3857", bbox:[sw.x, sw.y, ne.x, ne.y].map(v => Math.round(v)).join(","), width:Math.round(size.x*k), height:Math.round(size.y*k),
      time:new Date(t).toISOString().replace(/\.\d+Z$/, ".000Z")});
    const url = RADAR_URL + "?" + q, img = new Image();
    img.src = url;   // vorladen, damit die Animation flüssig läuft
    return {t, url, img, ahead: t > last};
  });
  radar.bounds = b;
  $("radarSlider").max = String(radar.frames.length - 1);
  const keep = radar.frames.findIndex(f => f.t===prev);
  radarShow(keep >= 0 ? keep : radar.frames.findIndex(f => f.ahead) - 1);
}
function radarShow(i){
  const f = radar.frames[i]; if(!f) return;
  radar.idx = i; $("radarSlider").value = String(i);
  if(!radar.overlay) radar.overlay = L.imageOverlay(f.url, radar.bounds, {opacity:.75, interactive:false, attribution:"Radar © DWD"}).addTo(map);
  else { radar.overlay.setBounds(radar.bounds); radar.overlay.setUrl(f.url); }
  const time = new Date(f.t).toLocaleTimeString(LOC(), {timeZone:state.tz || undefined, hour:"2-digit", minute:"2-digit"});
  $("radarTime").innerHTML = `${time}${T(" Uhr", "")} <span class="${f.ahead ? "rt-fc" : "rt-obs"}">${f.ahead ? T("Vorhersage", "forecast") : T("gemessen", "measured")}</span>`;
  // Windpfeil folgt der Radar-Uhrzeit (nächstliegende Prognosestunde), neu zeichnen nur beim Stundenwechsel
  const ah = typeof arrowHour === "function" ? arrowHour() : null;
  if(ah && ah.i !== radar.arrowI){ radar.arrowI = ah.i; if(typeof updateMap === "function") updateMap(); }
}
function radarPlay(on){
  radar.playing = on;
  $("radarPlay").textContent = on ? "⏸" : "▶";
  $("radarPlay").setAttribute("aria-label", on ? T("Animation anhalten", "Pause animation") : T("Animation abspielen", "Play animation"));
  clearTimeout(radar.timer);
  if(!on) return;
  const step = () => {
    if(!radar.playing || !radar.on) return;
    const n = radar.frames.length, next = (radar.idx + 1) % n;
    // erst weiter, wenn das Bild geladen ist; am Ende kurz stehen bleiben
    if(radar.frames[next]?.img.complete) radarShow(next);
    radar.timer = setTimeout(step, next === n-1 ? 1600 : 450);
  };
  radar.timer = setTimeout(step, 450);
}
