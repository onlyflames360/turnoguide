import { useEffect, useRef } from 'react'

/**
 * Acuse de recibo dentro de la app. Se muestra mientras `toast` tenga valor y
 * se cierra solo pasado `duration`.
 *
 * toast: null | { text: string, tone?: 'ok' | 'alert' }
 */
export default function Toast({ toast, onClose, duration = 3000 }) {
  // El padre suele pasar una función nueva en cada render; guardarla en una ref
  // evita que el temporizador se reinicie en bucle.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => onCloseRef.current?.(), duration)
    return () => clearTimeout(t)
  }, [toast, duration])

  if (!toast) return null

  return (
    <div
      className={`toast ${toast.tone === 'alert' ? 'toast-alert' : 'toast-ok'}`}
      role="status"
      aria-live="polite"
      onClick={() => onCloseRef.current?.()}
    >
      <span aria-hidden="true">{toast.tone === 'alert' ? '✗' : '✓'}</span>
      <span>{toast.text}</span>
    </div>
  )
}
