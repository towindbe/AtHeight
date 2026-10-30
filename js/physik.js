/* AtHeight · Höhenrechnung: Wind im Arbeitsbereich, Böe, Temperatur, Windchill */
"use strict";

/* ---------- Physik: Nabenhöhe ---------- */
function levelsAt(h, i){
  return LEVELS.map(z => [z, h["wind_speed_"+z+"m"]?.[i], h["wind_direction_"+z+"m"]?.[i]]).filter(([,v]) => v!=null && !isNaN(v));
}
function windAt(lv, z){
  if(!lv.length) return {v:null, ext:false};
  if(lv.length===1){ const [z0,v0]=lv[0]; return {v: v0*Math.pow(z/z0, 0.2), ext: z!==z0}; }
  if(z <= lv[0][0]) return {v: lv[0][1]*Math.pow(Math.max(z,2)/lv[0][0], 0.2), ext:false};
  const last = lv[lv.length-1];
  if(z >= last[0]){
    const prev = lv[lv.length-2];
    let a = 0.14;
    if(prev[1] > 0.5 && last[1] > 0.5) a = clamp(Math.log(last[1]/prev[1]) / Math.log(last[0]/prev[0]), 0.05, 0.4);
    return {v: last[1]*Math.pow(z/last[0], a), ext: z > last[0] + 5};
  }
  for(let k=0;k<lv.length-1;k++){
    const [z1,v1]=lv[k], [z2,v2]=lv[k+1];
    if(z>=z1 && z<=z2) return {v: v1 + (v2-v1)*(z-z1)/(z2-z1), ext: z1===10 && lv.length<3};
  }
  return {v:null, ext:false};
}
/* Arbeitsbereich je nach Zugang zur Arbeitshöhe:
   ground  = vom Boden am Seil nach oben: 10 m bis Arbeitshöhe (Standard)
   nacelle = von der Gondel am Seil nach unten: Arbeitshöhe bis Nabe
   none    = nur die Arbeitshöhe
   Bewertet wird der stärkste Wind im Bereich. */
const workH = () => site.work || site.hub;
/* Einsatz an einer Windenergieanlage (Standard) oder allgemein (Fassade, Brücke, Turm …): ohne Windkraft gibt es keine Nabe, Rotor und Gondel.
   Beim Speichern wird dann hub = Arbeitshöhe und rotor = 0 gesetzt, damit alle Berechnungen unverändert laufen. */
const isWind = () => site.windkraft !== false;
const topWord = () => isWind() ? T("Nabe", "hub") : T("Arbeitshöhe", "working height");
const accessMode = () => !isWind() && site.access === "nacelle" ? "ground" : (site.access || "ground");
const zoneBottom = () => accessMode()==="ground" ? Math.min(10, workH()) : workH();
const zoneTop = () => accessMode()==="nacelle" && workH() < site.hub ? site.hub : workH();
const zoneTxt = () => zoneBottom() < workH() ? `${T("bis", "up to")} ${workH()} m` : zoneTop() !== workH() ? `${workH()}–${zoneTop()} m` : `${workH()} m`;
const ACCESS_TXT = {get ground(){ return T("Aufstieg vom Boden", "ascent from the ground"); }, get nacelle(){ return T("Abstieg von der Gondel", "descent from the nacelle"); }, get none(){ return T("nur Arbeitshöhe", "working height only"); }};
/* Lage des Standorts in der Gitterzelle eines Modells (ohne zusätzliche Abrufe: Open-Meteo nennt die Zellmitte).
   Rand: Standort liegt nahe an der Zellgrenze, die Nachbarzelle kann anders rechnen. Abweichend: gewählte Zelle liegt weiter weg als eine Halbzelle
   (z. B. Landzelle statt Wasserzelle am Ufer). */
const CELL_EDGE = 0.4;   // Anteil der Zellbreite: ab 40 % Abstand zur Mitte (Zellgrenze bei 50 %) gilt der Standort als Randlage
function cellPos(r){
  if(r.glat==null || r.glon==null) return null;
  const res = parseFloat(String(r.m.res).replace(",", ".")); if(!(res > 0)) return null;
  const dy = (site.lat - r.glat)*111.2, dx = (site.lon - r.glon)*111.2*Math.cos(site.lat*RAD), dist = Math.hypot(dx, dy);
  const dir = dirName((Math.atan2(dx, dy)/RAD + 360) % 360);
  return {res, dist, dir, edge: Math.max(Math.abs(dx), Math.abs(dy)) >= CELL_EDGE*res, far: dist > 0.75*res};
}
/* Hängende Seile und Bühne über Nacht: stärkster Wind von 10 m bis zur Nabe */
function rigWind(lv){
  const hi = site.hub, zs = [...new Set([Math.min(10, hi), ...LEVELS.filter(z => z>10 && z<hi), hi])];
  return zs.map(z => windAt(lv, z).v).filter(v => v!=null).reduce((a,b) => a==null || b > a ? b : a, null);
}
function zoneWind(lv){
  const lo = zoneBottom(), hi = zoneTop();
  const zs = [...new Set([lo, ...LEVELS.filter(z => z>lo && z<hi), hi])];
  return zs.map(z => windAt(lv, z)).filter(w => w.v!=null).reduce((a,b) => !a || b.v > a.v ? b : a, null) || {v:null, ext:false};
}
/* Temperatur in Höhe z: zwischen gelieferten Höhen linear, darüber/ohne Höhenwerte mit 0,65 °C pro 100 m */
function tempAt(h, i, z){
  const lv = [[2, h.temperature_2m?.[i]], ...[80,120,180].map(k => [k, h["temperature_"+k+"m"]?.[i]])].filter(([,v]) => v!=null && !isNaN(v));
  if(!lv.length) return null;
  for(let k=0; k<lv.length-1; k++){ const [z1,v1]=lv[k], [z2,v2]=lv[k+1]; if(z>=z1 && z<=z2) return v1 + (v2-v1)*(z-z1)/(z2-z1); }
  const [zt, vt] = z < lv[0][0] ? lv[0] : lv[lv.length-1];
  return vt - 0.0065*(z - zt);
}
/* Taupunkt aus Temperatur und relativer Feuchte (Magnus-Formel, Konstanten nach Sonntag 1990) */
function dewPoint(t, rh){
  if(t==null || rh==null || rh <= 0) return null;
  const g = Math.log(Math.min(rh,100)/100) + 17.62*t/(243.12+t);
  return 243.12*g/(17.62-g);
}
/* Gefühlte Temperatur (Windchill, Formel von Environment Canada / NWS), Wind in m/s */
function windChill(t, v){
  if(t==null || v==null) return null;
  const k = v*3.6;
  if(k < 4.8) return t;
  // Formel gilt eigentlich bis 10 °C; darüber weiterrechnen, aber nie wärmer als die Luft (sonst Sprung bei 10 °C)
  return Math.min(t, 13.12 + 0.6215*t - 11.37*Math.pow(k,0.16) + 0.3965*t*Math.pow(k,0.16));
}
function dirAt(lv, z){
  const withDir = lv.filter(l => l[2]!=null);
  if(!withDir.length) return null;
  return withDir.reduce((a,b) => Math.abs(b[0]-z) < Math.abs(a[0]-z) ? b : a)[2];
}
function gustAt(h, i, vHub){
  const g = h.wind_gusts_10m?.[i], v = h.wind_speed_10m?.[i];
  if(g==null || v==null || vHub==null) return null;
  const gf = clamp(g / Math.max(v, 1), 1, 2.5);
  return vHub * (1 + (gf-1)*0.6);
}
