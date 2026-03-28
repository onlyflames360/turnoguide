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
      icon: '/logo.png',
      badge: '/logo.png',
      ...options,
    })
  } catch (e) {
    console.warn('Notification error:', e)
  }
}

/** Verifica si el usuario tiene turno mañana y muestra recordatorio */
export function checkTomorrowNotification(schedules, myPersonId, people) {
  if (!myPersonId) return
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toDateString()

  const tomorrowSchedules = schedules.filter(s => {
    const d = new Date(s.date)
    return d.toDateString() === tomorrowStr &&
      !s.isAssamblea &&
      Object.values(s.assignments || {}).includes(myPersonId)
  })

  if (!tomorrowSchedules.length) return

  // Evitar mostrar el mismo recordatorio dos veces en el mismo día
  const lastShown = localStorage.getItem('tg_reminder_shown')
  const todayStr = new Date().toDateString()
  if (lastShown === todayStr) return
  localStorage.setItem('tg_reminder_shown', todayStr)

  tomorrowSchedules.forEach(sched => {
    const roles = Object.entries(sched.assignments || {})
      .filter(([, pid]) => pid === myPersonId)
      .map(([rk]) => {
        const labels = { audio: 'Audio', video: 'Video', micro1: 'Micro 1', micro2: 'Micro 2', plataforma: 'Plataforma', auditorio: 'Auditorio', entrada: 'Entrada', parking: 'Vehículos' }
        return labels[rk] ?? rk
      })
    showNotification(
      '📅 TurnoGuide — Recordatorio',
      `Mañana tienes turno: ${roles.join(', ')}. ¡Recuerda llegar 30 min antes!`
    )
  })
}
