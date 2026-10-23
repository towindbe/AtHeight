/* Windbericht · Start der App (muss als letztes Skript geladen werden) */
"use strict";

/* App-Dateien offline verfügbar machen (nicht im automatischen Test) */
if("serviceWorker" in navigator && !navigator.webdriver && /^https:|^http:\/\/localhost/.test(location.href)) navigator.serviceWorker.register("sw.js").catch(() => {});
attachScrub("chart", "main"); attachScrub("rain", "rain"); attachScrub("temp", "temp");
fillSettings();
initMap();
if(siteChosen) load(); else startFirstRun();
