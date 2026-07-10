import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  ChevronLeft, ChevronRight, ChevronDown, Search, Plus, Trash2, Edit, X, Check, QrCode,
  AlertTriangle, Clock, CheckCircle, PackageCheck, ClipboardCheck, Share2,
  RefreshCw, Layers, ArrowLeft, TrendingUp, Droplets, Truck, FileText, ArrowLeftRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import api from '../../services/api';
import CustomSelect from '../../components/CustomSelect';

// Helper to format date string to YYYY-MM-DD
const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  
  // Try Excel Serial Number Check
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
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (parts[2].length === 2) {
      const year = parseInt(parts[2]) > 50 ? `19${parts[2]}` : `20${parts[2]}`;
      return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  
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

const getPaginationRange = (currentPage, totalPages) => {
  const delta = 2;
  const range = [];
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    range.push(i);
  }
  if (currentPage - delta > 2) {
    range.unshift("...");
  }
  if (currentPage + delta < totalPages - 1) {
    range.push("...");
  }
  range.unshift(1);
  if (totalPages > 1) {
    range.push(totalPages);
  }
  return range;
};

export default function ConsumptionPage() {
  const {
    user, userRole, isWarehouseUser, userProject, userOffice, userFullName,
    projects, selectedProject, setSelectedProject, drugs, shiftDrugs, setShiftDrugs,
    officeInventory, loadingOfficeInventory, transitInventory, pendingHandover, setPendingHandover,
    hasProposedHandover, shiftStatus,
    fetchOfficeInventory, fetchTransitInventory, fetchPendingHandovers, fetchDashboardData, addAuditLog,
    loadingDrugs, fetchDrugs, loadingShifts, fetchShifts
  } = useApp();

  const isHandoverInitiated = !!pendingHandover || hasProposedHandover || shiftStatus === 'view_only';

  // Local Logging/Shift States
  const [shiftProject, setShiftProject] = useState('');
  const [shiftOffices, setShiftOffices] = useState([]);
  const [shiftOffice, setShiftOffice] = useState('');
  const [shiftSearch, setShiftSearch] = useState('');
  const [shiftPage, setShiftPage] = useState(1);
  const [shiftPageSize, setShiftPageSize] = useState(10);
  const [selectedShiftItems, setSelectedShiftItems] = useState({});
  const [shiftSelectedType, setShiftSelectedType] = useState('shift_1');
  const [shiftRemarks, setShiftRemarks] = useState('');
  const [showShiftSubmitPreview, setShowShiftSubmitPreview] = useState(false);
  const [shiftFormMessage, setShiftFormMessage] = useState({ type: '', text: '' });
  const [loggingShift, setLoggingShift] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(5);
  const [previewSearch, setPreviewSearch] = useState('');

  // Transit/Draw Stock States
  const navigate = useNavigate();
  const location = useLocation();

  let dashboardSubView = 'MAIN';
  if (location.pathname === '/consumption/draw') {
    dashboardSubView = 'DRAW_STOCK';
  } else if (location.pathname === '/consumption/history') {
    dashboardSubView = 'HISTORY_LOGS';
  }

  const setDashboardSubView = (view) => {
    if (view === 'DRAW_STOCK') {
      navigate('/consumption/draw');
    } else if (view === 'HISTORY_LOGS') {
      navigate('/consumption/history');
    } else {
      navigate('/consumption');
    }
  };

  useEffect(() => {
    if (location.pathname === '/consumption/record') {
      if (isHandoverInitiated) {
        toast.error("Stock handover has been initiated. Cannot record consumption.");
        navigate('/consumption');
      } else {
        setConsumptionSubView('RECORD');
        const proj = shiftProject || userProject || (projects.length > 0 ? projects[0] : '');
        const office = shiftOffice || userOffice?.name || '';
        const shift = shiftSelectedType || 'shift_1';
        fetchShiftDrugsAndDrafts(proj, office, shift);
      }
    } else if (location.pathname === '/consumption' || location.pathname === '/consumption/') {
      setConsumptionSubView('HISTORY');
    }
  }, [location.pathname, isHandoverInitiated, userProject, userOffice, projects]);

  const [consumptionSubView, setConsumptionSubView] = useState('HISTORY'); // 'HISTORY', 'RECORD', 'READONLY'
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState(null);

  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedRecipientUsername, setSelectedRecipientUsername] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [handoverSearch, setHandoverSearch] = useState('');
  const [handoverPage, setHandoverPage] = useState(1);
  const [handoverPageSize, setHandoverPageSize] = useState(5);

  const fetchUsersList = async () => {
    setLoadingUsers(true);
    try {
      const data = await api.users.getUsers();
      const filtered = (data || []).filter(u => u.username !== user?.username);
      setUsersList(filtered);
    } catch (err) {
      console.error("Failed to fetch users for handover dropdown:", err);
      try {
        const empData = await api.users.getEmployees();
        const activeUsers = (empData || [])
          .filter(emp => emp.is_active_in_app && emp.username && emp.username !== user?.username)
          .map(emp => ({ username: emp.username }));
        setUsersList(activeUsers);
      } catch (innerErr) {
        console.error("Failed to fetch employees fallback:", innerErr);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (showHandoverModal) {
      fetchUsersList();
      setSelectedRecipientUsername('');
      setHandoverSearch('');
      setHandoverPage(1);
      setHandoverPageSize(5);
    }
  }, [showHandoverModal]);
  const [drawQuantities, setDrawQuantities] = useState({}); // drug_id: quantity
  const [drawScannedBatches, setDrawScannedBatches] = useState({}); // drug_id: batch_number
  const [fefoViolationDetails, setFefoViolationDetails] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isTransitScanning, setIsTransitScanning] = useState(null);
  const [activeCameraScanner, setActiveCameraScanner] = useState(null); // 'draw' or 'verify' or null
  const [scannerDrugId, setScannerDrugId] = useState(null);
  
  // Custom Pagination and Search
  const [drawSearchQuery, setDrawSearchQuery] = useState('');
  const [drawPage, setDrawPage] = useState(1);
  const [drawPageSize, setDrawPageSize] = useState(10);
  const [drawManualBypass, setDrawManualBypass] = useState({}); // drug_id -> boolean
  const [drawManualRemarks, setDrawManualRemarks] = useState({}); // drug_id -> string
  const [expandedDrawItems, setExpandedDrawItems] = useState({}); // item_code/name -> boolean


  // History Logs States
  const [historyActiveTab, setHistoryActiveTab] = useState('SHIFTS'); // 'SHIFTS', 'DRAWINGS', 'INDENTS'
  const [historyLogsSearch, setHistoryLogsSearch] = useState('');
  const [historyLogsPage, setHistoryLogsPage] = useState(1);
  const [historyLogsPageSize, setHistoryLogsPageSize] = useState(10);
  const [loadingShiftSubmissions, setLoadingShiftSubmissions] = useState(false);
  const [shiftSubmissionsData, setShiftSubmissionsData] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditLogsData, setAuditLogsData] = useState([]);
  const [loadingIndents, setLoadingIndents] = useState(false);
  const [indentsData, setIndentsData] = useState([]);

  // QR/Barcode Scanner Effect Hook
  useEffect(() => {
    let qrScanner = null;
    let isMounted = true;

    if (activeCameraScanner && scannerDrugId) {
      let isMounted = true;
      const startScanner = (retries = 0) => {
        if (!isMounted) return;
        const readerElement = document.getElementById("reader");
        if (!readerElement) {
          if (retries < 20) {
            setTimeout(() => startScanner(retries + 1), 50);
          } else {
            console.error("Reader container element not found in DOM");
          }
          return;
        }

        try {
          qrScanner = new window.Html5Qrcode("reader");
          qrScanner.start(
            { facingMode: "environment" },
            {
              fps: 15,
              qrbox: (width, height) => {
                return { width: Math.min(width, 280), height: 120 };
              }
            },
            (decodedText) => {
              if (!isMounted) return;
              
              if (activeCameraScanner === 'draw') {
                const targetInv = officeInventory.find(item => item.drug_id === scannerDrugId);
                const expectedBatch = targetInv ? (targetInv.batch_number || '') : '';
                const decodedTextTrimmed = decodedText.trim();
                
                if (decodedTextTrimmed.toLowerCase() === expectedBatch.toLowerCase()) {
                  setDrawScannedBatches(prev => ({ ...prev, [scannerDrugId]: decodedTextTrimmed }));
                  toast.success("Batch matched! You can now enter draw quantity.");
                } else {
                  setDrawScannedBatches(prev => ({ ...prev, [scannerDrugId]: decodedTextTrimmed }));
                  toast.error(`Error: Scanned batch '${decodedTextTrimmed}' does not match expected '${expectedBatch}'. Please scan the FEFO priority batch.`);
                }
              } else if (activeCameraScanner === 'verify') {
                const targetDrug = drugs.find(item => item.id === scannerDrugId);
                if (targetDrug) {
                  if (decodedText.trim() === targetDrug.batch_number) {
                    setSelectedShiftItems(prev => {
                      const curr = prev[targetDrug.id] || { consumed: '', received: '', sent_back: '' };
                      return {
                        ...prev,
                        [targetDrug.id]: {
                          ...curr,
                          verified_batch: decodedText.trim(),
                          consumed: curr.consumed || '1'
                        }
                      };
                    });
                    toast.success("Bottle barcode verification successful!");
                    setIsTransitScanning(null);
                  } else {
                    toast.error(`Verification error. Scanned batch '${decodedText}' doesn't match expected '${targetDrug.batch_number}'.`);
                  }
                }
              }

              if (qrScanner && qrScanner.isScanning) {
                qrScanner.stop().then(() => {
                  setActiveCameraScanner(null);
                  setScannerDrugId(null);
                }).catch(e => console.error(e));
              } else {
                setActiveCameraScanner(null);
                setScannerDrugId(null);
              }
            },
            (errorMessage) => {
              // scanning in progress
            }
          ).catch(err => {
            console.error("Camera scanner start error:", err);
            toast.error("Failed to open camera. Please check camera permissions.");
            setActiveCameraScanner(null);
            setScannerDrugId(null);
          });
        } catch (e) {
          console.error("Html5Qrcode constructor error:", e);
          toast.error("Scanner initialization failed.");
          setActiveCameraScanner(null);
          setScannerDrugId(null);
        }
      };

      startScanner();

      return () => {
        isMounted = false;
        if (qrScanner) {
          if (qrScanner.isScanning) {
            qrScanner.stop().then(() => {
              console.log("Scanner stopped on cleanup");
            }).catch(e => console.error("Error stopping scanner on cleanup:", e));
          }
        }
      };
    }
  }, [activeCameraScanner, scannerDrugId, officeInventory, drugs]);


  // Handlers & Logic

  const fetchShiftSubmissionsHistory = async () => {
    setLoadingShiftSubmissions(true);
    try {
      const data = await api.shifts.getReport(shiftProject || '');
      setShiftSubmissionsData(data || []);
    } catch (err) {
      console.error("Error fetching shift submissions history:", err);
      toast.error("Failed to load shift submissions history.");
    } finally {
      setLoadingShiftSubmissions(false);
    }
  };

  const fetchAuditHistory = async () => {
    setLoadingAuditLogs(true);
    try {
      const data = await api.audit.getLogs(shiftProject || '');
      setAuditLogsData(data || []);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
      toast.error("Failed to load drawing/handover audit logs.");
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const fetchIndentsHistory = async () => {
    setLoadingIndents(true);
    try {
      const data = await api.indents.getIndents();
      const filtered = shiftProject 
        ? (data || []).filter(ind => (ind.indent_project || ind.project) === shiftProject)
        : (data || []);
      setIndentsData(filtered);
    } catch (err) {
      console.error("Error fetching indents:", err);
      toast.error("Failed to load indents history.");
    } finally {
      setLoadingIndents(false);
    }
  };

  useEffect(() => {
    fetchShiftSubmissionsHistory();
    if (location.pathname === '/consumption/history') {
      fetchAuditHistory();
      fetchIndentsHistory();
    }
  }, [location.pathname, shiftProject]);

// ====================================
// FUNCTION: handleAcceptHandover (Lines 819-843)
// ====================================
  const handleAcceptHandover = async () => {
    try {
      await api.transit.acceptHandover();
      toast.success("Accepted vehicle transit stock handover successfully.");
      setPendingHandover(null);
      fetchTransitInventory();
      fetchDashboardData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Error accepting handover.");
    }
  };

// ====================================
// FUNCTION: handleProposeHandover (Lines 845-874)
// ====================================
  const handleProposeHandover = async (recipientUsername) => {
    if (!recipientUsername) {
      toast.error("Please enter incoming operator username.");
      return;
    }
    try {
      await api.transit.proposeHandover(recipientUsername);
      toast.success(`Proposed stock handover to ${recipientUsername}.`);
      setShowHandoverModal(false);
      setSelectedRecipientUsername('');
      fetchTransitInventory();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Error proposing handover.");
    }
  };

// ====================================
// FUNCTION: handleDrawTransitStock (Lines 876-923)
// ====================================
  const handleDrawTransitStock = async (itemsPayload) => {
    try {
      const payloadProj = userProject || officeInitProject;
      const payloadOff = userOffice?.name || officeInitOffice;
      if (!payloadProj || !payloadOff || payloadOff === 'N/A') {
        toast.error("Assigned facility project and location could not be determined.");
        return;
      }

      await api.transit.drawStock(payloadProj, payloadOff, itemsPayload);
      toast.success("Successfully loaded items into vehicle transit bag.");
      setDrawQuantities({});
      setDrawScannedBatches({});
      setDrawManualBypass({});
      setDrawManualRemarks({});
      setFefoViolationDetails(null);
      setOverrideReason('');
      setDashboardSubView('MAIN');
      fetchTransitInventory();
      fetchOfficeInventory(payloadProj, payloadOff);
    } catch (e) {
      console.error(e);
      if (e.status === 422 && e.detail && e.detail.error_type === "FEFO_VIOLATION") {
        setFefoViolationDetails(e.detail);
      } else {
        toast.error(e.message || "Failed to draw stock.");
      }
    }
  };

// ====================================
// FUNCTION: handleReturnTransitStock (Lines 925-964)
// ====================================
  const handleReturnTransitStock = async () => {
    if (transitInventory.length === 0) {
      toast.error("No items in Transit/Vehicle to return.");
      return;
    }
    try {
      const itemsPayload = transitInventory.map(item => ({
        drug_id: item.drug_id,
        quantity: item.quantity
      }));
      const payloadProj = userProject || officeInitProject;
      const payloadOff = userOffice?.name || officeInitOffice;
      
      await api.transit.returnStock(payloadProj, payloadOff, itemsPayload);
      toast.success("Returned all leftover transit stock back to Facility box.");
      fetchTransitInventory();
      fetchOfficeInventory(payloadProj, payloadOff);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Error returning stock.");
    }
  };

// ====================================
// FUNCTION: fetchShiftProjectOffices (Lines 1342-1368)
// ====================================
  const fetchShiftProjectOffices = async (projectName) => {
    try {
      const data = await api.projects.getOffices(projectName);
      setShiftOffices(data);
      
      // Lock office for leaf node user if details match
      const isUserAdmin = user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin';
      if (!isUserAdmin && userOffice?.name && userOffice.name !== 'N/A') {
        setShiftOffice(userOffice.name);
      } else if (data.length > 0) {
        setShiftOffice(data[0].name);
      } else {
        setShiftOffice('');
      }
    } catch (err) {
      console.error("Error fetching shift project offices:", err);
      setShiftOffices([]);
      setShiftOffice('');
    }
  };
  useEffect(() => {
    if (drugs.length === 0 && !loadingDrugs) {
      fetchDrugs();
    }
    if (shiftDrugs.length === 0 && !loadingShifts) {
      fetchShifts();
    }
    fetchTransitInventory();
    fetchPendingHandovers();
  }, []);

  useEffect(() => {
    const defaultProj = userProject || (projects.length > 0 ? projects[0] : '');
    if (defaultProj && !shiftProject) {
      setShiftProject(defaultProj);
    }
  }, [userProject, projects, shiftProject]);

  useEffect(() => {
    if (shiftProject) {
      fetchShiftProjectOffices(shiftProject);
    } else {
      setShiftOffices([]);
      setShiftOffice('');
    }
  }, [shiftProject]);

  useEffect(() => {
    if (shiftProject && shiftOffice) {
      fetchOfficeInventory(shiftProject, shiftOffice);
    }
  }, [shiftProject, shiftOffice]);

  const filteredShiftDrugs = shiftDrugs.filter(d => {
    if (d.project !== shiftProject || !d.is_active) return false;

    // Show only the drugs that have active transit quantity OR office quantity OR some draft selection
    const inTransit = transitInventory.some(t => t.drug_id === d.id && t.quantity > 0);
    const inOffice = Math.round(d.quantity || 0) > 0;      
    const hasDraftActivity = !!selectedShiftItems[d.id] && (
      Math.round(parseFloat(selectedShiftItems[d.id].consumed) || 0) > 0 ||
      Math.round(parseFloat(selectedShiftItems[d.id].received) || 0) > 0 ||
      Math.round(parseFloat(selectedShiftItems[d.id].sent_back) || 0) > 0
    );

    if (!inTransit && !inOffice && !hasDraftActivity) return false;

    if (shiftSearch !== '') {
      const term = shiftSearch.toLowerCase();
      return (
        d.item_name.toLowerCase().includes(term) ||        
        (d.item_code && d.item_code.toLowerCase().includes(term))
      );
    }
    return true;
  });

  const shiftDrugGroups = [];
  const shiftDrugGroupsMap = {};
  filteredShiftDrugs.forEach(d => {
    const key = d.item_code || d.item_name;
    if (!shiftDrugGroupsMap[key]) {
      shiftDrugGroupsMap[key] = {
        item_name: d.item_name,
        item_code: d.item_code,
        batches: []
      };
      shiftDrugGroups.push(shiftDrugGroupsMap[key]);       
    }
    shiftDrugGroupsMap[key].batches.push(d);
  });

  // Sort batches under each shift drug group by expiry date ascending
  shiftDrugGroups.forEach(group => {
    group.batches.sort((a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return new Date(a.expiry_date) - new Date(b.expiry_date);
    });
  });

  const totalShiftPages = Math.ceil(shiftDrugGroups.length / shiftPageSize);
  const paginatedShiftDrugGroups = shiftDrugGroups.slice((shiftPage - 1) * shiftPageSize, shiftPage * shiftPageSize);
  const currentShiftPageIds = paginatedShiftDrugGroups.flatMap(group => group.batches.map(d => d.id));
  const isAllCurrentShiftSelected = currentShiftPageIds.length > 0 && currentShiftPageIds.every(id => !!selectedShiftItems[id]);

// ====================================
// FUNCTION: handleSelectAllCurrentShift (Lines 1439-1453)
// ====================================
  const handleSelectAllCurrentShift = (checked) => {
    setSelectedShiftItems(prev => {
      const copy = { ...prev };
      if (checked) {
        currentShiftPageIds.forEach(id => {
          copy[id] = copy[id] || { consumed: '1', received: '', sent_back: '' };
        });
      } else {
        currentShiftPageIds.forEach(id => {
          delete copy[id];
        });
      }
      return copy;
    });
  };

// ====================================
// FUNCTION: getSelectedShiftItemsDetails (Lines 1455-1465)
// ====================================
  const getSelectedShiftItemsDetails = () => {
    return Object.entries(selectedShiftItems)
      .map(([id, qty]) => {
        const drug = shiftDrugs.find(d => d.id === parseInt(id));
        return {
          ...drug,
          consumed_qty: qty
        };
      })
      .filter(d => !!d.id);
  };

  const getSelectedItemsPayload = () => {
    const items = Object.entries(selectedShiftItems)
      .map(([id, val]) => {
        const drugId = parseInt(id);
        let cons = 0;
        let rec = 0;
        let sb = 0;
        
        if (typeof val === 'object' && val !== null) {
          cons = Math.round(parseFloat(val.consumed) || 0);
          rec = Math.round(parseFloat(val.received) || 0);
          sb = Math.round(parseFloat(val.sent_back) || 0);
        } else {
          cons = Math.round(parseFloat(val) || 0);
        }
        
        return {
          drug_id: drugId,
          consumed_qty: cons,
          received_qty: rec,
          sent_back_qty: sb
        };
      });

    const addedIds = new Set(items.map(item => item.drug_id));

    // Also include any items that are active in transit bag but not entered in form, as 0 quantities
    transitInventory.forEach(t => {
      if (t.quantity > 0 && !addedIds.has(t.drug_id)) {
        items.push({
          drug_id: t.drug_id,
          consumed_qty: 0,
          received_qty: 0,
          sent_back_qty: 0
        });
        addedIds.add(t.drug_id);
      }
    });

    // Also include any item in shiftDrugs that has stock/office inventory but not entered, as 0 quantities
    shiftDrugs.forEach(d => {
      if (d.project === shiftProject && d.is_active && !addedIds.has(d.id)) {
        items.push({
          drug_id: d.id,
          consumed_qty: 0,
          received_qty: 0,
          sent_back_qty: 0
        });
        addedIds.add(d.id);
      }
    });

    return items.filter(item => {
      const drug = shiftDrugs.find(d => d.id === item.drug_id);
      const isOfficeStock = drug && Math.round(drug.quantity || 0) > 0;
      const isBagStock = transitInventory.some(t => t.drug_id === item.drug_id && t.quantity > 0);
      const hasAnyActivity = item.consumed_qty > 0 || item.received_qty > 0 || item.sent_back_qty > 0;
      return hasAnyActivity || isBagStock || isOfficeStock;
    });
  };

// ====================================
// FUNCTION: fetchShiftDrugsAndDrafts (Lines 1493-1537)
// ====================================
  const fetchShiftDrugsAndDrafts = async (proj, office, shift) => {
    if (!proj || !office) return;
    try {
      const drugsData = await api.drugs.getDrugs(proj, office);
      setShiftDrugs(drugsData);
      
      try {
        const draftData = await api.shifts.getDrafts(proj, office, shift);
        const draftItems = draftData.items || {};
        const draftRemarks = draftData.remarks || '';
        
        const parsedItems = {};
        Object.entries(draftItems).forEach(([id, val]) => {
          if (typeof val === 'object' && val !== null) {
            parsedItems[id] = {
              consumed: val.consumed_qty !== undefined ? Math.round(val.consumed_qty).toString() : '',
              received: val.received_qty !== undefined ? Math.round(val.received_qty).toString() : '',
              sent_back: val.sent_back_qty !== undefined ? Math.round(val.sent_back_qty).toString() : ''
            };
          } else {
            parsedItems[id] = {
              consumed: val !== undefined ? Math.round(parseFloat(val)).toString() : '',
              received: '',
              sent_back: ''
            };
          }
        });
        
        setSelectedShiftItems(parsedItems);
        setShiftRemarks(draftRemarks);
      } catch (e) {
        setSelectedShiftItems({});
        setShiftRemarks('');
      }
    } catch (err) {
      console.error("Error fetching shift drugs/drafts:", err);
    }
  };

// ====================================
// FUNCTION: handleSaveDraft (Lines 1548-1642)
// ====================================
  const handleSaveDraft = async () => {
    setShiftFormMessage({ type: '', text: '' });
    
    if (isHandoverInitiated) {
      toast.error("Stock handover has been initiated. Cannot save draft.");
      return;
    }
    
    if (!shiftOffice) {
      setShiftFormMessage({ type: 'error', text: 'Please select an office/facility.' });
      return;
    }
    
    const itemsToSubmit = getSelectedItemsPayload();
      
    if (itemsToSubmit.length === 0) {
      setShiftFormMessage({ type: 'error', text: 'Please enter a quantity greater than 0 for at least one item (consumption, received, or sent back).' });
      return;
    }

    const hasExceeded = Object.entries(selectedShiftItems).some(([id, val]) => {
      const drug = shiftDrugs.find(d => d.id === parseInt(id));
      if (!drug) return false;
      const itemState = val || { consumed: '', received: '', sent_back: '' };
      
      const stock = Math.round(drug.quantity || 0);
      const consumedVal = Math.round(parseFloat(itemState.consumed) || 0);
      const receivedVal = Math.round(parseFloat(itemState.received) || 0);
      const sentBackVal = Math.round(parseFloat(itemState.sent_back) || 0);
      
      const transitItem = transitInventory.find(t => t.drug_id === drug.id && t.quantity > 0);
      const transitQty = transitItem ? Math.round(transitItem.quantity) : 0;
      
      let isDrawnThisShift = false;
      if (transitItem && transitItem.created_at) {
        const createdDate = new Date(transitItem.created_at);
        const diffMs = new Date() - createdDate;
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours < 16) {
          isDrawnThisShift = true;
        }
      }
      
      const officeOB = Math.max(0, stock - receivedVal + sentBackVal + (isDrawnThisShift ? transitQty : 0));
      const officeReceived = receivedVal;
      const officeSentBack = sentBackVal;
      const officeConsumed = isDrawnThisShift ? transitQty : 0;
      const officeClosing = Math.max(0, officeOB + officeReceived - officeSentBack - officeConsumed);
      
      const bagOB = isDrawnThisShift ? 0 : transitQty;
      const bagReceived = isDrawnThisShift ? transitQty : 0;
      const bagSentBack = 0;
      const bagConsumed = consumedVal;
      const bagClosing = Math.max(0, bagOB + bagReceived - bagSentBack - bagConsumed);
      
      const availableLimit = bagOB + bagReceived;
      
      return consumedVal > availableLimit;
    });

    if (hasExceeded) {
      toast.error("One or more items have consumed quantities exceeding their available stock.");
      setShiftFormMessage({ type: 'error', text: 'Consumption cannot exceed available stock (OB + Received - Sent Back).' });
      return;
    }
    
    setLoggingShift(true);
    try {
      await api.shifts.submitReport(shiftProject, shiftOffice, shiftSelectedType, itemsToSubmit, shiftRemarks, true);
      toast.success("Consumption draft saved successfully!");
      setShiftFormMessage({ type: 'success', text: 'Draft saved successfully.' });
      fetchShiftDrugsAndDrafts(shiftProject, shiftOffice, shiftSelectedType);
      setConsumptionSubView('HISTORY');
      fetchShiftSubmissionsHistory();
    } catch (err) {
      console.error(err);
      setShiftFormMessage({ type: 'error', text: err.message || 'Failed to save draft.' });
    } finally {
      setLoggingShift(false);
    }
  };

// ====================================
// FUNCTION: submitShiftBatch (Lines 1644-1692)
// ====================================
  const submitShiftBatch = async () => {
    const itemsToSubmit = getSelectedItemsPayload();
      
    setLoggingShift(true);
    try {
      await api.shifts.submitReport(shiftProject, shiftOffice, shiftSelectedType, itemsToSubmit, shiftRemarks, false);
      toast.success(`Successfully logged consumption for ${itemsToSubmit.length} items!`);
      setShowShiftSubmitPreview(false);
      fetchDashboardData();
      fetchShiftDrugsAndDrafts(shiftProject, shiftOffice, shiftSelectedType);
      addAuditLog(
        'CREATE',
        'ShiftLogs',
        `Logged bulk shift consumption for ${itemsToSubmit.length} items under project ${shiftProject} (${shiftSelectedType})`,
        'SUCCESS',
        shiftProject
      );
      setSelectedShiftItems({});
      setShiftRemarks('');
      setConsumptionSubView('HISTORY');
      fetchShiftSubmissionsHistory();
    } catch (err) {
      console.error(err);
      setShiftFormMessage({ type: 'error', text: err.message || 'Failed to log shift consumption.' });
      setShowShiftSubmitPreview(false);
    } finally {
      setLoggingShift(false);
    }
  };

// ====================================
// FUNCTION: handleShiftBatchSubmit (Lines 1694-1756)
// ====================================
  const handleShiftBatchSubmit = (e) => {
    e.preventDefault();
    setShiftFormMessage({ type: '', text: '' });
    
    if (isHandoverInitiated) {
      toast.error("Stock handover has been initiated. Cannot submit consumption log.");
      return;
    }
    
    if (!shiftOffice) {
      setShiftFormMessage({ type: 'error', text: 'Please select an office/facility.' });
      return;
    }
    
    const itemsToSubmit = getSelectedItemsPayload();
    if (itemsToSubmit.length === 0) {
      setShiftFormMessage({ type: 'error', text: 'Please enter a quantity greater than 0 for at least one item (consumption, received, or sent back).' });
      return;
    }
      
    const hasExceeded = Object.entries(selectedShiftItems).some(([id, val]) => {
      const drug = shiftDrugs.find(d => d.id === parseInt(id));
      if (!drug) return false;
      const itemState = val || { consumed: '', received: '', sent_back: '' };
      
      const stock = Math.round(drug.quantity || 0);
      const consumedVal = Math.round(parseFloat(itemState.consumed) || 0);
      const receivedVal = Math.round(parseFloat(itemState.received) || 0);
      const sentBackVal = Math.round(parseFloat(itemState.sent_back) || 0);
      
      const transitItem = transitInventory.find(t => t.drug_id === drug.id && t.quantity > 0);
      const transitQty = transitItem ? Math.round(transitItem.quantity) : 0;
      
      let isDrawnThisShift = false;
      if (transitItem && transitItem.created_at) {
        const createdDate = new Date(transitItem.created_at);
        const diffMs = new Date() - createdDate;
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours < 16) {
          isDrawnThisShift = true;
        }
      }
      
      const officeOB = Math.max(0, stock - receivedVal + sentBackVal + (isDrawnThisShift ? transitQty : 0));
      const officeReceived = receivedVal;
      const officeSentBack = sentBackVal;
      const officeConsumed = isDrawnThisShift ? transitQty : 0;
      const officeClosing = Math.max(0, officeOB + officeReceived - officeSentBack - officeConsumed);
      
      const bagOB = isDrawnThisShift ? 0 : transitQty;
      const bagReceived = isDrawnThisShift ? transitQty : 0;
      const bagSentBack = 0;
      const bagConsumed = consumedVal;
      const bagClosing = Math.max(0, bagOB + bagReceived - bagSentBack - bagConsumed);
      
      const availableLimit = bagOB + bagReceived;
      
      return consumedVal > availableLimit;
    });

    if (hasExceeded) {
      toast.error("One or more items have consumed quantities exceeding their available stock.");
      setShiftFormMessage({ type: 'error', text: 'Consumption cannot exceed available stock (OB + Received - Sent Back).' });
      return;
    }
    
    setPreviewPage(1);
    setPreviewSearch('');
    setShowShiftSubmitPreview(true);
  };

