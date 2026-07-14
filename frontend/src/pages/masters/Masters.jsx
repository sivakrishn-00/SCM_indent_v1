import React, { useState, useEffect } from 'react';
import { Truck, Database, Plus, X, Upload, Edit, Power, Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import './Masters.css';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';



// Helper to format date string to YYYY-MM-DD for native date input
const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  
  // Try Excel Serial Number Check (5 digit numeric string)
  if (/^\d{5}$/.test(str)) {
    const num = parseInt(str, 10);
    const dateObj = new Date((num - (num >= 60 ? 25569 : 25568)) * 86400 * 1000);
    if (!isNaN(dateObj.getTime())) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // If it's already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  
  // Custom parser for DD-MM-YYYY or DD/MM/YYYY
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    // If year is first (e.g. YYYY-MM-DD)
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    // If day is first (e.g. DD-MM-YYYY)
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    // If 2-digit year (e.g. DD-MM-YY)
    if (parts[2].length === 2) {
      const year = parseInt(parts[2]) > 50 ? `19${parts[2]}` : `20${parts[2]}`;
      return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  
  // Try parsing with Javascript Date
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return '';
};


export default function Masters({ user, addAuditLog, activeSubTab = 'materials' }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Table Sorting & Pagination State
  const [sortField, setSortField] = useState('item_name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Drug Form Modal State
  const [showDrugModal, setShowDrugModal] = useState(false);
  const [editingDrug, setEditingDrug] = useState(null);
  const [drugForm, setDrugForm] = useState({
    item_code: '',
    item_name: '',
    description: '',
    hsn_code: '',
    item_group: '',
    quantity: '',
    uom: 'Nos',
    unit_mrp: '',
    batch_number: '',
    expiry_date: '',
    manufacturing_date: '',
    supplier: '',
    project: '',
    is_active: true
  });
  const [drugFormMessage, setDrugFormMessage] = useState({ type: '', text: '' });

  // Refill Form Modal State
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [refillForm, setRefillForm] = useState({
    item_code: '',
    item_name: '',
    item_group: '',
    project: '',
    batch_number: '',
    refill_quantity: '',
    unit_mrp: '',
    expiry_date: '',
    manufacturing_date: '',
    supplier: ''
  });
  const [refillFormMessage, setRefillFormMessage] = useState({ type: '', text: '' });
  const [submittingRefill, setSubmittingRefill] = useState(false);

  // Bulk Upload State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPreviewData, setUploadPreviewData] = useState([]);
  const [uploadSummary, setUploadSummary] = useState({ total: 0, success: 0, failed: 0 });
  const [uploadingBulk, setUploadingBulk] = useState(false);

  // Workflow Configuration State
  const [workflowConfigs, setWorkflowConfigs] = useState([]);
  const [skipRolesInput, setSkipRolesInput] = useState('');
  const [stopRoleInput, setStopRoleInput] = useState('ADMIN');
  const [savingConfig, setSavingConfig] = useState(false);
  const [previewChain, setPreviewChain] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load Initial Data
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Projects
      let projList = [];
      try {
        projList = await api.projects.getProjects();
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          toast.error("Session expired. Redirecting to login...");
          setTimeout(() => {
            sessionStorage.clear();
            window.location.reload();
          }, 1500);
          return;
        }
        projList = ['AP-1962'];
      }

      if (user?.project && user?.role?.toLowerCase() !== 'admin' && user?.username?.toLowerCase() !== 'admin') {
        projList = projList.filter(p => p === user.project);
        if (projList.length === 0) projList = [user.project];
      }
      setProjects(projList);

      // Set initial selected project
      if (user?.project && user?.role?.toLowerCase() !== 'admin' && user?.username?.toLowerCase() !== 'admin') {
        setSelectedProject(user.project);
      } else if (projList.length > 0) {
        setSelectedProject(projList[0]);
      }

      // 2. Fetch Vehicles
      try {
        const vehData = await api.vehicles.getVehicles();
        setVehicles(vehData);
      } catch (err) {
        console.error(err);
      }

      // 3. Fetch Drugs
      try {
        const drugData = await api.drugs.getDrugs();
        setDrugs(drugData);
      } catch (err) {
        console.error(err);
        setDrugs([]);
      }

      // 4. Fetch Workflow Configurations
      try {
        const configData = await api.projects.getConfigs();
        setWorkflowConfigs(configData);
      } catch (err) {
        console.error(err);
      }
    } catch (err) {
      console.error("Error loading master data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update config fields based on selected project
  useEffect(() => {
    if (selectedProject && workflowConfigs.length > 0) {
      const config = workflowConfigs.find(c => c.project_name === selectedProject);
      if (config) {
        setSkipRolesInput(config.skip_roles || '');
        setStopRoleInput(config.stop_role || 'ADMIN');
      } else {
        setSkipRolesInput('');
        setStopRoleInput('ADMIN');
      }
    } else {
      setSkipRolesInput('');
      setStopRoleInput('ADMIN');
    }
  }, [selectedProject, workflowConfigs]);

  // Fetch dynamic hierarchy preview for selected project
  useEffect(() => {
    if (!selectedProject) return;
    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        const data = await api.projects.getHierarchyPreview(selectedProject);
        setPreviewChain(data.chain || []);
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          toast.error("Session expired. Redirecting to login...");
          setTimeout(() => {
            sessionStorage.clear();
            window.location.reload();
          }, 1500);
          return;
        }
        console.error("Error fetching project hierarchy preview:", err);
        setPreviewChain([]);
      } finally {
        setPreviewLoading(false);
      }
    };
    fetchPreview();
  }, [selectedProject]);

  const openRefillModal = (drug) => {
    setRefillFormMessage({ type: '', text: '' });
    setRefillForm({
      item_code: drug.item_code,
      item_name: drug.item_name,
      item_group: drug.item_group || '',
      project: drug.project,
      batch_number: drug.batch_number || '',
      refill_quantity: '',
      unit_mrp: drug.unit_mrp || '',
      expiry_date: formatDateForInput(drug.expiry_date),
      manufacturing_date: formatDateForInput(drug.manufacturing_date),
      supplier: drug.supplier || ''
    });
    setShowRefillModal(true);
  };

  const handleRefillSubmit = async (e) => {
    e.preventDefault();
    setRefillFormMessage({ type: '', text: '' });
    setSubmittingRefill(true);

    if (!refillForm.batch_number || !refillForm.refill_quantity) {
      setRefillFormMessage({ type: 'error', text: 'Batch Number and Refill Quantity are required.' });
      setSubmittingRefill(false);
      return;
    }

    try {
      const payload = {
        item_code: refillForm.item_code,
        project: refillForm.project,
        batch_number: refillForm.batch_number.trim(),
        refill_quantity: parseFloat(refillForm.refill_quantity),
        unit_mrp: refillForm.unit_mrp ? parseFloat(refillForm.unit_mrp) : null,
        expiry_date: refillForm.expiry_date || null,
        manufacturing_date: refillForm.manufacturing_date || null,
        supplier: refillForm.supplier || null
      };

      await api.drugs.refill(payload);
      toast.success(`Inventory successfully refilled!`);
      if (addAuditLog) {
        addAuditLog(
          'REFILL',
          'Masters',
          `Refilled ${refillForm.item_code} (${refillForm.item_name}) - Batch: ${refillForm.batch_number.trim()}, Qty: ${refillForm.refill_quantity}`
        );
      }
      setTimeout(() => {
        setShowRefillModal(false);
        loadData();
      }, 1000);
    } catch (err) {
      toast.error(err.message || 'Failed to submit refill.');
      setRefillFormMessage({ type: 'error', text: err.message || 'Failed to submit refill.' });
    } finally {
      setSubmittingRefill(false);
    }
  };

  // Open drug Modal (Create/Edit)
  const openDrugModal = (drug = null) => {
    setDrugFormMessage({ type: '', text: '' });
    if (drug) {
      setEditingDrug(drug);
      setDrugForm({ 
        ...drug,
        expiry_date: formatDateForInput(drug.expiry_date),
        manufacturing_date: formatDateForInput(drug.manufacturing_date)
      });
    } else {
      setEditingDrug(null);
      setDrugForm({
        item_code: '',
        item_name: '',
        description: '',
        hsn_code: '',
        item_group: '',
        quantity: '',
        uom: 'Nos',
        unit_mrp: '',
        batch_number: '',
        expiry_date: '',
        manufacturing_date: '',
        supplier: '',
        project: selectedProject || (projects.length > 0 ? projects[0] : ''),
        is_active: true
      });
    }
    setShowDrugModal(true);
  };

  // Sorting Handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // CSV Export Handler
  const exportToCSV = () => {
    if (filteredDrugs.length === 0) return;
    const headers = ['Item Code', 'Item Name', 'Group', 'Current Stock', 'Total Refilled', 'UOM', 'Unit MRP', 'Batch Number', 'Expiry Date', 'Manufacturing Date', 'Supplier', 'Project'];
    const rows = filteredDrugs.map(d => [
      d.item_code,
      d.item_name,
      d.item_group || '',
      d.quantity,
      d.initial_quantity || d.quantity,
      d.uom,
      d.unit_mrp,
      d.batch_number || '',
      d.expiry_date || '',
      d.manufacturing_date || '',
      d.supplier || '',
      d.project
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Master_Data_${selectedProject}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Submit Drug Form (Create/Edit)
  const handleDrugSubmit = async (e) => {
    e.preventDefault();
    setDrugFormMessage({ type: '', text: '' });

    if (!drugForm.item_code || !drugForm.item_name || !drugForm.project) {
      setDrugFormMessage({ type: 'error', text: 'Item Code, Item Name, and Project are required.' });
      return;
    }

    try {
      const payload = {
        ...drugForm,
        quantity: parseFloat(drugForm.quantity) || 0.0,
        unit_mrp: parseFloat(drugForm.unit_mrp) || 0.0,
        is_active: drugForm.is_active
      };

      if (editingDrug) {
        await api.drugs.updateDrug(editingDrug.id, payload);
      } else {
        await api.drugs.createDrug(payload);
      }

      toast.success(`Item successfully ${editingDrug ? 'updated' : 'created'}!`);
      setDrugFormMessage({ 
        type: 'success', 
        text: `Item successfully ${editingDrug ? 'updated' : 'created'}!` 
      });
      if (addAuditLog) {
        addAuditLog(
          editingDrug ? 'UPDATE' : 'CREATE',
          'Masters',
          `${editingDrug ? 'Updated' : 'Created'} drug master ${drugForm.item_code} (${drugForm.item_name})`
        );
      }
      setTimeout(() => {
        setShowDrugModal(false);
        loadData();
      }, 1000);
    } catch (err) {
      toast.error(err.message || 'Failed to save item.');
      setDrugFormMessage({ type: 'error', text: err.message || 'Failed to save item.' });
    }
  };

  // Toggle Drug Active Status
  const handleToggleActive = async (drug) => {
    const updatedActive = !drug.is_active;
    try {
      await api.drugs.updateDrug(drug.id, {
        ...drug,
        is_active: updatedActive
      });
      toast.success(`Item successfully ${updatedActive ? 'activated' : 'deactivated'}.`);
      if (addAuditLog) {
        addAuditLog(
          'UPDATE',
          'Masters',
          `${updatedActive ? 'Activated' : 'Deactivated'} drug master ${drug.item_code} (${drug.item_name})`
        );
      }
      loadData();
    } catch (err) {
      console.error(err);
      if (err.status === 401 || err.status === 403) {
        toast.error('Session expired. Please log in again.');
      } else {
        toast.error(err.message || 'Error updating item status.');
      }
    }
  };

  // Excel Upload Parser via SheetJS
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        if (!window.XLSX) {
          toast.error("Excel parsing engine (SheetJS) is loading, please try again in a moment.");
          return;
        }
        const workbook = window.XLSX.read(data, { type: 'binary' });
        
        const parsedItems = [];
        let successCount = 0;
        let failedCount = 0;

        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          // Convert to JSON array of arrays
          const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
          if (rows.length === 0) return;
          
          // Header detection (find row containing 'Item Code')
          let headerIndex = -1;
          for (let i = 0; i < Math.min(rows.length, 12); i++) {
            if (rows[i] && (rows[i].includes('Item Code') || rows[i].includes('item code') || rows[i].includes('ITEM CODE'))) {
              headerIndex = i;
              break;
            }
          }

          if (headerIndex === -1) {
            headerIndex = 0;
          }

          const headers = rows[headerIndex].map(h => String(h || '').trim());
          const dataRows = rows.slice(headerIndex + 1);

          const colIndices = {
            item_code: headers.findIndex(h => h.toLowerCase() === 'item code'),
            item_name: headers.findIndex(h => h.toLowerCase() === 'item name'),
            description: headers.findIndex(h => h.toLowerCase() === 'description'),
            hsn_code: headers.findIndex(h => h.toLowerCase() === 'hsn code'),
            item_group: headers.findIndex(h => h.toLowerCase() === 'item group'),
            qty: headers.findIndex(h => h.toLowerCase() === 'qty'),
            uom: headers.findIndex(h => h.toLowerCase() === 'uom'),
            unit_mrp: headers.findIndex(h => h.toLowerCase() === 'unit mrp'),
            batch_number: headers.findIndex(h => h.toLowerCase() === 'batch number'),
            expiry_date: headers.findIndex(h => h.toLowerCase() === 'expiry date'),
            manufacturing_date: headers.findIndex(h => h.toLowerCase() === 'manufacturing date'),
            supplier: headers.findIndex(h => h.toLowerCase() === 'supplier')
          };

          // Link Excel items directly to the currently selected project site
          const sheetProject = selectedProject;


          dataRows.forEach((row, idx) => {
            // Skip empty or dummy rows
            if (!row || row.length === 0 || !row[colIndices.item_code]) return;

            const itemCode = String(row[colIndices.item_code] || '').trim();
            const itemName = String(row[colIndices.item_name] || '').trim();
            
            if (!itemCode || !itemName) {
              failedCount++;
              parsedItems.push({
                index: parsedItems.length + 1,
                sheet_name: sheetName,
                item_code: itemCode || '[MISSING]',
                item_name: itemName || '[MISSING]',
                validationError: 'Missing Item Code or Item Name',
                status: 'FAILED'
              });
              return;
            }

            const qty = parseFloat(row[colIndices.qty]) || 0.0;
            const unitMrp = parseFloat(row[colIndices.unit_mrp]) || 0.0;

            successCount++;
            parsedItems.push({
              index: parsedItems.length + 1,
              sheet_name: sheetName,
              item_code: itemCode,
              item_name: itemName,
              description: String(row[colIndices.description] || ''),
              hsn_code: String(row[colIndices.hsn_code] || ''),
              item_group: String(row[colIndices.item_group] || ''),
              quantity: qty,
              uom: String(row[colIndices.uom] || 'Nos'),
              unit_mrp: unitMrp,
              batch_number: String(row[colIndices.batch_number] || ''),
              expiry_date: String(row[colIndices.expiry_date] || ''),
              manufacturing_date: String(row[colIndices.manufacturing_date] || ''),
              supplier: String(row[colIndices.supplier] || ''),
              project: sheetProject,
              status: 'SUCCESS'
            });
          });
        });

        setUploadPreviewData(parsedItems);
        setUploadSummary({
          total: parsedItems.length,
          success: successCount,
          failed: failedCount
        });
        setShowUploadModal(true);
      } catch (err) {
        toast.error('Failed to read Excel file. Please ensure it is a valid .xlsx file.');
      }
    };
    reader.onerror = () => {
      toast.error('Error reading the file.');
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset file input
  };

  // Confirm Bulk Upload
  const handleConfirmBulkUpload = async () => {
    setUploadingBulk(true);
    const validItems = uploadPreviewData.filter(item => item.status === 'SUCCESS').map(item => ({
      item_code: String(item.item_code || '').trim(),
      item_name: String(item.item_name || '').trim(),
      description: String(item.description || '').trim(),
      hsn_code: String(item.hsn_code || '').trim(),
      item_group: String(item.item_group || '').trim(),
      quantity: isNaN(parseFloat(item.quantity)) ? 0.0 : parseFloat(item.quantity),
      uom: String(item.uom || 'Nos').trim(),
      unit_mrp: isNaN(parseFloat(item.unit_mrp)) ? 0.0 : parseFloat(item.unit_mrp),
      batch_number: String(item.batch_number || '').trim(),
      expiry_date: String(item.expiry_date || '').trim(),
      manufacturing_date: String(item.manufacturing_date || '').trim(),
      supplier: String(item.supplier || '').trim(),
      project: String(item.project || '').trim()
    }));

    try {
      const result = await api.drugs.bulkUpload(validItems);
      if (result.failed_count === 0) {
        toast.success(`Bulk upload completed! Imported ${result.success_count} items.`);
      } else {
        toast.success(`Imported ${result.success_count} items. ${result.failed_count} items failed validation.`);
      }
      if (addAuditLog) {
        addAuditLog(
          'BULK_UPLOAD',
          'Masters',
          `Bulk uploaded ${result.success_count} drug master records from Excel`
        );
      }
      setShowUploadModal(false);
      loadData();
    } catch (err) {
      console.error(err);
      if (err.status === 401 || err.status === 403) {
        toast.error('Session expired or unauthorized. Please log in again.');
      } else {
        toast.error(err.message || 'Error connecting to backend server.');
      }
    } finally {
      setUploadingBulk(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const stopRole = stopRoleInput === 'ADMIN' ? null : stopRoleInput;
      await api.projects.saveConfig(selectedProject, skipRolesInput, stopRole);
      toast.success("Project workflow configuration saved!");
      try {
        const configsData = await api.projects.getConfigs();
        setWorkflowConfigs(configsData);
      } catch (err) {
        console.error(err);
      }
      if (addAuditLog) {
        addAuditLog(
          'UPDATE_CONFIG',
          'Masters',
          `Configured workflow for ${selectedProject}: skip_roles=${skipRolesInput}, stop_role=${stopRoleInput}`
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error saving workflow configuration.");
    } finally {
      setSavingConfig(false);
    }
  };

  const getWorkflowNodes = () => {
    const skips = skipRolesInput.toLowerCase().split(',').map(s => s.trim());
    const stop = stopRoleInput ? stopRoleInput.toLowerCase().trim() : 'admin';
    
    let isStopped = false;
    const nodes = [];
    
    // Map previewChain (which contains actual names and roles from the hierarchy)
    // If previewChain is empty, fallback to default roles so the UI is never blank!
    const activeChain = previewChain;
    if (!activeChain || activeChain.length === 0) {
      return [];
    }
    
    for (let i = 0; i < activeChain.length; i++) {
      const member = activeChain[i];
      const roleId = member.role.toLowerCase();
      let status = 'active';
      
      // Determine node description (e.g. Initiator, Stage 1 Approver, etc.)
      let desc = 'Approver';
      if (i === 0) desc = 'Initiator';
      else if (i === 1) desc = 'First Approver';
      else if (i === 2) desc = 'Second Approver';
      else if (member.role === 'ADMIN') desc = 'Root Approver';
      
      // Format role name dynamically for presentation
      const displayRoleName = member.role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      
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
      
      nodes.push({
        id: `${member.role}_${i}`,
        roleName: displayRoleName,
        desc: desc,
        status
      });
    }
    
    return nodes;
  };

  const getWorkflowNodesPreview = () => {
    if (previewLoading) {
      return (
        <div className="flow-viz-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '120px', gap: '12px' }}>
          <div className="bavya-spinner" style={{ margin: '0 auto' }}>
            <div className="petal petal-tl"></div>
            <div className="petal petal-tr"></div>
            <div className="petal petal-bl"></div>
            <div className="petal petal-br"></div>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading workflow chain preview...</span>
        </div>
      );
    }

    const nodes = getWorkflowNodes();
    if (nodes.length === 0) {
      return (
        <div className="flow-viz-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No reporting hierarchy configured for this project.</span>
        </div>
      );
    }

    return (
      <div className="flow-viz-container">
        <h4 className="flow-viz-title">Live Dynamic Approval Chain Preview ({selectedProject})</h4>
        <div className="flow-nodes-wrapper">
          {nodes.map((node, idx) => (
            <React.Fragment key={node.id}>
              {idx > 0 && <span className="flow-connector">➔</span>}
              <div className={`flow-node ${node.status}-node`}>
                <span>{node.roleName}</span>
                <span className="flow-node-role" style={{ fontSize: '10px', marginTop: '2px' }}>{node.desc}</span>
                {node.status === 'skipped' && <span className="flow-node-badge" title="Bypassed">🚫</span>}
                {node.status === 'stop' && <span className="flow-node-badge" title="Early Stop">🔒</span>}
              </div>
            </React.Fragment>
          ))}
          <span className="flow-connector">➔</span>
          <div className="flow-node active-node" style={{ backgroundColor: '#ecfdf5', borderColor: '#10b981', color: '#047857' }}>
            <span>Central Warehouse</span>
            <span className="flow-node-role">Pool Dispatch</span>
          </div>
        </div>
      </div>
    );
  };

  // Filtered lists
  const filteredVehicles = vehicles.filter(v => v.project === selectedProject);
  
  const filteredDrugs = drugs.filter(d => {
    if (d.project !== selectedProject) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.item_name.toLowerCase().includes(q) ||
      d.item_code.toLowerCase().includes(q) ||
      (d.item_group && d.item_group.toLowerCase().includes(q)) ||
      (d.supplier && d.supplier.toLowerCase().includes(q))
    );
  });

  // Sort and Paginate
  const sortedDrugs = [...filteredDrugs].sort((a, b) => {
    let aVal = a[sortField] || '';
    let bVal = b[sortField] || '';
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    aVal = String(aVal).toLowerCase();
    bVal = String(bVal).toLowerCase();
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedDrugs.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedDrugs.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="tab-pane animate-fade-in masters-page-container">
      <div className="section-header-row">
        <div className="section-header-left">
          {activeSubTab === 'materials' ? (
            <>
              <h2>Material Master Management</h2>
              <p>Configure and manage project-specific assets, materials, and veterinary drug databases.</p>
            </>
          ) : (
            <>
              <h2>Indent Approval Workflow Settings</h2>
              <p>Configure dynamic bypasses and termination conditions for each project site.</p>
            </>
          )}
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="filter-bar project-master-filter-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <label htmlFor="master-project-select" className="filter-label">Select Project Site:</label>
          <CustomSelect 
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            disabled={!!(user?.project && user?.role?.toLowerCase() !== 'admin' && user?.username?.toLowerCase() !== 'admin')}
            options={projects.map(proj => ({ value: proj, label: proj }))}
            style={{ minWidth: '220px' }}
          />
        </div>

        {activeSubTab === 'materials' ? (
          <>
            <div className="filter-actions-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label className="action-btn-primary excel-upload-label" style={{ margin: 0, cursor: 'pointer' }}>
                <Upload size={16} />
                <span>Bulk Upload Excel</span>
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  onChange={handleExcelUpload} 
                  style={{ display: 'none' }} 
                />
              </label>
              <button className="action-btn-primary" onClick={() => openDrugModal()} style={{ margin: 0 }}>
                <Plus size={16} />
                <span>Add Item Manually</span>
              </button>
            </div>

            <div className="master-search-group" style={{ margin: 0, minWidth: '280px' }}>
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search drugs or material masters..." 
                className="master-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>

      {activeSubTab === 'materials' && (
        <>
          {loading ? (
            <div className="loading-state">
              <div className="bavya-spinner" style={{ margin: '0 auto 12px' }}>
                <div className="petal petal-tl"></div>
                <div className="petal petal-tr"></div>
                <div className="petal petal-bl"></div>
                <div className="petal petal-br"></div>
              </div>
              <span>Loading master databases...</span>
            </div>
          ) : (
            <div className="section-card drug-master-card-container" style={{ width: '100%' }}>
              <div className="card-header-with-icon header-with-export">
                  <div className="header-title-group">
                    <Database size={18} className="text-emerald" />
                    <h3>Drug & Material Stock Master ({selectedProject})</h3>
                  </div>
                  {filteredDrugs.length > 0 && (
                    <button className="action-btn-secondary" onClick={exportToCSV}>
                      Export CSV
                    </button>
                  )}
                </div>
                <div className="table-card" style={{ overflowX: 'auto' }}>
                  <table className="portal-table" style={{ width: '100%', minWidth: '1200px' }}>
                    <thead>
                      <tr>
                        <th onClick={() => handleSort('item_code')} className="sortable-header">
                          Item Code {sortField === 'item_code' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('item_name')} className="sortable-header">
                          Item Name {sortField === 'item_name' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('hsn_code')} className="sortable-header">
                          HSN Code {sortField === 'hsn_code' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('item_group')} className="sortable-header">
                          Group {sortField === 'item_group' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('batch_number')} className="sortable-header">
                          Batch No. {sortField === 'batch_number' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('quantity')} className="sortable-header text-right">
                          Stock (Current / Total) {sortField === 'quantity' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('unit_mrp')} className="sortable-header text-right">
                          Unit MRP {sortField === 'unit_mrp' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('manufacturing_date')} className="sortable-header">
                          Mfg. Date {sortField === 'manufacturing_date' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('expiry_date')} className="sortable-header">
                          Expiry Date {sortField === 'expiry_date' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('supplier')} className="sortable-header">
                          Supplier {sortField === 'supplier' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('description')} className="sortable-header">
                          Description {sortField === 'description' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th className="text-center sticky-actions-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentItems.length > 0 ? (
                        currentItems.map(d => (
                          <tr key={d.id} className={!d.is_active ? 'inactive-row' : ''}>
                            <td className="font-semibold" style={{ whiteSpace: 'nowrap' }}>{d.item_code}</td>
                            <td className="font-semibold" style={{ whiteSpace: 'nowrap' }}>{d.item_name}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{d.hsn_code || 'N/A'}</td>
                            <td>
                              <span className="type-badge" style={{ whiteSpace: 'nowrap' }}>{d.item_group || 'N/A'}</span>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{d.batch_number || 'N/A'}</td>
                            <td className="text-right font-semibold" style={{ whiteSpace: 'nowrap' }}>
                              <span>{d.quantity}</span>
                              <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '5px', marginRight: '5px' }}>/</span>
                              <span style={{ color: '#64748b' }}>{d.initial_quantity || d.quantity}</span>
                              <span className="qty-unit" style={{ marginLeft: '4px' }}>{d.uom}</span>
                            </td>
                            <td className="text-right font-semibold text-emerald" style={{ whiteSpace: 'nowrap' }}>
                              ${parseFloat(d.unit_mrp || 0).toFixed(2)}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{d.manufacturing_date || 'N/A'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span className="expiry-date-text">{d.expiry_date || 'N/A'}</span>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{d.supplier || 'N/A'}</td>
                            <td className="text-muted" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.description}>
                              {d.description || 'N/A'}
                            </td>
                            <td className="sticky-actions-col">
                              <div className="action-buttons justify-center">
                                <button 
                                  type="button"
                                  className="action-btn edit-btn-icon" 
                                  onClick={() => openDrugModal(d)}
                                  title="Edit Item"
                                >
                                  <Edit size={14} />
                                </button>
                                <button 
                                  type="button"
                                  className="action-btn refill-btn-icon" 
                                  onClick={() => openRefillModal(d)}
                                  title="Refill Stock"
                                  style={{ color: '#0284c7' }}
                                >
                                  <RefreshCw size={14} />
                                </button>
                                <button 
                                  type="button"
                                  className={`action-btn ${d.is_active ? 'active-toggle-btn' : 'inactive-toggle-btn'}`}
                                  onClick={() => handleToggleActive(d)}
                                  title={d.is_active ? "Deactivate Item" : "Activate Item"}
                                >
                                  <Power size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="12" className="text-center text-muted py-6">No drugs or materials found. Please add manually or upload an Excel sheet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Pagination Controls */}
                  <div className="table-pagination-row">
                    <div className="pagination-info">
                      Showing <span className="font-semibold">{sortedDrugs.length > 0 ? indexOfFirstItem + 1 : 0}</span> to <span className="font-semibold">{Math.min(indexOfLastItem, sortedDrugs.length)}</span> of <span className="font-semibold">{sortedDrugs.length}</span> items
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
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
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
                                  className={`pagination-btn page-num ${currentPage === p ? 'active' : ''}`}
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
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          )}
        </>
      )}

      {activeSubTab === 'workflow' && (
        <div className="section-card" style={{ width: '100%', marginTop: '0px' }}>
          <div className="card-header-with-icon">
            <Database size={18} className="text-emerald" />
            <h3>Configure Bypasses & Early Termination ({selectedProject})</h3>
          </div>
          <div style={{ padding: '24px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
              Configure dynamic bypasses and termination conditions for the selected project site. Changes apply immediately to new indent requests.
            </p>
            
            <div className="config-toggles-grid" style={{ marginTop: '20px' }}>
              <div className="config-toggle-card">
                <span className="config-toggle-label">Bypassed Roles</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {(() => {
                    const initiatorRole = previewChain.length > 0 ? previewChain[0].role : null;
                    const availableRoles = [...new Set(previewChain.map(node => node.role))]
                      .filter(r => r && 
                        r.toLowerCase() !== 'operator' && 
                        r.toLowerCase() !== 'unknown' && 
                        r.toLowerCase() !== 'initiator' && 
                        (!initiatorRole || r.toLowerCase() !== initiatorRole.toLowerCase())
                      );
                    
                    if (availableRoles.length === 0) {
                      return <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No additional supervisor/manager roles found in this project.</span>;
                    }

                    return availableRoles.map(role => {
                      const normalizedRole = role.toLowerCase().trim();
                      const currentSkips = skipRolesInput.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
                      const isChecked = currentSkips.includes(normalizedRole);
                      return (
                        <label 
                          key={role} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            fontSize: '13px', 
                            background: isChecked ? 'rgba(16, 185, 129, 0.08)' : '#f8fafc', 
                            border: isChecked ? '1px solid #10b981' : '1px solid #e2e8f0',
                            color: isChecked ? '#047857' : 'var(--text-primary)',
                            padding: '6px 14px', 
                            borderRadius: '20px', 
                            cursor: 'pointer',
                            fontWeight: isChecked ? '600' : '400',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            style={{ accentColor: '#10b981', cursor: 'pointer' }}
                            onChange={(e) => {
                              let list = skipRolesInput.split(',').map(s => s.trim()).filter(Boolean);
                              if (e.target.checked) {
                                if (!list.some(r => r.toLowerCase() === normalizedRole)) {
                                  list.push(role);
                                }
                              } else {
                                list = list.filter(r => r.toLowerCase() !== normalizedRole);
                              }
                              setSkipRolesInput(list.join(', '));
                            }}
                          />
                          {role.toUpperCase()}
                        </label>
                      );
                    });
                  })()}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>Select any roles that should be bypassed in the approval chain</span>
              </div>
              
              <div className="config-toggle-card">
                <span className="config-toggle-label">Highest Approval Stop Role</span>
                <CustomSelect 
                  value={stopRoleInput}
                  onChange={(e) => setStopRoleInput(e.target.value)}
                  options={[
                    { value: "ADMIN", label: "ADMIN (FULL CHAIN)" },
                    ...(() => {
                      const initiatorRole = previewChain.length > 0 ? previewChain[0].role : null;
                      return [...new Set(previewChain.map(node => node.role))]
                        .filter(r => r && 
                          r.toLowerCase() !== 'operator' && 
                          r.toLowerCase() !== 'unknown' && 
                          r.toLowerCase() !== 'initiator' && 
                          (!initiatorRole || r.toLowerCase() !== initiatorRole.toLowerCase())
                        )
                        .map(role => ({
                          value: role.toUpperCase(),
                          label: `${role.toUpperCase()} (EARLY STOP)`
                        }));
                    })()
                  ]}
                  style={{ textTransform: 'uppercase' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Chain terminates once this role approves</span>
              </div>
            </div>

            {/* Render the visual flow visualizer */}
            {getWorkflowNodesPreview()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button 
                type="button"
                className="action-btn-primary" 
                onClick={handleSaveConfig}
                disabled={savingConfig}
              >
                {savingConfig ? "Saving..." : "Save Workflow Config"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REFILL DRUG MODAL */}
      {showRefillModal && (
        <div className="dev-modal-overlay" onClick={() => setShowRefillModal(false)}>
          <div className="dev-modal-card drug-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <h3>Stock Refill Command Center</h3>
              <button className="close-modal-btn" onClick={() => setShowRefillModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRefillSubmit}>
              <div className="dev-modal-body drug-modal-body">
                {refillFormMessage.text && (
                  <div className={`form-message-banner ${refillFormMessage.type}`}>
                    {refillFormMessage.text}
                  </div>
                )}
                
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Item Name</span>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginTop: '4px' }}>{refillForm.item_name}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Item Code</span>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginTop: '4px' }}>{refillForm.item_code}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Project Site</span>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginTop: '4px' }}>{refillForm.project}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Category / Group</span>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginTop: '4px' }}>{refillForm.item_group || 'N/A'}</div>
                    </div>
                  </div>
                </div>
                
                <div className="drug-form-grid">
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Refill Batch Number *</label>
                    <input 
                      type="text" 
                      value={refillForm.batch_number}
                      onChange={(e) => setRefillForm(prev => ({ ...prev, batch_number: e.target.value }))}
                      placeholder="Enter batch number"
                      required
                    />
                    <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                      If batch matches, stock will be refilled. Otherwise, a new batch record will be created under same Item Code.
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Quantity to Refill *</label>
                    <input 
                      type="number" 
                      step="any"
                      min="0.01"
                      value={refillForm.refill_quantity}
                      onChange={(e) => setRefillForm(prev => ({ ...prev, refill_quantity: e.target.value }))}
                      placeholder="e.g. 500"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Unit MRP ($)</label>
                    <input 
                      type="number" 
                      step="any"
                      min="0"
                      value={refillForm.unit_mrp}
                      onChange={(e) => setRefillForm(prev => ({ ...prev, unit_mrp: e.target.value }))}
                      placeholder="e.g. 15.50"
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Supplier / Manufacturer</label>
                    <input 
                      type="text" 
                      value={refillForm.supplier}
                      onChange={(e) => setRefillForm(prev => ({ ...prev, supplier: e.target.value }))}
                      placeholder="e.g. Acme Corp"
                    />
                  </div>

                  <div className="form-group">
                    <label>Manufacturing Date</label>
                    <input 
                      type="date" 
                      value={refillForm.manufacturing_date}
                      onChange={(e) => setRefillForm(prev => ({ ...prev, manufacturing_date: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Expiry Date</label>
                    <input 
                      type="date" 
                      value={refillForm.expiry_date}
                      onChange={(e) => setRefillForm(prev => ({ ...prev, expiry_date: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              
              <div className="dev-modal-footer">
                <button 
                  type="button" 
                  className="action-btn-secondary" 
                  onClick={() => setShowRefillModal(false)}
                  disabled={submittingRefill}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="action-btn-primary"
                  disabled={submittingRefill}
                >
                  {submittingRefill ? 'Refilling...' : 'Execute Stock Refill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. MANUAL CREATE/EDIT DRUG MODAL */}
      {showDrugModal && (
        <div className="dev-modal-overlay" onClick={() => setShowDrugModal(false)}>
          <div className="dev-modal-card drug-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <h3>{editingDrug ? 'Edit Master Record' : 'Create New Master Record'}</h3>
              <button className="close-modal-btn" onClick={() => setShowDrugModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleDrugSubmit}>
              <div className="dev-modal-body drug-modal-body">
                {drugFormMessage.text && (
                  <div className={`form-message-banner ${drugFormMessage.type}`}>
                    {drugFormMessage.text}
                  </div>
                )}
                
                <div className="drug-form-grid">
                  <div className="form-group">
                    <label>Item Code *</label>
                    <input 
                      type="text" 
                      value={drugForm.item_code}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, item_code: e.target.value }))}
                      placeholder="e.g. DRG-2026-001"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Item Name *</label>
                    <input 
                      type="text" 
                      value={drugForm.item_name}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, item_name: e.target.value }))}
                      placeholder="e.g. Paracetamol 500mg"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Item Group</label>
                    <input 
                      type="text" 
                      value={drugForm.item_group}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, item_group: e.target.value }))}
                      placeholder="e.g. Veterinary Injections"
                    />
                  </div>

                  <div className="form-group">
                    <label>HSN Code</label>
                    <input 
                      type="text" 
                      value={drugForm.hsn_code}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, hsn_code: e.target.value }))}
                      placeholder="e.g. 30049099"
                    />
                  </div>

                  <div className="form-group">
                    <label>Quantity (Stock)</label>
                    <input 
                      type="number" 
                      step="any"
                      value={drugForm.quantity}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, quantity: e.target.value }))}
                      placeholder="e.g. 250"
                    />
                  </div>

                  <div className="form-group">
                    <label>UOM (Unit of Measure)</label>
                    <input 
                      type="text" 
                      value={drugForm.uom}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, uom: e.target.value }))}
                      placeholder="e.g. Nos, Vial, Box"
                    />
                  </div>

                  <div className="form-group">
                    <label>Unit MRP ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={drugForm.unit_mrp}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, unit_mrp: e.target.value }))}
                      placeholder="e.g. 15.50"
                    />
                  </div>

                  <div className="form-group">
                    <label>Batch Number</label>
                    <input 
                      type="text" 
                      value={drugForm.batch_number}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, batch_number: e.target.value }))}
                      placeholder="e.g. BATCH-A492"
                    />
                  </div>

                  <div className="form-group">
                    <label>Expiry Date</label>
                    <input 
                      type="date" 
                      value={drugForm.expiry_date}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, expiry_date: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Manufacturing Date</label>
                    <input 
                      type="date" 
                      value={drugForm.manufacturing_date}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, manufacturing_date: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Supplier</label>
                    <input 
                      type="text" 
                      value={drugForm.supplier}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, supplier: e.target.value }))}
                      placeholder="e.g. MedLife Pharmaceuticals"
                    />
                  </div>

                  <div className="form-group">
                    <label>Project Mapping *</label>
                    <CustomSelect 
                      value={drugForm.project}
                      onChange={(e) => setDrugForm(prev => ({ ...prev, project: e.target.value }))}
                      disabled
                      options={projects.map(proj => ({ value: proj, label: proj }))}
                    />
                  </div>

                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
                    <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={drugForm.is_active}
                        onChange={(e) => setDrugForm(prev => ({ ...prev, is_active: e.target.checked }))}
                        style={{ width: '18px', height: '18px', margin: 0, cursor: 'pointer' }}
                      />
                      <span>Active Status</span>
                    </label>
                  </div>


                </div>

                <div className="form-group full-width" style={{ marginTop: '12px' }}>
                  <label>Description</label>
                  <textarea 
                    rows="2"
                    value={drugForm.description}
                    onChange={(e) => setDrugForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter item description, usage instructions, or additional details..."
                  />
                </div>
              </div>
              <div className="dev-modal-footer">
                <button type="button" className="dev-modal-close-btn" onClick={() => setShowDrugModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="action-btn-primary">
                  Save Master Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. BULK UPLOAD PREVIEW & VALIDATION MODAL */}
      {showUploadModal && (
        <div className="dev-modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="dev-modal-card bulk-upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <h3>Excel Import - Verification & Validation</h3>
              <button className="close-modal-btn" onClick={() => setShowUploadModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="dev-modal-body">
              <p className="subtitle-text">
                Please verify the parsed records from your spreadsheet. The system has automatically mapped project associations based on item name suffixes.
              </p>

              {/* Upload Stats Cards */}
              <div className="upload-stats-row">
                <div className="upload-stat-card total">
                  <span className="stat-num">{uploadSummary.total}</span>
                  <span className="stat-label">Total Parsed Rows</span>
                </div>
                <div className="upload-stat-card success">
                  <span className="stat-num">{uploadSummary.success}</span>
                  <span className="stat-label">Ready for Import (Succeeded)</span>
                </div>
                <div className="upload-stat-card failed">
                  <span className="stat-num">{uploadSummary.failed}</span>
                  <span className="stat-label">Validation Errors (Failed)</span>
                </div>
              </div>

              {/* Preview Table */}
              <div className="preview-table-wrapper">
                <table className="portal-table preview-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Item Code / Name</th>
                      <th>Qty</th>
                      <th>Unit MRP</th>
                      <th>Mapped Project</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadPreviewData.map((item, idx) => (
                      <tr key={idx} className={item.status === 'FAILED' ? 'row-failed' : 'row-success'}>
                        <td>{item.index}</td>
                        <td>
                          <div className="drug-item-info">
                            <span className="font-semibold">{item.item_name}</span>
                            <span className="drug-item-code">{item.item_code}</span>
                            {item.validationError && (
                              <span className="validation-error-msg">⚠️ {item.validationError}</span>
                            )}
                          </div>
                        </td>
                        <td>{item.quantity} {item.uom}</td>
                        <td>${parseFloat(item.unit_mrp || 0).toFixed(2)}</td>
                        <td>
                          <span className="project-text font-semibold">{item.project}</span>
                        </td>
                        <td>
                          <span className={`status-badge ${item.status === 'SUCCESS' ? 'approved' : 'rejected'}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="dev-modal-footer">
              <button 
                type="button" 
                className="dev-modal-close-btn" 
                onClick={() => setShowUploadModal(false)}
                disabled={uploadingBulk}
              >
                Discard
              </button>
              <button 
                type="button" 
                className="action-btn-primary" 
                onClick={handleConfirmBulkUpload}
                disabled={uploadingBulk || uploadSummary.success === 0}
              >
                {uploadingBulk ? 'Importing Master Data...' : `Confirm Import (${uploadSummary.success} Items)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
