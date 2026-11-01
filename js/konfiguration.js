/* AtHeight · Modelle, Schwellen, Standard-Baustelle und App-Zustand */
"use strict";

/* Sprache: Deutsch (Standard) oder Englisch, gemerkt im Browser. T("deutsch", "english") liefert den Text der gewählten Sprache.
   Feste Texte im HTML tragen data-en (Inhalt) bzw. data-en-title / data-en-aria / data-en-ph (Attribute), getauscht von applyStaticLang().
   Tagesbericht und Infoseite bleiben vorerst deutsch (Schritt 2). */
let LANG = (() => { try{ return localStorage.getItem("wb_lang")==="en" ? "en" : "de"; }catch(e){ return "de"; } })();
const T = (de, en) => LANG === "en" ? en : de;   // nicht „L“: so heißt global die Kartenbibliothek Leaflet
const LOC = () => LANG === "en" ? "en-GB" : "de-DE";
const UHR = () => T(" Uhr", "h");   // Zeitangabe hinter Uhrzeiten: „06–19 Uhr“ bzw. „06–19h“
function applyStaticLang(){
  document.documentElement.lang = LANG;
  if(!document.documentElement.dataset.titleDe) document.documentElement.dataset.titleDe = document.title;
  document.title = LANG === "en" ? "AtHeight – weather check for work at height" : document.documentElement.dataset.titleDe;
  const swap = (sel, get, set, key) => document.querySelectorAll(sel).forEach(e => {
    if(e.dataset[key + "De"] == null) e.dataset[key + "De"] = get(e);
    set(e, LANG === "en" ? e.dataset[key] : e.dataset[key + "De"]);
  });
  swap("[data-en]", e => e.innerHTML, (e, v) => { e.innerHTML = v; }, "en");
  swap("[data-en-title]", e => e.title, (e, v) => { e.title = v; }, "enTitle");
  swap("[data-en-aria]", e => e.getAttribute("aria-label") || "", (e, v) => e.setAttribute("aria-label", v), "enAria");
  swap("[data-en-ph]", e => e.placeholder, (e, v) => { e.placeholder = v; }, "enPh");
}

/* Open-Meteo-Adressen: Die App läuft nur mit Zugangs-Token (Link ?t=…, wird im Browser gemerkt).
   Jede Abfrage geht über den Proxy: <Proxy>/<Dienst>/<Pfad>?t=<Token>&… */
const OM_PROXY = "https://atheight-proxy.atheight-proxy.workers.dev";
const TOKEN = (() => {
  let t = new URLSearchParams(location.search).get("t");
  try{
    if(t && /^[a-f0-9]{8,64}$/.test(t)){ localStorage.setItem("wb_token", t);
      const u = new URL(location.href); u.searchParams.delete("t"); history.replaceState(null, "", u); }
    else t = localStorage.getItem("wb_token");
  }catch(err){}
  return t && /^[a-f0-9]{8,64}$/.test(t) ? t : "";
})();
const OM = (dienst, pfad) => `${OM_PROXY}/${dienst}${pfad}t=${TOKEN}&`;

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
const DEW_INFO = 1;   // Temperatur in Arbeitshöhe höchstens so viele °C über dem Taupunkt: Hinweis Kondenswasser
// Beschichten / Laminieren (Grenzen je Baustelle): max. Luftfeuchte und Mindestabstand zum Taupunkt (ISO 8502-4: 3 °C)
const coatRh = () => site.coatRh ?? 80, coatDew = () => site.coatDew ?? 3;
/* Beschichten-Modus: im Überblick je Standort eingeschaltet, gilt für alle Tage bis zum Ausschalten,
   höchstens COAT_DAYS Tage ab dem Einschalten. Danach ist er von selbst aus:
   so bleibt er nicht versehentlich wochenlang an und die Ampel steht nicht ohne Grund auf Stop. */
