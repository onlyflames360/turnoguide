/**
 * Mensaje de asistencia para compartir por WhatsApp.
 *
 * El formato lo fijó el coordinador y se reproduce literal, asimetría
 * incluida: "Presencial:68." va sin espacio tras los dos puntos y
 * "Total: 99." sí lo lleva. No lo "arregles" sin preguntarle.
 *
 * Asistencia 26/8/26:
 *
 * Presencial:68.
 * Zoom:29.
 *
 * Total: 99.
 *
 * @param {string|Date} date - fecha de la reunión
 * @param {number|string} presencial
 * @param {number|string} zoom
 */
export function buildAttendanceMessage(date, presencial, zoom) {
  const d = new Date(date)
  const p = Number(presencial) || 0
  const z = Number(zoom) || 0
  // Día y mes sin cero delante, año a dos cifras
  const fecha = `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`
  return `Asistencia ${fecha}:\n\nPresencial:${p}.\nZoom:${z}.\n\nTotal: ${p + z}.`
}

/**
 * Enlace de WhatsApp con el texto ya escrito. Sin número de teléfono:
 * WhatsApp abre el selector de chat y el destinatario lo elige el usuario.
 * En móvil abre la app; en escritorio, WhatsApp Web.
 */
export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
