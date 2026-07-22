import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from './config'

const VAPID_KEY = import.meta.env.VITE_VAPID_KEY

let messaging = null

function getMsg() {
  if (!messaging) messaging = getMessaging()
  return messaging
}

/** Registra el service worker y obtiene el token FCM. Lo guarda en Firestore. */
export async function registerFCM(userId) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    const token = await getToken(getMsg(), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })

    if (token && userId) {
      await updateDoc(doc(db, 'users', userId), { fcmToken: token })
    }
    return token
  } catch (e) {
    console.warn('FCM registration error:', e)
    return null
  }
}

/** Escucha mensajes cuando la app está en primer plano */
export function onForegroundMessage(callback) {
  try {
    return onMessage(getMsg(), callback)
  } catch {
    return () => {}
  }
}
