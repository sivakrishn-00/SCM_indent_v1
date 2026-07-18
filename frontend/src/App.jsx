import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/Login';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import { Toaster, toast, ToastBar } from 'react-hot-toast';

// Page imports
import OverviewPage from './pages/dashboard/OverviewPage';
import AnalyticsPage from './pages/analytics/AnalyticsPage';
import ConsumptionPage from './pages/consumption/ConsumptionPage';
import IndentsPage from './pages/indents/IndentsPage';
import InventoryPage from './pages/inventory/InventoryPage';
import ReportsPage from './pages/reports/ReportsPage';
import PermissionsPage from './pages/permissions/PermissionsPage';
import Masters from './pages/masters/Masters';
import UsersPage from './pages/users/Users';
import ShiftManagementPage from './pages/roster/ShiftManagementPage';
import ShiftAuditLogsPage from './pages/roster/ShiftAuditLogsPage';
import AuditLogs from './pages/audit/AuditLogs';
import ProfilePage from './pages/profile/ProfilePage';
import ApiManagementPage from './pages/settings/ApiManagementPage';

function App() {
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem('user');
    const token = sessionStorage.getItem('token');
    if (savedUser && token) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        sessionStorage.clear();
        return null;
      }
    }
    return null;
  });

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    toast.success('Login successful!');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
    toast.success('Logged out successfully!');
  };

  // Automatic logout on 15 minutes of inactivity
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes
    let timeoutId;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        setUser(null);
        toast.error("Session inactive. Please log in again.");
      }, INACTIVITY_LIMIT);
    };

    // Events that register user activity
    const activityEvents = [
      'mousedown', 'mousemove', 'keydown',
      'scroll', 'touchstart', 'click'
    ];

    // Initialize timer
    resetTimer();

    // Bind event listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  return (
    <div className="App">
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }}>
        {(t) => (
          <ToastBar
            toast={t}
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(16px)',
              border: t.type === 'success' 
                ? '1px solid rgba(16, 185, 129, 0.4)' 
                : t.type === 'error' 
                  ? '1px solid rgba(239, 68, 68, 0.4)' 
                  : '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: t.type === 'success' 
                ? '0 12px 30px rgba(16, 185, 129, 0.25)' 
                : t.type === 'error' 
                  ? '0 12px 30px rgba(239, 68, 68, 0.25)' 
                  : '0 12px 30px rgba(0, 0, 0, 0.3)',
              borderRadius: '999px',
              padding: '10px 20px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: '600',
              fontSize: '13.5px',
              letterSpacing: '0.3px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.3s ease',
            }}
          >
            {({ icon, message }) => (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {icon}
                  {message}
                </div>
                {t.type !== 'loading' && (
                  <button
                    onClick={() => toast.dismiss(t.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.5)',
                      cursor: 'pointer',
                      fontSize: '18px',
                      lineHeight: '1',
                      padding: '2px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      marginLeft: '4px',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.color = '#ffffff';
                      e.target.style.transform = 'scale(1.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.color = 'rgba(255, 255, 255, 0.5)';
                      e.target.style.transform = 'scale(1)';
                    }}
                  >
                    &times;
                  </button>
                )}
              </>
            )}
          </ToastBar>
        )}
      </Toaster>
      <BrowserRouter basename="/bit-indcon">
        <Routes>
          {/* Public Route */}
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Login onLoginSuccess={handleLoginSuccess} />
              )
            }
          />

          {/* Protected Routes */}
          <Route
            path="/*"
            element={
              user ? (
                <AppProvider user={user} onLogout={handleLogout}>
                  <Layout>
                    <Routes>
                      <Route path="/dashboard" element={<OverviewPage />} />
                      <Route path="/analytics" element={<AnalyticsPage />} />
                      <Route path="/consumption/*" element={<ConsumptionPage />} />
                      <Route path="/indents/*" element={<IndentsPage />} />
                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route path="/masters" element={<Masters user={user} activeSubTab="materials" />} />
                      <Route path="/workflow" element={<Masters user={user} activeSubTab="workflow" />} />
                      <Route path="/users" element={<UsersPage />} />
                      <Route path="/shift-management" element={<ShiftManagementPage />} />
                      <Route path="/shift-management/audits" element={<ShiftAuditLogsPage />} />
                      <Route path="/audit" element={<AuditLogs />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/permissions" element={<PermissionsPage />} />
                      <Route path="/api-management" element={<ApiManagementPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </Layout>
                </AppProvider>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </BrowserRouter>

    </div>
  );
}

export default App;
