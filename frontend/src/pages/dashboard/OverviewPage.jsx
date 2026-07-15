import React from 'react';
import { CalendarDays, FileText, ClipboardCheck, Database, Truck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import api from '../../services/api';

function AnimatedCounter({ value, duration = 1000 }) {
  const [count, setCount] = React.useState(0);
  const prevValueRef = React.useRef(0);

  React.useEffect(() => {
    const end = parseInt(value, 10);
    if (isNaN(end)) {
      setCount(value);
      return;
    }
    
    const start = prevValueRef.current;
    prevValueRef.current = end;
    
    if (start === end) {
      setCount(end);
      return;
    }

    const startTime = performance.now();
    let animationFrameId;
    
    const updateCount = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      
      // Easing function (cubic ease-out)
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentCount = Math.floor(start + easeProgress * (end - start));
      setCount(currentCount);
      
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(updateCount);
      } else {
        setCount(end);
      }
    };
    
    animationFrameId = requestAnimationFrame(updateCount);
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [value, duration]);

  return <>{count}</>;
}

export default function OverviewPage() {
  const {
    user, userRole, indents, dashboardShifts, vehicles, projects, setSelectedProject,
    fetchOfficeInventory, userProject, userFullName, userOffice, drugs, officeInventory,
    loadingIndents, loadingShifts, loadingVehicles, loadingDrugs, loadingOfficeInventory,
    fetchVehicles, fetchShifts, fetchIndents, fetchDrugs
  } = useApp();

  const [projectOfficesMap, setProjectOfficesMap] = React.useState({});
  const [loadingOffices, setLoadingOffices] = React.useState(false);

  React.useEffect(() => {
    if (vehicles.length === 0 && !loadingVehicles) fetchVehicles();
    if (indents.length === 0 && !loadingIndents) fetchIndents();
    if (dashboardShifts.length === 0 && !loadingShifts) fetchShifts();
    if (drugs.length === 0 && !loadingDrugs) fetchDrugs();
  }, []);

  React.useEffect(() => {
    const loadAllOffices = async () => {
      setLoadingOffices(true);
      const map = {};
      try {
        await Promise.all(
          projects.map(async (proj) => {
            try {
              const res = await api.projects.getOffices(proj);
              map[proj] = res || [];
            } catch (e) {
              console.error("Error fetching offices for project: ", proj, e);
              map[proj] = [];
            }
          })
        );
        setProjectOfficesMap(map);
      } catch (err) {
        console.error("Error in loadAllOffices: ", err);
      } finally {
        setLoadingOffices(false);
      }
    };
    if (projects && projects.length > 0) {
      loadAllOffices();
    }
  }, [projects]);

  const is_admin = userRole === 'admin';

  if (is_admin) {
    return (
      <div className="tab-pane">
        <div className="welcome-banner">
          <h2>Welcome Administrator!</h2>
          <div className="dashboard-date">
            <CalendarDays size={15} />
            <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Admin Dashboard: Global Overview Cards */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            
            {/* Global Indents raised */}
            <div className="metric-card" style={{
              padding: '20px', 
              border: '1px solid #e2e8f0', 
              borderRadius: '16px', 
              background: 'linear-gradient(135deg, #ffffff 0%, #fff8f5 100%)', 
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '12px', backgroundColor: '#fff7ed', borderRadius: '12px', color: '#f7931e', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <FileText size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                  Global Indents Flow
                </span>
                {loadingIndents ? (
                  <>
                    <span className="skeleton" style={{ width: '40px', height: '24px', margin: '4px 0', border: 'none', display: 'block' }} />
                    <span className="skeleton" style={{ width: '120px', height: '12px', marginTop: '6px', display: 'block' }} />
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
                      <AnimatedCounter value={indents.length} />
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                      <strong><AnimatedCounter value={indents.filter(i => i.status === 'PENDING').length} /></strong> Pending | <strong><AnimatedCounter value={indents.filter(i => i.status === 'DISPATCHED').length} /></strong> Dispatched
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Global Consumption logs */}
            <div className="metric-card" style={{
              padding: '20px', 
              border: '1px solid #e2e8f0', 
              borderRadius: '16px', 
              background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)', 
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '12px', backgroundColor: '#fff5f5', borderRadius: '12px', color: '#d81159', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <ClipboardCheck size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                  Global Consumption
                </span>
                {loadingShifts ? (
                  <>
                    <span className="skeleton" style={{ width: '40px', height: '24px', margin: '4px 0', border: 'none', display: 'block' }} />
                    <span className="skeleton" style={{ width: '130px', height: '12px', marginTop: '6px', display: 'block' }} />
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
                      <AnimatedCounter value={dashboardShifts.length} />
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                      Finalized shift log entries
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Operational Fleet (now representing Offices Count, keeping the Truck icon as requested) */}
            <div className="metric-card" style={{
              padding: '20px', 
              border: '1px solid #e2e8f0', 
              borderRadius: '16px', 
              background: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)', 
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '12px', backgroundColor: '#fef3c7', borderRadius: '12px', color: '#fbb03b', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Truck size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                  Office Locations
                </span>
                {loadingOffices ? (
                  <>
                    <span className="skeleton" style={{ width: '40px', height: '24px', margin: '4px 0', border: 'none', display: 'block' }} />
                    <span className="skeleton" style={{ width: '110px', height: '12px', marginTop: '6px', display: 'block' }} />
                  </>
                ) : (() => {
                  const totalOffices = Object.values(projectOfficesMap).reduce((acc, list) => acc + list.length, 0);
                  return (
                    <>
                      <span style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
                        <AnimatedCounter value={totalOffices} />
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                        Active health facility locations
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Active Projects */}
            <div className="metric-card" style={{
              padding: '20px', 
              border: '1px solid #e2e8f0', 
              borderRadius: '16px', 
              background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', 
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '12px', backgroundColor: '#dcfce7', borderRadius: '12px', color: '#10b981', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Database size={20} />
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                  Project Sites
                </span>
                <span style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
                  <AnimatedCounter value={projects.length} />
                </span>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                  Configured operational areas
                </span>
              </div>
            </div>

          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--primary-dark)', margin: 0 }}>Project Sites Status Breakdown</h3>
        </div>

        {/* Project Sites Operations Grid */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {projects.map(proj => {
              const projVehicles = vehicles.filter(v => v.project === proj);
              const activeVehicles = projVehicles.filter(v => v.is_active).length;
              const projDrugs = drugs.filter(d => d.project === proj).length;
              const projIndents = indents.filter(i => i.project === proj);
              const pendingIndents = projIndents.filter(i => i.status === 'PENDING').length;
              const dispatchedIndents = projIndents.filter(i => i.status === 'DISPATCHED').length;
              
              return (
                <div 
                  key={proj}
                  className="metric-card" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '16px',
                    border: '1px solid #e2e8f0', 
                    borderRadius: '16px', 
                    padding: '20px', 
                    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Top Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: '700', 
                        textTransform: 'uppercase', 
                        color: '#64748b', 
                        letterSpacing: '0.05em', 
                        display: 'block',
                        marginBottom: '4px'
                      }}>
                        PROJECT SITE
                      </span>
                      <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--primary-dark)' }}>
                        {proj}
                      </span>
                    </div>
                    <div style={{ 
                      padding: '6px 12px', 
                      backgroundColor: '#ecfdf5', 
                      borderRadius: '8px', 
                      border: '1px solid #a7f3d0', 
                      fontSize: '11px', 
                      fontWeight: '700', 
                      color: '#065f46',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span style={{ width: '6px', height: '6px', backgroundColor: '#10b981', borderRadius: '50%' }}></span>
                      Active
                    </div>
                  </div>

                  {/* Stats Divider Line */}
                  <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }}></div>

                  {/* 2x2 Grid of Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    {/* Offices Stat (keeping Truck icon as requested) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', color: '#475569' }}>
                        <Truck size={16} />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Offices</span>
                        {loadingOffices ? (
                          <span className="skeleton" style={{ width: '60px', height: '14px', marginTop: '4px', display: 'block' }} />
                        ) : (
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                            <AnimatedCounter value={(projectOfficesMap[proj] || []).length} /> <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#64748b' }}>Offices</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Materials Scope */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', color: '#475569' }}>
                        <Database size={16} />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Materials Scope</span>
                        {loadingDrugs ? (
                          <span className="skeleton" style={{ width: '50px', height: '14px', marginTop: '4px', display: 'block' }} />
                        ) : (
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                            <AnimatedCounter value={projDrugs} /> <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#64748b' }}>Masters</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pending Indents */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ padding: '8px', backgroundColor: pendingIndents > 0 ? '#fffbeb' : '#f1f5f9', borderRadius: '8px', color: pendingIndents > 0 ? '#b45309' : '#475569' }}>
                        <FileText size={16} />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Pending Indents</span>
                        {loadingIndents ? (
                          <span className="skeleton" style={{ width: '60px', height: '14px', marginTop: '4px', display: 'block' }} />
                        ) : (
                          <span style={{ fontSize: '13px', fontWeight: '700', color: pendingIndents > 0 ? '#d97706' : '#1e293b' }}>
                            <AnimatedCounter value={pendingIndents} /> <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#64748b' }}>Requests</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dispatched Indents */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ padding: '8px', backgroundColor: '#eff6ff', borderRadius: '8px', color: '#1d4ed8' }}>
                        <ClipboardCheck size={16} />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Dispatched</span>
                        {loadingIndents ? (
                          <span className="skeleton" style={{ width: '60px', height: '14px', marginTop: '4px', display: 'block' }} />
                        ) : (
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>
                            <AnimatedCounter value={dispatchedIndents} /> <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#64748b' }}>Orders</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {projects.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                No project site configurations loaded.
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions & Recent Activity */}
        <div className="dashboard-sections">
          <div className="section-card">
            <h3>Recent Indent Activity</h3>
            <div className="recent-list">
              {loadingIndents ? (
                <>
                  <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '8px' }} />
                  <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '8px', marginTop: '8px' }} />
                  <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '8px', marginTop: '8px' }} />
                </>
              ) : indents.length > 0 ? (
                indents.slice(0, 3).map(ind => (
                  <div key={ind.id} className="recent-item">
                    <div className="recent-item-info">
                      <span className="item-vehicle">{ind.vehicle_number}</span>
                      <span className="item-details">{ind.quantity_requested} {ind.item_unit || 'L'} of {ind.item_name || ind.consumable_name || 'N/A'}</span>
                    </div>
                    <span className={`status-badge ${ind.status.toLowerCase()}`}>
                      {ind.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted py-4">No recent indents found.</div>
              )}
            </div>
          </div>

          <div className="section-card">
            <h3>System Logs</h3>
            <div className="system-logs">
              <div className="log-row">
                <span className="log-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="log-msg">Session active for user '{user?.username || 'Guest'}'.</span>
              </div>
              {loadingIndents ? (
                <>
                  <div className="skeleton" style={{ width: '90%', height: '12px', marginTop: '6px' }} />
                  <div className="skeleton" style={{ width: '80%', height: '12px', marginTop: '6px' }} />
                </>
              ) : (
                indents.slice(0, 2).map((ind, idx) => (
                  <div key={idx} className="log-row">
                    <span className="log-time">Event</span>
                    <span className="log-msg">Indent IND-{String(ind.id).padStart(5, '0')} ({ind.status}) for vehicle {ind.vehicle_number}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Operator / Paravet (Role-specific view)
  const myShifts = dashboardShifts.filter(s => s.logged_by === user?.username);
  const myProjectDrugs = drugs.filter(d => d.project === userProject);

  return (
    <div className="tab-pane">
      <div className="welcome-banner">
        <h2>Welcome {userFullName || user?.username || 'Operator'}!</h2>
        <div className="dashboard-date">
          <CalendarDays size={15} />
          <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Personal Statistics Grid */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          
          {/* Card 1: My Indents */}
          <div className="metric-card" style={{
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ padding: '12px', backgroundColor: '#ffedd5', color: '#f7931e', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <FileText size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                My Raised Indents
              </span>
              {loadingIndents ? (
                <>
                  <span className="skeleton" style={{ width: '40px', height: '24px', margin: '4px 0', border: 'none', display: 'block' }} />
                  <span className="skeleton" style={{ width: '120px', height: '12px', marginTop: '6px', display: 'block' }} />
                </>
              ) : (
                <>
                  <span style={{ fontSize: '24px', fontWeight: '850', color: '#1e293b', display: 'block' }}>
                    <AnimatedCounter value={indents.length} />
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                    Pending: <strong><AnimatedCounter value={indents.filter(i => i.status === 'PENDING').length} /></strong> | Dispatched: <strong><AnimatedCounter value={indents.filter(i => i.status === 'DISPATCHED').length} /></strong>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Card 2: My Consumption Logs */}
          <div className="metric-card" style={{
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#d81159', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <ClipboardCheck size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                My Consumption Logs
              </span>
              {loadingShifts ? (
                <>
                  <span className="skeleton" style={{ width: '40px', height: '24px', margin: '4px 0', border: 'none', display: 'block' }} />
                  <span className="skeleton" style={{ width: '130px', height: '12px', marginTop: '6px', display: 'block' }} />
                </>
              ) : (
                <>
                  <span style={{ fontSize: '24px', fontWeight: '850', color: '#1e293b', display: 'block' }}>
                    <AnimatedCounter value={myShifts.length} />
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                    Successfully submitted items
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Card 3: Office Location details */}
          <div className="metric-card" style={{
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ padding: '12px', backgroundColor: '#f3e8ff', color: '#4d1375', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Truck size={20} />
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                Assigned Station
              </span>
              <span style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                {userOffice?.name === 'N/A' ? 'No Office Assigned' : userOffice?.name}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                Loc: {userOffice?.location || 'N/A'}
              </span>
            </div>
          </div>

          {/* Card 4: Materials handled */}
          <div className="metric-card" style={{
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ padding: '12px', backgroundColor: '#dcfce7', color: '#10b981', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Database size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                Materials Scope
              </span>
              {loadingDrugs ? (
                <>
                  <span className="skeleton" style={{ width: '40px', height: '24px', margin: '4px 0', border: 'none', display: 'block' }} />
                  <span className="skeleton" style={{ width: '130px', height: '12px', marginTop: '6px', display: 'block' }} />
                </>
              ) : (
                <>
                  <span style={{ fontSize: '24px', fontWeight: '850', color: '#1e293b', display: 'block' }}>
                    <AnimatedCounter value={myProjectDrugs.length} />
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                    Active stock items in catalog
                  </span>
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Section splitting 1.4fr / 1fr */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '24px' }}>
        
        {/* Column 1: My Recent Indents */}
        <div 
          className="section-card" 
          style={{ 
            backgroundColor: '#ffffff', 
            borderRadius: '16px', 
            border: '1px solid #e2e8f0', 
            padding: '24px', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '850', color: 'var(--primary-dark)', margin: 0 }}>My Recent Indents</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loadingIndents ? (
              <>
                <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '12px' }} />
                <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '12px' }} />
                <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '12px' }} />
              </>
            ) : indents.length > 0 ? (
              indents.slice(0, 5).map(ind => (
                <div 
                  key={ind.id} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '12px 16px', 
                    backgroundColor: '#f8fafc', 
                    borderRadius: '12px', 
                    border: '1px solid #f1f5f9' 
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '750', color: '#1e293b' }}>
                      {ind.item_name || ind.consumable_name || 'Material Item'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Vehicle: <strong style={{ color: '#475569' }}>{ind.vehicle_number || ind.office_name || 'N/A'}</strong> | Qty: {ind.quantity_requested} {ind.item_unit || 'Units'}
                    </span>
                  </div>
                  <span 
                    style={{ 
                      padding: '4px 10px', 
                      borderRadius: '20px', 
                      fontSize: '10px', 
                      fontWeight: '700', 
                      textTransform: 'uppercase',
                      backgroundColor: 
                        ind.status === 'PENDING' ? '#fef3c7' :
                        ind.status === 'DISPATCHED' ? '#dcfce7' :
                        ind.status === 'APPROVED' ? '#dbeafe' : '#f1f5f9',
                      color: 
                        ind.status === 'PENDING' ? '#b45309' :
                        ind.status === 'DISPATCHED' ? '#15803d' :
                        ind.status === 'APPROVED' ? '#1d4ed8' : '#475569'
                    }}
                  >
                    {ind.status}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '32px', color: '#64748b', fontSize: '13px' }}>
                No indents raised yet.
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Office Inventory stock status */}
        <div 
          className="section-card" 
          style={{ 
            backgroundColor: '#ffffff', 
            borderRadius: '16px', 
            border: '1px solid #e2e8f0', 
            padding: '24px', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '850', color: 'var(--primary-dark)', margin: 0 }}>Local Office Stock Status</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loadingOfficeInventory ? (
              <>
                <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '12px' }} />
                <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '12px' }} />
                <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '12px' }} />
              </>
            ) : officeInventory.length > 0 ? (
              officeInventory.slice(0, 5).map(item => (
                <div 
                  key={item.id} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '12px 16px', 
                    backgroundColor: '#f8fafc', 
                    borderRadius: '12px', 
                    border: '1px solid #f1f5f9' 
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '70%' }}>
                    <span style={{ fontSize: '13px', fontWeight: '750', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.item_name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Batch: <strong style={{ color: '#475569' }}>{item.batch_number}</strong>
                    </span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: item.quantity <= 5 ? '#e34825' : '#0f766e' }}>
                    {item.quantity} {item.uom || 'units'}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '32px', color: '#64748b', fontSize: '13px' }}>
                No local inventory has been initialized yet.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
