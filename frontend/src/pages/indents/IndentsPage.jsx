import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  ChevronLeft, ChevronRight, Search, Plus, Trash2, Edit, X, Check, QrCode, Truck,
  AlertTriangle, Clock, CheckCircle, PackageCheck, ClipboardCheck, Share2,
  RefreshCw, Layers, ArrowLeft, TrendingUp, Droplets, Database, SlidersHorizontal,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';

const formatToLocalTime = (utcString) => {
  if (!utcString) return '';
  try {
    let dateObj;
    if (utcString.includes('T') || utcString.includes('Z')) {
      dateObj = new Date(utcString);
    } else {
      // Append 'Z' to treat the raw SQL timestamp as UTC
      const formattedUtc = utcString.replace(' ', 'T') + 'Z';
      dateObj = new Date(formattedUtc);
    }
    if (isNaN(dateObj.getTime())) {
      dateObj = new Date(utcString);
    }
    if (isNaN(dateObj.getTime())) {
      const parts = utcString.replace('T', ' ').split(':');
      if (parts.length >= 2) {
        return parts[0] + ':' + parts[1];
      }
      return utcString;
    }
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch (err) {
    return utcString;
  }
};

export default function IndentsPage() {
  const {
    user, userRole, isWarehouseUser, canRaiseIndent, hasPermission,
    userOffice, userProject, userFullName, isLeafNode,
    indents, setIndents, projects, selectedProject, setSelectedProject,
    projectConfigs, approvalChainRaw, drugs, loadingData,
    loadingIndents, fetchIndents, loadingDrugs, fetchDrugs,
    fetchDashboardData, addAuditLog,
    pendingHandover, hasProposedHandover, shiftStatus
  } = useApp();

  const isHandoverInitiated = !!pendingHandover || hasProposedHandover || shiftStatus === 'view_only';

  useEffect(() => {
    if (indents.length === 0 && !loadingIndents) {
      fetchIndents();
    }
  }, []);

  useEffect(() => {
    if (drugs.length === 0 && !loadingDrugs) {
      fetchDrugs();
    }
  }, []);

  // Raised Indent Workflow States
  const navigate = useNavigate();
  const location = useLocation();

  let indentViewMode = 'list';
  if (location.pathname === '/indents/raise') {
    indentViewMode = 'raise';
  }

  useEffect(() => {
    if (indentViewMode === 'raise' && isHandoverInitiated) {
      toast.error('Indent creation is locked because your shift is handed over or in view-only mode.');
      navigate('/indents');
    }
  }, [indentViewMode, isHandoverInitiated, navigate]);

  const setIndentViewMode = (mode) => {
    if (mode === 'raise') {
      navigate('/indents/raise');
    } else {
      navigate('/indents');
    }
  };

  const [raisingIndent, setRaisingIndent] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [formMessage, setFormMessage] = useState({ type: '', text: '' });

  // Grouped Indent Detail Modal States
  const [selectedGroupedIndent, setSelectedGroupedIndent] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDetailItems, setSelectedDetailItems] = useState(new Set());
  
  // Dispatch Form States (Professional Warehouse Dispatch)
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [dispatchFormData, setDispatchFormData] = useState({});
  const [dispatchingItems, setDispatchingItems] = useState([]);
  const [globalCourier, setGlobalCourier] = useState('');
  const [globalRemarks, setGlobalRemarks] = useState('');
  const [globalServiceAreaCode, setGlobalServiceAreaCode] = useState('');

  // Bulk Indent Modal States
  const [modalProject, setModalProject] = useState('');
  const [modalOffices, setModalOffices] = useState([]);
  const [modalOffice, setModalOffice] = useState('');
  const [modalSearch, setModalSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);
  const [modalPageSize, setModalPageSize] = useState(10);
  const [selectedDrugs, setSelectedDrugs] = useState({});
  const [modalRemarks, setModalRemarks] = useState('');
  const [showSubmitPreview, setShowSubmitPreview] = useState(false);

  // Custom Confirmation Dialog States
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: null
  });

  // Main UI Pagination States (Defaults)
  const [indentPage, setIndentPage] = useState(1);
  const [indentPageSize, setIndentPageSize] = useState(10);
  const [indentSearch, setIndentSearch] = useState('');
  const [indentStatusFilter, setIndentStatusFilter] = useState('ALL');

  // Handlers & Helpers
  const fetchProjectOffices = async (projectName) => {
    try {
      const data = await api.projects.getOffices(projectName);
      setModalOffices(data || []);
      
      // Auto-populate user's office if they are a standard operator/user and belong to one
      const isUserAdmin = user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin';
      if (!isUserAdmin && userOffice?.name && userOffice.name !== 'N/A') {
        setModalOffice(userOffice.name);
      }
    } catch (err) {
      console.error("Error fetching offices:", err);
      toast.error("Failed to load project offices.");
    }
  };

  useEffect(() => {
    if (modalProject) {
      fetchProjectOffices(modalProject);
    } else {
      setModalOffices([]);
    }
  }, [modalProject]);

  useEffect(() => {
    const defaultProj = userProject || (projects.length > 0 ? projects[0] : '');
    if (defaultProj && !modalProject) {
      setModalProject(defaultProj);
    }
  }, [userProject, projects, modalProject]);

  const getBatchesForIndentItem = (item, drugsList = drugs) => {
    if (!item || !item.item_code || item.item_code === 'N/A') return [];
    
    // Find all drugs in the provided list matching the item code & project
    const matches = drugsList.filter(d => 
      d.item_code === item.item_code && 
      (d.project || '').toLowerCase() === (item.project || '').toLowerCase() &&
      d.is_active
    );
    
    // Sort by FEFO (First Expired First Out)
    return matches.sort((a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return new Date(a.expiry_date) - new Date(b.expiry_date);
    });
  };

// ====================================
// FUNCTION: handleIndentAction (Lines 1011-1054)
// ====================================
  const handleIndentAction = async (indentId, action) => {
    setActionLoading(indentId);
    
    try {
      let resData;
      if (action === 'approve') {
        resData = await api.indents.approve(indentId);
      } else if (action === 'reject') {
        resData = await api.indents.reject(indentId);
      } else {
        throw new Error(`Unsupported action ${action}`);
      }
      
      const newStatus = resData.status || (action === 'approve' ? 'APPROVED' : 'REJECTED');
      
      // Update local state directly
      setIndents(prev => prev.map(ind => 
        ind.id === indentId ? { ...ind, status: newStatus } : ind
      ));

      toast.success(`Indent ${action}ed successfully!`);

      // Log action
      addAuditLog(
        action.toUpperCase(),
        'Indents',
        `${action.charAt(0).toUpperCase() + action.slice(1)}ed indent record #${indentId}`,
        'SUCCESS',
        selectedProject
      );
    } catch (err) {
      console.error(err);
      toast.error(err.message || `Error during indent ${action}.`);
    } finally {
      setActionLoading(null);
    }
  };

// ====================================
// FUNCTION: handleBatchIndentAction (Lines 1057-1155)
// ====================================
  const handleBatchIndentAction = async (batchCode, action, items) => {
    // For dispatch, redirect to professional dispatch form
    if (action === 'dispatch') {
      const approvedItems = items.filter(it => it.status === 'APPROVED');
      if (approvedItems.length === 0) {
        toast.error('No approved items to dispatch.');
        return;
      }

      setActionLoading(batchCode);
      let projectDrugs = [];
      try {
        const proj = items[0]?.project;
        if (proj) {
          projectDrugs = await api.drugs.getDrugs(proj);
        }
      } catch (err) {
        console.error("Failed to load project drugs:", err);
      } finally {
        setActionLoading(null);
      }

      const drugsListForMatching = projectDrugs.length > 0 ? projectDrugs : drugs;

      const initialFormData = {};
      const approvedItemsWithBatches = approvedItems.map(it => {
        const batches = getBatchesForIndentItem(it, drugsListForMatching);
        const primaryBatch = (batches && batches.length > 0) ? batches[0].batch_number : '';
        initialFormData[it.id] = {
          dispatched_qty: it.quantity_requested || 0,
          dispatched_batch_no: primaryBatch
        };
        return {
          ...it,
          batches
        };
      });
      
      const allItemsWithBatches = items.map(it => {
        const match = approvedItemsWithBatches.find(d => d.id === it.id);
        if (match) return match;
        return { ...it, batches: getBatchesForIndentItem(it, drugsListForMatching) };
      });

      setGlobalCourier('');
      setGlobalRemarks('');
      setGlobalServiceAreaCode('');
      setDispatchFormData(initialFormData);
      setDispatchingItems(approvedItemsWithBatches);
      
      // Open details modal directly in dispatch mode
      setSelectedGroupedIndent({
        batch_code: batchCode,
        batch_number: items[0].batch_number,
        vehicle_number: items[0].vehicle_number,
        office_name: items[0].office_name,
        project: items[0].project,
        requested_by: items[0].requested_by,
        requested_by_role: items[0].requested_by_role,
        date: formatToLocalTime(items[0].created_at) || items[0].date || '',
        status: items[0].status,
        approval_chain: items[0].approval_chain,
        approval_chain_roles: items[0].approval_chain_roles,
        current_chain_index: items[0].current_chain_index,
        remarks: items[0].remarks,
        items: allItemsWithBatches
      });
      setShowDetailModal(true);
      setShowDispatchForm(true);
      return;
    }

    setActionLoading(batchCode);
    const token = sessionStorage.getItem('token');
    let successCount = 0;
    let failedCount = 0;
    let errorMsg = '';
    
    const promises = items.map(async (item) => {
      try {
        if (action === 'approve') {
          await api.indents.approve(item.id);
        } else if (action === 'reject') {
          await api.indents.reject(item.id);
        } else if (action === 'receive') {
          await api.indents.receive(item.id);
        } else {
          throw new Error('Unsupported action');
        }
        successCount++;
      } catch (err) {
        failedCount++;
        errorMsg = err.message || errorMsg;
      }
    });

    await Promise.all(promises);
    
    if (successCount > 0) {
      toast.success(`${successCount} item(s) in batch ${action}ed successfully!`);
      if (selectedGroupedIndent && selectedGroupedIndent.batch_code === batchCode) {
        fetchDashboardData();
        setShowDetailModal(false);
        setSelectedGroupedIndent(null);
      } else {
        fetchDashboardData();
      }
      
      addAuditLog(
        action.toUpperCase(),
        'Indents',
        `Batch action ${action} on batch indent ${batchCode}`,
        'SUCCESS',
        selectedProject
      );
    }
    
    if (failedCount > 0) {
      toast.error(`Failed to ${action} ${failedCount} item(s). ${errorMsg}`);
    }
    
    setActionLoading(null);
  };

