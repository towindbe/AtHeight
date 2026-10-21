/* Windbericht · Start der App (muss als letztes Skript geladen werden) */
"use strict";

attachScrub("chart", "main"); attachScrub("rain", "rain"); attachScrub("temp", "temp");
fillSettings();
initMap();
if(siteChosen) load(); else startFirstRun();
