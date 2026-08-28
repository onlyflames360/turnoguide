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

/** Turnos que deberia tener cada persona activa en el mes, como suelo. */
export const MIN_TURNS_PER_MONTH = 2

/** Día del mes a partir del cual la app abre ya en el mes siguiente. */
export const NEXT_MONTH_CUTOFF_DAY = 20

/**
 * Puestos que cuentan como el mismo trabajo para la regla de no repetir.
 * Micro 1 y Micro 2 son la misma tarea en dos sitios: quien llevó un micro
 * el domingo no debe llevar el otro en su siguiente turno.
 */
const ROLE_FAMILY = { micro1: 'micro', micro2: 'micro' }

export function familyOf(role) {
  return ROLE_FAMILY[role] ?? role
}

/** Pesos de la puntuación. Gana quien saca menos puntos. */
const W_MONTH_LOAD     = 6    // por turno ya asignado en el mes que se genera
const W_WINDOW_LOAD    = 1    // por turno en los meses anteriores de la ventana
const W_ROLE_REPEAT    = 3    // por cada vez que ya hizo ESTE rol en la ventana
const W_VERSATILITY    = 1    // por habilidad: a igual carga, antes el especialista
const W_BACK_TO_BACK   = 10   // si sirvió en la reunión inmediatamente anterior
const W_SAME_ROLE_AGAIN = 8   // si su turno anterior fue este mismo puesto
const W_SUPPORT_ONLY   = -2   // si solo sabe roles de apoyo y el rol es de apoyo
const W_BELOW_MINIMUM  = -40  // por debajo del suelo mensual: entra el primero

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
 *
 * La carga se separa en dos: la del mes que se está generando y la de los
 * meses anteriores. El mes en curso pesa mucho más, que es lo que iguala el
 * reparto; el historial pesa poco y solo afina a largo plazo.
 */
function buildCounts(people, existingSchedules, windowStart, month, year) {
  const counts = {}      // por persona y rol, en toda la ventana
  const windowTotals = {} // turnos en los meses ANTERIORES al que se genera
  const monthTotals = {}  // turnos ya guardados del mes que se genera
  people.forEach(p => {
    counts[p.id] = {}
    ROLE_KEYS.forEach(r => (counts[p.id][r] = 0))
    windowTotals[p.id] = 0
    monthTotals[p.id] = 0
  })
  existingSchedules.forEach(s => {
    if (s.isAssamblea) return
    const d = new Date(s.date)
    if (windowStart && d < windowStart) return
    const isTargetMonth = d.getMonth() + 1 === month && d.getFullYear() === year
    ROLE_KEYS.forEach(r => {
      const pid = s.assignments?.[r]
      if (!pid || !counts[pid]) return
      counts[pid][r]++
      if (isTargetMonth) monthTotals[pid]++
      else windowTotals[pid]++
    })
  })
  return { counts, windowTotals, monthTotals }
}

/**
 * Último puesto que hizo cada persona antes de `beforeDate`, por familias.
 * Es lo que impide que a alguien le toque micro dos turnos seguidos.
 */
function lastRoleFamilyByPerson(existingSchedules, beforeDate) {
  const map = {}
  existingSchedules
    .filter(s => !s.isAssamblea && new Date(s.date) < beforeDate)
    .sort((a, b) => new Date(a.date) - new Date(b.date)) // ascendente: gana el último
    .forEach(s => {
      ROLE_KEYS.forEach(r => {
        const pid = s.assignments?.[r]
        if (pid) map[pid] = familyOf(r)
      })
    })
  return map
}

/**
 * Si alguien solo sabe hacer un puesto, la regla de no repetir no puede
 * aplicarse: le dejaría sin turnos. Solo se exige a quien tiene alternativa.
 */
