import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Borra las respuestas anteriores de una misma persona para el mismo turno y
 * puesto, junto con las solicitudes de sustitución que colgaran de ellas.
 *
 * Se llama justo antes de guardar una respuesta nueva: así el registro se sigue
 * creando con addDoc —y las funciones del servidor, que escuchan la creación,
 * siguen mandando el aviso— pero nunca se acumula más de una respuesta viva por
 * hueco.
 *
 * Las respuestas ya resueltas no se tocan: son historial.
 */
export async function removePreviousResponses({ scheduleId, roleKey, personId }) {
  if (!scheduleId || !roleKey || !personId) return

  try {
    const previous = await getDocs(query(
      collection(db, 'responses'),
      where('scheduleId', '==', scheduleId),
      where('roleKey', '==', roleKey),
      where('personId', '==', personId),
    ))

    for (const d of previous.docs) {
      if (d.data().resolved) continue

      const sols = await getDocs(query(
        collection(db, 'solicitudes'),
        where('responseId', '==', d.id),
      ))
      await Promise.all(sols.docs.map(s => deleteDoc(s.ref)))
      await deleteDoc(d.ref)
    }
  } catch (e) {
    // La limpieza es secundaria: si falla (sin conexión, por ejemplo) la
    // respuesta del usuario debe guardarse igualmente.
    console.warn('No se pudieron limpiar respuestas previas:', e)
  }
}
