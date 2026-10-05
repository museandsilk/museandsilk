/* Firebase Cloud Messaging service worker for the Nure Asmir admin panel.
   Shows order alerts while no admin tab is focused. Keep the config in sync with lib/firebase/config.ts. */
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA6jb6Q1h5iA6uvZy5-t7pu20VPN_NGvsM",
  authDomain: "nureasmir.firebaseapp.com",
  projectId: "nureasmir",
  storageBucket: "nureasmir.firebasestorage.app",
  messagingSenderId: "731961563546",
  appId: "1:731961563546:web:24d8c83c88c195cb068223",
});

const messaging = firebase.messaging();

// Messages are data-only (see lib/push/fcm.ts), so we build the notification ourselves.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || "Nure Asmir", {
    body: data.body || "",
    icon: "/logo-icon.png",
    badge: "/logo-icon.png",
    tag: data.tag || "nure-asmir-order",
    data: { url: data.url || "/admin/orders" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/admin/orders", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin + "/admin") && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