const COAT_DAYS = 7;
const coatSpot = () => `${(+site.lat).toFixed(3)},${(+site.lon).toFixed(3)}`;
let coatUntil = (() => { try{
  const t = new Date().toLocaleDateString("sv"), o = JSON.parse(localStorage.getItem("wb_coat")||"{}");
  return Object.fromEntries(Object.entries(Array.isArray(o) ? {} : o).filter(([, u]) => u >= t));
}catch(e){ return {}; } })();
const coatEnd = () => coatUntil[coatSpot()] || null;
const coatOn = d => !!d && !!coatEnd() && d <= coatEnd();
function coatDefaultEnd(){ const d = new Date(); d.setDate(d.getDate() + COAT_DAYS - 1); return d.toLocaleDateString("sv"); }
function setCoat(until){
  until ? coatUntil[coatSpot()] = until : delete coatUntil[coatSpot()];
  try{ localStorage.setItem("wb_coat", JSON.stringify(coatUntil)); }catch(e){}
}
const minTemp = () => site.minTemp ?? 0;   // Mindesttemperatur (Luft in Arbeitshöhe), darunter Stop
const ENS_WARN = 0.3, ENS_INFO = 0.1;   // Anteil der Ensemble-Läufe über Grenze
const ENSEMBLES = [{id:"icon_d2_eps", name:"ICON-D2-EPS"}, {id:"ecmwf_ifs025_ensemble", name:"ECMWF-ENS"}];
const DEFAULT_SITE = {name:"Hildesheim", lat:52.1508, lon:9.9511, windkraft:true, hub:125, rotor:149, work:null, path:true, access:"ground", wind:12, gust:15, nightWind:15, nightGust:20, minTemp:0, from:6, to:19};
const CAPE_WARN = 300, CAPE_STOP = 800, RAIN_WARN = 0.5;
const COLORS = ["#3b82f6","#14b8a6","#a855f7","#f59e0b","#ec4899","#22c55e","#06b6d4","#67e8f9","#64748b","#8b5cf6","#84cc16","#f97316","#0ea5e9","#d946ef","#10b981","#eab308"];
const LAMP_TXT = {get go(){ return T("KLAR", "CLEAR"); }, get warn(){ return T("PRÜFEN", "CHECK"); }, stop:"STOP", none:"–"};
/* Symbole der Ampelkachel: Haken, Warndreieck, Achteck mit Balken */
const LAMP_ICON = {
  go:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L22 20.5H2z"/><path d="M12 10v4.5"/><path d="M12 17.6v.1"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z"/><path d="M7.5 12h9" stroke-width="2.8" stroke-linecap="round"/></svg>`
};

let site = loadSite();
let state = {results:[], times:[], hours:[], fetchedAt:null, day:null, sel:null,
  show:new Set((() => { try{ return JSON.parse(localStorage.getItem("wb_show")||"[]"); }catch(e){ return []; } })()),
  showBest:(() => { try{ return localStorage.getItem("wb_showbest")==="1"; }catch(e){ return false; } })()};   // „Am besten bewertet“ gewählt: folgt dem Modellvergleich der jeweiligen Baustelle   // im Windverlauf eingeblendete Modelle (nur Anzeige)
state.nightOff = (() => { try{ return localStorage.getItem("wb_night")==="1"; }catch(e){ return false; } })();   // Diagramme ohne dunkle Stunden außerhalb der Arbeitszeit
state.hide = new Set((() => { try{ return JSON.parse(localStorage.getItem("wb_hide")||"[]"); }catch(e){ return []; } })().filter(k => k !== "lim" && k !== "glim"));   // ausgeblendete Linien: median, band, gust, t_feel, t_dew, t_rh (Grenzlinien sind immer sichtbar, alte Einträge zählen nicht)
const charts = {};
let map, marker, rotorCircle, arrowMarker, satLayer;

/* ---------- Hilfsfunktionen ---------- */
function loadSite(){
  try{ const s = JSON.parse(localStorage.getItem("wb_site")||"null"); if(s && typeof s.lat==="number") return cleanSite({...DEFAULT_SITE, ...s}); }catch(e){}
  return {...DEFAULT_SITE};
}
// Felder aus früheren Versionen entfernen (coat: Beschichten war kurz je Baustelle gespeichert, gilt jetzt im Überblick)
function cleanSite(s){ const {coat, ...r} = s; return r; }
function saveSite(){ try{ localStorage.setItem("wb_site", JSON.stringify(site)); }catch(e){} }
