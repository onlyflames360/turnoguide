export const ROLES = [
  { key: 'audio',      label: 'Audio',      section: 'audioVideo' },
  { key: 'video',      label: 'Video',      section: 'audioVideo' },
  { key: 'micro1',     label: 'Micro 1',    section: 'audioVideo' },
  { key: 'micro2',     label: 'Micro 2',    section: 'audioVideo' },
  { key: 'plataforma', label: 'Plataforma', section: 'audioVideo' },
  { key: 'auditorio',  label: 'Auditorio',  section: 'acomodadores' },
  { key: 'entrada',    label: 'Entrada',    section: 'acomodadores' },
  { key: 'parking',    label: 'Vehículos',  section: 'acomodadores' },
]

export const ROLE_KEYS = ROLES.map(r => r.key)

export const SECTIONS = {
  audioVideo:    { label: 'Audio y Video',  cols: ['audio','video','micro1','micro2','plataforma'] },
  acomodadores:  { label: 'Acomodadores',   cols: ['auditorio','entrada'] },
  parking:       { label: 'Parking',        cols: ['parking'] },
}

const SUPPORT_ROLES = new Set(['auditorio', 'entrada', 'parking'])
const MAIN_ROLES    = new Set(['audio', 'video', 'micro1', 'micro2', 'plataforma'])

/* ─── Ajustes del reparto ───────────────────────────────────────────────
   Todo lo que decide "quién va" está aquí arriba para poder afinarlo. */

/** Meses de historial que se tienen en cuenta para equilibrar. */
export const BALANCE_WINDOW_MONTHS = 3

/** Veces que alguien puede repetir el MISMO rol dentro de la ventana. */
export const MAX_PER_ROLE_IN_WINDOW = 2

/** Día del mes a partir del cual la app abre ya en el mes siguiente. */
export const NEXT_MONTH_CUTOFF_DAY = 20

/** Pesos de la puntuación. Gana quien saca menos puntos. */
const W_ROLE_REPEAT  = 3   // por cada vez que ya hizo ESTE rol en la ventana
const W_TOTAL_LOAD   = 1   // por cada turno total acumulado en la ventana
const W_BACK_TO_BACK = 10  // si sirvió en la reunión inmediatamente anterior
const W_SUPPORT_ONLY = -2  // si solo sabe roles de apoyo y el rol es de apoyo

/**
 * Mes con el que debe abrir la app.
 * A partir del día 20 ya se está preparando el mes siguiente, así que salta.
 */
