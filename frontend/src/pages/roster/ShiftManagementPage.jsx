import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Search, Plus, RefreshCw, ChevronLeft, ChevronRight,
  X, Users, Clock, AlertTriangle, Edit3, Trash2, ArrowLeftRight,
  Coffee, Sun, Sunset, Briefcase, Upload, Download
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';
import './ShiftManagementPage.css';

// ─── Custom Time Selector dropdown (combines Hour and Minute selectors) ──────
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, '0');
  return { value: h, label: h };
});

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => {
  const m = String(i).padStart(2, '0');
  return { value: m, label: m };
});

const CustomTimeSelect = ({ value, onChange, disabled, placement = "bottom" }) => {
  const [hour, minute] = (value || '00:00').split(':');
  const currentHour = hour || '00';
  const currentMinute = minute || '00';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <CustomSelect
        value={currentHour}
        onChange={(e) => {
          onChange(`${e.target.value}:${currentMinute}`);
        }}
        options={HOUR_OPTIONS}
        compact
        disabled={disabled}
        placeholder="HH"
        style={{ width: '80px', minWidth: '80px' }}
        placement={placement}
      />
      <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>:</span>
      <CustomSelect
        value={currentMinute}
        onChange={(e) => {
          onChange(`${currentHour}:${e.target.value}`);
        }}
        options={MINUTE_OPTIONS}
        compact
        disabled={disabled}
        placeholder="MM"
        style={{ width: '80px', minWidth: '80px' }}
        placement={placement}
      />
    </div>
  );
};

// ─── Shift Type Configs ───────────────────────────
const DEFAULT_SHIFT_TYPES = {
  shift_1: { label: 'Shift 1 (Morning)', emoji: '🔵', icon: Sun, defaultStart: '06:00', defaultEnd: '14:00', color: 'blue' },
  shift_2: { label: 'Shift 2 (Evening)', emoji: '🟠', icon: Sunset, defaultStart: '14:00', defaultEnd: '22:00', color: 'orange' },
  shift_3: { label: 'Shift 3 (Night)', emoji: '🟣', icon: Clock, defaultStart: '22:00', defaultEnd: '06:00', color: 'purple' },
  general: { label: 'General Shift', emoji: '🟢', icon: Briefcase, defaultStart: '09:00', defaultEnd: '18:00', color: 'green' },
  off:     { label: 'Weekly Off', emoji: '⚪', icon: Coffee, defaultStart: '', defaultEnd: '', color: 'gray' },
};

// ─── Date Helpers ──────────────────────────────────
const getMonday = (d) => {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(dt.setDate(diff));
};

const formatDate = (d) => d.toISOString().split('T')[0];

