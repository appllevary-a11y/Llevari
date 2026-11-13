importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDzzaUVgYblBrrHhizKBGry4RovYsDFFck",
  projectId: "llevari",
  messagingSenderId: "219910137529",
  appId: "1:219910137529:web:9e8fab72d2db39d89add68"
});

const messaging = firebase.messaging();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// El push web llega solo con "data": aquí armamos la notificación (evita duplicados)
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  return self.registration.showNotification(d.title || "LLEVARI", {
    body: d.body || "",
    icon: "logo.png",
    tag: (d.pedidoId || "pedido") + "-" + (d.tipo || "aviso"),
    renotify: true,
    requireInteraction: true,
    vibrate: [600, 200, 600, 200, 600],
    data: { tipo: d.tipo || "", pedidoId: d.pedidoId || "", restId: d.restId || "" }
  });
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
