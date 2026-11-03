// Service worker mínimo: permite instalar la app en la pantalla de inicio.
// No guarda datos en caché para que pedidos y tarifas siempre sean en vivo.
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
