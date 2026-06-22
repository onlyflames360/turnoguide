import { useState, useEffect, useRef, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, where, doc, deleteDoc, addDoc, updateDoc, serverTimestamp, Timestamp, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import ScheduleTable from '../components/ScheduleTable'
import ScheduleGenerator from '../components/ScheduleGenerator'
import PeopleManager from '../components/PeopleManager'
import UserManager from '../components/UserManager'
import NotificationsTab from '../components/NotificationsTab'
import AttendanceTab from '../components/AttendanceTab'
import AttendanceForm from '../components/AttendanceForm'
import EmergencyButton from '../components/EmergencyButton'
import EmergencyModal from '../components/EmergencyModal'
// jsPDF se carga solo cuando el usuario pulsa "Descargar PDF" (~95 kB menos en carga inicial)
async function exportSchedulePdf(...args) {
  const { exportSchedulePdf: fn } = await import('../utils/exportPdf')
  return fn(...args)
}
import { requestNotificationPermission } from '../utils/notifications'
import { onForegroundMessage } from '../firebase/messaging'
import { ROLES } from '../utils/scheduleGenerator'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function CoordinatorDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('schedule')
  const [schedules, setSchedules] = useState([])
  const [people, setPeople] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notifBadge, setNotifBadge] = useState(0)
  const isFirstLoad = useRef(true)

  // Mis turnos
  const [myResponses, setMyResponses] = useState({})
  const [respondingKey, setRespondingKey] = useState(null)
  const [mySolicitudes, setMySolicitudes] = useState([])
  const [answeringId, setAnsweringId] = useState(null)
  const [emergencyAlert, setEmergencyAlert] = useState(null)
  const mountTime = useRef(Timestamp.now())

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [viewYear, setViewYear] = useState(now.getFullYear())

  useEffect(() => {
    const unsubSched = onSnapshot(
      query(collection(db, 'schedules'), orderBy('date', 'asc')),
      snap => { setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }
    )
    const unsubPeople = onSnapshot(collection(db, 'people'), snap => {
      setPeople(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => { unsubSched(); unsubPeople(); unsubUsers() }
  }, [])

  // FCM en primer plano (para el recordatorio de turnos propios)
  useEffect(() => {
    requestNotificationPermission()
    const unsubFCM = onForegroundMessage(() => {}) // mantiene el SW activo
    return unsubFCM
  }, [])

  const myPersonId = useMemo(
    () => people.find(p => p.name === user?.name)?.id ?? null,
    [people, user?.name]
  )

  // Mis respuestas previas
  useEffect(() => {
    if (!myPersonId) return
    const q = query(collection(db, 'responses'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      const map = {}
      snap.docs.forEach(d => {
        const data = d.data()
        if (data.personId === myPersonId) {
          const key = `${data.scheduleId}_${data.roleKey}`
          if (!map[key]) map[key] = { id: d.id, ...data }
        }
      })
      setMyResponses(map)
    })
  }, [myPersonId])

  // Solicitudes de sustitución para el coordinador
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
        roleKey, roleLabel, response,
        createdAt: serverTimestamp(),
        seen: false,
      })
    } finally {
      setRespondingKey(null)
    }
  }

  async function handleSolicitudResponse(solicitud, accept) {
    setAnsweringId(solicitud.id)
    try {
      if (accept) {
        await updateDoc(doc(db, 'schedules', solicitud.scheduleId), {
          [`assignments.${solicitud.roleKey}`]: myPersonId,
        })
        await updateDoc(doc(db, 'responses', solicitud.responseId), {
          resolved: true,
          substituteName: user?.name ?? '',
          resolvedBy: user?.name ?? '',
          resolvedAt: serverTimestamp(),
          seen: true,
        })
      }
      await updateDoc(doc(db, 'solicitudes', solicitud.id), {
        status: accept ? 'accepted' : 'rejected',
        answeredAt: serverTimestamp(),
      })
    } finally {
      setAnsweringId(null)
    }
  }

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

  async function deleteMonthSchedules() {
    if (!confirm(`¿Eliminar todos los turnos de ${MONTHS[viewMonth-1]} ${viewYear}?`)) return
    for (const s of filteredSchedules) await deleteDoc(doc(db, 'schedules', s.id))
  }

  function handleGoToSchedule(response) {
    const d = new Date(response.scheduleDate)
    setViewMonth(d.getMonth() + 1)
    setViewYear(d.getFullYear())
    setTab('schedule')
  }

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

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const activePeople = useMemo(() => people.filter(p => p.active !== false).length, [people])
  const upcoming = useMemo(
    () => schedules.filter(s => new Date(s.date) >= today && !s.isAssamblea).length,
    [schedules, today]
  )
  const myUpcoming = useMemo(() => schedules.filter(s => {
    if (s.isAssamblea || !myPersonId) return false
    return new Date(s.date) >= today && Object.values(s.assignments || {}).includes(myPersonId)
  }).slice(0, 5), [schedules, myPersonId, today])

  // Roles de emergencia: entrada/parking donde el coordinador ha dicho "Puedo"
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

  const TABS = [
    { key: 'schedule',       label: '📅 Horario' },
    { key: 'myturnos',       label: '⭐ Mis turnos' },
    { key: 'people',         label: '👥 Personas' },
    { key: 'users',          label: '🔑 Usuarios' },
    { key: 'notifications',  label: '🔔 Notificaciones' },
    { key: 'contabilidad',   label: '📊 Contabilidad' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <EmergencyModal emergency={emergencyAlert} onClose={() => setEmergencyAlert(null)} />
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-4
                          text-center text-white shadow-sm
                          fade-in card-lift">
            <p className="text-2xl font-bold tabular-nums">{activePeople}</p>
            <p className="text-xs text-white/75 mt-1 leading-tight">Personas activas</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4
                          text-center text-white shadow-sm
                          fade-in fade-in-delay-1 card-lift">
            <p className="text-2xl font-bold tabular-nums">{upcoming}</p>
            <p className="text-xs text-white/75 mt-1 leading-tight">Turnos próximos</p>
          </div>
          <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl p-4
                          text-center text-white shadow-sm
                          fade-in fade-in-delay-2 card-lift">
            <p className="text-2xl font-bold tabular-nums">{users.length}</p>
            <p className="text-xs text-white/75 mt-1 leading-tight">Usuarios</p>
          </div>
        </div>

        {/* Botón emergencia — solo si tiene entrada/parking confirmado */}
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
              <div className="flex gap-8 justify-center">
                {myTodayEmergencyRoles.map(r => (
                  <EmergencyButton key={r.key} roleKey={r.key} roleLabel={r.label} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex-1 min-w-max py-2 px-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                tab === t.key
                  ? t.key === 'myturnos'
                    ? 'bg-amber-400 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
              {t.key === 'notifications' && notifBadge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold badge-new">
                  {notifBadge > 9 ? '9+' : notifBadge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Horario */}
        {tab === 'schedule' && (
          <div key="tab-schedule" className="space-y-4 fade-in">
            <ScheduleGenerator
              people={people.filter(p => p.active !== false)}
              existingSchedules={schedules}
              onGenerated={() => setRefreshKey(k => k + 1)}
            />
            <div className="card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="font-bold text-slate-800">Horario</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">‹</button>
                  <span className="text-sm font-semibold text-slate-700 min-w-36 text-center">{MONTHS[viewMonth - 1]} {viewYear}</span>
                  <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">›</button>
                  {filteredSchedules.length > 0 && (
                    <>
                      <button
                        onClick={() => exportSchedulePdf(filteredSchedules, people, viewMonth, viewYear)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-medium"
                      >
                        ⬇️ Descargar PDF
                      </button>
                      <button onClick={deleteMonthSchedules} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200">
                        🗑️ Borrar mes
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mb-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <span>ℹ️</span>
                <span>Haz clic en cualquier nombre para cambiar la asignación</span>
              </div>

              {loading ? (
                <div className="space-y-2.5 py-2">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="skeleton h-12 w-full"
                      style={{ opacity: 1 - i * 0.15 }}
                    />
                  ))}
                </div>
              ) : (
                <ScheduleTable
                  schedules={filteredSchedules}
                  people={people}
                  allSchedules={schedules}
                  isCoordinator={true}
                  userId={null}
                />
              )}
            </div>
          </div>
        )}

        {/* Tab: Mis turnos */}
        {tab === 'myturnos' && (
          <div key="tab-myturnos" className="space-y-4 fade-in">
            {/* Formulario de asistencia (si el coordinador tiene Auditorio asignado) */}
            <AttendanceForm schedules={schedules} myPersonId={myPersonId} userName={user?.name} />
            {/* Solicitudes pendientes */}
            {mySolicitudes.map(sol => (
              <div key={sol.id} className="bg-amber-50 border-2 border-amber-300 rounded-2xl overflow-hidden">
                <div className="bg-amber-400 px-4 py-2">
                  <span className="text-white font-bold text-sm">🤝 Solicitud de sustitución</span>
                </div>
                <div className="px-4 py-4">
                  <p className="text-slate-700 text-sm mb-1">
                    <span className="font-bold">{sol.requestedByName}</span> te pide que cubras el turno de:
                  </p>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">{sol.roleLabel}</span>
                    <span className="text-slate-600 text-sm font-medium capitalize">{sol.dayType} · {new Date(sol.scheduleDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSolicitudResponse(sol, true)} disabled={answeringId === sol.id}
                      className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50">
                      ✓ Puedo
                    </button>
                    <button onClick={() => handleSolicitudResponse(sol, false)} disabled={answeringId === sol.id}
                      className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50">
                      ✗ No puedo
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="card">
              <h3 className="font-bold text-slate-800 mb-4">Mis próximas asignaciones</h3>
              {!myPersonId ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
                  Tu usuario no está en "Personas". Añádete con tu mismo nombre para ver tus turnos.
                </div>
              ) : myUpcoming.length === 0 ? (
                <p className="text-slate-400 text-sm">No tienes asignaciones próximas</p>
              ) : (
                <div className="space-y-3">
                  {myUpcoming.map(sched => {
                    const d = new Date(sched.date)
                    const myRoles = Object.entries(sched.assignments || {})
                      .filter(([, pid]) => pid === myPersonId)
                      .map(([rk]) => ({ key: rk, label: ROLES.find(r => r.key === rk)?.label ?? rk }))
                    return (
                      <div key={sched.id} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        <div className={`flex items-center justify-between px-4 py-2.5 ${sched.dayType === 'Domingo' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
                          <div>
                            <span className="font-bold text-sm">{sched.dayType}</span>
                            <span className="text-sm ml-2 opacity-80">
                              {String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}
                            </span>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sched.dayType === 'Domingo' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {MONTHS[d.getMonth()]}
                          </span>
                        </div>
                        <div className="p-4 space-y-3">
                          {myRoles.map(role => {
                            const key = `${sched.id}_${role.key}`
                            const existing = myResponses[key]
                            const isResponding = respondingKey === key
                            return (
                              <div key={role.key} className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">{role.label}</span>
                                  {existing && (
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${existing.response === 'puedo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                      {existing.response === 'puedo' ? '✅ Confirmado' : '❌ No puedo'}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleResponse(sched, role.key, role.label, 'puedo')}
                                    disabled={isResponding || existing?.response === 'puedo'}
                                    className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-all ${existing?.response === 'puedo' ? 'bg-green-500 text-white cursor-default' : 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100'} disabled:opacity-50`}
                                  >✓ Puedo</button>
                                  <button
                                    onClick={() => handleResponse(sched, role.key, role.label, 'nopuedo')}
                                    disabled={isResponding || existing?.response === 'nopuedo'}
                                    className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-all ${existing?.response === 'nopuedo' ? 'bg-red-500 text-white cursor-default' : 'bg-red-50 text-red-600 border border-red-300 hover:bg-red-100'} disabled:opacity-50`}
                                  >✗ No puedo</button>
                                </div>
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
          </div>
        )}

        {/* Tab: Personas */}
        {tab === 'people' && (
          <div key="tab-people" className="card fade-in">
            <div className="mb-4">
              <h3 className="font-bold text-slate-800 text-base">Gestión de personas</h3>
              <p className="text-slate-500 text-xs mt-1">Añade personas y asígnales habilidades para el generador automático</p>
            </div>
            <PeopleManager people={people} onRefresh={() => setRefreshKey(k => k + 1)} />
          </div>
        )}

        {/* Tab: Usuarios */}
        {tab === 'users' && (
          <div key="tab-users" className="card fade-in">
            <div className="mb-4">
              <h3 className="font-bold text-slate-800 text-base">Gestión de usuarios</h3>
              <p className="text-slate-500 text-xs mt-1">Administra quién puede entrar a la app y con qué rol</p>
            </div>
            <UserManager users={users} onRefresh={() => setRefreshKey(k => k + 1)} />
          </div>
        )}

        {/* Tab: Notificaciones */}
        {tab === 'notifications' && (
          <div key="tab-notifications" className="card fade-in">
            <NotificationsTab
              onBadgeChange={setNotifBadge}
              onGoToSchedule={handleGoToSchedule}
            />
          </div>
        )}

        {/* Tab: Contabilidad */}
        {tab === 'contabilidad' && (
          <div key="tab-contabilidad" className="space-y-6 fade-in">
            {/* Formulario de relleno (si el coordinador tiene Auditorio asignado) */}
            <AttendanceForm schedules={schedules} myPersonId={myPersonId} userName={user?.name} />
            <div className="card">
              <AttendanceTab schedules={schedules} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
