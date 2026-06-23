import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// jsPDF se carga solo al pulsar "Descargar PDF"
async function exportAttendancePdf(...args) {
  const { exportAttendancePdf: fn } = await import('../utils/exportAttendancePdf')
  return fn(...args)
}

function avg(nums) {
  if (!nums.length) return 0
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

/**
 * Pestaña de contabilidad de asistencia (solo ayudante acomodador).
 * Muestra las reuniones del mes con su recuento, las 3 medias y exporta PDF.
 */
export default function AttendanceTab({ schedules, myPersonId, userName }) {
  const [records, setRecords] = useState({}) // scheduleId → { presencial, zoom }
  const [drafts, setDrafts] = useState({})   // scheduleId → { presencial, zoom }
  const [editingId, setEditingId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [viewYear, setViewYear] = useState(now.getFullYear())

  useEffect(() => {
    return onSnapshot(collection(db, 'asistencia'), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data() })
      setRecords(map)
    })
  }, [])

  function draftValue(row, field) {
    const draft = drafts[row.id]
    if (draft && draft[field] !== undefined) return draft[field]
    return row.hasData ? String(row[field]) : ''
  }

  function setDraft(id, field, value) {
    const clean = value.replace(/[^0-9]/g, '')
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: clean } }))
  }

  async function saveRow(row) {
    const presencial = Number(draftValue(row, 'presencial') || 0)
    const zoom = Number(draftValue(row, 'zoom') || 0)
    setSavingId(row.id)
    try {
      await setDoc(doc(db, 'asistencia', row.id), {
        scheduleId: row.id,
        scheduleDate: row.date,
        dayType: row.dayType,
        presencial,
        zoom,
        filledByName: userName ?? '',
        filledByPersonId: myPersonId ?? '',
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDrafts(prev => { const n = { ...prev }; delete n[row.id]; return n })
      setEditingId(null)
    } finally {
      setSavingId(null)
    }
  }

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  const rows = useMemo(() => {
    return schedules
      .filter(s => {
        if (s.isAssamblea) return false
        const d = new Date(s.date)
        return d.getMonth() + 1 === viewMonth && d.getFullYear() === viewYear
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(s => {
        const rec = records[s.id]
        const presencial = Number(rec?.presencial ?? 0)
        const zoom = Number(rec?.zoom ?? 0)
        return {
          id: s.id,
          date: s.date,
          dayType: s.dayType ?? '',
          presencial,
          zoom,
          total: presencial + zoom,
          hasData: !!rec,
        }
      })
  }, [schedules, records, viewMonth, viewYear])

  const averages = useMemo(() => {
    const withData = rows.filter(r => r.hasData)
    return {
      presencial: avg(withData.map(r => r.presencial)),
      zoom: avg(withData.map(r => r.zoom)),
      total: avg(withData.map(r => r.total)),
    }
  }, [rows])

  const filledCount = rows.filter(r => r.hasData).length

  return (
    <div>
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Contabilidad de asistencia</h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">Recuento por reunión · puedes añadir o corregir cualquiera</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center justify-center text-slate-500 transition-colors active:scale-95">‹</button>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 min-w-28 text-center">{MONTHS[viewMonth - 1]} {viewYear}</span>
          <button onClick={nextMonth} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center justify-center text-slate-500 transition-colors active:scale-95">›</button>
        </div>
      </div>

      {/* Medias */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Media presencial', value: averages.presencial, from: 'from-emerald-500', to: 'to-emerald-600' },
          { label: 'Media Zoom', value: averages.zoom, from: 'from-blue-500', to: 'to-blue-600' },
          { label: 'Media total', value: averages.total, from: 'from-indigo-500', to: 'to-indigo-600' },
        ].map(m => (
          <div key={m.label} className={`bg-gradient-to-br ${m.from} ${m.to} rounded-2xl p-3 text-center text-white shadow-sm`}>
            <p className="text-2xl font-bold tabular-nums leading-none">{m.value}</p>
            <p className="text-[11px] text-white/80 mt-1 leading-tight">{m.label}</p>
          </div>
        ))}
      </div>

      {/* PDF */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => exportAttendancePdf(rows, averages, viewMonth, viewYear)}
          disabled={filledCount === 0}
          className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-medium disabled:opacity-40"
        >
          ⬇️ Descargar PDF
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-4xl mb-2">📊</div>
            <p className="font-medium">Sin reuniones este mes</p>
          </div>
        )}

        {rows.map(r => {
          const d = new Date(r.date)
          const isEditing = editingId === r.id
          const isSaving = savingId === r.id
          const pres = draftValue(r, 'presencial')
          const zoom = draftValue(r, 'zoom')
          const draftTotal = Number(pres || 0) + Number(zoom || 0)

          return (
            <div key={r.id} className={`rounded-xl border p-3 ${
              r.hasData ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/20'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{r.dayType}</p>
                  <p className="text-xs text-slate-400">{String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}</p>
                </div>
                {!isEditing && (
                  <div className="flex items-center gap-4">
                    {r.hasData ? (
                      <div className="flex items-center gap-4 text-center">
                        <div>
                          <p className="text-sm font-bold text-emerald-600">{r.presencial}</p>
                          <p className="text-[10px] text-slate-400">Presencial</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-blue-600">{r.zoom}</p>
                          <p className="text-[10px] text-slate-400">Zoom</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-indigo-600">{r.total}</p>
                          <p className="text-[10px] text-slate-400">Total</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⏳ Pendiente</span>
                    )}
                    <button
                      onClick={() => setEditingId(r.id)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      {r.hasData ? '✏️ Editar' : '+ Añadir'}
                    </button>
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Presencial</span>
                      <input
                        type="number" inputMode="numeric" min="0" value={pres}
                        onChange={e => setDraft(r.id, 'presencial', e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="0"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Zoom</span>
                      <input
                        type="number" inputMode="numeric" min="0" value={zoom}
                        onChange={e => setDraft(r.id, 'zoom', e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="0"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      Total: <span className="font-bold text-indigo-600 dark:text-indigo-400">{draftTotal}</span>
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingId(null); setDrafts(prev => { const n = { ...prev }; delete n[r.id]; return n }) }}
                        className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => saveRow(r)}
                        disabled={isSaving}
                        className="text-sm font-bold px-4 py-2 rounded-lg text-white transition-all active:scale-95 disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
                      >
                        {isSaving ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
