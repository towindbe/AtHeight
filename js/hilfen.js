/* Windbericht · Allgemeine Hilfsfunktionen: Formatierung, Zeitzonen */
"use strict";

const $ = id => document.getElementById(id);
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
function circMean(ds){
  if(!ds.length) return {mean:null, spread:null};
  let x=0,y=0; ds.forEach(d=>{x+=Math.cos(d*Math.PI/180); y+=Math.sin(d*Math.PI/180);});
  x/=ds.length; y/=ds.length;
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