export function getDefaultPeriod(today = new Date(), cutoffDay = NEXT_MONTH_CUTOFF_DAY) {
  const d = today.getDate() >= cutoffDay
    ? new Date(today.getFullYear(), today.getMonth() + 1, 1)
    : today
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

/** Devuelve todos los domingos y miércoles de un mes dado */
export function getMonthDates(year, month) {
  const dates = []
  const d = new Date(year, month - 1, 1)
  while (d.getMonth() === month - 1) {
    const day = d.getDay()
    if (day === 0) dates.push({ date: new Date(d), type: 'Domingo' })
    else if (day === 3) dates.push({ date: new Date(d), type: 'Miércoles' })
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function isSupportOnly(person) {
  return !person.skills?.some(s => MAIN_ROLES.has(s))
}

/** Barajado Fisher-Yates. Devuelve una copia. */
function shuffled(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Conteos por persona dentro de la ventana de equilibrio.
 * Solo cuenta turnos reales: las asambleas no computan.
 */
function buildCounts(people, existingSchedules, windowStart) {
  const counts = {}
  const totals = {}
  people.forEach(p => {
    counts[p.id] = {}
    ROLE_KEYS.forEach(r => (counts[p.id][r] = 0))
    totals[p.id] = 0
  })
  existingSchedules.forEach(s => {
    if (s.isAssamblea) return
    if (windowStart && new Date(s.date) < windowStart) return
    ROLE_KEYS.forEach(r => {
      const pid = s.assignments?.[r]
      if (pid && counts[pid]) { counts[pid][r]++; totals[pid]++ }
    })
  })
  return { counts, totals }
}

/** Personas que sirvieron en la última reunión anterior a `beforeDate`. */
function peopleInPreviousMeeting(existingSchedules, beforeDate) {
  const previous = existingSchedules
    .filter(s => !s.isAssamblea && new Date(s.date) < beforeDate)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
  if (!previous) return new Set()
  return new Set(ROLE_KEYS.map(r => previous.assignments?.[r]).filter(Boolean))
}

/**
 * Genera un array de objetos de horario para las fechas dadas.
 *
 * Reparte con tres criterios combinados en una sola puntuación: cuántas veces
 * has hecho ya ese rol, cuánta carga total llevas, y si serviste en la reunión
 * justo anterior. Los roles se asignan del más escaso al más abundante para que
 * los que tienen pocos candidatos (Vehículos) no se queden con las sobras.
 *
 * @param {Array<{date: Date, type: string}>} scheduleDates
 * @param {Array} people - personas con { id, name, skills[], active }
 * @param {Array} existingSchedules - horarios ya guardados, para equilibrar
 */
export function generateSchedule(scheduleDates, people, existingSchedules = []) {
  const activePeople = people.filter(p => p.active !== false)
  if (!scheduleDates.length) return []

  const firstDate = scheduleDates[0].date
  const windowStart = new Date(
    firstDate.getFullYear(),
    firstDate.getMonth() - BALANCE_WINDOW_MONTHS,
    1
  )

  const { counts, totals } = buildCounts(activePeople, existingSchedules, windowStart)

  // Roles del más escaso al más abundante (heurística "most constrained first").
  // En empate se mantiene el orden natural de ROLE_KEYS.
  const candidatesPerRole = {}
  ROLE_KEYS.forEach(role => {
    candidatesPerRole[role] = activePeople.filter(p => p.skills?.includes(role)).length
  })
  const roleOrder = [...ROLE_KEYS].sort(
    (a, b) => candidatesPerRole[a] - candidatesPerRole[b]
  )

  let previousMeeting = peopleInPreviousMeeting(existingSchedules, firstDate)

  return scheduleDates.map(({ date, type }) => {
    const assignments = {}
    const assignedToday = new Set()

    roleOrder.forEach(role => {
      const isSupport = SUPPORT_ROLES.has(role)
      const base = activePeople.filter(
        p => p.skills?.includes(role) && !assignedToday.has(p.id)
      )

      // Relajamos restricciones por orden de importancia hasta encontrar a alguien.
      // Preferimos cubrir el puesto antes que respetar el descanso o el tope.
      let pool = base.filter(
        p => counts[p.id][role] < MAX_PER_ROLE_IN_WINDOW && !previousMeeting.has(p.id)
      )
      if (!pool.length) pool = base.filter(p => counts[p.id][role] < MAX_PER_ROLE_IN_WINDOW)
      if (!pool.length) pool = base.filter(p => !previousMeeting.has(p.id))
      if (!pool.length) pool = base
      if (!pool.length) { assignments[role] = null; return }

      const score = p =>
        W_ROLE_REPEAT * counts[p.id][role] +
        W_TOTAL_LOAD * totals[p.id] +
        (previousMeeting.has(p.id) ? W_BACK_TO_BACK : 0) +
        (isSupport && isSupportOnly(p) ? W_SUPPORT_ONLY : 0)

      // Barajar antes de ordenar: sort es estable, así los empates salen al azar.
      const chosen = shuffled(pool).sort((a, b) => score(a) - score(b))[0]

      assignments[role] = chosen.id
      assignedToday.add(chosen.id)
      counts[chosen.id][role]++
      totals[chosen.id]++
    })

    previousMeeting = assignedToday

    return {
      date: date.toISOString(),
      dayType: type,
      isAssamblea: false,
      assignments,
    }
  })
}

/**
 * Resumen de carga por persona, para revisar el reparto antes de guardarlo.
 * @returns {Array<{id, name, total, distinctRoles, roles: Object}>} de más a menos turnos
 */
export function summarizeWorkload(schedules, people) {
  const byPerson = {}
  people
    .filter(p => p.active !== false)
    .forEach(p => { byPerson[p.id] = { id: p.id, name: p.name, total: 0, roles: {} } })

  schedules.forEach(s => {
    if (s.isAssamblea) return
    ROLE_KEYS.forEach(r => {
      const pid = s.assignments?.[r]
      if (!pid || !byPerson[pid]) return
      byPerson[pid].total++
      byPerson[pid].roles[r] = (byPerson[pid].roles[r] ?? 0) + 1
    })
  })

  return Object.values(byPerson)
    .map(p => ({ ...p, distinctRoles: Object.keys(p.roles).length }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/**
 * Roles con muy pocas personas capacitadas. Ningún algoritmo puede repartir
 * lo que no existe, así que conviene avisar al coordinador.
 */
export function findBottleneckRoles(people, threshold = 3) {
  const active = people.filter(p => p.active !== false)
  return ROLES
    .map(role => ({
      key: role.key,
      label: role.label,
      count: active.filter(p => p.skills?.includes(role.key)).length,
    }))
    .filter(r => r.count <= threshold)
    .sort((a, b) => a.count - b.count)
}

/**
 * Sugiere candidatos para reemplazar a alguien en un rol específico en una fecha.
 * @param {string} role - clave del rol
 * @param {string|null} currentPersonId - persona actual a reemplazar
 * @param {object} dayAssignments - todas las asignaciones del día
 * @param {Array} people
 * @param {Array} schedules
 */
export function suggestReplacements(role, currentPersonId, dayAssignments, people, schedules) {
  const assignedToday = new Set(
    Object.values(dayAssignments).filter(v => v && v !== currentPersonId)
  )

  const counts = {}
  people.forEach(p => (counts[p.id] = 0))
  schedules.forEach(s => {
    if (!s.isAssamblea) {
      const pid = s.assignments?.[role]
      if (pid && counts[pid] !== undefined) counts[pid]++
    }
  })

  return people
    .filter(p =>
      p.active !== false &&
      p.skills?.includes(role) &&
      !assignedToday.has(p.id) &&
      p.id !== currentPersonId
    )
    .sort((a, b) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0))
}

/** Formatea una fecha ISO a "Domingo 01/03" */
export function formatDate(isoString, type) {
  const d = new Date(isoString)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${type} ${day}/${month}`
}

export function formatDateShort(isoString) {
  const d = new Date(isoString)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}
