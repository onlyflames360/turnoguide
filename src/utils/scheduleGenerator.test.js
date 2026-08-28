import { describe, it, expect } from 'vitest'
import {
  getDefaultPeriod,
  getMonthDates,
  generateSchedule,
  summarizeWorkload,
  findBottleneckRoles,
  peopleBelowMinimum,
  familyOf,
  MIN_TURNS_PER_MONTH,
  ROLE_KEYS,
} from './scheduleGenerator'

/** Puestos consecutivos de cada persona, por familia, en orden cronológico. */
function turnsByPerson(schedules) {
  const byPerson = {}
  schedules.forEach(day => {
    ROLE_KEYS.forEach(role => {
      const pid = day.assignments[role]
      if (pid) (byPerson[pid] ??= []).push({ role, family: familyOf(role), date: day.date })
    })
  })
  return byPerson
}

/** Plantilla realista: polivalentes de audio/vídeo y acomodadores especializados. */
const AV = ['audio', 'video', 'micro1', 'micro2', 'plataforma']
const AC = ['auditorio', 'entrada', 'parking']
const REALISTIC = [
  ['Polivalente 1', [...AV, ...AC]],
  ['Polivalente 2', [...AV, 'auditorio', 'entrada']],
  ['Polivalente 3', [...AV, ...AC]],
  ['Polivalente 4', [...AV, 'auditorio']],
  ['Polivalente 5', [...AV, 'entrada']],
  ['Polivalente 6', AV],
  ['Polivalente 7', AV],
  ['Polivalente 8', ['audio', 'video', 'micro1', 'micro2']],
  ['Polivalente 9', ['audio', 'video', 'micro1', 'micro2']],
  ['Acomodador 1', ['auditorio', 'parking']],
  ['Acomodador 2', ['auditorio', 'entrada']],
  ['Acomodador 3', ['auditorio', 'parking']],
  ['Especialista', ['entrada']],
].map(([name, skills], i) => ({ id: `r${i}`, name, skills, active: true }))

const ALL_SKILLS = [...ROLE_KEYS]

function person(id, skills = ALL_SKILLS) {
  return { id, name: `Persona ${id}`, skills, active: true }
}

/** Turno ya guardado, para simular historial. */
function past(dateStr, assignments) {
  return { date: new Date(dateStr).toISOString(), isAssamblea: false, assignments }
}

describe('getDefaultPeriod', () => {
  it('antes del día 20 devuelve el mes en curso', () => {
    expect(getDefaultPeriod(new Date(2026, 7, 1))).toEqual({ month: 8, year: 2026 })
    expect(getDefaultPeriod(new Date(2026, 7, 19))).toEqual({ month: 8, year: 2026 })
  })

  it('desde el día 20 salta al mes siguiente', () => {
    expect(getDefaultPeriod(new Date(2026, 7, 20))).toEqual({ month: 9, year: 2026 })
    expect(getDefaultPeriod(new Date(2026, 7, 31))).toEqual({ month: 9, year: 2026 })
  })

  it('en diciembre salta a enero del año siguiente', () => {
    expect(getDefaultPeriod(new Date(2026, 11, 28))).toEqual({ month: 1, year: 2027 })
    expect(getDefaultPeriod(new Date(2026, 11, 19))).toEqual({ month: 12, year: 2026 })
  })
})

describe('getMonthDates', () => {
  it('devuelve solo domingos y miércoles', () => {
    const dates = getMonthDates(2026, 8)
    expect(dates.length).toBeGreaterThan(0)
    dates.forEach(({ date, type }) => {
      expect([0, 3]).toContain(date.getDay())
      expect(type).toBe(date.getDay() === 0 ? 'Domingo' : 'Miércoles')
    })
  })
})

