/* Windbericht · Tagesbericht, Prüfsumme, JSON-Export */
"use strict";

/* ---------- Tagesbericht ---------- */
async function sha256(text){
  try{ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
  catch(e){ return "nicht verfügbar"; }
}
/* Bericht einfrieren: Drucken und JSON-Export verwenden exakt dieselben Daten und dieselbe Prüfsumme.
   Neu erzeugt wird nur, wenn sich der Inhalt (Prognose oder Eingaben) geändert hat.
   Prüfsumme = SHA-256 über JSON.stringify(daten) ohne das Feld "pruefsumme". */
let frozen = null;
async function freezeReport(){
  const snap = snapshot(), {erstellt, ...content} = snap, key = JSON.stringify(content);
  if(!frozen || frozen.key !== key) frozen = {key, snap, hash: await sha256(JSON.stringify(snap))};
  return frozen;
}
function snapshot(){
  return {erstellt:new Date().toISOString(), abgerufen:state.fetchedAt?.toISOString(), standort:site, tag:state.day,
    bericht:{projekt:$("r_project").value, anlage:$("r_turbine").value, team:$("r_team").value, aufsicht:$("r_lead").value, taetigkeit:$("r_task").value, entscheidung:$("r_decision").value, bemerkungen:$("r_notes").value},
    warnlage: warnState(state.day).note || null,
    warnungen: allWarnings().map(w => ({quelle:w.src, stufe:w.lvl, titel:w.title, ampelrelevant:w.relevant, beginn:isFinite(w.start)?new Date(w.start).toISOString():null, ende:isFinite(w.end)?new Date(w.end).toISOString():null})),
    fazit:{ampel:state.summary?.lamp, text:(state.summary?.head||"")+" "+(state.summary?.text||"")},
    bereich:{arbeitshoehe:workH(), bis:zoneTop(), text:zoneTxt()},
    modelle: state.results.map(r=>({id:r.m.id, name:r.m.name, anbieter:r.m.org, status:isExcluded(r) && (r.status==="ok"||r.status==="extrap") ? "ausgeschlossen" : r.status, abfrage:apiUrl(r.m),
      werte: r.series ? dayHours(state.day).map(h => { const s = r.series[h.i]; return s ? {zeit:h.t, utc:utcStr(h.t), wind:s.v, boe:s.g, richtung:s.dir, hochgerechnet:s.ext} : null; }) : null})),
    stunden: dayHours(state.day).map(h=>({zeit:h.t, utc:utcStr(h.t), ampel:h.lamp, median:h.med, min:h.min, max:h.max, boe:h.gMed, richtung:h.dir.mean, modelle:h.n, ueberGrenze:h.over, regen:h.rain, cape:h.cape, tempArbeit:h.tW, gefuehlt:h.chill, uv:h.uv, ensembleUeberGrenze:h.pEns, ensembleLaeufe:h.nEns, gruende:h.why.map(w=>w.t)}))};
}
/* Einfärbung im Bericht: gelb ab 75 % des Grenzwerts, rot darüber */
const level = (v, lim) => v==null ? "" : v > lim ? "over" : v >= 0.75*lim ? "near" : "";
const DECISION = {"Freigegeben zum Arbeiten":"go", "Freigegeben":"go", "Eingeschränkt freigegeben":"warn", "Nicht freigegeben":"stop"};
// Kurzform der Gründe für die Berichtstabelle (Details stehen im Warnkasten bzw. in der App)
const shortWhy = t => t
  .replace(/^Amtliche Warnung (\S+): .*/, "Warnung $1")
  .replace(" (außerhalb der bürgerlichen Dämmerung)", "")
  .replace("Einzelne Modelle über Mittelwind-Grenze", "Einzelmodelle Wind über Grenze")
  .replace("Einzelne Modelle mit Böe über Grenze", "Einzelmodelle Böe über Grenze")
  .replace(/^Szenarien: (\d+) % über Grenze$/, "Szenarien $1 %");
function reportRows(hs){
  return hs.map(h => `<tr class="${h.dark?"dk":""}">
    <td><span class="rp-pill ${h.lamp}">${LAMP_TXT[h.lamp]}</span>${hh(h.t)}:00</td>
    <td class="${level(h.med, site.wind)}">${fmt(h.med)}</td>
    <td>${fmt(h.min)}–${fmt(h.max)}</td>
    <td class="${level(h.gMed, site.gust)}">${fmt(h.gMed)}</td>
    <td>${dirName(h.dir.mean)}</td>
    <td class="${h.n && h.over>=h.n/2 ? "over" : h.over>0 ? "near" : ""}">${h.n ? h.over+"/"+h.n : "–"}</td>
    <td class="${h.pEns==null ? "" : h.pEns>=ENS_WARN ? "over" : h.pEns>=ENS_INFO ? "near" : ""}">${h.pEns==null ? "–" : Math.round(h.pEns*100)+" %"}</td>
    <td class="${h.rain>=RAIN_WARN ? "near" : ""}">${fmt(h.rain)}</td>
    <td class="${h.cape>=CAPE_STOP ? "over" : h.cape>=CAPE_WARN ? "near" : ""}">${h.cape==null?"–":Math.round(h.cape)}</td>
    <td>${fmt(h.tW,0)}</td>
    <td class="${h.chill!=null && h.chill<=CHILL_WARN ? "over" : h.chill!=null && h.chill<=CHILL_INFO ? "near" : ""}">${fmt(h.chill,0)}</td>
    <td class="why">${esc(h.why.filter(w=>w.l!=="go").map(w=>shortWhy(w.t)).join(" · ")) || "–"}</td></tr>`).join("");
}
async function buildReport(){
  const {snap, hash} = await freezeReport();
  const b = snap.bericht, sum = state.summary || {}, hs = dayHours(state.day);
  const u = usableModels(), dl = daylight(state.day), {ws, kind, note} = warnState(state.day);
  const age = Date.parse(snap.erstellt) - state.fetchedAt, dec = DECISION[b.entscheidung] || "na";
  const longDay = new Date(state.day+"T12:00:00").toLocaleDateString("de-DE", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
  const kv = rows => `<dl class="rp-kv">${rows.map(([k,v]) => `<dt>${k}</dt><dd>${v || "–"}</dd>`).join("")}</dl>`;
  $("report").innerHTML = `
    <div class="rp-head">
      <div><div class="eyebrow">Tagesbericht Wetter</div><h1>${esc(site.name)}</h1>
        <div class="sub">${esc(longDay)} · Arbeitszeit ${site.from}–${site.to} Uhr${dl.start && dl.end ? ` · hell ${dl.start}–${dl.end}` : ""}</div></div>
    </div>

    <div class="rp-sec rp-verdict">
      <div class="rp-box ${sum.lamp==="none" ? "na" : sum.lamp}">
        <div class="rp-big"><span class="rp-lamp ${sum.lamp}">${esc(LAMP_TXT[sum.lamp]||"")}</span>${esc(sum.head||"")}</div>
        <div style="margin-top:4px">${esc(sum.text||"")}</div>
      </div>
      <div class="rp-box rp-dec ${dec}"><small>Entscheidung Aufsichtführender</small><b>${esc(b.entscheidung)}</b></div>
    </div>

    <div class="rp-sec">
      <h3>Arbeitsfenster</h3>
      <div class="rp-strip">${hs.map(h => `<div class="${h.lamp} ${h.dark?"dark":""}">${hh(h.t)}</div>`).join("")}</div>
      <div class="rp-legend"><span><i style="background:var(--go)"></i>GO</span><span><i style="background:var(--warn)"></i>Prüfen</span><span><i style="background:var(--stop)"></i>Stop</span><span><i style="background:#fff;border:1px solid var(--line);background-image:repeating-linear-gradient(135deg,rgba(0,0,0,.35) 0 2px,transparent 2px 4px)"></i>Nacht</span></div>
    </div>

    <div class="rp-sec rp-cols">
      <div class="rp-box"><h3>Einsatz</h3>${kv([["Projekt", esc(b.projekt)], ["Anlage / Typ", esc(b.anlage)], ["Tätigkeit", esc(b.taetigkeit)], ["Team", esc(b.team)], ["Aufsicht", esc(b.aufsicht)]])}</div>
      <div class="rp-box"><h3>Standort &amp; Grenzwerte</h3>${kv([["Koordinaten", `${fmt(site.lat,4)}° N, ${fmt(site.lon,4)}° E`], ["Nabe / Rotor", `${site.hub} m / ${site.rotor} m`],
        ["Arbeitsbereich", zoneTxt() + (zoneTop()!==workH() ? " (Seilweg bis Nabe)" : "")], ["Max. Mittelwind", fmt(site.wind)+" m/s"], ["Max. Böe", fmt(site.gust)+" m/s"]])}</div>
    </div>

    <div class="rp-sec rp-box rp-warn ${kind==="list" ? (ws.some(w=>w.relevant && w.lvl>=3) ? "stop" : "warn") : kind==="ok" ? "go" : "na"}">
      <h3>Amtliche Warnungen (DWD, GeoSphere Austria)</h3>
      ${ws.map(w => `<div class="wb-${!w.relevant ? "info" : w.lvl>=3 ? "stop" : "warn"}"><b>${esc(w.src)}: ${esc(w.title)}</b> · ${esc(fmtWhen(w.start))} bis ${esc(fmtWhen(w.end))}</div>`).join("")}
      ${note ? `<div style="border:0;padding:0">${kind==="ok" ? "✓ " : ""}${esc(note)}</div>` : ""}
    </div>

    <div class="rp-sec">
      <h3>Prognose je Stunde · Wind und Böe im Bereich ${zoneTxt()} (m/s)</h3>
      <table class="rp-t"><thead><tr><th>Uhr</th><th>Wind</th><th>Spanne</th><th>Böe</th><th>Ri.</th><th title="Anzahl der Modelle mit Mittelwind oder Böe über euren Grenzwerten">Modelle über Grenze</th><th>Szenarien</th><th>Regen</th><th>CAPE</th><th>°C</th><th>Gefühlt</th><th>Gründe</th></tr></thead>
      <tbody>${reportRows(hs)}</tbody></table>
      <div class="rp-small" style="margin-top:3px">Gelb: ab 75 % des Grenzwerts bzw. Hinweis · Rot: über Grenzwert · Schraffiert: Nacht</div>
    </div>

    <div class="rp-sec rp-box"><h3>Bemerkungen / Tagesverlauf</h3>${esc(b.bemerkungen).replace(/\n/g,"<br>") || "Keine Bemerkungen."}</div>

    <div class="rp-sec rp-small">
      <b>Grundlagen.</b> Abgerufen ${state.fetchedAt.toLocaleString("de-DE")}, Bericht erstellt ${new Date(snap.erstellt).toLocaleString("de-DE")}.
      ${age > STALE_MS ? `<span class="rp-alert">Achtung: Die Prognose war bei Berichtserstellung ${fmtAge(age)} alt.</span>` : ""}
      Ausgewertete Modelle (${u.length}): ${u.map(r=>esc(r.m.name+" ("+r.m.org+")")).join(", ")}.
      ${(() => { const x = state.results.filter(r => isExcluded(r) && (r.status==="ok"||r.status==="extrap")); return x.length ? `<b>Von Hand ausgeschlossen:</b> ${x.map(r=>esc(r.m.name+" ("+r.m.org+")")).join(", ")}.` : ""; })()}
      Szenarien: ${(extras.ens||[]).filter(e => e.ok).map(e => `${e.name} (${e.members})`).join(", ") || "nicht verfügbar"}.
      Regeln: Stop bei Median über Grenzwert, Gewitter in mind. einem Drittel der Modelle, CAPE ab ${CAPE_STOP} J/kg oder Unwetterwarnung bzw. Warnstufe rot.
      Prüfen bei einzelnen Modellen über Grenzwert, Schauer, CAPE ab ${CAPE_WARN} J/kg, Nacht, Windchill ab ${CHILL_WARN} °C, mind. ${Math.round(ENS_WARN*100)} % der Szenarien über Grenze oder amtlicher Warnung.
      Wind auf den Arbeitsbereich interpoliert (Höchstwert im Bereich), Böen in der Höhe aus dem 10-m-Böenfaktor geschätzt. Datenquelle Open-Meteo.com (CC BY 4.0).
      Entscheidungshilfe; die Freigabe trifft der Aufsichtführende.
    </div>

    <div class="sig"><div>Datum, Unterschrift Aufsichtführender</div><div>Datum, Unterschrift Auftraggeber (optional)</div></div>
    <div class="rp-small" style="margin-top:8px">Prüfsumme (SHA-256) der Berichtsdaten: <span class="mono">${hash}</span> · dieselbe Zahl steht in der zugehörigen JSON-Datei (prüfbar mit tools/pruefen.py).</div>`;
  return {snap, hash};
}
