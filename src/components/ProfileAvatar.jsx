import { useRef, useState } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'

function resizeImage(file, size = 300) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      // Crop cuadrado centrado
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2
      const sy = (img.height - min) / 2
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
      URL.revokeObjectURL(url)
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    }
    img.src = url
  })
}

export default function ProfileAvatar({ size = 96 }) {
  const { user, updateUser } = useAuth()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const initials = user?.name
    ? user.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    setUploading(true)
    try {
      const blob = await resizeImage(file, 300)
      const storageRef = ref(storage, `users/${user.id}/avatar.jpg`)
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(storageRef)
      await updateUser({ photoURL: url })
    } catch (err) {
      console.warn('Upload error:', err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{ width: size, height: size }}
      onClick={() => !uploading && inputRef.current?.click()}
      title="Cambiar foto de perfil"
    >
      {/* Avatar */}
      <div
        className="w-full h-full rounded-full overflow-hidden ring-4 ring-white dark:ring-slate-800"
        style={{ boxShadow: '0 8px 32px rgba(79,70,229,0.35)' }}
      >
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <span
              className="text-white font-extrabold"
              style={{ fontSize: size * 0.34 }}
            >
              {initials}
            </span>
          </div>
        )}
      </div>

      {/* Overlay cámara */}
      <div className="absolute inset-0 rounded-full flex items-center justify-center
                      bg-black/0 hover:bg-black/30 transition-all duration-150 group">
        {uploading ? (
          <svg className="animate-spin w-6 h-6 text-white opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4zm7-12H8.85L7.5 1.5h-3l-1.35 1.7H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-14a2 2 0 0 0-2-2zm-7 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
          </svg>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
