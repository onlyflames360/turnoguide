import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import UserDashboard from './pages/UserDashboard'
import CoordinatorDashboard from './pages/CoordinatorDashboard'

const AYUDANTE_ROLES = ['ayudante_av', 'ayudante_ac', 'ayudante']

function homeFor(role) {
  return role === 'coordinador' ? '/coordinator' : '/dashboard'
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <img src="/logo.png" alt="TurnoGuide" className="h-16 w-16 object-contain mx-auto mb-3 animate-pulse" />
        <p className="text-slate-500 text-sm">Cargando...</p>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />
  }
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['usuario', 'ayudante_av', 'ayudante_ac', 'ayudante']}><UserDashboard /></ProtectedRoute>} />
      <Route path="/coordinator" element={<ProtectedRoute allowedRoles={['coordinador']}><CoordinatorDashboard /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