// ====================================
// FUNCTION: handleBatchSelectedDetailAction (Lines 1158-1272)
// ====================================
  const handleBatchSelectedDetailAction = async (action) => {
    if (selectedDetailItems.size === 0) return;
    
    const itemsToProcess = selectedGroupedIndent.items.filter(it => selectedDetailItems.has(it.id));
    if (itemsToProcess.length === 0) return;
    
    // For dispatch, show professional dispatch form instead of immediately dispatching
    if (action === 'dispatch') {
      setActionLoading('modal-batch');
      let projectDrugs = [];
      try {
        const proj = selectedGroupedIndent?.project;
        if (proj) {
          projectDrugs = await api.drugs.getDrugs(proj);
        }
      } catch (err) {
        console.error("Failed to load project drugs:", err);
      } finally {
        setActionLoading(null);
      }

      const drugsListForMatching = projectDrugs.length > 0 ? projectDrugs : drugs;

      const initialFormData = {};
      const itemsWithBatches = itemsToProcess.map(it => {
        const batches = getBatchesForIndentItem(it, drugsListForMatching);
        const primaryBatch = (batches && batches.length > 0) ? batches[0].batch_number : '';
        initialFormData[it.id] = {
          dispatched_qty: it.quantity_requested || 0,
          dispatched_batch_no: primaryBatch
        };
        return {
          ...it,
          batches
        };
      });
      
      setGlobalCourier('');
      setGlobalRemarks('');
      setGlobalServiceAreaCode('');
      setDispatchFormData(initialFormData);
      setDispatchingItems(itemsWithBatches);
      
      // Update selectedGroupedIndent items to contain resolved batches
      setSelectedGroupedIndent(prev => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items.map(pit => {
            const match = itemsWithBatches.find(d => d.id === pit.id);
            return match || { ...pit, batches: getBatchesForIndentItem(pit, drugsListForMatching) };
          })
        };
      });
      
      setShowDispatchForm(true);
      return;
    }
    
    setActionLoading('modal-batch');
    const token = sessionStorage.getItem('token');
    let successCount = 0;
    let failedCount = 0;
    let errorMsg = '';
    
    const promises = itemsToProcess.map(async (item) => {
      try {
        if (action === 'approve') {
          await api.indents.approve(item.id);
        } else if (action === 'reject') {
          await api.indents.reject(item.id);
        } else if (action === 'receive') {
          await api.indents.receive(item.id);
        } else {
          throw new Error('Unsupported action');
        }
        successCount++;
      } catch (err) {
        failedCount++;
        errorMsg = err.message || errorMsg;
      }
    });

    await Promise.all(promises);
    
    if (successCount > 0) {
      toast.success(`${successCount} selected item(s) ${action}ed successfully!`);
      setSelectedDetailItems(new Set());
      await fetchDashboardData();
      
      // Refresh the modal items from fresh fetched data
      let updatedIndents = [];
      try {
        updatedIndents = await api.indents.getIndents();
      } catch (err) {
        console.error(err);
      }
      
      if (updatedIndents && updatedIndents.length > 0) {
        const grouped = {};
        updatedIndents.forEach(ind => {
          const key = ind.batch_number || `IND-SINGLE-${ind.id}`;
          if (!grouped[key]) {
            grouped[key] = {
              id: ind.id,
              batch_code: ind.batch_number ? ind.batch_number.replace('IND-B-', 'IND-') : `IND-${String(ind.id).padStart(5, '0')}`,
              batch_number: ind.batch_number,
              vehicle_number: ind.vehicle_number,
              office_name: ind.office_name,
              project: ind.project,
              requested_by: ind.requested_by,
              requested_by_role: ind.requested_by_role,
              date: formatToLocalTime(ind.created_at) || ind.date || '',
              status: ind.status,
              current_approver_code: ind.current_approver_code,
              approval_chain: ind.approval_chain,
              approval_chain_roles: ind.approval_chain_roles,
              current_chain_index: ind.current_chain_index,
              remarks: ind.remarks,
              items: []
            };
          }
          grouped[key].items.push(ind);
        });
        
        const matchingGroup = grouped[selectedGroupedIndent.batch_number || `IND-SINGLE-${selectedGroupedIndent.id}`];
        if (matchingGroup) {
          setSelectedGroupedIndent(matchingGroup);
        } else {
          setShowDetailModal(false);
          setSelectedGroupedIndent(null);
        }
      }

      addAuditLog(
        action.toUpperCase(),
        'Indents',
        `Bulk internal action ${action} on selected items inside detail modal`,
        'SUCCESS',
        selectedProject
      );
    }
    
    if (failedCount > 0) {
      toast.error(`Failed to ${action} ${failedCount} item(s). ${errorMsg}`);
    }
    setActionLoading(null);
  };

// ====================================
// FUNCTION: handleDispatchSubmit (Lines 1275-1339)
// ====================================
  const handleDispatchSubmit = async () => {
    if (dispatchingItems.length === 0) return;
    
    setActionLoading('modal-batch');
    const token = sessionStorage.getItem('token');
    let successCount = 0;
    let failedCount = 0;
    let errorMsg = '';

    const promises = dispatchingItems.map(async (item) => {
      const formEntry = dispatchFormData[item.id] || {};
      try {
        await api.indents.dispatch(item.id, {
          dispatched_qty: parseFloat(formEntry.dispatched_qty) ?? item.quantity_requested,
          dispatched_batch_no: formEntry.dispatched_batch_no || null,
          courier_details: globalCourier || null,
          dispatch_remarks: globalRemarks || null,
          service_area_code: globalServiceAreaCode || null
        });
        successCount++;
      } catch (err) {
        failedCount++;
        errorMsg = err.message || errorMsg;
      }
    });

    await Promise.all(promises);

    if (successCount > 0) {
      toast.success(`${successCount} item(s) dispatched successfully!`);
      setSelectedDetailItems(new Set());
      setShowDispatchForm(false);
      setDispatchFormData({});
      setDispatchingItems([]);
      setGlobalCourier('');
      setGlobalRemarks('');
      setGlobalServiceAreaCode('');
      await fetchDashboardData();

      // Close details modal on successful dispatch
      setShowDetailModal(false);
      setSelectedGroupedIndent(null);

      addAuditLog('DISPATCH', 'Indents', `Professional dispatch on ${successCount} items`, 'SUCCESS', selectedProject);
    }

    if (failedCount > 0) {
      toast.error(`Failed to dispatch ${failedCount} item(s). ${errorMsg}`);
    }
    setActionLoading(null);
  };

// ====================================
// FUNCTION: handleOpenIndentModal (Lines 1811-1825)
// ====================================
  const handleOpenIndentModal = () => {
    const defaultProj = userProject || (projects.length > 0 ? projects[0] : '');
    setModalProject(defaultProj);
    
    // Auto-populate user's office if they are a standard operator/user and belong to one
    const isUserAdmin = user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin';
    const defaultOffice = (!isUserAdmin && userOffice?.name && userOffice.name !== 'N/A') ? userOffice.name : '';
    setModalOffice(defaultOffice);
    
    setModalSearch('');
    setModalPage(1);
    setSelectedDrugs({});
    setModalRemarks('');
    
    if (defaultProj) {
      fetchProjectOffices(defaultProj);
    }
    setFormMessage({ type: '', text: '' });
    setIndentViewMode('raise');
  };

// ====================================
// FUNCTION: getSelectedDrugsDetails (Lines 1827-1837)
// ====================================
  const getSelectedDrugsDetails = () => {
    return Object.entries(selectedDrugs)
      .map(([id, qty]) => {
        const drug = drugs.find(d => d.id === parseInt(id));
        return {
          ...drug,
          requested_qty: qty
        };
      })
      .filter(d => !!d.id);
  };

// ====================================
// FUNCTION: submitBatchIndent (Lines 1839-1890)
// ====================================
  const submitBatchIndent = async () => {
    const itemsToSubmit = Object.entries(selectedDrugs)
      .map(([id, qty]) => ({
        drug_id: parseInt(id),
        requested_qty: parseFloat(qty)
      }))
      .filter(item => !isNaN(item.requested_qty) && item.requested_qty > 0);
      
    setRaisingIndent(true);
    try {
      await api.indents.raiseIndentBatch(modalProject, modalOffice, itemsToSubmit, modalRemarks);
      toast.success(`Successfully raised ${itemsToSubmit.length} indents!`);
      setShowSubmitPreview(false);
      setIndentViewMode('list');
      fetchDashboardData();
      addAuditLog(
        'CREATE',
        'Indents',
        `Created batch indent under project ${modalProject} and office ${modalOffice}`,
        'SUCCESS',
        modalProject
      );
      setSelectedDrugs({});
      setModalRemarks('');
    } catch (err) {
      console.error(err);
      setFormMessage({ type: 'error', text: err.message || 'Failed to submit indent batch.' });
      setShowSubmitPreview(false);
    } finally {
      setRaisingIndent(false);
    }
  };