// ====================================
// FUNCTION: handleFieldChange (Lines 5951-5965)
// ====================================
                                const handleFieldChange = (field, val) => {
                                  setSelectedShiftItems(prev => {
                                    const curr = prev[d.id] || { consumed: '', received: '', sent_back: '' };
                                    const updated = { ...curr, [field]: val };
                                    
                                    const isEmpty = !updated.consumed && !updated.received && !updated.sent_back;
                                    const copy = { ...prev };
                                    if (isEmpty) {
                                      delete copy[d.id];
                                    } else {
                                      copy[d.id] = updated;
                                    }
                                    return copy;
                                  });
                                };


  // Render Component
  return (
    <>
      <div className="tab-pane" style={{ animation: 'fadeIn 0.25s ease-out', width: '100%', padding: '24px' }}>
        {shiftStatus === 'view_only' && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fee2e2',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 1px 3px rgba(220, 38, 38, 0.05)'
          }}>
            <span style={{ fontSize: '24px' }}>🔒</span>
            <div>
              <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: '750', color: '#991b1b' }}>
                Shift Completed & Handed Over (View-Only Mode)
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#b91c1c' }}>
                You have handed over today's stock to the incoming operator. All transactions (Draw Stock, Handover Bag, Record Consumption) are restricted.
              </p>
            </div>
          </div>
        )}
        {(() => {
          if (dashboardSubView === 'DRAW_STOCK') {
            return (
              <div className="tab-pane" style={{ animation: 'fadeIn 0.25s ease-out', width: '100%' }}>
                {/* Page header */}
                <div className="section-header-flex" style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  borderBottom: '1px solid #f1f5f9', 
                  paddingBottom: '12px', 
                  marginBottom: '16px' 
                }}>
                  <div className="section-header-left">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                      <Truck size={24} style={{ color: '#f7931e' }} /> Draw Stock from Facility Box
                    </h2>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setDashboardSubView('MAIN');
                        setDrawQuantities({});
                        setDrawScannedBatches({});
                        setFefoViolationDetails(null);
                        setOverrideReason('');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#ea580c',
                        border: '1px solid #ea580c',
                        borderRadius: '8px',
                        padding: '8.5px 16px',
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 2px 4px 0 rgba(234, 88, 12, 0.2)'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#c2410c'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ea580c'; }}
                    >
                      <ArrowLeft size={16} /> Back to Logs
                    </button>
                  </div>
                </div>

              {/* Draw Stock View Workspace */}
              {fefoViolationDetails ? (
                /* FEFO priority override alert layout */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px', backgroundColor: 'rgba(227, 72, 37, 0.05)', border: '1px solid #e34825', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', color: '#e34825' }}>
                    <AlertTriangle size={20} />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '750' }}>FEFO Priority Warning (Strict compliance)</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px', lineHeight: '1.4' }}>
                        {fefoViolationDetails.message}
                      </p>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '750', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                      Provide supervisor-audited Override Reason: *
                    </label>
                    <textarea
                      rows="3"
                      value={overrideReason}
                      placeholder="e.g. Batch expires first but is physically damaged/soiled in storehouse box."
                      onChange={e => setOverrideReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12.5px',
                        fontStyle: 'normal'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="filter-btn"
                      onClick={() => {
                        setFefoViolationDetails(null);
                        setOverrideReason('');
                      }}
                      style={{ fontSize: '12px', padding: '8px 16px' }}
                    >
                      Cancel & Pick Correct Batch
                    </button>
                    <button
                      type="button"
                      className="action-btn-primary"
                      disabled={!overrideReason.trim()}
                      style={{ backgroundColor: '#e34825', borderColor: '#e34825', fontSize: '12.5px', padding: '8px 18px' }}
                      onClick={() => {
                        const itemsPayload = Object.keys(drawQuantities).map(id => {
                          const drugId = parseInt(id);
                          const isBypassed = !!drawManualBypass[drugId];
                          const combinedBypass = isBypassed 
                            ? `Manual Batch: ${drawScannedBatches[drugId] || ''} | Remarks: ${drawManualRemarks[drugId] || ''}`
                            : null;
                          return {
                            drug_id: drugId,
                            quantity: parseFloat(drawQuantities[id]),
                            scanned_batch_number: isBypassed ? 'MANUAL_BYPASS' : (drawScannedBatches[drugId] || null),
                            override_reason: isBypassed 
                              ? (overrideReason ? `${combinedBypass} | FEFO: ${overrideReason}` : combinedBypass) 
                              : overrideReason
                          };
                        }).filter(item => item.quantity > 0);
                        handleDrawTransitStock(itemsPayload);
                      }}
                    >
                      Proceed with Override
                    </button>
                  </div>
                </div>
              ) : (
                /* Main Table Entry grid */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Search Bar for Draw Stock */}
                  <div style={{
                    marginBottom: '12px',
                    width: '100%'
                  }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        type="text"
                        placeholder="Search medicines by name, code or batch..."
                        value={drawSearchQuery}
                        onChange={(e) => {
                          setDrawSearchQuery(e.target.value);
                          setDrawPage(1);
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px 12px 42px',
                          borderRadius: '12px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02), 0 1px 2px rgba(0, 0, 0, 0.03)',
                          transition: 'all 0.2s ease',
                          outline: 'none'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#f7931e';
                          e.target.style.boxShadow = '0 0 0 3px rgba(247, 147, 30, 0.15)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#cbd5e1';
                          e.target.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.02), 0 1px 2px rgba(0, 0, 0, 0.03)';
                        }}
                      />
                      <Search size={18} style={{ 
                        position: 'absolute', 
                        left: '14px', 
                        top: '50%', 
                        transform: 'translateY(-50%)', 
                        color: '#94a3b8' 
                      }} />
                    </div>
                  </div>

                  {(() => {
                    const activeOfficeInventory = officeInventory.filter(item => item.quantity > 0);
                    const filteredDrawInventory = activeOfficeInventory.filter(item => {
                      const term = drawSearchQuery.toLowerCase();
                      return (
                        !drawSearchQuery ||
                        (item.item_name || '').toLowerCase().includes(term) ||
                        (item.item_code || '').toLowerCase().includes(term) ||
                        (item.batch_number || '').toLowerCase().includes(term)
                      );
                    });

                    const drawGroups = [];
                    const drawGroupsMap = {};
                    filteredDrawInventory.forEach(item => {
                      const key = item.item_code || item.item_name;
                      if (!drawGroupsMap[key]) {
                        drawGroupsMap[key] = {
                          item_name: item.item_name,
                          item_code: item.item_code,
                          batches: []
                        };
                        drawGroups.push(drawGroupsMap[key]);
                      }
                      drawGroupsMap[key].batches.push(item);
                    });

                    // Sort batches under each draw group by expiry date ascending
                    drawGroups.forEach(group => {
                      group.batches.sort((a, b) => {
                        if (!a.expiry_date) return 1;
                        if (!b.expiry_date) return -1;
                        return new Date(a.expiry_date) - new Date(b.expiry_date);
                      });
                    });

                    const totalDrawItems = drawGroups.length;
                    const totalDrawPages = Math.ceil(totalDrawItems / drawPageSize);
                    const displayDrawPage = drawPage > totalDrawPages && totalDrawPages > 0 ? 1 : drawPage;
                    const paginatedDrawGroups = drawGroups.slice(
                      (displayDrawPage - 1) * drawPageSize,
                      displayDrawPage * drawPageSize
                    );

                    if (loadingOfficeInventory) {
                      return (
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', backgroundColor: '#ffffff' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '750', color: '#475569' }}>Item / Batch</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '750', color: '#475569', width: '15%' }}>Store Qty</th>
                                <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '750', color: '#475569', width: '55%' }}>Scan Batch Code</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '750', color: '#475569', width: '15%' }}>Drawn Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[1, 2, 3].map(idx => (
                                <React.Fragment key={idx}>
                                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                                    <td style={{ padding: '12px 10px' }}><div className="skeleton" style={{ width: '150px', height: '18px', borderRadius: '4px' }}></div></td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right' }}><div className="skeleton" style={{ width: '40px', height: '18px', borderRadius: '4px', marginLeft: 'auto' }}></div></td>
                                    <td style={{ padding: '12px 10px' }} className="text-muted">——</td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right' }} className="text-muted">——</td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid #cbd5e1', backgroundColor: '#ffffff' }}>
                                    <td style={{ padding: '12px 10px', paddingLeft: '24px' }}><div className="skeleton" style={{ width: '180px', height: '14px', borderRadius: '4px' }}></div></td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right' }}><div className="skeleton" style={{ width: '30px', height: '14px', borderRadius: '4px', marginLeft: 'auto' }}></div></td>
                                    <td style={{ padding: '12px 10px' }}><div className="skeleton" style={{ width: '200px', height: '24px', borderRadius: '6px' }}></div></td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right' }}><div className="skeleton" style={{ width: '50px', height: '28px', borderRadius: '6px', marginLeft: 'auto' }}></div></td>
                                  </tr>
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div style={{ border: '1px solid rgba(28, 25, 23, 0.08)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-premium)', backgroundColor: '#ffffff' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid rgba(28, 25, 23, 0.08)' }}>
                                <th style={{ padding: '16px 20px', textAlign: 'left', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Item / Batch</th>
                                <th style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', width: '15%' }}>Store Qty</th>
                                <th style={{ padding: '16px 20px', textAlign: 'left', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', width: '55%' }}>Scan Batch Code</th>
                                <th style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', width: '15%' }}>Drawn Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedDrawGroups.length === 0 ? (
                                <tr>
                                  <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                                    No matching items found.
                                  </td>
                                </tr>
                              ) : (
                                paginatedDrawGroups.map(group => {
                                  const groupTotalQty = group.batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
                                  
                                  // Sort to find earliest expiring batch in this item code group
                                  const sortedCodeItems = [...group.batches].sort((a, b) => {
                                    if (!a.expiry_date) return 1;
                                    if (!b.expiry_date) return -1;
                                    return new Date(a.expiry_date) - new Date(b.expiry_date);
                                  });
                                  const earliestBatch = sortedCodeItems[0];

                                  return (
                                    <React.Fragment key={group.item_code || group.item_name}>
                                      {/* Parent Row */}
                                      <tr 
                                        style={{ 
                                          backgroundColor: '#ffffff', 
                                          borderBottom: '1px solid rgba(28, 25, 23, 0.08)',
                                          cursor: 'pointer',
                                          transition: 'var(--transition-smooth)'
                                        }}
                                        onClick={() => {
                                          const key = group.item_code || group.item_name;
                                          setExpandedDrawItems(prev => ({
                                            ...prev,
                                            [key]: !prev[key]
                                          }));
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = 'rgba(247, 147, 30, 0.03)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = '#ffffff';
                                        }}
                                      >
                                        <td style={{ padding: '16px 20px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            {expandedDrawItems[group.item_code || group.item_name] ? (
                                              <ChevronDown size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                            ) : (
                                              <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                            )}
                                            <div style={{ fontFamily: 'Outfit', fontWeight: '600', color: 'var(--text-primary)', fontSize: '14.5px' }}>{group.item_name}</div>
                                            <span style={{ 
                                              fontSize: '11px', 
                                              fontWeight: '600', 
                                              display: 'inline-flex', 
                                              alignItems: 'center', 
                                              gap: '3.5px', 
                                              backgroundColor: 'rgba(216, 17, 89, 0.06)', 
                                              color: '#d81159',
                                              padding: '3px 8px', 
                                              borderRadius: '12px',
                                              border: '1px solid rgba(216, 17, 89, 0.1)'
                                            }}>
                                              <Layers size={10} style={{ color: '#d81159' }} /> {group.batches.length} {group.batches.length === 1 ? 'Batch' : 'Batches'}
                                            </span>
                                          </div>
                                          <div style={{ fontSize: '11.5px', fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '23px' }}>Code: {group.item_code}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'Outfit', fontWeight: '750', fontSize: '15px', color: 'var(--text-primary)' }}>
                                          {groupTotalQty}
                                        </td>
                                        <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontStyle: 'italic' }}>—</td>
                                        <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'right' }}>—</td>
                                      </tr>

                                      {/* Child Rows for Batches */}
                                      {expandedDrawItems[group.item_code || group.item_name] && group.batches.map(item => {
                                        const isBatchTracked = !!(item.batch_number && item.batch_number !== "N/A");
                                         const isBypassed = !!drawManualBypass[item.drug_id];
                                         const isBypassUnlocked = isBypassed && 
                                           (drawScannedBatches[item.drug_id] || '').trim().length >= 1 && 
                                           (drawManualRemarks[item.drug_id] || '').trim().length >= 3;
                                         const isScannedCorrect = isBatchTracked
                                           ? (drawScannedBatches[item.drug_id] || '').trim().toLowerCase() === (item.batch_number || '').trim().toLowerCase()
                                           : true;
                                         const isFefoPriority = earliestBatch ? earliestBatch.drug_id === item.drug_id : true;
                                         const isUnlocked = isFefoPriority && (isBypassed ? isBypassUnlocked : isScannedCorrect);

                                        return (
                                          <tr key={item.id} style={{ borderBottom: '1px solid #cbd5e1', backgroundColor: '#ffffff' }}>
                                            <td style={{ padding: '12px 10px', paddingLeft: '24px' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <div style={{ fontWeight: '500', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>↳ Batch Specification</div>
                                                {isFefoPriority && group.batches.length > 1 && (
                                                  <span style={{
                                                    fontSize: '9px',
                                                    fontWeight: '800',
                                                    backgroundColor: '#e6f4ea',
                                                    color: '#137333',
                                                    border: '1px solid #137333',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                  }}>
                                                    ⚡ Current FEFO
                                                  </span>
                                                )}
                                                {!isFefoPriority && earliestBatch && (
                                                  <span style={{
                                                    fontSize: '9px',
                                                    fontWeight: '700',
                                                    backgroundColor: '#fef3c7',
                                                    color: '#d97706',
                                                    border: '1px solid #f59e0b',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center'
                                                  }}>
                                                    ⚠️ Later Expiry (Draw {earliestBatch.batch_number} first)
                                                  </span>
                                                )}
                                              </div>
                                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                Batch: <strong>{item.batch_number || 'N/A'}</strong> | Exp: {item.expiry_date || 'N/A'}
                                              </div>
                                            </td>
                                            <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '605', color: '#475569' }}>
                                              {item.quantity}
                                            </td>
                                            <td style={{ padding: '12px 10px' }}>
                                              {!isFefoPriority && earliestBatch ? (
                                                <div style={{ padding: '6px 10px', fontSize: '12px', color: '#b45309', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                  🔒 Locked — Draw "{earliestBatch.batch_number}" first
                                                </div>
                                              ) : isBatchTracked ? (
                                                <div style={{ 
                                                  display: 'flex', 
                                                  flexDirection: 'column', 
                                                  gap: '10px',
                                                  padding: '12px',
                                                  borderRadius: '10px',
                                                  backgroundColor: isBypassed ? '#fffcfb' : '#f8fafc',
                                                  border: isBypassed ? '1px solid #ffedd5' : '1px dashed #cbd5e1',
                                                  transition: 'all 0.2s ease',
                                                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)',
                                                  width: '100%'
                                                }}>
                                                  {/* Barcode Available Checkbox/Toggle */}
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <input
                                                      type="checkbox"
                                                      id={`barcode-avail-${item.drug_id}`}
                                                      checked={!isBypassed}
                                                      onChange={e => {
                                                        const checked = e.target.checked;
                                                        if (checked) {
                                                          setDrawManualBypass(prev => ({ ...prev, [item.drug_id]: false }));
                                                          setDrawManualRemarks(prev => ({ ...prev, [item.drug_id]: '' }));
                                                          setDrawScannedBatches(prev => ({ ...prev, [item.drug_id]: '' }));
                                                        } else {
                                                          setDrawManualBypass(prev => ({ ...prev, [item.drug_id]: true }));
                                                          setDrawScannedBatches(prev => ({ ...prev, [item.drug_id]: '' }));
                                                        }
                                                      }}
                                                      style={{
                                                        width: '16px',
                                                        height: '16px',
                                                        cursor: 'pointer',
                                                        accentColor: '#f7931e',
                                                        borderRadius: '4px'
                                                      }}
                                                    />
                                                    <label
                                                      htmlFor={`barcode-avail-${item.drug_id}`}
                                                      style={{
                                                        fontSize: '12.5px',
                                                        fontWeight: '600',
                                                        color: '#475569',
                                                        cursor: 'pointer',
                                                        userSelect: 'none',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                      }}
                                                    >
                                                      <QrCode size={12} style={{ color: !isBypassed ? '#f7931e' : '#94a3b8' }} />
                                                      Barcode Available
                                                    </label>
                                                  </div>

                                                  {!isBypassed ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <input 
                                                          type="text"
                                                          placeholder="Scan barcode..."
                                                          value={drawScannedBatches[item.drug_id] || ''}
                                                          onChange={e => {
                                                            const text = e.target.value;
                                                            setDrawScannedBatches(prev => ({ ...prev, [item.drug_id]: text }));
                                                          }}
                                                          style={{
                                                            padding: '8px 10px',
                                                            fontSize: '12.5px',
                                                            width: '65%',
                                                            borderRadius: '8px',
                                                            border: '1px solid #cbd5e1',
                                                            backgroundColor: '#ffffff',
                                                            outline: 'none',
                                                            transition: 'all 0.15s ease'
                                                          }}
                                                          onFocus={e => e.target.style.borderColor = '#f7931e'}
                                                          onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                                                        />
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            setActiveCameraScanner('draw');
                                                            setScannerDrugId(item.drug_id);
                                                          }}
                                                          style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '6px',
                                                            padding: '8px 12px',
                                                            fontSize: '12px',
                                                            backgroundColor: '#f7931e',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            borderRadius: '8px',
                                                            cursor: 'pointer',
                                                            fontWeight: '700',
                                                            boxShadow: '0 2px 4px rgba(247, 147, 30, 0.25)',
                                                            transition: 'all 0.15s ease'
                                                          }}
                                                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e08216'}
                                                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f7931e'}
                                                        >
                                                          <QrCode size={13} /> Scan
                                                        </button>
                                                      </div>
                                                      <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                                                        {drawScannedBatches[item.drug_id] ? (
                                                          isScannedCorrect ? (
                                                            <span style={{ color: '#16a34a', fontSize: '11.5px', fontWeight: '750', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                              <CheckCircle size={12} /> Batch Matched (Unlocked)
                                                            </span>
                                                          ) : (
                                                            <span style={{ color: '#e34825', fontSize: '11.5px', fontWeight: '750', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                              <AlertTriangle size={12} /> Mismatch. Scan expected: {item.batch_number}
                                                            </span>
                                                          )
                                                        ) : (
                                                          <span style={{ color: '#64748b', fontSize: '11px', fontStyle: 'italic' }}>
                                                            Please scan or type the batch number to unlock drawn quantity.
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                      <span style={{ 
                                                        color: '#ea580c', 
                                                        fontSize: '11.5px', 
                                                        fontWeight: '750', 
                                                        display: 'inline-flex', 
                                                        alignItems: 'center', 
                                                        gap: '4px',
                                                        backgroundColor: '#fff7ed',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #ffedd5',
                                                        alignSelf: 'flex-start'
                                                      }}>
                                                        <AlertTriangle size={12} /> Manual Entry Mode
                                                      </span>
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <input
                                                          type="text"
                                                          placeholder="Type batch number manually..."
                                                          value={drawScannedBatches[item.drug_id] || ''}
                                                          onChange={e => {
                                                            const val = e.target.value;
                                                            setDrawScannedBatches(prev => ({ ...prev, [item.drug_id]: val }));
                                                          }}
                                                          style={{
                                                            padding: '8px 10px',
                                                            fontSize: '12.5px',
                                                            borderRadius: '8px',
                                                            border: '1px solid #cbd5e1',
                                                            width: '100%',
                                                            backgroundColor: '#ffffff',
                                                            outline: 'none',
                                                            transition: 'all 0.15s ease'
                                                          }}
                                                          onFocus={e => e.target.style.borderColor = '#ea580c'}
                                                          onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                                                        />
                                                        <input
                                                          type="text"
                                                          placeholder="Write manual bypass remarks (min 3 characters)..."
                                                          value={drawManualRemarks[item.drug_id] || ''}
                                                          onChange={e => {
                                                            const val = e.target.value;
                                                            setDrawManualRemarks(prev => ({ ...prev, [item.drug_id]: val }));
                                                          }}
                                                          style={{
                                                            padding: '8px 10px',
                                                            fontSize: '12.5px',
                                                            borderRadius: '8px',
                                                            border: '1px solid #cbd5e1',
                                                            width: '100%',
                                                            backgroundColor: '#ffffff',
                                                            outline: 'none',
                                                            transition: 'all 0.15s ease'
                                                          }}
                                                          onFocus={e => e.target.style.borderColor = '#ea580c'}
                                                          onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                                                        />
                                                      </div>
                                                      <div style={{ marginTop: '2px' }}>
                                                        {isBypassUnlocked ? (
                                                          <span style={{ color: '#16a34a', fontSize: '11.5px', fontWeight: '750', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <CheckCircle size={12} /> Data Entered (Unlocked)
                                                          </span>
                                                        ) : (
                                                          <span style={{ color: '#ea580c', fontSize: '11px', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            ⚠️ Batch number & justification remarks required.
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '11.5px' }}>No batch tracking required</span>
                                              )}
                                            </td>
                                            <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                              <input 
                                                type="number"
                                                min="0"
                                                max={item.quantity}
                                                placeholder="0"
                                                disabled={!isUnlocked}
                                                value={drawQuantities[item.drug_id] || ''}
                                                onChange={e => {
                                                  const val = e.target.value;
                                                  setDrawQuantities(prev => ({ ...prev, [item.drug_id]: val }));
                                                }}
                                                style={{
                                                  padding: '6px 8px',
                                                  fontSize: '13px',
                                                  width: '60px',
                                                  textAlign: 'right',
                                                  borderRadius: '6px',
                                                  border: '1px solid #cbd5e1',
                                                  backgroundColor: isUnlocked ? '#ffffff' : '#f1f5f9',
                                                  cursor: isUnlocked ? 'text' : 'not-allowed'
                                                }}
                                              />
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </React.Fragment>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination Row for Draw Stock */}
                        {totalDrawItems > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 4px', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ fontSize: '13px', color: '#64748b' }}>
                              Showing {((displayDrawPage - 1) * drawPageSize) + 1} to {Math.min(displayDrawPage * drawPageSize, totalDrawItems)} of {totalDrawItems} records
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>Rows per page:</span>
                                <CustomSelect
                                  value={drawPageSize}
                                  onChange={(e) => {
                                    setDrawPageSize(Number(e.target.value));
                                    setDrawPage(1);
                                  }}
                                  options={[
                                    { value: 5, label: '5' },
                                    { value: 10, label: '10' },
                                    { value: 20, label: '20' }
                                  ]}
                                  compact={true}
                                  placement="top"
                                  style={{ width: '80px' }}
                                />
                              </div>
                              {totalDrawPages > 1 && (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="filter-btn"
                                    disabled={displayDrawPage === 1}
                                    aria-label="Previous Page"
                                    onClick={() => setDrawPage(prev => Math.max(prev - 1, 1))}
                                    style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <ChevronLeft size={16} />
                                  </button>
                                  {(() => {
                                    const pages = [];
                                    if (totalDrawPages <= 7) {
                                      for (let i = 1; i <= totalDrawPages; i++) pages.push(i);
                                    } else {
                                      pages.push(1);
                                      if (displayDrawPage > 3) pages.push('...');
                                      const start = Math.max(2, displayDrawPage - 1);
                                      const end = Math.min(totalDrawPages - 1, displayDrawPage + 1);
                                      for (let i = start; i <= end; i++) pages.push(i);
                                      if (displayDrawPage < totalDrawPages - 2) pages.push('...');
                                      pages.push(totalDrawPages);
                                    }
                                    return pages.map((p, idx) => {
                                      if (p === '...') {
                                        return <span key={`ellipsis-draw-${idx}`} style={{ color: '#94a3b8', padding: '0 8px', fontSize: '13px', alignSelf: 'center' }}>...</span>;
                                      }
                                      return (
                                        <button
                                          key={p}
                                          type="button"
                                          className={`filter-btn ${displayDrawPage === p ? 'active' : ''}`}
                                          onClick={() => setDrawPage(p)}
                                          style={{
                                            padding: '6px 12px',
                                            backgroundColor: displayDrawPage === p ? '#d81159' : '#ffffff',
                                            color: displayDrawPage === p ? '#ffffff' : '#1e293b',
                                            border: '1px solid #e2e8f0',
                                            fontWeight: '600'
                                          }}
                                        >
                                          {p}
                                        </button>
                                      );
                                    });
                                  })()}
                                  <button
                                    type="button"
                                    className="filter-btn"
                                    disabled={displayDrawPage === totalDrawPages}
                                    aria-label="Next Page"
                                    onClick={() => setDrawPage(prev => Math.min(prev + 1, totalDrawPages))}
                                    style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <ChevronRight size={16} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                    <button
                      type="button"
                      className="filter-btn"
                      onClick={() => {
                        setDashboardSubView('MAIN');
                        setDrawQuantities({});
                        setDrawScannedBatches({});
                        setDrawSearchQuery('');
                        setDrawPage(1);
                        setDrawManualBypass({});
                        setDrawManualRemarks({});
                      }}
                      style={{ fontSize: '13px', padding: '10px 20px' }}
                    >
                      Cancel & Exit
                    </button>
                    <button
                      type="button"
                      className="action-btn-primary"
                      style={{ fontSize: '13px', padding: '10px 24px', backgroundColor: '#f7931e', borderColor: '#f7931e' }}
                      onClick={() => {
                        const itemsPayload = Object.keys(drawQuantities).map(id => {
                          const drugId = parseInt(id);
                          const item = officeInventory.find(inv => inv.drug_id === drugId);
                          const isBatchTracked = item ? !!(item.batch_number && item.batch_number !== "N/A") : false;
                          
                           const isBypassed = !!drawManualBypass[drugId];
                           const isBypassUnlocked = isBypassed && 
                             (drawScannedBatches[drugId] || '').trim().length >= 1 && 
                             (drawManualRemarks[drugId] || '').trim().length >= 3;
                           const isScannedCorrect = isBatchTracked && item
                             ? (drawScannedBatches[drugId] || '').trim().toLowerCase() === (item.batch_number || '').trim().toLowerCase()
                             : true;
                           const isUnlocked = isBypassed ? isBypassUnlocked : isScannedCorrect;
 
                           const combinedBypass = isBypassed 
                             ? `Manual Batch: ${drawScannedBatches[drugId] || ''} | Remarks: ${drawManualRemarks[drugId] || ''}`
                             : null;
 
                           return {
                             drug_id: drugId,
                             quantity: parseFloat(drawQuantities[drugId]),
                             scanned_batch_number: isBypassed ? 'MANUAL_BYPASS' : (drawScannedBatches[drugId] || null),
                             override_reason: isBypassed ? combinedBypass : null,
                             is_valid: isUnlocked && parseFloat(drawQuantities[drugId]) > 0
                           };
                        }).filter(item => item.is_valid);

                        if (itemsPayload.length === 0) {
                          toast.error("Please scan correct batch code or fill in bypass remarks and specify quantity for at least one item.");
                          return;
                        }
                        handleDrawTransitStock(itemsPayload);
                      }}
                    >
                      Confirm Drawing Stock
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          } else if (dashboardSubView === 'HISTORY_LOGS') {
            return (
              <div className="tab-pane" style={{ animation: 'fadeIn 0.25s ease-out', width: '100%' }}>
                {/* Back Button Container */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <button
                    type="button"
                    onClick={() => setDashboardSubView('MAIN')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
                    }}
                  >
                    <ArrowLeft size={16} /> Back to Consumption Log
                  </button>
                </div>

                {/* Page Header */}
                <div className="section-header-flex" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
                  <div className="section-header-left">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                      <ClipboardCheck size={24} style={{ color: '#ea580c' }} /> Accountable Action & Log Histories
                    </h2>
                    <p style={{ margin: '4px 0 0 0' }}>Track asked (indents), taken (drawings), and submitted shift logs with precise timestamps.</p>
                  </div>
                </div>

                {/* Sub-tabs layout */}
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  borderBottom: '1px solid #e2e8f0',
                  marginBottom: '24px'
                }}>
                  <button
                    type="button"
                    onClick={() => setHistoryActiveTab('SHIFTS')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: historyActiveTab === 'SHIFTS' ? '2.5px solid #ea580c' : '2.5px solid transparent',
                      color: historyActiveTab === 'SHIFTS' ? '#ea580c' : '#64748b',
                      fontWeight: '700',
                      fontSize: '13.5px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      outline: 'none'
                    }}
                  >
                    <ClipboardCheck size={16} /> Submitted Shift Logs
                  </button>
                  {(user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin') && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryActiveTab('DRAWINGS');
                          fetchAuditHistory();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 20px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderBottom: historyActiveTab === 'DRAWINGS' ? '2.5px solid #ea580c' : '2.5px solid transparent',
                          color: historyActiveTab === 'DRAWINGS' ? '#ea580c' : '#64748b',
                          fontWeight: '700',
                          fontSize: '13.5px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                      >
                        <Truck size={16} /> Taken Stock (Drawings)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryActiveTab('INDENTS');
                          fetchIndentsHistory();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 20px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderBottom: historyActiveTab === 'INDENTS' ? '2.5px solid #ea580c' : '2.5px solid transparent',
                          color: historyActiveTab === 'INDENTS' ? '#ea580c' : '#64748b',
                          fontWeight: '700',
                          fontSize: '13.5px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                      >
                        <FileText size={16} /> Asked Stock (Indents Raised)
                      </button>
                    </>
                  )}
                </div>

                {/* Tab Contents: SHIFTS */}
                {historyActiveTab === 'SHIFTS' && (
                  <div className="table-card" style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '750', color: 'var(--text-primary)' }}>Shift Log Submissions</h3>
                      <button 
                        type="button" 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          padding: '6px 12px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          color: '#475569',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }} 
                        onClick={fetchShiftSubmissionsHistory}
                      >
                        Refresh Logs
                      </button>
                    </div>
                    {loadingShiftSubmissions ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
                    ) : shiftSubmissionsData.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No submissions recorded.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="portal-table" style={{ width: '100%' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '160px' }}>Timestamp</th>
                              <th style={{ width: '90px' }}>Shift</th>
                              <th style={{ width: '120px' }}>Operator</th>
                              <th>Material Details</th>
                              <th style={{ textAlign: 'right', width: '85px' }}>OB (Bag)</th>
                              <th style={{ textAlign: 'right', width: '95px' }}>Received (Bag)</th>
                              <th style={{ textAlign: 'right', width: '95px' }}>Consumed (Used)</th>
                              <th style={{ textAlign: 'right', width: '100px' }}>Closing (Bag)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shiftSubmissionsData.map(log => (
                              <tr key={log.id}>
                                <td style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap', fontWeight: '500' }}>
                                  {log.date}
                                </td>
                                <td>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    backgroundColor: log.shift_type === 'shift_1' ? '#eff6ff' : '#faf5ff',
                                    color: log.shift_type === 'shift_1' ? '#1d4ed8' : '#7e22ce'
                                  }}>
                                    {log.shift_type === 'shift_1' ? 'Shift 1' : 'Shift 2'}
                                  </span>
                                </td>
                                <td style={{ fontSize: '12.5px', fontWeight: '500', color: '#334155' }}>
                                  {log.logged_by}
                                </td>
                                <td>
                                  <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '13px' }}>{log.item_name}</div>
                                  {log.item_code && log.item_code !== log.item_name && (
                                    <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>Code: {log.item_code}</div>
                                  )}
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                    Batch: <strong style={{ color: '#334155' }}>{log.batch_number || 'N/A'}</strong> | MFG: {log.manufacturing_date || 'N/A'} | Exp: {log.expiry_date || 'N/A'}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '600', color: '#475569' }}>{log.opening_balance}</td>
                                <td style={{ textAlign: 'right', fontWeight: '600', color: log.received_qty > 0 ? '#16a34a' : '#64748b' }}>
                                  {log.received_qty > 0 ? `+${log.received_qty}` : '0'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '800', color: '#ea580c' }}>
                                  {log.consumed_qty}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '750', color: 'var(--primary)' }}>
                                  {log.closing_balance}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Contents: DRAWINGS (Taken Stock) */}
                {historyActiveTab === 'DRAWINGS' && (
                  <div className="table-card" style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '750', color: 'var(--text-primary)' }}>Taken Stock History (Drawings)</h3>
                      <button 
                        type="button" 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          padding: '6px 12px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          color: '#475569',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }} 
                        onClick={fetchAuditHistory}
                      >
                        Refresh Drawings
                      </button>
                    </div>
                    {loadingAuditLogs ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
                    ) : auditLogsData.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No drawings or transfers recorded.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="portal-table" style={{ width: '100%' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '160px' }}>Timestamp</th>
                              <th style={{ width: '120px' }}>Operator</th>
                              <th style={{ width: '130px' }}>Action</th>
                              <th>Transaction Detail / Scan Status</th>
                              <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditLogsData.map(log => {
                              const isBypassed = log.action.includes('BYPASS') || log.description.toLowerCase().includes('bypass');
                              const isHandover = log.action.includes('HANDOVER');
                              const isDraw = log.action.includes('DRAW');
                              
                              let badgeBg = '#f1f5f9';
                              let badgeColor = '#475569';
                              if (isBypassed) {
                                badgeBg = '#fffbeb';
                                badgeColor = '#d97706';
                              } else if (isHandover) {
                                badgeBg = '#f0fdf4';
                                badgeColor = '#16a34a';
                              } else if (isDraw) {
                                badgeBg = '#eff6ff';
                                badgeColor = '#1d4ed8';
                              }
                              
                              return (
                                <tr key={log.id}>
                                  <td style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap', fontWeight: '500' }}>
                                    {log.timestamp}
                                  </td>
                                  <td style={{ fontSize: '12.5px', fontWeight: '600', color: '#334155' }}>
                                    {log.user}
                                  </td>
                                  <td>
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      backgroundColor: badgeBg,
                                      color: badgeColor
                                    }}>
                                      {log.action}
                                    </span>
                                  </td>
                                  <td style={{ fontSize: '12.5px', color: '#334155', fontWeight: '400', lineHeight: 1.4 }}>
                                    {log.description}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '2.5px 6.5px',
                                      borderRadius: '6px',
                                      fontSize: '10px',
                                      fontWeight: '700',
                                      backgroundColor: log.status === 'SUCCESS' ? '#ecfdf5' : '#fef2f2',
                                      color: log.status === 'SUCCESS' ? '#059669' : '#dc2626'
                                    }}>
                                      {log.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Contents: INDENTS (Asked Stock) */}
                {historyActiveTab === 'INDENTS' && (
                  <div className="table-card" style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '750', color: 'var(--text-primary)' }}>Asked Stock History (Indents Raised)</h3>
                      <button 
                        type="button" 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          padding: '6px 12px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          color: '#475569',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }} 
                        onClick={fetchIndentsHistory}
                      >
                        Refresh Indents
                      </button>
                    </div>
                    {loadingIndents ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
                    ) : indentsData.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No indents recorded.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="portal-table" style={{ width: '100%' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '160px' }}>Raised At</th>
                              <th style={{ width: '110px' }}>Requested By</th>
                              <th>Material Requested</th>
                              <th style={{ textAlign: 'right', width: '100px' }}>Requested Qty</th>
                              <th>Batch Details</th>
                              <th style={{ width: '120px', textAlign: 'center' }}>Workflow Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {indentsData.map(ind => {
                              let statusBg = '#f1f5f9';
                              let statusColor = '#475569';
                              if (ind.status === 'DISPATCHED') {
                                statusBg = '#eff6ff';
                                statusColor = '#1d4ed8';
                              } else if (ind.status === 'APPROVED' || ind.status === 'COMPLETED') {
                                statusBg = '#ecfdf5';
                                statusColor = '#059669';
                              } else if (ind.status === 'REJECTED') {
                                statusBg = '#fef2f2';
                                statusColor = '#dc2626';
                              } else if (ind.status === 'PENDING' || ind.status === 'REQUESTED') {
                                statusBg = '#fffbeb';
                                statusColor = '#d97706';
                              }

                              return (
                                <tr key={ind.id}>
                                  <td style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap', fontWeight: '500' }}>
                                    {ind.created_at ? new Date(ind.created_at).toLocaleString() : 'N/A'}
                                  </td>
                                  <td style={{ fontSize: '12.5px', fontWeight: '600', color: '#334155' }}>
                                    {ind.requested_by || 'N/A'}
                                  </td>
                                  <td>
                                    <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '13px' }}>{ind.drug_name || 'N/A'}</div>
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>
                                    {ind.quantity_requested}
                                  </td>
                                  <td style={{ fontSize: '12px', color: '#475569' }}>
                                    {ind.batch_number ? (
                                      <span>Batch: <strong style={{ fontFamily: 'monospace' }}>{ind.batch_number}</strong></span>
                                    ) : '-'}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '2.5px 6.5px',
                                      borderRadius: '6px',
                                      fontSize: '10.5px',
                                      fontWeight: '700',
                                      backgroundColor: statusBg,
                                      color: statusColor
                                    }}>
                                      {ind.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          } else {
            const groupShiftLogsBySubmission = (logs) => {
              const groups = {};
              logs.forEach(log => {
                const key = `${log.project}_${log.office_name}_${log.date}_${log.shift_type}_${log.logged_by}`;
                if (!groups[key]) {
                  groups[key] = {
                    key: key,
                    id: `CON-${(log.date || '').replace(/\D/g, '').substring(0, 14) || 'LOG'}`,
                    date: log.date,
                    shift_type: log.shift_type,
                    project: log.project,
                    office_name: log.office_name,
                    logged_by: log.logged_by,
                    vehicle_number: log.vehicle_number || 'N/A',
                    remarks: log.remarks || '',
                    items: []
                  };
                }
                groups[key].items.push(log);
                if (log.remarks) {
                  groups[key].remarks = log.remarks;
                }
              });
              return Object.values(groups).sort((a, b) => new Date(b.date) - new Date(a.date));
            };

            const fullGroupedLogs = React.useMemo(() => {
              const baseGroups = groupShiftLogsBySubmission(shiftSubmissionsData);
              if (!historyLogsSearch.trim()) return baseGroups;
              
              const term = historyLogsSearch.toLowerCase().trim();
              return baseGroups.filter(group => {
                const matchLogId = group.id.toLowerCase().includes(term);
                const matchOffice = group.office_name && group.office_name.toLowerCase().includes(term);
                const matchUser = group.logged_by && group.logged_by.toLowerCase().includes(term);
                const matchDate = group.date && group.date.toLowerCase().includes(term);
                const matchItems = group.items.some(it => 
                  (it.item_name && it.item_name.toLowerCase().includes(term)) ||
                  (it.item_code && it.item_code.toLowerCase().includes(term))
                );
                return matchLogId || matchOffice || matchUser || matchDate || matchItems;
              });
            }, [shiftSubmissionsData, historyLogsSearch]);

            const totalHistoryLogsRecords = fullGroupedLogs.length;
            const historyLogsTotalPages = Math.ceil(totalHistoryLogsRecords / historyLogsPageSize);

            const paginatedGroupedLogs = React.useMemo(() => {
              const startIdx = (historyLogsPage - 1) * historyLogsPageSize;
              const endIdx = startIdx + historyLogsPageSize;
              return fullGroupedLogs.slice(startIdx, endIdx);
            }, [fullGroupedLogs, historyLogsPage, historyLogsPageSize]);

            if (consumptionSubView === 'HISTORY') {
              return (
                <div className="tab-pane" style={{ animation: 'fadeIn 0.2s ease-out', width: '100%' }}>
                  <div className="section-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '12px' }}>
                    <div className="section-header-left">
                      <h2>Shift Consumption Logs</h2>
                      <p>View, audit and manage daily shift consumption records submitted by operators.</p>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="action-btn-primary"
                        onClick={() => {
                          if (shiftStatus === 'view_only') {
                            toast.error("Your shift has been completed/handed over. Only view access is permitted.");
                            return;
                          }
                          if (isHandoverInitiated) {
                            toast.error("Stock handover has been initiated. Cannot record consumption.");
                            return;
                          }
                          navigate('/consumption/record');
                        }}
                        disabled={isHandoverInitiated}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 20px',
                          fontSize: '13px',
                          fontWeight: '700',
                          backgroundColor: isHandoverInitiated ? '#cbd5e1' : '#f7931e',
                          borderColor: isHandoverInitiated ? '#cbd5e1' : '#f7931e',
                          color: '#ffffff',
                          borderRadius: '8px',
                          cursor: isHandoverInitiated ? 'not-allowed' : 'pointer',
                          boxShadow: isHandoverInitiated ? 'none' : '0 4px 6px -1px rgba(247, 147, 30, 0.25)',
                          opacity: isHandoverInitiated ? 0.7 : 1
                        }}
                        title={shiftStatus === 'view_only' ? "Your shift has been completed/handed over. Only view access is permitted." : isHandoverInitiated ? "Stock handover has been initiated. Cannot record consumption." : ""}
                      >
                        <Plus size={16} /> Record Consumption
                      </button>
                    </div>
                  </div>

                  <div className="table-card" style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '16px' }}>
                    {/* Unified controls toolbar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                      <div className="search-input-wrapper" style={{ margin: 0, flex: 1, maxWidth: '380px' }}>
                        <Search size={18} className="search-icon" style={{ top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                          type="text"
                          placeholder="Search logs by ID, vehicle, office, staff or items..."
                          value={historyLogsSearch}
                          onChange={(e) => {
                            setHistoryLogsSearch(e.target.value);
                            setHistoryLogsPage(1);
                          }}
                          style={{
                            padding: '8px 12px 8px 36px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '13px',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>Rows per page:</span>
                          <CustomSelect
                            value={historyLogsPageSize}
                            onChange={(e) => {
                              setHistoryLogsPageSize(parseInt(e.target.value));
                              setHistoryLogsPage(1);
                            }}
                            options={[
                              { value: 5, label: '5' },
                              { value: 10, label: '10' },
                              { value: 20, label: '20' },
                              { value: 50, label: '50' }
                            ]}
                            compact={true}
                            placement="bottom"
                            style={{ width: '80px' }}
                          />
                        </div>

                        <button 
                          type="button" 
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            padding: '7px 14px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            color: '#475569',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }} 
                          onClick={fetchShiftSubmissionsHistory}
                          disabled={loadingShiftSubmissions}
                        >
                          <RefreshCw 
                            size={14} 
                            style={{ 
                              animation: loadingShiftSubmissions ? 'bavya-spin-animation 1s linear infinite' : 'none',
                              marginRight: '2px' 
                            }} 
                          />
                          Refresh Logs
                        </button>
                      </div>
                    </div>

                    {loadingShiftSubmissions ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
                    ) : fullGroupedLogs.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                        {historyLogsSearch ? "No matching consumption logs found." : "No consumption logs submitted yet."}
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="portal-table" style={{ width: '100%' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '180px' }}>Log ID</th>
                              <th style={{ width: '120px' }}>Vehicle / Room</th>
                              <th>Item / Material</th>
                              <th style={{ width: '100px', textAlign: 'right' }}>Qty Logged</th>
                              <th style={{ width: '130px' }}>Logged By</th>
                              <th style={{ width: '150px' }}>Date</th>
                              <th style={{ width: '130px' }}>Status</th>
                              <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedGroupedLogs.map(group => {
                              const firstItem = group.items[0];
                              const itemsCount = group.items.length;
                              const moreCount = itemsCount - 1;
                              const itemText = firstItem ? `${firstItem.item_name} (${firstItem.item_code})` : 'N/A';
                              const totalConsumedQty = group.items.reduce((sum, item) => sum + (parseFloat(item.consumed_qty) || 0), 0);

                              return (
                                <tr key={group.key} style={{ borderBottom: '1px solid rgba(28, 25, 23, 0.08)' }}>
                                  <td style={{ fontSize: '12.5px', color: 'var(--primary-dark)', fontWeight: '700' }}>
                                    {group.id}
                                  </td>
                                  <td style={{ fontStyle: 'italic', fontWeight: '500', color: '#475569' }}>
                                    {group.office_name}
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      <span style={{ fontWeight: '750', color: '#1e293b' }}>
                                        {itemText}
                                      </span>
                                      {moreCount > 0 && (
                                        <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                          (+{moreCount} more items)
                                        </span>
                                      )}
                                      <span style={{ fontSize: '10.5px', color: '#ea580c', fontWeight: '600', marginTop: '3px' }}>
                                        {itemsCount} item(s) in this log
                                      </span>
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: '850', color: '#0f172a' }}>
                                    {totalConsumedQty} Nos
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <div style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        backgroundColor: '#eff6ff',
                                        color: '#1d4ed8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        border: '1px solid #dbeafe'
                                      }}>
                                        {(group.logged_by || 'O').charAt(0).toUpperCase()}
                                      </div>
                                      <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#334155' }}>
                                        {group.logged_by}
                                      </span>
                                    </div>
                                  </td>
                                  <td style={{ fontSize: '11.5px', color: '#475569' }}>
                                    {group.date}
                                  </td>
                                  <td>
                                    <span style={{
                                      display: 'inline-flex',
                                      padding: '4px 10px',
                                      borderRadius: '12px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      backgroundColor: '#ecfdf5',
                                      color: '#047857',
                                      border: '1px solid #a7f3d0'
                                    }}>
                                      SUBMITTED
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedHistoryGroup(group);
                                        setConsumptionSubView('READONLY');
                                      }}
                                      style={{
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#475569',
                                        borderRadius: '6px',
                                        padding: '5px 10px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                    >
                                      View Details
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Pagination Controls */}
                    {historyLogsTotalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                          Showing <span style={{ fontWeight: '600', color: '#1e293b' }}>{totalHistoryLogsRecords === 0 ? 0 : (historyLogsPage - 1) * historyLogsPageSize + 1}</span> to{' '}
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>{Math.min(historyLogsPage * historyLogsPageSize, totalHistoryLogsRecords)}</span> of{' '}
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>{totalHistoryLogsRecords}</span> logs
                        </span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="filter-btn"
                            disabled={historyLogsPage === 1}
                            onClick={() => setHistoryLogsPage(prev => Math.max(prev - 1, 1))}
                            style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: historyLogsPage === 1 ? 'not-allowed' : 'pointer' }}
                          >
                            <ChevronLeft size={14} />
                            Previous
                          </button>

                          {getPaginationRange(historyLogsPage, historyLogsTotalPages).map((p, idx) => {
                            if (p === '...') {
                              return <span key={`hist-ellipsis-${idx}`} style={{ color: '#94a3b8', padding: '0 4px', fontSize: '12px' }}>...</span>;
                            }
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setHistoryLogsPage(p)}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  borderColor: historyLogsPage === p ? 'var(--primary)' : '#e2e8f0',
                                  backgroundColor: historyLogsPage === p ? 'var(--primary)' : '#ffffff',
                                  color: historyLogsPage === p ? '#ffffff' : '#475569',
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
                            disabled={historyLogsPage === historyLogsTotalPages}
                            onClick={() => setHistoryLogsPage(prev => Math.min(prev + 1, historyLogsTotalPages))}
                            style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: historyLogsPage === historyLogsTotalPages ? 'not-allowed' : 'pointer' }}
                          >
                            Next
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (consumptionSubView === 'READONLY' && selectedHistoryGroup) {
              // Extract Handover Sender & Recipient from auditLogsData
              const acceptedLog = auditLogsData.find(log => 
                log.user === selectedHistoryGroup.logged_by && 
                log.action === 'ACCEPT_HANDOVER' && 
                log.timestamp && 
                log.timestamp.substring(0, 10) === selectedHistoryGroup.date.substring(0, 10)
              );
              let receivedFromUser = 'N/A';
              if (acceptedLog) {
                const match = acceptedLog.description.match(/from '([^']+)'/);
                if (match) {
                  receivedFromUser = match[1];
                }
              }

              const proposedLog = auditLogsData.find(log => 
                log.user === selectedHistoryGroup.logged_by && 
                log.action === 'PROPOSE_HANDOVER' && 
                log.timestamp && 
                log.timestamp.substring(0, 10) === selectedHistoryGroup.date.substring(0, 10)
              );
              let handedOverToUser = 'N/A';
              if (proposedLog) {
                const match = proposedLog.description.match(/to '([^']+)'/);
                if (match) {
                  handedOverToUser = match[1];
                }
              }

              const historyItems = selectedHistoryGroup.items;

              const localItemCounts = {};
              historyItems.forEach(item => {
                const itemKey = `${item.item_name}_${item.item_code}`;
                localItemCounts[itemKey] = (localItemCounts[itemKey] || 0) + 1;
              });

              const localItemSpanTracker = {};

              return (
                <div className="tab-pane" style={{ animation: 'fadeIn 0.2s ease-out', width: '100%' }}>
                  <div className="table-card" style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            display: 'inline-flex',
                            padding: '4px 8px',
                            backgroundColor: '#eff6ff',
                            color: '#1d4ed8',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            LOG ID
                          </span>
                          <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: '800', color: '#0f172a' }}>
                            {selectedHistoryGroup.id}
                          </h3>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                          Submitted by <strong style={{ color: '#334155' }}>{selectedHistoryGroup.logged_by}</strong> on {selectedHistoryGroup.date}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setConsumptionSubView('HISTORY');
                          setSelectedHistoryGroup(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          backgroundColor: '#ea580c',
                          border: '1px solid #ea580c',
                          borderRadius: '8px',
                          padding: '8.5px 16px',
                          fontSize: '13px',
                          fontWeight: '700',
                          color: '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: '0 2px 4px 0 rgba(234, 88, 12, 0.2)'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#c2410c'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ea580c'; }}
                      >
                        <ArrowLeft size={16} /> Back to Logs
                      </button>
                    </div>

                    {/* Metadata summary cards row */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '16px',
                      marginBottom: '24px',
                      padding: '16px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Project</span>
                        <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0f172a', marginTop: '2px' }}>{selectedHistoryGroup.project}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Office / Facility Space</span>
                        <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0f172a', marginTop: '2px' }}>{selectedHistoryGroup.office_name}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Shift</span>
                        <div style={{ marginTop: '2px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11.5px',
                            fontWeight: '700',
                            backgroundColor: selectedHistoryGroup.shift_type === 'shift_1' ? '#eff6ff' : '#faf5ff',
                            color: selectedHistoryGroup.shift_type === 'shift_1' ? '#1d4ed8' : '#7e22ce'
                          }}>
                            {selectedHistoryGroup.shift_type === 'shift_1' ? 'Shift 1 (Morning)' : 'Shift 2 (Evening)'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Vehicle / Room</span>
                        <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0f172a', marginTop: '2px' }}>{selectedHistoryGroup.vehicle_number}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Received Bag From</span>
                        <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: receivedFromUser !== 'N/A' ? '#e0f2fe' : '#f1f5f9',
                            color: receivedFromUser !== 'N/A' ? '#0369a1' : '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: '700'
                          }}>
                            {receivedFromUser.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: receivedFromUser !== 'N/A' ? '#0369a1' : '#64748b' }}>
                            {receivedFromUser}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Handed Over Bag To</span>
                        <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: handedOverToUser !== 'N/A' ? '#f0fdf4' : '#f1f5f9',
                            color: handedOverToUser !== 'N/A' ? '#15803d' : '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: '700'
                          }}>
                            {handedOverToUser.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: handedOverToUser !== 'N/A' ? '#15803d' : '#64748b' }}>
                            {handedOverToUser}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Unified Shift Consumption Grid */}
                    <div style={{ 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '12px', 
                      overflowX: 'auto', 
                      backgroundColor: '#ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', minWidth: '950px' }}>
                        <thead>
                          {/* Top Header Group */}
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                            <th rowSpan={2} style={{ padding: '10px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '50px' }}>S.No.</th>
                            <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px' }}>Material / Code</th>
                            <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '90px' }}>Batch</th>
                            <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '140px' }}>MFG / EXP</th>
                            <th colSpan={5} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '850', color: '#c2410c', backgroundColor: '#fff7ed', borderRight: '1px solid #ffd8a8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              Store / Room Stock (Local Facility)
                            </th>
                            <th colSpan={5} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '850', color: '#0369a1', backgroundColor: '#f0f9ff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              Transit Bag (Operator Bag)
                            </th>
                          </tr>
                          {/* Sub-header columns */}
                          <tr style={{ backgroundColor: '#fdfdfd', borderBottom: '1px solid #cbd5e1' }}>
                            {/* Store columns */}
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>OB</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Received</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Sent Back</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Drawn</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#7c2d12', backgroundColor: '#fff7ed', borderRight: '1px solid #ffd8a8', fontSize: '10px' }}>Closing</th>
                            
                            {/* Bag columns */}
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>OB</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Received</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Sent Back</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Consumed</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#0c4a6e', backgroundColor: '#e0f2fe', fontSize: '10px' }}>Closing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyItems.map((item, idx) => {
                            const itemKey = `${item.item_name}_${item.item_code}`;
                            
                            let rowSpan = 0;
                            if (!localItemSpanTracker[itemKey]) {
                              rowSpan = localItemCounts[itemKey];
                              localItemSpanTracker[itemKey] = true;
                            }

                            // Reconstruct the exact quantities using our unified logic:
                            const officeOB = Math.round(item.opening_balance || 0);
                            const officeSentBack = Math.round(item.sent_back_qty || 0);
                            const officeConsumed = Math.round(item.consumed_qty || 0);

                            let officeReceived = 0;
                            let officeClosing = 0;
                            let bagOB = 0;
                            let bagReceived = 0;
                            let bagConsumed = 0;
                            let bagClosing = 0;

                            if (officeConsumed > 0 || officeSentBack > 0) {
                              // Active shift activity
                              officeReceived = Math.round(item.received_qty || 0);
                              officeClosing = Math.round(item.closing_balance || 0);
                              
                              bagOB = 0;
                              bagReceived = officeConsumed;
                              bagConsumed = officeConsumed;
                              bagClosing = 0;
                            } else {
                              // No shift activity (Stock Held)
                              officeReceived = 0;
                              officeClosing = officeOB;
                              
                              bagOB = Math.round(item.received_qty || 0);
                              bagReceived = 0;
                              bagConsumed = 0;
                              bagClosing = bagOB;
                            }

                            return (
                              <tr key={item.id} style={{ borderBottom: '1px solid #cbd5e1', backgroundColor: '#ffffff' }}>
                                {/* S.No. */}
                                {rowSpan > 0 && (
                                  <td 
                                    rowSpan={rowSpan} 
                                    style={{ 
                                      padding: '10px', 
                                      textAlign: 'center', 
                                      color: '#475569', 
                                      fontWeight: '700', 
                                      borderRight: '1px solid #cbd5e1', 
                                      backgroundColor: '#f8fafc',
                                      verticalAlign: 'middle'
                                    }}
                                  >
                                    {idx + 1}
                                  </td>
                                )}

                                {/* Material/Code */}
                                {rowSpan > 0 && (
                                  <td 
                                    rowSpan={rowSpan} 
                                    style={{ 
                                      padding: '10px 12px', 
                                      borderRight: '1px solid #cbd5e1', 
                                      verticalAlign: 'middle', 
                                      fontWeight: '600', 
                                      color: '#1e293b' 
                                    }}
                                  >
                                    <div>{item.item_name}</div>
                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'normal', marginTop: '2px' }}>
                                      Code: {item.item_code}
                                    </div>
                                  </td>
                                )}

                                {/* Batch */}
                                <td style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid #cbd5e1', fontWeight: '600', color: '#0369a1', backgroundColor: '#f8fafc' }}>
                                  <span style={{ padding: '2px 6px', backgroundColor: '#e0f2fe', borderRadius: '4px', fontSize: '10.5px' }}>
                                    {item.batch_number || 'N/A'}
                                  </span>
                                </td>

                                {/* dates */}
                                <td style={{ padding: '10px 12px', borderRight: '1px solid #cbd5e1', fontSize: '11px', color: '#64748b' }}>
                                  <div>MFG: <strong style={{ color: '#475569' }}>{item.manufacturing_date || '—'}</strong></div>
                                  <div style={{ marginTop: '2px' }}>EXP: <strong style={{ color: '#475569' }}>{item.expiry_date || '—'}</strong></div>
                                </td>

                                {/* Store columns data */}
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: '#451a03', fontWeight: '500' }}>{officeOB}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeReceived > 0 ? '#16a34a' : '#78716c', fontWeight: officeReceived > 0 ? '700' : '400' }}>
                                  {officeReceived > 0 ? `+${officeReceived}` : '0'}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeSentBack > 0 ? '#dc2626' : '#78716c', fontWeight: officeSentBack > 0 ? '700' : '400' }}>
                                  {officeSentBack > 0 ? `-${officeSentBack}` : '0'}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeConsumed > 0 ? '#ea580c' : '#78716c', fontWeight: officeConsumed > 0 ? '700' : '400' }}>
                                  {officeConsumed > 0 ? `-${officeConsumed}` : '0'}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffd8a8', color: '#9a3412', fontWeight: '700', backgroundColor: '#fff7ed' }}>
                                  {officeClosing}
                                </td>

                                {/* Bag columns data */}
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: '#0c4a6e', fontWeight: '500', backgroundColor: '#f0f9ff' }}>{bagOB}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: bagReceived > 0 ? '#16a34a' : '#64748b', fontWeight: bagReceived > 0 ? '700' : '400', backgroundColor: '#f0f9ff' }}>
                                  {bagReceived > 0 ? `+${bagReceived}` : '0'}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: '#78716c', fontWeight: '400', backgroundColor: '#f0f9ff' }}>
                                  {'-'}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: bagConsumed > 0 ? '#ea580c' : '#64748b', fontWeight: bagConsumed > 0 ? '700' : '400', backgroundColor: '#f0f9ff' }}>
                                  {bagConsumed}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#0369a1', fontWeight: '700', backgroundColor: '#e0f2fe' }}>
                                  {bagClosing}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {selectedHistoryGroup.remarks && (
                      <div style={{ marginTop: '20px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '12.5px', fontWeight: '750', color: 'var(--text-primary)' }}>Remarks / Justification:</h4>
                        <p style={{ margin: 0, fontSize: '13px', color: '#475569', whiteSpace: 'pre-wrap' }}>{selectedHistoryGroup.remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div className="tab-pane" style={{ animation: 'fadeIn 0.2s ease-out', width: '100%' }}>
            <div className="section-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '12px' }}>
              <div className="section-header-left">
                <h2>Shift Consumption Log</h2>
                <p>Record batch material consumption logs for your assigned project and office.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {(user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin') && (
                  <>
                    <button 
                      type="button" 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12.5px',
                        fontWeight: '600',
                        padding: '8px 14px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
                      }}
                      onClick={() => {
                        fetchShiftSubmissionsHistory();
                        setHistoryActiveTab('SHIFTS');
                        setDashboardSubView('HISTORY_LOGS');
                      }}
                    >
                      <ClipboardCheck size={15} style={{ color: '#ea580c' }} /> Submission History
                    </button>
                    <button 
                      type="button" 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12.5px',
                        fontWeight: '600',
                        padding: '8px 14px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
                      }}
                      onClick={() => {
                        fetchAuditHistory();
                        fetchIndentsHistory();
                        setHistoryActiveTab('DRAWINGS');
                        setDashboardSubView('HISTORY_LOGS');
                      }}
                    >
                      <Clock size={15} style={{ color: '#ea580c' }} /> Draw/Handover Audits
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setConsumptionSubView('HISTORY');
                    setSelectedShiftItems({});
                    setShiftRemarks('');
                    navigate('/consumption');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#ea580c',
                    border: '1px solid #ea580c',
                    borderRadius: '8px',
                    padding: '8.5px 16px',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 4px 0 rgba(234, 88, 12, 0.2)'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#c2410c'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ea580c'; }}
                >
                  <ArrowLeft size={16} /> Back to Logs
                </button>
              </div>
            </div>

            {/* Transit Vehicle Stock Control Bar */}
            <div className="transit-control-card" style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ padding: '8px', backgroundColor: 'rgba(247, 147, 30, 0.1)', borderRadius: '10px', color: '#f7931e', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Truck size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--primary-dark)' }}>Active Transit Stock (Your Vehicle Bag)</h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Medicines currently loaded under your account for shift use.</p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="action-btn-primary" 
                    style={{
                      backgroundColor: isHandoverInitiated ? '#cbd5e1' : '#f7931e',
                      borderColor: isHandoverInitiated ? '#cbd5e1' : '#f7931e',
                      gap: '6px',
                      fontSize: '12.5px',
                      padding: '8px 14px',
                      cursor: isHandoverInitiated ? 'not-allowed' : 'pointer',
                      opacity: isHandoverInitiated ? 0.7 : 1
                    }}
                    onClick={() => {
                      if (shiftStatus === 'view_only') {
                        toast.error("Your shift has been completed/handed over. Only view access is permitted.");
                      } else if (pendingHandover || hasProposedHandover) {
                        toast.error("Stock handover has been initiated. Cannot draw stock.");
                      } else {
                        setDrawQuantities({});
                        setDrawScannedBatches({});
                        setFefoViolationDetails(null);
                        setOverrideReason('');
                        setDashboardSubView('DRAW_STOCK');
                      }
                    }}
                    disabled={isHandoverInitiated}
                    title={shiftStatus === 'view_only' ? "Your shift has been completed/handed over. Only view access is permitted." : isHandoverInitiated ? "Stock handover has been initiated. Cannot draw stock." : ""}
                  >
                    <QrCode size={16} /> Draw Stock (FEFO Scan)
                  </button>
                  <button 
                    type="button" 
                    className="action-btn-outline" 
                    style={{
                      gap: '6px',
                      fontSize: '12.5px',
                      padding: '8px 14px',
                      borderColor: '#cbd5e1',
                      cursor: (transitInventory.length === 0 || isHandoverInitiated) ? 'not-allowed' : 'pointer',
                      opacity: (transitInventory.length === 0 || isHandoverInitiated) ? 0.5 : 1
                    }}
                    onClick={() => {
                      if (shiftStatus === 'view_only') {
                        toast.error("Your shift has been completed/handed over. Only view access is permitted.");
                      } else if (pendingHandover || hasProposedHandover) {
                        toast.error("Stock handover has been initiated.");
                      } else {
                        setShowHandoverModal(true);
                      }
                    }}
                    disabled={transitInventory.length === 0 || isHandoverInitiated}
                    title={shiftStatus === 'view_only' ? "Your shift has been completed/handed over. Only view access is permitted." : isHandoverInitiated ? "Stock handover has been initiated." : ""}
                  >
                    <Share2 size={16} /> Handover Bag
                  </button>
                  {/* Return Leftover button removed per operator request */}
                </div>
              </div>

              {/* Handover Alert Block */}
              {pendingHandover && (
                <div style={{
                  backgroundColor: 'rgba(247, 147, 30, 0.05)',
                  border: '1px dashed #f7931e',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  animation: 'pulseBorder 2s infinite'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>🤝</span>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-dark)', display: 'block' }}>
                        Pending Stock Handover
                      </span>
                      <span style={{ fontSize: '12.5px', color: '#475569' }}>
                        Previous Operator <strong>{pendingHandover.sender_username}</strong> has handed over {pendingHandover.items.length} items in the vehicle bag to you.
                      </span>
                    </div>
                  </div>
                  <button 
                    type="button"
                    className="action-btn-primary"
                    style={{ gap: '4px', padding: '6px 12px', fontSize: '12px' }}
                    onClick={handleAcceptHandover}
                  >
                    Accept Handover
                  </button>
                </div>
              )}

              {/* Transit items horizontal row */}
              {transitInventory.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
                  No active transit medicines loaded. Tap "Draw Stock" to scan medicines from Facility box.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {transitInventory.map(item => (
                    <div 
                      key={item.id} 
                      style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        minWidth: '150px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}
                    >
                      <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b' }}>{item.item_name}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Code: {item.item_code}</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ fontSize: '12px', padding: '2px 6px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontWeight: '600' }}>
                          Qty: {item.quantity}
                        </span>
                        <span style={{ fontSize: '11px', color: '#475569', fontWeight: '500' }}>
                          Batch: {item.batch_number}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-container-card" style={{ width: '100%' }}>
              <form onSubmit={handleShiftBatchSubmit}>
                {shiftFormMessage.text && (
                  <div className={`message-banner ${shiftFormMessage.type}`} style={{ padding: '12px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                    {shiftFormMessage.text}
                  </div>
                )}
                
                {/* Project, Office and Shift row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px', width: '100%' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Select Project *</label>
                    <CustomSelect 
                      value={shiftProject}
                      onChange={(e) => {
                        setShiftProject(e.target.value);
                        setShiftPage(1);
                      }}
                      placeholder="-- Choose Project --"
                      disabled={!(user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin')}
                      options={projects.map(p => ({ value: p, label: p }))}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Select Office / Facility *</label>
                    <CustomSelect 
                      value={shiftOffice}
                      onChange={(e) => setShiftOffice(e.target.value)}
                      placeholder="-- Choose Office --"
                      disabled={!(user?.role?.toLowerCase() === 'admin' || user?.username?.toLowerCase() === 'admin') && userOffice?.name && userOffice.name !== 'N/A'}
                      options={
                        shiftOffices.length > 0 
                          ? shiftOffices.map(o => ({ value: o.name, label: `${o.name} (${o.location})` }))
                          : shiftProject 
                            ? [{ value: '', label: 'No Facility offices found for this project', disabled: true }]
                            : []
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Select Shift *</label>
                    <CustomSelect 
                      value={shiftSelectedType}
                      onChange={(e) => setShiftSelectedType(e.target.value)}
                      options={[
                        { value: 'shift_1', label: 'Shift 1 (Morning)' },
                        { value: 'shift_2', label: 'Shift 2 (Evening)' }
                      ]}
                    />
                  </div>
                </div>

                {/* Materials list header and search */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Select Consumed Materials {shiftProject && `(${filteredShiftDrugs.length} available)`}
                    {Object.keys(selectedShiftItems).length > 0 && (
                      <span className="nav-badge" style={{ backgroundColor: 'var(--primary)', color: '#ffffff', marginLeft: '8px', position: 'static', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                        {Object.keys(selectedShiftItems).length} Selected
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {/* Page Size Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Rows per page:</span>
                      <CustomSelect
                        value={shiftPageSize}
                        onChange={(e) => {
                          setShiftPageSize(parseInt(e.target.value));
                          setShiftPage(1);
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
                      value={shiftSearch} 
                      onChange={e => {
                        setShiftSearch(e.target.value);
                        setShiftPage(1);
                      }}
                      style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', minWidth: '200px' }}
                    />
                  </div>
                </div>



                {/* Materials Grid / Table */}
                <div className="table-card" style={{ marginBottom: '16px', overflowX: 'auto', width: '100%', border: '1px solid rgba(28, 25, 23, 0.08)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-premium)', backgroundColor: '#ffffff' }}>
                  <table className="portal-table" style={{ minWidth: '600px', width: '100%', borderCollapse: 'collapse', border: 'none' }}>
                     <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid rgba(28, 25, 23, 0.08)' }}>
                        <th style={{ width: '40px', textAlign: 'center', padding: '12px 10px' }}>
                          <input 
                            type="checkbox"
                            checked={isAllCurrentShiftSelected}
                            onChange={e => handleSelectAllCurrentShift(e.target.checked)}
                            style={{ width: '16px', height: '16px', borderRadius: '4px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                          />
                        </th>
                        <th style={{ textAlign: 'left', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>Item Name</th>
                        <th style={{ textAlign: 'left', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '10%' }}>Code</th>
                        <th style={{ textAlign: 'left', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '10%' }}>Batch</th>
                        <th style={{ textAlign: 'left', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '10%' }}>Mfg</th>
                        <th style={{ textAlign: 'left', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '10%' }}>Expiry Date</th>
                        <th style={{ textAlign: 'right', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '12%' }}>OB</th>
                        <th style={{ textAlign: 'right', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '12%' }}>Received (+)</th>
                        <th style={{ textAlign: 'right', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '12%' }}>Sent Back (-)</th>
                        <th style={{ textAlign: 'right', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '12%' }}>Consumed (-)</th>
                        <th style={{ textAlign: 'right', padding: '16px 20px', fontFamily: 'Outfit', fontWeight: '650', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', width: '12%' }}>Closing Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const groups = paginatedShiftDrugGroups;
                        if (groups.length === 0) {
                          return (
                            <tr>
                              <td colSpan="11" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                {shiftProject ? 'No matching materials found.' : 'Please select a project to load materials.'}
                              </td>
                            </tr>
                          );
                        }
                        return groups.map(group => {
                          let totalOB = 0;
                          let totalReceived = 0;
                          let totalSentBack = 0;
                          let totalConsumed = 0;
                          let totalClosing = 0;

                          const batchRows = group.batches.map(d => {
                            const isSelected = !!selectedShiftItems[d.id];
                            const itemState = selectedShiftItems[d.id] || { consumed: '', received: '', sent_back: '' };
                            
                            const stock = Math.round(d.quantity || 0);
                            const consumedVal = Math.round(parseFloat(itemState.consumed) || 0);
                            const receivedVal = Math.round(parseFloat(itemState.received) || 0);
                            const sentBackVal = Math.round(parseFloat(itemState.sent_back) || 0);
                            
                            const transitItem = transitInventory.find(t => t.drug_id === d.id && t.quantity > 0);
                            const transitQty = transitItem ? Math.round(transitItem.quantity) : 0;

                            let isDrawnThisShift = false;
                            if (transitItem && transitItem.created_at) {
                              const createdDate = new Date(transitItem.created_at);
                              const diffMs = new Date() - createdDate;
                              const diffHours = diffMs / (1000 * 60 * 60);
                              if (diffHours < 16) {
                                isDrawnThisShift = true;
                              }
                            }

                            const officeOB = Math.max(0, stock - receivedVal + sentBackVal + (isDrawnThisShift ? transitQty : 0));
                            const officeReceived = receivedVal;
                            const officeSentBack = sentBackVal;
                            const officeConsumed = isDrawnThisShift ? transitQty : 0;
                            const officeClosing = Math.max(0, officeOB + officeReceived - officeSentBack - officeConsumed);

                            const bagOB = isDrawnThisShift ? 0 : transitQty;
                            const bagReceived = isDrawnThisShift ? transitQty : 0;
                            const bagSentBack = 0;
                            const bagConsumed = consumedVal;
                            const bagClosing = Math.max(0, bagOB + bagReceived - bagSentBack - bagConsumed);

                            const availableLimit = bagOB + bagReceived;
                            const isExceeded = consumedVal > availableLimit;

                            totalOB += bagOB;
                            totalReceived += bagReceived;
                            totalConsumed += bagConsumed;
                            totalClosing += bagClosing;

                            return {
                              d,
                              isSelected,
                              itemState,
                              stock,
                              consumedVal,
                              receivedVal,
                              sentBackVal,
                              transitItem,
                              transitQty,
                              isDrawnThisShift,
                              bagOB,
                              bagReceived,
                              bagSentBack,
                              bagConsumed,
                              bagClosing,
                              availableLimit,
                              isExceeded
                            };
                          });

                          const sortedShiftDrugs = [...group.batches].sort((a, b) => {
                            if (!a.expiry_date) return 1;
                            if (!b.expiry_date) return -1;
                            return new Date(a.expiry_date) - new Date(b.expiry_date);
                          });
                          const earliestShiftDrug = sortedShiftDrugs[0];

                          return (
                            <React.Fragment key={group.item_code || group.item_name}>
                              {/* Parent Row */}
                              <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid rgba(28, 25, 23, 0.08)' }}>
                                <td style={{ textAlign: 'center', padding: '16px 20px', color: 'var(--text-muted)' }}>
                                  —
                                </td>
                                <td style={{ padding: '16px 20px' }}>
                                  <div style={{ fontFamily: 'Outfit', fontWeight: '600', color: 'var(--text-primary)', fontSize: '14.5px' }}>{group.item_name}</div>
                                </td>
                                <td style={{ padding: '16px 20px', fontFamily: 'monospace', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                  {group.item_code || 'N/A'}
                                </td>
                                <td style={{ padding: '16px 20px' }}>
                                  <span style={{ 
                                    fontSize: '11px', 
                                    fontWeight: '600', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '3.5px', 
                                    backgroundColor: 'rgba(216, 17, 89, 0.06)', 
                                    color: '#d81159',
                                    padding: '3px 8px', 
                                    borderRadius: '12px',
                                    border: '1px solid rgba(216, 17, 89, 0.1)'
                                  }}>
                                    <Layers size={10} style={{ color: '#d81159' }} /> {group.batches.length} {group.batches.length === 1 ? 'Batch' : 'Batches'}
                                  </span>
                                </td>
                                <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12.5px' }}>—</td>
                                <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12.5px' }}>—</td>
                                <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'Outfit', fontWeight: '750', color: 'var(--text-primary)', fontSize: '14.5px' }}>
                                  {totalOB}
                                </td>
                                <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'Outfit', fontWeight: '700', color: totalReceived > 0 ? '#16a34a' : 'var(--text-muted)', fontSize: '14.5px' }}>
                                  {totalReceived > 0 ? totalReceived : '-'}
                                </td>
                                <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12.5px', textAlign: 'right' }}>—</td>
                                <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'Outfit', fontWeight: '700', color: totalConsumed > 0 ? '#ea580c' : 'var(--text-muted)', fontSize: '14.5px' }}>
                                  {totalConsumed > 0 ? totalConsumed : '-'}
                                </td>
                                <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'Outfit', fontWeight: '750', color: totalClosing > 0 ? 'var(--primary-dark)' : '#e11d48', fontSize: '14.5px' }}>
                                  {totalClosing}
                                </td>
                              </tr>

                              {/* Child Rows */}
                              {batchRows.map(({
                                d,
                                isSelected,
                                itemState,
                                stock,
                                consumedVal,
                                receivedVal,
                                sentBackVal,
                                transitItem,
                                transitQty,
                                isDrawnThisShift,
                                bagOB,
                                bagReceived,
                                bagSentBack,
                                bagConsumed,
                                bagClosing,
                                availableLimit,
                                isExceeded
                              }) => {
                                const isFefoConsumptionPriority = earliestShiftDrug ? earliestShiftDrug.id === d.id : true;
                                const isConsumptionLocked = !isFefoConsumptionPriority && earliestShiftDrug;

                                const handleFieldChange = (field, val) => {
                                  setSelectedShiftItems(prev => {
                                    const curr = prev[d.id] || { consumed: '', received: '', sent_back: '' };
                                    const updated = { ...curr, [field]: val };
                                    
                                    const isEmpty = !updated.consumed && !updated.received && !updated.sent_back;
                                    const copy = { ...prev };
                                    if (isEmpty) {
                                      delete copy[d.id];
                                    } else {
                                      copy[d.id] = updated;
                                    }
                                    return copy;
                                  });
                                };

                                return (
                                  <tr key={d.id} className={isSelected ? 'selected-row' : ''} style={{ 
                                    borderBottom: '1px solid rgba(28, 25, 23, 0.04)', 
                                    backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.04)' : '#fafafa', 
                                    transition: 'var(--transition-smooth)',
                                    opacity: isConsumptionLocked ? 0.6 : 1
                                  }}>
                                    <td style={{ textAlign: 'center', padding: '12px 10px' }}>
                                      <input 
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={isConsumptionLocked}
                                        onChange={e => {
                                          if (e.target.checked) {
                                            setSelectedShiftItems(prev => ({ 
                                              ...prev, 
                                              [d.id]: { consumed: '1', received: receivedVal.toString() || '', sent_back: sentBackVal.toString() || '' } 
                                            }));
                                          } else {
                                            setSelectedShiftItems(prev => {
                                              const copy = { ...prev };
                                              delete copy[d.id];
                                              return copy;
                                            });
                                          }
                                        }}
                                        style={{ width: '16px', height: '16px', borderRadius: '4px', cursor: isConsumptionLocked ? 'not-allowed' : 'pointer', accentColor: 'var(--primary)' }}
                                     />
                                    </td>
                                    <td style={{ padding: '12px 10px', paddingLeft: '24px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: '500', fontStyle: 'italic', color: isConsumptionLocked ? '#94a3b8' : '#64748b', fontSize: '12px' }}>↳ Batch Specification</span>
                                        {isFefoConsumptionPriority && group.batches.length > 1 && (
                                          <span style={{
                                            fontSize: '9px',
                                            fontWeight: '800',
                                            backgroundColor: '#e6f4ea',
                                            color: '#137333',
                                            border: '1px solid #137333',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                          }}>
                                            ⚡ Current FEFO
                                          </span>
                                        )}
                                        {isConsumptionLocked && (
                                          <span style={{
                                            fontSize: '9px',
                                            fontWeight: '700',
                                            backgroundColor: '#fef3c7',
                                            color: '#d97706',
                                            border: '1px solid #f59e0b',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                          }}>
                                            ⚠️ Later Expiry (Consume {earliestShiftDrug.batch_number} first)
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 10px', color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>—</td>
                                    <td style={{ padding: '12px 10px', fontSize: '12.5px', color: isConsumptionLocked ? '#94a3b8' : '#475569' }}>
                                      {d.batch_number || 'N/A'}
                                    </td>
                                    <td style={{ padding: '12px 10px', fontSize: '12.5px', color: isConsumptionLocked ? '#94a3b8' : '#475569' }}>
                                      {d.manufacturing_date || 'N/A'}
                                    </td>
                                    <td style={{ padding: '12px 10px', fontSize: '12.5px', color: isConsumptionLocked ? '#94a3b8' : '#475569' }}>
                                      {d.expiry_date || 'N/A'}
                                    </td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: isConsumptionLocked ? '#94a3b8' : '#475569' }}>
                                      {bagOB}
                                    </td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: isConsumptionLocked ? '#94a3b8' : (bagReceived > 0 ? '#16a34a' : '#94a3b8') }}>
                                      {bagReceived > 0 ? bagReceived : '-'}
                                    </td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '13px', color: '#94a3b8' }}>
                                      -
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                        <input 
                                          type="number"
                                          step="1"
                                          min="0"
                                          placeholder="0"
                                          value={itemState.consumed}
                                          disabled={!isSelected || isConsumptionLocked}
                                          title={isExceeded ? `Quantity exceeds available stock (${availableLimit} max)` : ""}
                                          onChange={e => {
                                            const val = e.target.value;
                                            const integerVal = val ? Math.round(parseFloat(val)).toString() : '';
                                            handleFieldChange('consumed', integerVal);
                                          }}
                                          style={{ 
                                            padding: '6px 8px', 
                                            border: isExceeded ? '2px solid #ef4444' : (isSelected ? '1px solid var(--primary)' : '1px solid #cbd5e1'), 
                                            borderRadius: '6px', 
                                            fontSize: '13px', 
                                            width: '75px', 
                                            textAlign: 'right', 
                                            outline: 'none',
                                            backgroundColor: isExceeded ? '#fef2f2' : (isSelected && !isConsumptionLocked ? '#ffffff' : '#f8fafc'),
                                            color: isExceeded ? '#b91c1c' : '#1f2937',
                                            fontWeight: isSelected ? '600' : '400',
                                            cursor: isConsumptionLocked ? 'not-allowed' : 'text'
                                          }}
                                        />
                                        {isExceeded && (
                                          <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: '500' }}>
                                            Max in Bag: {availableLimit}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '13px', fontWeight: '750', color: isConsumptionLocked ? '#94a3b8' : (bagClosing >= 0 ? '#b45309' : '#e11d48') }}>
                                      {bagClosing}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalShiftPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <button 
                      type="button" 
                      className="filter-btn"
                      disabled={shiftPage === 1}
                      onClick={() => setShiftPage(prev => Math.max(prev - 1, 1))}
                      style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    
                    {Array.from({ length: totalShiftPages }, (_, i) => i + 1).map(p => (
                      <button 
                        key={p} 
                        type="button" 
                        className={`filter-btn ${shiftPage === p ? 'active' : ''}`}
                        onClick={() => setShiftPage(p)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: shiftPage === p ? 'var(--primary)' : '#ffffff',
                          color: shiftPage === p ? '#ffffff' : '#1e293b',
                          border: '1px solid #e2e8f0',
                          fontWeight: '600'
                        }}
                      >
                        {p}
                      </button>
                    ))}
                    
                    <button 
                      type="button" 
                      className="filter-btn"
                      disabled={shiftPage === totalShiftPages}
                      onClick={() => setShiftPage(prev => Math.min(prev + 1, totalShiftPages))}
                      style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {/* Remarks/Justification */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Shift remarks / justification</label>
                  <textarea 
                    rows={3} 
                    placeholder="Enter any shift consumption notes..." 
                    value={shiftRemarks}
                    onChange={(e) => setShiftRemarks(e.target.value)}
                    style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Submit / Cancel row */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button 
                    type="button" 
                    className="filter-btn"
                    onClick={() => {
                      setConsumptionSubView('HISTORY');
                      setSelectedShiftItems({});
                      setShiftRemarks('');
                      navigate('/consumption');
                    }}
                    style={{ 
                      padding: '10px 24px', 
                      borderRadius: '8px', 
                      fontWeight: '600', 
                      border: '1px solid #cbd5e1', 
                      backgroundColor: 'rgba(239, 68, 68, 0.05)',
                      color: '#ef4444',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="filter-btn"
                    onClick={handleSaveDraft}
                    disabled={loggingShift}
                    style={{ 
                      padding: '10px 24px', 
                      borderRadius: '8px', 
                      fontWeight: '600', 
                      border: '1px solid #cbd5e1', 
                      backgroundColor: '#ffffff',
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    Save Draft
                  </button>
                  <button 
                    type="submit" 
                    className="action-btn-primary" 
                    disabled={loggingShift}
                    style={{ padding: '10px 24px', borderRadius: '8px' }}
                  >
                    {loggingShift ? 'Submitting Batch...' : `Submit Consumption Log (${Object.keys(selectedShiftItems).length} Selected)`}
                  </button>
                </div>
              </form>
            </div>
          </div>
            );
          }
        })()}
      </div>

       {/* Bulk Shift Consumption Preview Modal */}
      {showShiftSubmitPreview && (() => {
        const unfilteredList = shiftDrugs.filter(d => {
          if (d.project !== shiftProject || !d.is_active) return false;
          
          const inTransit = transitInventory.some(t => t.drug_id === d.id && t.quantity > 0);
          const inOffice = Math.round(d.quantity || 0) > 0;      
          const hasDraftActivity = !!selectedShiftItems[d.id] && (
            Math.round(parseFloat(selectedShiftItems[d.id].consumed) || 0) > 0 ||
            Math.round(parseFloat(selectedShiftItems[d.id].received) || 0) > 0 ||
            Math.round(parseFloat(selectedShiftItems[d.id].sent_back) || 0) > 0
          );
          
          return inTransit || inOffice || hasDraftActivity;
        });

        const filteredPreviewList = unfilteredList.filter(d => {
          if (previewSearch === '') return true;
          const term = previewSearch.toLowerCase();
          return (
            (d.item_name && d.item_name.toLowerCase().includes(term)) ||
            (d.item_code && d.item_code.toLowerCase().includes(term))
          );
        });

        // Group together same item names/codes by sorting
        const sortedList = [...filteredPreviewList].sort((a, b) => {
          const nameA = a.item_name || '';
          const nameB = b.item_name || '';
          if (nameA !== nameB) return nameA.localeCompare(nameB);
          const codeA = a.item_code || '';
          const codeB = b.item_code || '';
          return codeA.localeCompare(codeB);
        });

        // Assign S.No based on unique item name + code combination
        let currentSNo = 0;
        let lastItemKey = '';
        const allSelectedItemsArray = sortedList.map(d => {
          const itemKey = `${d.item_name}_${d.item_code}`;
          if (itemKey !== lastItemKey) {
            currentSNo += 1;
            lastItemKey = itemKey;
          }
          return {
            ...d,
            sNo: currentSNo
          };
        });
        const totalPreviewPages = Math.ceil(allSelectedItemsArray.length / previewPageSize);
        
        // Safety check if page range is somehow violated
        const currentPage = Math.min(previewPage, totalPreviewPages || 1);
        const paginatedPreviewItems = allSelectedItemsArray.slice(
          (currentPage - 1) * previewPageSize,
          currentPage * previewPageSize
        );

        return (
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
              width: '95%',
              maxWidth: '1150px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Confirm Shift Consumption Log
                </h3>
                <button 
                  type="button" 
                  onClick={() => setShowShiftSubmitPreview(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scope info summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: '#64748b', display: 'block' }}>Project</span>
                  <span style={{ fontSize: '13px', fontWeight: '750', color: 'var(--text-primary)' }}>{shiftProject}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: '#64748b', display: 'block' }}>Office / Location</span>
                  <span style={{ fontSize: '13px', fontWeight: '750', color: 'var(--text-primary)' }}>{shiftOffice}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: '#64748b', display: 'block' }}>Shift Type</span>
                  <span style={{ fontSize: '13px', fontWeight: '750', color: 'var(--text-primary)' }}>
                    {shiftSelectedType === 'shift_1' ? 'Shift 1 (Morning)' : 'Shift 2 (Evening)'}
                  </span>
                </div>
              </div>

              {/* Selected Materials Reconciliation Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <h4 style={{ margin: '0', fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    Selected Items Reconciliation
                  </h4>
                  {/* Search Bar Input */}
                  <div style={{ position: 'relative', width: '250px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search name or code..."
                      value={previewSearch}
                      onChange={(e) => {
                        setPreviewSearch(e.target.value);
                        setPreviewPage(1);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 30px',
                        fontSize: '12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        outline: 'none',
                        color: '#334155',
                        backgroundColor: '#ffffff'
                      }}
                    />
                    {previewSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewSearch('');
                          setPreviewPage(1);
                        }}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          color: '#94a3b8',
                          padding: 0
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dynamic Responsive & Scrollable Reconciliation Table Grid */}
                <div style={{ 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '12px', 
                  overflowX: 'auto', 
                  maxHeight: '400px', 
                  overflowY: 'auto', 
                  backgroundColor: '#ffffff',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
                  position: 'relative'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: 'none' }}>
                    <thead>
                      {/* Top Header Group */}
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc', padding: '12px 10px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #e2e8f0', fontSize: '11px', width: '50px' }}>S.No.</th>
                        <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc', padding: '12px 12px', textAlign: 'left', fontWeight: '800', color: '#334155', borderRight: '1px solid #e2e8f0', fontSize: '11px' }}>Material / Code</th>
                        <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc', padding: '12px 12px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #e2e8f0', fontSize: '11px', width: '90px' }}>Batch</th>
                        <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc', padding: '12px 12px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #e2e8f0', fontSize: '11px', width: '140px' }}>MFG / EXP</th>
                        <th colSpan={5} style={{ position: 'sticky', top: 0, zIndex: 11, padding: '8px 10px', textAlign: 'center', fontWeight: '850', color: '#c2410c', backgroundColor: '#fff7ed', borderRight: '1px solid #ffd8a8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          Store / Room Stock (Local Facility)
                        </th>
                        <th colSpan={5} style={{ position: 'sticky', top: 0, zIndex: 11, padding: '8px 10px', textAlign: 'center', fontWeight: '850', color: '#0369a1', backgroundColor: '#f0f9ff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          Transit Bag (Operator Bag)
                        </th>
                      </tr>
                      {/* Sub-header columns */}
                      <tr style={{ backgroundColor: '#fdfdfd', borderBottom: '1px solid #e2e8f0' }}>
                        {/* Store columns */}
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10.5px' }}>OB</th>
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10.5px' }}>Received</th>
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10.5px' }}>Sent Back</th>
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10.5px' }}>Drawn</th>
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#7c2d12', backgroundColor: '#fff7ed', borderRight: '1px solid #ffd8a8', fontSize: '10.5px' }}>Closing</th>
                        
                        {/* Bag columns */}
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10.5px' }}>OB</th>
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10.5px' }}>Received</th>
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10.5px' }}>Sent Back</th>
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10.5px' }}>Consumed</th>
                        <th style={{ position: 'sticky', top: '31px', zIndex: 11, padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#0c4a6e', backgroundColor: '#e0f2fe', fontSize: '10.5px' }}>Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const localItemCounts = {};
                        paginatedPreviewItems.forEach(d => {
                          const itemKey = `${d.item_name}_${d.item_code}`;
                          localItemCounts[itemKey] = (localItemCounts[itemKey] || 0) + 1;
                        });
                        
                        const localItemSpanTracker = {};
                        
                        return paginatedPreviewItems.map((drug, index) => {
                          const id = drug.id;
                          const val = selectedShiftItems[id];
                          const itemKey = `${drug.item_name}_${drug.item_code}`;
                          
                          let rowSpan = 0;
                          if (!localItemSpanTracker[itemKey]) {
                            rowSpan = localItemCounts[itemKey];
                            localItemSpanTracker[itemKey] = true;
                          }

                          let consumedVal = 0;
                          let receivedVal = 0;
                          let sentBackVal = 0;
                          
                          if (typeof val === 'object' && val !== null) {
                            consumedVal = Math.round(parseFloat(val.consumed) || 0);
                            receivedVal = Math.round(parseFloat(val.received) || 0);
                            sentBackVal = Math.round(parseFloat(val.sent_back) || 0);
                          } else if (val !== undefined) {
                            consumedVal = Math.round(parseFloat(val) || 0);
                          }

                          const stock = Math.round(drug?.quantity || 0);
                          const transitItem = transitInventory.find(t => t.drug_id === drug.id && t.quantity > 0);
                          const transitQty = transitItem ? Math.round(transitItem.quantity) : 0;
                          
                          let isDrawnThisShift = false;
                          if (transitItem && transitItem.created_at) {
                            const createdDate = new Date(transitItem.created_at);
                            const diffMs = new Date() - createdDate;
                            const diffHours = diffMs / (1000 * 60 * 60);
                            if (diffHours < 16) {
                              isDrawnThisShift = true;
                            }
                          }
                          
                          const officeOB = Math.max(0, stock - receivedVal + sentBackVal + (isDrawnThisShift ? transitQty : 0));
                          const officeReceived = receivedVal;
                          const officeSentBack = sentBackVal;
                          const officeConsumed = isDrawnThisShift ? transitQty : 0;
                          const officeClosing = Math.max(0, officeOB + officeReceived - officeSentBack - officeConsumed);
                          
                          const bagOB = isDrawnThisShift ? 0 : transitQty;
                          const bagReceived = isDrawnThisShift ? transitQty : 0;
                          const bagSentBack = 0;
                          const bagConsumed = consumedVal;
                          const bagClosing = Math.max(0, bagOB + bagReceived - bagSentBack - bagConsumed);

                          // Retrieve pre-grouped serial number
                          const serialNumber = drug.sNo || index + 1;

                          return (
                            <tr key={id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                              {/* S.No. */}
                              {rowSpan > 0 && (
                                <td rowSpan={rowSpan} style={{ padding: '10px', textAlign: 'center', color: '#475569', fontWeight: '600', borderRight: '1px solid #e2e8f0', verticalAlign: 'middle' }}>
                                  {serialNumber}
                                </td>
                              )}
                              
                              {/* Material Specifications */}
                              {rowSpan > 0 && (
                                <td rowSpan={rowSpan} style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', verticalAlign: 'middle' }}>
                                  <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '13px' }}>{drug?.item_name || 'Unknown Item'}</div>
                                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                                    Code: <strong style={{ color: '#475569' }}>{drug?.item_code || 'N/A'}</strong>
                                  </div>
                                </td>
                              )}

                              {/* Batch Code */}
                              <td style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid #e2e8f0', fontWeight: '600', color: '#0369a1', backgroundColor: '#f8fafc' }}>
                                <span style={{ padding: '2px 6px', backgroundColor: '#e0f2fe', borderRadius: '4px', fontSize: '11px' }}>
                                  {drug?.batch_number || 'N/A'}
                                </span>
                              </td>

                              {/* MFG / EXP */}
                              <td style={{ padding: '10px', borderRight: '1px solid #e2e8f0', fontSize: '10.5px', color: '#64748b' }}>
                                <div>MFG: <strong style={{ color: '#475569' }}>{formatDateForInput(drug?.manufacturing_date) || '—'}</strong></div>
                                <div style={{ marginTop: '2px' }}>EXP: <strong style={{ color: '#475569' }}>{formatDateForInput(drug?.expiry_date) || '—'}</strong></div>
                              </td>

                              {/* Store Columns */}
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: '#451a03', fontWeight: '500' }}>{officeOB}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeReceived > 0 ? '#16a34a' : '#78716c', fontWeight: officeReceived > 0 ? '700' : '400' }}>
                                {officeReceived > 0 ? `+${officeReceived}` : '0'}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeSentBack > 0 ? '#d97706' : '#78716c', fontWeight: officeSentBack > 0 ? '700' : '400' }}>
                                {officeSentBack > 0 ? `-${officeSentBack}` : '0'}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeConsumed > 0 ? '#ea580c' : '#78716c', fontWeight: officeConsumed > 0 ? '700' : '400' }}>
                                {officeConsumed > 0 ? `-${officeConsumed}` : '0'}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffd8a8', backgroundColor: '#fffaf5', color: '#ea580c', fontWeight: '800', fontSize: '13.5px' }}>
                                {officeClosing}
                              </td>

                              {/* Transit Bag Columns */}
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: '#0c4a6e', fontWeight: '500' }}>{bagOB}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: bagReceived > 0 ? '#16a34a' : '#78716c', fontWeight: bagReceived > 0 ? '700' : '400' }}>
                                {bagReceived > 0 ? `+${bagReceived}` : '0'}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: '#cbd5e1' }}>-</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: bagConsumed > 0 ? '#dc2626' : '#78716c', fontWeight: bagConsumed > 0 ? '700' : '400' }}>
                                {bagConsumed > 0 ? `-${bagConsumed}` : '0'}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', backgroundColor: '#f0f9ff', color: '#0284c7', fontWeight: '800', fontSize: '13.5px' }}>
                                {bagClosing}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Preview Pagination Controls with Rows Limit Option */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '10px', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Showing Page <strong>{currentPage}</strong> of <strong>{totalPreviewPages || 1}</strong> (Total {allSelectedItemsArray.length} items)
                  </span>
                  
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>|</span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                    <span>Rows per page:</span>
                    <CustomSelect
                      value={previewPageSize}
                      onChange={(e) => {
                        setPreviewPageSize(parseInt(e.target.value));
                        setPreviewPage(1);
                      }}
                      options={[
                        { value: 5, label: '5' },
                        { value: 10, label: '10' },
                        { value: 20, label: '20' },
                        { value: 50, label: '50' },
                        { value: 100, label: '100' }
                      ]}
                      style={{ width: '80px' }}
                      compact
                      placement="top"
                    />
                  </div>
                </div>

                {totalPreviewPages > 1 && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="filter-btn"
                      disabled={currentPage === 1}
                      onClick={() => setPreviewPage(prev => Math.max(prev - 1, 1))}
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="filter-btn"
                      disabled={currentPage === totalPreviewPages}
                      onClick={() => setPreviewPage(prev => Math.min(prev + 1, totalPreviewPages))}
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* Remarks Section */}
              {shiftRemarks && (
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Remarks / Justification</h4>
                  <p style={{ margin: 0, padding: '8px 12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>
                    "{shiftRemarks}"
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="filter-btn"
                  onClick={() => setShowShiftSubmitPreview(false)}
                  style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: '600' }}
                >
                  Go Back & Edit
                </button>
                <button
                  type="button"
                  className="action-btn-primary"
                  onClick={submitShiftBatch}
                  disabled={loggingShift}
                  style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: '600' }}
                >
                  {loggingShift ? 'Submitting...' : 'Confirm Submit'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Handover Modal */}
      {showHandoverModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(28, 25, 23, 0.4)',
          backdropFilter: 'blur(8px)',
          zIndex: 1060,
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
            width: '95%',
            maxWidth: '1150px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ 
                  width: '36px', 
                  height: '36px', 
                  borderRadius: '10px', 
                  background: 'linear-gradient(135deg, #4d1375 0%, #d81159 100%)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  boxShadow: '0 4px 6px -1px rgba(77, 19, 117, 0.2)'
                }}>
                  <ArrowLeftRight size={18} style={{ color: '#ffffff' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                    Handover Reconciliation
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                    Audit-ready verification of room &amp; transit stock balances
                  </span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowHandoverModal(false)}
                style={{ 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  cursor: 'pointer', 
                  color: '#64748b',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#0f172a'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'end' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: '750', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                    Select Target Incoming Operator: *
                  </label>
                  <CustomSelect
                    value={selectedRecipientUsername}
                    onChange={(e) => setSelectedRecipientUsername(e.target.value)}
                    options={usersList.map(u => ({ value: u.username, label: u.username }))}
                    placeholder={loadingUsers ? "Loading operators..." : "-- Choose Operator --"}
                    disabled={loadingUsers}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: '750', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                    Search Handover Items:
                  </label>
                  <input
                    type="text"
                    placeholder="Search by name, code or batch..."
                    value={handoverSearch}
                    onChange={(e) => {
                      setHandoverSearch(e.target.value);
                      setHandoverPage(1);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      height: '36px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Table Grid of Handover Items */}
              <div>
                {(() => {
                  // Helper function to get dates from associates
                  const getDrugMfgExp = (item) => {
                    const assoc = shiftDrugs?.find(d => d.id === item.drug_id) || officeInventory?.find(d => d.drug_id === item.drug_id);
                    const mfg = assoc?.manufacturing_date || item.manufacturing_date;
                    const exp = assoc?.expiry_date || item.expiry_date;
                    return {
                      manufacturing_date: formatDateForInput(mfg) || '—',
                      expiry_date: formatDateForInput(exp) || '—'
                    };
                  };

                  // Use the identical drug list filter as the main reconciliation table
                  const fullGroupedList = shiftDrugs.filter(d => {
                    if (d.project !== shiftProject || !d.is_active) return false;
                    
                    const inTransit = transitInventory.some(t => t.drug_id === d.id && t.quantity > 0);
                    const inOffice = Math.round(d.quantity || 0) > 0;      
                    const hasDraftActivity = !!selectedShiftItems[d.id] && (
                      Math.round(parseFloat(selectedShiftItems[d.id].consumed) || 0) > 0 ||
                      Math.round(parseFloat(selectedShiftItems[d.id].received) || 0) > 0 ||
                      Math.round(parseFloat(selectedShiftItems[d.id].sent_back) || 0) > 0
                    );
                    
                    return inTransit || inOffice || hasDraftActivity;
                  }).map(d => {
                    const transitItem = transitInventory.find(t => t.drug_id === d.id && t.quantity > 0);
                    return {
                      id: d.id,
                      drug_id: d.id,
                      item_name: d.item_name || d.name,
                      item_code: d.item_code || d.code,
                      batch_number: d.batch_number,
                      manufacturing_date: d.manufacturing_date,
                      expiry_date: d.expiry_date,
                      quantity: transitItem ? transitItem.quantity : 0,
                      created_at: transitItem ? transitItem.created_at : null
                    };
                  });

                  // Filter the handover list
                  const filtered = fullGroupedList.filter(item => {
                    if (!handoverSearch) return true;
                    const q = handoverSearch.toLowerCase();
                    return (
                      (item.item_name && item.item_name.toLowerCase().includes(q)) ||
                      (item.item_code && item.item_code.toLowerCase().includes(q)) ||
                      (item.batch_number && item.batch_number.toLowerCase().includes(q))
                    );
                  });

                  // Sort items so identical items (by name + code) are grouped together
                  const sorted = [...filtered].sort((a, b) => {
                    const nameA = a.item_name || '';
                    const nameB = b.item_name || '';
                    if (nameA !== nameB) return nameA.localeCompare(nameB);
                    const codeA = a.item_code || '';
                    const codeB = b.item_code || '';
                    return codeA.localeCompare(codeB);
                  });

                  // Assign Serial Numbers (S.No) based on grouped items
                  let currentSNo = 0;
                  let lastKey = '';
                  const annotated = sorted.map(item => {
                    const key = `${item.item_name}_${item.item_code}`;
                    if (key !== lastKey) {
                      currentSNo += 1;
                      lastKey = key;
                    }
                    return { ...item, sNo: currentSNo };
                  });

                  const totalItems = annotated.length;
                  const totalPages = Math.ceil(totalItems / handoverPageSize);
                  const activePage = Math.min(handoverPage, totalPages || 1);
                  const paginated = annotated.slice(
                    (activePage - 1) * handoverPageSize,
                    activePage * handoverPageSize
                  );

                  // Calculate rowSpans on paginated items for merged column display
                  const rowSpans = {};
                  paginated.forEach(item => {
                    const key = `${item.item_name}_${item.item_code}`;
                    rowSpans[key] = (rowSpans[key] || 0) + 1;
                  });

                  const renderedKeys = new Set();

                  if (totalItems === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '32px', border: '1px dashed #cbd5e1', borderRadius: '12px', color: '#64748b', fontSize: '13px', backgroundColor: '#f8fafc' }}>
                        No materials found in transit bag.
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        backgroundColor: '#ffffff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}>
                        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '300px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left', minWidth: '950px' }}>
                            <thead>
                              {/* Top Header Group */}
                              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 12 }}>
                                <th rowSpan={2} style={{ padding: '10px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '50px' }}>S.No.</th>
                                <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px' }}>Material / Code</th>
                                <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '90px' }}>Batch</th>
                                <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '140px' }}>MFG / EXP</th>
                                <th colSpan={5} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '850', color: '#c2410c', backgroundColor: '#fff7ed', borderRight: '1px solid #ffd8a8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                  Store / Room Stock (Local Facility)
                                </th>
                                <th colSpan={5} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '850', color: '#0369a1', backgroundColor: '#f0f9ff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                  Transit Bag (Operator Bag)
                                </th>
                              </tr>
                              {/* Sub-header columns */}
                              <tr style={{ backgroundColor: '#fdfdfd', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: '35px', zIndex: 12 }}>
                                {/* Store columns */}
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>OB</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Received</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Sent Back</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Drawn</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#7c2d12', backgroundColor: '#fff7ed', borderRight: '1px solid #ffd8a8', fontSize: '10px' }}>Closing</th>
                                
                                {/* Bag columns */}
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>OB</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Received</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Sent Back</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Consumed</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#0c4a6e', backgroundColor: '#e0f2fe', fontSize: '10px' }}>Closing</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginated.map((item) => {
                                const key = `${item.item_name}_${item.item_code}`;
                                const showMerge = !renderedKeys.has(key);
                                if (showMerge) {
                                  renderedKeys.add(key);
                                }
                                const spanVal = rowSpans[key] || 1;
                                const dateInfo = getDrugMfgExp(item);

                                // Fetch actual drug object in room inventory
                                const drug = shiftDrugs?.find(d => d.id === item.drug_id) || officeInventory?.find(d => d.drug_id === item.drug_id);
                                
                                // Retrieve quantities & edits
                                const val = selectedShiftItems[item.drug_id];
                                let consumedVal = 0;
                                let receivedVal = 0;
                                let sentBackVal = 0;

                                if (typeof val === 'object' && val !== null) {
                                  consumedVal = Math.round(parseFloat(val.consumed) || 0);
                                  receivedVal = Math.round(parseFloat(val.received) || 0);
                                  sentBackVal = Math.round(parseFloat(val.sent_back) || 0);
                                } else if (val !== undefined) {
                                  consumedVal = Math.round(parseFloat(val) || 0);
                                }

                                const stock = Math.round(drug?.quantity || 0);
                                const transitQty = Math.round(item.quantity || 0);

                                let isDrawnThisShift = false;
                                if (item.created_at) {
                                  const createdDate = new Date(item.created_at);
                                  const diffMs = new Date() - createdDate;
                                  const diffHours = diffMs / (1000 * 60 * 60);
                                  if (diffHours < 16) {
                                    isDrawnThisShift = true;
                                  }
                                }

                                const officeOB = Math.max(0, stock - receivedVal + sentBackVal + (isDrawnThisShift ? transitQty : 0));
                                const officeReceived = receivedVal;
                                const officeSentBack = sentBackVal;
                                const officeConsumed = isDrawnThisShift ? transitQty : 0;
                                const officeClosing = Math.max(0, officeOB + officeReceived - officeSentBack - officeConsumed);

                                const bagOB = isDrawnThisShift ? 0 : transitQty;
                                const bagReceived = isDrawnThisShift ? transitQty : 0;
                                const bagSentBack = 0;
                                const bagConsumed = consumedVal;
                                const bagClosing = Math.max(0, bagOB + bagReceived - bagSentBack - bagConsumed);

                                return (
                                  <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff', transition: 'background-color 0.15s' }}>
                                    {showMerge && (
                                      <td 
                                        rowSpan={spanVal}
                                        style={{ 
                                          padding: '10px 8px', 
                                          textAlign: 'center', 
                                          borderRight: '1px solid #cbd5e1', 
                                          backgroundColor: '#f8fafc',
                                          fontWeight: '700',
                                          color: '#475569',
                                          verticalAlign: 'middle'
                                        }}
                                      >
                                        {item.sNo}
                                      </td>
                                    )}
                                    
                                    {showMerge && (
                                      <td 
                                        rowSpan={spanVal}
                                        style={{ 
                                          padding: '10px 12px', 
                                          borderRight: '1px solid #cbd5e1', 
                                          verticalAlign: 'middle', 
                                          fontWeight: '600', 
                                          color: '#1e293b' 
                                        }}
                                      >
                                        <div>{item.item_name}</div>
                                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'normal', marginTop: '2px' }}>
                                          Code: {item.item_code}
                                        </div>
                                      </td>
                                    )}

                                    <td style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid #cbd5e1', fontWeight: '600', color: '#0369a1', backgroundColor: '#f8fafc' }}>
                                      <span style={{ padding: '2px 6px', backgroundColor: '#e0f2fe', borderRadius: '4px', fontSize: '10.5px' }}>
                                        {item.batch_number || 'N/A'}
                                      </span>
                                    </td>

                                    <td style={{ padding: '10px 12px', borderRight: '1px solid #cbd5e1', fontSize: '11px', color: '#64748b' }}>
                                      <div>MFG: <strong style={{ color: '#475569' }}>{dateInfo.manufacturing_date}</strong></div>
                                      <div style={{ marginTop: '2px' }}>EXP: <strong style={{ color: '#475569' }}>{dateInfo.expiry_date}</strong></div>
                                    </td>

                                    {/* Store Columns */}
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: '#451a03', fontWeight: '500' }}>{officeOB}</td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeReceived > 0 ? '#16a34a' : '#78716c', fontWeight: officeReceived > 0 ? '700' : '400' }}>
                                      {officeReceived > 0 ? `+${officeReceived}` : '0'}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeSentBack > 0 ? '#d97706' : '#78716c', fontWeight: officeSentBack > 0 ? '700' : '400' }}>
                                      {officeSentBack > 0 ? `-${officeSentBack}` : '0'}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeConsumed > 0 ? '#ea580c' : '#78716c', fontWeight: officeConsumed > 0 ? '700' : '400' }}>
                                      {officeConsumed > 0 ? `-${officeConsumed}` : '0'}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffd8a8', backgroundColor: '#fffaf5', color: '#ea580c', fontWeight: '800', fontSize: '12.5px' }}>
                                      {officeClosing}
                                    </td>

                                    {/* Transit Columns */}
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: '#0c4a6e', fontWeight: '500' }}>{bagOB}</td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: bagReceived > 0 ? '#16a34a' : '#78716c', fontWeight: bagReceived > 0 ? '700' : '400' }}>
                                      {bagReceived > 0 ? `+${bagReceived}` : '0'}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: '#cbd5e1' }}>-</td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: bagConsumed > 0 ? '#dc2626' : '#78716c', fontWeight: bagConsumed > 0 ? '700' : '400' }}>
                                      {bagConsumed > 0 ? `-${bagConsumed}` : '0'}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', backgroundColor: '#f0f9ff', color: '#0284c7', fontWeight: '800', fontSize: '12.5px' }}>
                                      {bagClosing}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Pagination Controls */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                            Showing Page <strong>{activePage}</strong> of <strong>{totalPages || 1}</strong> (Total {totalItems} items)
                          </span>
                          
                          <span style={{ fontSize: '11.5px', color: '#cbd5e1' }}>|</span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#64748b' }}>
                            <span>Rows per page:</span>
                            <CustomSelect
                              value={handoverPageSize}
                              onChange={(e) => {
                                setHandoverPageSize(parseInt(e.target.value));
                                setHandoverPage(1);
                              }}
                              options={[
                                { value: 5, label: '5' },
                                { value: 10, label: '10' },
                                { value: 20, label: '20' },
                                { value: 50, label: '50' }
                              ]}
                              style={{ width: '70px' }}
                              compact
                              placement="top"
                            />
                          </div>
                        </div>

                        {totalPages > 1 && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="filter-btn"
                              disabled={activePage === 1}
                              onClick={() => setHandoverPage(prev => Math.max(prev - 1, 1))}
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                            >
                              Previous
                            </button>
                            <button
                              type="button"
                              className="filter-btn"
                              disabled={activePage === totalPages}
                              onClick={() => setHandoverPage(prev => Math.min(prev + 1, totalPages))}
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="filter-btn"
                  onClick={() => setShowHandoverModal(false)}
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="action-btn-primary"
                  style={{ fontSize: '13px' }}
                  onClick={() => handleProposeHandover(selectedRecipientUsername)}
                >
                  Propose Handover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Live Camera Scanner Modal */}
      {activeCameraScanner && scannerDrugId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(10px)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            backgroundColor: '#1b1d2e',
            borderRadius: '24px',
            border: '2px solid #334155',
            width: '90%',
            maxWidth: '380px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '805', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={18} style={{ color: '#f7931e' }} /> Barcode Scan Verification
              </h3>
              <button 
                type="button" 
                onClick={() => {
                  setActiveCameraScanner(null);
                  setScannerDrugId(null);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e34825', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', textAlign: 'center', lineHeight: '1.4' }}>
              Point the mobile camera viewfinder directly at the product's barcode label.
            </p>

            <div style={{ 
              width: '100%', 
              maxWidth: '260px', 
              aspectRatio: '1', 
              backgroundColor: '#020617', 
              borderRadius: '16px', 
              overflow: 'hidden', 
              position: 'relative',
              border: '2px solid #f7931e',
              boxShadow: '0 0 20px rgba(247, 147, 30, 0.5)'
            }}>
              <div id="reader" style={{ width: '100%', height: '100%' }}></div>
            </div>

            <button
              type="button"
              className="action-btn-primary"
              style={{
                backgroundColor: '#e34825',
                borderColor: '#e34825',
                padding: '11px',
                borderRadius: '8px',
                width: '100%',
                fontSize: '13px',
                fontWeight: '700',
                marginTop: '6px'
              }}
              onClick={() => {
                setActiveCameraScanner(null);
                setScannerDrugId(null);
              }}
            >
              Cancel Scan
            </button>
          </div>
        </div>
      )}

    </>
  );
}
