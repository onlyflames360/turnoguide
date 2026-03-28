import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { ROLES } from '../utils/scheduleGenerator'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function formatDateTime(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function NotificationsTab({ onBadgeChange, onGoToSchedule }) {
  const [responses, setResponses] = useState([])
  const [filter, setFilter] = useState('all') // 'all' | 'nopuedo' | 'puedo'
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  async function sendTestPush() {
    setTesting(true); setTestMsg('')
    try {
      await addDoc(collection(db, 'responses'), {
        scheduleId: 'test',
        scheduleDate: new Date().toISOString(),
        dayType: 'Prueba',
        personId: 'test',
        personName: '🧪 Test de sistema',
        roleKey: 'audio',
        roleLabel: 'Audio',
        response: 'nopuedo',
        createdAt: serverTimestamp(),
        seen: false,
      })
      setTestMsg('✅ Documento creado. La Cloud Function debería enviar el push en segundos.')
    } catch (e) {
      setTestMsg('❌ Error: ' + e.message)
    } finally {
      setTesting(false)
    }
  }

  useEffect(() => {
    const q = query(collection(db, 'responses'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setResponses(all)
      const unseen = all.filter(r => !r.seen && r.response === 'nopuedo').length
      onBadgeChange?.(unseen)
    })
    return unsub
  }, [])

  async function markSeen(id) {
    await updateDoc(doc(db, 'responses', id), { seen: true })
  }

  async function markAllSeen() {
    const unseen = responses.filter(r => !r.seen)
    for (const r of unseen) {
      await updateDoc(doc(db, 'responses', r.id), { seen: true })
    }
  }

  const filtered = responses.filter(r => filter === 'all' || r.response === filter)
  const unseenCount = responses.filter(r => !r.seen && r.response === 'nopuedo').length

  return (
    <div>
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Notificaciones de disponibilidad</h3>
          <p className="text-slate-500 text-xs mt-0.5">Respuestas de los hermanos a sus asignaciones</p>
        </div>
          <div className="flex gap-2">
          {unseenCount > 0 && (
            <button onClick={markAllSeen} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200">
              Marcar todo visto
            </button>
          )}
          <button onClick={sendTestPush} disabled={testing} className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 font-medium">
            {testing ? 'Enviando...' : '🧪 Test push'}
          </button>
        </div>
      </div>

      {testMsg && (
        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-xs text-purple-800">
          {testMsg}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: 'Todas' },
          { key: 'nopuedo', label: '❌ No puede' },
          { key: 'puedo', label: '✅ Puede' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
            {f.key === 'nopuedo' && unseenCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{unseenCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-4xl mb-2">🔔</div>
            <p className="font-medium">Sin notificaciones</p>
            <p className="text-sm mt-1">Aquí aparecerán las respuestas de los hermanos</p>
          </div>
        )}

        {filtered.map(r => {
          const isNoPuedo = r.response === 'nopuedo'
          const isUnseen = !r.seen && isNoPuedo
          const role = ROLES.find(rl => rl.key === r.roleKey)
          const d = new Date(r.scheduleDate)

          return (
            <div
              key={r.id}
              className={`rounded-xl border p-4 transition-all ${
                isUnseen
                  ? 'border-red-300 bg-red-50'
                  : isNoPuedo
                  ? 'border-slate-200 bg-white opacity-70'
                  : 'border-green-200 bg-green-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${isNoPuedo ? 'bg-red-500' : 'bg-green-500'}`}>
                    {r.personName?.[0] ?? '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800 text-sm">{r.personName}</p>
                      {isUnseen && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">Nuevo</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isNoPuedo ? '❌ No puede' : '✅ Puede'} · <span className="font-medium">{role?.label ?? r.roleKey}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.dayType} {String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')} · Respondido: {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1 shrink-0 flex-col items-end">
                  {isNoPuedo && (
                    <button
                      onClick={() => onGoToSchedule?.(r)}
                      className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 whitespace-nowrap"
                    >
                      🔍 Ver horario
                    </button>
                  )}
                  {!r.seen && (
                    <button
                      onClick={() => markSeen(r.id)}
                      className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 whitespace-nowrap"
                    >
                      ✓ Visto
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
