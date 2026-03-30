import { useState } from 'react'
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'

export default function UserManager({ users, onRefresh }) {
  const { user: me } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', pin: '', role: 'usuario' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function resetForm() { setForm({ name: '', pin: '', role: 'usuario' }); setEditing(null); setShowForm(false); setError('') }

  function startEdit(u) {
    setEditing(u)
    setForm({ name: u.name, pin: u.pin || '', role: u.role })
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    if (!editing && !form.pin.trim()) { setError('El PIN es obligatorio para nuevos usuarios'); return }
    setLoading(true); setError('')
    try {
      if (editing) {
        const update = { name: form.name.trim(), role: form.role }
        if (form.pin.trim()) update.pin = form.pin.trim()
        await updateDoc(doc(db, 'users', editing.id), update)
      } else {
        await addDoc(collection(db, 'users'), {
          name: form.name.trim(),
          pin: form.pin.trim(),
          role: form.role,
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

  async function handleDelete(u) {
    if (u.id === me?.id) { alert('No puedes eliminarte a ti mismo'); return }
    if (!confirm(`¿Eliminar usuario ${u.name}?`)) return
    await deleteDoc(doc(db, 'users', u.id))
    onRefresh?.()
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary text-sm">
          + Añadir usuario
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 border-2 border-pink-200">
          <h4 className="font-bold text-slate-800 mb-4">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h4>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Nombre</label>
              <input className="input" placeholder="Nombre completo" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                PIN {editing && <span className="text-slate-400 font-normal">(dejar vacío para no cambiar)</span>}
              </label>
              <input className="input" type="password" placeholder="PIN de acceso" value={form.pin}
                onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} maxLength={10} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Rol</label>
              <div className="flex gap-2">
                {[
                  { value: 'usuario', label: '👤 Usuario', active: 'bg-blue-600 text-white' },
                  { value: 'ayudante', label: '🤝 Ayudante', active: 'bg-amber-500 text-white' },
                  { value: 'coordinador', label: '👑 Coordinador', active: 'bg-pink-500 text-white' },
                ].map(({ value, label, active }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, role: value }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      form.role === value ? active : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={resetForm} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" className="btn-primary flex-1" disabled={loading}>
                {loading ? 'Guardando...' : (editing ? 'Guardar' : 'Crear usuario')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {users.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <div className="text-4xl mb-2">🔑</div>
            <p>No hay usuarios</p>
          </div>
        )}
        {users.map(u => (
          <div key={u.id} className={`flex items-center gap-3 p-3 rounded-xl border bg-white border-slate-200 ${u.id === me?.id ? 'border-blue-300 bg-blue-50' : ''}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0 ${
              u.role === 'coordinador' ? 'bg-gradient-to-br from-pink-500 to-pink-600'
              : u.role === 'ayudante' ? 'bg-gradient-to-br from-amber-400 to-amber-600'
              : 'bg-gradient-to-br from-blue-500 to-blue-600'
            }`}>
              {u.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-800 text-sm truncate">{u.name}</p>
                {u.id === me?.id && <span className="text-xs text-blue-500">(tú)</span>}
              </div>
              <span className={u.role === 'coordinador' ? 'badge-coord' : u.role === 'ayudante' ? 'badge-ayudante' : 'badge-user'}>
                {u.role === 'coordinador' ? '👑 Coordinador' : u.role === 'ayudante' ? '🤝 Ayudante' : '👤 Usuario'}
              </span>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => startEdit(u)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
                ✏️
              </button>
              {u.id !== me?.id && (
                <button onClick={() => handleDelete(u)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
