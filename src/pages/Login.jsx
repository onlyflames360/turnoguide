import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  )
}

function ErrorMessage({ text }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-3.5 py-3">
      <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
      <p className="text-red-600 text-sm">{text}</p>
    </div>
  )
}

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
    <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-blue-900
                    flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-in">

        {/* Logo y título */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="TurnoGuide"
            className="h-40 w-40 mx-auto mb-4 drop-shadow-lg"
            style={{ mixBlendMode: 'multiply' }}
          />
          <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-sm">
            TurnoGuide
          </h1>
          <p className="text-blue-200 text-sm mt-1.5">Turnos de Audio y Acomodadores</p>
          <p className="text-blue-300/80 text-xs mt-0.5">Congregación Villajoyosa</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl shadow-blue-900/30 p-7
                        ring-1 ring-white/50">
          {!showSetup ? (
            <>
              <h2 className="text-lg font-bold text-slate-800 mb-5 text-center tracking-tight">
                Iniciar sesión
              </h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-600 block mb-1.5">
                    Nombre
                  </label>
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
                      <ul className="absolute z-10 w-full mt-1.5 bg-white border border-slate-200
                                     rounded-2xl shadow-xl shadow-slate-900/10 overflow-hidden">
                        {suggestions.map(n => (
                          <li
                            key={n}
                            onMouseDown={() => selectSuggestion(n)}
                            className="flex items-center gap-3 px-4 py-3
                                       hover:bg-blue-50 cursor-pointer transition-colors
                                       border-b border-slate-50 last:border-0"
                          >
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center
                                            justify-center text-blue-700 font-bold text-xs shrink-0">
                              {n[0]}
                            </div>
                            <span className="text-sm text-slate-700">{n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-600 block mb-1.5">PIN</label>
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

                {error && <ErrorMessage text={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm
                             bg-gradient-to-r from-blue-600 to-blue-700
                             hover:from-blue-700 hover:to-blue-800
                             active:scale-95 transition-all duration-150
                             shadow-md shadow-blue-600/25
                             disabled:opacity-60 disabled:active:scale-100
                             flex items-center justify-center gap-2"
                >
                  {loading ? <><SpinnerIcon /> Entrando...</> : 'Entrar'}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400 mb-2">¿Primera vez usando la app?</p>
                <button
                  onClick={handleCheckSetup}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium
                             hover:underline transition-colors disabled:opacity-50"
                  disabled={checkingSetup}
                >
                  {checkingSetup ? 'Comprobando...' : 'Configuración inicial'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12
                                bg-gradient-to-br from-pink-100 to-pink-200
                                rounded-2xl mb-3 shadow-sm">
                  <span className="text-2xl">🎉</span>
                </div>
                <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                  Crear cuenta de coordinador
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  Sé el primer coordinador de la congregación
                </p>
              </div>

              <form onSubmit={handleSetup} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-600 block mb-1.5">
                    Tu nombre
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Nombre completo"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600 block mb-1.5">
                    Crear PIN
                  </label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Elige un PIN"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    maxLength={10}
                  />
                </div>

                {error && <ErrorMessage text={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm
                             bg-gradient-to-r from-pink-500 to-pink-600
                             hover:from-pink-600 hover:to-pink-700
                             active:scale-95 transition-all duration-150
                             shadow-md shadow-pink-500/25
                             disabled:opacity-60 disabled:active:scale-100
                             flex items-center justify-center gap-2"
                >
                  {loading ? <><SpinnerIcon /> Creando...</> : 'Crear coordinador'}
                </button>
              </form>

              <button
                onClick={() => { setShowSetup(false); setError('') }}
                className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600
                           transition-colors font-medium"
              >
                ← Volver al login
              </button>
            </>
          )}
        </div>

        <p className="text-center text-blue-200/80 text-xs mt-6">
          IMPORTANTE: Llega 30 min antes de la reunión
        </p>
      </div>
    </div>
  )
}
