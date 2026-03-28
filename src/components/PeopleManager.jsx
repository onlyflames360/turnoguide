import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, doc, updateDoc, deleteDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { ROLES } from '../utils/scheduleGenerator'

export default function PeopleManager({ people, onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', skills: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [userNames, setUserNames] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const nameInputRef = useRef(null)

  // Carga nombres de usuarios registrados para sugerirlos
  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      setUserNames(snap.docs.map(d => d.data().name).filter(Boolean).sort())
    })
  }, [])

  function resetForm() { setForm({ name: '', skills: [] }); setEditing(null); setShowForm(false); setError(''); setSuggestions([]); setShowSuggestions(false) }

  function toggleSkill(key) {
    setForm(f => ({
      ...f,
      skills: f.skills.includes(key) ? f.skills.filter(s => s !== key) : [...f.skills, key]
    }))
  }

  function startEdit(person) {
    setEditing(person)
    setForm({ name: person.name, skills: person.skills || [] })
    setShowForm(true)
  }

  function handleNameChange(e) {
    const val = e.target.value
    setForm(f => ({ ...f, name: val }))
    if (val.trim().length > 0) {
      // Sugerir nombres de usuarios que no son ya personas
      const existingNames = people.map(p => p.name.toLowerCase())
      const filtered = userNames.filter(n =>
        n.toLowerCase().includes(val.toLowerCase()) &&
        !existingNames.includes(n.toLowerCase())
      )
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }

  function selectSuggestion(n) {
    setForm(f => ({ ...f, name: n }))
    setShowSuggestions(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.skills.length) { setError('Elige al menos una habilidad'); return }
    setLoading(true); setError('')
    try {
      if (editing) {
        await updateDoc(doc(db, 'people', editing.id), {
          name: form.name.trim(),
          skills: form.skills,
        })
      } else {
        await addDoc(collection(db, 'people'), {
          name: form.name.trim(),
          skills: form.skills,
          active: true,
          createdAt: serverTimestamp(),
        })
      }
      resetForm()
      onRefresh?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive(person) {
    await updateDoc(doc(db, 'people', person.id), { active: !person.active })
    onRefresh?.()
  }

  async function handleDelete(person) {
    if (!confirm(`¿Eliminar a ${person.name}? Esta acción no se puede deshacer.`)) return
    await deleteDoc(doc(db, 'people', person.id))
    onRefresh?.()
  }

  const filtered = people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <input
          className="input max-w-xs"
          placeholder="Buscar persona..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary text-sm whitespace-nowrap">
          + Añadir persona
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 border-2 border-blue-200">
          <h4 className="font-bold text-slate-800 mb-4">{editing ? 'Editar persona' : 'Nueva persona'}</h4>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Nombre completo</label>
              <div className="relative">
                <input
                  ref={nameInputRef}
                  className="input"
                  placeholder="Nombre completo"
                  value={form.name}
                  onChange={handleNameChange}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onFocus={() => form.name.trim() && suggestions.length && setShowSuggestions(true)}
                  autoComplete="off"
                />
                {showSuggestions && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {suggestions.map(n => (
                      <li
                        key={n}
                        onMouseDown={() => selectSuggestion(n)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 cursor-pointer text-sm text-slate-700"
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                          {n[0]}
                        </div>
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Habilidades</label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(role => (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => toggleSkill(role.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      form.skills.includes(role.key)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {role.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={resetForm} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" className="btn-primary flex-1" disabled={loading}>
                {loading ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Añadir')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <div className="text-4xl mb-2">👥</div>
            <p>No hay personas registradas</p>
          </div>
        )}
        {filtered.map(person => (
          <div
            key={person.id}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
              person.active === false ? 'opacity-50 bg-slate-50 border-slate-200' : 'bg-white border-slate-200'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shrink-0">
              {person.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-sm">{person.name}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(person.skills || []).map(sk => {
                  const role = ROLES.find(r => r.key === sk)
                  return (
                    <span key={sk} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {role?.label ?? sk}
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => handleToggleActive(person)}
                className={`text-xs px-2 py-1 rounded-lg ${person.active === false ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
              >
                {person.active === false ? '✓ Activar' : '⏸ Pausar'}
              </button>
              <button onClick={() => startEdit(person)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
                ✏️
              </button>
              <button onClick={() => handleDelete(person)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
