import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CentersPage from './pages/CentersPage';
import UsersPage from './pages/UsersPage';
import ConsultationsPage from './pages/ConsultationsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SystemPage from './pages/SystemPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const location = useLocation();

  // Wait for Zustand persist to rehydrate before making auth decisions
  if (!hasHydrated) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="centers" element={<CentersPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="consultations" element={<ConsultationsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="system" element={<SystemPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
