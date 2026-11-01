/* AtHeight · letzter Stand für den Betrieb ohne Netz (IndexedDB) und Änderung seit dem letzten Stand (localStorage) */
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
  const when = new Date(state.snapPrev.at).toLocaleString(LOC(), {weekday:"short", hour:"2-digit", minute:"2-digit"});
  const dv = c.peak!=null && p.peak!=null ? c.peak - p.peak : 0, big = Math.abs(dv) >= 0.5;
  const peak = c.peak==null ? "" : big ? `${T("stärkster Wind", "strongest wind")} ${fw(p.peak)} → ${fwu(c.peak)}` : `${T("stärkster Wind unverändert", "strongest wind unchanged")} ${fwu(c.peak)}`;
  const l = LAMP_TXT[p.lamp] + " → " + LAMP_TXT[c.lamp];
  let lvl, head;
  if(c.lamp !== p.lamp && LAMP_RANK[c.lamp] != null && LAMP_RANK[p.lamp] != null){
    lvl = LAMP_RANK[c.lamp] > LAMP_RANK[p.lamp] ? "worse" : "better"; head = (lvl==="worse" ? T("Verschlechtert", "Worse") : T("Verbessert", "Better")) + ": " + l;
  }else if(dv >= 1){ lvl = "worse"; head = T(`Ampel gleich (${LAMP_TXT[c.lamp]}), Wind aber stärker`, `Traffic light unchanged (${LAMP_TXT[c.lamp]}), but wind stronger`); }
  else if(dv <= -1){ lvl = "better"; head = T(`Ampel gleich (${LAMP_TXT[c.lamp]}), Wind aber schwächer`, `Traffic light unchanged (${LAMP_TXT[c.lamp]}), but wind weaker`); }
  else{ lvl = "same"; head = `${T("Unverändert", "Unchanged")}: ${LAMP_TXT[c.lamp]}`; }
  const stops = c.stop !== p.stop ? `${T("Stop-Stunden", "Stop hours")} ${p.stop} → ${c.stop}` : "";
  const rest = [peak, stops].filter(Boolean).join(" · ");
  return {lvl, html:`<b>${T("Seit", "Since")} ${esc(when)}${UHR()}: ${esc(head)}</b>${rest ? " · " + esc(rest) : ""}`};
}
function renderChange(){
  const box = $("changeNote"); if(!box) return;
  const t = state.offlineAt ? null : changeText(state.day);
  box.hidden = !t;
  if(t){ box.className = "change-note ch-" + t.lvl; box.innerHTML = t.html; }
}

