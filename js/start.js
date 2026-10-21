/* Windbericht · Start der App (muss als letztes Skript geladen werden) */
"use strict";

attachScrub("chart", "main"); attachScrub("rain", "rain");
fillSettings();
initMap();
if(siteChosen) load(); else startFirstRun();
