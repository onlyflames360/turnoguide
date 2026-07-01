const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onRequest } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

initializeApp()
const db = getFirestore()
const messaging = getMessaging()

const ROLE_LABELS = {
  audio: 'Audio', video: 'Video', micro1: 'Micro 1', micro2: 'Micro 2',
  plataforma: 'Plataforma', auditorio: 'Auditorio', entrada: 'Entrada', parking: 'Vehículos'
}
const ROLE_KEYS = Object.keys(ROLE_LABELS)
const AV_ROLES  = new Set(['audio', 'video', 'micro1', 'micro2', 'plataforma'])
const AC_ROLES  = new Set(['auditorio', 'entrada', 'parking'])

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
async function sendReminderPush(token, rolesText, assignments, opts = {}) {
  if (!token) return
  const { titlePrefix = '📅 Turno mañana', bodyPrefix = 'Te toca' } = opts
  try {
    const first = assignments[0] ?? {}
    const dateStr = first.scheduleDate
      ? new Date(first.scheduleDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'Europe/Madrid' })
      : 'mañana'
    await messaging.send({
      token,
      data: {
        type: 'reminder',
        title: `${titlePrefix} — ${dateStr}`,
        body: `${bodyPrefix}: ${rolesText}. ¿Puedes venir?`,
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

/** Tokens de todos los ayudantes (ambas secciones) */
async function getCoordinatorTokens() {
  const [av, ac] = await Promise.all([
    db.collection('users').where('role', '==', 'ayudante_av').get(),
    db.collection('users').where('role', '==', 'ayudante_ac').get(),
  ])
  return [...av.docs, ...ac.docs].map(d => d.data().fcmToken).filter(Boolean)
}

/** Tokens del ayudante responsable de un rol concreto */
async function getSectionTokens(roleKey) {
  const role = AV_ROLES.has(roleKey) ? 'ayudante_av' : 'ayudante_ac'
  const snap = await db.collection('users').where('role', '==', role).get()
  return snap.docs.map(d => d.data().fcmToken).filter(Boolean)
}

/** Busca el siguiente candidato y crea una solicitud automática */
async function autoAssignSubstitute(responseId, roleKey, scheduleId, scheduleDate, dayType, personName) {
  const settingsSnap = await db.collection('settings').doc('global').get()
  if (!settingsSnap.data()?.autoSubstitute) return

  const [peopleSnap, triedSnap, responseSnap] = await Promise.all([
    db.collection('people').get(),
    db.collection('solicitudes').where('responseId', '==', responseId).get(),
    db.collection('responses').doc(responseId).get(),
  ])

  const triedIds = new Set(triedSnap.docs.map(d => d.data().requestedPersonId))
  const noPuedoPersonId = responseSnap.data()?.personId
  if (noPuedoPersonId) triedIds.add(noPuedoPersonId)

  const eligible = peopleSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.active !== false && p.skills?.includes(roleKey) && !triedIds.has(p.id))

  const roleLabel = ROLE_LABELS[roleKey] ?? roleKey
  const dateStr = new Date(scheduleDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' })

  if (!eligible.length) {
    const tokens = await getSectionTokens(roleKey)
    await Promise.all(tokens.map(t => sendPush(t,
      `⚠️ Sin candidatos — ${personName}`,
      `No hay más candidatos para ${roleLabel} el ${dayType} (${dateStr}). Gestión manual necesaria.`
    )))
    return
  }

  // Elegir el candidato con menos asignaciones este mes
  const schedSnap = await db.collection('schedules').get()
  const counts = {}
  eligible.forEach(p => { counts[p.id] = 0 })
  schedSnap.docs.forEach(s => {
    const d = s.data()
    if (!d.isAssamblea) {
      ROLE_KEYS.forEach(r => {
        const pid = d.assignments?.[r]
        if (pid && counts[pid] !== undefined) counts[pid]++
      })
    }
  })
  const candidate = [...eligible].sort((a, b) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0))[0]

  await db.collection('solicitudes').add({
    scheduleId, scheduleDate, dayType, roleKey, roleLabel,
    responseId,
    requestedPersonId: candidate.id,
    requestedPersonName: candidate.name,
    requestedByName: '🤖 Auto',
    status: 'pending',
    isAuto: true,
    createdAt: FieldValue.serverTimestamp(),
    answeredAt: null,
  })
}

/** Token FCM de un usuario por nombre */
async function getTokenByName(name) {
  const snap = await db.collection('users').where('name', '==', name).limit(1).get()
  return snap.docs[0]?.data()?.fcmToken ?? null
}

/**
 * FUNCIÓN 1a: Cuando alguien marca "Puedo" → push al ayudante de su sección
 */
exports.onPuedo = onDocumentCreated(
  { document: 'responses/{responseId}', region: 'europe-west1' },
  async (event) => {
    const data = event.data.data()
    if (data.response !== 'puedo') return

    const tokens = await getSectionTokens(data.roleKey)
    if (!tokens.length) return

    const dateStr = new Date(data.scheduleDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' })
    const roleLabel = ROLE_LABELS[data.roleKey] ?? data.roleKey

    await Promise.all(tokens.map(token =>
      sendPush(token,
        `✅ Confirmado — ${data.personName}`,
        `Puede el ${data.dayType} (${dateStr}) en ${roleLabel}.`
      )
    ))
  }
)

/**
 * FUNCIÓN 1b: Cuando alguien marca "No puedo" → push al ayudante de sección + auto-sustituto
 */
exports.onNoPuedo = onDocumentCreated(
  { document: 'responses/{responseId}', region: 'europe-west1' },
  async (event) => {
    const data = event.data.data()
    if (data.response !== 'nopuedo') return

    const responseId = event.params.responseId
    const tokens = await getSectionTokens(data.roleKey)

    if (tokens.length) {
      const dateStr = new Date(data.scheduleDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' })
      const roleLabel = ROLE_LABELS[data.roleKey] ?? data.roleKey
      await Promise.all(tokens.map(token =>
        sendPush(token,
          `❌ No disponible — ${data.personName}`,
          `No puede el ${data.dayType} (${dateStr}) en ${roleLabel}. Buscando sustituto...`
        )
      ))
    }

    await autoAssignSubstitute(responseId, data.roleKey, data.scheduleId, data.scheduleDate, data.dayType, data.personName)
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

    const tokens = await getSectionTokens(after.roleKey)
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
          `No puede cubrir ${after.roleLabel} el ${after.dayType} (${dateStr}). Buscando otro candidato...`
        )
      ))
      await autoAssignSubstitute(after.responseId, after.roleKey, after.scheduleId, after.scheduleDate, after.dayType, after.requestedPersonName)
    }
  }
)

/**
 * FUNCIÓN 4: Cada día a las 10:00 → recordatorio a usuarios con turno mañana
 */
exports.dailyReminders = onSchedule(
  { schedule: '0 10 * * 2,6', timeZone: 'Europe/Madrid', region: 'europe-west1' },
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
      sends.push(sendReminderPush(token, roles[0], assignments))
    })

    await Promise.all(sends)
    console.log(`Recordatorios enviados: ${sends.length}`)
  }
)

