export const ROLES = [
  { key: 'audio',      label: 'Audio',      section: 'audioVideo' },
  { key: 'video',      label: 'Video',      section: 'audioVideo' },
  { key: 'micro1',     label: 'Micro 1',    section: 'audioVideo' },
  { key: 'micro2',     label: 'Micro 2',    section: 'audioVideo' },
  { key: 'plataforma', label: 'Plataforma', section: 'audioVideo' },
  { key: 'auditorio',  label: 'Auditorio',  section: 'acomodadores' },
  { key: 'entrada',    label: 'Entrada',    section: 'acomodadores' },
  { key: 'parking',    label: 'Vehículos',  section: 'parking' },
]

export const ROLE_KEYS = ROLES.map(r => r.key)

export const SECTIONS = {
  audioVideo:    { label: 'Audio y Video',  cols: ['audio','video','micro1','micro2','plataforma'] },
  acomodadores:  { label: 'Acomodadores',   cols: ['auditorio','entrada'] },
  parking:       { label: 'Parking',        cols: ['parking'] },
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

/** Construye un mapa de conteos de asignaciones previas por persona y rol */
function buildCounts(people, existingSchedules) {
  const counts = {}
  people.forEach(p => {
    counts[p.id] = {}
    ROLE_KEYS.forEach(r => (counts[p.id][r] = 0))
  })
  existingSchedules.forEach(s => {
    if (!s.isAssamblea) {
      ROLE_KEYS.forEach(r => {
        const pid = s.assignments?.[r]
        if (pid && counts[pid]) counts[pid][r]++
      })
    }
  })
  return counts
}

/**
 * Genera un array de objetos de horario para las fechas dadas.
 * @param {Array<{date: Date, type: string}>} scheduleDates
 * @param {Array} people - personas activas con { id, name, skills[] }
 * @param {Array} existingSchedules - horarios ya guardados para contar rotación justa
 */
export function generateSchedule(scheduleDates, people, existingSchedules = []) {
  const activePeople = people.filter(p => p.active !== false)
  const counts = buildCounts(activePeople, existingSchedules)

  // Total de turnos asignados en esta generación por persona
  const totalThisMonth = {}
  activePeople.forEach(p => { totalThisMonth[p.id] = 0 })

  return scheduleDates.map(({ date, type }) => {
    const assignments = {}
    const assignedToday = new Set()

    ROLE_KEYS.forEach(role => {
      // Preferir personas bajo el límite de 2; si no hay, coger el menos usado como fallback
      let eligible = activePeople.filter(p =>
        p.skills?.includes(role) &&
        !assignedToday.has(p.id) &&
        (counts[p.id]?.[role] ?? 0) < 2
      )
      if (!eligible.length) {
        eligible = activePeople.filter(p =>
          p.skills?.includes(role) && !assignedToday.has(p.id)
        )
      }
      if (!eligible.length) { assignments[role] = null; return }

      eligible.sort((a, b) => {
        // 1º: quién ha hecho menos veces este rol en concreto este mes
        // → nadie repite el mismo rol hasta que todos lo hayan hecho una vez
        const roleDiff = (counts[a.id]?.[role] ?? 0) - (counts[b.id]?.[role] ?? 0)
        if (roleDiff !== 0) return roleDiff
        // 2º: quién lleva menos turnos totales este mes (desempate global)
        const totalDiff = (totalThisMonth[a.id] ?? 0) - (totalThisMonth[b.id] ?? 0)
        return totalDiff !== 0 ? totalDiff : Math.random() - 0.5
      })

      const chosen = eligible[0]
      assignments[role] = chosen.id
      assignedToday.add(chosen.id)
      if (counts[chosen.id]) counts[chosen.id][role]++
      totalThisMonth[chosen.id]++
    })

    return {
      date: date.toISOString(),
      dayType: type,
      isAssamblea: false,
      assignments,
    }
  })
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
