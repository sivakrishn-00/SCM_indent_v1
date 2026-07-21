import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useApp } from '../../context/AppContext';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';
import './PermissionsPage.css';

export default function PermissionsPage() {
  const {
    projects,
    setPermissions,
    addAuditLog,
    userRole,
  } = useApp();

  const [selectedRole, setSelectedRole] = useState('project_manager');
  const [selectedProjectPerm, setSelectedProjectPerm] = useState(projects[0] || 'AP-1962');
  const [localPerms, setLocalPerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPermsForProject = async (proj) => {
    setLoadingPerms(true);
    try {
      const data = await api.permissions.getPermissions(proj);
      setLocalPerms(data);
      const unique = Array.from(new Set(data.map(p => p.role)));
      if (unique.length > 0) {
        if (!unique.includes(selectedRole)) {
          setSelectedRole(unique[0]);
        }
      }
    } catch (err) {
      console.error("Error fetching permissions:", err);
      toast.error("Failed to load permissions for the selected project.");
    } finally {
      setLoadingPerms(false);
    }
  };

  useEffect(() => {
    if (selectedProjectPerm) {
      fetchPermsForProject(selectedProjectPerm);
    }
  }, [selectedProjectPerm]);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectPerm) {
      setSelectedProjectPerm(projects[0]);
    }
  }, [projects]);

  // Extract unique roles from permissions dynamically
  const uniqueRoles = Array.from(new Set(localPerms.map(p => p.role)));
  const rolesList = uniqueRoles.map(role => {
    let label = role;
    if (role.toLowerCase() === 'admin') {
      label = 'Administrator';
    } else {
      // Format role dynamically by replacing dashes/underscores with spaces and capitalizing
      label = role
        .split(/[_-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    return { id: role, label };
  });

  const handleCheckboxChange = (permId, field, value) => {
    setLocalPerms(prev => prev.map(p => {
      if (p.id === permId) {
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  // Bulk toggle for a specific action (e.g. view, create) across all pages of the current role
  const handleBulkColumnToggle = (field, checked) => {
    setLocalPerms(prev => prev.map(p => {
      if (p.role === selectedRole) {
        return { ...p, [field]: checked };
      }
      return p;
    }));
  };

  // Enable/Disable all permissions for the selected role
  const handleRoleBulkAction = (enable) => {
    setLocalPerms(prev => prev.map(p => {
      if (p.role === selectedRole) {
        return {
          ...p,
          can_view: enable,
          can_create: enable,
          can_update: enable,
          can_delete: enable
        };
      }
      return p;
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.permissions.updateBatchPermissions(localPerms);
      toast.success(`Permissions updated successfully for ${selectedProjectPerm}!`);
      setPermissions(localPerms);
      
      // Log permission changes in audit logs
      addAuditLog(
        'UPDATE_PERMISSIONS',
        'Users',
        `Updated page permissions for role: ${selectedRole.toUpperCase()} under project ${selectedProjectPerm}`,
        'SUCCESS',
        selectedProjectPerm
      );
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error saving permissions.");
    } finally {
      setSaving(false);
    }
  };

  const rolePerms = localPerms.filter(p => p.role === selectedRole);
  const filteredRolePerms = rolePerms.filter(p => {
    const pageName = p.page === 'shift' ? 'Shift Consumption' : p.page;
    return pageName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Helper checks for column header select-alls
  const isAllChecked = (field) => {
    if (rolePerms.length === 0) return false;
    return rolePerms.every(p => p[field]);
  };

  if (userRole !== 'admin') {
    return (
      <div style={{ padding: '24px', color: '#f43f5e', fontWeight: 'bold' }}>
        Unauthorized: Admin access required.
      </div>
    );
  }

  return (
    <div className="tab-pane permissions-tab-pane" style={{ animation: 'fadeIn 0.2s ease-out', width: '100%' }}>
      <div className="section-header-flex" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
        <div className="section-header-left">
          <h2>Role Permissions</h2>
          <p>Manage and configure page-level access permissions for different user roles.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
        {/* Project Selector Bar */}
        <div className="form-container-card permissions-project-bar" style={{ padding: '16px 20px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Project Site:
            </span>
            <CustomSelect
              value={selectedProjectPerm}
              onChange={e => setSelectedProjectPerm(e.target.value)}
              options={projects.map(proj => ({ value: proj, label: proj }))}
              style={{ minWidth: '220px' }}
            />
          </div>
          {loadingPerms && (
            <span style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--primary)', animation: 'pulse 1.5s infinite' }}>
              Syncing permissions...
            </span>
          )}
        </div>

        <div className="permissions-layout-grid">
          {/* Sidebar Roles Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              System Roles
            </div>
            {rolesList.map(r => {
              const isActive = selectedRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRole(r.id)}
                  style={{
                    padding: '14px 18px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: isActive ? 'var(--primary)' : '#e2e8f0',
                    background: isActive ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)' : '#ffffff',
                    color: isActive ? 'var(--primary-dark)' : '#475569',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontWeight: isActive ? '700' : '600',
                    fontSize: '13.5px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.15s ease-out',
                    boxShadow: isActive ? '0 4px 12px rgba(16, 185, 129, 0.08)' : 'none'
                  }}
                >
                  <span>{r.label}</span>
                  <span style={{ 
                    fontSize: '9.5px', 
                    fontWeight: '700', 
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background: isActive ? 'var(--primary)' : '#f1f5f9',
                    color: isActive ? '#ffffff' : '#64748b',
                    letterSpacing: '0.02em',
                    transition: 'all 0.15s ease'
                  }}>
                    {r.id.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Permissions Grid Panel */}
          <div className="table-card" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            {/* Editor Header & Quick Actions */}
            <div className="permissions-header-row" style={{ 
              padding: '16px 20px', 
              borderBottom: '1px solid #f1f5f9', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Access Matrix for {rolesList.find(r => r.id === selectedRole)?.label || selectedRole}
                </h3>
                {selectedRole !== 'admin' && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                    <button 
                      type="button"
                      onClick={() => handleRoleBulkAction(true)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      Allow All
                    </button>
                    <span style={{ color: '#e2e8f0' }}>|</span>
                    <button 
                      type="button"
                      onClick={() => handleRoleBulkAction(false)}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#f43f5e', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      Revoke All
                    </button>
                  </div>
                )}
              </div>

              <div className="actions-group" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Table search filter */}
                <input 
                  type="text"
                  placeholder="Search modules..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    width: '180px',
                    outline: 'none',
                    transition: 'border-color 0.15s ease'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSave}
                  className="action-btn-primary"
                  disabled={saving}
                  style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {saving ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </div>

            {/* High Datatable for access permissions */}
            <div className="table-scroll-container">
              <table className="portal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 20px', fontSize: '11.5px', fontWeight: '800', textTransform: 'uppercase', color: '#475569', textAlign: 'left', letterSpacing: '0.05em' }}>
                      Page Module
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: '800', textTransform: 'uppercase', color: '#475569', textAlign: 'center', width: '130px', letterSpacing: '0.05em' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span>View</span>
                        <input 
                          type="checkbox"
                          checked={isAllChecked('can_view')}
                          disabled={selectedRole === 'admin'}
                          onChange={e => handleBulkColumnToggle('can_view', e.target.checked)}
                          style={{ width: '14px', height: '14px', cursor: selectedRole === 'admin' ? 'not-allowed' : 'pointer', accentColor: 'var(--primary)' }}
                          title="Toggle View column for all pages"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: '800', textTransform: 'uppercase', color: '#475569', textAlign: 'center', width: '130px', letterSpacing: '0.05em' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span>Create</span>
                        <input 
                          type="checkbox"
                          checked={isAllChecked('can_create')}
                          disabled={selectedRole === 'admin'}
                          onChange={e => handleBulkColumnToggle('can_create', e.target.checked)}
                          style={{ width: '14px', height: '14px', cursor: selectedRole === 'admin' ? 'not-allowed' : 'pointer', accentColor: 'var(--primary)' }}
                          title="Toggle Create column for all pages"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: '800', textTransform: 'uppercase', color: '#475569', textAlign: 'center', width: '130px', letterSpacing: '0.05em' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span>Update</span>
                        <input 
                          type="checkbox"
                          checked={isAllChecked('can_update')}
                          disabled={selectedRole === 'admin'}
                          onChange={e => handleBulkColumnToggle('can_update', e.target.checked)}
                          style={{ width: '14px', height: '14px', cursor: selectedRole === 'admin' ? 'not-allowed' : 'pointer', accentColor: 'var(--primary)' }}
                          title="Toggle Update column for all pages"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: '800', textTransform: 'uppercase', color: '#475569', textAlign: 'center', width: '130px', letterSpacing: '0.05em' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span>Delete</span>
                        <input 
                          type="checkbox"
                          checked={isAllChecked('can_delete')}
                          disabled={selectedRole === 'admin'}
                          onChange={e => handleBulkColumnToggle('can_delete', e.target.checked)}
                          style={{ width: '14px', height: '14px', cursor: selectedRole === 'admin' ? 'not-allowed' : 'pointer', accentColor: 'var(--primary)' }}
                          title="Toggle Delete column for all pages"
                        />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRolePerms.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' }}>
                        {searchQuery ? 'No matching pages found.' : 'No permissions loaded.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRolePerms.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s ease' }}>
                        <td style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
                          <span style={{ textTransform: 'capitalize' }}>
                            {p.page === 'shift' ? 'Shift Consumption' : 
                             p.page === 'masters' ? 'Material Master' :
                             p.page === 'workflow' ? 'Workflow Config' :
                             p.page === 'inventory' ? 'Office Inventory' :
                             p.page}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <label className="toggle-switch-label" style={{ display: 'inline-block', position: 'relative', width: '36px', height: '20px' }}>
                            <input 
                              type="checkbox" 
                              checked={p.can_view} 
                              disabled={selectedRole === 'admin'}
                              onChange={e => handleCheckboxChange(p.id, 'can_view', e.target.checked)}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                              position: 'absolute', cursor: selectedRole === 'admin' ? 'not-allowed' : 'pointer',
                              top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: p.can_view ? 'var(--primary)' : '#cbd5e1',
                              transition: '.2s', borderRadius: '20px',
                              boxShadow: p.can_view ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none'
                            }}>
                              <span style={{
                                position: 'absolute', content: '""', height: '14px', width: '14px',
                                left: p.can_view ? '18px' : '4px', bottom: '3px',
                                backgroundColor: 'white', transition: '.2s', borderRadius: '50%'
                              }} />
                            </span>
                          </label>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <label className="toggle-switch-label" style={{ display: 'inline-block', position: 'relative', width: '36px', height: '20px' }}>
                            <input 
                              type="checkbox" 
                              checked={p.can_create} 
                              disabled={selectedRole === 'admin'}
                              onChange={e => handleCheckboxChange(p.id, 'can_create', e.target.checked)}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                              position: 'absolute', cursor: selectedRole === 'admin' ? 'not-allowed' : 'pointer',
                              top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: p.can_create ? 'var(--primary)' : '#cbd5e1',
                              transition: '.2s', borderRadius: '20px',
                              boxShadow: p.can_create ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none'
                            }}>
                              <span style={{
                                position: 'absolute', content: '""', height: '14px', width: '14px',
                                left: p.can_create ? '18px' : '4px', bottom: '3px',
                                backgroundColor: 'white', transition: '.2s', borderRadius: '50%'
                              }} />
                            </span>
                          </label>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <label className="toggle-switch-label" style={{ display: 'inline-block', position: 'relative', width: '36px', height: '20px' }}>
                            <input 
                              type="checkbox" 
                              checked={p.can_update} 
                              disabled={selectedRole === 'admin'}
                              onChange={e => handleCheckboxChange(p.id, 'can_update', e.target.checked)}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                              position: 'absolute', cursor: selectedRole === 'admin' ? 'not-allowed' : 'pointer',
                              top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: p.can_update ? 'var(--primary)' : '#cbd5e1',
                              transition: '.2s', borderRadius: '20px',
                              boxShadow: p.can_update ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none'
                            }}>
                              <span style={{
                                position: 'absolute', content: '""', height: '14px', width: '14px',
                                left: p.can_update ? '18px' : '4px', bottom: '3px',
                                backgroundColor: 'white', transition: '.2s', borderRadius: '50%'
                              }} />
                            </span>
                          </label>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <label className="toggle-switch-label" style={{ display: 'inline-block', position: 'relative', width: '36px', height: '20px' }}>
                            <input 
                              type="checkbox" 
                              checked={p.can_delete} 
                              disabled={selectedRole === 'admin'}
                              onChange={e => handleCheckboxChange(p.id, 'can_delete', e.target.checked)}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                              position: 'absolute', cursor: selectedRole === 'admin' ? 'not-allowed' : 'pointer',
                              top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: p.can_delete ? 'var(--primary)' : '#cbd5e1',
                              transition: '.2s', borderRadius: '20px',
                              boxShadow: p.can_delete ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none'
                            }}>
                              <span style={{
                                position: 'absolute', content: '""', height: '14px', width: '14px',
                                left: p.can_delete ? '18px' : '4px', bottom: '3px',
                                backgroundColor: 'white', transition: '.2s', borderRadius: '50%'
                              }} />
                            </span>
                          </label>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
