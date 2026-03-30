import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, query, orderBy, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import ScheduleTable from '../components/ScheduleTable'
import NotificationsTab from '../components/NotificationsTab'
import SubstituteTab from '../components/SubstituteTab'
import { ROLES } from '../utils/scheduleGenerator'
import { requestNotificationPermission, showNotification, checkTomorrowNotification } from '../utils/notifications'

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
  const notifChecked = useRef(false)
  const isAyudante = user?.role === 'ayudante'

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
    return () => { unsubSched(); unsubPeople() }
  }, [])

  const myPerson = people.find(p => p.name === user?.name)
  const myPersonId = myPerson?.id ?? null

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

  // Pedir permiso y comprobar turno de mañana
  useEffect(() => {
    if (!myPersonId || schedules.length === 0 || notifChecked.current) return
    notifChecked.current = true
    requestNotificationPermission().then(granted => {
      if (granted) checkTomorrowNotification(schedules, myPersonId, people)
    })
  }, [myPersonId, schedules, people])

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

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const myUpcoming = schedules.filter(s => {
    if (s.isAssamblea || !myPersonId) return false
    const d = new Date(s.date)
    return d >= today && Object.values(s.assignments || {}).includes(myPersonId)
  }).slice(0, 5)

  const filteredSchedules = schedules.filter(s => {
    const d = new Date(s.date)
    return d.getMonth() + 1 === viewMonth && d.getFullYear() === viewYear
  })

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Bienvenida */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-2xl p-5 text-white">
          <h2 className="text-xl font-bold">Hola, {user?.name?.split(' ')[0]} 👋</h2>
          <p className="text-blue-200 text-sm mt-1">
            IMPORTANTE: Por favor llegar <span className="text-white font-semibold">30 min antes</span> de empezar la reunión
          </p>
        </div>

        {/* Tabs (solo ayudante) */}
        {isAyudante && (
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setActiveTab('turnos')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'turnos' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              📅 Mis turnos
            </button>
            <button
              onClick={() => setActiveTab('notificaciones')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors relative ${activeTab === 'notificaciones' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              🔔 Avisos
              {notifBadge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {notifBadge > 9 ? '9+' : notifBadge}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('sustitutos')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors relative ${activeTab === 'sustitutos' ? 'bg-red-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              🔄 Sustitutos
              {substBadge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {substBadge > 9 ? '9+' : substBadge}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Tab Notificaciones (ayudante) */}
        {isAyudante && activeTab === 'notificaciones' && (
          <div className="card">
            <NotificationsTab onBadgeChange={setNotifBadge} />
          </div>
        )}

        {/* Tab Sustitutos (ayudante) */}
        {isAyudante && activeTab === 'sustitutos' && (
          <div className="card">
            <SubstituteTab
              schedules={schedules}
              people={people}
              onBadgeChange={setSubstBadge}
            />
          </div>
        )}

        {/* Contenido de Mis turnos */}
        {(!isAyudante || activeTab === 'turnos') && <>

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

                  return (
                    <div key={sched.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Header fecha */}
                      <div className={`flex items-center justify-between px-4 py-2.5 ${sched.dayType === 'Domingo' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
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

                      {/* Roles + botones */}
                      <div className="p-4 space-y-3">
                        {myRoles.map(role => {
                          const key = `${sched.id}_${role.key}`
                          const existing = myResponses[key]
                          const isResponding = respondingKey === key

                          return (
                            <div key={role.key} className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                  {role.label}
                                </span>
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
                                  className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-all ${
                                    existing?.response === 'puedo'
                                      ? 'bg-green-500 text-white cursor-default'
                                      : 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100'
                                  } disabled:opacity-50`}
                                >
                                  ✓ Puedo
                                </button>
                                <button
                                  onClick={() => handleResponse(sched, role.key, role.label, 'nopuedo')}
                                  disabled={isResponding || existing?.response === 'nopuedo'}
                                  className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-all ${
                                    existing?.response === 'nopuedo'
                                      ? 'bg-red-500 text-white cursor-default'
                                      : 'bg-red-50 text-red-600 border border-red-300 hover:bg-red-100'
                                  } disabled:opacity-50`}
                                >
                                  ✗ No puedo
                                </button>
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
        )}

        {/* Horario del mes */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Horario mensual</h3>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">‹</button>
              <span className="text-sm font-semibold text-slate-700 min-w-32 text-center">{MONTHS[viewMonth - 1]} {viewYear}</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">›</button>
            </div>
          </div>
          {loading ? (
            <div className="text-center py-8 text-slate-400">Cargando horario...</div>
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
        </> }
      </main>
    </div>
  )
}
