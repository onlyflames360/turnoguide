import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, onSnapshot, query, orderBy, where, addDoc, doc, updateDoc, serverTimestamp, Timestamp, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import ScheduleTable from '../components/ScheduleTable'
import NotificationsTab from '../components/NotificationsTab'
import SubstituteTab from '../components/SubstituteTab'
import ProfileAvatar from '../components/ProfileAvatar'
import EmergencyButton from '../components/EmergencyButton'
import EmergencyModal from '../components/EmergencyModal'
import { ROLES } from '../utils/scheduleGenerator'
import { showNotification } from '../utils/notifications'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function UserDashboard() {
  const { user } = useAuth()
  const [schedules, setSchedules] = useState([])
  const [people, setPeople] = useState([])
  const [myResponses, setMyResponses] = useState({}) // key: scheduleId_roleKey → response doc
  const [loading, setLoading] = useState(true)
  const [respondingKey, setRespondingKey] = useState(null)
  const [activeTab, setActiveTab] = useState('turnos')
  const [notifBadge, setNotifBadge] = useState(0)
  const [substBadge, setSubstBadge] = useState(0)
  const [mySolicitudes, setMySolicitudes] = useState([])
  const [answeringId, setAnsweringId] = useState(null)
  const [emergencyAlert, setEmergencyAlert] = useState(null)
  const mountTime = useRef(Timestamp.now())
  const isAyudante = user?.role === 'ayudante_av' || user?.role === 'ayudante_ac' || user?.role === 'ayudante'
  const roleSection = user?.role === 'ayudante_av' ? 'av' : user?.role === 'ayudante_ac' ? 'ac' : null

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [viewYear, setViewYear] = useState(now.getFullYear())

  // Listener de alertas de emergencia — solo docs nuevos desde que montó la página
  useEffect(() => {
    const q = query(
      collection(db, 'emergencias'),
      where('createdAt', '>', mountTime.current),
      orderBy('createdAt', 'desc'),
      limit(1)
    )
    return onSnapshot(q, snap => {
      if (!snap.empty) {
        const d = snap.docs[0]
        setEmergencyAlert({ id: d.id, ...d.data() })
      }
    })
  }, [])

  useEffect(() => {
    const unsubSched = onSnapshot(
      query(collection(db, 'schedules'), orderBy('date', 'asc')),
      snap => { setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }
    )
    const unsubPeople = onSnapshot(collection(db, 'people'), snap => {
      setPeople(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => { unsubSched(); unsubPeople() }
  }, [])

  const myPersonId = useMemo(
    () => people.find(p => p.name === user?.name)?.id ?? null,
    [people, user?.name]
  )

  // Cargar mis respuestas previas
  useEffect(() => {
    if (!myPersonId) return
    const unsub = onSnapshot(
      query(collection(db, 'responses'), orderBy('createdAt', 'desc')),
      snap => {
        const map = {}
        snap.docs.forEach(d => {
          const data = d.data()
          if (data.personId === myPersonId) {
            const key = `${data.scheduleId}_${data.roleKey}`
            if (!map[key]) map[key] = { id: d.id, ...data }
          }
        })
        setMyResponses(map)
      }
    )
    return unsub
  }, [myPersonId])

  // Solicitudes de sustitución dirigidas a este usuario
  useEffect(() => {
    if (!myPersonId) return
    const q = query(
      collection(db, 'solicitudes'),
      where('requestedPersonId', '==', myPersonId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, snap => {
      setMySolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [myPersonId])

  async function handleSolicitudResponse(solicitud, accept) {
    setAnsweringId(solicitud.id)
    try {
      if (accept) {
        // Actualizar horario
        await updateDoc(doc(db, 'schedules', solicitud.scheduleId), {
          [`assignments.${solicitud.roleKey}`]: myPersonId,
        })
        // Resolver la respuesta original
        await updateDoc(doc(db, 'responses', solicitud.responseId), {
          resolved: true,
          substituteName: user?.name ?? '',
          resolvedBy: user?.name ?? '',
          resolvedAt: serverTimestamp(),
          seen: true,
        })
      }
      // Actualizar estado de la solicitud
      await updateDoc(doc(db, 'solicitudes', solicitud.id), {
        status: accept ? 'accepted' : 'rejected',
        answeredAt: serverTimestamp(),
      })
    } finally {
      setAnsweringId(null)
    }
  }


  async function handleResponse(schedule, roleKey, roleLabel, response) {
    const key = `${schedule.id}_${roleKey}`
    setRespondingKey(key)
    try {
      await addDoc(collection(db, 'responses'), {
        scheduleId: schedule.id,
        scheduleDate: schedule.date,
        dayType: schedule.dayType,
        personId: myPersonId,
        personName: user?.name,
        roleKey,
        roleLabel,
        response,
        createdAt: serverTimestamp(),
        seen: false,
      })
      if (response === 'nopuedo') {
        showNotification(
          '❌ Respuesta enviada',
          `Has indicado que no puedes el ${schedule.dayType}. El coordinador ha sido notificado.`
        )
      }
    } finally {
      setRespondingKey(null)
    }
  }

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])

  const myUpcoming = useMemo(() => schedules.filter(s => {
    if (s.isAssamblea || !myPersonId) return false
    const d = new Date(s.date)
    return d >= today && Object.values(s.assignments || {}).includes(myPersonId)
  }).slice(0, 5), [schedules, myPersonId, today])

  // Roles de emergencia: entrada/parking donde el usuario ha dicho "Puedo"
  const myTodayEmergencyRoles = useMemo(() => {
    if (!myPersonId) return []
    const seen = new Set()
    const roles = []
    for (const s of myUpcoming) {
      for (const [rk, pid] of Object.entries(s.assignments || {})) {
        if (pid !== myPersonId) continue
        if (rk !== 'entrada' && rk !== 'parking') continue
        if (seen.has(rk)) continue
        const resp = myResponses[`${s.id}_${rk}`]
        if (resp?.response === 'puedo') {
          seen.add(rk)
          roles.push({ key: rk, label: rk === 'entrada' ? 'Entrada' : 'Vehículos' })
        }
      }
    }
    return roles
  }, [myUpcoming, myPersonId, myResponses])

  const filteredSchedules = useMemo(() => schedules.filter(s => {
    const d = new Date(s.date)
    return d.getMonth() + 1 === viewMonth && d.getFullYear() === viewYear
  }), [schedules, viewMonth, viewYear])

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  // Layout constants for aurora hero and segmented tabs
  const AYUDANTE_TABS = ['turnos', 'notificaciones', 'sustitutos']
  const activeTabIdx = AYUDANTE_TABS.indexOf(activeTab)
  const nextSched = myUpcoming[0] ?? null
  const nextTurnRoles = nextSched && myPersonId
    ? Object.entries(nextSched.assignments || {})
        .filter(([, pid]) => pid === myPersonId)
        .map(([rk]) => ROLES.find(r => r.key === rk)?.label ?? rk)
        .join(' · ')
    : ''
  const nextTurnDate = nextSched
    ? `${nextSched.dayType} ${String(new Date(nextSched.date).getDate()).padStart(2, '0')} ${MONTHS[new Date(nextSched.date).getMonth()]}`
    : ''

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <EmergencyModal emergency={emergencyAlert} onClose={() => setEmergencyAlert(null)} />
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Perfil de usuario */}
        <div className="hero-aurora rounded-2xl fade-in overflow-visible">
          <div className="relative z-10 pt-6 pb-5 px-5">
            {/* Avatar centrado */}
            <div className="flex flex-col items-center">
              <ProfileAvatar size={96} />

              {/* Nombre superpuesto al avatar (-mt hace que suba sobre la foto) */}
              <div className="text-center -mt-3 relative z-10">
                <div className="inline-block bg-white/90 dark:bg-slate-800/90 rounded-2xl px-5 pt-5 pb-3 shadow-sm"
                     style={{ backdropFilter: 'blur(8px)' }}>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight"
                     style={{ letterSpacing: '-0.03em' }}>
                    {user?.name}
                  </p>
                  {myUpcoming.length > 0 && (
                    <p className="text-indigo-500 dark:text-indigo-400 text-xs font-semibold mt-0.5">
                      {myUpcoming.length} turno{myUpcoming.length !== 1 ? 's' : ''} próximo{myUpcoming.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Próximo turno y aviso */}
            <div className="mt-4 space-y-3">
              {nextSched && myPersonId && (
                <div className="next-turn-card">
                  <div className="relative z-10" style={{ maxWidth: '58%' }}>
                    <p className="text-xs font-semibold text-indigo-200 uppercase tracking-wider">
                      Próximo turno
                    </p>
                    <p className="text-lg font-extrabold text-white mt-0.5"
                       style={{ letterSpacing: '-0.03em' }}>
                      {nextTurnDate}
                    </p>
                    {nextTurnRoles && (
                      <p className="text-indigo-200 text-xs mt-0.5">{nextTurnRoles}</p>
                    )}
                  </div>
                  <img
                    src="/hero-turno.png"
                    alt=""
                    aria-hidden="true"
                    draggable="false"
                    className="absolute bottom-0 right-1 h-full w-auto object-contain object-bottom pointer-events-none select-none"
                    style={{ maxWidth: '52%', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.25))' }}
                  />
                </div>
              )}
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
                   style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}>
                <span className="text-red-400 text-xs font-semibold">⚠️ Llegar 30 min antes</span>
              </div>
            </div>
          </div>
        </div>

        {/* Botones de emergencia — solo si el usuario tiene entrada/parking HOY */}
        {myTodayEmergencyRoles.length > 0 && (
          <div
            className="rounded-2xl fade-in overflow-hidden"
            style={{
              background: 'linear-gradient(135deg,rgba(220,38,38,0.08),rgba(153,27,27,0.05))',
              border: '1px solid rgba(220,38,38,0.25)',
              boxShadow: '0 4px 20px rgba(220,38,38,0.08)',
            }}
          >
            <div className="px-4 py-3 flex items-center gap-2 border-b border-red-200/30 dark:border-red-900/30">
              <span className="text-red-600 dark:text-red-400 text-sm font-black">🚨 ALERTA DE EMERGENCIA</span>
            </div>
            <div className="px-4 py-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-4">
                Pulsa si hay una emergencia en tu puesto. Se avisará a todos.
              </p>
              <div className={`flex gap-8 justify-center`}>
                {myTodayEmergencyRoles.map(r => (
                  <EmergencyButton key={r.key} roleKey={r.key} roleLabel={r.label} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Solicitudes de sustitución pendientes */}
        {mySolicitudes.length > 0 && (
          <div className="space-y-3">
            {mySolicitudes.map(sol => (
              <div key={sol.id} className="bg-white dark:bg-slate-800 rounded-[20px] overflow-hidden border border-amber-200 dark:border-amber-900/40"
                   style={{ boxShadow: '0 0 0 4px rgba(245,158,11,0.06), 0 4px 16px -4px rgba(0,0,0,0.08)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2"
                     style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                  <span className="text-white font-bold text-sm">🤝 Solicitud de sustitución</span>
                </div>
                <div className="px-4 py-4">
                  <p className="text-slate-600 dark:text-slate-300 text-sm mb-3">
                    <span className="font-bold text-slate-900 dark:text-white">{sol.requestedByName}</span> necesita que le cubras:
                  </p>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50">{sol.roleLabel}</span>
                    <span className="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg capitalize">
                      {sol.dayType} · {new Date(sol.scheduleDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSolicitudResponse(sol, true)}
                      disabled={answeringId === sol.id}
                      className="py-3 text-sm font-bold rounded-xl text-white transition-all active:scale-95 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 4px 12px -2px rgba(16,185,129,0.35)' }}
                    >✓ Puedo</button>
                    <button
                      onClick={() => handleSolicitudResponse(sol, false)}
                      disabled={answeringId === sol.id}
                      className="py-3 text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 border-2 border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                    >✗ No puedo</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs (solo ayudante) */}
        {isAyudante && (
          <div className="segmented-tabs">
            <div
              className="segmented-tab-indicator"
              style={{
                left: `calc(4px + ${activeTabIdx} * (100% - 8px) / 3)`,
                width: 'calc((100% - 8px) / 3)',
              }}
            />
            <button onClick={() => setActiveTab('turnos')} className={`segmented-tab${activeTab === 'turnos' ? ' active' : ''}`}>
              📅 Mis turnos
            </button>
            <button onClick={() => setActiveTab('notificaciones')} className={`segmented-tab${activeTab === 'notificaciones' ? ' active' : ''} relative`}>
              🔔 Avisos
              {notifBadge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold badge-new">
                  {notifBadge > 9 ? '9+' : notifBadge}
                </span>
              )}
            </button>
            <button onClick={() => setActiveTab('sustitutos')} className={`segmented-tab${activeTab === 'sustitutos' ? ' active' : ''} relative`}>
              🔄 Sustitutos
              {substBadge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold badge-new">
                  {substBadge > 9 ? '9+' : substBadge}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Tab Notificaciones (ayudante) */}
        {isAyudante && activeTab === 'notificaciones' && (
          <div key="tab-notificaciones" className="card fade-in">
            <NotificationsTab onBadgeChange={setNotifBadge} />
          </div>
        )}

        {/* Tab Sustitutos (ayudante) */}
        {isAyudante && activeTab === 'sustitutos' && (
          <div key="tab-sustitutos" className="card fade-in">
            <SubstituteTab
              schedules={schedules}
              people={people}
              onBadgeChange={setSubstBadge}
              roleSection={roleSection}
            />
          </div>
        )}

        {/* Contenido de Mis turnos */}
        {(!isAyudante || activeTab === 'turnos') && <div key="tab-turnos" className="space-y-6 fade-in">

        {/* Sin vinculación */}
        {!myPersonId && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
            Tu usuario no está vinculado. Pide al coordinador que te añada en "Personas" con tu mismo nombre.
          </div>
        )}

        {/* Próximas asignaciones con Puedo/No puedo */}
        {myPersonId && (
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-4">Mis próximas asignaciones</h3>
            {myUpcoming.length === 0 ? (
              <p className="text-slate-400 text-sm">No tienes asignaciones próximas</p>
            ) : (
              <div className="space-y-3">
                {myUpcoming.map(sched => {
                  const d = new Date(sched.date)
                  const myRoles = Object.entries(sched.assignments || {})
                    .filter(([, pid]) => pid === myPersonId)
                    .map(([rk]) => ({ key: rk, label: ROLES.find(r => r.key === rk)?.label ?? rk }))

                  const allConfirmed = myRoles.length > 0 && myRoles.every(r => myResponses[`${sched.id}_${r.key}`]?.response === 'puedo')
                  const hasNoPuedo = myRoles.some(r => myResponses[`${sched.id}_${r.key}`]?.response === 'nopuedo')
                  const dotMod = allConfirmed ? ' status-dot-confirmed' : hasNoPuedo ? ' status-dot-nopuedo' : ''

                  return (
                    <div key={sched.id} className="bg-white dark:bg-slate-800 rounded-[20px] overflow-hidden border border-slate-100 dark:border-slate-700"
                         style={{ boxShadow: '0 2px 12px -2px rgba(0,0,0,0.06), 0 1px 3px -1px rgba(0,0,0,0.04)' }}>
                      {/* Header fecha */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className="date-chip">
                            <span className="date-chip-day">{String(d.getDate()).padStart(2, '0')}</span>
                            <span className="date-chip-month">{MONTHS[d.getMonth()].slice(0, 3)}</span>
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-none">
                              {sched.dayType}
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5">
                              {sched.dayType === 'Domingo' ? 'Fin de semana' : sched.dayType === 'Miércoles' ? 'Entre semana' : 'Especial'}
                            </p>
                          </div>
                        </div>
                        <div className={`status-dot${dotMod}`} />
                      </div>

                      {/* Roles + botones */}
                      <div className="p-4 space-y-4">
                        {myRoles.map(role => {
                          const key = `${sched.id}_${role.key}`
                          const existing = myResponses[key]
                          const isResponding = respondingKey === key
                          const isConfirmed = existing?.response === 'puedo'
                          const isNoPuedo = existing?.response === 'nopuedo'

                          return (
                            <div key={role.key}>
                              <span className="inline-block bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50 mb-2">
                                {role.label}
                              </span>
                              {isConfirmed ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="btn-confirm col-span-1">✓ Confirmado</div>
                                  <button
                                    onClick={() => handleResponse(sched, role.key, role.label, 'nopuedo')}
                                    disabled={isResponding}
                                    className="py-3 text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 border-2 border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                                  >✗ No puedo</button>
                                </div>
                              ) : isNoPuedo ? (
                                <button
                                  onClick={() => handleResponse(sched, role.key, role.label, 'puedo')}
                                  disabled={isResponding}
                                  className="w-full py-3 text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 border-2 border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                                >↩ Cambiar a Puedo</button>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={() => handleResponse(sched, role.key, role.label, 'puedo')}
                                    disabled={isResponding}
                                    className="py-3 text-sm font-bold rounded-xl text-white transition-all active:scale-95 disabled:opacity-50"
                                    style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 4px 12px -2px rgba(16,185,129,0.35)' }}
                                  >✓ Puedo</button>
                                  <button
                                    onClick={() => handleResponse(sched, role.key, role.label, 'nopuedo')}
                                    disabled={isResponding}
                                    className="py-3 text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 border-2 border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                                  >✗ No puedo</button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Horario del mes */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Horario mensual</h3>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 flex items-center justify-center text-slate-500 transition-colors active:scale-95">‹</button>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 min-w-32 text-center" style={{ letterSpacing: '-0.02em' }}>{MONTHS[viewMonth - 1]} {viewYear}</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 flex items-center justify-center text-slate-500 transition-colors active:scale-95">›</button>
            </div>
          </div>
          {loading ? (
            <div className="space-y-2.5 py-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-12 w-full" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : (
            <ScheduleTable
              schedules={filteredSchedules}
              people={people}
              allSchedules={schedules}
              isCoordinator={false}
              userId={myPersonId}
            />
          )}
        </div>
        </div> }
      </main>
    </div>
  )
}