/**
 * FUNCIÓN 4b: El mismo día del turno por la mañana → recordatorio simple a los
 * usuarios con turno HOY. Se EXCLUYE a quien ya haya marcado "No puedo" para ese
 * turno (se comprueba la última respuesta por reunión + rol).
 * Turnos: miércoles (3) y domingo (0).
 */
exports.sameDayReminders = onSchedule(
  { schedule: '0 10 * * 0,3', timeZone: 'Europe/Madrid', region: 'europe-west1' },
  async () => {
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
    const todayMadrid    = getMadridStr(new Date(Date.UTC(y, m - 1, d, 12)))
    const tomorrowMadrid = getMadridStr(new Date(Date.UTC(y, m - 1, d + 1, 12)))

    const todayStart = madridMidnightUTC(todayMadrid)
    const todayEnd   = madridMidnightUTC(tomorrowMadrid)

    const schedSnap = await db.collection('schedules')
      .where('date', '>=', todayStart.toISOString())
      .where('date', '<', todayEnd.toISOString())
      .get()

    if (schedSnap.empty) return

    const scheduleIds = schedSnap.docs.map(s => s.id)

    const [peopleSnap, usersSnap, respSnap] = await Promise.all([
      db.collection('people').get(),
      db.collection('users').where('fcmToken', '!=', null).get(),
      db.collection('responses').where('scheduleId', 'in', scheduleIds).get(),
    ])

    // Última respuesta por (scheduleId, roleKey); si es "No puedo" → excluir
    const latestResp = new Map()
    respSnap.docs.forEach(doc => {
      const r = doc.data()
      const key = `${r.scheduleId}_${r.roleKey}`
      const ts = r.createdAt?.toMillis?.() ?? 0
      const prev = latestResp.get(key)
      if (!prev || ts >= prev.ts) latestResp.set(key, { response: r.response, ts })
    })
    const excluded = new Set(
      [...latestResp.entries()].filter(([, v]) => v.response === 'nopuedo').map(([k]) => k)
    )

    const peopleMap = {}
    peopleSnap.docs.forEach(dd => { peopleMap[dd.id] = dd.data() })
    const usersByName = {}
    usersSnap.docs.forEach(dd => { usersByName[dd.data().name] = dd.data() })

    // Un push por usuario con sus roles de hoy (sin los que dijo "No puedo").
    // Se agregan los assignments para que los botones Puedo/No puedo funcionen.
    const tokenData = new Map() // token → { roles: string[], assignments: object[] }
    schedSnap.docs.forEach(schedDoc => {
      const sched = schedDoc.data()
      if (sched.isAssamblea) return
      Object.entries(sched.assignments || {}).forEach(([roleKey, personId]) => {
        if (!personId) return
        if (excluded.has(`${schedDoc.id}_${roleKey}`)) return
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
      sends.push(sendReminderPush(token, roles.join(', '), assignments, {
        titlePrefix: '⏰ Turno hoy',
        bodyPrefix: 'Hoy te toca',
      }))
    })

    await Promise.all(sends)
    console.log(`Recordatorios mismo día enviados: ${sends.length}`)
  }
)

/**
 * FUNCIÓN 5: Alerta de emergencia — push a TODOS los usuarios
 * Se dispara cuando se crea un doc en la colección 'emergencias'
 */
exports.onEmergencyCreated = onDocumentCreated(
  { document: 'emergencias/{id}', region: 'europe-west1' },
  async (event) => {
    const data = event.data?.data()
    if (!data) return

    const { roleLabel = 'Emergencia', senderName = 'Desconocido' } = data
    const title = `🚨 EMERGENCIA — ${roleLabel}`
    const body = `${senderName} ha activado la alerta en ${roleLabel}. Acudir inmediatamente.`

    // Tokens de TODOS los usuarios (ayudantes + coordinadores)
    const usersSnap = await db.collection('users').get()
    const tokens = usersSnap.docs.map(d => d.data().fcmToken).filter(Boolean)

    await Promise.all(tokens.map(token =>
      messaging.send({
        token,
        data: { type: 'emergency', title, body, roleLabel, senderName },
        webpush: {
          headers: { Urgency: 'very-high', TTL: '3600' },
          fcmOptions: { link: APP_URL },
        },
      }).catch(e => console.warn('Emergency push error:', e.message))
    ))
  }
)

/**
 * MIGRACIÓN: Renombra users con role='ayudante' → role='ayudante_av'
 * Llamar una sola vez: GET /migrateAyudante
 */
exports.migrateAyudante = onRequest(
  { region: 'europe-west1' },
  async (req, res) => {
    const snap = await db.collection('users').where('role', '==', 'ayudante').get()
    const batch = db.batch()
    snap.docs.forEach(d => batch.update(d.ref, { role: 'ayudante_av' }))
    await batch.commit()
    res.json({ migrated: snap.size })
  }
)
