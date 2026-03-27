import { useState } from 'react'
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getMonthDates, generateSchedule } from '../utils/scheduleGenerator'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

export default function ScheduleGenerator({ people, existingSchedules, onGenerated }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState(false)

  function handlePreview() {
    if (!people.length) { setMsg('Primero añade personas en "Personas"'); return }
    const dates = getMonthDates(year, month)
    if (!dates.length) { setMsg('No hay domingos ni miércoles en ese mes'); return }
    const generated = generateSchedule(dates, people, existingSchedules)
    setPreview(generated)
    setMsg('')
  }

  async function handleSave() {
    if (!preview) return
    setLoading(true); setMsg('')
    try {
      // Comprobar si ya hay horarios en esas fechas
      let saved = 0
      for (const sched of preview) {
        // Evitar duplicados por fecha
        const existing = existingSchedules.find(
          s => new Date(s.date).toDateString() === new Date(sched.date).toDateString()
        )
        if (!existing) {
          await addDoc(collection(db, 'schedules'), {
            ...sched,
            createdAt: serverTimestamp()
          })
          saved++
        }
      }
      setMsg(`✅ ${saved} turnos guardados (${preview.length - saved} ya existían)`)
      setPreview(null)
      onGenerated?.()
    } catch (err) {
      setMsg('Error al guardar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const personName = (id) => people.find(p => p.id === id)?.name ?? '—'

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Generador de horario</h3>
          <p className="text-slate-500 text-xs mt-0.5">Rotación automática justa basada en habilidades</p>
        </div>
        <button onClick={() => setOpen(!open)} className="btn-primary text-sm">
          {open ? '▲ Cerrar' : '⚡ Generar'}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 pt-4">
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Mes</label>
              <select
                className="input"
                value={month}
                onChange={e => { setMonth(Number(e.target.value)); setPreview(null) }}
              >
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-slate-600 block mb-1">Año</label>
              <input
                type="number"
                className="input"
                value={year}
                onChange={e => { setYear(Number(e.target.value)); setPreview(null) }}
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

          {msg && <p className="text-sm mb-4 bg-blue-50 text-blue-800 rounded-lg px-3 py-2">{msg}</p>}

          {preview && (
            <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
              <div className="bg-slate-50 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Vista previa — {MONTHS[month-1]} {year} ({preview.length} reuniones)
                </span>
                <span className="text-xs text-slate-400">Revisa antes de guardar</span>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="p-2 text-left border-b border-slate-200">Fecha</th>
                      <th className="p-2 border-b border-slate-200">Audio</th>
                      <th className="p-2 border-b border-slate-200">Video</th>
                      <th className="p-2 border-b border-slate-200">Micro 1</th>
                      <th className="p-2 border-b border-slate-200">Micro 2</th>
                      <th className="p-2 border-b border-slate-200">Plataforma</th>
                      <th className="p-2 border-b border-slate-200">Auditorio</th>
                      <th className="p-2 border-b border-slate-200">Entrada</th>
                      <th className="p-2 border-b border-slate-200">Vehículos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((s, i) => (
                      <tr key={i} className={`border-b border-slate-100 ${s.dayType === 'Domingo' ? 'bg-blue-50 font-semibold' : ''}`}>
                        <td className="p-2 text-slate-700">
                          {s.dayType}<br />
                          <span className="font-normal text-slate-500">
                            {new Date(s.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                          </span>
                        </td>
                        {['audio','video','micro1','micro2','plataforma','auditorio','entrada','parking'].map(r => (
                          <td key={r} className="p-2 text-center text-slate-600">
                            {personName(s.assignments?.[r])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-amber-50 border-t border-amber-200">
                <p className="text-xs text-amber-800">
                  ⚠️ Solo se guardarán las fechas que no existen ya en el horario
                </p>
              </div>
            </div>
          )}

          {preview && (
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPreview(null)} className="btn-secondary text-sm">Descartar</button>
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
