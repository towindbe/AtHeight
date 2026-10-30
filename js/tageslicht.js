/* JobsiteWX · Sonnenstand und bürgerliche Dämmerung */
"use strict";

/* ---------- Tageslicht: Sonnenstand nach NOAA-Näherung ---------- */
const RAD = Math.PI/180;
function sunElev(ms, lat, lon){
  const d = ms/864e5 - 10957.5;                        // Tage seit J2000
  const g = (357.529 + 0.98560028*d) * RAD;
  const L = (280.459 + 0.98564736*d + 1.915*Math.sin(g) + 0.020*Math.sin(2*g)) * RAD;
  const e = (23.439 - 0.00000036*d) * RAD;
  const ra = Math.atan2(Math.cos(e)*Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e)*Math.sin(L));
  const gmst = 18.697374558 + 24.06570982441908*d;     // Sternzeit Greenwich in Stunden
  const ha = (gmst*15 + lon)*RAD - ra;
  return Math.asin(Math.sin(lat*RAD)*Math.sin(dec) + Math.cos(lat*RAD)*Math.cos(dec)*Math.cos(ha)) / RAD;
}
// Ortszeit "JJJJ-MM-TTTHH:MM" des Standorts → Millisekunden UTC (Sommer-/Winterzeit je Datum)
const tzOff = ms => localParts(ms, state.tz) ? Date.UTC(...localParts(ms, state.tz)) - Math.floor(ms/6e4)*6e4 : (state.off||0)*1000;
const utcStr = t => new Date(localMs(t)).toISOString().slice(0,16);
function localMs(t){
  const u = Date.UTC(+t.slice(0,4), +t.slice(5,7)-1, +t.slice(8,10), +t.slice(11,13), +(t.slice(14,16)||0));
  return u - tzOff(u - tzOff(u));
}
const CIVIL = -6;  // bürgerliche Dämmerung: Sonne 6° unter dem Horizont
// Stunde gilt als dunkel, wenn sie ganz oder teilweise außerhalb der Dämmerung liegt
const isDark = t => { const a = localMs(t); return sunElev(a, site.lat, site.lon) < CIVIL || sunElev(a + 3599e3, site.lat, site.lon) < CIVIL; };
function daylight(day){
  // Beginn und Ende der bürgerlichen Dämmerung, auf 5 Minuten genau
  let start = null, end = null, prev = null;
  for(let m = 0; m <= 1440; m += 5){
    const up = sunElev(localMs(`${day}T00:00`) + m*6e4, site.lat, site.lon) >= CIVIL;
    if(prev===false && up && start===null) start = m;
    if(prev===true && !up) end = m;
    prev = up;
  }
  const f = m => m==null ? null : `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
  return {start:f(start), end:f(end)};
}
