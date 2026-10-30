/* Windbericht · Allgemeine Hilfsfunktionen: Formatierung, Zeitzonen */
"use strict";

const $ = id => document.getElementById(id);
/* Linien-Symbole (einheitlich statt Emoji und Sonderzeichen): 24er-Raster, Strichfarbe = Textfarbe.
   Im HTML als Platzhalter <i data-ico="name"></i>, beim Start gefüllt (bedienung.js) */
const ICON_PATHS = {
  reload:'<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.6"/><path d="M12 17h.01"/>',
  star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.2 5.9-.9z"/>',
  brush:'<path d="M18 3l3 3-9 9-4 1 1-4z"/><path d="M8 16c-2 0-4 1.5-4 5 2.5 0 5-1 5-4"/>',
  drop:'<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
  chevron:'<path d="M6 9l6 6 6-6"/>',
  home:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  wind:'<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  week:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  report:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  cloud:'<path d="M17.5 19H8a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 19 11.5a3.75 3.75 0 0 1-1.5 7.5z"/>',
  clouds:'<path d="M16.5 20H8.5a3.5 3.5 0 0 1-.4-6.98A5 5 0 0 1 18 14a3 3 0 0 1-1.5 6z"/><path d="M8 10.2A5 5 0 0 1 17.6 9"/>',
  cloudsun:'<g class="ic-a"><path d="M12 3v1.5M5 6l1 1M19 6l-1 1M3 12h1.5M20 12h1.5"/><path d="M8.2 12.6a4 4 0 1 1 7.1-2.8"/></g><path d="M17 20H9.5a3.25 3.25 0 0 1-.3-6.5A4.5 4.5 0 0 1 18 14.5a2.75 2.75 0 0 1-1 5.5z"/>',
  sunfew:'<g class="ic-a"><circle cx="10" cy="10" r="3.5"/><path d="M10 3v1.5M3 10h1.5M5 5l1 1M15 5l-1 1M5 15l1-1"/></g><path d="M19 20h-5a2.5 2.5 0 0 1-.2-5 3.5 3.5 0 0 1 6.7 1.3 2 2 0 0 1-1.5 3.700z"/>',
  moonfew:'<path class="ic-a" d="M15 9.5A6 6 0 1 1 8.5 3a4.8 4.8 0 0 0 6.5 6.5z"/><path d="M19 20h-5a2.5 2.5 0 0 1-.2-5 3.5 3.5 0 0 1 6.7 1.3 2 2 0 0 1-1.5 3.700z"/>',
  matrix:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'
};
// Nach dem Einblenden einer Erklärung dorthin scrollen (sie steht oft weiter unten in der Karte)
const showHelp = el => { if(el) setTimeout(() => el.scrollIntoView({behavior:"smooth", block:"center"}), 30); };
const icon = (name, size = 20) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (v, d=1) => v==null || isNaN(v) ? "–" : v.toFixed(d).replace(".", ",");
/* Einheit der Windangaben (nur Anzeige; gerechnet und gespeichert wird immer in m/s) */
const UNITS = {ms:{f:1, l:"m/s", d:1, step:0.5}, kmh:{f:3.6, l:"km/h", d:0, step:1}, kn:{f:1.943844, l:"kn", d:0, step:1}};
let windUnit = (() => { try{ return localStorage.getItem("wb_unit"); }catch(e){ return null; } })();
if(!UNITS[windUnit]) windUnit = "ms";
const U = () => UNITS[windUnit];
const WU = () => U().l;
const cw = v => v==null || isNaN(v) ? null : v * U().f;                 // m/s -> Anzeigeeinheit
const fw = (v, d) => fmt(cw(v), d ?? U().d);                            // Wind formatiert in Anzeigeeinheit
const fwu = (v, d) => v==null || isNaN(v) ? "–" : fw(v, d) + " " + WU();   // mit Einheit
const median = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y), m=s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const hh = t => t.slice(11,13);
const hourOf = t => parseInt(t.slice(11,13),10);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const DIRS = ["N","NNO","NO","ONO","O","OSO","SO","SSO","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const dirName = d => d==null ? "–" : DIRS[Math.round(((d%360)+360)%360/22.5)%16];
/* Mittlere Richtung auf dem Kreis; ws (optional) gewichtet, z. B. nach Windstärke */
function circMean(ds, ws){
  if(!ds.length) return {mean:null, spread:null};
  let x=0,y=0,sw=0; ds.forEach((d,k)=>{const w=ws?ws[k]:1; x+=w*Math.cos(d*Math.PI/180); y+=w*Math.sin(d*Math.PI/180); sw+=w;});
  if(!(sw>0)) return {mean:null, spread:null};
  x/=sw; y/=sw;
  const R = Math.hypot(x,y);
  return {mean:(Math.atan2(y,x)*180/Math.PI+360)%360, spread: R>0 ? Math.sqrt(-2*Math.log(R))*180/Math.PI : 180};
}
/* Zeitzonen: Open-Meteo liefert alle Zeiten mit EINEM festen Versatz (dem bei der Abfrage gültigen).
   Über eine Sommer-/Winterzeitumstellung hinweg wären die Uhrzeiten dann um eine Stunde verschoben.
   Deshalb werden die Zeitstempel nach dem Abruf in die echte Ortszeit des Standorts umgerechnet. */
const tzFmts = {};
function localParts(ms, tz){
  if(!tz) return null;
  try{
    tzFmts[tz] = tzFmts[tz] || new Intl.DateTimeFormat("en-US", {timeZone:tz, hourCycle:"h23", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit"});
    const p = Object.fromEntries(tzFmts[tz].formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return [+p.year, +p.month-1, +p.day, +p.hour, +p.minute];
  }catch(e){ return null; }
}
const pad2 = x => String(x).padStart(2,"0");
/* „Zu windig“: Anteil der Szenarien über Grenze in Prozent mit kleinem Farbbalken.
   Abgerundet, damit „30 %“ immer zur Ampelschwelle passt. Grün unter 10 %, gelb ab 10 %, rot ab 30 %. */
function riskTen(p){
  if(p==null) return "–";
  return `${Math.floor(p*100 + 1e-9)} %`;
}
function riskHtml(p, n){
  if(p==null) return "–";
  const lvl = p >= 0.3 ? "stop" : p >= 0.1 ? "warn" : "go";
  const tip = n ? `${Math.round(p*n)} von ${n} Szenarien zu windig` : "";
  return `<span class="risk" title="${tip}"><span class="risk-bar"><span class="risk-fill r-${lvl}" style="width:${Math.max(4, Math.round(p*100))}%"></span></span>${riskTen(p)}</span>`;
}
function toLocalStr(ms, tz){
  const p = localParts(ms, tz); if(!p) return null;
  return `${p[0]}-${pad2(p[1]+1)}-${pad2(p[2])}T${pad2(p[3])}:${pad2(p[4])}`;
}
function fixTimes(hourly, tz, offSec){
  if(!hourly?.time) return;
  hourly.time = hourly.time.map(t => toLocalStr(Date.UTC(+t.slice(0,4), +t.slice(5,7)-1, +t.slice(8,10), +t.slice(11,13), +t.slice(14,16)) - offSec*1000, tz) || t);
}
function nowKey(){
  const k = toLocalStr(Date.now(), state.tz);
  if(k) return k.slice(0,13);
  const n=new Date(); return `${n.getFullYear()}-${pad2(n.getMonth()+1)}-${pad2(n.getDate())}T${pad2(n.getHours())}`;
}
