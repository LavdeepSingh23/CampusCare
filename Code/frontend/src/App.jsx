import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage from './Components/Landing/landing_page';
import Login from './Components/Auth/Login';
import Doctors_Dashboard from './Components/Doctors/Doctors_Dashboard';
import Students_Dashboard from './Components/Students/Students_Dashboard';
import StudentProfileOnboarding from './Components/Students/StudentProfileOnboarding';
import ReceptionDashboard from './Components/Receptionist/receptionist';

function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, userRole } = useAuth();
  if (!isAuthenticated) return <Navigate to="/user_login" replace />;
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    if (userRole === 'DOCTOR') return <Navigate to="/doctor_dashboard" replace />;
    if (userRole === 'RECEPTIONIST') return <Navigate to="/reception_dashboard" replace />;
    if (userRole === 'STUDENT') return <Navigate to="/student_dashboard" replace />;
    return <Navigate to="/user_login" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/user_login" element={<Login />} />
      <Route path="/login" element={<Navigate to="/user_login" replace />} />
      <Route path="/student_login" element={<Navigate to="/user_login?role=student" replace />} />
      <Route
        path="/doctor_dashboard"
        element={
          <ProtectedRoute allowedRoles={['DOCTOR']}>
            <Doctors_Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student_dashboard"
        element={
          <ProtectedRoute allowedRoles={['STUDENT']}>
            <Students_Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student_dashboard/:rollNumber"
        element={
          <ProtectedRoute allowedRoles={['STUDENT', 'DOCTOR', 'RECEPTIONIST']}>
            <Students_Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/onboarding"
        element={
          <ProtectedRoute allowedRoles={['STUDENT']}>
            <StudentProfileOnboarding isOnboarding={true} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/profile"
        element={
          <ProtectedRoute allowedRoles={['STUDENT']}>
            <StudentProfileOnboarding isOnboarding={false} />
          </ProtectedRoute>
        }
      />
      <Route path="/student_profile" element={<Navigate to="/student/profile" replace />} />
      <Route
        path="/reception_dashboard"
        element={
          <ProtectedRoute allowedRoles={['RECEPTIONIST']}>
            <ReceptionDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/emergency"
        element={
          <ProtectedRoute allowedRoles={['RECEPTIONIST']}>
            <ReceptionDashboard initialPage="emergency" />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;