import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Cada ruta es su propio chunk — solo descarga el JS de la página que el usuario visita
const Login = lazy(() => import('./pages/Login'))
const UserDashboard = lazy(() => import('./pages/UserDashboard'))
const CoordinatorDashboard = lazy(() => import('./pages/CoordinatorDashboard'))

// Pantalla de espera mientras descarga el chunk de la ruta
function RouteLoader() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <img
          src="/logo.png"
          alt="TurnoGuide"
          className="h-16 w-16 object-contain mx-auto mb-3 animate-pulse"
        />
        <p className="text-slate-400 text-sm">Cargando...</p>
      </div>
    </div>
  )
}

function homeFor(role) {
  return role === 'coordinador' ? '/coordinator' : '/dashboard'
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()
  if (loading) return <RouteLoader />
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
      <Route
        path="/login"
        element={user ? <Navigate to={homeFor(user.role)} replace /> : <Login />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={['usuario', 'ayudante_av', 'ayudante_ac', 'ayudante']}>
            <UserDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator"
        element={
          <ProtectedRoute allowedRoles={['coordinador']}>
            <CoordinatorDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteLoader />}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
