import React, { useState, useEffect } from 'react';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import './AuditLogs.css';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';
import { useApp } from '../../context/AppContext';

export default function AuditLogs({ projects: propProjects }) {
  const { projects: contextProjects } = useApp();
  const projects = propProjects || contextProjects || [];
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('all');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditProjectFilter, setAuditProjectFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Fetch audit logs on mount
  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await api.audit.getLogs();
      setAuditLogs(data);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filter logs
  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = 
      (log.description || '').toLowerCase().includes(auditSearch.toLowerCase()) || 
      (log.user || '').toLowerCase().includes(auditSearch.toLowerCase());
    const matchesModule = auditModuleFilter === 'all' || log.module === auditModuleFilter;
    const matchesAction = auditActionFilter === 'all' || log.action === auditActionFilter;
    const matchesProject = auditProjectFilter === 'all' || log.project === auditProjectFilter;
    return matchesSearch && matchesModule && matchesAction && matchesProject;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);

  // Export CSV
  const handleExportCSV = () => {
    const csvHeaders = ['Timestamp', 'User', 'Project', 'Module', 'Action', 'Description', 'Status'];
    const rows = filteredLogs.map(l => [
      l.timestamp, 
      l.user, 
      l.project || 'Global', 
      l.module, 
      l.action, 
      l.description, 
      l.status
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [csvHeaders.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="audit-logs-container animate-fade-in">
      {/* Header Row */}
      <div className="audit-header-row">
        <div className="audit-header-left">
          <h2>Audit Trail Logs</h2>
          <p>Monitor security, configuration, and operational events across the portal.</p>
        </div>
        <button 
          className="action-btn-primary audit-export-btn" 
          onClick={handleExportCSV}
        >
          <Download size={16} />
          <span>Export Audit CSV</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="audit-filter-bar">
        <div className="audit-search-wrapper">
          <Search size={18} className="audit-search-icon" />
          <input 
            type="text" 
            placeholder="Search logs by description, user..." 
            value={auditSearch}
            onChange={(e) => { setAuditSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="audit-dropdowns-wrapper">
          <div className="audit-filter-group">
            <label>Project Site</label>
            <CustomSelect 
              value={auditProjectFilter}
              onChange={(e) => { setAuditProjectFilter(e.target.value); setCurrentPage(1); }}
              options={[
                { value: "all", label: "All Projects" },
                { value: "Global", label: "Global / System" },
                ...projects.map(p => ({ value: p, label: p }))
              ]}
            />
          </div>

          <div className="audit-filter-group">
            <label>Module</label>
            <CustomSelect 
              value={auditModuleFilter}
              onChange={(e) => { setAuditModuleFilter(e.target.value); setCurrentPage(1); }}
              options={[
                { value: "all", label: "All Modules" },
                { value: "Masters", label: "Masters" },
                { value: "Shifts", label: "Shifts" },
                { value: "Indents", label: "Indents" },
                { value: "Auth", label: "Auth" }
              ]}
            />
          </div>

          <div className="audit-filter-group">
            <label>Action</label>
            <CustomSelect 
              value={auditActionFilter}
              onChange={(e) => { setAuditActionFilter(e.target.value); setCurrentPage(1); }}
              options={[
                { value: "all", label: "All Actions" },
                { value: "CREATE", label: "CREATE" },
                { value: "UPDATE", label: "UPDATE" },
                { value: "APPROVE", label: "APPROVE" },
                { value: "REJECT", label: "REJECT" },
                { value: "LOGIN", label: "LOGIN" },
                { value: "BULK_UPLOAD", label: "BULK_UPLOAD" }
              ]}
            />
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card">
        <div className="table-responsive">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Project</th>
                <th>Module</th>
                <th>Action</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-6">Loading audit logs...</td>
                </tr>
              ) : currentItems.length > 0 ? (
                currentItems.map((log) => (
                  <tr key={log.id}>
                    <td className="table-date-cell">{log.timestamp}</td>
                    <td>
                      <div className="table-user-cell">
                        <span className="user-icon-avatar">{(log.user || 'U').charAt(0).toUpperCase()}</span>
                        <span className="username-text">{log.user}</span>
                      </div>
                    </td>
                    <td>
                      <span className="project-badge">{log.project || 'Global'}</span>
                    </td>
                    <td>{log.module}</td>
                    <td>
                      <span className={`action-badge ${log.action.toLowerCase()}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="table-desc-cell">{log.description}</td>
                    <td>
                      <span className={`status-badge ${log.status.toLowerCase()}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-6">No audit logs found matching the filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="table-pagination-row">
          <div className="pagination-info">
            Showing <span className="font-semibold">{filteredLogs.length > 0 ? indexOfFirstItem + 1 : 0}</span> to <span className="font-semibold">{Math.min(indexOfLastItem, filteredLogs.length)}</span> of <span className="font-semibold">{filteredLogs.length}</span> entries
          </div>
          
          <div className="pagination-controls-wrapper">
            <div className="page-size-selector">
              <span>Rows per page:</span>
              <CustomSelect 
                value={itemsPerPage} 
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                options={[
                  { value: 10, label: '10' },
                  { value: 20, label: '20' },
                  { value: 50, label: '50' }
                ]}
                style={{ width: '85px' }}
                compact
                placement="top"
              />
            </div>

            <div className="pagination-buttons">
              <button 
                type="button"
                className="pagination-btn" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, index, array) => {
                  const prevPage = array[index - 1];
                  const showEllipsis = prevPage && p - prevPage > 1;
                  return (
                    <React.Fragment key={p}>
                      {showEllipsis && <span className="pagination-ellipsis">...</span>}
                      <button 
                        type="button"
                        className={`pagination-btn ${currentPage === p ? 'active' : ''}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}

              <button 
                type="button"
                className="pagination-btn" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
