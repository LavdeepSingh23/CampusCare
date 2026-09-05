import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './Components/Auth/Login';
import Doctors_Dashboard from './Components/Doctors/Doctors_Dashboard';
import Students_Dashboard from './Components/Students/Students_Dashboard';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/user_login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/user_login" element={<Login />} />
      <Route
        path="/doctor_dashboard"
        element={
          <ProtectedRoute>
            <Doctors_Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/student_dashboard/:rollNumber" element={<Students_Dashboard />} />
      <Route path="*" element={<Navigate to="/user_login" replace />} />
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