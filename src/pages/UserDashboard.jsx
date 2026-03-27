import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import ScheduleTable from '../components/ScheduleTable'
import { ROLES, formatDate } from '../utils/scheduleGenerator'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

export default function UserDashboard() {
  const { user } = useAuth()
  const [schedules, setSchedules] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [viewYear, setViewYear] = useState(now.getFullYear())

  useEffect(() => {
    const unsubSched = onSnapshot(
      query(collection(db, 'schedules'), orderBy('date', 'asc')),
      snap => {
        setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
    const unsubPeople = onSnapshot(collection(db, 'people'), snap => {
      setPeople(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => { unsubSched(); unsubPeople() }
  }, [])

  // Buscar el personId del usuario en la colección people por nombre
  const myPerson = people.find(p => p.name === user?.name)
  const myPersonId = myPerson?.id ?? null

  const filteredSchedules = schedules.filter(s => {
    const d = new Date(s.date)
    return d.getMonth() + 1 === viewMonth && d.getFullYear() === viewYear
  })

  // Mis próximas asignaciones
  const today = new Date(); today.setHours(0,0,0,0)
  const myUpcoming = schedules
    .filter(s => {
      if (s.isAssamblea) return false
      const d = new Date(s.date)
      if (d < today) return false
      if (!myPersonId) return false
      return Object.values(s.assignments || {}).includes(myPersonId)
    })
    .slice(0, 3)

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
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

        {/* Próximas asignaciones */}
        {myPersonId ? (
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-4">Mis próximas asignaciones</h3>
            {myUpcoming.length === 0 ? (
              <p className="text-slate-400 text-sm">No tienes asignaciones próximas</p>
            ) : (
              <div className="space-y-3">
                {myUpcoming.map(sched => {
                  const myRoles = Object.entries(sched.assignments || {})
                    .filter(([, pid]) => pid === myPersonId)
                    .map(([rk]) => ROLES.find(r => r.key === rk)?.label ?? rk)

                  return (
                    <div key={sched.id} className="flex items-center gap-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                      <div className="text-center min-w-16">
                        <p className="text-xs text-yellow-600 font-medium">{sched.dayType}</p>
                        <p className="text-lg font-bold text-yellow-800">
                          {new Date(sched.date).getDate()}
                        </p>
                        <p className="text-xs text-yellow-600">
                          {MONTHS[new Date(sched.date).getMonth()]}
                        </p>
                      </div>
                      <div>
                        {myRoles.map(r => (
                          <span key={r} className="inline-block bg-yellow-200 text-yellow-800 text-xs font-semibold px-2 py-1 rounded-full mr-1 mb-1">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
            Tu usuario no está vinculado a ninguna persona en el horario. Pide al coordinador que añada tu nombre en "Personas".
          </div>
        )}

        {/* Horario del mes */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Horario mensual</h3>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">
                ‹
              </button>
              <span className="text-sm font-semibold text-slate-700 min-w-32 text-center">
                {MONTHS[viewMonth - 1]} {viewYear}
              </span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">
                ›
              </button>
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
      </main>
    </div>
  )
}
