import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  LayoutDashboard, ClipboardCheck, FileText, Package, Database,
  Settings, LogOut, UserIcon, Bell, Clock, CheckCircle, AlertTriangle,
  PackageCheck, CalendarDays, Plus, BarChart3
} from 'lucide-react';
import { User as UserIconLucide } from 'lucide-react';
import { useApp } from '../context/AppContext';
import '../pages/dashboard/Dashboard.css';

export default function Layout({ children }) {
  const {
    user, onLogout, userRole, hasPermission, isWarehouseUser,
    indents, dashboardShifts, officeInventory, pendingGroupedCount,
    loadingData, pendingHandover, hasProposedHandover, shiftStatus
  } = useApp();

  const isHandoverInitiated = !!pendingHandover || hasProposedHandover || shiftStatus === 'view_only' || shiftStatus === 'handed_over' || shiftStatus === 'pending_first_shift';

  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState(() => {
    try {
      const saved = sessionStorage.getItem('dismissed_notifications');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('dismissed_notifications', JSON.stringify([...dismissedNotifications]));
    } catch (e) {
      console.error("Error writing dismissed notifications:", e);
    }
  }, [dismissedNotifications]);

  const dismissIndividual = (id) => {
    setDismissedNotifications(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const notificationsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  // Notification logic
  const notifications = [];
  const now = new Date();

  const pendingList = indents.filter(i => i.status === 'pending');
  const approvedList = indents.filter(i => i.status === 'approved');
  const pendingCount = pendingList.length;
  const approvedCount = approvedList.length;

  if (pendingCount > 0) {
    const pendingKeys = pendingList.map(i => i.id).join('-');
    notifications.push({ id: `pending-indents-${pendingKeys}`, type: 'warning', icon: Clock, title: `${pendingCount} Indent${pendingCount > 1 ? 's' : ''} Pending Approval`, desc: 'Requires review in the Indents tab', time: 'Active' });
  }
  if (approvedCount > 0) {
    const approvedKeys = approvedList.map(i => i.id).join('-');
    notifications.push({ id: `approved-indents-${approvedKeys}`, type: 'info', icon: CheckCircle, title: `${approvedCount} Indent${approvedCount > 1 ? 's' : ''} Approved`, desc: 'Ready for dispatch', time: 'Active' });
  }

  const recentDispatched = indents.filter(i => {
    if (i.status !== 'dispatched') return false;
    try { return (now - new Date(i.updated_at || i.date)) < 86400000; } catch { return false; }
  });
  if (recentDispatched.length > 0) {
    const dispatchedKeys = recentDispatched.map(i => i.id).join('-');
    notifications.push({ id: `recent-dispatched-${dispatchedKeys}`, type: 'success', icon: PackageCheck, title: `${recentDispatched.length} Indent${recentDispatched.length > 1 ? 's' : ''} Dispatched`, desc: 'Dispatched in the last 24 hours', time: 'Today' });
  }

  const recentShifts = dashboardShifts.filter(s => {
    try { return (now - new Date(s.shift_date || s.created_at)) < 86400000; } catch { return false; }
  });
  if (recentShifts.length > 0) {
    const shiftKeys = recentShifts.map(s => s.id).join('-');
    notifications.push({ id: `recent-shifts-${shiftKeys}`, type: 'info', icon: ClipboardCheck, title: `${recentShifts.length} Consumption Log${recentShifts.length > 1 ? 's' : ''} Today`, desc: 'Finalized shift reports logged', time: 'Today' });
  }

  const lowStockItems = (officeInventory || []).filter(item => {
    const qty = Number(item.closing_balance ?? item.quantity ?? 0);
    return qty > 0 && qty <= 5;
  });
  if (lowStockItems.length > 0) {
    const lowStockKeys = lowStockItems.map(item => `${item.item_code || item.id}_${item.closing_balance ?? item.quantity ?? 0}`).join('-');
    notifications.push({ id: `low-stock-${lowStockKeys}`, type: 'danger', icon: AlertTriangle, title: `${lowStockItems.length} Item${lowStockItems.length > 1 ? 's' : ''} Low in Stock`, desc: 'Office inventory running critically low', time: 'Check Now' });
  }

  const visibleNotifications = notifications.filter(n => !dismissedNotifications.has(n.id));
  const unreadCount = visibleNotifications.length;

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="bavya-header-logo-container">
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '9999px',
              padding: '0 14px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
              cursor: 'pointer',
              boxSizing: 'border-box'
            }} onClick={() => navigate('/dashboard')}>
              <img src="/BAVYALO.png" alt="BAVYA Logo" style={{ height: '26px', objectFit: 'contain' }} />
            </div>
            <div className="brand-text-wrapper">
              <span className="bavya-brand-title">BIT-IndCom</span>
              <span className="header-subtitle">Indent & Consumption Portal</span>
            </div>
          </div>
        </div>

        <nav className="header-nav">
          {hasPermission('overview', 'view') && (
            <button
              className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
              onClick={() => navigate('/dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>Overview</span>
            </button>
          )}
          {hasPermission('shift', 'view') && (
            <div className="nav-dropdown">
              <button
                type="button"
                className={`nav-link ${isActive('/consumption') ? 'active' : ''}`}
                style={{ cursor: 'default' }}
              >
                <ClipboardCheck size={18} />
                <span>Consumption</span>
                <span style={{ fontSize: '9px', marginLeft: '4px' }}>▼</span>
              </button>
              <div className="nav-dropdown-content">
                <button
                  type="button"
                  className={location.pathname === '/consumption' || location.pathname.startsWith('/consumption/draw') || location.pathname.startsWith('/consumption/history') ? 'active-dropdown-item' : ''}
                  onClick={() => navigate('/consumption')}
                >
                  Consumption Logs
                </button>
                <button
                  type="button"
                  className={location.pathname === '/consumption/record' ? 'active-dropdown-item' : ''}
                  onClick={() => {
                    if (shiftStatus === 'handed_over') {
                      toast.error("Your shift has been completed/handed over. Only view access is permitted.");
                    } else if (shiftStatus === 'pending_first_shift') {
                      toast.error("Please finalize your Shift 1 (Morning) consumption log first.");
                    } else if (shiftStatus === 'view_only') {
                      toast.error("Handover activation is pending. Access is view-only.");
                    } else if (isHandoverInitiated) {
                      toast.error("Stock handover has been initiated. Cannot record consumption.");
                    } else {
                      navigate('/consumption/record');
                    }
                  }}
                  disabled={isHandoverInitiated}
                  style={isHandoverInitiated ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  title={
                    shiftStatus === 'handed_over' 
                      ? "Your shift has been completed/handed over. Only view access is permitted."
                      : shiftStatus === 'pending_first_shift'
                        ? "Please finalize your Shift 1 (Morning) consumption log first."
                        : shiftStatus === 'view_only'
                          ? "Handover activation is pending. Access is view-only."
                          : isHandoverInitiated 
                            ? "Stock handover has been initiated. Cannot record consumption." 
                            : ""
                  }
                >
                  Record Consumption
                </button>
              </div>
            </div>
          )}
          {hasPermission('indents', 'view') && (
            <button
              className={`nav-link ${isActive('/indents') ? 'active' : ''}`}
              onClick={() => navigate('/indents')}
            >
              <FileText size={18} />
              <span>Indents</span>
              {pendingGroupedCount > 0 && (
                <span className="nav-badge">{pendingGroupedCount}</span>
              )}
            </button>
          )}


          {(hasPermission('masters', 'view') || hasPermission('indents', 'view') || userRole === 'admin') && (
            <button
              type="button"
              className={`nav-link ${isActive('/inventory') ? 'active' : ''}`}
              onClick={() => navigate('/inventory')}
            >
              <Package size={18} />
              <span>Office Inventory</span>
            </button>
          )}

          {(hasPermission('masters', 'view') || hasPermission('workflow', 'view')) && (
            <div className="nav-dropdown">
              <button
                type="button"
                className={`nav-link ${(isActive('/masters') || isActive('/workflow')) ? 'active' : ''}`}
                style={{ cursor: 'default' }}
              >
                <Database size={18} />
                <span>Masters</span>
                <span style={{ fontSize: '9px', marginLeft: '4px' }}>▼</span>
              </button>
              <div className="nav-dropdown-content">
                {hasPermission('masters', 'view') && (
                  <button
                    type="button"
                    className={isActive('/masters') ? 'active-dropdown-item' : ''}
                    onClick={() => navigate('/masters')}
                  >
                    Material Master
                  </button>
                )}
                {hasPermission('workflow', 'view') && (
                  <button
                    type="button"
                    className={isActive('/workflow') ? 'active-dropdown-item' : ''}
                    onClick={() => navigate('/workflow')}
                  >
                    Workflow Config
                  </button>
                )}
              </div>
            </div>
          )}

          {(hasPermission('users', 'view') || hasPermission('reports', 'view') || hasPermission('audit', 'view') || userRole === 'admin' || userRole === 'project_manager' || userRole === 'supervisor') && (
            <div className="nav-dropdown">
              <button
                type="button"
                className={`nav-link ${(isActive('/users') || isActive('/reports') || isActive('/audit') || isActive('/permissions') || isActive('/analytics') || isActive('/shift-management')) ? 'active' : ''}`}
                style={{ cursor: 'default' }}
              >
                <Settings size={18} />
                <span>Settings</span>
                <span style={{ fontSize: '9px', marginLeft: '4px' }}>▼</span>
              </button>
              <div className="nav-dropdown-content">
                {(userRole === 'admin' || userRole === 'project_manager' || userRole === 'supervisor') && (
                  <button type="button" className={isActive('/analytics') ? 'active-dropdown-item' : ''} onClick={() => navigate('/analytics')}>
                    Analytics
                  </button>
                )}
                {hasPermission('users', 'view') && (
                  <button type="button" className={isActive('/users') ? 'active-dropdown-item' : ''} onClick={() => navigate('/users')}>
                    Users
                  </button>
                )}
                {(userRole === 'admin' || userRole === 'project_manager' || userRole === 'supervisor') && (
                  <button type="button" className={isActive('/shift-management') ? 'active-dropdown-item' : ''} onClick={() => navigate('/shift-management')}>
                    Shift Management
                  </button>
                )}
                {hasPermission('reports', 'view') && (
                  <button type="button" className={isActive('/reports') ? 'active-dropdown-item' : ''} onClick={() => navigate('/reports')}>
                    Reports
                  </button>
                )}
                {hasPermission('audit', 'view') && (
                  <button type="button" className={isActive('/audit') ? 'active-dropdown-item' : ''} onClick={() => navigate('/audit')}>
                    Audit Logs
                  </button>
                )}
                {userRole === 'admin' && (
                  <button type="button" className={isActive('/permissions') ? 'active-dropdown-item' : ''} onClick={() => navigate('/permissions')}>
                    Role Permissions
                  </button>
                )}
              </div>
            </div>
          )}
        </nav>

        <div className="header-right">
          {/* Notification Bell */}
          <div ref={notificationsRef} className="notification-wrapper" style={{ position: 'relative' }}>
            <button
              className="notification-bell-btn"
              onClick={() => setShowNotifications(prev => !prev)}
              title="Notifications"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="notification-dropdown" style={{
                position: 'absolute', top: '100%', right: 0, width: '340px', backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                zIndex: 10001, marginTop: '8px', overflow: 'hidden'
              }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '800', fontSize: '14px', color: '#1e293b' }}>Notifications</span>
                  {visibleNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDismissedNotifications(new Set(notifications.map(n => n.id)))}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Clear All
                    </button>
                  )}
                </div>
              <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  {visibleNotifications.length === 0 ? (
                    <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      No new notifications
                    </div>
                  ) : (
                    visibleNotifications.map(n => {
                      const IconComp = n.icon;
                      const colorMap = { warning: '#f59e0b', info: '#3b82f6', success: '#10b981', danger: '#ef4444' };
                      const bgMap = { warning: '#fffbeb', info: '#eff6ff', success: '#ecfdf5', danger: '#fef2f2' };
                      return (
                        <div key={n.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'flex-start', gap: '12px', position: 'relative' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', backgroundColor: bgMap[n.type],
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            <IconComp size={16} style={{ color: colorMap[n.type] }} />
                          </div>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: '700', fontSize: '12.5px', color: '#1e293b' }}>{n.title}</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>{n.desc}</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>{n.time}</div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissIndividual(n.id);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: '4px',
                              position: 'absolute',
                              right: '12px',
                              top: '12px',
                              fontSize: '11px',
                              lineHeight: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              transition: 'all 0.15s ease-in-out'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.color = '#ef4444';
                              e.target.style.backgroundColor = '#fef2f2';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.color = '#94a3b8';
                              e.target.style.backgroundColor = 'transparent';
                            }}
                            title="Dismiss notification"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div 
            className="user-profile" 
            onClick={() => navigate('/profile')} 
            style={{ cursor: 'pointer' }} 
            title="View Profile"
          >
            <div className="user-avatar">
              <UserIconLucide size={16} />
            </div>
            <div className="user-info">
              <span className="user-username">{user?.role ? user.role.toUpperCase() : 'Admin'}</span>
              <span className="user-role-badge">{user?.project || 'Global'}</span>
            </div>
          </div>
          <button className="logout-button" onClick={onLogout} title="Log Out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="dashboard-main">
        {loadingData ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 200px)', gap: '20px' }}>
            <div className="bavya-spinner">
              <div className="petal petal-tl"></div>
              <div className="petal petal-tr"></div>
              <div className="petal petal-bl"></div>
              <div className="petal petal-br"></div>
            </div>
            <span style={{ fontSize: '13.5px', fontWeight: '600', color: '#64748b' }}>Refreshing application context metadata...</span>
          </div>
        ) : (
          children
        )}
      </main>

      {/* FOOTER */}
      <footer className="dashboard-footer">
        <span className="footer-text">
          © {new Date().getFullYear()} Bit-IndCom. All rights reserved.
        </span>
        <span className="footer-divider">•</span>
        <img src="/BAVYALO.png" alt="BAVYA Logo" className="footer-logo" style={{ maxHeight: '35px' }} />
      </footer>
    </div>
  );
}
