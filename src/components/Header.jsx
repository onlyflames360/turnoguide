import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { registerFCM } from '../firebase/messaging'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pushStatus, setPushStatus] = useState('unknown') // 'on' | 'off' | 'blocked' | 'unknown'

  useEffect(() => {
    if (!('Notification' in window)) { setPushStatus('off'); return }
    if (Notification.permission === 'denied') { setPushStatus('blocked'); return }
    if (Notification.permission === 'granted') { setPushStatus('on'); return }
    setPushStatus('off')
  }, [])

  async function handleEnablePush() {
    if (!user?.id) return
    setPushStatus('unknown')
    const token = await registerFCM(user.id)
    setPushStatus(token ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off')
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-gradient-to-r from-blue-700 to-blue-600 shadow-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="TurnoGuide" className="h-9 w-9 object-contain" />
          <div>
            <span className="text-white font-bold text-base leading-none">TurnoGuide</span>
            <p className="text-blue-200 text-xs leading-none">Villajoyosa</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Indicador push */}
          {pushStatus === 'on' && (
            <span title="Notificaciones push activas" className="text-green-300 text-lg">🔔</span>
          )}
          {pushStatus === 'off' && (
            <button
              onClick={handleEnablePush}
              title="Activar notificaciones push"
              className="text-yellow-300 hover:text-white text-lg transition-colors"
            >
              🔕
            </button>
          )}
          {pushStatus === 'blocked' && (
            <span title="Notificaciones bloqueadas en el navegador" className="text-red-300 text-lg">🚫</span>
          )}

          <div className="text-right hidden sm:block">
            <p className="text-white text-sm font-medium leading-none">{user?.name}</p>
            <span className={user?.role === 'coordinador' ? 'badge-coord' : 'badge-user'}>
              {user?.role === 'coordinador' ? 'Coordinador' : 'Usuario'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-blue-200 hover:text-white text-sm border border-blue-400 hover:border-white rounded-lg px-3 py-1 transition-colors"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}
