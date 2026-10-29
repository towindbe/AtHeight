/* Windbericht · Modelle, Schwellen, Standard-Anlage und App-Zustand */
"use strict";

const MODELS = [
  {id:"icon_d2", name:"ICON-D2", org:"DWD", res:"2 km", hi:true},
  {id:"meteoswiss_icon_ch1", name:"ICON-CH1", org:"MeteoSwiss", res:"1 km", hi:true},
  {id:"meteoswiss_icon_ch2", name:"ICON-CH2", org:"MeteoSwiss", res:"2 km", hi:true},
  {id:"geosphere_arome_austria", name:"AROME AT", org:"GeoSphere", res:"2,5 km", hi:true},
  {id:"meteofrance_arome_france_hd", name:"AROME HD", org:"Météo-France", res:"1,5 km", hi:true},
  {id:"knmi_harmonie_arome_europe", name:"HARMONIE", org:"KNMI", res:"5,5 km", hi:true},
  {id:"dmi_harmonie_arome_europe", name:"HARMONIE", org:"DMI", res:"2 km", hi:true},
  {id:"ukmo_uk_deterministic_2km", name:"UKV", org:"Met Office", res:"2 km", hi:true},
  {id:"icon_eu", name:"ICON-EU", org:"DWD", res:"7 km", hi:false},
  {id:"meteofrance_arpege_europe", name:"ARPEGE", org:"Météo-France", res:"11 km", hi:false},
  {id:"ecmwf_ifs", name:"IFS HRES", org:"ECMWF", res:"9 km", hi:false},
  {id:"ecmwf_aifs025_single", name:"AIFS (KI)", org:"ECMWF", res:"25 km", hi:false},
  {id:"ukmo_global_deterministic_10km", name:"UKMO Global", org:"Met Office", res:"10 km", hi:false},
  {id:"icon_global", name:"ICON Global", org:"DWD", res:"13 km", hi:false},
  {id:"gfs_global", name:"GFS", org:"NOAA", res:"13 km", hi:false},
  {id:"gem_global", name:"GEM", org:"Kanada", res:"15 km", hi:false}
];
const LEVELS = [10,80,120,180];
const VARS = ["wind_speed_10m","wind_speed_80m","wind_speed_120m","wind_speed_180m",
  "wind_direction_10m","wind_direction_80m","wind_direction_120m","wind_direction_180m",
  "wind_gusts_10m","precipitation","cape","weather_code","temperature_2m",
  "temperature_80m","temperature_120m","temperature_180m","apparent_temperature",
  "relative_humidity_2m","cloud_cover"];
const CHILL_INFO = -10, HEAT_INFO = 32, UV_INFO = 6;
const DEW_INFO = 1;   // Temperatur in Arbeitshöhe höchstens so viele K über dem Taupunkt: Hinweis Kondenswasser
// Beschichten / Laminieren (je Anlage einschaltbar): max. Luftfeuchte und Mindestabstand zum Taupunkt (ISO 8502-4: 3 K)
const coatRh = () => site.coatRh ?? 80, coatDew = () => site.coatDew ?? 3;
/* Eingeschaltet wird Beschichten je Tag und Standort (im Tagesüberblick), nicht dauerhaft je Anlage:
   sonst bleibt es versehentlich an und die Ampel steht tagelang auf Stop. Vergangene Tage werden verworfen. */
const coatKey = d => `${(+site.lat).toFixed(3)},${(+site.lon).toFixed(3)}|${d}`;
let coatDays = (() => { try{ const t = new Date().toLocaleDateString("sv"); return new Set(JSON.parse(localStorage.getItem("wb_coat")||"[]").filter(k => k.slice(-10) >= t)); }catch(e){ return new Set(); } })();
const coatOn = d => !!d && coatDays.has(coatKey(d));
function setCoat(d, on){
  on ? coatDays.add(coatKey(d)) : coatDays.delete(coatKey(d));
  try{ localStorage.setItem("wb_coat", JSON.stringify([...coatDays])); }catch(e){}
}
const minTemp = () => site.minTemp ?? 0;   // Mindesttemperatur (Luft in Arbeitshöhe), darunter Stop
const ENS_WARN = 0.3, ENS_INFO = 0.1;   // Anteil der Ensemble-Läufe über Grenze
const ENSEMBLES = [{id:"icon_d2_eps", name:"ICON-D2-EPS"}, {id:"ecmwf_ifs025_ensemble", name:"ECMWF-ENS"}];
const DEFAULT_SITE = {name:"Hildesheim", lat:52.1508, lon:9.9511, windkraft:true, hub:125, rotor:149, work:null, path:true, access:"ground", wind:12, gust:15, nightWind:15, nightGust:20, minTemp:0, from:6, to:19};
const CAPE_WARN = 300, CAPE_STOP = 800, RAIN_WARN = 0.5;
const COLORS = ["#3b82f6","#14b8a6","#a855f7","#f59e0b","#ec4899","#22c55e","#06b6d4","#67e8f9","#64748b","#8b5cf6","#84cc16","#f97316","#0ea5e9","#d946ef","#10b981","#eab308"];
const LAMP_TXT = {go:"KLAR", warn:"PRÜFEN", stop:"STOP", none:"–"};
/* Symbole der Ampelkachel: Haken, Warndreieck, Achteck mit Balken */
const LAMP_ICON = {
  go:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L22 20.5H2z"/><path d="M12 10v4.5"/><path d="M12 17.6v.1"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z"/><path d="M7.5 12h9" stroke-width="2.8" stroke-linecap="round"/></svg>`
};

let site = loadSite();
let state = {results:[], times:[], hours:[], fetchedAt:null, day:null, sel:null,
  show:new Set((() => { try{ return JSON.parse(localStorage.getItem("wb_show")||"[]"); }catch(e){ return []; } })())};   // im Windverlauf eingeblendete Modelle (nur Anzeige)
state.nightOff = (() => { try{ return localStorage.getItem("wb_night")==="1"; }catch(e){ return false; } })();   // Diagramme ohne dunkle Stunden außerhalb der Arbeitszeit
state.hide = new Set((() => { try{ return JSON.parse(localStorage.getItem("wb_hide")||"[]"); }catch(e){ return []; } })());   // im Windverlauf ausgeblendete Linien: median, band, gust, lim, glim
const charts = {};
let map, marker, rotorCircle, arrowMarker, satLayer;

/* ---------- Hilfsfunktionen ---------- */
function loadSite(){
  try{ const s = JSON.parse(localStorage.getItem("wb_site")||"null"); if(s && typeof s.lat==="number") return {...DEFAULT_SITE, ...s}; }catch(e){}
  return {...DEFAULT_SITE};
}
function saveSite(){ try{ localStorage.setItem("wb_site", JSON.stringify(site)); }catch(e){} }