const formatShortDate = (d) => {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDayName = (d) => d.toLocaleDateString('en-US', { weekday: 'short' });

const isToday = (d) => formatDate(d) === formatDate(new Date());

const getWeekDates = (mondayDate) => {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
};


export default function ShiftManagementPage() {
  const navigate = useNavigate();
  const {
    user, userRole, projects, userProject, userOffice,
    addAuditLog
  } = useApp();

  // ─── Shift Timings Configurations State ────────────
  const [shiftTypes, setShiftTypes] = useState(() => {
    const saved = localStorage.getItem('bit_indent_shift_types');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const icons = { shift_1: Sun, shift_2: Sunset, shift_3: Clock, general: Briefcase, off: Coffee };
        Object.keys(parsed).forEach(k => {
          if (icons[k]) parsed[k].icon = icons[k];
        });
        return parsed;
      } catch (e) {
        console.error("Failed to parse saved shift types:", e);
      }
    }
    return DEFAULT_SHIFT_TYPES;
  });

  const SHIFT_TYPES = shiftTypes;

  // ─── Filters ────────────────────────────────────
  const [selectedProject, setSelectedProject] = useState('');
  const [offices, setOffices] = useState([]);
  const [selectedOffice, setSelectedOffice] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Week Navigation ─────────────────────────────
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDates = getWeekDates(weekStart);

  // ─── Roster Data ─────────────────────────────────
  const [rosterData, setRosterData] = useState(null);
  const [loading, setLoading] = useState(false);

  // ─── Inline Edit ─────────────────────────────────
  const [editingCell, setEditingCell] = useState(null); // {empCode, dateKey}
  const editRef = useRef(null);

  // ─── Assign Modal ──────────────────────────────
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [modalEmployees, setModalEmployees] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedEmps, setSelectedEmps] = useState(new Set());
  const [assignShiftType, setAssignShiftType] = useState('shift_1');
  const [assignDateFrom, setAssignDateFrom] = useState('');
  const [assignDateTo, setAssignDateTo] = useState('');
  const [assignRemarks, setAssignRemarks] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
    const [empSearch, setEmpSearch] = useState('');

  //  Edit Details Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRosterId, setEditRosterId] = useState(null);
  const [editEmployeeName, setEditEmployeeName] = useState('');
  const [editEmployeeCode, setEditEmployeeCode] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editShiftType, setEditShiftType] = useState('shift_1');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editStatus, setEditStatus] = useState('scheduled');
  const [editSubmitting, setEditSubmitting] = useState(false);

  //  Swap Shifts Modal State
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapSourceShift, setSwapSourceShift] = useState(null); // { id, empName, empCode, date, shiftType }
  const [swapTargetRosterId, setSwapTargetRosterId] = useState('');
  const [swapSubmitting, setSwapSubmitting] = useState(false);

  // ─── Pagination ──────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ─── Confirm Modal ────────────────────────────────
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });

  // ─── Shift Timings Modal State ─────────────────────
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configShift1Start, setConfigShift1Start] = useState('06:00');
  const [configShift1End, setConfigShift1End] = useState('14:00');
  const [configShift2Start, setConfigShift2Start] = useState('14:00');
  const [configShift2End, setConfigShift2End] = useState('22:00');
  const [configShift3Start, setConfigShift3Start] = useState('22:00');
  const [configShift3End, setConfigShift3End] = useState('06:00');
  const [configGeneralStart, setConfigGeneralStart] = useState('09:00');
  const [configGeneralEnd, setConfigGeneralEnd] = useState('18:00');


  // ─── Import Modal State ──────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [importProject, setImportProject] = useState(selectedProject || '');
  const [importFile, setImportFile] = useState(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);

  useEffect(() => {
    if (selectedProject) {
      setImportProject(selectedProject);
    }
  }, [selectedProject]);

  const downloadCSVTemplate = () => {
    const headers = ["employee_code", "shift_date", "shift_type", "office_name", "employee_name", "start_time", "end_time"];
    const csvContent = [
      headers.join(","),
      `"HR-EMP-12010","2026-07-28","shift_1","AP-1962-MVU-KOTHAPATNAM","Subbarao","06:00","14:00"`,
      `"HR-EMP-12009","2026-07-28","shift_2","AP-1962-MVU-KOTHAPATNAM","Ramesh","14:00","22:00"`,
      `"HR-EMP-07989","2026-07-28","general","AP-1962-MVU-KOTHAPATNAM","Suresh","09:00","18:00"`,
      `"HR-EMP-12010","2026-07-29","off","","","",""`
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `roster_template_${importProject}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportRoster = async (e) => {
    e.preventDefault();
    if (!importFile) {
      toast.error("Please select a CSV or Excel file to upload.");
      return;
    }
    setImportSubmitting(true);
    setImportErrors([]);
    try {
      const response = await api.roster.importRoster(importProject, importFile);
      toast.success(response.message || "Roster imported successfully!");
      setShowImportModal(false);
      setImportFile(null);
      fetchRoster();

      await api.audit.createLog(
        'IMPORT_ROSTER',
        'SHIFT_MANAGEMENT',
        `Imported roster file: ${importFile.name}`,
        'SUCCESS',
        importProject
      );
    } catch (err) {
      console.error("Import error:", err);
      if (err.detail && err.detail.errors) {
        setImportErrors(err.detail.errors);
      } else {
        toast.error(err.message || "Failed to import roster.");
      }
    } finally {
      setImportSubmitting(false);
    }
  };

  const downloadActiveRosterCSV = () => {
    if (!rosterData || !rosterData.employees || rosterData.employees.length === 0) {
      toast.error("No roster data available to download.");
      return;
    }
    const headers = ["employee_code", "employee_name", "shift_date", "shift_type", "start_time", "end_time", "office_name"];
    const rows = [];
    
    rosterData.employees.forEach(emp => {
      Object.keys(emp.shifts || {}).forEach(dateStr => {
        const s = emp.shifts[dateStr];
        if (s && s.shift_type) {
          rows.push([
            emp.employee_code,
            emp.employee_name,
            dateStr,
            s.shift_type,
            s.start_time || "",
            s.end_time || "",
            emp.office_name || ""
          ]);
        }
      });
    });
    
    if (rows.length === 0) {
      toast.error("No shift assignments found for the current selection.");
      return;
    }

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `roster_export_${selectedProject}_${formatDate(weekDates[0])}_to_${formatDate(weekDates[6])}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to determine if a date string YYYY-MM-DD is in the past
  const isPastDate = (dateStr) => {
    const todayStr = formatDate(new Date());
    return dateStr < todayStr;
  };

  // ─── Initial project setup ────────────────────────
  useEffect(() => {
    const defaultProj = userProject || (projects.length > 0 ? projects[0] : '');
    if (defaultProj && !selectedProject) {
      setSelectedProject(defaultProj);
    }
  }, [userProject, projects]);

  // ─── Fetch offices when project changes ──────────
  useEffect(() => {
    if (selectedProject) {
      api.projects.getOffices(selectedProject)
        .then(data => setOffices(data || []))
        .catch(err => console.error("Error loading offices:", err));
    } else {
      setOffices([]);
    }
  }, [selectedProject]);

  // ─── Auto-set office for non-admin ────────────────
  useEffect(() => {
    const isAdmin = userRole === 'admin' || user?.username === 'admin';
    if (!isAdmin && userOffice?.name && userOffice.name !== 'N/A') {
      setSelectedOffice(userOffice.name);
    }
  }, [userOffice, userRole]);

  // ─── Fetch roster data ────────────────────────────
  const fetchRoster = async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const startDate = formatDate(weekStart);
      const endDateObj = new Date(weekStart);
      endDateObj.setDate(endDateObj.getDate() + 6);
      const endDate = formatDate(endDateObj);

      const data = await api.roster.getRoster(
        selectedProject,
        selectedOffice !== 'all' ? selectedOffice : '',
        startDate,
        endDate,
        searchQuery
      );
      setRosterData(data);
    } catch (err) {
      console.error("Error loading roster:", err);
      toast.error(err.message || "Failed to load roster data.");
      setRosterData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, [selectedProject, selectedOffice, weekStart]);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedOffice, selectedProject]);

  // ─── Click outside to close inline edit ───────────
  useEffect(() => {
    const handler = (e) => {
      if (editRef.current && !editRef.current.contains(e.target)) {
        // If clicking on another shift badge or empty cell, let their own onClick handle it
        if (e.target.closest('.shift-badge') || e.target.closest('.empty-cell')) {
          return;
        }
        setEditingCell(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Week Navigation ─────────────────────────────
  const goToPrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
  };

  const goToNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };

  const goToCurrentWeek = () => {
    setWeekStart(getMonday(new Date()));
  };

  // ─── Roster Stats ─────────────────────────────────
  const employees = rosterData?.employees || [];
  const filteredEmployees = employees.filter(emp => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return emp.employee_name.toLowerCase().includes(q) ||
           emp.employee_code.toLowerCase().includes(q);
  });

  const totalEmployees = filteredEmployees.length;
  const totalPages = Math.ceil(totalEmployees / pageSize);
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Count shifts for stats
  let totalShifts = 0, shift1Count = 0, shift2Count = 0, shift3Count = 0, generalCount = 0, offCount = 0;
  filteredEmployees.forEach(emp => {
    Object.values(emp.shifts || {}).forEach(s => {
      totalShifts++;
      if (s.shift_type === 'shift_1') shift1Count++;
      else if (s.shift_type === 'shift_2') shift2Count++;
      else if (s.shift_type === 'shift_3') shift3Count++;
      else if (s.shift_type === 'general') generalCount++;
      else if (s.shift_type === 'off') offCount++;
    });
  });

  // ─── Inline Shift Edit ────────────────────────────
  const handleCellClick = (empCode, dateKey) => {
    if (isPastDate(dateKey)) {
      toast.error("Past shifts cannot be modified.");
      return;
    }
    setEditingCell(prev =>
      prev && prev.empCode === empCode && prev.dateKey === dateKey
        ? null
        : { empCode, dateKey }
    );
  };

  const handleShiftChange = async (emp, dateKey, newShiftType) => {
    if (isPastDate(dateKey)) {
      toast.error("Past shifts cannot be modified.");
      return;
    }
    setEditingCell(null);
    const existingShift = emp.shifts?.[dateKey];
    const config = SHIFT_TYPES[newShiftType] || {};

    try {
      if (existingShift) {
        const oldShiftLabel = SHIFT_TYPES[existingShift.shift_type]?.label || existingShift.shift_type;
        // Update existing
        await api.roster.updateEntry(existingShift.id, {
          shift_type: newShiftType,
          start_time: config.defaultStart || '',
          end_time: config.defaultEnd || ''
        });
        toast.success(`Updated ${emp.employee_name}'s shift to ${config.label}`);
        
        await addAuditLog('UPDATE_ROSTER', 'SHIFT_MANAGEMENT',
          `Updated shift for ${emp.employee_name} (${emp.employee_code}) on ${dateKey}. Changed from '${oldShiftLabel}' to '${config.label}'.`,
          'SUCCESS', selectedProject
        );
      } else {
        // Create new via bulk (single entry)
        await api.roster.bulkCreate(
          selectedProject,
          selectedOffice !== 'all' ? selectedOffice : emp.office_name || '',
          [{
            employee_code: emp.employee_code,
            employee_name: emp.employee_name,
            dates: [dateKey],
            shift_type: newShiftType,
            start_time: config.defaultStart || '',
            end_time: config.defaultEnd || ''
          }]
        );
        toast.success(`Assigned ${config.label} to ${emp.employee_name}`);

        await addAuditLog('CREATE_ROSTER', 'SHIFT_MANAGEMENT',
          `Assigned ${config.label} to ${emp.employee_name} (${emp.employee_code}) on ${dateKey}`,
          'SUCCESS', selectedProject
        );
      }
      fetchRoster();
    } catch (err) {
      toast.error(err.message || "Failed to update shift.");
    }
  };

  const handleDeleteShift = async (emp, dateKey) => {
    if (isPastDate(dateKey)) {
      toast.error("Past shifts cannot be modified.");
      return;
    }
    const existingShift = emp.shifts?.[dateKey];
    if (!existingShift) return;

    if (existingShift.status === 'completed' || existingShift.status === 'active') {
      toast.error(`Active or completed shifts cannot be cancelled.`);
      return;
    }

    setEditingCell(null);
    setConfirmModal({
      show: true,
      title: 'Cancel Shift Assignment',
      message: `Remove ${SHIFT_TYPES[existingShift.shift_type]?.label || existingShift.shift_type} for ${emp.employee_name} on ${dateKey}?`,
      onConfirm: async () => {
        try {
          await api.roster.deleteEntry(existingShift.id);
          toast.success("Shift assignment cancelled.");
          fetchRoster();
          await addAuditLog('CANCEL_ROSTER', 'SHIFT_MANAGEMENT',
            `Cancelled shift assignment (${SHIFT_TYPES[existingShift.shift_type]?.label || existingShift.shift_type}) for ${emp.employee_name} (${emp.employee_code}) on ${dateKey}`,
            'SUCCESS', selectedProject
          );
        } catch (err) {
          toast.error(err.message || "Failed to cancel shift.");
        }
        setConfirmModal({ show: false, title: '', message: '', onConfirm: null });
      }
    });
  };

  const openConfigModal = () => {
    setConfigShift1Start(SHIFT_TYPES.shift_1.defaultStart || '06:00');
    setConfigShift1End(SHIFT_TYPES.shift_1.defaultEnd || '14:00');
    setConfigShift2Start(SHIFT_TYPES.shift_2.defaultStart || '14:00');
    setConfigShift2End(SHIFT_TYPES.shift_2.defaultEnd || '22:00');
    setConfigShift3Start(SHIFT_TYPES.shift_3.defaultStart || '22:00');
    setConfigShift3End(SHIFT_TYPES.shift_3.defaultEnd || '06:00');
    setConfigGeneralStart(SHIFT_TYPES.general.defaultStart || '09:00');
    setConfigGeneralEnd(SHIFT_TYPES.general.defaultEnd || '18:00');
    setShowConfigModal(true);
  };

  const handleConfigSubmit = async () => {
    const updated = {
      ...SHIFT_TYPES,
      shift_1: { ...SHIFT_TYPES.shift_1, defaultStart: configShift1Start, defaultEnd: configShift1End },
      shift_2: { ...SHIFT_TYPES.shift_2, defaultStart: configShift2Start, defaultEnd: configShift2End },
      shift_3: { ...SHIFT_TYPES.shift_3, defaultStart: configShift3Start, defaultEnd: configShift3End },
      general: { ...SHIFT_TYPES.general, defaultStart: configGeneralStart, defaultEnd: configGeneralEnd },
    };

    setShiftTypes(updated);
    
    // Save to localStorage
    const toSave = {};
    Object.keys(updated).forEach(k => {
      const { icon, ...rest } = updated[k];
      toSave[k] = rest;
    });
    localStorage.setItem('bit_indent_shift_types', JSON.stringify(toSave));

    toast.success("Shift timings configured successfully!");
    setShowConfigModal(false);

    await addAuditLog('CONFIG_SHIFT_TIMINGS', 'SHIFT_MANAGEMENT',
      `Configured predefined shift timings: Shift 1 (${configShift1Start}-${configShift1End}), Shift 2 (${configShift2Start}-${configShift2End}), Shift 3 (${configShift3Start}-${configShift3End}), General (${configGeneralStart}-${configGeneralEnd})`,
      'SUCCESS', selectedProject
    );
  };

  // ─── Assign Modal ──────────────────────────────
  const openAssignModal = async () => {
    if (!selectedProject) {
      toast.error("Please select a project first.");
      return;
    }
    setShowAssignModal(true);
    setSelectedEmps(new Set());
    setAssignDateFrom(formatDate(weekStart));
    const endDateObj = new Date(weekStart);
    endDateObj.setDate(endDateObj.getDate() + 6);
    setAssignDateTo(formatDate(endDateObj));
    setAssignShiftType('shift_1');
    setAssignRemarks('');
    setEmpSearch('');

    setModalLoading(true);
    try {
      const data = await api.roster.getEmployees(
        selectedProject,
        selectedOffice !== 'all' ? selectedOffice : ''
      );
      setModalEmployees(data || []);
    } catch (err) {
      console.error("Error loading employees:", err);
      toast.error("Failed to load employees.");
      setModalEmployees([]);
    } finally {
      setModalLoading(false);
    }
  };

  const openEditDetailsModal = (emp, dateKey, shift) => {
    if (isPastDate(dateKey)) {
      toast.error("Past shifts cannot be modified.");
      return;
    }
    setEditingCell(null); // close inline dropdown
    setEditRosterId(shift.id);
    setEditEmployeeName(emp.employee_name);
    setEditEmployeeCode(emp.employee_code);
    setEditDate(dateKey);
    setEditShiftType(shift.shift_type);
    setEditStartTime(shift.start_time || '');
    setEditEndTime(shift.end_time || '');
    setEditRemarks(shift.remarks || '');
    setEditStatus(shift.status || 'scheduled');
    setShowEditModal(true);
  };

  const handleEditSubmit = async () => {
    setEditSubmitting(true);
    try {
      const oldShiftType = editRosterId ? (employees.find(e => e.employee_code === editEmployeeCode)?.shifts?.[editDate]?.shift_type) : null;
      const oldShiftLabel = oldShiftType ? (SHIFT_TYPES[oldShiftType]?.label || oldShiftType) : 'None';
      const newShiftLabel = SHIFT_TYPES[editShiftType]?.label || editShiftType;

      await api.roster.updateEntry(editRosterId, {
        shift_type: editShiftType,
        start_time: editStartTime,
        end_time: editEndTime,
        status: editStatus,
        remarks: editRemarks
      });
      toast.success("Shift assignment updated successfully.");
      setShowEditModal(false);
      fetchRoster();
      
      await addAuditLog('UPDATE_ROSTER', 'SHIFT_MANAGEMENT',
        `Updated shift for ${editEmployeeName} (${editEmployeeCode}) on ${editDate}. Changed from '${oldShiftLabel}' to '${newShiftLabel}'.`,
        'SUCCESS', selectedProject
      );
    } catch (err) {
      toast.error(err.message || "Failed to update shift roster assignment.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const openSwapModal = (emp, dateKey, shift) => {
    if (isPastDate(dateKey)) {
      toast.error("Past shifts cannot be modified.");
      return;
    }
    if (shift.status === 'active' || shift.status === 'completed') {
      toast.error("Active or completed shifts cannot be swapped.");
      return;
    }
    setEditingCell(null); // close inline dropdown
    setSwapSourceShift({
      id: shift.id,
      employee_name: emp.employee_name,
      employee_code: emp.employee_code,
      date: dateKey,
      shift_type: shift.shift_type
    });
    setSwapTargetRosterId('');
    setShowSwapModal(true);
  };

  const getSwapCandidates = () => {
    if (!swapSourceShift) return [];
    const candidates = [];
    employees.forEach(emp => {
      if (emp.employee_code === swapSourceShift.employee_code) return;
      const targetShift = emp.shifts?.[swapSourceShift.date];
      // Only scheduled shifts can be target of swaps
      if (targetShift && targetShift.status === 'scheduled') {
        candidates.push({
          roster_id: targetShift.id,
          employee_name: emp.employee_name,
          employee_code: emp.employee_code,
          shift_type: targetShift.shift_type,
          label: `${emp.employee_name} (${SHIFT_TYPES[targetShift.shift_type]?.label || targetShift.shift_type})`
        });
      }
    });
    return candidates;
  };

  const handleSwapSubmit = async () => {
    if (!swapTargetRosterId) {
      toast.error("Please select an employee to swap shifts with.");
      return;
    }
    setSwapSubmitting(true);
    try {
      const candidates = getSwapCandidates();
      const target = candidates.find(c => c.roster_id === Number(swapTargetRosterId));
      const targetName = target ? target.employee_name : 'Other Employee';
      const targetCode = target ? target.employee_code : '...';
      const targetShiftType = target ? target.shift_type : '...';

      await api.roster.swapShifts(swapSourceShift.id, Number(swapTargetRosterId));
      toast.success("Shifts swapped successfully.");
      setShowSwapModal(false);
      fetchRoster();

      await addAuditLog('SWAP_ROSTER', 'SHIFT_MANAGEMENT',
        `Swapped shifts on ${swapSourceShift.date}: ${swapSourceShift.employee_name} (${SHIFT_TYPES[swapSourceShift.shift_type]?.label || swapSourceShift.shift_type}) swapped with ${targetName} (${SHIFT_TYPES[targetShiftType]?.label || targetShiftType})`,
        'SUCCESS', selectedProject
      );
    } catch (err) {
      toast.error(err.message || "Failed to swap shifts.");
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleShiftTypeChange = (type) => {
    setAssignShiftType(type);
  };

  const toggleEmpSelection = (code) => {
    setSelectedEmps(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (selectedEmps.size === 0) {
      toast.error("Please select at least one employee.");
      return;
    }
    if (!assignDateFrom || !assignDateTo) {
      toast.error("Please select a date range.");
      return;
    }

    const todayStr = formatDate(new Date());
    if (assignDateFrom < todayStr) {
      toast.error("You cannot assign shifts to past dates.");
      return;
    }

    // Build dates array
    const dates = [];
    let current = new Date(assignDateFrom);
    const end = new Date(assignDateTo);
    while (current <= end) {
      dates.push(formatDate(current));
      current.setDate(current.getDate() + 1);
    }

    if (dates.length === 0) {
      toast.error("Invalid date range.");
      return;
    }

    const config = SHIFT_TYPES[assignShiftType] || {};
    const assignments = [...selectedEmps].map(code => {
      const emp = modalEmployees.find(e => e.employee_code === code);
      return {
        employee_code: code,
        employee_name: emp?.name || code,
        dates,
        shift_type: assignShiftType,
        start_time: config.defaultStart || '',
        end_time: config.defaultEnd || ''
      };
    });

    setAssignSubmitting(true);
    try {
      const result = await api.roster.bulkCreate(
        selectedProject,
        selectedOffice,
        assignments,
        assignRemarks
      );
      toast.success(result.message || "Shifts assigned successfully!");
      setShowAssignModal(false);
      fetchRoster();

      await addAuditLog('CREATE_ROSTER', 'SHIFT_MANAGEMENT',
        `Assigned ${assignShiftType} to ${selectedEmps.size} employees for ${dates.length} days`,
        'SUCCESS', selectedProject
      );
    } catch (err) {
      toast.error(err.message || "Failed to assign shifts.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  // ─── Filtered employees in modal ──────────────────
  const filteredModalEmps = modalEmployees.filter(emp => {
    if (!empSearch) return true;
    const q = empSearch.toLowerCase();
    return emp.name.toLowerCase().includes(q) ||
           emp.employee_code.toLowerCase().includes(q) ||
           (emp.role || '').toLowerCase().includes(q);
  });


  // ─── RENDER ───────────────────────────────────────
  return (
    <div className="shift-mgmt-container">
      {/* Header */}
      <div className="section-header-row" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
        <div className="section-header-left">
          <h2>Shift Management</h2>
          <p>Plan, schedule and manage employee shift rosters</p>
        </div>
        <div className="section-header-actions" style={{ display: 'flex', gap: '10px' }}>
          <button className="action-btn-secondary" onClick={() => { fetchRoster(); }} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)' }}>
            <RefreshCw size={14} className={loading ? 'spin-animation' : ''} />
            <span>Refresh</span>
          </button>
          <button className="action-btn-secondary" onClick={openConfigModal} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)' }}>
            <Clock size={14} />
            <span>Shift Timings</span>
          </button>
          <button className="action-btn-secondary" onClick={() => navigate('/shift-management/audits')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)' }}>
            <CalendarDays size={14} />
            <span>Shift Audits</span>
          </button>
          <button className="action-btn-secondary" onClick={() => setShowImportModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)' }}>
            <Upload size={14} />
            <span>Import Excel/CSV</span>
          </button>
          <button className="action-btn-secondary" onClick={downloadActiveRosterCSV} disabled={!rosterData} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)' }}>
            <Download size={14} />
            <span>Export Roster CSV</span>
          </button>
          <button className="btn-primary-gradient" onClick={openAssignModal}>
            <Plus size={14} />
            <span>Assign Shifts</span>
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="users-control-card">
        <div className="filters-layout-row">
          <div className="search-box-group">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              className="search-input-field"
              placeholder="Search employee name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="filter-dropdowns-group">
            <div className="filter-select-wrapper">
              <label>Project</label>
              <CustomSelect
                value={selectedProject}
                onChange={(e) => { setSelectedProject(e.target.value); setSelectedOffice('all'); }}
                options={projects.map(p => ({ value: p, label: p }))}
                placeholder="Select Project"
              />
            </div>
            <div className="filter-select-wrapper">
              <label>Office</label>
              <CustomSelect
                value={selectedOffice}
                onChange={(e) => setSelectedOffice(e.target.value)}
                options={[
                  { value: 'all', label: 'All Offices' },
                  ...offices.map(o => ({ value: o.name, label: o.name }))
                ]}
              />
            </div>
            <div className="filter-select-wrapper">
              <label>Week</label>
              <div className="week-navigator">
                <button className="week-nav-btn" onClick={goToPrevWeek} title="Previous Week">
                  <ChevronLeft size={16} />
                </button>
                <span className="week-label" onClick={goToCurrentWeek} style={{ cursor: 'pointer' }} title="Click to go to current week">
                  {formatShortDate(weekDates[0])} — {formatShortDate(weekDates[6])}
                </span>
                <button className="week-nav-btn" onClick={goToNextWeek} title="Next Week">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        
        {/* Card 1: Employees */}
        <div className="metric-card" style={{
          padding: '12px 16px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ padding: '8px', backgroundColor: '#f3e8ff', borderRadius: '8px', color: '#7e22ce', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Users size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Employees
            </span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {totalEmployees}
            </span>
          </div>
        </div>

        {/* Card 2: Shift 1 (M) */}
        <div className="metric-card" style={{
          padding: '12px 16px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ padding: '8px', backgroundColor: '#eff6ff', borderRadius: '8px', color: '#1d4ed8', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Sun size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Shift 1 (M)
            </span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {shift1Count}
            </span>
          </div>
        </div>

        {/* Card 3: Shift 2 (E) */}
        <div className="metric-card" style={{
          padding: '12px 16px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ padding: '8px', backgroundColor: '#fff7ed', borderRadius: '8px', color: '#c2410c', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Sunset size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Shift 2 (E)
            </span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {shift2Count}
            </span>
          </div>
        </div>

        {/* Card 4: Shift 3 (N) */}
        <div className="metric-card" style={{
          padding: '12px 16px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ padding: '8px', backgroundColor: '#faf5ff', borderRadius: '8px', color: '#7e22ce', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Clock size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Shift 3 (N)
            </span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {shift3Count}
            </span>
          </div>
        </div>

        {/* Card 5: Days Off */}
        <div className="metric-card" style={{
          padding: '12px 16px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', color: '#475569', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Coffee size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Days Off
            </span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {offCount}
            </span>
          </div>
        </div>

        {/* Card 6: Total Entries */}
        <div className="metric-card" style={{
          padding: '12px 16px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ padding: '8px', backgroundColor: '#dcfce7', borderRadius: '8px', color: '#10b981', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <CalendarDays size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Total Entries
            </span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {totalShifts}
            </span>
          </div>
        </div>

      </div>

      {/* Weekly Roster Grid */}
      <div className="heavy-table-card">
        {loading ? (
          <div className="table-loading-overlay">
            <div className="bavya-spinner" style={{ margin: '0 auto 12px' }}>
              <div className="petal petal-tl"></div>
              <div className="petal petal-tr"></div>
              <div className="petal petal-bl"></div>
              <div className="petal petal-br"></div>
            </div>
            <span>Loading shift roster...</span>
          </div>
        ) : !selectedProject ? (
          <div className="table-empty-state">
            <CalendarDays size={40} className="empty-icon" />
            <h3>Select a Project</h3>
            <p>Choose a project from the filter above to view the shift roster.</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="table-empty-state">
            <CalendarDays size={40} className="empty-icon" />
            <h3>No Roster Entries</h3>
            <p>No shift assignments found for this week. Click "Assign Shifts" to get started.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll-container">
              <table className="roster-grid-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    {weekDates.map((d, i) => (
                      <th key={i} className={isToday(d) ? 'today-col' : ''}>
                        {formatDayName(d)}
                        <span className="day-date">{formatShortDate(d)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmployees.map(emp => (
                    <tr key={emp.employee_code}>
                      <td>
                        <div className="roster-emp-info">
                          <span className="roster-emp-name">{emp.employee_name}</span>
                          <span className="roster-emp-code">{emp.employee_code}</span>
                        </div>
                      </td>
                      {weekDates.map((d, i) => {
                        const dateKey = formatDate(d);
                        const shift = emp.shifts?.[dateKey];
                        const isEditing = editingCell?.empCode === emp.employee_code && editingCell?.dateKey === dateKey;
                        const config = shift ? SHIFT_TYPES[shift.shift_type] : null;
                        const isPast = isPastDate(dateKey);

                        return (
                          <td key={i} className={isToday(d) ? 'today-col' : ''} style={{ position: 'relative', zIndex: isEditing ? 1010 : undefined }}>
                            {shift ? (
                              <div
                                className={`shift-badge ${shift.shift_type} ${isPast ? 'past-shift' : ''}`}
                                onClick={() => handleCellClick(emp.employee_code, dateKey)}
                                title={isPast ? `Past Shift - ${config?.label || shift.shift_type} (cannot be modified)` : `${config?.label || shift.shift_type}${shift.start_time ? ` (${shift.start_time}-${shift.end_time})` : ''}`}
                              >
                                <span>{config?.emoji || '📋'}</span>
                                <span>{config?.label || shift.shift_type}</span>
                                {shift.start_time && (
                                  <span className="badge-time">{shift.start_time}</span>
                                )}
                              </div>
                            ) : (
                              <div
                                className={`empty-cell ${isPast ? 'past' : ''}`}
                                onClick={() => handleCellClick(emp.employee_code, dateKey)}
                                title={isPast ? "Past Date (cannot assign shifts)" : "Click to assign shift"}
                              >
                                {isPast ? '-' : '+'}
                              </div>
                            )}

                            {/* Inline Edit Dropdown */}
                            {isEditing && (
                              <div className="inline-shift-edit" ref={editRef}>
                                {Object.entries(SHIFT_TYPES).map(([key, cfg]) => (
                                  <button
                                    key={key}
                                    className={`inline-shift-option ${shift?.shift_type === key ? 'selected' : ''}`}
                                    onClick={() => handleShiftChange(emp, dateKey, key)}
                                  >
                                    <span>{cfg.emoji}</span>
                                    <span>{cfg.label}</span>
                                    {cfg.defaultStart && (
                                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
                                        {cfg.defaultStart}
                                      </span>
                                    )}
                                  </button>
                                ))}
                                {shift && (
                                  <>
                                    <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
                                    <button
                                      className="inline-shift-option"
                                      onClick={() => openEditDetailsModal(emp, dateKey, shift)}
                                    >
                                      <Edit3 size={13} style={{ color: 'var(--primary)', marginRight: '6px' }} />
                                      <span>Edit Details</span>
                                    </button>
                                    <button
                                      className="inline-shift-option"
                                      onClick={() => openSwapModal(emp, dateKey, shift)}
                                    >
                                      <ArrowLeftRight size={13} style={{ color: '#8b5cf6', marginRight: '6px' }} />
                                      <span>Swap Shift</span>
                                    </button>
                                    <button
                                      className="inline-shift-option delete"
                                      onClick={() => handleDeleteShift(emp, dateKey)}
                                    >
                                      <Trash2 size={13} style={{ marginRight: '6px' }} />
                                      <span>Remove</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="table-pagination-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
              <div className="pagination-info" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Showing <span className="font-semibold">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-semibold">{Math.min(currentPage * pageSize, totalEmployees)}</span> of{' '}
                <span className="font-semibold">{totalEmployees}</span> employees
              </div>
              <div className="pagination-controls-wrapper">
                <div className="page-size-selector">
                  <span>Rows:</span>
                  <CustomSelect
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    options={[
                      { value: 10, label: '10' },
                      { value: 20, label: '20' },
                      { value: 50, label: '50' }
                    ]}
                    style={{ width: '75px' }}
                    compact
                    placement="top"
                  />
                </div>
                <div className="pagination-buttons">
                  <button className="pagination-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, index, array) => {
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
                  <button className="pagination-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>


      {/* Assign Shifts Modal */}
      {showAssignModal && (
        <div className="roster-modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="roster-modal" onClick={e => e.stopPropagation()}>
            <div className="roster-modal-header">
              <h3>Assign Shifts</h3>
              <button className="roster-modal-close" onClick={() => setShowAssignModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="roster-modal-body">
              <div className="roster-modal-row">
                <div className="roster-modal-field">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={assignDateFrom}
                    onChange={e => setAssignDateFrom(e.target.value)}
                  />
                </div>
                <div className="roster-modal-field">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={assignDateTo}
                    onChange={e => setAssignDateTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="roster-modal-row">
                <div className="roster-modal-field">
                  <label>Shift Type</label>
                  <CustomSelect
                    value={assignShiftType}
                    onChange={(e) => handleShiftTypeChange(e.target.value)}
                    options={Object.entries(SHIFT_TYPES).map(([k, v]) => ({
                      value: k,
                      label: `${v.emoji} ${v.label}`
                    }))}
                  />
                </div>
                <div className="roster-modal-field">
                  <label>Shift Timing (Predefined)</label>
                  <div style={{
                    padding: '9px 12px',
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '38px',
                    boxSizing: 'border-box'
                  }}>
                    <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                    <span>
                      {SHIFT_TYPES[assignShiftType]?.defaultStart
                        ? `${SHIFT_TYPES[assignShiftType].defaultStart} - ${SHIFT_TYPES[assignShiftType].defaultEnd}`
                        : 'No timing (Day Off)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Employee Search + Checklist */}
              <div className="roster-modal-field">
                <label>Select Employees ({selectedEmps.size} selected)</label>
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', fontFamily: 'inherit', fontSize: '13px' }}
                  />
                </div>
                <div className="emp-checklist-container">
                  {modalLoading ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Loading employees...
                    </div>
                  ) : filteredModalEmps.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No employees found for this project/office.
                    </div>
                  ) : (
                    <>
                      {/* Select All */}
                      <div className="emp-checklist-item" style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                        <input
                          type="checkbox"
                          checked={filteredModalEmps.length > 0 && filteredModalEmps.every(e => selectedEmps.has(e.employee_code))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEmps(prev => {
                                const next = new Set(prev);
                                filteredModalEmps.forEach(emp => next.add(emp.employee_code));
                                return next;
                              });
                            } else {
                              setSelectedEmps(prev => {
                                const next = new Set(prev);
                                filteredModalEmps.forEach(emp => next.delete(emp.employee_code));
                                return next;
                              });
                            }
                          }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                          Select All ({filteredModalEmps.length})
                        </span>
                      </div>
                      {filteredModalEmps.map(emp => (
                        <div
                          key={emp.employee_code}
                          className={`emp-checklist-item ${selectedEmps.has(emp.employee_code) ? 'selected' : ''}`}
                          onClick={() => toggleEmpSelection(emp.employee_code)}
                          style={{ cursor: 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedEmps.has(emp.employee_code)}
                            onChange={() => toggleEmpSelection(emp.employee_code)}
                            onClick={e => e.stopPropagation()}
                          />
                          <div className="emp-check-info">
                            <span className="emp-check-name">{emp.name}</span>
                            <span className="emp-check-meta">{emp.employee_code} | {emp.role} | {emp.office_name}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Remarks */}
              <div className="roster-modal-field">
                <label>Remarks (Optional)</label>
                <textarea
                  rows="2"
                  value={assignRemarks}
                  onChange={e => setAssignRemarks(e.target.value)}
                  placeholder="e.g. Emergency coverage, holiday roster..."
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            <div className="roster-modal-footer">
              <button className="btn-secondary-outline" onClick={() => setShowAssignModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary-gradient"
                onClick={handleBulkAssign}
                disabled={assignSubmitting || selectedEmps.size === 0}
              >
                {assignSubmitting ? (
                  <>
                    <RefreshCw size={14} className="spin-animation" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    Assign {selectedEmps.size} Employee{selectedEmps.size !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {showEditModal && (
        <div className="roster-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="roster-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="roster-modal-header">
              <h3>Edit Shift Assignment</h3>
              <button className="roster-modal-close" onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="roster-modal-body" style={{ gap: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div><strong>Employee:</strong> {editEmployeeName}</div>
                  <div><strong>Code:</strong> {editEmployeeCode}</div>
                  <div style={{ gridColumn: 'span 2', marginTop: '4px' }}><strong>Date:</strong> {editDate}</div>
                </div>
              </div>

              <div className="roster-modal-field">
                <label>Shift Type</label>
                <CustomSelect
                  value={editShiftType}
                  onChange={(e) => {
                    const type = e.target.value;
                    setEditShiftType(type);
                    const cfg = SHIFT_TYPES[type] || {};
                    setEditStartTime(cfg.defaultStart || '');
                    setEditEndTime(cfg.defaultEnd || '');
                  }}
                  options={Object.entries(SHIFT_TYPES).map(([k, v]) => ({
                    value: k,
                    label: `${v.emoji} ${v.label}`
                  }))}
                />
              </div>

              <div className="roster-modal-field">
                <label>Shift Timing (Predefined)</label>
                <div style={{
                  padding: '9px 12px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '38px',
                  boxSizing: 'border-box'
                }}>
                  <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                  <span>
                    {SHIFT_TYPES[editShiftType]?.defaultStart
                      ? `${SHIFT_TYPES[editShiftType].defaultStart} - ${SHIFT_TYPES[editShiftType].defaultEnd}`
                      : 'No timing (Day Off)'}
                  </span>
                </div>
              </div>

              <div className="roster-modal-field">
                <label>Status</label>
                <CustomSelect
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  options={[
                    { value: 'scheduled', label: 'Scheduled' },
                    { value: 'active', label: 'Active' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'cancelled', label: 'Cancelled' }
                  ]}
                />
              </div>

              <div className="roster-modal-field">
                <label>Remarks</label>
                <textarea
                  rows="2"
                  value={editRemarks}
                  onChange={e => setEditRemarks(e.target.value)}
                  placeholder="Additional remarks..."
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            <div className="roster-modal-footer">
              <button className="btn-secondary-outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary-gradient"
                onClick={handleEditSubmit}
                disabled={editSubmitting}
              >
                {editSubmitting ? (
                  <>
                    <RefreshCw size={14} className="spin-animation" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Swap Shifts Modal */}
      {showSwapModal && swapSourceShift && (
        <div className="roster-modal-overlay" onClick={() => setShowSwapModal(false)}>
          <div className="roster-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="roster-modal-header">
              <h3>Swap Shift Assignment</h3>
              <button className="roster-modal-close" onClick={() => setShowSwapModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="roster-modal-body" style={{ gap: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div><strong>Employee:</strong> {swapSourceShift.employee_name}</div>
                  <div><strong>Code:</strong> {swapSourceShift.employee_code}</div>
                  <div><strong>Date:</strong> {swapSourceShift.date}</div>
                  <div><strong>Current Shift:</strong> {SHIFT_TYPES[swapSourceShift.shift_type]?.label || swapSourceShift.shift_type}</div>
                </div>
              </div>

              <div className="roster-modal-field">
                <label>Select Employee to Swap shifts with</label>
                {getSwapCandidates().length === 0 ? (
                  <div style={{ padding: '12px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', fontSize: '13px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} />
                    <span>No other employees assigned on this date to swap with.</span>
                  </div>
                ) : (
                  <CustomSelect
                    value={swapTargetRosterId}
                    onChange={e => setSwapTargetRosterId(e.target.value)}
                    options={[
                      { value: '', label: 'Select employee and shift...' },
                      ...getSwapCandidates().map(c => ({
                        value: String(c.roster_id),
                        label: c.label
                      }))
                    ]}
                  />
                )}
              </div>
            </div>

            <div className="roster-modal-footer">
              <button className="btn-secondary-outline" onClick={() => setShowSwapModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary-gradient"
                onClick={handleSwapSubmit}
                disabled={swapSubmitting || !swapTargetRosterId}
              >
                {swapSubmitting ? (
                  <>
                    <RefreshCw size={14} className="spin-animation" />
                    Swapping...
                  </>
                ) : (
                  <>
                    <ArrowLeftRight size={14} />
                    Swap Shifts
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Timings Configurations Modal */}
      {showConfigModal && (
        <div className="roster-modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="roster-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="roster-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0 }}>Configure Shift Timings</h3>
              </div>
              <button className="roster-modal-close" onClick={() => setShowConfigModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="roster-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Define global standard start and end times for all roster shift types. Timings configured here will automatically apply whenever you assign or edit rosters.
              </div>

              {/* Shift 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 1fr', gap: '16px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px' }}>
                  <span>🔵</span>
                  <span>Shift 1 (Morning)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Start Time</label>
                  <CustomTimeSelect
                    value={configShift1Start}
                    onChange={setConfigShift1Start}
                    placement="bottom"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>End Time</label>
                  <CustomTimeSelect
                    value={configShift1End}
                    onChange={setConfigShift1End}
                    placement="bottom"
                  />
                </div>
              </div>

              {/* Shift 2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 1fr', gap: '16px', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px' }}>
                  <span>🟠</span>
                  <span>Shift 2 (Evening)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Start Time</label>
                  <CustomTimeSelect
                    value={configShift2Start}
                    onChange={setConfigShift2Start}
                    placement="bottom"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>End Time</label>
                  <CustomTimeSelect
                    value={configShift2End}
                    onChange={setConfigShift2End}
                    placement="bottom"
                  />
                </div>
              </div>

              {/* Shift 3 */}
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 1fr', gap: '16px', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px' }}>
                  <span>🟣</span>
                  <span>Shift 3 (Night)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Start Time</label>
                  <CustomTimeSelect
                    value={configShift3Start}
                    onChange={setConfigShift3Start}
                    placement="top"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>End Time</label>
                  <CustomTimeSelect
                    value={configShift3End}
                    onChange={setConfigShift3End}
                    placement="top"
                  />
                </div>
              </div>

              {/* General Shift */}
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 1fr', gap: '16px', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px' }}>
                  <span>🟢</span>
                  <span>General Shift</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Start Time</label>
                  <CustomTimeSelect
                    value={configGeneralStart}
                    onChange={setConfigGeneralStart}
                    placement="top"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>End Time</label>
                  <CustomTimeSelect
                    value={configGeneralEnd}
                    onChange={setConfigGeneralEnd}
                    placement="top"
                  />
                </div>
              </div>
            </div>

            <div className="roster-modal-footer">
              <button className="btn-secondary-outline" onClick={() => setShowConfigModal(false)}>
                Cancel
              </button>
              <button className="btn-primary-gradient" onClick={handleConfigSubmit}>
                <Plus size={14} />
                Save Configurations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL                                  */}
      {/* ═══════════════════════════════════════════════════ */}
      {confirmModal.show && (
        <div className="confirm-overlay" onClick={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: null })}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <AlertTriangle size={28} style={{ color: '#f59e0b', marginBottom: '8px' }} />
            <h4>{confirmModal.title}</h4>
            <p>{confirmModal.message}</p>
            <div className="confirm-actions">
              <button
                className="btn-secondary-outline"
                onClick={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: null })}
              >
                Cancel
              </button>
              <button className="btn-primary-gradient" onClick={confirmModal.onConfirm}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="roster-modal-overlay" onClick={() => { setShowImportModal(false); setImportFile(null); setImportErrors([]); }}>
          <div className="roster-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="roster-modal-header">
              <h3>Import Roster Sheet</h3>
              <button className="roster-modal-close" onClick={() => { setShowImportModal(false); setImportFile(null); setImportErrors([]); }}>
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleImportRoster}>
              <div className="roster-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#6b21a8' }}>
                  <strong>Prerequisites:</strong> Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file specifying the roster.
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Ensure columns: <code>employee_code</code>, <code>shift_date</code>, <code>shift_type</code></span>
                    <button type="button" onClick={downloadCSVTemplate} style={{ color: '#9333ea', background: 'none', border: 'none', textDecoration: 'underline', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}>
                      Download CSV Template
                    </button>
                  </div>
                </div>

                <div className="roster-modal-field">
                  <label>Select Project</label>
                  <CustomSelect
                    value={importProject}
                    onChange={(e) => setImportProject(e.target.value)}
                    options={projects.map(p => ({ value: p, label: p }))}
                    placeholder="Select Project"
                  />
                </div>

                <div className="roster-modal-field">
                  <label>Select File</label>
                  <input 
                    type="file" 
                    accept=".csv, .xlsx, .xls"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setImportFile(e.target.files[0]);
                      }
                    }}
                    style={{ padding: '8px', border: '1px dashed #cbd5e1', borderRadius: '6px', background: '#f8fafc', width: '100%' }}
                  />
                  {importFile && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      Selected: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                {importErrors.length > 0 && (
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', padding: '8px 12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ color: '#991b1b', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <AlertTriangle size={14} />
                      <span>Roster Overlap Conflicts Detected:</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: '#b91c1c', fontSize: '11px', lineHeight: '1.4' }}>
                      {importErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="roster-modal-footer">
                <button type="button" className="btn-secondary-outline" onClick={() => { setShowImportModal(false); setImportFile(null); setImportErrors([]); }}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary-gradient" 
                  disabled={importSubmitting || !importFile}
                >
                  {importSubmitting ? (
                    <>
                      <RefreshCw size={14} className="spin-animation" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Upload & Apply
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
