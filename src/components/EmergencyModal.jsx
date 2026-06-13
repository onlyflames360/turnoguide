import { useEffect } from 'react'

export default function EmergencyModal({ emergency, onClose }) {
  useEffect(() => {
    if (!emergency) return
    // Vibrar el dispositivo si está disponible
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300])
    // Cerrar automáticamente después de 60 segundos
    const t = setTimeout(onClose, 60_000)
    return () => clearTimeout(t)
  }, [emergency, onClose])

  if (!emergency) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.80)' }}
      onClick={onClose}
    >
      {/* Pulso de fondo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ animation: 'emergencyFlash 1s ease-in-out 3' }}
      />

      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg,#dc2626,#7f1d1d)',
          boxShadow: '0 0 60px rgba(220,38,38,0.6), 0 24px 48px rgba(0,0,0,0.6)',
          animation: 'emergencySlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Barra superior pulsante */}
        <div className="h-1.5 w-full" style={{ background: 'rgba(255,255,255,0.3)', animation: 'emergencyPulse 0.8s ease-in-out infinite' }} />

        <div className="px-6 py-8 text-center">
          {/* Icono */}
          <div
            className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', animation: 'emergencyPulse 1s ease-in-out infinite' }}
          >
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
          </div>

          {/* Título */}
          <p className="text-white/70 text-xs font-black uppercase tracking-[0.2em] mb-1">
            Alerta de emergencia
          </p>
          <h1 className="text-white text-4xl font-black mb-2" style={{ letterSpacing: '-0.03em' }}>
            🚨 {emergency.roleLabel}
          </h1>
          <p className="text-white/80 text-base font-semibold mb-1">
            Activada por <span className="text-white font-black">{emergency.senderName}</span>
          </p>
          <p className="text-white/60 text-sm mb-8">
            Acudir inmediatamente a {emergency.roleLabel}
          </p>

          {/* Botón cerrar */}
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl font-bold text-red-700 text-base transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.95)' }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
