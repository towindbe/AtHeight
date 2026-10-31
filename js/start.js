/* AtHeight · Start der App (muss als letztes Skript geladen werden) */
"use strict";

/* App-Dateien offline verfügbar machen (nicht im automatischen Test) */
if("serviceWorker" in navigator && !navigator.webdriver && /^https:|^http:\/\/localhost/.test(location.href)) navigator.serviceWorker.register("sw.js").catch(() => {});
attachScrub("chart", "main"); attachScrub("rain", "rain"); attachScrub("temp", "temp");
fillSettings();
initMap();
if(!TOKEN){   // ohne Zugangs-Token nichts laden
  document.body.classList.add("no-site");
  $("headline").textContent = T("Kein Zugang", "No access");
  $("errorBox").hidden = false;
  $("errorBox").textContent = T("Für diese App brauchst du einen Zugangslink. Bitte bei Tobias Windberg anfragen und den Link öffnen.", "You need an access link for this app. Please request one from Tobias Windberg and open it.");
}
else if(siteChosen) load(); else startFirstRun();
