import { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'

export default function EmergencyButton({ roleKey, roleLabel }) {
  const { user } = useAuth()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleClick() {
    if (sending || sent) return
    const ok = window.confirm(
      `⚠️ ALERTA DE EMERGENCIA\n\n¿Activar emergencia en ${roleLabel}?\n\nSe notificará a TODOS los usuarios inmediatamente.`
    )
    if (!ok) return

    setSending(true)
    try {
      await addDoc(collection(db, 'emergencias'), {
        roleKey,
        roleLabel,
        senderName: user?.name ?? 'Desconocido',
        createdAt: serverTimestamp(),
      })
      setSent(true)
      // Resetear después de 2 minutos para permitir reenvío
      setTimeout(() => setSent(false), 120_000)
    } catch {
      alert('Error al enviar la alerta. Inténtalo de nuevo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleClick}
        disabled={sending}
        aria-label={`Emergencia ${roleLabel}`}
        className="relative flex items-center justify-center rounded-full text-white font-black transition-all active:scale-90 disabled:opacity-60 select-none"
        style={{
          width: 80,
          height: 80,
          background: sent
            ? 'linear-gradient(135deg,#6b7280,#4b5563)'
            : 'linear-gradient(135deg,#dc2626,#991b1b)',
          boxShadow: sent
            ? '0 4px 16px rgba(0,0,0,0.3)'
            : '0 0 0 0 rgba(220,38,38,0.5), 0 6px 24px rgba(220,38,38,0.5)',
          animation: sent || sending ? 'none' : 'emergencyPulse 1.8s ease-in-out infinite',
        }}
      >
        {sending ? (
          <svg className="animate-spin w-7 h-7" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
          </svg>
        ) : sent ? (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        ) : (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        )}
      </button>
      <div className="text-center">
        <p className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-wider leading-tight">
          {sent ? '✓ Enviado' : 'EMERGENCIA'}
        </p>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{roleLabel}</p>
      </div>
    </div>
  )
}
