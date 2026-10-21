/* Windbericht · Gespeicherte Anlagen (Favoriten) */
"use strict";

/* ---------- Favoriten (gespeicherte Anlagen) ---------- */
function loadFavs(){ try{ const f = JSON.parse(localStorage.getItem("wb_favs")||"[]"); return Array.isArray(f) ? f.filter(x => x && x.site && typeof x.site.lat==="number") : []; }catch(e){ return []; } }
function saveFavs(f){ try{ localStorage.setItem("wb_favs", JSON.stringify(f)); }catch(e){} }
const sameSpot = (a, b) => Math.abs(a.lat-b.lat)<1e-4 && Math.abs(a.lon-b.lon)<1e-4;
const isCurrent = f => siteChosen && sameSpot(f.site, site);
function upsertFav(){
  // gleicher Name oder gleicher Standort wird ersetzt
  const favs = loadFavs().filter(f => f.name !== site.name && !sameSpot(f.site, site));
  favs.push({name:site.name, site:{...site}});
  favs.sort((a,b) => a.name.localeCompare(b.name, "de"));
  saveFavs(favs);
}
function renderFavs(){
  const favs = loadFavs(), cur = favs.find(isCurrent);
  $("favList").innerHTML = !favs.length
    ? `<div class="fav-empty">Noch keine Anlagen gespeichert.</div>`
    : favs.map((f,k) => `<div class="fav-item ${isCurrent(f)?"cur":""}">
    <button type="button" class="fav-go" data-k="${k}"><span>${isCurrent(f)?"● ":""}${esc(f.name)}</span><small>Arbeit ${f.site.work || f.site.hub} m · Nabe ${f.site.hub} m · ${fw(f.site.wind)}/${fwu(f.site.gust)}</small></button>
    <button type="button" class="fav-del" data-k="${k}" title="Anlage löschen" aria-label="${esc(f.name)} löschen">×</button></div>`).join("");
  $("favSaved").hidden = !cur;
  if(cur) $("favSaved").textContent = `„${cur.name}“ ist gespeichert. Änderungen unter „Einstellungen“ werden automatisch übernommen.`;
  $("favSaveRow").hidden = !!cur || !siteChosen;
  $("favList").querySelectorAll(".fav-go").forEach(b => b.onclick = () => {
    const f = loadFavs()[+b.dataset.k]; if(!f) return;
    site = {...DEFAULT_SITE, ...f.site, name:f.name};
    siteReady(); saveSite(); fillSettings(); toggleFavs(false);
    if(map){ cancelPending(); map.setView([site.lat, site.lon], 14); }
    load();
  });
  $("favList").querySelectorAll(".fav-del").forEach(b => b.onclick = () => {
    const f = loadFavs(), k = +b.dataset.k;
    if(!f[k] || !confirm(`„${f[k].name}“ aus den gespeicherten Anlagen löschen?`)) return;
    f.splice(k, 1); saveFavs(f); renderFavs();
  });
}
function toggleFavs(open){
  $("favPanel").hidden = !open; $("favBtn").setAttribute("aria-expanded", String(open));
  if(open){ $("favName").value = site.name; renderFavs(); }
}
function addFav(){
  const name = $("favName").value.trim();
  if(!name){ $("favName").focus(); return; }
  site = {...site, name}; upsertFav(); saveSite(); fillSettings();
  renderFavs();
}
$("favNew").onclick = () => pointToMap(8000);
$("heroMapBtn").onclick = () => pointToMap();
$("favBtn").onclick = e => { e.stopPropagation(); toggleFavs($("favPanel").hidden); };
document.addEventListener("click", e => { if(!$("favPanel").hidden && e.target.isConnected && !$("favPanel").contains(e.target)) toggleFavs(false); });
document.addEventListener("keydown", e => { if(e.key==="Escape" && !$("favPanel").hidden) toggleFavs(false); });
$("favAdd").onclick = addFav;
$("favName").onkeydown = e => { if(e.key==="Enter"){ e.preventDefault(); addFav(); } };
