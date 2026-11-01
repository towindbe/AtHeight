/* AtHeight · Baustelle teilen (Link, QR-Code) und empfangen (Link, Nachricht oder Code einfügen)
   Die Daten stehen im Link hinter dem „#“ (geht nie an einen Server): #s1=<base64url von einer JSON-Liste>.
   Nie das Zugangs-Token teilen. Alles Empfangene wird geprüft und auf gültige Bereiche begrenzt. */
"use strict";

const SHARE_TAG = "s1";   // Version des Formats; bei Änderungen hochzählen und ältere weiter lesen
const b64uEnc = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDec = c => new TextDecoder().decode(Uint8Array.from(atob(c.replace(/-/g, "+").replace(/_/g, "/")), ch => ch.charCodeAt(0)));

const shareArr = s => {
  const w = !!s.windkraft;
  return [s.name, s.lat, s.lon, w ? 1 : 0, s.hub, s.rotor, s.work ?? null, s.path === false ? 0 : 1, s.access, s.wind, s.gust,
    s.nightWind ?? null, s.nightGust ?? null, s.minTemp, s.from, s.to, s.coatRh ?? null, s.coatDew ?? null, s.coatStop ? 1 : 0];
};
const shareCode = s => b64uEnc(JSON.stringify(shareArr(s)));
const BACKUP_TAG = "a1";   // Sicherung: Liste mehrerer Baustellen im selben Format
const backupCode = favs => b64uEnc(JSON.stringify(favs.map(f => shareArr({...f.site, name:f.name}))));
const backupLink = favs => `${location.origin}${location.pathname}#${BACKUP_TAG}=${backupCode(favs)}`;
const shareLink = s => `${location.origin}${location.pathname}#${SHARE_TAG}=${shareCode(s)}`;

