importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore-compat.js')

firebase.initializeApp({
  apiKey: '%VITE_FIREBASE_API_KEY%',
  authDomain: '%VITE_FIREBASE_AUTH_DOMAIN%',
  projectId: '%VITE_FIREBASE_PROJECT_ID%',
  storageBucket: '%VITE_FIREBASE_STORAGE_BUCKET%',
  messagingSenderId: '%VITE_FIREBASE_MESSAGING_SENDER_ID%',
  appId: '%VITE_FIREBASE_APP_ID%',
})

const messaging = firebase.messaging()
const db = firebase.firestore()

const APP_URL = 'https://la-barbera.web.app'

const ROLE_LABELS = {
  audio: 'Audio', video: 'Video', micro1: 'Micro 1', micro2: 'Micro 2',
  plataforma: 'Plataforma', auditorio: 'Auditorio', entrada: 'Entrada', parking: 'Vehículos',
}

// Recibe todos los push en background/bloqueado
messaging.onBackgroundMessage((payload) => {
  // Alerta de emergencia → notificación crítica roja
  if (payload.data?.type === 'emergency') {
    const { title, body, roleLabel, senderName } = payload.data
    self.registration.showNotification(title, {
      body,
      icon: `${APP_URL}/hero-avatar.png`,
      badge: `${APP_URL}/logo.png`,
      vibrate: [500, 100, 500, 100, 500, 100, 500],
      requireInteraction: true,
      tag: 'emergency',
      renotify: true,
      data: { type: 'emergency', url: APP_URL, roleLabel, senderName },
    })
    return
  }

  // Recordatorio de turno → mostrar con botones de acción
  if (payload.data?.type === 'reminder') {
    const assignments = JSON.parse(payload.data.assignments || '[]')
    self.registration.showNotification(payload.data.title, {
      body: payload.data.body,
      icon: `${APP_URL}/hero-avatar.png`,
      badge: `${APP_URL}/logo.png`,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      actions: [
        { action: 'puedo',   title: '✅ Puedo' },
        { action: 'nopuedo', title: '❌ No puedo' },
      ],
      data: { type: 'reminder', assignments, url: APP_URL },
    })
    return
  }

  // Resto de pushes (solicitudes, alertas de coordinador, etc.)
  const { title, body } = payload.notification ?? {}
  if (!title) return
  self.registration.showNotification(title, {
    body: body ?? '',
    icon: `${APP_URL}/hero-avatar.png`,
    badge: `${APP_URL}/logo.png`,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: { url: APP_URL },
  })
})

// Gestiona el clic en la notificación o en sus botones
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const notifData = event.notification.data ?? {}
  const action = event.action

  // Botones Puedo / No puedo → escribir respuesta en Firestore sin abrir la app
  if ((action === 'puedo' || action === 'nopuedo') && notifData.type === 'reminder') {
    const assignments = notifData.assignments ?? []
    event.waitUntil(
      Promise.all(
        assignments.map(a =>
          db.collection('responses').add({
            scheduleId:  a.scheduleId,
            roleKey:     a.roleKey,
            roleLabel:   ROLE_LABELS[a.roleKey] ?? a.roleKey,
            personId:    a.personId,
            personName:  a.personName,
            response:    action,
            scheduleDate: a.scheduleDate,
            dayType:     a.dayType,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
            seen:        false,
          })
        )
      ).then(() =>
        self.registration.showNotification(
          action === 'puedo' ? '✅ ¡Confirmado!' : '❌ Respuesta enviada',
          {
            body: action === 'puedo'
              ? 'Tu asistencia ha sido confirmada.'
              : 'El coordinador ha sido notificado.',
            icon: `${APP_URL}/hero-avatar.png`,
            badge: `${APP_URL}/logo.png`,
          }
        )
      )
    )
    return
  }

  // Clic normal → abrir o enfocar la app
  const url = notifData.url ?? APP_URL
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    })
  )
})
