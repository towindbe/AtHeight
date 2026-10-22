/* Windbericht · letzter Stand für den Betrieb ohne Netz (IndexedDB) und Änderung seit dem letzten Stand (localStorage) */
"use strict";

/* ---------- Offline-Stand: die zuletzt geladenen Wetterdaten je Standort ---------- */
const CACHE_DB = "wb_cache", CACHE_STORE = "stand";
const cacheKey = () => `${site.lat.toFixed(3)},${site.lon.toFixed(3)}`;
function cacheDb(){
  return new Promise((res, rej) => {
    try{
      const q = indexedDB.open(CACHE_DB, 1);
      q.onupgradeneeded = () => q.result.createObjectStore(CACHE_STORE);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    }catch(e){ rej(e); }
  });
}
async function cacheSave(raw, ex){
  try{
    const db = await cacheDb();
    // Modelle nur als ID speichern; beim Laden wieder mit MODELS verknüpfen
    const rec = {at:Date.now(), raw:raw.map(r => ({...r, m:r.m.id})), ex};
    await new Promise((res, rej) => { const t = db.transaction(CACHE_STORE, "readwrite"); t.objectStore(CACHE_STORE).put(rec, cacheKey()); t.oncomplete = res; t.onerror = () => rej(t.error); });
    db.close();
  }catch(e){}
}
async function cacheLoad(){
  try{
    const db = await cacheDb();
    const rec = await new Promise((res, rej) => { const q = db.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(cacheKey()); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    db.close();
    if(!rec || !rec.raw || !rec.raw.some(r => r.status==="ok")) return null;
    return {at:new Date(rec.at), raw:rec.raw.map(r => ({...r, m:MODELS.find(m => m.id===r.m)})).filter(r => r.m), ex:rec.ex || {}};
  }catch(e){ return null; }
}

/* ---------- Änderung seit dem letzten Stand ---------- */
/* Merkt sich je Standort und Tag Ampel, stärksten Wind und Stunden über Grenze. Beim nächsten Abruf (mindestens 1 h später)
   wird verglichen, damit man sofort sieht, ob sich die Lage verschlechtert oder verbessert hat. */
const SNAP_MIN_AGE = 36e5;
const snapKey = () => "wb_snap_" + cacheKey();
function snapNow(){
  const days = {};
  [...new Set(state.times.map(t => t.slice(0,10)))].forEach(d => {
    const hs = dayHours(d); if(!hs.some(h => h.n)) return;
    const s = buildSummary(hs), peak = hs.reduce((a,h) => h.med!=null && (!a || h.med>a.med) ? h : a, null);
    days[d] = {lamp:s.lamp, peak:peak ? peak.med : null, stop:s.counts?.stop ?? 0, n:hs.length};
  });
  return {at:Date.now(), days};
}
/* nach jedem frischen Abruf aufrufen: vergleicht mit dem gespeicherten Stand und ersetzt ihn, wenn er alt genug ist */
function snapUpdate(){
  let prev = null;
  try{ prev = JSON.parse(localStorage.getItem(snapKey()) || "null"); }catch(e){}
  const cur = snapNow();
  state.snapPrev = prev && Date.now() - prev.at >= SNAP_MIN_AGE ? prev : null;
  if(!prev || state.snapPrev){ try{ localStorage.setItem(snapKey(), JSON.stringify(cur)); }catch(e){} }
}
const LAMP_RANK = {go:0, warn:1, stop:2};
function changeText(day){
  const p = state.snapPrev?.days?.[day], c = state.hours.length ? snapNow().days[day] : null;
  if(!p || !c) return null;
  const when = new Date(state.snapPrev.at).toLocaleString("de-DE", {weekday:"short", hour:"2-digit", minute:"2-digit"});
  const dv = c.peak!=null && p.peak!=null ? c.peak - p.peak : 0, big = Math.abs(dv) >= 0.5;
  const peak = c.peak==null ? "" : big ? `stärkster Wind ${fw(p.peak)} → ${fwu(c.peak)}` : `stärkster Wind unverändert ${fwu(c.peak)}`;
  const l = LAMP_TXT[p.lamp] + " → " + LAMP_TXT[c.lamp];
  let lvl, head;
  if(c.lamp !== p.lamp && LAMP_RANK[c.lamp] != null && LAMP_RANK[p.lamp] != null){
    lvl = LAMP_RANK[c.lamp] > LAMP_RANK[p.lamp] ? "worse" : "better"; head = (lvl==="worse" ? "Verschlechtert" : "Verbessert") + ": " + l;
  }else if(dv >= 1){ lvl = "worse"; head = `Ampel gleich (${LAMP_TXT[c.lamp]}), Wind aber stärker`; }
  else if(dv <= -1){ lvl = "better"; head = `Ampel gleich (${LAMP_TXT[c.lamp]}), Wind aber schwächer`; }
  else{ lvl = "same"; head = `Unverändert: ${LAMP_TXT[c.lamp]}`; }
  const stops = c.stop !== p.stop ? `Stop-Stunden ${p.stop} → ${c.stop}` : "";
  const rest = [peak, stops].filter(Boolean).join(" · ");
  return {lvl, html:`<b>Seit ${esc(when)} Uhr: ${esc(head)}</b>${rest ? " · " + esc(rest) : ""}`};
}
function renderChange(){
  const box = $("changeNote"); if(!box) return;
  const t = state.offlineAt ? null : changeText(state.day);
  box.hidden = !t;
  if(t){ box.className = "change-note ch-" + t.lvl; box.innerHTML = t.html; }
}
