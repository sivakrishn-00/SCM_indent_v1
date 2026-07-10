import React, { useState, useEffect } from 'react';
import { 
  Users as UsersIcon, 
  Search, 
  UserPlus, 
  UserMinus, 
  CheckCircle2, 
  XCircle, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw,
  Info
} from 'lucide-react';
import './Users.css';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';

export default function Users() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCodes, setSelectedCodes] = useState([]);
  
  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  
  // Sort and Pagination States
  const [sortField, setSortField] = useState('employee_code');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  
  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  // Fetch employees
  const fetchEmployees = async (forceRefresh = false) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.users.getEmployees(forceRefresh);
      setEmployees(data);
    } catch (err) {
      setError(err.message || 'Failed to connect to backend server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees(false);
  }, []);


  // Show temporary notification
  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  // Bulk Activation
  const handleBulkActivate = async () => {
    if (selectedCodes.length === 0) return;
    setActionLoading(true);
    try {
      const data = await api.users.activateEmployees(selectedCodes);
      showNotification(data.message || 'Successfully activated employees', 'success');
      setSelectedCodes([]);
      fetchEmployees();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk Deactivation
  const handleBulkDeactivate = async () => {
    if (selectedCodes.length === 0) return;
    setActionLoading(true);
    try {
      const data = await api.users.deactivateEmployees(selectedCodes);
      showNotification(data.message || 'Successfully deactivated employees', 'success');
      setSelectedCodes([]);
      fetchEmployees();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Selection helpers
  const handleSelectRow = (code) => {
    setSelectedCodes(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleSelectAll = (filteredRows) => {
    const filteredCodes = filteredRows.map(r => r.employee_code);
    const allSelected = filteredCodes.every(code => selectedCodes.includes(code));
    
    if (allSelected) {
      // Unselect all filtered
      setSelectedCodes(prev => prev.filter(code => !filteredCodes.includes(code)));
    } else {
      // Select all filtered
      setSelectedCodes(prev => {
        const newSelection = [...prev];
        filteredCodes.forEach(code => {
          if (!newSelection.includes(code)) {
            newSelection.push(code);
          }
        });
        return newSelection;
      });
    }
  };

  // Sorting helper
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Get unique projects for filter
  const uniqueProjects = Array.from(
    new Set(employees.map(emp => emp.project_name).filter(Boolean))
  ).sort();

  // Get unique roles & offices filtered by the selected project
  const availableRoles = Array.from(
    new Set(
      employees
        .filter(emp => projectFilter === 'all' || emp.project_name === projectFilter)
        .map(emp => emp.role_name)
        .filter(Boolean)
    )
  ).sort();

  const availableOffices = Array.from(
    new Set(
      employees
        .filter(emp => projectFilter === 'all' || emp.project_name === projectFilter)
        .map(emp => emp.office_location)
        .filter(Boolean)
    )
  ).sort();

  // Reset dependent filters when project changes
  useEffect(() => {
    setRoleFilter('all');
    setOfficeFilter('all');
  }, [projectFilter]);

  // Filter and sort employees
  const filteredEmployees = employees
    .filter(emp => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        emp.employee_code.toLowerCase().includes(query) ||
        emp.name.toLowerCase().includes(query) ||
        emp.email.toLowerCase().includes(query) ||
        emp.project_name.toLowerCase().includes(query) ||
        emp.role_name.toLowerCase().includes(query) ||
        (emp.office_name && emp.office_name.toLowerCase().includes(query)) ||
        (emp.office_location && emp.office_location.toLowerCase().includes(query));

      const matchesStatus = 
        statusFilter === 'all' ||
        (statusFilter === 'active' && emp.is_active_in_app) ||
        (statusFilter === 'inactive' && !emp.is_active_in_app);

      const matchesProject = 
        projectFilter === 'all' || 
        emp.project_name === projectFilter;

      const matchesRole = 
        roleFilter === 'all' || 
        emp.role_name === roleFilter;

      const matchesOffice = 
        officeFilter === 'all' || 
        emp.office_location === officeFilter;

      return matchesSearch && matchesStatus && matchesProject && matchesRole && matchesOffice;
    })
    .sort((a, b) => {
      let fieldA = a[sortField];
      let fieldB = b[sortField];

      if (typeof fieldA === 'boolean') {
        fieldA = fieldA ? 1 : 0;
        fieldB = fieldB ? 1 : 0;
      } else {
        fieldA = (fieldA || '').toString().toLowerCase();
        fieldB = (fieldB || '').toString().toLowerCase();
      }

      if (fieldA < fieldB) return sortDirection === 'asc' ? -1 : 1;
      if (fieldA > fieldB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  // Pagination calculation
  const totalItems = filteredEmployees.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedEmployees = filteredEmployees.slice(startIndex, endIndex);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, projectFilter, roleFilter, officeFilter, pageSize]);


  return (
    <div className="users-page-container">
      {/* Slide-in Notification Alert */}
      {notification.show && (
        <div className={`custom-toast ${notification.type}`}>
          {notification.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="section-header-row">
        <div className="section-header-left">
          <h2>User & Employee Access</h2>
          <p>Verify and manage application login access for organizational employees</p>
        </div>
        <div className="section-header-actions">
          <button className="action-btn-secondary" onClick={() => fetchEmployees(true)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-animation' : ''} />
            <span>Refresh</span>
          </button>
        </div>

      </div>

      {/* Stats and Action Panel */}
      <div className="users-control-card">
        {/* Bulk Action Controls */}
        <div className="bulk-actions-wrapper">
          <div className="selection-info-badge">
            <Info size={16} />
            <span>{selectedCodes.length} employees selected</span>
          </div>
          <div className="bulk-btn-group">
            <button 
              className="bulk-action-btn btn-activate" 
              onClick={handleBulkActivate}
              disabled={selectedCodes.length === 0 || actionLoading}
            >
              <UserPlus size={16} />
              <span>Activate Access</span>
            </button>
            <button 
              className="bulk-action-btn btn-deactivate" 
              onClick={handleBulkDeactivate}
              disabled={selectedCodes.length === 0 || actionLoading}
            >
              <UserMinus size={16} />
              <span>Deactivate Access</span>
            </button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="filters-layout-row">
          <div className="search-box-group">
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              className="search-input-field" 
              placeholder="Search by code, name, email, project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-dropdowns-group">
            <div className="filter-select-wrapper">
              <label>App Access</label>
              <CustomSelect 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active in App" },
                  { value: "inactive", label: "Inactive / No Access" }
                ]}
              />
            </div>

            <div className="filter-select-wrapper">
              <label>Project Site</label>
              <CustomSelect 
                value={projectFilter} 
                onChange={(e) => setProjectFilter(e.target.value)}
                options={[
                  { value: "all", label: "All Projects" },
                  ...uniqueProjects.map(proj => ({ value: proj, label: proj }))
                ]}
              />
            </div>

            <div className="filter-select-wrapper">
              <label>EMS Role</label>
              <CustomSelect 
                value={roleFilter} 
                onChange={(e) => setRoleFilter(e.target.value)}
                options={[
                  { value: "all", label: "All Roles" },
                  ...availableRoles.map(role => ({ value: role, label: role }))
                ]}
              />
            </div>

            <div className="filter-select-wrapper">
              <label>Office / Location</label>
              <CustomSelect 
                value={officeFilter} 
                onChange={(e) => setOfficeFilter(e.target.value)}
                options={[
                  { value: "all", label: "All Locations" },
                  ...availableOffices.map(office => ({ value: office, label: office }))
                ]}
              />
            </div>

          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="heavy-table-card">
        {loading ? (
          <div className="table-loading-overlay">
            <div className="bavya-spinner" style={{ margin: '0 auto 12px' }}>
              <div className="petal petal-tl"></div>
              <div className="petal petal-tr"></div>
              <div className="petal petal-bl"></div>
              <div className="petal petal-br"></div>
            </div>
            <span>Fetching employee data from EMS...</span>
          </div>
        ) : error ? (
          <div className="table-error-state">
            <XCircle size={40} className="error-icon" />
            <h3>Failed to Load Employees</h3>
            <p>{error}</p>
            <button className="action-btn-primary" onClick={fetchEmployees}>
              Retry Connection
            </button>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="table-empty-state">
            <UsersIcon size={40} className="empty-icon" />
            <h3>No Employees Found</h3>
            <p>No records matched your search query or selected filters.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th className="checkbox-column">
                      <input 
                        type="checkbox" 
                        checked={
                          filteredEmployees.length > 0 && 
                          filteredEmployees.every(r => selectedCodes.includes(r.employee_code))
                        }
                        onChange={() => handleSelectAll(filteredEmployees)}
                      />
                    </th>
                    <th className="sortable-header" onClick={() => handleSort('employee_code')}>
                      <div className="header-cell-inner">
                        <span>Employee Code</span>
                        {sortField === 'employee_code' && (
                          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </div>
                    </th>
                    <th className="sortable-header" onClick={() => handleSort('name')}>
                      <div className="header-cell-inner">
                        <span>Name & Contact</span>
                        {sortField === 'name' && (
                          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </div>
                    </th>
                    <th className="sortable-header" onClick={() => handleSort('project_name')}>
                      <div className="header-cell-inner">
                        <span>Project Site</span>
                        {sortField === 'project_name' && (
                          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </div>
                    </th>
                    <th className="sortable-header" onClick={() => handleSort('office_name')}>
                      <div className="header-cell-inner">
                        <span>Office & Location</span>
                        {sortField === 'office_name' && (
                          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </div>
                    </th>
                    <th className="sortable-header" onClick={() => handleSort('role_name')}>
                      <div className="header-cell-inner">
                        <span>EMS Role</span>
                        {sortField === 'role_name' && (
                          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </div>
                    </th>

                    <th className="sortable-header text-center" onClick={() => handleSort('is_active_in_app')}>
                      <div className="header-cell-inner center">
                        <span>App Access</span>
                        {sortField === 'is_active_in_app' && (
                          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmployees.map(emp => (
                    <tr 
                      key={emp.employee_code} 
                      className={selectedCodes.includes(emp.employee_code) ? 'row-selected' : ''}
                    >
                      <td className="checkbox-column">
                        <input 
                          type="checkbox" 
                          checked={selectedCodes.includes(emp.employee_code)}
                          onChange={() => handleSelectRow(emp.employee_code)}
                        />
                      </td>
                      <td className="code-cell font-semibold">
                        {emp.employee_code}
                      </td>
                      <td>
                        <div className="employee-info-cell">
                          <span className="emp-name">{emp.name}</span>
                          <span className="emp-email">{emp.email}</span>
                          <span className="emp-phone">{emp.phone}</span>
                        </div>
                      </td>
                      <td>
                        <span className="project-badge-tag">
                          {emp.project_name}
                        </span>
                      </td>
                      <td>
                        <div className="office-info-cell">
                          <span className="office-name-text">{emp.office_name}</span>
                          <span className="office-loc-text">{emp.office_location}</span>
                        </div>
                      </td>
                      <td>
                        <span className="ems-role-text">
                          {emp.role_name}
                        </span>
                      </td>

                      <td className="text-center">
                        <span className={`access-badge ${emp.is_active_in_app ? 'active' : 'inactive'}`}>
                          {emp.is_active_in_app ? 'ACTIVE' : 'NO ACCESS'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Row */}
            <div className="table-pagination-row">
              <div className="pagination-info">
                Showing <span className="font-semibold">{startIndex + 1}</span> to <span className="font-semibold">{endIndex}</span> of <span className="font-semibold">{totalItems}</span> employees
              </div>
              
              <div className="pagination-controls-wrapper">
                <div className="page-size-selector">
                  <span>Rows per page:</span>
                  <CustomSelect 
                    value={pageSize} 
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
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
                    className="pagination-btn"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, index, array) => {
                      // Insert ellipses
                      const showEllipsis = index > 0 && p - array[index - 1] > 1;
                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span className="pagination-ellipsis">...</span>}
                          <button 
                            className={`pagination-btn page-num ${currentPage === p ? 'active' : ''}`}
                            onClick={() => setCurrentPage(p)}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  <button 
                    className="pagination-btn"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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
