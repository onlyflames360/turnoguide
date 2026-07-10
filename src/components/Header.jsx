import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { registerFCM } from '../firebase/messaging'
import { useTheme } from '../hooks/useTheme'

/* Iconos SVG inline — sin dependencias, tree-shakeable */
function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  )
}

function IconBellOff() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42V16l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12l5.92 9.88z" />
    </svg>
  )
}

function IconBellBlocked() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M17 11c.34 0 .67.03 1 .08V6.87l-1-1V5c0-3.07-1.63-5.64-4.5-6.32V2c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C6.63 3.36 5 5.92 5 9v5l-2 2v1h11.26c-.17-.31-.26-.65-.26-1v-.08c-.31.05-.64.08-.97.08H7v-7c0-2.76 1.35-5 4-5s4 2.24 4 5v1.08c.64-.11 1.31-.08 2-.08zM10 20c0 1.1.9 2 2 2s2-.9 2-2h-4zm8.5-5l1.5 1.5-1.5 1.5L17 16.5 15.5 18 14 16.5l1.5-1.5L14 13.5 15.5 12l1.5 1.5 1.5-1.5 1.5 1.5-1.5 1.5z" />
    </svg>
  )
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7zM2 13h2a1 1 0 0 0 0-2H2a1 1 0 0 0 0 2zm18 0h2a1 1 0 0 0 0-2h-2a1 1 0 0 0 0 2zM11 2v2a1 1 0 0 0 2 0V2a1 1 0 0 0-2 0zm0 18v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-2 0zM5.64 6.36a1 1 0 0 0-1.41-1.41L2.81 6.36a1 1 0 0 0 1.41 1.41zm12.73 12.73a1 1 0 0 0-1.41-1.41l-1.41 1.41a1 1 0 0 0 1.41 1.41zm-1.41-13.32a1 1 0 0 0 1.41-1.41l-1.41-1.41a1 1 0 0 0-1.41 1.41zm-12.73 12.73a1 1 0 0 0 1.41 1.41l1.41-1.41a1 1 0 0 0-1.41-1.41z" />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  )
}

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pushStatus, setPushStatus] = useState('unknown')
  const { isDark, toggle: toggleTheme } = useTheme()

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

  const roleLabel =
    user?.role === 'coordinador'  ? 'Coordinador' :
    user?.role === 'ayudante_av'  ? 'A/V'         :
    user?.role === 'ayudante_ac'  ? 'Acóm.'       :
    user?.role === 'ayudante'     ? 'Ayudante'     : 'Usuario'

  const badgeClass =
    user?.role === 'coordinador'            ? 'badge-coord'    :
    user?.role?.startsWith('ayudante')      ? 'badge-ayudante' : 'badge-user'

  return (
    <header className="glass-header">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">

        {/* Logo + nombre */}
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/hero-avatar.png"
            alt="Recursos AV Villajoyosa"
            className="h-9 w-9 rounded-[10px] object-cover shrink-0"
            style={{ boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}
          />
          <div className="min-w-0">
            <p className="text-slate-900 dark:text-white font-extrabold text-sm leading-none tracking-tight">
              Recursos AV
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs leading-none mt-0.5">Villajoyosa</p>
          </div>
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Indicador notificaciones push */}
          {pushStatus === 'on' && (
            <span
              title="Notificaciones activas"
              className="text-emerald-500 transition-colors"
            >
              <IconBell />
            </span>
          )}
          {pushStatus === 'off' && (
            <button
              onClick={handleEnablePush}
              title="Activar notificaciones push"
              className="text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors
                         active:scale-95 duration-150"
            >
              <IconBellOff />
            </button>
          )}
          {pushStatus === 'blocked' && (
            <span
              title="Notificaciones bloqueadas en el navegador"
              className="text-red-400"
            >
              <IconBellBlocked />
            </span>
          )}

          {/* Botón tema claro/oscuro */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors active:scale-95 duration-150"
            aria-label={isDark ? 'Modo claro' : 'Modo oscuro'}
          >
            {isDark ? <IconSun /> : <IconMoon />}
          </button>

          {/* Nombre + rol (solo desktop) */}
          <div className="text-right hidden sm:block">
            <p className="text-slate-800 dark:text-slate-100 text-sm font-semibold leading-none">
              {user?.name}
            </p>
            <span className={`${badgeClass} mt-0.5 inline-block`}>
              {roleLabel}
            </span>
          </div>

          {/* Avatar con iniciales */}
          {user?.name && (
            <div aria-hidden="true"
                 className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-indigo-600 to-violet-600
                            flex items-center justify-center text-white font-bold text-xs shrink-0 hidden sm:flex"
                 style={{ boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}>
              {user.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
          )}

          {/* Botón salir */}
          <button
            onClick={handleLogout}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
                       text-sm font-medium border border-slate-200 dark:border-slate-600
                       hover:border-slate-300 dark:hover:border-slate-500
                       rounded-xl px-3 py-1.5 ml-1
                       transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-95"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}