describe('generateSchedule — cobertura', () => {
  it('cubre todos los roles cuando hay gente de sobra', () => {
    const people = Array.from({ length: 20 }, (_, i) => person(`p${i}`))
    const result = generateSchedule(getMonthDates(2026, 9), people, [])
    expect(result.length).toBeGreaterThan(0)
    result.forEach(day => {
      ROLE_KEYS.forEach(role => expect(day.assignments[role]).toBeTruthy())
    })
  })

  it('nunca asigna a la misma persona dos roles el mismo día', () => {
    const people = Array.from({ length: 20 }, (_, i) => person(`p${i}`))
    generateSchedule(getMonthDates(2026, 9), people, []).forEach(day => {
      const ids = ROLE_KEYS.map(r => day.assignments[r]).filter(Boolean)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  it('deja el rol a null si nadie tiene esa habilidad', () => {
    const people = [person('a', ['audio']), person('b', ['audio'])]
    const [day] = generateSchedule(getMonthDates(2026, 9), people, [])
    expect(day.assignments.audio).toBeTruthy()
    expect(day.assignments.parking).toBeNull()
  })

  it('ignora a las personas pausadas', () => {
    const people = [person('a', ['audio']), { ...person('b', ['audio']), active: false }]
    generateSchedule(getMonthDates(2026, 9), people, []).forEach(day => {
      expect(day.assignments.audio).toBe('a')
    })
  })
})

describe('generateSchedule — roles escasos primero', () => {
  it('reserva a quien sabe el rol escaso en vez de gastarlo en uno abundante', () => {
    // Solo "a" sabe de vehículos, pero también sabe audio.
    // Con orden fijo, audio se lo llevaba y Vehículos quedaba vacío.
    const people = [person('a', ['audio', 'parking']), person('b', ['audio'])]
    generateSchedule(getMonthDates(2026, 9), people, []).forEach(day => {
      expect(day.assignments.parking).toBe('a')
      expect(day.assignments.audio).toBe('b')
    })
  })
})

describe('generateSchedule — descanso mínimo', () => {
  it('no repite a nadie en dos reuniones seguidas si hay alternativas', () => {
    const people = Array.from({ length: 20 }, (_, i) => person(`p${i}`))
    const result = generateSchedule(getMonthDates(2026, 9), people, [])
    for (let i = 1; i < result.length; i++) {
      const prev = new Set(ROLE_KEYS.map(r => result[i - 1].assignments[r]).filter(Boolean))
      const curr = ROLE_KEYS.map(r => result[i].assignments[r]).filter(Boolean)
      expect(curr.filter(id => prev.has(id))).toEqual([])
    }
  })

  it('respeta la última reunión ya guardada del mes anterior', () => {
    const people = Array.from({ length: 20 }, (_, i) => person(`p${i}`))
    const previous = past('2026-08-30', { audio: 'p0', video: 'p1', micro1: 'p2' })
    const [first] = generateSchedule(getMonthDates(2026, 9), people, [previous])
    const ids = ROLE_KEYS.map(r => first.assignments[r])
    expect(ids).not.toContain('p0')
    expect(ids).not.toContain('p1')
    expect(ids).not.toContain('p2')
  })

  it('prefiere cubrir el puesto antes que respetar el descanso', () => {
    const people = [person('solo', ['parking'])]
    generateSchedule(getMonthDates(2026, 9), people, []).forEach(day => {
      expect(day.assignments.parking).toBe('solo')
    })
  })
})

describe('generateSchedule — ventana de equilibrio', () => {
  it('no cuenta los turnos anteriores a la ventana de 3 meses', () => {
    const people = [person('viejo', ['audio']), person('reciente', ['audio'])]
    const history = [
      // Fuera de ventana: no debe pesar aunque sean 3 turnos.
      past('2026-03-01', { audio: 'viejo' }),
      past('2026-03-08', { audio: 'viejo' }),
      past('2026-03-15', { audio: 'viejo' }),
      // Dentro de ventana: este sí pesa.
      past('2026-08-30', { audio: 'reciente' }),
    ]
    const [first] = generateSchedule(getMonthDates(2026, 9), people, history)
    expect(first.assignments.audio).toBe('viejo')
  })

  it('reparte el mismo rol equitativamente entre quienes lo saben hacer', () => {
    const people = ['a', 'b', 'c'].map(id => person(id, ['audio']))
    // 3 personas x tope 2 = 6 turnos exactos
    const dates = getMonthDates(2026, 9).slice(0, 6)
    const result = generateSchedule(dates, people, [])
    const tally = { a: 0, b: 0, c: 0 }
    result.forEach(d => tally[d.assignments.audio]++)
    expect(tally).toEqual({ a: 2, b: 2, c: 2 })
  })

  it('no cuenta las asambleas como turnos servidos', () => {
    const people = [person('a', ['audio']), person('b', ['audio'])]
    const history = [
      { date: new Date('2026-08-05').toISOString(), isAssamblea: true, assignments: { audio: 'a' } },
      { date: new Date('2026-08-12').toISOString(), isAssamblea: true, assignments: { audio: 'a' } },
      past('2026-08-19', { audio: 'b' }),
    ]
    const [first] = generateSchedule(getMonthDates(2026, 9), people, history)
    // "b" lleva 1 turno real, "a" ninguno → le toca a "a"
    expect(first.assignments.audio).toBe('a')
  })
})

describe('summarizeWorkload', () => {
  it('cuenta turnos y roles distintos, de más a menos cargado', () => {
    const people = [person('a'), person('b')]
    const schedules = [
      past('2026-09-06', { audio: 'a', video: 'b' }),
      past('2026-09-09', { audio: 'a', video: 'a' }),
    ]
    const summary = summarizeWorkload(schedules, people)
    expect(summary[0]).toMatchObject({ id: 'a', total: 3, distinctRoles: 2 })
    expect(summary[1]).toMatchObject({ id: 'b', total: 1, distinctRoles: 1 })
  })

  it('excluye asambleas', () => {
    const people = [person('a')]
    const schedules = [{ date: '2026-09-06', isAssamblea: true, assignments: { audio: 'a' } }]
    expect(summarizeWorkload(schedules, people)[0].total).toBe(0)
  })
})

describe('findBottleneckRoles', () => {
  it('detecta los roles con pocas personas capacitadas', () => {
    const allButParking = ROLE_KEYS.filter(r => r !== 'parking')
    const people = [
      person('a', [...allButParking, 'parking']),
      person('b', allButParking),
      person('c', allButParking),
      person('d', allButParking),
    ]
    const bottlenecks = findBottleneckRoles(people)
    const byKey = Object.fromEntries(bottlenecks.map(b => [b.key, b.count]))
    expect(byKey.parking).toBe(1)
    expect(byKey.audio).toBeUndefined()
    expect(bottlenecks[0].key).toBe('parking')
  })

  it('no cuenta a las personas pausadas', () => {
    const people = [
      person('a', ['parking']),
      { ...person('b', ['parking']), active: false },
    ]
    expect(findBottleneckRoles(people).find(r => r.key === 'parking').count).toBe(1)
  })
})

describe('familyOf', () => {
  it('trata Micro 1 y Micro 2 como el mismo puesto', () => {
    expect(familyOf('micro1')).toBe(familyOf('micro2'))
  })

  it('no agrupa puestos que son trabajos distintos', () => {
    const sueltos = ['audio', 'video', 'plataforma', 'auditorio', 'entrada', 'parking']
    const familias = sueltos.map(familyOf)
    expect(new Set(familias).size).toBe(sueltos.length)
    expect(familias).not.toContain(familyOf('micro1'))
  })
})

describe('generateSchedule — no repetir puesto en el turno siguiente', () => {
  it('alterna los puestos en vez de repetir el mismo', () => {
    // Dos personas y dos puestos: la única salida sin repetir es intercambiarlos
    const people = [person('a', ['audio', 'video']), person('b', ['audio', 'video'])]
    const result = generateSchedule(getMonthDates(2026, 9).slice(0, 4), people, [])
    Object.values(turnsByPerson(result)).forEach(turns => {
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i].family).not.toBe(turns[i - 1].family)
      }
    })
  })

  it('encadena con el último turno ya guardado, no solo con el mes generado', () => {
    const people = [person('a', ['audio', 'video']), person('b', ['audio', 'video'])]
    const previous = past('2026-08-30', { audio: 'a', video: 'b' })
    const [first] = generateSchedule(getMonthDates(2026, 9), people, [previous])
    expect(first.assignments.audio).toBe('b')
    expect(first.assignments.video).toBe('a')
  })

  it('exime a quien solo sabe un puesto, en vez de dejarle sin turnos', () => {
    // Si la regla se le aplicase, tras su primer turno no volvería a entrar
    const people = [
      person('solo', ['entrada']),
      ...['x', 'y', 'z'].map(id => person(id, ['entrada', 'auditorio'])),
    ]
    const result = generateSchedule(getMonthDates(2026, 9), people, [])
    const turns = turnsByPerson(result).solo ?? []
    expect(turns.length).toBeGreaterThanOrEqual(MIN_TURNS_PER_MONTH)
  })
})

describe('generateSchedule — suelo mensual de turnos', () => {
  it('no deja a nadie por debajo del mínimo con una plantilla realista', () => {
    // El reparto lleva barajado: se repite para que no pase por suerte
    for (let intento = 0; intento < 15; intento++) {
      const result = generateSchedule(getMonthDates(2026, 9), REALISTIC, [])
      const flojos = peopleBelowMinimum(result, REALISTIC)
      expect(flojos.map(p => p.name)).toEqual([])
    }
  })

  it('el especialista de una sola habilidad no queda relegado', () => {
    // Antes se le castigaba por repetir el unico puesto que sabe hacer
    for (let intento = 0; intento < 15; intento++) {
      const result = generateSchedule(getMonthDates(2026, 9), REALISTIC, [])
      const suyo = summarizeWorkload(result, REALISTIC).find(p => p.name === 'Especialista')
      expect(suyo.total).toBeGreaterThanOrEqual(MIN_TURNS_PER_MONTH)
    }
  })

  it('respeta el suelo tambien arrastrando historial de meses anteriores', () => {
    let history = []
    for (const [y, m] of [[2026, 6], [2026, 7], [2026, 8]]) {
      history = history.concat(generateSchedule(getMonthDates(y, m), REALISTIC, history))
    }
    const sept = generateSchedule(getMonthDates(2026, 9), REALISTIC, history)
    expect(peopleBelowMinimum(sept, REALISTIC)).toEqual([])
  })
})

describe('peopleBelowMinimum', () => {
  it('señala a quien se queda corto y respeta el mínimo por parámetro', () => {
    const people = [person('a', ['audio']), person('b', ['parking'])]
    const schedules = [past('2026-09-06', { audio: 'a' })]
    expect(peopleBelowMinimum(schedules, people, 1).map(p => p.id)).toEqual(['b'])
    expect(peopleBelowMinimum(schedules, people, 2).map(p => p.id).sort()).toEqual(['a', 'b'])
  })

  it('no cuenta a las personas pausadas', () => {
    const people = [{ ...person('a', ['audio']), active: false }]
    expect(peopleBelowMinimum([], people)).toEqual([])
  })
})
