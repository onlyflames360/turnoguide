const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

initializeApp()
const db = getFirestore()
const messaging = getMessaging()

const ROLE_LABELS = {
  audio: 'Audio', video: 'Video', micro1: 'Micro 1', micro2: 'Micro 2',
  plataforma: 'Plataforma', auditorio: 'Auditorio', entrada: 'Entrada', parking: 'Vehículos'
}

const APP_URL = 'https://la-barbera.web.app'

/** Envía un push a un token FCM */
async function sendPush(token, title, body) {
  if (!token) return
  try {
    await messaging.send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon: `${APP_URL}/logo.png`,
          badge: `${APP_URL}/logo.png`,
          vibrate: [200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: { link: APP_URL },
      },
    })
    console.log('Push enviado OK a token:', token.substring(0, 20) + '...')
  } catch (e) {
    console.warn('Push error:', e.message, 'token:', token.substring(0, 20))
  }
}

/** Obtiene todos los tokens FCM de coordinadores y ayudantes */
async function getCoordinatorTokens() {
  const snap = await db.collection('users').where('role', 'in', ['coordinador', 'ayudante']).get()
  return snap.docs.map(d => d.data().fcmToken).filter(Boolean)
}

/**
 * FUNCIÓN 1: Cuando alguien marca "No puedo" → push inmediato al coordinador
 */
exports.onNoPuedo = onDocumentCreated(
  { document: 'responses/{responseId}', region: 'europe-west1' },
  async (event) => {
    const data = event.data.data()
    if (data.response !== 'nopuedo') return

    const tokens = await getCoordinatorTokens()
    if (!tokens.length) return

    const dateStr = new Date(data.scheduleDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' })
    const roleLabel = ROLE_LABELS[data.roleKey] ?? data.roleKey

    await Promise.all(tokens.map(token =>
      sendPush(token,
        `❌ No disponible — ${data.personName}`,
        `No puede el ${data.dayType} (${dateStr}) en ${roleLabel}. Busca sustituto.`
      )
    ))
  }
)

/**
 * FUNCIÓN 2: Cada día a las 10:00 → recordatorio a usuarios con turno mañana
 */
exports.dailyReminders = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'Europe/Madrid', region: 'europe-west1' },
  async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const dayAfter = new Date(tomorrow)
    dayAfter.setDate(dayAfter.getDate() + 1)

    // Buscar horarios de mañana
    const schedSnap = await db.collection('schedules')
      .where('date', '>=', tomorrow.toISOString())
      .where('date', '<', dayAfter.toISOString())
      .get()

    if (schedSnap.empty) return

    // Cargar todas las personas
    const peopleSnap = await db.collection('people').get()
    const peopleMap = {}
    peopleSnap.docs.forEach(d => { peopleMap[d.id] = d.data() })

    // Cargar todos los usuarios con token
    const usersSnap = await db.collection('users').where('fcmToken', '!=', null).get()
    const usersByName = {}
    usersSnap.docs.forEach(d => { usersByName[d.data().name] = d.data() })

    const sends = []

    schedSnap.docs.forEach(schedDoc => {
      const sched = schedDoc.data()
      if (sched.isAssamblea) return

      Object.entries(sched.assignments || {}).forEach(([roleKey, personId]) => {
        if (!personId) return
        const person = peopleMap[personId]
        if (!person) return

        const userObj = usersByName[person.name]
        if (!userObj?.fcmToken) return

        const roleLabel = ROLE_LABELS[roleKey] ?? roleKey
        sends.push(
          sendPush(userObj.fcmToken,
            '📅 TurnoGuide — Turno mañana',
            `Mañana tienes ${roleLabel}. ¡Recuerda llegar 30 min antes!`
          )
        )
      })
    })

    await Promise.all(sends)
    console.log(`Recordatorios enviados: ${sends.length}`)
  }
)
