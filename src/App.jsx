import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import UserDashboard from './pages/UserDashboard'
import CoordinatorDashboard from './pages/CoordinatorDashboard'

function ProtectedRoute({ children, requiredRole }) {
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
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'coordinador' ? '/coordinator' : '/dashboard'} replace />
  }
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'coordinador' ? '/coordinator' : '/dashboard'} replace /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedRoute requiredRole="usuario"><UserDashboard /></ProtectedRoute>} />
      <Route path="/coordinator" element={<ProtectedRoute requiredRole="coordinador"><CoordinatorDashboard /></ProtectedRoute>} />
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
