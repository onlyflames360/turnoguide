import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login, createFirstCoordinator } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(false)

  const [userNames, setUserNames] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const pinRef = useRef(null)

  // Carga los nombres de usuarios al montar
  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      setUserNames(snap.docs.map(d => d.data().name).filter(Boolean).sort())
    })
  }, [])

  function handleNameChange(e) {
    const val = e.target.value
    setName(val)
    if (val.trim().length > 0) {
      const filtered = userNames.filter(n =>
        n.toLowerCase().includes(val.toLowerCase())
      )
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }

  function selectSuggestion(n) {
    setName(n)
    setShowSuggestions(false)
    setTimeout(() => pinRef.current?.focus(), 50)
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!name.trim() || !pin.trim()) { setError('Ingresa tu nombre y PIN'); return }
    setLoading(true); setError('')
    try {
      const userData = await login(name, pin)
      navigate(userData.role === 'coordinador' ? '/coordinator' : '/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCheckSetup() {
    setCheckingSetup(true)
    const snap = await getDocs(collection(db, 'users'))
    setShowSetup(snap.empty)
    setCheckingSetup(false)
    if (!snap.empty) setError('Ya hay usuarios registrados. Ingresa con tu nombre y PIN.')
  }

  async function handleSetup(e) {
    e.preventDefault()
    if (!name.trim() || !pin.trim()) { setError('Completa todos los campos'); return }
    setLoading(true); setError('')
    try {
      await createFirstCoordinator(name, pin)
      navigate('/coordinator')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="TurnoGuide"
            className="h-40 w-40 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-white tracking-tight">TurnoGuide</h1>
          <p className="text-blue-200 text-sm mt-1">Turnos de Audio y Acomodadores</p>
          <p className="text-blue-300 text-xs mt-1">Congregación Villajoyosa</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          {!showSetup ? (
            <>
              <h2 className="text-lg font-bold text-slate-800 mb-5 text-center">Iniciar sesión</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Nombre</label>
                  <div className="relative">
                    <input
                      className="input"
                      type="text"
                      placeholder="Tu nombre completo"
                      value={name}
                      onChange={handleNameChange}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      onFocus={() => name.trim() && suggestions.length && setShowSuggestions(true)}
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
                  <label className="text-sm font-medium text-slate-700 block mb-1">PIN</label>
                  <input
                    ref={pinRef}
                    className="input"
                    type="password"
                    placeholder="Tu PIN"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    autoComplete="current-password"
                    maxLength={10}
                  />
                </div>
                {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400 mb-2">¿Primera vez usando la app?</p>
                <button
                  onClick={handleCheckSetup}
                  className="text-xs text-blue-600 hover:underline"
                  disabled={checkingSetup}
                >
                  {checkingSetup ? 'Comprobando...' : 'Configuración inicial'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-pink-100 rounded-full mb-3">
                  <span className="text-2xl">🎉</span>
                </div>
                <h2 className="text-lg font-bold text-slate-800">Crear cuenta de coordinador</h2>
                <p className="text-slate-500 text-sm mt-1">Sé el primer coordinador de la congregación</p>
              </div>
              <form onSubmit={handleSetup} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Tu nombre</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Nombre completo"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Crear PIN</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Elige un PIN"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    maxLength={10}
                  />
                </div>
                {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" className="btn-pink w-full" disabled={loading}>
                  {loading ? 'Creando...' : 'Crear coordinador'}
                </button>
              </form>
              <button
                onClick={() => { setShowSetup(false); setError('') }}
                className="w-full mt-3 text-sm text-slate-500 hover:text-slate-700"
              >
                ← Volver al login
              </button>
            </>
          )}
        </div>

        <p className="text-center text-blue-200 text-xs mt-6">
          IMPORTANTE: Llega 30 min antes de la reunión
        </p>
      </div>
    </div>
  )
}
