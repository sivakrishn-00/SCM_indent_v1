const apiBase = `http://${window.location.hostname}:8000/api/v1`;

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

const getHeaders = (options = {}) => {
  const token = sessionStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!headers['Content-Type'] && !(options.body instanceof URLSearchParams) && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

const handleResponse = async (res) => {
  if (!res.ok) {
    let errorData = null;
    try {
      errorData = await res.json();
    } catch (e) {}
    
    const detail = errorData ? errorData.detail : null;
    const errorMsg = errorData 
      ? (Array.isArray(errorData.detail) ? errorData.detail[0].msg : (typeof errorData.detail === 'string' ? errorData.detail : (errorData.detail?.message || 'Request failed')))
      : `HTTP error! Status: ${res.status}`;
    
    throw new ApiError(errorMsg, res.status, detail);
  }
  
  if (res.status === 204) return null;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await res.json();
  }
  return await res.text();
};

export const api = {
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint}`;
    const headers = getHeaders(options);
    const config = { ...options, headers };
    const res = await fetch(url, config);
    return handleResponse(res);
  },

  // Auth endpoints
  auth: {
    login(username, password) {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      return api.request('/auth/login', {
        method: 'POST',
        body: formData
      });
    },
    sendOtp(username, email) {
      return api.request('/auth/first-login-send-otp', {
        method: 'POST',
        body: JSON.stringify({ username, email })
      });
    },
    verifyOtp(username, email, otp) {
      return api.request('/auth/first-login-verify-otp', {
        method: 'POST',
        body: JSON.stringify({ username, email, otp })
      });
    }
  },

  // Audit Logs endpoints
  audit: {
    createLog(action, module, description, status = 'SUCCESS', project = 'Global') {
      return api.request('/audit/logs', {
        method: 'POST',
        body: JSON.stringify({ action, module, description, status, project })
      });
    },
    getLogs(project = '') {
      const query = project ? `?project=${encodeURIComponent(project)}` : '';
      return api.request(`/audit/logs${query}`);
    }
  },

  // Projects & Offices endpoints
  projects: {
    getProjects() {
      return api.request('/projects');
    },
    getOffices(projectName) {
      return api.request(`/projects/${encodeURIComponent(projectName)}/offices`);
    },
    getHierarchy(projectName) {
      return api.request(`/projects/${encodeURIComponent(projectName)}/hierarchy`);
    },
    getHierarchyPreview(projectName) {
      return api.request(`/projects/${encodeURIComponent(projectName)}/hierarchy-preview`);
    },
    getConfigs() {
      return api.request('/projects/configs');
    },
    saveConfig(projectName, skipRoles, stopRole, lowStockThreshold) {
      return api.request('/projects/configs', {
        method: 'POST',
        body: JSON.stringify({
          project_name: projectName,
          skip_roles: skipRoles,
          stop_role: stopRole,
          low_stock_threshold: lowStockThreshold
        })
      });
    }
  },

  // Office Inventory endpoints
  inventory: {
    getOfficeInventory(project = '', officeName = '') {
      const params = [];
      if (project) params.push(`project=${encodeURIComponent(project)}`);
      if (officeName) params.push(`office_name=${encodeURIComponent(officeName)}`);
      const query = params.length > 0 ? '?' + params.join('&') : '';
      return api.request(`/office-inventory${query}`);
    },
    initInventory(project, officeName, items) {
      return api.request('/office-inventory/initialize', {
        method: 'POST',
        body: JSON.stringify({
          project,
          office_name: officeName,
          items
        })
      });
    }
  },

  // Drugs endpoints
  drugs: {
    getDrugs(project = '', officeName = '') {
      const params = [];
      if (project) params.push(`project=${encodeURIComponent(project)}`);
      if (officeName) params.push(`office_name=${encodeURIComponent(officeName)}`);
      const query = params.length > 0 ? '?' + params.join('&') : '';
      return api.request(`/drugs${query}`);
    },
    createDrug(payload) {
      return api.request('/drugs', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    updateDrug(drugId, payload) {
      return api.request(`/drugs/${drugId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },
    bulkUpload(payload) {
      return api.request('/drugs/bulk', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    refill(payload) {
      return api.request('/drugs/refill', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  },

  // Transit Inventory endpoints
  transit: {
    getCurrent() {
      return api.request('/transit-inventory/current');
    },
    getPendingHandovers() {
      return api.request('/transit-inventory/handovers/pending');
    },
    getProposedHandoversPending() {
      return api.request('/transit-inventory/handovers/proposed/pending');
    },
    proposeHandover(recipientUsername, pin) {
      return api.request('/transit-inventory/handover/start', {
        method: 'POST',
        body: JSON.stringify({ recipient_username: recipientUsername, pin })
      });
    },
    acceptHandover() {
      return api.request('/transit-inventory/handover/accept', {
        method: 'POST'
      });
    },
    drawStock(project, officeName, items) {
      return api.request('/transit-inventory/draw', {
        method: 'POST',
        body: JSON.stringify({ project, office_name: officeName, items })
      });
    },
    returnStock(project, officeName, items) {
      return api.request('/transit-inventory/return', {
        method: 'POST',
        body: JSON.stringify({ project, office_name: officeName, items })
      });
    }
  },

  // Indents endpoints
  indents: {
    getIndents() {
      return api.request('/indents');
    },
    raiseIndentBatch(project, officeName, items, remarks = '') {
      return api.request('/indents/batch', {
        method: 'POST',
        body: JSON.stringify({
          project,
          office_name: officeName,
          items,
          remarks
        })
      });
    },
    approve(indentId) {
      return api.request(`/indents/${indentId}/approve`, {
        method: 'POST'
      });
    },
    reject(indentId) {
      return api.request(`/indents/${indentId}/reject`, {
        method: 'POST'
      });
    },
    dispatch(indentId, payload) {
      return api.request(`/indents/${indentId}/dispatch`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    receive(indentId) {
      return api.request(`/indents/${indentId}/receive`, {
        method: 'POST'
      });
    }
  },

  // Shifts endpoints
  shifts: {
    getReport(project = '', officeName = '', startDate = '', endDate = '') {
      const params = [];
      if (project) params.push(`project=${encodeURIComponent(project)}`);
      if (officeName && officeName !== 'Whole Project') params.push(`office_name=${encodeURIComponent(officeName)}`);
      if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
      if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
      const query = params.length > 0 ? '?' + params.join('&') : '';
      return api.request(`/shifts/report${query}`);
    },
    submitReport(project, officeName, shiftType, items, remarks = '', isDraft = false) {
      return api.request('/shifts/batch-log', {
        method: 'POST',
        body: JSON.stringify({
          project,
          office_name: officeName,
          shift_type: shiftType,
          items,
          remarks,
          is_draft: isDraft
        })
      });
    },
    getSubmissionsHistory(project = '') {
      const query = project ? `?project=${encodeURIComponent(project)}` : '';
      return api.request(`/shifts/submission/history${query}`);
    },
    getDrafts(project, officeName, shiftType) {
      return api.request(`/shifts/drafts?project=${encodeURIComponent(project)}&office_name=${encodeURIComponent(officeName)}&shift_type=${shiftType}`);
    }
  },

  // Reports
  reports: {
    getReportData(startDate, endDate, project = '', officeName = '') {
      const params = [
        `start_date=${encodeURIComponent(startDate)}`,
        `end_date=${encodeURIComponent(endDate)}`
      ];
      if (project) params.push(`project=${encodeURIComponent(project)}`);
      if (officeName && officeName !== 'Whole Project') params.push(`office_name=${encodeURIComponent(officeName)}`);
      return api.request(`/reports/consumption?` + params.join('&'));
    }
  },

  // Permissions endpoints
  permissions: {
    getPermissions(project = '') {
      const query = project ? `?project=${encodeURIComponent(project)}` : '';
      return api.request(`/users/permissions/all${query}`);
    },
    updateBatchPermissions(permissionsList) {
      return api.request('/users/permissions/batch', {
        method: 'PUT',
        body: JSON.stringify(permissionsList)
      });
    }
  },

  // Users endpoints
  users: {
    getUsers() {
      return api.request('/users');
    },
    getMeHierarchy() {
      return api.request('/users/me/hierarchy');
    },
    createUser(username, password, role, project, office) {
      return api.request('/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role, project, office_name: office })
      });
    },
    updateUser(userId, role, project, officeName) {
      return api.request(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role, project, office_name: officeName })
      });
    },
    deleteUser(userId) {
      return api.request(`/users/${userId}`, {
        method: 'DELETE'
      });
    },
    getEmployees(forceRefresh = false) {
      const query = forceRefresh ? '?refresh=true' : '';
      return api.request(`/users/employees${query}`);
    },
    activateEmployees(employeeCodes) {
      return api.request('/users/employees/activate', {
        method: 'POST',
        body: JSON.stringify({ employee_codes: employeeCodes })
      });
    },
    deactivateEmployees(employeeCodes) {
      return api.request('/users/employees/deactivate', {
        method: 'POST',
        body: JSON.stringify({ employee_codes: employeeCodes })
      });
    }
  },

  // Vehicles
  vehicles: {
    getVehicles() {
      return api.request('/vehicles');
    }
  },

  // Consumables
  consumables: {
    getConsumables() {
      return api.request('/consumables');
    }
  },

  // Masters Material Master endpoints
  masters: {
    getMasters() {
      return api.request('/masters');
    },
    createMaster(payload) {
      return api.request('/masters', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    updateMaster(masterId, payload) {
      return api.request(`/masters/${masterId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },
    deleteMaster(masterId) {
      return api.request(`/masters/${masterId}`, {
        method: 'DELETE'
      });
    },
    getWorkflowConfigs() {
      return api.request('/masters/workflow/configs');
    },
    saveWorkflowConfig(payload) {
      return api.request('/masters/workflow/configs', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  },

  // Roster / Shift Management
  roster: {
    getRoster(project, officeName, startDate, endDate, search = '') {
      const params = [
        `project=${encodeURIComponent(project)}`,
        `start_date=${encodeURIComponent(startDate)}`,
        `end_date=${encodeURIComponent(endDate)}`
      ];
      if (officeName && officeName !== 'all') params.push(`office_name=${encodeURIComponent(officeName)}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      return api.request(`/roster?${params.join('&')}`);
    },
    bulkCreate(project, officeName, assignments, remarks = '') {
      return api.request('/roster/bulk-create', {
        method: 'POST',
        body: JSON.stringify({ project, office_name: officeName, assignments, remarks })
      });
    },
    updateEntry(rosterId, payload) {
      return api.request(`/roster/${rosterId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },
    deleteEntry(rosterId) {
      return api.request(`/roster/${rosterId}`, {
        method: 'DELETE'
      });
    },
    swapShifts(rosterId1, rosterId2) {
      return api.request('/roster/swap', {
        method: 'POST',
        body: JSON.stringify({ roster_id_1: rosterId1, roster_id_2: rosterId2 })
      });
    },
    getEmployees(project, officeName = '') {
      const params = [`project=${encodeURIComponent(project)}`];
      if (officeName && officeName !== 'all') params.push(`office_name=${encodeURIComponent(officeName)}`);
      return api.request(`/roster/employees?${params.join('&')}`);
    },
    getMyShift() {
      return api.request('/roster/my-shift');
    },
    getIncomingOperator(project, officeName, shiftType) {
      return api.request(`/roster/incoming-operator?project=${encodeURIComponent(project)}&office_name=${encodeURIComponent(officeName)}&shift_type=${encodeURIComponent(shiftType)}`);
    }
  },

  // Bootstrap
  bootstrap() {
    return api.request('/bootstrap');
  }
};

export default api;
