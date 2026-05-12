const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
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

/** Envía un push normal a un token FCM */
async function sendPush(token, title, body) {
  if (!token) return
  try {
    await messaging.send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          title, body,
          icon: `${APP_URL}/logo.png`,
          badge: `${APP_URL}/logo.png`,
          vibrate: [200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: { link: APP_URL },
      },
    })
  } catch (e) {
    console.warn('Push error:', e.message)
  }
}

/**
 * Push de recordatorio con botones Puedo / No puedo.
 * Se envía como mensaje data-only para que el SW lo muestre con las acciones.
 */
async function sendReminderPush(token, rolesText, assignments) {
  if (!token) return
  try {
    const first = assignments[0] ?? {}
    const dateStr = first.scheduleDate
      ? new Date(first.scheduleDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'Europe/Madrid' })
      : 'mañana'
    await messaging.send({
      token,
      data: {
        type: 'reminder',
        title: `📅 Turno mañana — ${dateStr}`,
        body: `Te toca: ${rolesText}. ¿Puedes venir?`,
        assignments: JSON.stringify(assignments),
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
        fcmOptions: { link: APP_URL },
      },
    })
  } catch (e) {
    console.warn('Reminder push error:', e.message)
  }
}

/** Tokens FCM de ayudantes (coordinadores no reciben estos pushes) */
async function getCoordinatorTokens() {
  const snap = await db.collection('users').where('role', '==', 'ayudante').get()
  return snap.docs.map(d => d.data().fcmToken).filter(Boolean)
}

/** Token FCM de un usuario por nombre */
async function getTokenByName(name) {
  const snap = await db.collection('users').where('name', '==', name).limit(1).get()
  return snap.docs[0]?.data()?.fcmToken ?? null
}

/**
 * FUNCIÓN 1: Cuando alguien marca "No puedo" → push a coordinadores y ayudantes
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
 * FUNCIÓN 2: Cuando se crea una solicitud de sustitución → push al candidato
 */
exports.onSolicitudCreada = onDocumentCreated(
  { document: 'solicitudes/{solicitudId}', region: 'europe-west1' },
  async (event) => {
    const data = event.data.data()
    if (data.status !== 'pending') return

    const token = await getTokenByName(data.requestedPersonName)
    if (!token) return

    const dateStr = new Date(data.scheduleDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' })

    await sendPush(token,
      `🤝 Solicitud de sustitución — ${data.requestedByName}`,
      `¿Puedes cubrir ${data.roleLabel} el ${data.dayType} (${dateStr})? Abre la app para responder.`
    )
  }
)

/**
 * FUNCIÓN 3: Cuando el candidato responde a la solicitud → push al ayudante
 */
exports.onSolicitudRespondida = onDocumentUpdated(
  { document: 'solicitudes/{solicitudId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data.before.data()
    const after = event.data.after.data()

    // Solo reaccionar al cambio de pending → accepted/rejected
    if (before.status !== 'pending') return
    if (after.status !== 'accepted' && after.status !== 'rejected') return

    const tokens = await getCoordinatorTokens()
    if (!tokens.length) return

    const dateStr = new Date(after.scheduleDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' })

    if (after.status === 'accepted') {
      await Promise.all(tokens.map(token =>
        sendPush(token,
          `✅ Sustituto confirmado — ${after.requestedPersonName}`,
          `${after.requestedPersonName} cubre ${after.roleLabel} el ${after.dayType} (${dateStr}). Horario actualizado.`
        )
      ))
    } else {
      await Promise.all(tokens.map(token =>
        sendPush(token,
          `❌ ${after.requestedPersonName} no puede`,
          `No puede cubrir ${after.roleLabel} el ${after.dayType} (${dateStr}). Busca otro sustituto.`
        )
      ))
    }
  }
)

/**
 * FUNCIÓN 4: Cada día a las 10:00 → recordatorio a usuarios con turno mañana
 */
exports.dailyReminders = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'Europe/Madrid', region: 'europe-west1' },
  async () => {
    // Las fechas se guardan como medianoche hora Madrid (UTC+1/+2).
    // Calculamos el rango UTC equivalente a "mañana en Madrid" para no disparar con 2 días de antelación.
    const getMadridStr = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(d)

    function madridMidnightUTC(dateStr) {
      for (const off of ['+02:00', '+01:00']) {
        const d = new Date(`${dateStr}T00:00:00${off}`)
        if (getMadridStr(d) === dateStr) return d
      }
      return new Date(`${dateStr}T00:00:00+01:00`)
    }

    const now = new Date()
    const [y, m, d] = getMadridStr(now).split('-').map(Number)
    const tomorrowMadrid  = getMadridStr(new Date(Date.UTC(y, m - 1, d + 1, 12)))
    const dayAfterMadrid  = getMadridStr(new Date(Date.UTC(y, m - 1, d + 2, 12)))

    const tomorrowStart = madridMidnightUTC(tomorrowMadrid)
    const tomorrowEnd   = madridMidnightUTC(dayAfterMadrid)

    const schedSnap = await db.collection('schedules')
      .where('date', '>=', tomorrowStart.toISOString())
      .where('date', '<', tomorrowEnd.toISOString())
      .get()

    if (schedSnap.empty) return

    const peopleSnap = await db.collection('people').get()
    const peopleMap = {}
    peopleSnap.docs.forEach(d => { peopleMap[d.id] = d.data() })

    const usersSnap = await db.collection('users').where('fcmToken', '!=', null).get()
    const usersByName = {}
    usersSnap.docs.forEach(d => { usersByName[d.data().name] = d.data() })

    // Aggregate roles + assignment data per token (one push per user)
    const tokenData = new Map() // token → { roles: string[], assignments: object[] }
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
        const existing = tokenData.get(userObj.fcmToken) ?? { roles: [], assignments: [] }
        existing.roles.push(roleLabel)
        existing.assignments.push({
          scheduleId: schedDoc.id,
          roleKey,
          personId,
          personName: person.name,
          scheduleDate: sched.date,
          dayType: sched.dayType ?? '',
        })
        tokenData.set(userObj.fcmToken, existing)
      })
    })

    const sends = []
    tokenData.forEach(({ roles, assignments }, token) => {
      const rolesText = roles.join(' y ')
      sends.push(sendReminderPush(token, rolesText, assignments))
    })

    await Promise.all(sends)
    console.log(`Recordatorios enviados: ${sends.length}`)
  }
)
