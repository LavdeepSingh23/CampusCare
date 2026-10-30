import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage from './Components/Landing/landing_page';
import PortalSelectorPage from './Components/Auth/PortalSelectorPage';
import DoctorLogin from './Components/Auth/DoctorLogin';
import ReceptionistLogin from './Components/Auth/ReceptionistLogin';
import StudentLogin from './Components/Auth/StudentLogin';
import FacultyLogin from './Components/Auth/FacultyLogin';
import AdminLogin from './Components/Auth/AdminLogin';
import Doctors_Dashboard from './Components/Doctors/Doctors_Dashboard';
import Students_Dashboard from './Components/Students/Students_Dashboard';
import StudentProfileOnboarding from './Components/Students/StudentProfileOnboarding';
import ReceptionDashboard from './Components/Receptionist/receptionist';
import FacultyDashboard from './Components/Faculty/FacultyDashboard';
import FacultyDirectoryAdmin from './Components/Admin/FacultyDirectoryAdmin';

function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, userRole } = useAuth();
  if (!isAuthenticated) return <Navigate to="/user_login" replace />;
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    if (userRole === 'DOCTOR') return <Navigate to="/doctor_dashboard" replace />;
    if (userRole === 'RECEPTIONIST') return <Navigate to="/reception_dashboard" replace />;
    if (userRole === 'STUDENT') return <Navigate to="/student_dashboard" replace />;
    if (userRole === 'FACULTY') return <Navigate to="/faculty_dashboard" replace />;
    if (userRole === 'ADMIN') return <Navigate to="/admin/directory" replace />;
    return <Navigate to="/user_login" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* Central 4-Portal Sign-In (Doctor, Receptionist, Student, Faculty) */}
      <Route path="/user_login" element={<PortalSelectorPage />} />
      <Route path="/login" element={<Navigate to="/user_login" replace />} />

      {/* Canonical Role-Specific Sign-In Routes */}
      <Route path="/signin/doctor" element={<DoctorLogin />} />
      <Route path="/signin/receptionist" element={<ReceptionistLogin />} />
      <Route path="/signin/student" element={<StudentLogin />} />
      <Route path="/signin/faculty" element={<FacultyLogin />} />

      {/* Hidden Administrator Gateway */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Legacy Aliases for Seamless Backward Compatibility */}
      <Route path="/student_login" element={<Navigate to="/signin/student" replace />} />
      <Route path="/doctor_login" element={<Navigate to="/signin/doctor" replace />} />
      <Route path="/receptionist_login" element={<Navigate to="/signin/receptionist" replace />} />

      {/* Doctor Dashboard */}
      <Route
        path="/doctor_dashboard"
        element={
          <ProtectedRoute allowedRoles={['DOCTOR']}>
            <Doctors_Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Student Dashboard */}
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

      {/* Receptionist Dashboard */}
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

      {/* Faculty Portal & Dependents Dashboard */}
      <Route
        path="/faculty_dashboard"
        element={
          <ProtectedRoute allowedRoles={['FACULTY']}>
            <FacultyDashboard />
          </ProtectedRoute>
        }
      />

      {/* Admin Faculty Directory Console */}
      <Route
        path="/admin/directory"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <FacultyDirectoryAdmin />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
