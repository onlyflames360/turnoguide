import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, deleteDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import { ROLES } from '../utils/scheduleGenerator'
import ChangeModal from './ChangeModal'

const AV_ROLE_KEYS = new Set(['audio', 'video', 'micro1', 'micro2', 'plataforma'])
const AC_ROLE_KEYS = new Set(['auditorio', 'entrada', 'parking'])

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' })
}

function timeAgo(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const mins = Math.floor((Date.now() - d) / 60000)
  if (mins < 1) return 'ahora mismo'
  if (mins < 60) return `hace ${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `hace ${h}h`
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
}

export default function SubstituteTab({ schedules, people, onBadgeChange, roleSection }) {
  const { user } = useAuth()
  const [responses, setResponses] = useState([])
  const [solicitudes, setSolicitudes] = useState([]) // todas las solicitudes
  const [filter, setFilter] = useState('pending')
  const [modalData, setModalData] = useState(null)
  const [sending, setSending] = useState(false)
  const [autoSub, setAutoSub] = useState(false)
  const [togglingAuto, setTogglingAuto] = useState(false)

  // Escuchar respuestas "No puedo"
  useEffect(() => {
    const q = query(collection(db, 'responses'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.response === 'nopuedo' && r.scheduleId !== 'test')
      setResponses(all)
      const sectionAll = roleSection
        ? all.filter(r => roleSection === 'av' ? AV_ROLE_KEYS.has(r.roleKey) : AC_ROLE_KEYS.has(r.roleKey))
        : all
      onBadgeChange?.(sectionAll.filter(r => !r.resolved).length)
    })
  }, [roleSection])

  // Escuchar solicitudes de sustitución
  useEffect(() => {
    const q = query(collection(db, 'solicitudes'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setSolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // Leer ajuste auto-sustituto
  useEffect(() => {
    getDoc(doc(db, 'settings', 'global')).then(d => {
      setAutoSub(d.data()?.autoSubstitute ?? false)
    })
  }, [])

  async function toggleAutoSub() {
    setTogglingAuto(true)
    const newVal = !autoSub
    await setDoc(doc(db, 'settings', 'global'), { autoSubstitute: newVal }, { merge: true })
    setAutoSub(newVal)
    setTogglingAuto(false)
  }

  // Filtrar por sección del ayudante
  const sectionResponses = responses.filter(r => {
    if (!roleSection) return true
    return roleSection === 'av' ? AV_ROLE_KEYS.has(r.roleKey) : AC_ROLE_KEYS.has(r.roleKey)
  })

  const filtered = sectionResponses.filter(r => {
    if (filter === 'pending') return !r.resolved
    if (filter === 'resolved') return !!r.resolved
    return true
  })

  const pendingCount = sectionResponses.filter(r => !r.resolved).length
  const resolvedCount = sectionResponses.filter(r => r.resolved).length

  async function deleteResponse(r) {
    // Borrar también las solicitudes relacionadas
    const relSols = solicitudes.filter(s => s.responseId === r.id)
    for (const s of relSols) await deleteDoc(doc(db, 'solicitudes', s.id))
    await deleteDoc(doc(db, 'responses', r.id))
  }

  function openModal(response) {
    const schedule = schedules.find(s => s.id === response.scheduleId)
    if (!schedule) return
    setModalData({ response, schedule })
  }

  // En lugar de asignar directamente, crea una solicitud
  async function handleSendRequest(roleKey, newPersonId) {
    if (!modalData || !newPersonId) return
    setSending(true)
    try {
      const { response, schedule } = modalData
      const candidate = people.find(p => p.id === newPersonId)
      const role = ROLES.find(r => r.key === roleKey)

      await addDoc(collection(db, 'solicitudes'), {
        scheduleId: schedule.id,
        scheduleDate: schedule.date,
        dayType: schedule.dayType,
        roleKey,
        roleLabel: role?.label ?? roleKey,
        responseId: response.id,
        requestedPersonId: newPersonId,
        requestedPersonName: candidate?.name ?? '',
        requestedByName: user?.name ?? '',
        status: 'pending',
        createdAt: serverTimestamp(),
        answeredAt: null,
      })

      setModalData(null)
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      {/* Cabecera con stats */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Gestión de sustitutos</h3>
          <p className="text-slate-500 text-xs mt-0.5">Envía solicitudes a candidatos y gestiona las respuestas</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Toggle auto-sustituto */}
          <button
            onClick={toggleAutoSub}
            disabled={togglingAuto}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
              autoSub
                ? 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200'
                : 'bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <span className={`w-7 h-4 rounded-full flex items-center px-0.5 transition-colors ${autoSub ? 'bg-green-500' : 'bg-slate-300'}`}>
              <span className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${autoSub ? 'translate-x-3' : ''}`} />
            </span>
            Auto
          </button>
          <div className="text-center bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
            <p className="text-lg font-bold text-red-600 leading-none">{pendingCount}</p>
            <p className="text-xs text-red-500 mt-0.5">Pendientes</p>
          </div>
          <div className="text-center bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
            <p className="text-lg font-bold text-green-600 leading-none">{resolvedCount}</p>
            <p className="text-xs text-green-500 mt-0.5">Resueltos</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5 mb-4 bg-slate-100 p-1 rounded-xl">
        {[
          { key: 'pending', label: '🔴 Pendientes', count: pendingCount },
          { key: 'resolved', label: '✅ Resueltos', count: resolvedCount },
          { key: 'all', label: 'Todos', count: responses.length },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filter === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f.label}
            {f.count > 0 && (
              <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${
                filter === f.key ? 'bg-slate-100 text-slate-500' : 'bg-slate-200 text-slate-400'
              }`}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-4xl mb-2">{filter === 'pending' ? '🎉' : '📋'}</div>
            <p className="font-medium">
              {filter === 'pending' ? '¡Sin pendientes!' : 'Sin registros'}
            </p>
            <p className="text-sm mt-1">
              {filter === 'pending' ? 'Todos los turnos están cubiertos' : 'No hay entradas en este filtro'}
            </p>
          </div>
        )}

        {filtered.map(r => {
          const role = ROLES.find(rl => rl.key === r.roleKey)
          const isPending = !r.resolved
          const sched = schedules.find(s => s.id === r.scheduleId)

          // Solicitudes relacionadas con esta respuesta
          const relSolicitudes = solicitudes.filter(s => s.responseId === r.id)
          const pendingSolicitud = relSolicitudes.find(s => s.status === 'pending')
          const lastRejected = relSolicitudes.filter(s => s.status === 'rejected').slice(0, 3)

          return (
            <div
              key={r.id}
              className={`rounded-xl border-l-4 border border-slate-200 bg-white overflow-hidden ${
                isPending ? 'border-l-red-400' : 'border-l-green-400'
              }`}
            >
              {/* Top strip */}
              <div className={`px-4 py-2 flex items-center justify-between gap-2 flex-wrap ${isPending ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPending ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {isPending ? '🔴 Pendiente' : '✅ Resuelto'}
                  </span>
                  <span className="text-xs text-slate-500">{timeAgo(r.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    role?.section === 'audioVideo' ? 'bg-blue-100 text-blue-700'
                    : role?.section === 'acomodadores' ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}>
                    {role?.label ?? r.roleKey}
                  </span>
                  <button
                    onClick={() => deleteResponse(r)}
                    className="text-xs px-2 py-0.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 border border-red-200"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-3 space-y-3">
                {/* Persona que no puede */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold shrink-0">
                      {r.personName?.[0] ?? '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{r.personName}</p>
                      <p className="text-xs text-slate-500 capitalize">{r.dayType} · {formatDate(r.scheduleDate)}</p>
                      {!isPending && (
                        <p className="text-xs text-green-700 font-medium mt-0.5">
                          ✅ Sustituto: <span className="font-bold">{r.substituteName}</span> · por {r.resolvedBy}
                        </p>
                      )}
                    </div>
                  </div>

                  {isPending && !pendingSolicitud && (
                    <button
                      onClick={() => openModal(r)}
                      disabled={!sched}
                      className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
                    >
                      🔍 Buscar
                    </button>
                  )}
                </div>

                {/* Estado solicitud pendiente */}
                {isPending && pendingSolicitud && (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                        {pendingSolicitud.requestedPersonName?.[0] ?? '?'}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-blue-800">⏳ Esperando respuesta</p>
                        <p className="text-xs text-blue-600">{pendingSolicitud.requestedPersonName}</p>
                      </div>
                    </div>
                    <span className="text-xs text-blue-400">{timeAgo(pendingSolicitud.createdAt)}</span>
                  </div>
                )}

                {/* Rechazados anteriores */}
                {isPending && lastRejected.length > 0 && (
                  <div className="space-y-1">
                    {lastRejected.map(s => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <span className="text-xs text-slate-400">❌ {s.requestedPersonName} — no puede</span>
                        {!pendingSolicitud && (
                          <button
                            onClick={() => openModal(r)}
                            disabled={!sched}
                            className="ml-auto text-xs text-amber-600 hover:text-amber-700 font-semibold"
                          >
                            Buscar otro →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal — envía solicitud en lugar de asignar directamente */}
      {modalData && (
        <ChangeModal
          schedule={modalData.schedule}
          roleKey={modalData.response.roleKey}
          people={people}
          allSchedules={schedules}
          onConfirm={handleSendRequest}
          onClose={() => setModalData(null)}
          confirmLabel={sending ? 'Enviando...' : '📩 Enviar solicitud'}
        />
      )}
    </div>
  )
}
