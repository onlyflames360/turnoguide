import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-gradient-to-r from-blue-700 to-blue-600 shadow-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="TurnoGuide" className="h-8 w-8 object-contain rounded-md bg-white p-0.5" />
          <div>
            <span className="text-white font-bold text-base leading-none">TurnoGuide</span>
            <p className="text-blue-200 text-xs leading-none">Villajoyosa</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
