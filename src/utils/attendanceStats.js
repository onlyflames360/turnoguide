export const MONTH_LABELS_SHORT = [
  'Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'
]

export const MONTH_LABELS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

function mean(nums) {
  if (!nums.length) return 0
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

/**
 * Resumen mes a mes de un año: media de asistencia presencial y por Zoom.
 *
 * Se usa la media (no el total) porque los meses tienen distinto número de
 * reuniones, y comparar totales haría parecer más concurrido un mes con
 * cinco domingos. Las asambleas no cuentan, igual que en la tabla mensual.
 *
 * @param {Array} schedules - todos los turnos, con { id, date, isAssamblea }
 * @param {Object} records  - asistencia por scheduleId → { presencial, zoom }
 * @param {number} year
 * @returns {Array<{month, label, presencial, zoom, total, meetings, hasData}>} 12 entradas
 */
export function buildYearlySummary(schedules, records, year) {
  const buckets = Array.from({ length: 12 }, () => [])

  schedules.forEach(s => {
    if (s.isAssamblea) return
    const d = new Date(s.date)
    if (d.getFullYear() !== year) return
    const rec = records[s.id]
    if (!rec) return // reunión sin contabilizar: no arrastra la media hacia abajo
    buckets[d.getMonth()].push({
      presencial: Number(rec.presencial ?? 0),
      zoom: Number(rec.zoom ?? 0),
    })
  })

  return buckets.map((entries, i) => {
    const presencial = mean(entries.map(e => e.presencial))
    const zoom = mean(entries.map(e => e.zoom))
    return {
      month: i + 1,
      label: MONTH_LABELS_SHORT[i],
      presencial,
      zoom,
      total: presencial + zoom,
      meetings: entries.length,
      hasData: entries.length > 0,
    }
  })
}

/** Medias del año completo, ponderadas por reunión (no medias de medias). */
export function yearAverages(schedules, records, year) {
  const all = []
  schedules.forEach(s => {
    if (s.isAssamblea) return
    if (new Date(s.date).getFullYear() !== year) return
    const rec = records[s.id]
    if (rec) all.push({ presencial: Number(rec.presencial ?? 0), zoom: Number(rec.zoom ?? 0) })
  })
  const presencial = mean(all.map(e => e.presencial))
  const zoom = mean(all.map(e => e.zoom))
  return { presencial, zoom, total: presencial + zoom, meetings: all.length }
}

/** Meses con datos, de mayor a menor total. Sirve para etiquetar los extremos. */
export function extremeMonths(summary) {
  const withData = summary.filter(m => m.hasData)
  if (!withData.length) return { top: null, bottom: null }
  const sorted = [...withData].sort((a, b) => b.total - a.total)
  return {
    top: sorted[0],
    bottom: sorted.length > 1 ? sorted[sorted.length - 1] : null,
  }
}

/**
 * Escala del eje Y con marcas en números redondos (0/25/50/75/100…).
 * Se prueban pasos de la escalera 1·2·2,5·5·10 y se elige el que deja entre
 * 3 y 6 divisiones sin desperdiciar altura. La usan el gráfico de la app y el
 * del PDF, para que ambos dibujen exactamente el mismo eje.
 *
 * @returns {{yMax:number, step:number, ticks:number[]}}
 */
export function niceScale(maxValue) {
  if (!(maxValue > 0)) return { yMax: 20, step: 5, ticks: [0, 5, 10, 15, 20] }

  const candidates = []
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue / 3)))
  for (const mult of [1, 2, 2.5, 5, 10]) {
    for (const scale of [magnitude, magnitude * 10]) {
      const step = mult * scale
      // Pasos enteros: la asistencia se cuenta en personas, no en fracciones
      if (!Number.isInteger(step)) continue
      const divisions = Math.ceil(maxValue / step)
      if (divisions >= 3 && divisions <= 6) candidates.push({ step, yMax: step * divisions })
    }
  }
  const fallbackStep = Math.max(1, Math.ceil(maxValue / 4))
  const best = candidates.length
    ? candidates.reduce((a, b) => (b.yMax < a.yMax ? b : a))
    : { step: fallbackStep, yMax: fallbackStep * 4 }

  const ticks = []
  for (let v = 0; v <= best.yMax + 1e-9; v += best.step) ticks.push(Math.round(v))
  return { yMax: best.yMax, step: best.step, ticks }
}

/** Años que tienen alguna reunión registrada, de más reciente a más antiguo. */
export function yearsWithData(schedules) {
  const years = new Set()
  schedules.forEach(s => {
    const y = new Date(s.date).getFullYear()
    if (!Number.isNaN(y)) years.add(y)
  })
  return [...years].sort((a, b) => b - a)
}
