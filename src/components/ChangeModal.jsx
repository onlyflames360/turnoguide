import { useState } from 'react'
import { ROLES, suggestReplacements } from '../utils/scheduleGenerator'

export default function ChangeModal({ schedule, roleKey, people, allSchedules, onConfirm, onClose }) {
  const role = ROLES.find(r => r.key === roleKey)
  const currentPersonId = schedule.assignments?.[roleKey]
  const currentPerson = people.find(p => p.id === currentPersonId)

  const [mode, setMode] = useState('smart') // 'smart' | 'manual'
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')

  const suggestions = suggestReplacements(
    roleKey, currentPersonId, schedule.assignments || {}, people, allSchedules
  )

  const manualList = people
    .filter(p =>
      p.active !== false &&
      p.id !== currentPersonId &&
      p.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  const displayList = mode === 'smart' ? suggestions : manualList
  const hasSkill = (p) => p.skills?.includes(roleKey)

  function handleConfirm() {
    if (!selectedId) return
    onConfirm(roleKey, selectedId)
  }

  function handleRemove() {
    onConfirm(roleKey, null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-600 rounded-t-2xl p-4 text-white">
          <h3 className="font-bold text-lg">Cambiar asignación</h3>
          <p className="text-blue-200 text-sm">
            {role?.label} · {new Date(schedule.date).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' })}
          </p>
        </div>

        <div className="p-5">
          {/* Actual */}
          <div className="bg-slate-50 rounded-lg p-3 mb-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
              {currentPerson?.name?.[0] ?? '?'}
            </div>
            <div>
              <p className="text-xs text-slate-500">Asignado actualmente</p>
              <p className="text-sm font-semibold text-slate-800">{currentPerson?.name ?? 'Sin asignar'}</p>
            </div>
          </div>

          {/* Modo */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setMode('smart'); setSelectedId('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'smart' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              ✨ Sugerencia inteligente
            </button>
            <button
              onClick={() => { setMode('manual'); setSelectedId('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Manual
            </button>
          </div>

          {mode === 'smart' && (
            <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
              <span>ℹ️</span> Ordenado por menor carga · solo personas con habilidad en este rol
            </p>
          )}

          {mode === 'manual' && (
            <input
              className="input mb-3"
              placeholder="Buscar persona..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          )}

          {/* Lista */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {displayList.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-4">
                {mode === 'smart' ? 'No hay sustitutos disponibles con este rol' : 'No se encontraron personas'}
              </p>
            )}
            {displayList.map(p => {
              const skilled = hasSkill(p)
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(selectedId === p.id ? '' : p.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                    selectedId === p.id
                      ? 'bg-blue-50 border-2 border-blue-400'
                      : 'border border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                    {p.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    {!skilled && mode === 'manual' && (
                      <p className="text-xs text-amber-600">⚠️ Sin habilidad en {role?.label}</p>
                    )}
                  </div>
                  {selectedId === p.id && <span className="text-blue-600">✓</span>}
                </button>
              )
            })}
          </div>

          {/* Acciones */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            {currentPersonId && (
              <button onClick={handleRemove} className="btn-danger px-3 py-2 text-sm rounded-lg">
                Quitar
              </button>
            )}
            <button
              onClick={handleConfirm}
              className="btn-primary flex-1"
              disabled={!selectedId}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
