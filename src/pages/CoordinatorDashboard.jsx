import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, query, orderBy, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import Header from '../components/Header'
import ScheduleTable from '../components/ScheduleTable'
import ScheduleGenerator from '../components/ScheduleGenerator'
import PeopleManager from '../components/PeopleManager'
import UserManager from '../components/UserManager'
import NotificationsTab from '../components/NotificationsTab'
import { exportSchedulePdf } from '../utils/exportPdf'
import { requestNotificationPermission, showNotification } from '../utils/notifications'
import { onForegroundMessage } from '../firebase/messaging'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function CoordinatorDashboard() {
  const [tab, setTab] = useState('schedule')
  const [schedules, setSchedules] = useState([])
  const [people, setPeople] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notifBadge, setNotifBadge] = useState(0)
  const isFirstLoad = useRef(true)

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

  // Escuchar mensajes FCM en primer plano + fallback Firestore
  useEffect(() => {
    requestNotificationPermission()

    // FCM en primer plano (cuando la app está abierta)
    const unsubFCM = onForegroundMessage((payload) => {
      const { title, body } = payload.notification ?? {}
      if (title) showNotification(title, body)
    })

    // Fallback: Firestore listener para notificar si FCM no está activo
    const q = query(collection(db, 'responses'), orderBy('createdAt', 'desc'))
    const unsubFS = onSnapshot(q, snap => {
      if (isFirstLoad.current) { isFirstLoad.current = false; return }
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && change.doc.data().response === 'nopuedo') {
          const data = change.doc.data()
          showNotification(
            `❌ No disponible — ${data.personName}`,
            `No puede el ${data.dayType} en ${data.roleLabel ?? data.roleKey}`
          )
        }
      })
    })
    return () => { unsubFCM(); unsubFS() }
  }, [])

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

  const today = new Date(); today.setHours(0,0,0,0)
  const upcoming = schedules.filter(s => new Date(s.date) >= today && !s.isAssamblea).length
  const activePeople = people.filter(p => p.active !== false).length

  const TABS = [
    { key: 'schedule',       label: '📅 Horario' },
    { key: 'people',         label: '👥 Personas' },
    { key: 'users',          label: '🔑 Usuarios' },
    { key: 'notifications',  label: '🔔 Notificaciones' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-blue-600">{activePeople}</p>
            <p className="text-xs text-slate-500 mt-1">Personas activas</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-green-600">{upcoming}</p>
            <p className="text-xs text-slate-500 mt-1">Turnos próximos</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-pink-600">{users.length}</p>
            <p className="text-xs text-slate-500 mt-1">Usuarios</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex-1 min-w-max py-2 px-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                tab === t.key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              {t.key === 'notifications' && notifBadge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {notifBadge > 9 ? '9+' : notifBadge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Horario */}
        {tab === 'schedule' && (
          <div className="space-y-4">
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

              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-xs text-blue-800 flex items-center gap-2">
                <span>ℹ️</span>
                <span>Haz clic en cualquier nombre para cambiar la asignación</span>
              </div>

              {loading ? (
                <div className="text-center py-8 text-slate-400">Cargando...</div>
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

        {/* Tab: Personas */}
        {tab === 'people' && (
          <div className="card">
            <div className="mb-4">
              <h3 className="font-bold text-slate-800 text-base">Gestión de personas</h3>
              <p className="text-slate-500 text-xs mt-1">Añade personas y asígnales habilidades para el generador automático</p>
            </div>
            <PeopleManager people={people} onRefresh={() => setRefreshKey(k => k + 1)} />
          </div>
        )}

        {/* Tab: Usuarios */}
        {tab === 'users' && (
          <div className="card">
            <div className="mb-4">
              <h3 className="font-bold text-slate-800 text-base">Gestión de usuarios</h3>
              <p className="text-slate-500 text-xs mt-1">Administra quién puede entrar a la app y con qué rol</p>
            </div>
            <UserManager users={users} onRefresh={() => setRefreshKey(k => k + 1)} />
          </div>
        )}

        {/* Tab: Notificaciones */}
        {tab === 'notifications' && (
          <div className="card">
            <NotificationsTab
              onBadgeChange={setNotifBadge}
              onGoToSchedule={handleGoToSchedule}
            />
          </div>
        )}
      </main>
    </div>
  )
}
