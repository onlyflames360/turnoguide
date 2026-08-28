import { useState, useMemo } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  getMonthDates,
  generateSchedule,
  getDefaultPeriod,
  summarizeWorkload,
  findBottleneckRoles,
  ROLE_KEYS,
  BALANCE_WINDOW_MONTHS,
  MIN_TURNS_PER_MONTH,
} from '../utils/scheduleGenerator'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

const PREVIEW_COLS = ['audio','video','micro1','micro2','plataforma','auditorio','entrada','parking']

/**
 * Fechas ya ocupadas. Un turno marcado como Super o Especial se guarda movido
 * un día antes (miércoles→martes, domingo→sábado), así que su hueco original
 * también cuenta como ocupado o se regeneraría duplicado.
 */
function occupiedDates(schedules) {
  const set = new Set()
  schedules.forEach(s => {
    const d = new Date(s.date)
    set.add(d.toDateString())
    if (s.isSuper || s.isEspecial) {
      const original = new Date(d)
      original.setDate(original.getDate() + 1)
      set.add(original.toDateString())
    }
  })
  return set
}

export default function ScheduleGenerator({ people, existingSchedules, onGenerated }) {
  const initial = getDefaultPeriod()
  const [month, setMonth] = useState(initial.month)
  const [year, setYear] = useState(initial.year)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState(false)

  const bottlenecks = useMemo(() => findBottleneckRoles(people), [people])

  // Carga real del mes: lo que ya estaba guardado + lo que se va a añadir
  const workload = useMemo(() => {
    if (!preview) return null
    const sameMonth = existingSchedules.filter(s => {
      const d = new Date(s.date)
      return d.getMonth() + 1 === month && d.getFullYear() === year
    })
    return summarizeWorkload([...sameMonth, ...preview], people)
  }, [preview, existingSchedules, people, month, year])

  const gaps = useMemo(() => {
    if (!preview) return 0
    return preview.reduce(
      (acc, day) => acc + ROLE_KEYS.filter(r => !day.assignments[r]).length, 0
    )
  }, [preview])

  function handlePreview() {
    if (!people.length) { setMsg('Primero añade personas en "Personas"'); return }
    const occupied = occupiedDates(existingSchedules)
    const all = getMonthDates(year, month)
    if (!all.length) { setMsg('No hay domingos ni miércoles en ese mes'); return }

    // Solo se proponen fechas nuevas: así la vista previa es lo que se guarda
    const dates = all.filter(d => !occupied.has(d.date.toDateString()))
    if (!dates.length) {
      setPreview(null)
      setMsg(`${MONTHS[month-1]} ${year} ya está generado por completo`)
      return
    }

    setPreview(generateSchedule(dates, people, existingSchedules))
    setMsg(all.length - dates.length > 0
      ? `${all.length - dates.length} fechas ya existían y se han omitido`
      : '')
  }

  async function handleSave() {
    if (!preview) return
    setLoading(true); setMsg('')
    try {
      for (const sched of preview) {
        await addDoc(collection(db, 'schedules'), { ...sched, createdAt: serverTimestamp() })
      }
      setMsg(`✅ ${preview.length} turnos guardados`)
      setPreview(null)
      onGenerated?.()
    } catch (err) {
      setMsg('Error al guardar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const belowMinimum = useMemo(
    () => (workload ?? []).filter(w => w.total < MIN_TURNS_PER_MONTH),
    [workload]
  )

  const personName = (id) => people.find(p => p.id === id)?.name ?? '—'
  const maxLoad = workload?.length ? Math.max(...workload.map(w => w.total), 1) : 1

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Generador de horario</h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
            Reparto equilibrado: mínimo {MIN_TURNS_PER_MONTH} turnos por persona, sin repetir puesto
            en turnos seguidos y con la carga de los últimos {BALANCE_WINDOW_MONTHS} meses en cuenta
          </p>
        </div>
        <button onClick={() => setOpen(!open)} className="btn-primary text-sm">
          {open ? '▲ Cerrar' : '⚡ Generar'}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">Mes</label>
              <select
                className="input"
                value={month}
                onChange={e => { setMonth(Number(e.target.value)); setPreview(null); setMsg('') }}
              >
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">Año</label>
              <input
                type="number"
                className="input"
                value={year}
                onChange={e => { setYear(Number(e.target.value)); setPreview(null); setMsg('') }}
                min={2024}
                max={2030}
              />
            </div>
            <div className="flex items-end">
              <button onClick={handlePreview} className="btn-secondary text-sm whitespace-nowrap">
                Vista previa
              </button>
            </div>
          </div>

          {/* Ningún reparto arregla que casi nadie sepa hacer un puesto */}
          {bottlenecks.length > 0 && (
            <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">Pocas personas capacitadas:</span>{' '}
                {bottlenecks.map(b => `${b.label} (${b.count})`).join(' · ')}.
                {' '}Estos puestos rotarán poco hasta que añadas la habilidad a más gente.
              </p>
            </div>
          )}

          {msg && <p className="text-sm mb-4 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 rounded-lg px-3 py-2">{msg}</p>}

          {preview && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-4">
              <div className="bg-slate-50 dark:bg-slate-900 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Vista previa — {MONTHS[month-1]} {year} ({preview.length} reuniones)
                </span>
                <span className="text-xs text-slate-400">Revisa antes de guardar</span>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-slate-800">
                    <tr>
                      <th className="p-2 text-left border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">Fecha</th>
                      {['Audio','Video','Micro 1','Micro 2','Plataforma','Auditorio','Entrada','Vehículos'].map(h => (
                        <th key={h} className="p-2 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((s, i) => (
                      <tr key={i} className={`border-b border-slate-100 dark:border-slate-700 ${s.dayType === 'Domingo' ? 'bg-blue-50 dark:bg-blue-950/30 font-semibold' : ''}`}>
                        <td className="p-2 text-slate-700 dark:text-slate-200">
                          {s.dayType}<br />
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            {new Date(s.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                          </span>
                        </td>
                        {PREVIEW_COLS.map(r => (
                          <td
                            key={r}
                            className={`p-2 text-center ${s.assignments?.[r] ? 'text-slate-600 dark:text-slate-300' : 'text-red-500 dark:text-red-400 italic'}`}
                          >
                            {s.assignments?.[r] ? personName(s.assignments[r]) : 'sin cubrir'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {gaps > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900">
                  <p className="text-xs text-red-700 dark:text-red-300">
                    ⚠️ {gaps} puesto{gaps === 1 ? '' : 's'} sin cubrir: no hay nadie disponible con esa habilidad
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Reparto del mes de un vistazo: si alguien sale el doble, se ve aquí */}
          {workload?.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-4">
              <div className="bg-slate-50 dark:bg-slate-900 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Reparto de {MONTHS[month-1]}
                </span>
                <span className="text-xs text-slate-400">
                  entre {Math.min(...workload.map(w => w.total))} y {maxLoad} turnos por persona
                </span>
              </div>
              {belowMinimum.length > 0 && (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">Por debajo de {MIN_TURNS_PER_MONTH} turnos:</span>{' '}
                    {belowMinimum.map(p => p.name).join(', ')}. No hay suficientes puestos
                    que sepan cubrir; dales alguna habilidad más en "Personas".
                  </p>
                </div>
              )}
              <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto">
                {workload.map(w => (
                  <div key={w.id} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-300 w-32 shrink-0 truncate" title={w.name}>
                      {w.name}
                    </span>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
                        style={{ width: `${(w.total / maxLoad) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-200 w-5 text-right">
                      {w.total}
                    </span>
                    <span className="text-[10px] text-slate-400 w-20 shrink-0">
                      {w.distinctRoles} rol{w.distinctRoles === 1 ? '' : 'es'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview && (
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPreview(null)} className="btn-secondary text-sm">Descartar</button>
              <button onClick={handlePreview} className="btn-secondary text-sm">🎲 Rebarajar</button>
              <button onClick={handleSave} className="btn-primary text-sm" disabled={loading}>
                {loading ? 'Guardando...' : `Guardar ${preview.length} turnos`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