// ====================================
// FUNCTION: handleBatchIndentSubmit (Lines 1892-1914)
// ====================================
  const handleBatchIndentSubmit = (e) => {
    e.preventDefault();
    setFormMessage({ type: '', text: '' });
    
    if (!modalOffice) {
      setFormMessage({ type: 'error', text: 'Please select an office.' });
      return;
    }
    
    const itemsToSubmit = Object.entries(selectedDrugs)
      .map(([id, qty]) => ({
        drug_id: parseInt(id),
        requested_qty: parseFloat(qty)
      }))
      .filter(item => !isNaN(item.requested_qty) && item.requested_qty > 0);
      
    if (itemsToSubmit.length === 0) {
      setFormMessage({ type: 'error', text: 'Please enter a quantity greater than 0 for at least one item.' });
      return;
    }
    
    setShowSubmitPreview(true);
  };

// ====================================
// FUNCTION: getLiveChainPreview (Lines 1916-2026)
// ====================================
  const getLiveChainPreview = () => {
    if (!modalProject) return null;
    const proj = modalProject;
    
    if (loadingData) {
      return (
        <div className="flow-viz-container" style={{ margin: '16px 0', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100px', gap: '12px' }}>
          <div className="bavya-spinner" style={{ margin: '0 auto' }}>
            <div className="petal petal-tl"></div>
            <div className="petal petal-tr"></div>
            <div className="petal petal-bl"></div>
            <div className="petal petal-br"></div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Loading approval chain...</span>
        </div>
      );
    }

    if (approvalChainRaw.length === 0) {
      return (
        <div className="flow-viz-container" style={{ margin: '16px 0', padding: '16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No reporting hierarchy configured for this project ({proj}).</span>
        </div>
      );
    }
    
    const config = projectConfigs.find(c => c.project_name === proj);
    const skips = config && config.skip_roles ? config.skip_roles.toLowerCase().split(',').map(s => s.trim()) : [];
    const stop = config && config.stop_role ? config.stop_role.toLowerCase().trim() : null;
    
    let isStopped = false;
    const previewNodes = [];
    const activeChain = approvalChainRaw;
    
    for (let i = 0; i < activeChain.length; i++) {
      const member = activeChain[i];
      const roleId = member.role.toLowerCase();
      let status = 'active';
      
      const displayRoleName = member.role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      
      let desc = 'Approver';
      if (i === 0) desc = 'Initiator';
      else if (i === 1) desc = 'First Approver';
      else if (i === 2) desc = 'Second Approver';
      else if (member.role === 'ADMIN') desc = 'Root Approver';

      if (isStopped) {
        status = 'unreachable';
      } else if (i > 0 && (skips.includes(roleId) || (roleId === 'project_manager' && (skips.includes('pm') || skips.includes('project manager'))))) {
        status = 'skipped';
      } else if (i > 0 && (stop === roleId || (roleId === 'project_manager' && (stop === 'pm' || stop === 'project manager')))) {
        status = 'stop';
        isStopped = true;
      } else if (member.role === 'ADMIN' && stop && stop !== 'admin') {
        status = 'unreachable';
      }
      
      previewNodes.push({
        id: `${member.role}_${i}`,
        roleName: displayRoleName,
        desc,
        status
      });
    }
    
    return (
      <div className="flow-viz-container" style={{ margin: '16px 0', padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Estimated Approval Chain ({proj})</h5>
        <div className="flow-nodes-wrapper" style={{ gap: '8px' }}>
          {previewNodes.map((node, idx) => (
            <React.Fragment key={node.id}>
              {idx > 0 && <span style={{ fontSize: '12px', color: '#94a3b8' }}>➔</span>}
              <div 
                className={`flow-node ${node.status}-node`}
                style={{ 
                  padding: '6px 10px', 
                  fontSize: '11px', 
                  minWidth: '80px',
                  opacity: node.status === 'unreachable' ? 0.5 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <span style={{ fontWeight: 'bold' }}>{node.roleName}</span>
                <span style={{ fontSize: '9px', opacity: 0.8 }}>{node.desc}</span>
                {node.status === 'skipped' && <span style={{ fontSize: '9px', marginLeft: '3px' }}>🚫</span>}
                {node.status === 'stop' && <span style={{ fontSize: '9px', marginLeft: '3px' }}>🔒</span>}
              </div>
            </React.Fragment>
          ))}
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>➔</span>
          <div 
            className="flow-node active-node"
            style={{ 
              padding: '6px 10px', 
              fontSize: '11px', 
              minWidth: '80px',
              backgroundColor: '#ecfdf5',
              borderColor: '#10b981',
              color: '#047857',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px'
            }}
          >
            <span style={{ fontWeight: 'bold' }}>Central Warehouse</span>
            <span style={{ fontSize: '9px', opacity: 0.8 }}>Pool Dispatch</span>
          </div>
        </div>
      </div>
    );
  };


  const filteredDrugs = drugs.filter(d => 
    d.project === modalProject && 
    d.is_active && 
    (modalSearch === '' || 
      d.item_name.toLowerCase().includes(modalSearch.toLowerCase()) || 
      (d.item_code && d.item_code.toLowerCase().includes(modalSearch.toLowerCase())))
  );

  const totalPages = Math.ceil(filteredDrugs.length / modalPageSize);
  const paginatedDrugs = filteredDrugs.slice((modalPage - 1) * modalPageSize, modalPage * modalPageSize);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setModalPage(page);
    }
  };

  const getPaginationRange = (currentPage, pageCount) => {
    const pages = [];
    const maxVisible = 5;
    if (pageCount <= maxVisible) {
      for (let i = 1; i <= pageCount; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(pageCount - 1, currentPage + 1);
      if (start > 2) {
        pages.push('...');
      }
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < pageCount - 1) {
        pages.push('...');
      }
      pages.push(pageCount);
    }
    return pages;
  };

  const getPageNumbers = () => getPaginationRange(modalPage, totalPages);

  const currentPageIds = paginatedDrugs.map(d => d.id);
  const isAllCurrentSelected = currentPageIds.length > 0 && currentPageIds.every(id => !!selectedDrugs[id]);

  const handleSelectAllCurrent = (checked) => {
    setSelectedDrugs(prev => {
      const copy = { ...prev };
      if (checked) {
        currentPageIds.forEach(id => {
          copy[id] = copy[id] || '1.00';
        });
      } else {
        currentPageIds.forEach(id => {
          delete copy[id];
        });
      }
      return copy;
    });
  };

  // Group, sort, filter, and paginate indents list at render time
  const fullGroupedList = React.useMemo(() => {
    const grouped = {};
    indents.forEach(ind => {
      const key = ind.batch_number || `IND-SINGLE-${ind.id}`;
      if (!grouped[key]) {
        grouped[key] = {
          id: ind.id,
          batch_code: ind.batch_number ? ind.batch_number.replace('IND-B-', 'IND-') : `IND-${String(ind.id).padStart(5, '0')}`,
          batch_number: ind.batch_number,
          vehicle_number: ind.vehicle_number,
          office_name: ind.office_name,
          project: ind.project,
          requested_by: ind.requested_by,
          requested_by_role: ind.requested_by_role,
          date: formatToLocalTime(ind.created_at) || ind.date || '',
          status: ind.status,
          current_approver_code: ind.current_approver_code,
          approval_chain: ind.approval_chain,
          approval_chain_roles: ind.approval_chain_roles,
          current_chain_index: ind.current_chain_index,
          remarks: ind.remarks,
          items: []
        };
      }
      grouped[key].items.push(ind);
    });
    
    // Sort descending by ID
    let list = Object.values(grouped);
    list.sort((a, b) => b.id - a.id);
    
    // Brand search filter
    if (indentSearch.trim() !== '') {
      const q = indentSearch.toLowerCase();
      list = list.filter(g => {
        const matchBatch = g.batch_code?.toLowerCase().includes(q);
        const matchVehicle = g.vehicle_number?.toLowerCase().includes(q);
        const matchOffice = g.office_name?.toLowerCase().includes(q);
        const matchInitiator = g.requested_by?.toLowerCase().includes(q);
        const matchDate = g.date?.toLowerCase().includes(q);
        const matchItems = g.items.some(it => it.item_name?.toLowerCase().includes(q));
        return matchBatch || matchVehicle || matchOffice || matchInitiator || matchDate || matchItems;
      });
    }
    
    // Status tabs filter
    if (indentStatusFilter !== 'ALL') {
      list = list.filter(g => g.status?.toUpperCase() === indentStatusFilter);
    }
    
    return list;
  }, [indents, indentSearch, indentStatusFilter]);

  const totalIndentRecords = fullGroupedList.length;
  const indentTotalPages = Math.ceil(totalIndentRecords / indentPageSize) || 1;

  const paginatedIndentsList = React.useMemo(() => {
    return fullGroupedList.slice(
      (indentPage - 1) * indentPageSize,
      indentPage * indentPageSize
    );
  }, [fullGroupedList, indentPage, indentPageSize]);

  // Render Component
  return (
    <>
          <div className="tab-pane">
            {indentViewMode === 'list' ? (
              <>
                <div className="section-header-flex">
                  <div className="section-header-left">
                    <h2>Indent Requests</h2>
                    <p>Manage and authorize digital indents submitted by operators and supervisors.</p>
                  </div>
                  {(hasPermission('indents', 'create') || canRaiseIndent || userRole === 'admin') && !isHandoverInitiated && (
                    <button 
                      type="button"
                      className="action-btn-primary"
                      onClick={handleOpenIndentModal}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Plus size={16} />
                      <span>Raise Indent</span>
                    </button>
                  )}
                </div>

                {/* Search & Tabs Controls bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px', background: 'rgba(255, 255, 255, 0.4)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(28, 25, 23, 0.05)' }}>
                  {/* Status tabs */}
                  <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                    {['ALL', 'PENDING', 'APPROVED', 'DISPATCHED', 'RECEIVED', 'REJECTED'].map(statusName => {
                      const isSelected = indentStatusFilter === statusName;
                      return (
                        <button
                          key={statusName}
                          onClick={() => {
                            setIndentStatusFilter(statusName);
                            setIndentPage(1);
                          }}
                          style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: '700',
                            borderRadius: '20px',
                            border: '1px solid',
                            borderColor: isSelected ? 'var(--primary)' : '#e2e8f0',
                            backgroundColor: isSelected ? 'rgba(227, 72, 37, 0.08)' : '#ffffff',
                            color: isSelected ? 'var(--primary)' : '#64748b',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            whiteSpace: 'nowrap',
                            boxShadow: isSelected ? '0 2px 4px rgba(227, 72, 37, 0.05)' : 'none'
                          }}
                          onMouseOver={(e) => {
                            if (!isSelected) e.currentTarget.style.borderColor = 'var(--primary)';
                          }}
                          onMouseOut={(e) => {
                            if (!isSelected) e.currentTarget.style.borderColor = '#e2e8f0';
                          }}
                        >
                          {statusName === 'ALL' ? 'All Requests' : (statusName === 'RECEIVED' ? 'ACKNOWLEDGED' : statusName)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Search and rows quantity control */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Rows quantity */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Rows:</span>
                      <CustomSelect
                        value={indentPageSize}
                        onChange={(e) => {
                          setIndentPageSize(parseInt(e.target.value));
                          setIndentPage(1);
                        }}
                        options={[
                          { value: 10, label: '10' },
                          { value: 25, label: '25' },
                          { value: 50, label: '50' },
                          { value: 100, label: '100' }
                        ]}
                        style={{ width: '75px' }}
                        compact
                      />
                    </div>
                    {/* Keyword search input */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
                      <input 
                        type="text" 
                        placeholder="Search by ID, Vehicle, Officer..." 
                        value={indentSearch} 
                        onChange={e => {
                          setIndentSearch(e.target.value);
                          setIndentPage(1);
                        }}
                        style={{ padding: '8px 12px 8px 30px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', minWidth: '220px', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>

                <div className="table-card">
                  <table className="portal-table">
                    <thead>
                      <tr>
                        <th>Indent ID</th>
                        <th>Vehicle</th>
                        <th>Item / Material</th>
                        <th className="text-right">Qty Requested</th>
                        <th>Requested By</th>
                        <th>Date</th>
                        <th>Status / Approval Chain</th>
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        if (loadingIndents) {
                          return [1, 2, 3, 4, 5].map((i) => (
                            <tr key={i}>
                              <td><div className="skeleton" style={{ width: '80px', height: '20px', borderRadius: '4px' }}></div></td>
                              <td><div className="skeleton" style={{ width: '100px', height: '20px', borderRadius: '4px' }}></div></td>
                              <td><div className="skeleton" style={{ width: '100%', height: '20px', borderRadius: '4px' }}></div></td>
                              <td><div className="skeleton" style={{ width: '50px', height: '20px', borderRadius: '4px', marginLeft: 'auto' }}></div></td>
                              <td><div className="skeleton" style={{ width: '90px', height: '20px', borderRadius: '4px' }}></div></td>
                              <td><div className="skeleton" style={{ width: '80px', height: '20px', borderRadius: '4px' }}></div></td>
                              <td><div className="skeleton" style={{ width: '120px', height: '20px', borderRadius: '4px' }}></div></td>
                              <td><div className="skeleton" style={{ width: '110px', height: '28px', borderRadius: '6px', margin: '0 auto' }}></div></td>
                            </tr>
                          ));
                        }
                        const groupedList = paginatedIndentsList;
                        
                        if (groupedList.length === 0) {
                          return (
                            <tr>
                              <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                                No indents found.
                              </td>
                            </tr>
                          );
                        }
                        
                        return groupedList.map(group => {
                          const isBatch = !!group.batch_number;
                          const itemsSummary = isBatch 
                            ? `${group.items[0].item_name} ${group.items.length > 1 ? `(+${group.items.length - 1} more items)` : ''}`
                            : group.items[0].item_name;
                          
                          const totalQty = isBatch
                            ? group.items.reduce((sum, it) => sum + it.quantity_requested, 0)
                            : group.items[0].quantity_requested;
                          
                          const canAcknowledge = group.status?.toUpperCase() === 'DISPATCHED' && (
                            user?.username?.toLowerCase() === group.requested_by?.toLowerCase() || 
                            (userOffice?.name && group.office_name && userOffice.name.toLowerCase() === group.office_name.toLowerCase()) ||
                            user?.role?.toLowerCase() === 'admin' || 
                            user?.username?.toLowerCase() === 'admin'
                          ) && !isHandoverInitiated;
                           const canApprove = group.items.some(it => 
                            it.status?.toUpperCase() === 'PENDING' && 
                            (user?.username?.toLowerCase() === it.current_approver_code?.toLowerCase() || user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin')
                          );

                          const canDispatch = group.items.some(it => 
                            it.status?.toUpperCase() === 'APPROVED' && 
                            (user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin' || isWarehouseUser)
                          );

                          return (
                            <tr 
                              key={group.batch_code}
                              onClick={() => {
                                setSelectedGroupedIndent(group);
                                setShowDetailModal(true);
                              }}
                              style={{ cursor: 'pointer' }}
                              className="hover-row-highlight"
                            >
                              <td className="table-id-cell">
                                <span className="id-badge" style={{ fontFamily: 'monospace', fontWeight: '700', letterSpacing: '0.05em' }}>
                                  {group.batch_code}
                                </span>
                              </td>
                              <td>
                                <div className="table-vehicle-info">
                                  <span className="vehicle-num">
                                    {(!group.vehicle_number || group.vehicle_number === 'N/A') && group.office_name && group.office_name !== 'N/A'
                                      ? group.office_name
                                      : group.vehicle_number}
                                  </span>
                                  {group.project && <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>({group.project})</span>}
                                </div>
                              </td>
                              <td>
                                <div className="table-consumable-info">
                                  <span className="consumable-name-cell" style={{ fontWeight: '600', color: '#334155' }} title={itemsSummary}>{itemsSummary}</span>
                                  <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>
                                    {group.items.length} item(s) in this indent
                                  </span>
                                </div>
                              </td>
                              <td className="text-right font-semibold">
                                <span className="qty-value">{totalQty.toFixed(2)}</span>
                                <span className="qty-unit"> {group.items[0].item_unit || 'Nos'}</span>
                              </td>
                              <td>
                                <div className="table-user-cell">
                                  <span className="user-icon-avatar">{group.requested_by.charAt(0).toUpperCase()}</span>
                                  <span className="username-text">{group.requested_by}</span>
                                </div>
                              </td>
                              <td className="table-date-cell">{group.date}</td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span className={`status-badge ${group.status.toLowerCase()}`}>
                                    {group.status === 'RECEIVED' ? 'ACKNOWLEDGED' : group.status}
                                  </span>
                                  {group.approval_chain && group.approval_chain.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#64748b', flexWrap: 'wrap', marginTop: '4px' }} onClick={e => e.stopPropagation()}>
                                      {(() => {
                                        const displayChain = [
                                          { role: group.requested_by_role || 'INITIATOR', isCurrent: false, isPast: true },
                                          ...group.approval_chain.map((code, idx) => {
                                            const isCurrent = group.status === 'PENDING' && idx === group.current_chain_index;
                                            const isPast = idx < group.current_chain_index || group.status === 'APPROVED' || group.status === 'DISPATCHED';
                                            return {
                                              role: group.approval_chain_roles?.[idx] || code,
                                              isCurrent,
                                              isPast
                                            };
                                          })
                                        ];

                                        return displayChain.map((node, idx) => {
                                          const color = node.isCurrent ? '#10b981' : (node.isPast ? '#64748b' : '#94a3b8');
                                          const fontWeight = node.isCurrent ? '700' : '400';
                                          return (
                                            <React.Fragment key={idx}>
                                              {idx > 0 && <span>➔</span>}
                                              <span 
                                                style={{ 
                                                  color, 
                                                  fontWeight, 
                                                  textDecoration: group.status === 'REJECTED' ? 'line-through' : 'none',
                                                  backgroundColor: node.isCurrent ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                                                  padding: node.isCurrent ? '1px 4px' : '0',
                                                  borderRadius: '3px'
                                                }}
                                                title={node.isCurrent ? "Current Approver" : ""}
                                              >
                                                {node.role}
                                              </span>
                                            </React.Fragment>
                                          );
                                        });
                                      })()}
                                      {group.status !== 'REJECTED' && (
                                        <>
                                          <span>➔</span>
                                          <span
                                            style={{
                                              color: group.status === 'DISPATCHED' ? '#10b981' : (group.status === 'APPROVED' ? '#3b82f6' : '#94a3b8'),
                                              fontWeight: (group.status === 'APPROVED' || group.status === 'DISPATCHED') ? '700' : '400',
                                              backgroundColor: group.status === 'APPROVED' ? 'rgba(59, 130, 246, 0.08)' : (group.status === 'DISPATCHED' ? 'rgba(16, 185, 129, 0.08)' : 'transparent'),
                                              padding: (group.status === 'APPROVED' || group.status === 'DISPATCHED') ? '1px 4px' : '0',
                                              borderRadius: '3px'
                                            }}
                                            title={group.status === 'APPROVED' ? "Awaiting Dispatch" : (group.status === 'DISPATCHED' ? "Dispatched" : "")}
                                          >
                                            Central Warehouse
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="text-center" onClick={e => e.stopPropagation()}>
                                <div className="action-buttons justify-center">
                                  {canApprove && (
                                    <>
                                      <button 
                                        className="action-btn approve"
                                        onClick={() => handleBatchIndentAction(group.batch_code, 'approve', group.items)}
                                        disabled={actionLoading === group.batch_code}
                                        title="Approve All Items"
                                      >
                                        <Check size={14} />
                                      </button>
                                      <button 
                                        className="action-btn reject"
                                        onClick={() => handleBatchIndentAction(group.batch_code, 'reject', group.items)}
                                        disabled={actionLoading === group.batch_code}
                                        title="Reject All Items"
                                      >
                                        <X size={14} />
                                      </button>
                                    </>
                                  )}
                                  {canDispatch && (
                                    <button 
                                      className="action-btn approve"
                                      style={{ backgroundColor: '#ecfdf5', borderColor: '#10b981', color: '#047857' }}
                                      onClick={() => handleBatchIndentAction(group.batch_code, 'dispatch', group.items)}
                                      disabled={actionLoading === group.batch_code}
                                      title="Dispatch All Items"
                                    >
                                      <Truck size={14} />
                                    </button>
                                  )}
                                  {canAcknowledge && (
                                    <button
                                      className="action-btn approve"
                                      style={{ backgroundColor: '#eff6ff', borderColor: '#3b82f6', color: '#1d4ed8' }}
                                      onClick={() => {
                                        setConfirmModal({
                                          show: true,
                                          title: 'Acknowledge Receipt',
                                          message: `Are you sure you want to acknowledge receipt of indent batch ${group.batch_code}? This will formally close the indent workflow cycle.`,
                                          onConfirm: () => handleBatchIndentAction(group.batch_code, 'receive', group.items)
                                        });
                                      }}
                                      disabled={actionLoading === group.batch_code}
                                      title="Acknowledge Receipt"
                                    >
                                      <ClipboardCheck size={14} />
                                    </button>
                                  )}
                                  <button
                                    className="filter-btn"
                                    style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    onClick={() => {
                                      setSelectedGroupedIndent(group);
                                      setShowDetailModal(true);
                                    }}
                                  >
                                    <span>View Details</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Client Side Pagination controls for Indents list */}
                {indentTotalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                      Showing <span style={{ fontWeight: '600', color: '#1e293b' }}>{totalIndentRecords === 0 ? 0 : (indentPage - 1) * indentPageSize + 1}</span> to{' '}
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>{Math.min(indentPage * indentPageSize, totalIndentRecords)}</span> of{' '}
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>{totalIndentRecords}</span> indents
                    </span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        className="filter-btn"
                        style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: indentPage === 1 ? 'not-allowed' : 'pointer' }}
                        disabled={indentPage === 1}
                        onClick={() => setIndentPage(indentPage - 1)}
                      >
                        <ChevronLeft size={14} />
                        Previous
                      </button>
                      
                      {getPaginationRange(indentPage, indentTotalPages).map((p, idx) => {
                        if (p === '...') {
                          return <span key={`ind-ellipsis-${idx}`} style={{ color: '#94a3b8', padding: '0 4px', fontSize: '12px' }}>...</span>;
                        }
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setIndentPage(p)}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              border: '1px solid',
                              borderColor: indentPage === p ? 'var(--primary)' : '#e2e8f0',
                              backgroundColor: indentPage === p ? 'var(--primary)' : '#ffffff',
                              color: indentPage === p ? '#ffffff' : '#475569',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {p}
                          </button>
                        );
                      })}

                      <button 
                        type="button" 
                        className="filter-btn"
                        style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: indentPage === indentTotalPages ? 'not-allowed' : 'pointer' }}
                        disabled={indentPage === indentTotalPages}
                        onClick={() => setIndentPage(indentPage + 1)}
                      >
                        Next
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Inline Page Form instead of Modal */
              <div className="form-container-card" style={{ animation: 'fadeIn 0.2s ease-out', width: '100%' }}>
                <div className="section-header-flex" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                  <div className="section-header-left">
                    <h2>Raise New Indent Requests</h2>
                    <p>Submit bulk material requests for your assigned project and office.</p>
                  </div>
                  <button 
                    type="button" 
                    className="filter-btn" 
                    onClick={() => {
                      setIndentViewMode('list');
                      setFormMessage({ type: '', text: '' });
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <ChevronLeft size={16} />
                    <span>Back to List</span>
                  </button>
                </div>
                
                <form onSubmit={handleBatchIndentSubmit}>
                  {formMessage.text && (
                    <div className={`message-banner ${formMessage.type}`} style={{ padding: '12px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                      {formMessage.text}
                    </div>
                  )}
                  
                  {/* Project and Office row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px', width: '100%' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Select Project *</label>
                      <CustomSelect 
                        value={modalProject}
                        onChange={(e) => {
                          setModalProject(e.target.value);
                          setModalPage(1);
                        }}
                        placeholder="-- Choose Project --"
                        disabled={!(user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin')}
                        options={projects.map(p => ({ value: p, label: p }))}
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Select Office / Facility *</label>
                      <CustomSelect 
                        value={modalOffice}
                        onChange={(e) => setModalOffice(e.target.value)}
                        placeholder="-- Choose Office --"
                        disabled={!(user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin') && userOffice?.name && userOffice.name !== 'N/A'}
                        options={
                          modalOffices.length > 0 
                            ? modalOffices.map(o => ({ value: o.name, label: `${o.name} (${o.location})` }))
                            : modalProject 
                              ? [{ value: '', label: 'No Facility offices found for this project', disabled: true }]
                              : []
                        }
                      />
                    </div>
                  </div>

                  {/* Materials list header and search */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      Select Materials for Indent {modalProject && `(${filteredDrugs.length} available)`}
                      {Object.keys(selectedDrugs).length > 0 && (
                        <span className="nav-badge" style={{ backgroundColor: 'var(--primary)', color: '#ffffff', marginLeft: '8px', position: 'static', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                          {Object.keys(selectedDrugs).length} Selected
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      {/* Page Size Selector */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Rows per page:</span>
                        <CustomSelect
                          value={modalPageSize}
                          onChange={(e) => {
                            setModalPageSize(parseInt(e.target.value));
                            setModalPage(1);
                          }}
                          options={[
                            { value: 10, label: '10' },
                            { value: 25, label: '25' },
                            { value: 50, label: '50' },
                            { value: 100, label: '100' }
                          ]}
                          style={{ width: '80px' }}
                          compact
                          placement="top"
                        />
                      </div>

                      {/* Search Input */}
                      <input 
                        type="text" 
                        placeholder="Search materials..." 
                        value={modalSearch} 
                        onChange={e => {
                          setModalSearch(e.target.value);
                          setModalPage(1);
                        }}
                        style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', minWidth: '200px' }}
                      />
                    </div>
                  </div>

                  {/* Materials Grid / Table */}
                  <div className="table-card" style={{ marginBottom: '16px', overflowX: 'auto', width: '100%', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                    <table className="portal-table" style={{ minWidth: '600px', width: '100%', borderCollapse: 'collapse', border: 'none' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ width: '50px', textAlign: 'center', padding: '12px 16px' }}>
                            <input 
                              type="checkbox"
                              checked={isAllCurrentSelected}
                              onChange={e => handleSelectAllCurrent(e.target.checked)}
                              style={{ width: '16px', height: '16px', borderRadius: '4px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                            />
                          </th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Item Name</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Code</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Item Group</th>
                          <th style={{ width: '150px', textAlign: 'right', padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Request Qty *</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const items = paginatedDrugs;
                          if (items.length === 0) {
                            return (
                              <tr>
                                <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                  {modalProject ? 'No matching materials found.' : 'Please select a project to load materials.'}
                                </td>
                              </tr>
                            );
                          }
                          return items.map(d => {
                            const isSelected = !!selectedDrugs[d.id];
                            const qty = selectedDrugs[d.id] || '';
                            return (
                              <tr key={d.id} className={isSelected ? 'selected-row' : ''} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.02)' : 'transparent', transition: 'background-color 0.15s ease' }}>
                                <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                                  <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={e => {
                                      if (e.target.checked) {
                                        setSelectedDrugs(prev => ({ ...prev, [d.id]: '1.00' }));
                                      } else {
                                        setSelectedDrugs(prev => {
                                          const copy = { ...prev };
                                          delete copy[d.id];
                                          return copy;
                                        });
                                      }
                                    }}
                                    style={{ width: '16px', height: '16px', borderRadius: '4px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                                  />
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '13px' }}>{d.item_name}</span>
                                </td>
                                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12.5px', color: '#475569' }}>
                                  {d.item_code || 'N/A'}
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span className="type-badge" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', fontWeight: '500' }}>
                                    {d.item_group || 'Drug'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <input 
                                      type="number"
                                      step="0.01"
                                      min="0.01"
                                      placeholder="0.00"
                                      value={qty}
                                      onChange={e => {
                                        const val = e.target.value;
                                        if (val === '') {
                                          setSelectedDrugs(prev => {
                                            const copy = { ...prev };
                                            delete copy[d.id];
                                            return copy;
                                          });
                                        } else {
                                          setSelectedDrugs(prev => ({ ...prev, [d.id]: val }));
                                        }
                                      }}
                                      style={{ 
                                        padding: '6px 12px', 
                                        border: isSelected ? '1px solid var(--primary)' : '1px solid #cbd5e1', 
                                        borderRadius: '6px', 
                                        fontSize: '13px', 
                                        width: '100px', 
                                        textAlign: 'right', 
                                        boxSizing: 'border-box',
                                        backgroundColor: isSelected ? '#ffffff' : '#f8fafc',
                                        fontWeight: isSelected ? '600' : '400',
                                        color: isSelected ? 'var(--primary-dark)' : '#1e293b',
                                        transition: 'all 0.15s ease'
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Client Side Pagination controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                      Showing <span style={{ fontWeight: '600', color: '#1e293b' }}>{filteredDrugs.length === 0 ? 0 : (modalPage - 1) * modalPageSize + 1}</span> to{' '}
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>{Math.min(modalPage * modalPageSize, filteredDrugs.length)}</span> of{' '}
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>{filteredDrugs.length}</span> materials
                    </span>
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button 
                          type="button" 
                          className="filter-btn"
                          style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: modalPage === 1 ? 'not-allowed' : 'pointer' }}
                          disabled={modalPage === 1}
                          onClick={() => handlePageChange(modalPage - 1)}
                        >
                          <ChevronLeft size={14} />
                          Previous
                        </button>
                        
                        {getPageNumbers().map((p, idx) => {
                          if (p === '...') {
                            return <span key={`ellipsis-${idx}`} style={{ color: '#94a3b8', padding: '0 4px', fontSize: '12px' }}>...</span>;
                          }
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handlePageChange(p)}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                border: '1px solid',
                                borderColor: modalPage === p ? 'var(--primary)' : '#e2e8f0',
                                backgroundColor: modalPage === p ? 'var(--primary)' : '#ffffff',
                                color: modalPage === p ? '#ffffff' : '#475569',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {p}
                            </button>
                          );
                        })}

                        <button 
                          type="button" 
                          className="filter-btn"
                          style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: modalPage === totalPages ? 'not-allowed' : 'pointer' }}
                          disabled={modalPage === totalPages}
                          onClick={() => handlePageChange(modalPage + 1)}
                        >
                          Next
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Remarks */}
                  <div className="form-group" style={{ marginBottom: '16px', width: '100%' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Remarks / Justification</label>
                    <textarea 
                      rows="2"
                      style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#f8fafc', width: '100%', boxSizing: 'border-box' }}
                      value={modalRemarks}
                      onChange={(e) => setModalRemarks(e.target.value)}
                      placeholder="Enter any justification or comments for these requests..."
                    />
                  </div>

                  {/* Live Preview Flow */}
                  {getLiveChainPreview()}

                  {/* Submit / Cancel row */}
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button 
                      type="button" 
                      className="filter-btn" 
                      onClick={() => {
                        setIndentViewMode('list');
                        setFormMessage({ type: '', text: '' });
                      }}
                      disabled={raisingIndent}
                      style={{ width: 'auto', padding: '10px 20px' }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="action-btn-primary" 
                      disabled={raisingIndent}
                      style={{ padding: '10px 24px', borderRadius: '8px' }}
                    >
                      {raisingIndent ? 'Submitting Batch...' : `Raise Indents (${Object.keys(selectedDrugs).length} Selected)`}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

      {/* Detail Modal (with nested Dispatch Form) */}
      {showDetailModal && selectedGroupedIndent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1050,
          padding: '16px'
        }} onClick={() => {
          setShowDetailModal(false);
          setSelectedGroupedIndent(null);
          setShowDispatchForm(false);
          setDispatchFormData({});
          setDispatchingItems([]);
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '94%',
            maxWidth: '1150px',
            height: '92%',
            maxHeight: '92vh',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'masters-modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9',
              backgroundColor: '#ffffff'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>
                    {showDispatchForm ? 'Warehouse Dispatch Order' : 'Indent Details'} ({selectedGroupedIndent.batch_code})
                  </h3>
                  <span className={`status-badge ${selectedGroupedIndent.status.toLowerCase()}`}>
                    {selectedGroupedIndent.status === 'RECEIVED' ? 'ACKNOWLEDGED' : selectedGroupedIndent.status}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Raised by <strong style={{ color: '#334155' }}>{selectedGroupedIndent.requested_by}</strong> on {selectedGroupedIndent.date}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedGroupedIndent(null);
                  setShowDispatchForm(false);
                  setDispatchFormData({});
                  setDispatchingItems([]);
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '6px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f1f5f9'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ 
              padding: '24px', 
              overflowY: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '20px', 
              backgroundColor: '#ffffff',
              flex: 1
            }}>
              {/* 1. ALWAYS SHOW INDENT DETAILS AT THE TOP */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Project</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#334155' }}>{selectedGroupedIndent.project}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Facility Office / Unit</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#334155' }}>{selectedGroupedIndent.office_name || 'N/A'}</span>
                </div>
                {selectedGroupedIndent.vehicle_number && selectedGroupedIndent.vehicle_number !== 'N/A' && (
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Vehicle Assigned</span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#334155' }}>{selectedGroupedIndent.vehicle_number}</span>
                  </div>
                )}
                {selectedGroupedIndent.remarks && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Remarks / Purpose</span>
                    <span style={{ fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>"{selectedGroupedIndent.remarks}"</span>
                  </div>
                )}
              </div>

              {selectedGroupedIndent.approval_chain && selectedGroupedIndent.approval_chain.length > 0 && (
                <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>
                    Approval Route & Live Status Tracking
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {(() => {
                      const displayChain = [
                        { role: selectedGroupedIndent.requested_by_role || 'INITIATOR', isCurrent: false, isPast: true },
                        ...selectedGroupedIndent.approval_chain.map((code, idx) => {
                          const isCurrent = selectedGroupedIndent.status === 'PENDING' && idx === selectedGroupedIndent.current_chain_index;
                          const isPast = idx < selectedGroupedIndent.current_chain_index || selectedGroupedIndent.status === 'APPROVED' || selectedGroupedIndent.status === 'DISPATCHED';
                          return {
                            role: selectedGroupedIndent.approval_chain_roles?.[idx] || code,
                            isCurrent,
                            isPast
                          };
                        })
                      ];

                      return displayChain.map((node, idx) => {
                        let nodeStyle = {
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: '700',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          color: '#64748b'
                        };
                        if (node.isCurrent) {
                          nodeStyle.backgroundColor = '#ecfdf5';
                          nodeStyle.borderColor = '#10b981';
                          nodeStyle.color = '#047857';
                        } else if (node.isPast) {
                          nodeStyle.backgroundColor = '#f1f5f9';
                          nodeStyle.borderColor = '#cbd5e1';
                          nodeStyle.color = '#475569';
                        }

                        return (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span style={{ color: '#94a3b8' }}>➔</span>}
                            <div style={nodeStyle}>
                              {node.role} {node.isCurrent && "📍"}
                            </div>
                          </React.Fragment>
                        );
                      });
                    })()}
                    {selectedGroupedIndent.status !== 'REJECTED' && (
                      <>
                        <span style={{ color: '#94a3b8' }}>➔</span>
                        <div style={{
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: '700',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: selectedGroupedIndent.status === 'DISPATCHED' ? '#10b981' : (selectedGroupedIndent.status === 'APPROVED' ? '#3b82f6' : '#cbd5e1'),
                          backgroundColor: selectedGroupedIndent.status === 'DISPATCHED' ? '#ecfdf5' : (selectedGroupedIndent.status === 'APPROVED' ? '#eff6ff' : '#f8fafc'),
                          color: selectedGroupedIndent.status === 'DISPATCHED' ? '#047857' : (selectedGroupedIndent.status === 'APPROVED' ? '#1d4ed8' : '#94a3b8')
                        }}>
                          Central Warehouse
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>
                  Requested Supplies & Medical Materials
                </h4>
                {(() => {
                  const actionableItems = selectedGroupedIndent.items.filter(it => {
                    const canApproveItem = it.status?.toUpperCase() === 'PENDING' && 
                      (user?.username?.toLowerCase() === it.current_approver_code?.toLowerCase() || user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin');
                    const canDispatchItem = it.status?.toUpperCase() === 'APPROVED' && 
                      (user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin' || isWarehouseUser);
                    const canAcknowledgeItem = it.status?.toUpperCase() === 'DISPATCHED' && (
                      user?.username?.toLowerCase() === selectedGroupedIndent.requested_by?.toLowerCase() || 
                      (userOffice?.name && selectedGroupedIndent.office_name && userOffice.name.toLowerCase() === selectedGroupedIndent.office_name.toLowerCase()) ||
                      user?.role?.toLowerCase() === 'admin' || 
                      user?.username?.toLowerCase() === 'admin'
                    ) && !isHandoverInitiated;
                    return canApproveItem || canDispatchItem || canAcknowledgeItem;
                  });
                  const actionableItemIds = actionableItems.map(it => it.id);
                  const hasAnyActionableItems = actionableItemIds.length > 0;
                  const isAllActionableSelected = hasAnyActionableItems && actionableItemIds.every(id => selectedDetailItems.has(id));

                  return (
                    <>
                      <div className="table-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table className="portal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc' }}>
                              {hasAnyActionableItems && (
                                <th style={{ padding: '10px 16px', textAlign: 'center', width: '40px' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isAllActionableSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedDetailItems(new Set(actionableItemIds));
                                      } else {
                                        setSelectedDetailItems(new Set());
                                      }
                                    }} 
                                    style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                                  />
                                </th>
                              )}
                              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: '#64748b' }}>Item Name</th>
                              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', color: '#64748b' }}>Required Quantity</th>
                              <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '11px', color: '#64748b' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedGroupedIndent.items.map(it => {
                              const canApproveItem = it.status?.toUpperCase() === 'PENDING' && 
                                (user?.username?.toLowerCase() === it.current_approver_code?.toLowerCase() || user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin');
                              
                              const canDispatchItem = it.status?.toUpperCase() === 'APPROVED' && 
                                (user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin' || isWarehouseUser);
                              
                              const canAcknowledgeItem = it.status?.toUpperCase() === 'DISPATCHED' && (
                                user?.username?.toLowerCase() === selectedGroupedIndent.requested_by?.toLowerCase() || 
                                (userOffice?.name && selectedGroupedIndent.office_name && userOffice.name.toLowerCase() === selectedGroupedIndent.office_name.toLowerCase()) ||
                                user?.role?.toLowerCase() === 'admin' || 
                                user?.username?.toLowerCase() === 'admin'
                              ) && !isHandoverInitiated;
                              
                              const isActionable = canApproveItem || canDispatchItem || canAcknowledgeItem;

                              return (
                                <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  {hasAnyActionableItems && (
                                    <td style={{ padding: '12px 16px', textAlign: 'center', width: '40px' }}>
                                      {isActionable ? (
                                        <input 
                                          type="checkbox" 
                                          checked={selectedDetailItems.has(it.id)}
                                          onChange={(e) => {
                                            const newSel = new Set(selectedDetailItems);
                                            if (e.target.checked) {
                                              newSel.add(it.id);
                                            } else {
                                              newSel.delete(it.id);
                                            }
                                            setSelectedDetailItems(newSel);
                                          }}
                                          style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                                        />
                                      ) : (
                                        <input type="checkbox" disabled style={{ opacity: 0.2 }} />
                                      )}
                                    </td>
                                  )}
                                  <td style={{ padding: '12px 16px', fontWeight: '500', color: '#1e293b', fontSize: '13px' }}>
                                    <div style={{ color: '#0f172a', fontWeight: '700' }}>{it.item_name}</div>
                                    {it.status === 'DISPATCHED' && (it.dispatched_qty || it.dispatched_batch_no || it.courier_details) && (
                                      <div style={{ marginTop: '6px' }}>
                                        <div style={{
                                          fontSize: '11px',
                                          color: '#0369a1',
                                          backgroundColor: '#f0f9ff',
                                          padding: '8px 12px',
                                          borderRadius: '8px',
                                          border: '1px solid #bae6fd',
                                          display: 'inline-flex',
                                          flexWrap: 'wrap',
                                          gap: '12px',
                                          alignItems: 'center',
                                          fontWeight: '500',
                                          lineHeight: '1.4'
                                        }}>
                                          <span><strong>Dispatched Qty:</strong> {it.dispatched_qty} {it.item_unit || 'Nos'}</span>
                                          {it.dispatched_batch_no && (
                                            <span>
                                              • <strong>Batch/Lot:</strong> <code style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px' }}>{it.dispatched_batch_no}</code>
                                            </span>
                                          )}
                                          {it.courier_details && (
                                            <span>
                                              • <strong>Courier/Vehicle:</strong> {it.courier_details}
                                            </span>
                                          )}
                                          {it.dispatch_remarks && (
                                            <span>
                                              • <strong>Remarks:</strong> <em style={{ color: '#0284c7' }}>{it.dispatch_remarks}</em>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                                    {it.quantity_requested} <span style={{ fontWeight: 'normal', color: '#64748b', fontSize: '11px' }}>{it.item_unit || 'Nos'}</span>
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <span className={`status-badge ${it.status.toLowerCase()}`} style={{ display: 'inline-block' }}>
                                      {it.status === 'RECEIVED' ? 'ACKNOWLEDGED' : it.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Detail Modal Action Controls */}
                      {selectedDetailItems.size > 0 && !showDispatchForm && (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: '12px',
                          marginTop: '16px',
                          backgroundColor: '#f8fafc',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          alignItems: 'center'
                        }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                            Selected {selectedDetailItems.size} item(s):
                          </span>
                          {actionableItems.some(it => it.status?.toUpperCase() === 'PENDING' && selectedDetailItems.has(it.id)) && (
                            <>
                              <button 
                                onClick={() => handleBatchSelectedDetailAction('approve')}
                                disabled={actionLoading === 'modal-batch'}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 16px',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  borderRadius: '8px',
                                  border: '1px solid #10b981',
                                  backgroundColor: '#10b981',
                                  color: '#ffffff',
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.1)',
                                  transition: 'all 0.2s ease-in-out'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#059669';
                                  e.currentTarget.style.borderColor = '#059669';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = '#10b981';
                                  e.currentTarget.style.borderColor = '#10b981';
                                }}
                              >
                                <Check size={14} /> Approve Selected
                              </button>
                              <button 
                                onClick={() => handleBatchSelectedDetailAction('reject')}
                                disabled={actionLoading === 'modal-batch'}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 16px',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  borderRadius: '8px',
                                  border: '1px solid #ef4444',
                                  backgroundColor: '#ef4444',
                                  color: '#ffffff',
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.1)',
                                  transition: 'all 0.2s ease-in-out'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#dc2626';
                                  e.currentTarget.style.borderColor = '#dc2626';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = '#ef4444';
                                  e.currentTarget.style.borderColor = '#ef4444';
                                }}
                              >
                                <X size={14} /> Reject Selected
                              </button>
                            </>
                          )}
                          {actionableItems.some(it => it.status?.toUpperCase() === 'APPROVED' && selectedDetailItems.has(it.id)) && (
                            <button 
                              onClick={() => handleBatchSelectedDetailAction('dispatch')}
                              disabled={actionLoading === 'modal-batch'}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                borderRadius: '8px',
                                border: '1px solid #3b82f6',
                                backgroundColor: '#3b82f6',
                                color: '#ffffff',
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(59, 130, 246, 0.1)',
                                transition: 'all 0.2s ease-in-out'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#2563eb';
                                e.currentTarget.style.borderColor = '#2563eb';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#3b82f6';
                                e.currentTarget.style.borderColor = '#3b82f6';
                              }}
                            >
                              <Truck size={14} /> Dispatch Selected
                            </button>
                          )}
                          {actionableItems.some(it => it.status?.toUpperCase() === 'DISPATCHED' && selectedDetailItems.has(it.id)) && (
                            <button 
                              onClick={() => {
                                setConfirmModal({
                                  show: true,
                                  title: 'Acknowledge Selected Items',
                                  message: 'Are you sure you want to acknowledge receipt of the selected item(s)? This will mark them as received and update your facility inventory.',
                                  onConfirm: () => handleBatchSelectedDetailAction('receive')
                                });
                              }}
                              disabled={actionLoading === 'modal-batch'}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                borderRadius: '8px',
                                border: '1px solid #3b82f6',
                                backgroundColor: '#eff6ff',
                                color: '#1d4ed8',
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(59, 130, 246, 0.1)',
                                transition: 'all 0.2s ease-in-out'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#dbeafe';
                                e.currentTarget.style.borderColor = '#2563eb';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#eff6ff';
                                e.currentTarget.style.borderColor = '#3b82f6';
                              }}
                            >
                              <ClipboardCheck size={14} /> Acknowledge Selected
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* 2. RENDER THE ACTIVE DISPATCH FORM UNDER THE INDENT DETAILS */}
              {showDispatchForm && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '8px 0' }} />

                  {/* SECTION 1: GLOBAL SHIPMENT DETAILS */}
                  <div style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    padding: '20px 24px',
                    border: '1px solid #cbd5e1',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
                  }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: '750', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ display: 'inline-block', width: '3px', height: '13px', backgroundColor: '#38bdf8', borderRadius: '2px' }}></span>
                      Shipment & Transit Information
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          Service Area Code <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. SA-502"
                          value={globalServiceAreaCode}
                          onChange={e => setGlobalServiceAreaCode(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '11px 14px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
                          }}
                        />
                      </div>
                      
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          Overall Dispatch Remarks
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Stock dispatched complete with diagnostic cert templates"
                          value={globalRemarks}
                          onChange={e => setGlobalRemarks(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '11px 14px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: ITEM-WISE ALLOCATION */}
                  <div>
                    <h4 style={{ margin: '16px 0 12px 0', fontSize: '13px', fontWeight: '750', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ display: 'inline-block', width: '3px', height: '13px', backgroundColor: '#38bdf8', borderRadius: '2px' }}></span>
                      Material Allocation details ({dispatchingItems.length})
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {dispatchingItems.map((item, idx) => {
                        const fd = dispatchFormData[item.id] || {};
                        const requested = item.quantity_requested || 0;
                        const currentVal = parseFloat(fd.dispatched_qty) ?? requested;
                        
                        let allocationBadge = { text: 'Full Dispatch', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
                        if (currentVal < requested) {
                          allocationBadge = { text: 'Partial Dispatch', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
                        } else if (currentVal > requested) {
                          allocationBadge = { text: 'Exceeded Requested', bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' };
                        }
                        
                        return (
                          <div key={item.id} style={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '14px',
                            padding: '20px 24px',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.015)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', borderBottom: '1px dashed #f1f5f9', paddingBottom: '12px' }}>
                              <div>
                                <div style={{ fontSize: '15px', fontWeight: '750', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>#{idx + 1}</span>
                                  {item.item_name}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', fontWeight: '500' }}>
                                  Destination: <strong style={{ color: '#334155' }}>Office in project {item.project || 'AP-1962'}</strong>
                                </div>
                              </div>
                              
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  padding: '3px 10px',
                                  borderRadius: '8px',
                                  border: `1px solid ${allocationBadge.border}`,
                                  backgroundColor: allocationBadge.bg,
                                  color: allocationBadge.color
                                }}>
                                  {allocationBadge.text}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                    Dispatch Qty *
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDispatchFormData(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], dispatched_qty: requested }
                                      }));
                                    }}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#2563eb',
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      padding: 0,
                                      textDecoration: 'underline'
                                    }}
                                  >
                                    Set to Requested ({requested})
                                  </button>
                                </div>
                                
                                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={fd.dispatched_qty ?? ''}
                                    onChange={e => setDispatchFormData(prev => ({
                                      ...prev,
                                      [item.id]: { ...prev[item.id], dispatched_qty: e.target.value }
                                    }))}
                                    style={{
                                      width: '100%',
                                      padding: '10px 14px',
                                      border: currentVal > requested ? '1px solid #ef4444' : '1px solid #cbd5e1',
                                      borderRadius: '10px',
                                      fontSize: '13px',
                                      outline: 'none',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                  <span style={{ position: 'absolute', right: '14px', fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>
                                    {item.item_unit || 'Nos'}
                                  </span>
                                </div>
                                {currentVal > requested && (
                                  <span style={{ fontSize: '11px', color: '#ef4444', display: 'block', marginTop: '6px', fontWeight: '500' }}>
                                    Warning: Dispatch Quantity exceeds the requested indent quantity of {requested}
                                  </span>
                                )}
                              </div>

                              <div>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                  Batch / Lot Tracker Number
                                </label>
                                {item.batches && item.batches.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <CustomSelect
                                      value={fd.dispatched_batch_no ?? ''}
                                      onChange={e => {
                                        const selectedBatch = e.target.value;
                                        setDispatchFormData(prev => ({
                                          ...prev,
                                          [item.id]: { ...prev[item.id], dispatched_batch_no: selectedBatch }
                                        }));
                                      }}
                                      options={[
                                        { value: "", label: "-- Select Batch (FEFO Order) --" },
                                        ...item.batches.map(b => ({
                                          value: b.batch_number,
                                          label: `${b.batch_number} ${b.expiry_date ? `(Exp: ${b.expiry_date})` : ''} ${b.manufacturing_date ? `[Mfg: ${b.manufacturing_date}]` : ''} (Qty: {b.quantity})`
                                        }))
                                      ]}
                                    />
                                    
                                    {/* Display Expiry / Mfg info of selected batch info */}
                                    {(() => {
                                      const currentBatchNo = fd.dispatched_batch_no;
                                      const batchInfo = item.batches.find(b => b.batch_number === currentBatchNo);
                                      if (batchInfo) {
                                        return (
                                          <div style={{ 
                                            fontSize: '11px', 
                                            color: '#475569', 
                                            backgroundColor: '#f8fafc', 
                                            padding: '8px 12px', 
                                            borderRadius: '8px', 
                                            border: '1px dashed #cbd5e1',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                          }}>
                                            <span style={{ fontWeight: '500' }}>
                                              📅 <strong>Expiry Date:</strong> <span style={{ color: '#b91c1c', fontWeight: '700' }}>{batchInfo.expiry_date || 'N/A'}</span>
                                            </span>
                                            <span style={{ fontWeight: '500' }}>
                                              🏭 <strong>Mfg Date:</strong> <span style={{ color: '#334155' }}>{batchInfo.manufacturing_date || 'N/A'}</span>
                                            </span>
                                            <span style={{ fontWeight: '500' }}>
                                              📦 <strong>Stock Qty in Master:</strong> <span style={{ fontWeight: '600', color: '#0f172a' }}>{batchInfo.quantity}</span>
                                            </span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    placeholder="e.g. B-DRG-2026-X1"
                                    value={fd.dispatched_batch_no ?? ''}
                                    onChange={e => setDispatchFormData(prev => ({
                                      ...prev,
                                      [item.id]: { ...prev[item.id], dispatched_batch_no: e.target.value }
                                    }))}
                                    style={{
                                      width: '100%',
                                      padding: '10px 14px',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '10px',
                                      fontSize: '13px',
                                      outline: 'none',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer (Conditional) */}
            {showDispatchForm ? (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 24px',
                borderTop: '1px solid #f1f5f9',
                backgroundColor: '#f8fafc',
                borderBottomLeftRadius: '16px',
                borderBottomRightRadius: '16px'
              }}>
                <button
                  onClick={() => {
                    setShowDispatchForm(false);
                    setDispatchFormData({});
                    setDispatchingItems([]);
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: '600',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                >
                  Cancel
                </button>
                
                <button
                  onClick={handleDispatchSubmit}
                  disabled={actionLoading === 'modal-batch' || globalServiceAreaCode.trim() === ''}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '11px 28px',
                    fontSize: '13px',
                    fontWeight: '700',
                    borderRadius: '10px',
                    border: 'none',
                    background: (actionLoading === 'modal-batch' || globalServiceAreaCode.trim() === '')
                      ? '#cbd5e1' 
                      : 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                    color: '#ffffff',
                    cursor: (actionLoading === 'modal-batch' || globalServiceAreaCode.trim() === '') ? 'not-allowed' : 'pointer',
                    boxShadow: (globalServiceAreaCode.trim() === '') ? 'none' : '0 4px 10px rgba(37, 99, 235, 0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  <Truck size={15} />
                  {actionLoading === 'modal-batch' ? 'Processing Dispatch...' : `Release for Dispatch (${dispatchingItems.length} Cargo)`}
                </button>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                padding: '16px 24px',
                borderTop: '1px solid #f1f5f9',
                backgroundColor: '#f8fafc',
                borderBottomLeftRadius: '16px',
                borderBottomRightRadius: '16px'
              }}>
                <button 
                  className="filter-btn"
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedGroupedIndent(null);
                    setSelectedDetailItems(new Set());
                  }}
                >
                  Close Details
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Indent Preview Modal */}
      {showSubmitPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(28, 25, 23, 0.4)',
          backdropFilter: 'blur(8px)',
          zIndex: 1050,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -6px rgba(0,0,0,0.1)',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>Preview Indent Request</h3>
              <button 
                type="button" 
                onClick={() => setShowSubmitPreview(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scope Info Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: '#64748b', display: 'block' }}>Project Scope</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-dark)' }}>{modalProject}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: '#64748b', display: 'block' }}>Office / Facility Location</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{modalOffice}</span>
              </div>
            </div>

            {/* Selected Materials Table */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Selected Materials ({getSelectedDrugsDetails().length} items)
              </h4>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#64748b' }}>Item Name</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#64748b' }}>Code</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#64748b' }}>Group</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: '#64748b' }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSelectedDrugsDetails().map((d, idx) => (
                      <tr key={d.id} style={{ borderBottom: idx === getSelectedDrugsDetails().length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', color: '#1e293b', fontWeight: '600' }}>{d.item_name}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b', fontFamily: 'monospace' }}>{d.item_code}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{d.item_group || 'Drug'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700', color: 'var(--primary)' }}>
                          {d.requested_qty} <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b' }}>{d.uom || 'Nos'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Remarks Section */}
            {modalRemarks && (
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Remarks / Justification</h4>
                <p style={{ margin: 0, padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>
                  "{modalRemarks}"
                </p>
              </div>
            )}

            {/* Estimated Approval Chain */}
            <div>
              {getLiveChainPreview()}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '4px' }}>
              <button
                type="button"
                className="filter-btn"
                onClick={() => setShowSubmitPreview(false)}
                style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '600' }}
              >
                Go Back & Edit
              </button>
              <button
                type="button"
                className="action-btn-primary"
                onClick={submitBatchIndent}
                disabled={raisingIndent}
                style={{ padding: '10px 24px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {raisingIndent ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. PREMIUM CUSTOM CONFIRMATION POPUP MODAL */}
      {confirmModal.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(15, 23, 42, 0.45)', 
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999, 
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '420px',
            maxWidth: '90%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0',
            transform: 'scale(1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{
                backgroundColor: 'rgba(227, 72, 37, 0.1)', 
                color: 'var(--primary)', 
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <ClipboardCheck size={22} />
              </div>
              <h3 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '700',
                color: '#0f172a'
              }}>
                {confirmModal.title || 'Acknowledge Receipt'}
              </h3>
            </div>

            {/* Modal Body */}
            <div>
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: '#475569',
                lineHeight: '1.5'
              }}>
                {confirmModal.message}
              </p>
            </div>

            {/* Modal Actions */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px'
            }}>
              <button
                onClick={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: null })}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#475569',
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmModal.onConfirm) {
                    confirmModal.onConfirm();
                  }
                  setConfirmModal({ show: false, title: '', message: '', onConfirm: null });
                }}
                style={{
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#ffffff',
                  backgroundColor: 'var(--primary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(227, 72, 37, 0.2)',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-hover)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--primary)'}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
