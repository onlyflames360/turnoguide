import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

/**
 * Contador de asistencia para la persona asignada a Auditorio.
 * Aparece para las reuniones donde el usuario tiene Auditorio y ya ha llegado el
 * día, salvo que haya respondido "No puedo". Permite registrar presencial + Zoom,
 * compartirlo a otras apps y guardarlo (queda registrado para el ayudante acomodador).
 */
export default function AttendanceForm({ schedules, myPersonId, userName, myResponses = {} }) {
  const [records, setRecords] = useState({}) // scheduleId → { presencial, zoom }
  const [drafts, setDrafts] = useState({})   // scheduleId → { presencial, zoom }
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null)

  // Reuniones de Auditorio cuyo día ya ha llegado, salvo que haya dicho "No puedo"
  const myMeetings = useMemo(() => {
    if (!myPersonId) return []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return schedules
      .filter(s => {
        if (s.isAssamblea || s.assignments?.auditorio !== myPersonId) return false
        const resp = myResponses[`${s.id}_auditorio`]
        if (resp?.response === 'nopuedo') return false // solo se excluye a quien dijo "No puedo"
        const d = new Date(s.date); d.setHours(0, 0, 0, 0)
        return d <= today // solo el día de la reunión (y después, hasta guardarlo)
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [schedules, myPersonId, myResponses])

  // Suscripción a los registros existentes
  useEffect(() => {
    return onSnapshot(collection(db, 'asistencia'), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data() })
      setRecords(map)
    })
  }, [])

  function getValue(scheduleId, field) {
    const draft = drafts[scheduleId]
    if (draft && draft[field] !== undefined) return draft[field]
    const rec = records[scheduleId]
    return rec?.[field] !== undefined ? String(rec[field]) : ''
  }

  function setValue(scheduleId, field, value) {
    const clean = value.replace(/[^0-9]/g, '')
    setDrafts(prev => ({ ...prev, [scheduleId]: { ...prev[scheduleId], [field]: clean } }))
    setSavedId(null)
  }

  async function save(sched) {
    const presencial = Number(getValue(sched.id, 'presencial') || 0)
    const zoom = Number(getValue(sched.id, 'zoom') || 0)
    setSavingId(sched.id)
    try {
      await setDoc(doc(db, 'asistencia', sched.id), {
        scheduleId: sched.id,
        scheduleDate: sched.date,
        dayType: sched.dayType ?? '',
        presencial,
        zoom,
        filledByName: userName ?? '',
        filledByPersonId: myPersonId ?? '',
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDrafts(prev => { const n = { ...prev }; delete n[sched.id]; return n })
      setSavedId(sched.id)
    } finally {
      setSavingId(null)
    }
  }

  async function share(sched) {
    const d = new Date(sched.date)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    const presencial = Number(getValue(sched.id, 'presencial') || 0)
    const zoom = Number(getValue(sched.id, 'zoom') || 0)
    const text = [
      userName,
      `Asistencia ${dd}/${mm}/${yy}`,
      `Presencial: ${presencial}`,
      `Zoom: ${zoom}`,
      `Total: ${presencial + zoom}`,
    ].filter(Boolean).join('\n')
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        alert('Copiado al portapapeles')
      }
    } catch {
      /* compartir cancelado */
    }
  }

  if (myMeetings.length === 0) return null

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">📊</span>
        <h3 className="font-bold text-slate-800 dark:text-slate-100">Contabilidad de asistencia</h3>
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
        Te toca Auditorio hoy. Anota los asistentes presenciales y por Zoom. Al guardar se envía al ayudante acomodador.
      </p>

      <div className="space-y-3">
        {myMeetings.map(sched => {
          const d = new Date(sched.date)
          const presencial = getValue(sched.id, 'presencial')
          const zoom = getValue(sched.id, 'zoom')
          const total = (Number(presencial || 0) + Number(zoom || 0))
          const hasRecord = !!records[sched.id]
          const isDirty = !!drafts[sched.id]
          const isSaving = savingId === sched.id
          const justSaved = savedId === sched.id

          return (
            <div key={sched.id} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{sched.dayType}</span>
                  <span className="text-sm text-slate-500">
                    {String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')} {MONTHS[d.getMonth()].slice(0,3)}
                  </span>
                </div>
                {hasRecord && !isDirty && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✅ Registrado</span>
                )}
                {!hasRecord && !isDirty && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⏳ Pendiente</span>
                )}
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Presencial</span>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={presencial}
                      onChange={e => setValue(sched.id, 'presencial', e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="0"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Zoom</span>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={zoom}
                      onChange={e => setValue(sched.id, 'zoom', e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="0"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    Total: <span className="font-bold text-indigo-600 dark:text-indigo-400">{total}</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => share(sched)}
                      className="text-sm font-bold px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
                    >
                      📤 Compartir
                    </button>
                    <button
                      onClick={() => save(sched)}
                      disabled={isSaving || (!isDirty && hasRecord)}
                      className="text-sm font-bold px-4 py-2 rounded-lg text-white transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
                    >
                      {isSaving ? 'Guardando…' : justSaved ? '✓ Enviado' : hasRecord ? 'Rectificar' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
