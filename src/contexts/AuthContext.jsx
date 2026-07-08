import { createContext, useContext, useState, useEffect } from 'react'
import { collection, getDocs, query, where, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { registerFCM } from '../firebase/messaging'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Lee la sesión guardada de forma SÍNCRONA en el primer render: así, si el
  // usuario no ha salido, entra directo a su perfil sin parpadeo del login.
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tg_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      localStorage.removeItem('tg_user')
      return null
    }
  })
  const [loading] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    // Releer de Firestore en segundo plano para recoger cambios de rol
    // (ej. migración ayudante → ayudante_av) sin bloquear la primera pantalla.
    getDoc(doc(db, 'users', user.id)).then(snap => {
      if (snap.exists()) {
        const fresh = { id: snap.id, ...snap.data() }
        setUser(fresh)
        localStorage.setItem('tg_user', JSON.stringify(fresh))
        registerFCM(fresh.id).catch(() => {})
      } else {
        // La cuenta ya no existe: cerrar sesión
        localStorage.removeItem('tg_user')
        setUser(null)
      }
    }).catch(() => {
      // Sin red: seguimos con los datos cacheados
      registerFCM(user.id).catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(name, pin) {
    const q = query(
      collection(db, 'users'),
      where('name', '==', name.trim()),
      where('pin', '==', pin.trim())
    )
    const snap = await getDocs(q)
    if (snap.empty) throw new Error('Nombre o PIN incorrecto')

    const docSnap = snap.docs[0]
    const userData = { id: docSnap.id, ...docSnap.data() }
    setUser(userData)
    localStorage.setItem('tg_user', JSON.stringify(userData))
    // Registrar token FCM en segundo plano (no bloqueante)
    registerFCM(docSnap.id).catch(() => {})
    return userData
  }

  async function updateUser(updates) {
    if (!user?.id) return
    await updateDoc(doc(db, 'users', user.id), updates)
    const updated = { ...user, ...updates }
    setUser(updated)
    localStorage.setItem('tg_user', JSON.stringify(updated))
  }

  function logout() {
    setUser(null)
    localStorage.removeItem('tg_user')
  }

  async function createFirstCoordinator(name, pin) {
    const snap = await getDocs(collection(db, 'users'))
    if (!snap.empty) throw new Error('Ya existen usuarios. Pide al coordinador que te añada.')

    const ref = await addDoc(collection(db, 'users'), {
      name: name.trim(),
      pin: pin.trim(),
      role: 'coordinador',
      createdAt: serverTimestamp(),
    })
    const userData = { id: ref.id, name: name.trim(), role: 'coordinador' }
    setUser(userData)
    localStorage.setItem('tg_user', JSON.stringify(userData))
    return userData
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
