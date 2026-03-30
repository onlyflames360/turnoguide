importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: '%VITE_FIREBASE_API_KEY%',
  authDomain: '%VITE_FIREBASE_AUTH_DOMAIN%',
  projectId: '%VITE_FIREBASE_PROJECT_ID%',
  storageBucket: '%VITE_FIREBASE_STORAGE_BUCKET%',
  messagingSenderId: '%VITE_FIREBASE_MESSAGING_SENDER_ID%',
  appId: '%VITE_FIREBASE_APP_ID%',
})

const messaging = firebase.messaging()

// Recibe push cuando la app está en segundo plano o el teléfono bloqueado
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Push recibido en background:', payload)
  const { title, body } = payload.notification ?? {}
  if (!title) return

  self.registration.showNotification(title, {
    body: body ?? '',
    icon: 'https://la-barbera.web.app/logo.png',
    badge: 'https://la-barbera.web.app/logo.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: { url: 'https://la-barbera.web.app' },
  })
})

// Al pulsar la notificación → abre la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? 'https://la-barbera.web.app'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith('https://la-barbera.web.app') && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
