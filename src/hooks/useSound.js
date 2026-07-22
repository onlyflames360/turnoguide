import { useState } from 'react'
import { isSoundEnabled, setSoundEnabled, playPuedo } from '../utils/sounds'

/** Preferencia de sonido para el interruptor del header. */
export function useSound() {
  const [soundOn, setSoundOn] = useState(isSoundEnabled)

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    setSoundEnabled(next)
    // Al encenderlo suena una vez, para saber que ha quedado activo y a qué
    // volumen. El toque del botón sirve de gesto para arrancar el audio.
    if (next) playPuedo()
  }

  return { soundOn, toggleSound }
}
