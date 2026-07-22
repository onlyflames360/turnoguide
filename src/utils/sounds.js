/**
 * Sonidos cortos generados con Web Audio. Sin archivos: no pesan, no hay que
 * esperar a que carguen y funcionan sin conexión.
 */

const STORAGE_KEY = 'tg_sound'

let ctx = null

export function isSoundEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Modo privado o almacenamiento lleno: el sonido sigue funcionando en esta
    // sesión, solo se pierde la preferencia.
  }
}

/**
 * El contexto se crea al primer toque, no al cargar la página: los
 * navegadores móviles solo permiten arrancar audio dentro de un gesto real.
 */
function getCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  try {
    if (!ctx) ctx = new AudioCtx()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Una nota con entrada y salida suaves, para que no chasquee. */
function tone(c, { freq, endFreq, start, duration, peak = 0.16, type = 'sine' }) {
  const osc = c.createOscillator()
  const gain = c.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration)

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(gain).connect(c.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Dos notas ascendentes: confirmación. */
export function playPuedo() {
  if (!isSoundEnabled()) return
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  tone(c, { freq: 660, start: t, duration: 0.10 })
  tone(c, { freq: 990, start: t + 0.09, duration: 0.14 })
}

/** Una nota grave que cae: rechazo. */
export function playNoPuedo() {
  if (!isSoundEnabled()) return
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  tone(c, { freq: 320, endFreq: 180, start: t, duration: 0.22, peak: 0.18, type: 'triangle' })
}
