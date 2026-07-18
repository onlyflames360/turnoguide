/**
 * Muestra u oculta el número de no leídos en el icono de la app (PWA instalada).
 * Usa la App Badging API; si el navegador no la soporta, no hace nada.
 */
export function updateAppBadge(count) {
  try {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return
    if (count > 0) navigator.setAppBadge(count).catch(() => {})
    else navigator.clearAppBadge().catch(() => {})
  } catch {
    /* no soportado */
  }
}
