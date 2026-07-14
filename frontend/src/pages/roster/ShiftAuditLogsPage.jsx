import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Search, RefreshCw, Calendar, User, Info, 
  ChevronLeft, ChevronRight, FileSpreadsheet, ArrowLeftRight, Clock, Plus, Trash2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';
import './ShiftAuditLogsPage.css';

export default function ShiftAuditLogsPage() {
  const { user, projects, userProject, userOffice } = useApp();
  const navigate = useNavigate();

  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filters
  const [selectedProject, setSelectedProject] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    swaps: 0,
    configs: 0,
    updates: 0,
    cancels: 0
  });

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      // If user has a locked project, fetch only that, otherwise fetch all
      const projectQuery = selectedProject !== 'all' ? selectedProject : (userProject || '');
      const data = await api.audit.getLogs(projectQuery);
      
      // Filter for SHIFT_MANAGEMENT module
      const shiftLogs = (data || []).filter(log => log.module === 'SHIFT_MANAGEMENT');
      setAuditLogs(shiftLogs);
      
      // Calculate Stats
      let swaps = 0, configs = 0, updates = 0, cancels = 0;
      shiftLogs.forEach(log => {
        if (log.action === 'SWAP_ROSTER') swaps++;
        else if (log.action === 'CONFIG_SHIFT_TIMINGS') configs++;
        else if (log.action === 'UPDATE_ROSTER') updates++;
        else if (log.action === 'CANCEL_ROSTER') cancels++;
      });
      setStats({
        total: shiftLogs.length,
        swaps,
        configs,
        updates,
        cancels
      });
    } catch (err) {
      console.error("Error loading shift audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [selectedProject]);

  // Apply filters client-side
  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = 
      (log.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (log.user || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.timestamp || '').toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    
    return matchesSearch && matchesAction && matchesStatus;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Operator / User', 'Action Type', 'Description Description', 'Status'];
    const rows = filteredLogs.map(l => [
      l.timestamp,
      l.user,
      l.action,
      l.description,
      l.status
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Shift_Roster_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="shift-audits-page animate-fade-in">
      {/* Breadcrumb / Header */}
      <div className="audits-header-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="back-btn-circle" onClick={() => navigate('/shift-management')} title="Back to Roster Roster">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="audits-title">Shift Roster Audits</h2>
            <p className="audits-subtitle">Review updates, timing changes, and swaps in historical records</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="action-btn-secondary" onClick={fetchAuditLogs} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={14} className={loading ? 'spin-animation' : ''} />
            <span>Refresh</span>
          </button>
          
          <button className="btn-primary-gradient" onClick={handleExportCSV} disabled={filteredLogs.length === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={15} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Rows */}
      <div className="audits-stats-grid">
        <div className="audit-stat-card sunset-yellow">
          <div className="stat-icon-wrapper">
            <Clock size={20} />
          </div>
          <div className="stat-text-content">
            <span className="stat-desc">Total Logs</span>
            <span className="stat-num">{stats.total}</span>
          </div>
        </div>

        <div className="audit-stat-card sunset-blue">
          <div className="stat-icon-wrapper">
            <ArrowLeftRight size={20} />
          </div>
          <div className="stat-text-content">
            <span className="stat-desc">Roster Swaps</span>
            <span className="stat-num">{stats.swaps}</span>
          </div>
        </div>

        <div className="audit-stat-card sunset-orange">
          <div className="stat-icon-wrapper">
            <Plus size={20} />
          </div>
          <div className="stat-text-content">
            <span className="stat-desc">Shift Updates</span>
            <span className="stat-num">{stats.updates}</span>
          </div>
        </div>

        <div className="audit-stat-card sunset-red">
          <div className="stat-icon-wrapper">
            <Trash2 size={20} />
          </div>
          <div className="stat-text-content">
            <span className="stat-desc">Cancellations</span>
            <span className="stat-num">{stats.cancels}</span>
          </div>
        </div>
      </div>

      {/* Filter and Query Section */}
      <div className="audits-filter-box">
        <div className="audits-search-container">
          <Search size={16} className="search-icon-inside" />
          <input
            type="text"
            className="modern-search-input"
            placeholder="Search by username, description keywords..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="audits-dropdowns-group">
          {!userProject && (
            <div className="modern-dropdown-wrapper">
              <label>Project</label>
              <CustomSelect
                value={selectedProject}
                onChange={e => { setSelectedProject(e.target.value); setCurrentPage(1); }}
                options={[
                  { value: 'all', label: 'All Projects' },
                  ...projects.map(p => ({ value: p, label: p }))
                ]}
              />
            </div>
          )}

          <div className="modern-dropdown-wrapper">
            <label>Action Class</label>
            <CustomSelect
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setCurrentPage(1); }}
              options={[
                { value: 'all', label: 'All Actions' },
                { value: 'CREATE_ROSTER', label: 'CREATE ROSTER' },
                { value: 'UPDATE_ROSTER', label: 'UPDATE ROSTER' },
                { value: 'SWAP_ROSTER', label: 'SWAP ROSTER' },
                { value: 'CANCEL_ROSTER', label: 'CANCEL ROSTER' },
                { value: 'CONFIG_SHIFT_TIMINGS', label: 'CONFIG TIMINGS' },
              ]}
            />
          </div>

          <div className="modern-dropdown-wrapper">
            <label>Status</label>
            <CustomSelect
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'SUCCESS', label: 'SUCCESS' },
                { value: 'FAILED', label: 'FAILED' }
              ]}
            />
          </div>
        </div>
      </div>

      {/* Main Table card */}
      <div className="heavy-table-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <RefreshCw size={28} className="spin-animation" style={{ margin: '0 auto 12px', color: 'var(--primary)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13.5px' }}>Retrieving Shift Logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '70px 20px', textAlign: 'center' }}>
            <Clock size={40} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
            <h4 style={{ margin: '0 0 6px', color: 'var(--text-secondary)', fontSize: '15px' }}>No audit record found</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Timestamp</th>
                    <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>User</th>
                    <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>
                    <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</th>
                    <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="audit-tr-hover" style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s ease' }}>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {log.timestamp}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: '#f1f5f9',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: '800'
                          }}>
                            {(log.user || 'U').charAt(0).toUpperCase()}
                          </span>
                          <span>{log.user}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontWeight: '800',
                          textTransform: 'uppercase',
                          fontSize: '10px',
                          display: 'inline-block',
                          background: log.action.includes('CONFIG') ? '#f0fdf4' : log.action.includes('SWAP') ? '#eff6ff' : log.action.includes('CREATE') ? '#ecfdf5' : log.action.includes('CANCEL') ? '#fef2f2' : '#fff7ed',
                          color: log.action.includes('CONFIG') ? '#166534' : log.action.includes('SWAP') ? '#1d4ed8' : log.action.includes('CREATE') ? '#047857' : log.action.includes('CANCEL') ? '#dc2626' : '#c2410c',
                          border: '1px solid currentColor'
                        }}>
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '450px', wordBreak: 'break-word', lineHeight: '1.4' }}>
                        {log.description}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px' }}>
                        <span style={{
                          padding: '3px 7px',
                          borderRadius: '4px',
                          fontSize: '10.5px',
                          fontWeight: '800',
                          background: log.status === 'SUCCESS' ? '#e6f4ea' : '#fce8e6',
                          color: log.status === 'SUCCESS' ? '#137333' : '#c5221f'
                        }}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Panel */}
            <div className="table-pagination-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + itemsPerPage, filteredLogs.length)}</strong> of <strong>{filteredLogs.length}</strong> shift entries
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <span>Rows:</span>
                  <CustomSelect
                    value={itemsPerPage}
                    onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    options={[
                      { value: 10, label: '10' },
                      { value: 25, label: '25' },
                      { value: 50, label: '50' }
                    ]}
                    style={{ width: '70px' }}
                    compact
                    placement="top"
                  />
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, index, array) => {
                      const showEllipsis = index > 0 && p - array[index - 1] > 1;
                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>...</span>}
                          <button
                            className={`pagination-btn ${currentPage === p ? 'active' : ''}`}
                            onClick={() => setCurrentPage(p)}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
