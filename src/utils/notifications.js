/** Pide permiso de notificaciones del navegador */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/** Muestra una notificación del navegador */
export function showNotification(title, body, options = {}) {
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      icon: '/hero-avatar.png',
      badge: '/logo.png',
      ...options,
    })
  } catch (e) {
    console.warn('Notification error:', e)
  }
}
