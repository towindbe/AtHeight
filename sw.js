/* Windbericht · Service Worker: App-Dateien offline verfügbar machen.
   Wetterdaten werden hier nicht zwischengespeichert (das macht die App selbst, mit Zeitstempel). */
"use strict";
const CACHE = "windbericht-app-v1";
const SHELL = ["windbericht.html", "info.html", "manifest.webmanifest", "icons/icon-192.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"];
const isApp = u => u.origin === location.origin || u.hostname === "cdnjs.cloudflare.com" || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Erst Netz (damit Änderungen sofort ankommen), bei Fehler die gespeicherte Kopie. Wetter- und Kartendienste gehen unverändert durch. */
self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if(req.method !== "GET" || !isApp(u)) return;
  e.respondWith(fetch(req).then(res => {
    if(res && (res.ok || res.type === "opaque")){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, {ignoreSearch: req.mode === "navigate"}).then(r => r || (req.mode === "navigate" ? caches.match("windbericht.html") : Response.error()))));
});