/* ---------- App installieren: kleines Fenster mit Installieren-Knopf, dazu Anleitung in 3 Schritten (iPhone/iPad) ---------- */
const INSTALL_SNOOZE = 14*864e5;   // nach "Später" so lange nicht wieder fragen
let installEvt = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // iPadOS meldet sich als Mac
const inAppBrowser = () => /FBAN|FBAV|Instagram|Snapchat|MicroMessenger|Line\//i.test(navigator.userAgent);   // Browser innerhalb anderer Apps: kein "Zum Home-Bildschirm"
const otherIosBrowser = () => /CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);   // Teilen-Symbol sitzt dort neben der Adresse
const installSnoozed = () => { try{ return Date.now() < +localStorage.getItem("wb_install_snooze"); }catch(e){ return false; } };
const IC_SHARE = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/></svg>`;
const IC_ADD = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M12 8v8M8 12h8"/></svg>`;
function installClose(snooze){
  $("installBox")?.remove();
  if(snooze) try{ localStorage.setItem("wb_install_snooze", String(Date.now() + INSTALL_SNOOZE)); }catch(e){}
}
async function installNative(){
  if(!installEvt) return false;
  installEvt.prompt();
  try{ await installEvt.userChoice; }catch(e){}
  installEvt = null; installClose(false);
  return true;
}
function installGuideClose(){ $("installGuide")?.remove(); }
function installGuide(){
  if($("installGuide")) return;
  const ios = isIOS();
  const step = (ic, txt) => `<li><span class="ig-ic">${ic}</span><span>${txt}</span></li>`;
  const steps = ios
    ? step(IC_SHARE, otherIosBrowser() ? T("Oben neben der Adresse auf <b>Teilen</b> tippen.", "Tap <b>Share</b> next to the address at the top.") : T("Unten auf <b>Teilen</b> tippen (auf dem iPad oben).", "Tap <b>Share</b> at the bottom (at the top on iPad)."))
      + step(IC_ADD, T("Nach unten wischen und <b>„Zum Home-Bildschirm“</b> wählen.", "Scroll down and choose <b>“Add to Home Screen”</b>."))
      + step(`<img src="icons/icon-192.png" alt="" width="26" height="26">`, T("Oben rechts auf <b>„Hinzufügen“</b> tippen. Das Symbol liegt danach auf dem Home-Bildschirm.", "Tap <b>“Add”</b> at the top right. The icon is then on your home screen."))
    : step(IC_ADD, T("Im Browser-Menü <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b> wählen. Am Computer erscheint dafür ein Symbol rechts in der Adresszeile.", "In the browser menu choose <b>“Install app”</b> or <b>“Add to Home screen”</b>. On a computer a symbol appears at the right of the address bar."));
  const warn = ios && inAppBrowser() ? `<p class="ig-warn">${T("Du bist gerade in einem Browser innerhalb einer anderen App. Dort geht die Installation nicht: erst im Menü „In Safari öffnen“ wählen.", "You are in a browser inside another app. Installing does not work there: first choose “Open in Safari” in its menu.")}</p>` : "";
  const box = document.createElement("div");
  box.id = "installGuide"; box.className = "ig-back";
  box.innerHTML = `<div class="ig-card" role="dialog" aria-modal="true" aria-label="${T("App installieren", "Install app")}">
    <h2>${T("AtHeight als App installieren", "Install AtHeight as an app")}</h2>
    <p class="ig-sub">${ios ? T("Ohne App Store, in 3 Schritten. Danach startet AtHeight ohne Browserleiste und zeigt den letzten Stand auch ohne Netz.", "No app store, in 3 steps. AtHeight then starts without the browser bar and shows the last data offline.") : T("Danach startet AtHeight ohne Browserleiste und zeigt den letzten Stand auch ohne Netz.", "AtHeight then starts without the browser bar and shows the last data offline.")}</p>
    ${warn}<ol class="ig-steps">${steps}</ol>
    <button type="button" class="primary" id="installGuideOk">${T("Verstanden", "Got it")}</button></div>`;
  document.body.appendChild(box);
  $("installGuideOk").onclick = installGuideClose;
  box.onclick = e => { if(e.target === box) installGuideClose(); };
  $("installGuideOk").focus();
}
document.addEventListener("keydown", e => { if(e.key === "Escape") installGuideClose(); });
function installShow(ios){
  if($("installBox") || isStandalone() || installSnoozed()) return;
  const box = document.createElement("div");
  box.id = "installBox"; box.className = "install-box"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", T("App installieren", "Install app"));
  box.innerHTML = `<img src="icons/icon-192.png" alt="" width="44" height="44">
    <div><b>${T("AtHeight als App installieren", "Install AtHeight as an app")}</b><span>${ios ? T("Dauert 10 Sekunden, ohne App Store. Danach ohne Browserleiste und mit gespeichertem Stand ohne Netz.", "Takes 10 seconds, no app store. It then runs without the browser bar and with saved data offline.") : T("Startet ohne Browserleiste, mit Symbol auf dem Startbildschirm und gespeichertem Stand ohne Netz.", "Starts without the browser bar, with an icon on the home screen and saved data offline.")}</span></div>
    <div class="ib-btns"><button type="button" class="primary" id="installGo">${ios ? T("So geht’s", "How to") : T("Installieren", "Install")}</button><button type="button" class="ghost" id="installLater">${T("Später", "Later")}</button></div>`;
  document.body.appendChild(box);
  $("installLater").onclick = () => installClose(true);
  $("installGo").onclick = async () => {
    if(ios){ installClose(false); return installGuide(); }
    if(!await installNative()) installClose(false);
  };
}
/* Dauerhafter Link am Seitenende (z. B. wenn das Symbol vom Home-Bildschirm gelöscht wurde); nur im Browser, nicht in der installierten App */
(() => {
  const f = $("installFoot"); if(!f) return;
  f.hidden = isStandalone();
  $("installLink").onclick = async e => { e.preventDefault(); if(!await installNative()) installGuide(); };
})();
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; setTimeout(() => installShow(false), 4000); });
window.addEventListener("appinstalled", () => { installEvt = null; installClose(false); installGuideClose(); const f = $("installFoot"); if(f) f.hidden = true; });
// iPhone/iPad (Safari) kennt das Ereignis nicht: einmalig Anleitung anbieten
if(isIOS() && !isStandalone() && !navigator.webdriver) setTimeout(() => installShow(true), 6000);

/* ---------- Neue Version: Hinweis, wenn auf dem Server eine neuere App liegt ---------- */
/* Die Version steht als ?v= an den Dateien. Wir laden die Startseite am Cache vorbei und vergleichen. Nie automatisch neu laden:
   Eingaben im Tagesbericht gehen dabei verloren. */
const appVersion = html => (html.match(/css\/windbericht\.css\?v=([^"']+)/) || [])[1];
const ownVersion = () => appVersion(document.querySelector('link[href^="css/windbericht.css"]')?.outerHTML || "");
let updateShown = false;
async function checkUpdate(){
  if(updateShown || !navigator.onLine) return;
  try{
    const r = await fetch("index.html", {cache:"no-store"}); if(!r.ok) return;
    const v = appVersion(await r.text()), me = ownVersion();
    if(v && me && v !== me) updateShow();
  }catch(e){}
}
function updateShow(){
  if(updateShown) return; updateShown = true;
  const box = document.createElement("div");
  box.id = "updateBox"; box.className = "install-box update-box"; box.setAttribute("role", "alert");
  box.innerHTML = `<div><b>${T("Neue Version verfügbar", "New version available")}</b><span>${T("Vorher den Tagesbericht speichern oder drucken: Eingaben im Bericht gehen beim Neuladen verloren.", "Save or print the daily report first: entries in the report are lost on reload.")}</span></div>
    <div class="ib-btns"><button type="button" class="primary" id="updateGo">${T("Jetzt neu laden", "Reload now")}</button><button type="button" class="ghost" id="updateLater">${T("Später", "Later")}</button></div>`;
  document.body.appendChild(box);
  $("updateGo").onclick = () => location.reload();
  $("updateLater").onclick = () => { box.remove(); setTimeout(() => { updateShown = false; }, 30*6e4); };
}
if(!navigator.webdriver){
  setTimeout(checkUpdate, 15000);
  setInterval(checkUpdate, 30*6e4);
  document.addEventListener("visibilitychange", () => { if(!document.hidden) checkUpdate(); });
}
