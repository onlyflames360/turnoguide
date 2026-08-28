import { describe, it, expect } from 'vitest'
import {
  buildYearlySummary,
  yearAverages,
  extremeMonths,
  yearsWithData,
  niceScale,
} from './attendanceStats'

function meeting(id, dateStr, extra = {}) {
  return { id, date: new Date(dateStr).toISOString(), isAssamblea: false, ...extra }
}

describe('buildYearlySummary', () => {
  it('devuelve siempre 12 meses', () => {
    expect(buildYearlySummary([], {}, 2026)).toHaveLength(12)
  })

  it('hace la media del mes en vez de sumar', () => {
    const schedules = [meeting('s1', '2026-08-02'), meeting('s2', '2026-08-09')]
    const records = { s1: { presencial: 80, zoom: 20 }, s2: { presencial: 60, zoom: 30 } }
    const agosto = buildYearlySummary(schedules, records, 2026)[7]
    expect(agosto).toMatchObject({ presencial: 70, zoom: 25, total: 95, meetings: 2, hasData: true })
  })

  it('ignora reuniones sin contabilizar en vez de contarlas como cero', () => {
    const schedules = [meeting('s1', '2026-08-02'), meeting('s2', '2026-08-09')]
    const records = { s1: { presencial: 80, zoom: 20 } }
    const agosto = buildYearlySummary(schedules, records, 2026)[7]
    expect(agosto).toMatchObject({ presencial: 80, zoom: 20, meetings: 1 })
  })

  it('excluye asambleas', () => {
    const schedules = [meeting('s1', '2026-08-02', { isAssamblea: true })]
    const records = { s1: { presencial: 500, zoom: 0 } }
    expect(buildYearlySummary(schedules, records, 2026)[7].hasData).toBe(false)
  })

  it('ignora otros años', () => {
    const schedules = [meeting('s1', '2025-08-03')]
    const records = { s1: { presencial: 90, zoom: 10 } }
    expect(buildYearlySummary(schedules, records, 2026)[7].hasData).toBe(false)
  })

  it('marca como vacíos los meses sin reuniones', () => {
    const summary = buildYearlySummary([meeting('s1', '2026-01-04')], { s1: { presencial: 50, zoom: 5 } }, 2026)
    expect(summary[0].hasData).toBe(true)
    expect(summary.filter(m => m.hasData)).toHaveLength(1)
    expect(summary[6]).toMatchObject({ total: 0, meetings: 0, hasData: false })
  })
})

describe('yearAverages', () => {
  it('pondera por reunión, no hace media de medias', () => {
    // Enero: 2 reuniones de 100. Julio: 1 de 10. La media real es 70, no 55.
    const schedules = [
      meeting('a', '2026-01-04'), meeting('b', '2026-01-11'), meeting('c', '2026-07-05'),
    ]
    const records = {
      a: { presencial: 100, zoom: 0 },
      b: { presencial: 100, zoom: 0 },
      c: { presencial: 10, zoom: 0 },
    }
    expect(yearAverages(schedules, records, 2026)).toMatchObject({ presencial: 70, meetings: 3 })
  })

  it('devuelve ceros sin datos', () => {
    expect(yearAverages([], {}, 2026)).toMatchObject({ presencial: 0, zoom: 0, total: 0, meetings: 0 })
  })
})

describe('extremeMonths', () => {
  it('encuentra el mes más alto y el más bajo con datos', () => {
    const schedules = [meeting('a', '2026-01-04'), meeting('b', '2026-05-03'), meeting('c', '2026-09-06')]
    const records = {
      a: { presencial: 50, zoom: 0 }, b: { presencial: 120, zoom: 0 }, c: { presencial: 90, zoom: 0 },
    }
    const { top, bottom } = extremeMonths(buildYearlySummary(schedules, records, 2026))
    expect(top.month).toBe(5)
    expect(bottom.month).toBe(1)
  })

  it('no devuelve extremos si no hay datos', () => {
    expect(extremeMonths(buildYearlySummary([], {}, 2026))).toEqual({ top: null, bottom: null })
  })

  it('con un solo mes no inventa un mínimo distinto', () => {
    const schedules = [meeting('a', '2026-01-04')]
    const { top, bottom } = extremeMonths(buildYearlySummary(schedules, { a: { presencial: 50, zoom: 0 } }, 2026))
    expect(top.month).toBe(1)
    expect(bottom).toBeNull()
  })
})

describe('yearsWithData', () => {
  it('lista los años de más reciente a más antiguo, sin repetir', () => {
    const schedules = [meeting('a', '2025-01-05'), meeting('b', '2026-03-01'), meeting('c', '2026-04-05')]
    expect(yearsWithData(schedules)).toEqual([2026, 2025])
  })
})

describe('niceScale', () => {
  it('usa marcas redondas y no desperdicia altura', () => {
    expect(niceScale(124)).toMatchObject({ yMax: 125, step: 25 })
    expect(niceScale(124).ticks).toEqual([0, 25, 50, 75, 100, 125])
  })

  it('todas las marcas son enteros redondos en casos variados', () => {
    for (const max of [7, 18, 45, 63, 99, 101, 240, 480, 1300]) {
      const { yMax, ticks } = niceScale(max)
      expect(yMax).toBeGreaterThanOrEqual(max)
      expect(ticks[0]).toBe(0)
      expect(ticks[ticks.length - 1]).toBe(yMax)
      expect(ticks.length).toBeGreaterThanOrEqual(4) // 3 divisiones + el cero
      expect(ticks.length).toBeLessThanOrEqual(7)
      ticks.forEach(t => expect(Number.isInteger(t)).toBe(true))
    }
  })

  it('no deja el techo por debajo del máximo real', () => {
    for (let max = 1; max <= 300; max++) {
      expect(niceScale(max).yMax).toBeGreaterThanOrEqual(max)
    }
  })

  it('devuelve una escala usable sin datos', () => {
    expect(niceScale(0).yMax).toBe(20)
  })
})
