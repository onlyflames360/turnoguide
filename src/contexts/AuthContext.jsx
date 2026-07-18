import { createContext, useContext, useState, useEffect } from 'react'
import { collection, getDocs, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db, auth, app } from '../firebase/config'
import { registerFCM } from '../firebase/messaging'
import { updateAppBadge } from '../utils/appBadge'

const AuthContext = createContext(null)

// La Cloud Function 'login' está desplegada en europe-west1
const functions = getFunctions(app, 'europe-west1')
const loginCallable = httpsCallable(functions, 'login')

export function AuthProvider({ children }) {
  // Cache optimista (nunca con pin) para evitar parpadeo mientras Firebase resuelve
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tg_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      localStorage.removeItem('tg_user')
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  /**
   * Relee el documento de usuario desde Firestore (SIN el pin), actualiza el
   * estado y cachea en localStorage. Se usa tras el login y al restaurar sesión.
   */
  async function hydrate(uid) {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return null
    // Nunca guardar el pin en el cliente
    const { pin, ...safe } = snap.data()  // eslint-disable-line no-unused-vars
    const fresh = { id: snap.id, ...safe }
    setUser(fresh)
    localStorage.setItem('tg_user', JSON.stringify(fresh))
    registerFCM(fresh.id).catch(() => {})
    return fresh
  }

  // Restauración de sesión vía Firebase Auth (fuente de verdad)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        await hydrate(fbUser.uid).catch(() => {})
      } else {
        setUser(null)
        localStorage.removeItem('tg_user')
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function login(name, pin) {
    try {
      const res = await loginCallable({ name: name.trim(), pin: pin.trim() })
      const { token, user: basicUser } = res.data
      await signInWithCustomToken(auth, token)
      // onAuthStateChanged también hidratará; hidratamos ya para devolver el rol
      const fresh = await hydrate(basicUser.id).catch(() => null)
      return fresh ?? basicUser
    } catch (e) {
      // Traducir errores de la Cloud Function al mensaje que la UI ya muestra
      const code = e?.code || ''
      if (code.includes('unauthenticated') || code.includes('invalid-argument')) {
        throw new Error('Nombre o PIN incorrecto')
      }
      throw new Error(e?.message || 'No se pudo iniciar sesión')
    }
  }

  async function updateUser(updates) {
    if (!user?.id) return
    await updateDoc(doc(db, 'users', user.id), updates)
    const updated = { ...user, ...updates }
    setUser(updated)
    localStorage.setItem('tg_user', JSON.stringify(updated))
  }

  async function logout() {
    updateAppBadge(0)
    await signOut(auth).catch(() => {})
    setUser(null)
    localStorage.removeItem('tg_user')
  }

  async function createFirstCoordinator(name, pin) {
    const snap = await getDocs(collection(db, 'users'))
    if (!snap.empty) throw new Error('Ya existen usuarios. Pide al coordinador que te añada.')

    await addDoc(collection(db, 'users'), {
      name: name.trim(),
      pin: pin.trim(),
      role: 'coordinador',
      createdAt: serverTimestamp(),
    })
    // Iniciar sesión con el usuario recién creado vía la misma Cloud Function
    // (así queda una sesión real de Firebase Auth y no se guarda el pin en cliente)
    return login(name, pin)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, createFirstCoordinator, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