const SHARE_MAX = 80000;   // Zeichen eines Codes (eine Sicherung enthält viele Baustellen)
const codeOf = (t, tag) => { const m = String(t || "").trim().match(new RegExp(`#?${tag}=([A-Za-z0-9_-]{8,${SHARE_MAX}})`)); return m ? m[1] : null; };
const readJson = c => { try{ return JSON.parse(b64uDec(c)); }catch(e){ return null; } };
/* Liest einen Code aus einem Link, einer ganzen Nachricht oder dem reinen Code; gibt eine geprüfte Baustelle zurück oder null */
function parseShare(text){
  const t = String(text || "").trim(), c = codeOf(t, SHARE_TAG) || (t.match(new RegExp(`^(W[A-Za-z0-9_-]{7,${SHARE_MAX}})$`)) || [])[1];
  return c ? siteFromArr(readJson(c)) : null;
}
/* Liest eine Sicherung (mehrere Baustellen); gibt eine Liste geprüfter Baustellen zurück oder null */
function parseBackup(text){
  const t = String(text || "").trim(), c = codeOf(t, BACKUP_TAG) || (t.match(new RegExp(`^(W1s[A-Za-z0-9_-]{5,${SHARE_MAX}})$`)) || [])[1];
  const a = c && readJson(c);
  if(!Array.isArray(a)) return null;
  const list = a.slice(0, 200).map(siteFromArr).filter(Boolean);
  return list.length ? list : null;
}
function siteFromArr(a){
  if(!Array.isArray(a)) return null;
  const num = (v, lo, hi, d) => typeof v === "number" && v >= lo && v <= hi ? v : d;   // außerhalb des Bereichs: Vorgabe (bei Koordinaten: Link ablehnen)
  const lat = num(a[1], -90, 90, null), lon = num(a[2], -180, 180, null);
  if(lat == null || lon == null) return null;
  const name = (typeof a[0] === "string" ? a[0] : "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) || "Standort";
  const windkraft = a[3] === 1, access = ["ground", "nacelle", "none"].includes(a[8]) ? a[8] : "ground";
  const wind = num(a[9], 0.1, 60, DEFAULT_SITE.wind), gust = num(a[10], 0.1, 80, DEFAULT_SITE.gust);
  let from = Math.round(num(a[14], 0, 23, DEFAULT_SITE.from)), to = Math.round(num(a[15], 0, 23, DEFAULT_SITE.to));
  if(to < from) [from, to] = [to, from];
  const s = {...DEFAULT_SITE, name, lat:+lat.toFixed(5), lon:+lon.toFixed(5), windkraft, path:a[7] !== 0, access, wind, gust, from, to,
    nightWind:num(a[11], 0.1, 60, DEFAULT_SITE.nightWind), nightGust:num(a[12], 0.1, 80, DEFAULT_SITE.nightGust),
    minTemp:Math.round(num(a[13], -50, 20, DEFAULT_SITE.minTemp)),
    coatRh:Math.round(num(a[16], 30, 100, 80)), coatDew:num(a[17], 0, 10, 3), coatStop:a[18] === 1,
    hub:num(a[4], 20, 250, DEFAULT_SITE.hub), rotor:num(a[5], 0, 250, 0), work:a[6] == null ? null : Math.round(num(a[6], 10, 300, 10)),
    checked:false, excluded:[]};
  if(!windkraft){   // wie in den Einstellungen: ohne Windenergieanlage ist die Arbeitshöhe die Bezugshöhe
    const w = clamp(s.work ?? s.hub, 10, 300);
    s.work = w; s.hub = w; s.rotor = 0; if(s.access === "nacelle") s.access = "ground";
  }
  return cleanSite(s);
}

/* ---------- Fenster (gleiche Karte wie die Installationsanleitung) ---------- */
function shareDialogClose(){ $("shareDlg")?.remove(); }
function shareDialog(title, bodyHtml, buttonsHtml){
  shareDialogClose();
  const box = document.createElement("div");
  box.id = "shareDlg"; box.className = "ig-back";
  box.innerHTML = `<div class="ig-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>${bodyHtml}<div class="sh-btns">${buttonsHtml}</div></div>`;
  document.body.appendChild(box);
  box.onclick = e => { if(e.target === box) shareDialogClose(); };
  return box;
}
document.addEventListener("keydown", e => { if(e.key === "Escape") shareDialogClose(); });
const siteSummary = s => `<div class="sh-sum"><b>${esc(s.name)}</b><span>${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</span>
  <span>${T("Arbeitshöhe", "Working height")} ${s.work || s.hub} m${s.windkraft ? ` · ${T("Nabe", "Hub")} ${s.hub} m` : ""}</span>
  <span>${T("Grenzen Tag", "Day limits")}: ${T("Wind", "wind")} ${fw(s.wind)} / ${T("Böe", "gust")} ${fwu(s.gust)}</span>
  <span>${T("Grenzen Nacht", "Night limits")}: ${fw(s.nightWind)} / ${fwu(s.nightGust)} · ${T("Mindesttemp.", "min. temp.")} ${fmt(s.minTemp, 0)} °C</span>
  <span>${T("Arbeitszeit", "Working hours")} ${String(s.from).padStart(2, "0")}–${String(s.to).padStart(2, "0")} ${T("Uhr", "h")}</span></div>`;

/* Senden: Fenster mit QR-Code, „Senden“ (Teilen-Menü des Geräts) und „Link kopieren“ */
function shareOpen(name, s){
  const sh = {...s, name};
  const link = shareLink(sh);
  const msg = `${T(`AtHeight-Baustelle „${name}“ (${sh.lat.toFixed(4)}, ${sh.lon.toFixed(4)}). Zum Übernehmen antippen:`, `AtHeight site “${name}” (${sh.lat.toFixed(4)}, ${sh.lon.toFixed(4)}). Tap to add it:`)}\n${link}`;
  let qr = "";
  try{ const q = qrcode(0, "L"); q.addData(link); q.make(); qr = q.createSvgTag({cellSize:4, margin:4, scalable:true}); }catch(e){}
  const box = shareDialog(T("Baustelle teilen", "Share site"),
    `${siteSummary(sh)}${qr ? `<div class="sh-qr" aria-label="QR-Code">${qr}</div><p class="ig-sub">${T("Der Kollege scannt den QR-Code mit der Kamera-App und tippt auf den Link. Oder du schickst den Link.", "Your colleague scans the QR code with the camera app and taps the link. Or you send the link.")}</p>` : ""}
    <p class="ig-sub">${T("Enthalten sind Standort, Höhen und Grenzwerte, nie dein Zugang.", "Includes location, heights and limits, never your access.")}</p>`,
    `${navigator.share ? `<button type="button" class="primary" id="shSend">${T("Senden", "Send")}</button>` : ""}<button type="button" class="${navigator.share ? "ghost" : "primary"}" id="shCopy">${T("Link kopieren", "Copy link")}</button><button type="button" class="ghost" id="shClose">${T("Schließen", "Close")}</button>`);
  $("shClose").onclick = shareDialogClose;
  $("shCopy").onclick = async () => {
    try{ await navigator.clipboard.writeText(msg); $("shCopy").textContent = T("Kopiert", "Copied"); }
    catch(e){ window.prompt(T("Link kopieren:", "Copy link:"), link); }
  };
  if($("shSend")) $("shSend").onclick = () => { navigator.share({text: msg}).catch(() => {}); };
}

/* Empfangen: Prüfen, anzeigen, übernehmen */
function shareImport(s){
  const favs = loadFavs(), dup = favs.find(f => f.name === s.name || sameSpot(f.site, s));
  const box = shareDialog(T("Baustelle erhalten", "Site received"),
    `${siteSummary(s)}${dup ? `<p class="ig-warn">${T(`Gibt es schon als „${dup.name}“. Beim Übernehmen wird sie durch diese ersetzt.`, `Already saved as “${dup.name}”. Adding replaces it with this one.`)}</p>` : ""}
    <p class="ig-sub">${T("Prüfe vor dem Übernehmen die Grenzwerte: Sie gelten dann für diese Baustelle.", "Check the limits before adding: they then apply to this site.")}</p>`,
    `<button type="button" class="primary" id="shAdd">${dup ? T("Ersetzen und öffnen", "Replace and open") : T("Hinzufügen und öffnen", "Add and open")}</button><button type="button" class="ghost" id="shClose">${T("Abbrechen", "Cancel")}</button>`);
  $("shClose").onclick = shareDialogClose;
  $("shAdd").onclick = () => {
    shareDialogClose();
    site = {...s}; upsertFav(); siteReady(); saveSite(); fillSettings(); toggleFavs(false);
    if(map){ cancelPending(); map.setView([site.lat, site.lon], 14); }
    load();
  };
}
function shareFail(){
  const box = shareDialog(T("Link nicht lesbar", "Link not readable"), `<p class="ig-sub">${T("Der Link oder Code ist unvollständig oder beschädigt. Bitte den Kollegen, die Baustelle noch einmal zu teilen.", "The link or code is incomplete or damaged. Please ask your colleague to share the site again.")}</p>`,
    `<button type="button" class="primary" id="shClose">${T("Schließen", "Close")}</button>`);
  $("shClose").onclick = shareDialogClose;
}

/* Sicherung aller gespeicherten Baustellen: als Link/Text verschicken (z. B. an sich selbst), später oder auf einem neuen Handy wieder einfügen */
function backupOpen(){
  const favs = loadFavs();
  if(!favs.length){
    shareDialog(T("Alle Baustellen sichern", "Back up all sites"), `<p class="ig-sub">${T("Es sind noch keine Baustellen gespeichert.", "No sites saved yet.")}</p>`, `<button type="button" class="primary" id="shClose">${T("Schließen", "Close")}</button>`);
    $("shClose").onclick = shareDialogClose; return;
  }
  const link = backupLink(favs);
  const msg = `${T(`AtHeight-Sicherung (${favs.length} Baustellen). Zum Wiederherstellen antippen oder in der App unter „Baustelle erhalten?“ einfügen:`, `AtHeight backup (${favs.length} sites). Tap to restore or paste it in the app under “Received a site?”:`)}
${link}`;
  shareDialog(T("Alle Baustellen sichern", "Back up all sites"),
    `<div class="sh-sum">${favs.map(f => `<span>${esc(f.name)}</span>`).join("")}</div>
    <p class="ig-sub">${T("Schicke dir den Link selbst (Mail, WhatsApp, Notizen). Bei Handywechsel oder Datenverlust fügst du ihn in der App wieder ein. Grenzwerte und Höhen sind enthalten, nie dein Zugang.", "Send the link to yourself (mail, WhatsApp, notes). After changing phones or losing data, paste it into the app again. Limits and heights are included, never your access.")}</p>`,
    `${navigator.share ? `<button type="button" class="primary" id="shSend">${T("Senden", "Send")}</button>` : ""}<button type="button" class="${navigator.share ? "ghost" : "primary"}" id="shCopy">${T("Link kopieren", "Copy link")}</button><button type="button" class="ghost" id="shClose">${T("Schließen", "Close")}</button>`);
  $("shClose").onclick = shareDialogClose;
  $("shCopy").onclick = async () => {
    try{ await navigator.clipboard.writeText(msg); $("shCopy").textContent = T("Kopiert", "Copied"); }
    catch(e){ window.prompt(T("Link kopieren:", "Copy link:"), link); }
  };
  if($("shSend")) $("shSend").onclick = () => { navigator.share({text: msg}).catch(() => {}); };
}
function backupImport(list){
  const favs = loadFavs(), isDup = s => favs.some(f => f.name === s.name || sameSpot(f.site, s)), n = list.filter(isDup).length;
  shareDialog(T("Sicherung erhalten", "Backup received"),
    `<div class="sh-sum"><b>${list.length} ${T(list.length === 1 ? "Baustelle" : "Baustellen", list.length === 1 ? "site" : "sites")}</b>${list.map(s => `<span>${esc(s.name)}${isDup(s) ? ` (${T("ersetzt die vorhandene", "replaces the existing one")})` : ""}</span>`).join("")}</div>
    ${n ? `<p class="ig-warn">${T(`${n} davon gibt es schon. Sie werden durch die gesicherten ersetzt.`, `${n} of them already exist. They are replaced by the backed-up ones.`)}</p>` : ""}`,
    `<button type="button" class="primary" id="shAdd">${T("Alle hinzufügen", "Add all")}</button><button type="button" class="ghost" id="shClose">${T("Abbrechen", "Cancel")}</button>`);
  $("shClose").onclick = shareDialogClose;
  $("shAdd").onclick = () => {
    shareDialogClose();
    let all = loadFavs();
    for(const s of list) all = all.filter(f => f.name !== s.name && !sameSpot(f.site, s)).concat({name:s.name, site:{...s}});
    all.sort((a, b) => a.name.localeCompare(b.name, "de")); saveFavs(all);
    toggleFavs(true);
  };
}

/* Beim Start oder wenn sich die Adresse ändert: „#s1=…“ lesen und aus der Adresszeile entfernen */
function shareFromHash(){
  if(!new RegExp(`^#(${SHARE_TAG}|${BACKUP_TAG})=`).test(location.hash)) return;
  const h = location.hash, b = parseBackup(h), s = b ? null : parseShare(h);
  try{ history.replaceState(null, "", location.pathname + location.search); }catch(e){}
  b ? backupImport(b) : s ? shareImport(s) : shareFail();
}
window.addEventListener("hashchange", () => { if(TOKEN) shareFromHash(); });

/* Feld „Link einfügen“ im Baustellen-Fenster (für die installierte App, in die ein Link nicht direkt führt) */
function pasteCheck(){
  const v = $("pasteIn").value.trim(); if(!v) return;
  const b = parseBackup(v), s = b ? null : parseShare(v);
  $("pasteErr").hidden = !!(b || s);
  if(b || s){ $("pasteIn").value = ""; toggleFavs(false); b ? backupImport(b) : shareImport(s); }
}
$("pasteGo").onclick = pasteCheck;
$("pasteIn").onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); pasteCheck(); } };
$("pasteIn").onpaste = () => setTimeout(pasteCheck, 0);
$("favBackup").onclick = () => { toggleFavs(false); backupOpen(); };
$("favShareCur").onclick = () => { toggleFavs(false); shareOpen(site.name, site); };