function hasAlternativeRole(person) {
  const families = new Set((person.skills ?? []).map(familyOf))
  return families.size > 1
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
 * Reparte con una sola puntuación que combina: la carga que ya llevas este mes
 * (lo que más pesa, y lo que iguala el reparto), la de los meses anteriores,
 * cuántas veces has hecho ya ese puesto, cuántas habilidades tienes —a igual
 * carga entra antes el especialista, porque cada plaza suya es una oportunidad
 * más rara— y si vienes de servir. Quien va por debajo del suelo mensual entra
 * el primero. Los roles se asignan del más escaso al más abundante para que los
 * que tienen pocos candidatos (Vehículos) no se queden con las sobras.
 *
 * Dos reglas se aplican como filtro y no como puntuación: no repetir en la
 * reunión inmediatamente siguiente, y no repetir el mismo puesto en tu próximo
 * turno (Micro 1 y Micro 2 cuentan como el mismo puesto). Ambas ceden si no
 * queda nadie más, porque cubrir la plaza manda.
 *
 * @param {Array<{date: Date, type: string}>} scheduleDates
 * @param {Array} people - personas con { id, name, skills[], active }
 * @param {Array} existingSchedules - horarios ya guardados, para equilibrar
 */
export function generateSchedule(scheduleDates, people, existingSchedules = []) {
  const activePeople = people.filter(p => p.active !== false)
  if (!scheduleDates.length) return []

  const firstDate = scheduleDates[0].date
  const targetMonth = firstDate.getMonth() + 1
  const targetYear = firstDate.getFullYear()
  const windowStart = new Date(
    targetYear,
    firstDate.getMonth() - BALANCE_WINDOW_MONTHS,
    1
  )

  const { counts, windowTotals, monthTotals } = buildCounts(
    activePeople, existingSchedules, windowStart, targetMonth, targetYear
  )

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
  const lastFamily = lastRoleFamilyByPerson(existingSchedules, firstDate)

  return scheduleDates.map(({ date, type }) => {
    const assignments = {}
    const assignedToday = new Set()

    roleOrder.forEach(role => {
      const isSupport = SUPPORT_ROLES.has(role)
      const family = familyOf(role)
      const base = activePeople.filter(
        p => p.skills?.includes(role) && !assignedToday.has(p.id)
      )

      // Quien solo sabe este puesto queda exento de la regla de no repetir:
      // aplicársela le dejaría sin turnos.
      const repeatsPost = p => hasAlternativeRole(p) && lastFamily[p.id] === family

      // Se relajan las restricciones por orden de importancia hasta encontrar
      // a alguien. Antes cede el descanso que el no repetir puesto, y cubrir
      // la plaza va por delante de las dos.
      let pool = base.filter(p => !previousMeeting.has(p.id) && !repeatsPost(p))
      if (!pool.length) pool = base.filter(p => !repeatsPost(p))
      if (!pool.length) pool = base.filter(p => !previousMeeting.has(p.id))
      if (!pool.length) pool = base
      if (!pool.length) { assignments[role] = null; return }

      // La variedad se mide DENTRO del repertorio de cada uno: penalizar el
      // conteo absoluto castigaba al especialista por hacer lo unico que sabe.
      const ownAverage = p => {
        const own = (p.skills ?? []).filter(r => counts[p.id][r] !== undefined)
        if (!own.length) return 0
        return own.reduce((a, r) => a + counts[p.id][r], 0) / own.length
      }

      const score = p =>
        W_MONTH_LOAD * monthTotals[p.id] +
        W_WINDOW_LOAD * windowTotals[p.id] +
        W_ROLE_REPEAT * (counts[p.id][role] - ownAverage(p)) +
        W_VERSATILITY * (p.skills?.length ?? 0) +
        (previousMeeting.has(p.id) ? W_BACK_TO_BACK : 0) +
        (lastFamily[p.id] === family ? W_SAME_ROLE_AGAIN : 0) +
        (isSupport && isSupportOnly(p) ? W_SUPPORT_ONLY : 0) +
        (monthTotals[p.id] < MIN_TURNS_PER_MONTH ? W_BELOW_MINIMUM : 0)

      // Barajar antes de ordenar: sort es estable, así los empates salen al azar.
      const chosen = shuffled(pool).sort((a, b) => score(a) - score(b))[0]

      assignments[role] = chosen.id
      assignedToday.add(chosen.id)
      counts[chosen.id][role]++
      monthTotals[chosen.id]++
      lastFamily[chosen.id] = family
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
 * Personas activas que se quedan por debajo del suelo mensual de turnos.
 * El suelo es un objetivo, no una ley: si alguien solo sabe un puesto muy
 * disputado y el mes tiene pocas reuniones, no siempre hay turnos para él.
 */
export function peopleBelowMinimum(schedules, people, minimum = MIN_TURNS_PER_MONTH) {
  return summarizeWorkload(schedules, people).filter(p => p.total < minimum)
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
