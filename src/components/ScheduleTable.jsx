import { useState, memo } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { ROLES, SECTIONS, formatDateShort } from '../utils/scheduleGenerator'
import ChangeModal from './ChangeModal'

function ScheduleTable({ schedules, people, allSchedules, isCoordinator, userId }) {
  const [editing, setEditing] = useState(null) // { schedule, roleKey }
  const [saving, setSaving] = useState(false)

  const personName = (pid) => people.find(p => p.id === pid)?.name ?? '—'
  const isMe = (pid) => pid === userId

  async function handleChange(roleKey, newPersonId) {
    if (!editing) return
    setSaving(true)
    const ref = doc(db, 'schedules', editing.schedule.id)
    await updateDoc(ref, {
      [`assignments.${roleKey}`]: newPersonId ?? null
    })
    setSaving(false)
    setEditing(null)
  }

  async function toggleAssamblea(schedule) {
    const ref = doc(db, 'schedules', schedule.id)
    await updateDoc(ref, { isAssamblea: !schedule.isAssamblea })
  }

  async function toggleSuper(schedule) {
    const ref = doc(db, 'schedules', schedule.id)
    const d = new Date(schedule.date)
    if (!schedule.isSuper) {
      d.setDate(d.getDate() - 1) // miércoles → martes
      await updateDoc(ref, { isSuper: true, dayType: 'Martes', date: d.toISOString() })
    } else {
      d.setDate(d.getDate() + 1) // martes → miércoles
      await updateDoc(ref, { isSuper: false, dayType: 'Miércoles', date: d.toISOString() })
    }
  }

  async function toggleEspecial(schedule) {
    const ref = doc(db, 'schedules', schedule.id)
    const d = new Date(schedule.date)
    if (!schedule.isEspecial) {
      d.setDate(d.getDate() - 1) // domingo → sábado
      await updateDoc(ref, { isEspecial: true, dayType: 'Sábado', date: d.toISOString() })
    } else {
      d.setDate(d.getDate() + 1) // sábado → domingo
      await updateDoc(ref, { isEspecial: false, dayType: 'Domingo', date: d.toISOString() })
    }
  }

  if (!schedules.length) {
    return (
      <div className="text-center py-16 text-slate-400">
        <div className="text-5xl mb-3">📅</div>
        <p className="font-medium">No hay horario generado</p>
        <p className="text-sm mt-1">El coordinador puede generar el horario del mes</p>
      </div>
    )
  }

  const sectionEntries = Object.entries(SECTIONS)

  return (
    <>
      {/* Vista escritorio */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-3 bg-slate-100 rounded-tl-lg border-b border-slate-200 w-28">Fecha</th>
              {sectionEntries.map(([sec, { label, cols }]) => (
                cols.map((col, i) => {
                  const role = ROLES.find(r => r.key === col)
                  return (
                    <th key={col} className={`p-2 text-xs font-semibold border-b border-slate-200 ${
                      sec === 'audioVideo' ? 'bg-blue-50 text-blue-800' :
                      sec === 'acomodadores' ? 'bg-green-50 text-green-800' :
                      'bg-amber-50 text-amber-800'
                    } ${i === 0 ? 'border-l-2 border-l-slate-300' : ''}`}>
                      {role?.label}
                    </th>
                  )
                })
              ))}
              {isCoordinator && <th className="p-2 bg-slate-100 rounded-tr-lg border-b border-slate-200 w-20 text-xs">Acciones</th>}
            </tr>
            <tr>
              <th className="p-1 bg-slate-100 border-b border-slate-200" />
              {sectionEntries.map(([sec, { label, cols }]) => (
                <th
                  key={sec}
                  colSpan={cols.length}
                  className={`p-1 text-xs font-bold text-center border-b border-l-2 border-l-slate-300 border-slate-200 ${
                    sec === 'audioVideo' ? 'bg-blue-100 text-blue-900' :
                    sec === 'acomodadores' ? 'bg-green-100 text-green-900' :
                    'bg-amber-100 text-amber-900'
                  }`}
                >
                  {label}
                </th>
              ))}
              {isCoordinator && <th className="p-1 bg-slate-100 border-b border-slate-200" />}
            </tr>
          </thead>
          <tbody>
            {schedules.map((sched) => {
              const d = new Date(sched.date)
              const dayStr = sched.dayType
              const dateStr = formatDateShort(sched.date)
              const isSunday = sched.dayType === 'Domingo'

              return (
                <tr
                  key={sched.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 ${isSunday ? 'font-semibold' : ''}`}
                >
                  <td className={`p-2 text-xs ${isSunday ? 'text-blue-800' : 'text-slate-600'}`}>
                    <div className="font-semibold">{dayStr}</div>
                    <div>{dateStr}</div>
                  </td>

                  {sectionEntries.map(([sec, { cols }]) =>
                    cols.map((col, i) => {
                      const pid = sched.assignments?.[col]
                      const name = sched.isAssamblea ? 'Asamblea' : personName(pid)
                      const mine = !sched.isAssamblea && isMe(pid)
                      return (
                        <td
                          key={col}
                          className={`p-2 text-xs text-center ${i === 0 ? 'border-l-2 border-l-slate-200' : ''} ${
                            sched.isAssamblea ? 'bg-slate-100 text-slate-500 italic' : ''
                          } ${mine ? 'bg-yellow-50' : ''}`}
                        >
                          {!sched.isAssamblea && isCoordinator ? (
                            <button
                              onClick={() => setEditing({ schedule: sched, roleKey: col })}
                              className={`hover:text-blue-600 hover:underline text-left w-full ${pid ? 'text-slate-700' : 'text-red-400'} ${mine ? 'text-yellow-700 font-bold' : ''}`}
                              title="Clic para cambiar"
                            >
                              {name || '—'}
                            </button>
                          ) : (
                            <span className={mine ? 'font-bold text-yellow-700' : ''}>{name}</span>
                          )}
                        </td>
                      )
                    })
                  )}

                  {isCoordinator && (
                    <td className="p-2 text-center space-y-1">
                      <div>
                        <button
                          onClick={() => toggleAssamblea(sched)}
                          title={sched.isAssamblea ? 'Quitar Asamblea' : 'Marcar como Asamblea'}
                          className={`text-xs px-2 py-1 rounded ${sched.isAssamblea ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                        >
                          {sched.isAssamblea ? '↩' : 'Asam.'}
                        </button>
                      </div>
                      {(sched.dayType === 'Miércoles' || sched.isSuper) && (
                        <div>
                          <button
                            onClick={() => toggleSuper(sched)}
                            title={sched.isSuper ? 'Volver a Miércoles' : 'Cambiar a Martes (Super)'}
                            className={`text-xs px-2 py-1 rounded ${sched.isSuper ? 'bg-amber-200 text-amber-700 hover:bg-amber-300' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}
                          >
                            {sched.isSuper ? '↩' : 'Super'}
                          </button>
                        </div>
                      )}
                      {(sched.dayType === 'Domingo' || sched.isEspecial) && (
                        <div>
                          <button
                            onClick={() => toggleEspecial(sched)}
                            title={sched.isEspecial ? 'Volver a Domingo' : 'Cambiar a Sábado (Especial)'}
                            className={`text-xs px-2 py-1 rounded ${sched.isEspecial ? 'bg-purple-200 text-purple-700 hover:bg-purple-300' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
                          >
                            {sched.isEspecial ? '↩' : 'Especial'}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Vista móvil: tarjetas */}
      <div className="lg:hidden space-y-3">
        {schedules.map(sched => {
          const isSunday = sched.dayType === 'Domingo'
          return (
            <div key={sched.id} className={`rounded-xl border ${isSunday ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'} overflow-hidden`}>
              <div className={`px-4 py-2 flex items-center justify-between ${isSunday ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                <span className="font-bold text-sm">{sched.dayType} {formatDateShort(sched.date)}</span>
                {isCoordinator && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => toggleAssamblea(sched)}
                      className={`text-xs px-2 py-0.5 rounded ${isSunday ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {sched.isAssamblea ? '↩' : 'Asam.'}
                    </button>
                    {(sched.dayType === 'Miércoles' || sched.isSuper) && (
                      <button
                        onClick={() => toggleSuper(sched)}
                        className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700"
                      >
                        {sched.isSuper ? '↩' : 'Super'}
                      </button>
                    )}
                    {(sched.dayType === 'Domingo' || sched.isEspecial) && (
                      <button
                        onClick={() => toggleEspecial(sched)}
                        className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700"
                      >
                        {sched.isEspecial ? '↩' : 'Especial'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {sched.isAssamblea ? (
                <div className="p-4 text-center text-slate-500 italic text-sm">Asamblea</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-3">
                  {ROLES.map(role => {
                    const pid = sched.assignments?.[role.key]
                    const name = personName(pid)
                    const mine = isMe(pid)
                    return (
                      <div key={role.key} className={`rounded-lg p-2 ${mine ? 'bg-yellow-50 border border-yellow-300' : 'bg-slate-50'}`}>
                        <p className="text-xs text-slate-400 mb-0.5">{role.label}</p>
                        {isCoordinator ? (
                          <button
                            onClick={() => setEditing({ schedule: sched, roleKey: role.key })}
                            className={`text-xs font-medium text-left w-full ${pid ? (mine ? 'text-yellow-700' : 'text-slate-700') : 'text-red-400'} hover:underline`}
                          >
                            {name || '—'}
                          </button>
                        ) : (
                          <p className={`text-xs font-medium ${mine ? 'text-yellow-700' : 'text-slate-700'}`}>
                            {name || '—'}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal de cambio */}
      {editing && (
        <ChangeModal
          schedule={editing.schedule}
          roleKey={editing.roleKey}
          people={people}
          allSchedules={allSchedules}
          onConfirm={handleChange}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

export default memo(ScheduleTable)
