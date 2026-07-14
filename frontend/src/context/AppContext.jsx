import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ user, onLogout, children }) {
  // ──── Core Data ────
  const [vehicles, setVehicles] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [shiftDrugs, setShiftDrugs] = useState([]);
  const [indents, setIndents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [dashboardShifts, setDashboardShifts] = useState([]);

  // ──── User / Hierarchy ────
  const [isLeafNode, setIsLeafNode] = useState(false);
  const [projectConfigs, setProjectConfigs] = useState([]);
  const [approvalChainRaw, setApprovalChainRaw] = useState([]);
  const [userOffice, setUserOffice] = useState({ name: 'N/A', location: 'N/A' });
  const [userProject, setUserProject] = useState(null);
  const [userFullName, setUserFullName] = useState('');

  // ──── Office Inventory ────
  const [officeInventory, setOfficeInventory] = useState([]);
  const [loadingOfficeInventory, setLoadingOfficeInventory] = useState(false);
  const [officeInitProject, setOfficeInitProject] = useState('');
  const [officeInitOffice, setOfficeInitOffice] = useState('');
  const [officeInitOfficesList, setOfficeInitOfficesList] = useState([]);
  const [officeInitQuantities, setOfficeInitQuantities] = useState({});

  // ──── Transit Inventory ────
  const [transitInventory, setTransitInventory] = useState([]);
  const [pendingHandover, setPendingHandover] = useState(null);
  const [hasProposedHandover, setHasProposedHandover] = useState(false);
  const [shiftStatus, setShiftStatus] = useState('active');
  const [selectedShiftItems, setSelectedShiftItems] = useState({});

  // ──── Loading / Action ────
  const [loadingData, setLoadingData] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // ──── Lazy Loading States ────
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingConsumables, setLoadingConsumables] = useState(false);
  const [loadingIndents, setLoadingIndents] = useState(false);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [loadingShifts, setLoadingShifts] = useState(false);

  // ──── Derived values ────
  const getCleanRole = () => {
    if (!user) return 'operator';
    const r = String(user.role);
    if (r.toLowerCase() === 'admin') return 'admin';
    return r;
  };
  const userRole = getCleanRole();

  const isWarehouseUser =
    user?.role === 'admin' ||
    user?.username === 'admin' ||
    (userOffice?.name && (
      userOffice.name.toLowerCase().includes('central ware house') ||
      userOffice.name.toLowerCase().includes('central warehouse')
    )) ||
    (userOffice?.location && (
      userOffice.location.toLowerCase().includes('central ware house') ||
      userOffice.location.toLowerCase().includes('central warehouse')
    ));

  const canRaiseIndent =
    isLeafNode &&
    !isWarehouseUser &&
    userRole !== 'admin' &&
    user?.role !== 'admin' &&
    user?.username !== 'admin' &&
    !userRole.toLowerCase().includes('manager') &&
    !user?.role?.toLowerCase().includes('manager') &&
    !userRole.toLowerCase().includes('warehouse') &&
    !user?.role?.toLowerCase().includes('warehouse');

  const hasPermission = (page, action = 'view') => {
    if (userRole === 'admin') return true;
    if (page === 'overview' && action === 'view') return true;
    if (isWarehouseUser && (page === 'indents' || page === 'overview' || page === 'reports')) {
      return true;
    }
    if (!permissions || permissions.length === 0) {
      if (page === 'shift' || page === 'indents') return true;
      return false;
    }
    const perm = permissions.find(p => p.role.toLowerCase() === userRole.toLowerCase() && p.page === page);
    if (!perm) return false;
    if (action === 'view') return perm.can_view;
    if (action === 'create') return perm.can_create;
    if (action === 'update') return perm.can_update;
    if (action === 'delete') return perm.can_delete;
    return false;
  };


  const addAuditLog = async (action, module, description, status = 'SUCCESS', logProject = '') => {
    try {
      await api.audit.createLog(action, module, description, status, logProject || selectedProject || 'Global');
    } catch (err) {
      console.error("Failed to post audit log:", err);
    }
  };

  // ──── Core Fetchers ────
  const fetchOfficeInventory = async (proj = '', off = '') => {
    setLoadingOfficeInventory(true);
    try {
      const data = await api.inventory.getOfficeInventory(proj, off);
      setOfficeInventory(data);
      if (proj && off) {
        fetchShiftDrugsRaw(proj, off);
        try {
          let activeShift = 'shift_1';
          try {
            const rosterRes = await api.roster.getMyShift();
            if (rosterRes && rosterRes.assigned && rosterRes.shift_type) {
              activeShift = rosterRes.shift_type;
            }
          } catch (rosterErr) {
            console.error("Error fetching roster shift in inventory context:", rosterErr);
          }

          const draftData = await api.shifts.getDrafts(proj, off, activeShift);
          const mergedItems = {};
          const processDraft = (dData) => {
            const draftItems = dData.items || {};
            Object.entries(draftItems).forEach(([id, val]) => {
              if (typeof val === 'object' && val !== null) {
                const c = val.consumed_qty !== undefined ? Math.round(val.consumed_qty) : 0;
                const r = val.received_qty !== undefined ? Math.round(val.received_qty) : 0;
                const s = val.sent_back_qty !== undefined ? Math.round(val.sent_back_qty) : 0;
                if (c > 0 || r > 0 || s > 0) {
                  mergedItems[id] = {
                    consumed: c > 0 ? c.toString() : '',
                    received: r > 0 ? r.toString() : '',
                    sent_back: s > 0 ? s.toString() : '',
                    isSelected: true
                  };
                }
              } else {
                const c = val !== undefined ? Math.round(parseFloat(val)) : 0;
                if (c > 0) {
                  mergedItems[id] = {
                    consumed: c.toString(),
                    received: '',
                    sent_back: '',
                    isSelected: true
                  };
                }
              }
            });
          };
          processDraft(draftData);
          setSelectedShiftItems(mergedItems);
        } catch (draftErr) {
          console.error("Error loading shift drafts in inventory page context:", draftErr);
        }
      }
    } catch (err) {
      console.error("Error loading office inventory:", err);
      setOfficeInventory([]);
    } finally {
      setLoadingOfficeInventory(false);
    }
  };

  const fetchShiftDrugsRaw = async (proj, off) => {
    try {
      const data = await api.drugs.getDrugs(proj, off);
      setShiftDrugs(data);
    } catch (err) {
      console.error("Error fetching shift drugs:", err);
    }
  };

  const fetchTransitInventory = async () => {
    try {
      const data = await api.transit.getCurrent();
      setTransitInventory(data);
    } catch (err) {
      console.error("Error reading transit inventory:", err);
    }
  };

  const fetchPendingHandovers = async () => {
    try {
      const data = await api.transit.getPendingHandovers();
      if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0)) {
        setPendingHandover(null);
      } else {
        setPendingHandover(data);
      }
    } catch (err) {
      console.error("Error reading pending handovers:", err);
      setPendingHandover(null);
    }
    try {
      const proposedData = await api.transit.getProposedHandoversPending();
      if (Array.isArray(proposedData) && proposedData.length > 0) {
        setHasProposedHandover(true);
      } else {
        setHasProposedHandover(false);
      }
    } catch (err) {
      console.error("Error reading proposed handovers:", err);
      setHasProposedHandover(false);
    }
  };

  const fetchInitOffices = async (projectName) => {
    try {
      const data = await api.projects.getOffices(projectName);
      setOfficeInitOfficesList(data);
      if (data.length > 0) {
        if (userOffice?.name && userOffice.name !== 'N/A') {
          setOfficeInitOffice(userOffice.name);
        } else {
          setOfficeInitOffice(data[0].name);
        }
      } else {
        setOfficeInitOffice('');
      }
    } catch (err) {
      console.error(err);
      setOfficeInitOfficesList([]);
      setOfficeInitOffice('');
    }
  };

  const fetchVehicles = async () => {
    setLoadingVehicles(true);
    try {
      const data = await api.vehicles.getVehicles();
      setVehicles(data || []);
    } catch (err) {
      console.error("Error fetching vehicles:", err);
    } finally {
      setLoadingVehicles(false);
    }
  };

  const fetchConsumables = async () => {
    setLoadingConsumables(true);
    try {
      const data = await api.consumables.getConsumables();
      setConsumables(data || []);
    } catch (err) {
      console.error("Error fetching consumables:", err);
    } finally {
      setLoadingConsumables(false);
    }
  };

  const fetchIndents = async () => {
    setLoadingIndents(true);
    try {
      const data = await api.indents.getIndents();
      const mapped = (data || []).map(ind => ({
        ...ind,
        quantity_requested: ind.requested_qty || ind.quantity_requested
      }));
      setIndents(mapped);
    } catch (err) {
      console.error("Error fetching indents:", err);
    } finally {
      setLoadingIndents(false);
    }
  };

  const fetchDrugs = async (proj = '', off = '') => {
    setLoadingDrugs(true);
    try {
      const data = await api.drugs.getDrugs(proj, off);
      setDrugs(data || []);
    } catch (err) {
      console.error("Error fetching drugs:", err);
    } finally {
      setLoadingDrugs(false);
    }
  };

  const fetchShifts = async (proj = '') => {
    setLoadingShifts(true);
    try {
      const data = await api.shifts.getReport(proj);
      setDashboardShifts(data || []);
    } catch (err) {
      console.error("Error fetching shifts:", err);
    } finally {
      setLoadingShifts(false);
    }
  };

  const fetchDashboardData = async (isSilent = false) => {
    if (!isSilent) setLoadingData(true);
    try {
      const bootstrapData = await api.bootstrap();
      
      const projectsData = bootstrapData.projects || [];
      const permissionsData = bootstrapData.permissions || [];
      const hierarchyData = bootstrapData.hierarchy || null;
      const configsData = bootstrapData.configs || [];
      const shiftStatusData = bootstrapData.shift_status || 'active';

      setProjects(projectsData);
      if (projectsData.length > 0) setSelectedProject(projectsData[0]);
      setPermissions(permissionsData);
      setShiftStatus(shiftStatusData);

      if (hierarchyData) {
        setIsLeafNode(hierarchyData.is_leaf);
        setApprovalChainRaw(hierarchyData.approval_chain_raw || []);
        setUserProject(hierarchyData.project || null);
        setUserFullName(hierarchyData.logged_in_name || hierarchyData.username || '');
        setUserOffice({
          name: hierarchyData.office_name || 'N/A',
          location: hierarchyData.office_location || 'N/A'
        });
        if (hierarchyData.project) setOfficeInitProject(hierarchyData.project);
        if (hierarchyData.office_name && hierarchyData.office_name !== 'N/A') setOfficeInitOffice(hierarchyData.office_name);
        if (hierarchyData.project && hierarchyData.office_name && hierarchyData.office_name !== 'N/A') {
          fetchOfficeInventory(hierarchyData.project, hierarchyData.office_name);
          fetchTransitInventory();
          fetchPendingHandovers();
        }
      }

      if (configsData) {
        setProjectConfigs(configsData);
      }

      // Stream transactional data in background to prevent initial page blocking
      fetchVehicles();
      fetchIndents();
      fetchShifts();
      fetchConsumables();
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      if (error && error.message && (error.message.includes('401') || error.message.includes('403') || error.message.includes('JWT') || error.message.includes('token') || error.message.includes('Unauthorized'))) {
        toast.error("Session expired. Please log in again.");
        onLogout();
      }
    } finally {
      if (!isSilent) setLoadingData(false);
    }
  };

  // ──── Office init offices effect ────
  useEffect(() => {
    if (officeInitProject) {
      fetchInitOffices(officeInitProject);
    } else {
      setOfficeInitOfficesList([]);
      setOfficeInitOffice('');
    }
  }, [officeInitProject]);

  // ──── Initial data fetch ────
  useEffect(() => {
    fetchDashboardData();
  }, []);

  // ──── Batch row helpers (office inventory init modal) ────
  const updateBatchRow = (drugId, index, field, value) => {
    setOfficeInitQuantities(prev => {
      const list = prev[drugId] ? [...prev[drugId]] : [];
      if (!list[index]) {
        list[index] = { batch_number: '', expiry_date: '', manufacturing_date: '', opening_stock: '' };
      }
      list[index] = { ...list[index], [field]: value };
      return { ...prev, [drugId]: list };
    });
  };

  const addBatchRow = (drugId) => {
    setOfficeInitQuantities(prev => {
      const list = prev[drugId] ? [...prev[drugId]] : [];
      list.push({ batch_number: '', expiry_date: '', manufacturing_date: '', opening_stock: '' });
      return { ...prev, [drugId]: list };
    });
  };

  const removeBatchRow = (drugId, index) => {
    setOfficeInitQuantities(prev => {
      const list = prev[drugId] ? [...prev[drugId]] : [];
      list.splice(index, 1);
      return { ...prev, [drugId]: list };
    });
  };

  // Pending grouped count for nav badge
  const pendingGroupedCount = (() => {
    const pendingBatches = new Set();
    let pendingSinglesCount = 0;
    indents.forEach(ind => {
      if (ind.status === 'PENDING') {
        if (ind.batch_number) {
          pendingBatches.add(ind.batch_number);
        } else {
          pendingSinglesCount++;
        }
      }
    });
    return pendingBatches.size + pendingSinglesCount;
  })();

  // ──── Context value ────
  const value = {
    // User
    user, onLogout, userRole, isWarehouseUser, canRaiseIndent, hasPermission,
    userOffice, userProject, userFullName, isLeafNode,
    // Data
    vehicles, setVehicles,
    consumables, setConsumables,
    drugs, setDrugs,
    shiftDrugs, setShiftDrugs,
    indents, setIndents,
    projects, setProjects,
    selectedProject, setSelectedProject,
    permissions, setPermissions,
    dashboardShifts, setDashboardShifts,
    projectConfigs, setProjectConfigs,
    approvalChainRaw, setApprovalChainRaw,
    // Office Inventory
    officeInventory, setOfficeInventory, loadingOfficeInventory,
    officeInitProject, setOfficeInitProject,
    officeInitOffice, setOfficeInitOffice,
    officeInitOfficesList, setOfficeInitOfficesList,
    officeInitQuantities, setOfficeInitQuantities,
    updateBatchRow, addBatchRow, removeBatchRow,
    // Transit
    transitInventory, setTransitInventory,
    pendingHandover, setPendingHandover,
    hasProposedHandover, setHasProposedHandover,
    shiftStatus, setShiftStatus,
    selectedShiftItems, setSelectedShiftItems,
    // Loading
    loadingData, setLoadingData,
    loadingVehicles, loadingConsumables, loadingIndents, loadingDrugs, loadingShifts,
    actionLoading, setActionLoading,
    // Functions
    fetchDashboardData,
    fetchVehicles,
    fetchConsumables,
    fetchIndents,
    fetchDrugs,
    fetchShifts,
    fetchOfficeInventory,
    fetchTransitInventory,
    fetchPendingHandovers,
    fetchInitOffices,
    addAuditLog,

    // Nav badge
    pendingGroupedCount,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
