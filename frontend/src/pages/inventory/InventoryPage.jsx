import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  Plus, Search, Edit, Trash2, ChevronLeft, ChevronRight, Layers, ChevronDown, ChevronUp
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
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

export default function InventoryPage() {
  const {
    officeInventory, fetchOfficeInventory, loadingOfficeInventory,
    officeInitProject, setOfficeInitProject,
    officeInitOffice, setOfficeInitOffice,
    officeInitOfficesList, setOfficeInitOfficesList,
    officeInitQuantities, setOfficeInitQuantities,
    updateBatchRow, addBatchRow, removeBatchRow,
    transitInventory, userRole, userOffice, userProject,
    drugs, projects, selectedProject, setSelectedProject,
    selectedShiftItems, fetchInitOffices, shiftStatus
  } = useApp();

  // Local state for layout/display
  const [showOfficeInventoryModal, setShowOfficeInventoryModal] = useState(false);
  const [officeInventorySearch, setOfficeInventorySearch] = useState('');
  const [officeInventoryPage, setOfficeInventoryPage] = useState(1);
  const [officeInventoryPageSize, setOfficeInventoryPageSize] = useState(10);
  const [officeInitSearch, setOfficeInitSearch] = useState('');
  const [officeInitPage, setOfficeInitPage] = useState(1);
  const [officeInitPageSize, setOfficeInitPageSize] = useState(10);
  const [expandedGroups, setExpandedGroups] = useState({});

  // Filters logic
  const filteredInventory = officeInventory.filter(item => {
    const term = officeInventorySearch.toLowerCase();
    return (
      !officeInventorySearch ||
      (item.item_name || '').toLowerCase().includes(term) ||
      (item.item_code || '').toLowerCase().includes(term) ||
      (item.batch_number || '').toLowerCase().includes(term)
    );
  });

  // Group by item_code (or item_name)
  const groupedInventory = [];
  const groups = {};
  filteredInventory.forEach(item => {
    const key = item.item_code || item.item_name;
    if (!groups[key]) {
      groups[key] = {
        item_name: item.item_name,
        item_code: item.item_code,
        batches: []
      };
      groupedInventory.push(groups[key]);
    }
    groups[key].batches.push(item);
  });

  const totalInventoryItems = groupedInventory.length;
  const totalInventoryPages = Math.ceil(totalInventoryItems / officeInventoryPageSize);
  const displayInventoryPage = officeInventoryPage > totalInventoryPages && totalInventoryPages > 0 ? 1 : officeInventoryPage;
  const paginatedInventoryGroups = groupedInventory.slice(
    (displayInventoryPage - 1) * officeInventoryPageSize,
    displayInventoryPage * officeInventoryPageSize
  );

  const seenCodes = new Set();
  const uniqueProjDrugs = [];
  drugs.forEach(d => {
    if (d.project === officeInitProject && d.is_active) {
      if (!seenCodes.has(d.item_code)) {
        seenCodes.add(d.item_code);
        uniqueProjDrugs.push(d);
      }
    }
  });
  const filteredConfig = uniqueProjDrugs.filter(d => 
    !officeInitSearch ||
    d.item_name.toLowerCase().includes(officeInitSearch.toLowerCase()) ||
    d.item_code.toLowerCase().includes(officeInitSearch.toLowerCase())
  );
  const totalConfigDrugs = filteredConfig.length;
  const totalConfigPages = Math.ceil(totalConfigDrugs / officeInitPageSize);
  const displayConfigPage = officeInitPage > totalConfigPages && totalConfigPages > 0 ? 1 : officeInitPage;
  const paginatedConfig = filteredConfig.slice(
    (displayConfigPage - 1) * officeInitPageSize,
    displayConfigPage * officeInitPageSize
  );

  useEffect(() => {
    const defaultProj = userProject || (projects.length > 0 ? projects[0] : '');
    if (defaultProj && !officeInitProject) {
      setOfficeInitProject(defaultProj);
    }
  }, [userProject, projects, officeInitProject, setOfficeInitProject]);

  useEffect(() => {
    const defaultOff = userOffice?.name && userOffice.name !== 'N/A' ? userOffice.name : '';
    if (defaultOff && !officeInitOffice) {
      setOfficeInitOffice(defaultOff);
    } else if (!defaultOff && officeInitOfficesList.length > 0 && !officeInitOffice) {
      setOfficeInitOffice(officeInitOfficesList[0].name);
    }
  }, [userOffice, officeInitOfficesList, officeInitOffice, setOfficeInitOffice]);

  useEffect(() => {
    if (officeInitProject && officeInitOffice) {
      fetchOfficeInventory(officeInitProject, officeInitOffice);
    }
  }, [officeInitProject, officeInitOffice]);

  return (
    <div className="tab-pane" style={{ animation: 'fadeIn 0.2s ease-out', width: '100%' }}>
      {!showOfficeInventoryModal ? (
        <>
          <div className="section-header-flex" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
            <div className="section-header-left">
              <h2>Local facility Inventory</h2>
            </div>

            
            {(userRole === 'admin' || userRole.toLowerCase().includes('operator') || userRole.toLowerCase().includes('manager')) && (
              <button 
                type="button"
                className="action-btn-primary"
                disabled={officeInventory.length > 0}
                onClick={() => {
                  const defaultProj = userProject || (projects.length > 0 ? projects[0] : '');
                  const defaultOff = userOffice?.name && userOffice.name !== 'N/A' ? userOffice.name : '';
                  setOfficeInitProject(defaultProj);
                  setOfficeInitOffice(defaultOff);
                  setOfficeInitSearch('');
                  setOfficeInitPage(1);
                  setOfficeInventoryPage(1);
                  
                  const draftKey = `opening_stock_draft_${defaultProj}_${defaultOff}`;
                  const savedDraft = localStorage.getItem(draftKey);
                  if (savedDraft) {
                    try {
                      setOfficeInitQuantities(JSON.parse(savedDraft));
                      toast.success("Loaded unsaved draft progress.");
                    } catch (e) {
                      console.error(e);
                    }
                  } else {
                    const initialObj = {};
                    const seenCodesInner = new Set();
                    drugs.forEach(d => {
                      if (d.project === defaultProj) {
                        if (!seenCodesInner.has(d.item_code)) {
                          seenCodesInner.add(d.item_code);
                          initialObj[d.id] = [{
                            batch_number: '',
                            expiry_date: d.expiry_date || '',
                            manufacturing_date: d.manufacturing_date || '',
                            opening_stock: ''
                          }];
                        }
                      }
                    });
                    setOfficeInitQuantities(initialObj);
                  }
                  setShowOfficeInventoryModal(true);
                }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  opacity: officeInventory.length > 0 ? 0.6 : 1,
                  cursor: officeInventory.length > 0 ? 'not-allowed' : 'pointer'
                }}
                title={officeInventory.length > 0 ? "Opening stock has already been initialized for this project/office." : ""}
              >
                <Plus size={16} />
                <span>Configure Opening Stock</span>
              </button>
            )}
          </div>

          {/* Filter Section */}
          <div className="filters-card" style={{
            display: 'flex',
            gap: '16px',
            padding: '16px 20px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '20px',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '200px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap' }}>Project Site:</span>
              <CustomSelect
                value={officeInitProject || selectedProject}
                disabled={userRole !== 'admin'}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedProject(val);
                  setOfficeInitProject(val);
                  fetchOfficeInventory(val, '');
                }}
                options={
                  userRole === 'admin' 
                    ? projects.map(proj => ({ value: proj, label: proj }))
                    : [{ value: userProject, label: userProject }]
                }
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap' }}>Facility / Office:</span>
              <CustomSelect
                value={officeInitOffice}
                disabled={userRole !== 'admin'}
                onChange={(e) => {
                  const val = e.target.value;
                  setOfficeInitOffice(val);
                  fetchOfficeInventory(officeInitProject || selectedProject, val);
                }}
                options={
                  userRole === 'admin' ? [
                    { value: '', label: 'All Facilities' },
                    ...officeInitOfficesList.map(o => ({ value: o.name, label: o.name }))
                  ] : [
                    { value: userOffice?.name || '', label: userOffice?.name || 'N/A' }
                  ]
                }
              />
            </div>

            <div style={{ flex: '1', display: 'flex', justifyContent: 'flex-end' }}>
              <input 
                type="text" 
                placeholder="Search inventory..." 
                value={officeInventorySearch}
                onChange={(e) => setOfficeInventorySearch(e.target.value)}
                style={{ padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '220px' }}
              />
            </div>
          </div>

          <div className="heavy-table-card">
            {loadingOfficeInventory ? (
               <table className="portal-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>S.No.</th>
                      <th>Material / Code</th>
                      <th style={{ width: '100px' }}>Batch Code</th>
                      <th style={{ width: '100px' }}>MFG Date</th>
                      <th style={{ width: '100px' }}>Expiry Date</th>
                      <th style={{ width: '80px', textAlign: 'right' }}>OB</th>
                      <th style={{ width: '90px', textAlign: 'right' }}>Received (+)</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Sent Back (-)</th>
                      <th style={{ width: '110px', textAlign: 'right' }}>Consumed (To Bag) (-)</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Closing (=)</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map(idx => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center' }}><div className="skeleton" style={{ width: '20px', height: '20px', margin: '0 auto', borderRadius: '4px' }}></div></td>
                        <td><div className="skeleton" style={{ width: '200px', height: '20px', borderRadius: '4px' }}></div></td>
                        <td><div className="skeleton" style={{ width: '80px', height: '20px', borderRadius: '4px' }}></div></td>
                        <td><div className="skeleton" style={{ width: '80px', height: '20px', borderRadius: '4px' }}></div></td>
                        <td><div className="skeleton" style={{ width: '80px', height: '20px', borderRadius: '4px' }}></div></td>
                        <td><div className="skeleton" style={{ width: '40px', height: '20px', borderRadius: '4px', marginLeft: 'auto' }}></div></td>
                        <td><div className="skeleton" style={{ width: '40px', height: '20px', borderRadius: '4px', marginLeft: 'auto' }}></div></td>
                        <td><div className="skeleton" style={{ width: '40px', height: '20px', borderRadius: '4px', marginLeft: 'auto' }}></div></td>
                        <td><div className="skeleton" style={{ width: '40px', height: '20px', borderRadius: '4px', marginLeft: 'auto' }}></div></td>
                        <td><div className="skeleton" style={{ width: '40px', height: '20px', borderRadius: '4px', marginLeft: 'auto' }}></div></td>
                        <td><div className="skeleton" style={{ width: '70px', height: '24px', borderRadius: '12px', margin: '0 auto' }}></div></td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            ) : officeInventory.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                No inventory balances found. Setup opening stock using the "Configure Opening Stock" button above.
              </div>
            ) : (
               <table className="portal-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>S.No.</th>
                      <th>Material / Code</th>
                      <th style={{ width: '100px' }}>Batch Code</th>
                      <th style={{ width: '100px' }}>MFG Date</th>
                      <th style={{ width: '100px' }}>Expiry Date</th>
                      <th style={{ width: '80px', textAlign: 'right' }}>OB</th>
                      <th style={{ width: '90px', textAlign: 'right' }}>Received (+)</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Sent Back (-)</th>
                      <th style={{ width: '110px', textAlign: 'right' }}>Consumed (To Bag) (-)</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Closing (=)</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInventoryGroups.length === 0 ? (
                      <tr>
                        <td colSpan="11" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                          No matching records found.
                        </td>
                      </tr>
                    ) : (
                      paginatedInventoryGroups.map((group, groupIdx) => {
                        let totalOB = 0;
                        let totalReceived = 0;
                        let totalSentBack = 0;
                        let totalConsumed = 0;
                        let totalClosing = 0;
                        let hasExpired = false;
                        let hasLow = false;

                        const batchRows = group.batches.map(item => {
                          const isExpired = item.expiry_date && new Date(item.expiry_date) < new Date();
                          if (isExpired) hasExpired = true;
                          
                          const stock = Math.round(item.quantity || 0);
                          const val = selectedShiftItems[item.drug_id];
                          let receivedVal = 0;
                          let sentBackVal = 0;
                          if (shiftStatus === 'active') {
                            if (typeof val === 'object' && val !== null) {
                              receivedVal = Math.round(parseFloat(val.received) || 0);
                              sentBackVal = Math.round(parseFloat(val.sent_back) || 0);
                            }
                          }
                          
                          const transitItem = transitInventory.find(t => t.drug_id === item.drug_id && t.quantity > 0);
                          const transitQty = transitItem ? Math.round(transitItem.quantity) : 0;

                          let isDrawnThisShift = false;
                          if (shiftStatus === 'active' && transitItem) {
                            if (transitItem.is_drawn_this_shift !== undefined) {
                              isDrawnThisShift = transitItem.is_drawn_this_shift;
                            } else if (transitItem.created_at) {
                              const createdDate = new Date(transitItem.created_at);
                              const diffMs = new Date() - createdDate;
                              const diffHours = diffMs / (1000 * 60 * 60);
                              if (diffHours < 16) {
                                isDrawnThisShift = true;
                              }
                            }
                          }
                          
                          const officeOB = Math.max(0, stock - receivedVal + sentBackVal + (isDrawnThisShift ? transitQty : 0));
                          const officeReceived = receivedVal;
                          const officeSentBack = sentBackVal;
                          const officeConsumed = isDrawnThisShift ? transitQty : 0;
                          const officeClosing = Math.max(0, officeOB + officeReceived - officeSentBack - officeConsumed);

                          totalOB += officeOB;
                          totalReceived += officeReceived;
                          totalSentBack += officeSentBack;
                          totalConsumed += officeConsumed;
                          totalClosing += officeClosing;

                          if (officeClosing <= 10) {
                            hasLow = true;
                          }

                          return {
                            item,
                            isExpired,
                            officeOB,
                            officeReceived,
                            officeSentBack,
                            officeConsumed,
                            officeClosing
                          };
                        });

                        const parentBadgeBg = hasExpired ? '#fee2e2' : (hasLow ? '#fffbeb' : '#ecfdf5');
                        const parentBadgeColor = hasExpired ? '#dc2626' : (hasLow ? '#d97706' : '#059669');
                        const parentBadgeText = hasExpired ? 'Expired' : (hasLow ? 'Low Stock' : 'Good');

                        const parentSNo = ((displayInventoryPage - 1) * officeInventoryPageSize) + groupIdx + 1;

                        return (
                          <React.Fragment key={group.item_code || group.item_name}>
                            {/* Parent row: Material / Item Code Summary */}
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                              <td style={{ textAlign: 'center', fontWeight: '750', color: '#1e293b' }}>
                                {parentSNo}
                              </td>
                              <td>
                                <div style={{ fontWeight: '805', color: '#0f172a', fontSize: '13px' }}>{group.item_name}</div>
                                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b', marginTop: '2px' }}>Code: {group.item_code}</div>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const key = group.item_code || group.item_name;
                                    setExpandedGroups(prev => ({
                                      ...prev,
                                      [key]: !prev[key]
                                    }));
                                  }}
                                  style={{ 
                                    fontSize: '11.5px', 
                                    color: '#475569', 
                                    fontWeight: '600', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '6px', 
                                    backgroundColor: '#e2e8f0', 
                                    padding: '4px 10px', 
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#cbd5e1';
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e2e8f0';
                                  }}
                                >
                                  <Layers size={11} /> {group.batches.length} {group.batches.length === 1 ? 'Batch' : 'Batches'}
                                  {expandedGroups[group.item_code || group.item_name] ? (
                                    <ChevronUp size={11} style={{ marginLeft: '2px', color: '#64748b' }} />
                                  ) : (
                                    <ChevronDown size={11} style={{ marginLeft: '2px', color: '#64748b' }} />
                                  )}
                                </button>
                              </td>
                              <td style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>—</td>
                              <td style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>—</td>
                              <td style={{ textAlign: 'right', fontWeight: '700', color: '#334155', fontSize: '12.5px' }}>{totalOB}</td>
                              <td style={{ textAlign: 'right', fontWeight: '700', color: totalReceived > 0 ? '#16a34a' : '#94a3b8', fontSize: '12.5px' }}>
                                {totalReceived > 0 ? totalReceived : '-'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: '700', color: totalSentBack > 0 ? '#dc2626' : '#94a3b8', fontSize: '12.5px' }}>
                                {totalSentBack > 0 ? totalSentBack : '-'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: '700', color: totalConsumed > 0 ? '#ea580c' : '#94a3b8', fontSize: '12.5px' }}>
                                {totalConsumed > 0 ? totalConsumed : '-'}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '850', color: totalClosing > 0 ? 'var(--primary-dark)' : '#e11d48', fontSize: '13px' }}>
                                {totalClosing}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '3px 7px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  backgroundColor: parentBadgeBg,
                                  color: parentBadgeColor
                                }}>
                                  {parentBadgeText}
                                </span>
                              </td>
                            </tr>

                            {/* Sub-rows: Individual Batch Details */}
                            {expandedGroups[group.item_code || group.item_name] && batchRows.map(({ item, isExpired, officeOB, officeReceived, officeSentBack, officeConsumed, officeClosing }) => {
                              const batchIsLow = officeClosing <= 10;
                              const batchBadgeBg = isExpired ? '#fee2e2' : (batchIsLow ? '#fffbeb' : '#ecfdf5');
                              const batchBadgeColor = isExpired ? '#dc2626' : (batchIsLow ? '#d97706' : '#059669');
                              const batchBadgeText = isExpired ? 'Expired' : (batchIsLow ? 'Low Stock' : 'Good');

                              return (
                                <tr key={item.id} style={{ borderBottom: '1px solid #cbd5e1', backgroundColor: '#ffffff' }}>
                                  <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                                    ↳
                                  </td>
                                  <td style={{ paddingLeft: '24px' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontStyle: 'italic', fontWeight: '500' }}>Batch Specification</span>
                                    </div>
                                  </td>
                                  <td>
                                    <code style={{ fontSize: '11.5px', fontFamily: 'monospace', fontWeight: '750', padding: '3px 7px', backgroundColor: '#eff6ff', borderRadius: '4px', color: '#1e40af' }}>
                                      {item.batch_number || 'Global'}
                                    </code>
                                  </td>
                                  <td style={{ color: '#475569', fontSize: '12.5px' }}>{item.manufacturing_date || 'N/A'}</td>
                                  <td style={{ color: '#475569', fontSize: '12.5px' }}>{item.expiry_date || 'N/A'}</td>
                                  <td style={{ textAlign: 'right', fontWeight: '600', color: '#475569', fontSize: '12.5px' }}>{officeOB}</td>
                                  <td style={{ textAlign: 'right', fontWeight: '600', color: officeReceived > 0 ? '#16a34a' : '#94a3b8', fontSize: '12.5px' }}>
                                    {officeReceived > 0 ? officeReceived : '-'}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: '600', color: officeSentBack > 0 ? '#dc2626' : '#94a3b8', fontSize: '12.5px' }}>
                                    {officeSentBack > 0 ? officeSentBack : '-'}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: '600', color: officeConsumed > 0 ? '#f59e0b' : '#94a3b8', fontSize: '12.5px' }}>
                                    {officeConsumed > 0 ? officeConsumed : '-'}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '750', color: officeClosing > 0 ? 'var(--primary-dark)' : '#e11d48', fontSize: '13px' }}>
                                    {officeClosing}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '2.5px 6.5px',
                                      borderRadius: '6px',
                                      fontSize: '10px',
                                      fontWeight: '700',
                                      backgroundColor: batchBadgeBg,
                                      color: batchBadgeColor
                                    }}>
                                      {batchBadgeText}
                                    </span>
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
            )}
          </div>

          {/* Pagination Row for Inventory */}
          {totalInventoryItems > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 4px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Showing {((displayInventoryPage - 1) * officeInventoryPageSize) + 1} to {Math.min(displayInventoryPage * officeInventoryPageSize, totalInventoryItems)} of {totalInventoryItems} records
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Rows per page:</span>
                  <CustomSelect
                    value={officeInventoryPageSize}
                    onChange={(e) => {
                      setOfficeInventoryPageSize(Number(e.target.value));
                      setOfficeInventoryPage(1);
                    }}
                    options={[
                      { value: 10, label: '10' },
                      { value: 20, label: '20' },
                      { value: 50, label: '50' }
                    ]}
                    compact={true}
                    placement="top"
                    style={{ width: '80px' }}
                  />
                </div>
                {totalInventoryPages > 1 && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="filter-btn"
                      disabled={displayInventoryPage === 1}
                      onClick={() => setOfficeInventoryPage(prev => Math.max(prev - 1, 1))}
                      style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {(() => {
                      const pages = [];
                      if (totalInventoryPages <= 7) {
                        for (let i = 1; i <= totalInventoryPages; i++) pages.push(i);
                      } else {
                        pages.push(1);
                        if (displayInventoryPage > 3) pages.push('...');
                        const start = Math.max(2, displayInventoryPage - 1);
                        const end = Math.min(totalInventoryPages - 1, displayInventoryPage + 1);
                        for (let i = start; i <= end; i++) pages.push(i);
                        if (displayInventoryPage < totalInventoryPages - 2) pages.push('...');
                        pages.push(totalInventoryPages);
                      }
                      return pages.map((p, idx) => {
                        if (p === '...') {
                          return <span key={`ellipsis-inv-${idx}`} style={{ color: '#94a3b8', padding: '0 8px', fontSize: '13px', alignSelf: 'center' }}>...</span>;
                        }
                        return (
                          <button
                            key={p}
                            type="button"
                            className={`filter-btn ${displayInventoryPage === p ? 'active' : ''}`}
                            onClick={() => setOfficeInventoryPage(p)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: displayInventoryPage === p ? '#d81159' : '#ffffff',
                              color: displayInventoryPage === p ? '#ffffff' : '#1e293b',
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
                      disabled={displayInventoryPage === totalInventoryPages}
                      onClick={() => setOfficeInventoryPage(prev => Math.min(prev + 1, totalInventoryPages))}
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
      ) : (
        /* Configure View - Full Page */
        <div className="opening-stock-config-container">
          <div className="section-header-flex" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
            <div className="section-header-left">
              <h2>Setup Opening Stock</h2>
              <p>Initialize manual buffer balances for materials at your project's storehouse.</p>
            </div>

            <button 
              type="button" 
              className="opening-stock-back-btn" 
              onClick={() => setShowOfficeInventoryModal(false)}
            >
              <ChevronLeft size={16} />
              <span>Back to Inventory</span>
            </button>
          </div>

          {/* Filters Row */}
          <div className="opening-stock-filters">
            <div className="opening-stock-filter-group">
              <label className="opening-stock-filter-label">Project Scope</label>
              <CustomSelect
                value={officeInitProject}
                disabled={userRole !== 'admin'}
                onChange={(e) => {
                  const proj = e.target.value;
                  setOfficeInitProject(proj);
                  const draftKey = `opening_stock_draft_${proj}_${officeInitOffice}`;
                  const savedDraft = localStorage.getItem(draftKey);
                  if (savedDraft) {
                    try {
                      setOfficeInitQuantities(JSON.parse(savedDraft));
                      toast.success("Loaded unsaved draft progress.");
                      return;
                    } catch (err) {
                      console.error(err);
                    }
                  }
                  const initialObj = {};
                  const seenCodesInner = new Set();
                  drugs.forEach(d => {
                    if (d.project === proj) {
                      if (!seenCodesInner.has(d.item_code)) {
                        seenCodesInner.add(d.item_code);
                        initialObj[d.id] = [{
                          batch_number: '',
                          expiry_date: d.expiry_date || '',
                          manufacturing_date: d.manufacturing_date || '',
                          opening_stock: ''
                        }];
                      }
                    }
                  });
                  setOfficeInitQuantities(initialObj);
                }}
                options={
                  userRole === 'admin'
                    ? projects.map(proj => ({ value: proj, label: proj }))
                    : [{ value: userProject, label: userProject }]
                }
              />
            </div>
            <div className="opening-stock-filter-group">
              <label className="opening-stock-filter-label">Facility / Office</label>
              <CustomSelect
                value={officeInitOffice}
                disabled={userRole !== 'admin'}
                onChange={(e) => {
                  const off = e.target.value;
                  setOfficeInitOffice(off);
                  const draftKey = `opening_stock_draft_${officeInitProject}_${off}`;
                  const savedDraft = localStorage.getItem(draftKey);
                  if (savedDraft) {
                    try {
                      setOfficeInitQuantities(JSON.parse(savedDraft));
                      toast.success("Loaded unsaved draft progress.");
                    } catch (err) {
                      console.error(err);
                    }
                  }
                }}
                options={
                  userRole === 'admin' ? [
                    { value: '', label: '-- Choose Facility --' },
                    ...officeInitOfficesList.map(o => ({ value: o.name, label: o.name }))
                  ] : [
                    { value: userOffice?.name || '', label: userOffice?.name || 'N/A' }
                  ]
                }
              />
            </div>
          </div>

          {/* Grid Input Items */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>Grid Input Items</h3>
              <div className="opening-stock-search-wrapper">
                <input
                  type="text"
                  placeholder="Filter list..."
                  value={officeInitSearch}
                  onChange={(e) => {
                    setOfficeInitSearch(e.target.value);
                    setOfficeInitPage(1);
                  }}
                  className="opening-stock-search-input"
                />
                <Search size={16} className="opening-stock-search-icon" />
              </div>
            </div>

            <div className="opening-stock-table-card">
              <table className="portal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: '5%', textAlign: 'center' }}>S.No.</th>
                    <th style={{ width: '35%' }}>Item Details</th>
                    <th>Custom Batches / Stock Configuration</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedConfig.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                        No active materials found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedConfig.map((d, index) => {
                      const rows = officeInitQuantities[d.id] || [{ batch_number: '', expiry_date: d.expiry_date || '', manufacturing_date: d.manufacturing_date || '', opening_stock: '' }];
                      return (
                        <tr key={d.id}>
                          <td style={{ textAlign: 'center', fontWeight: '600', color: '#64748b', verticalAlign: 'top', paddingTop: '18px' }}>
                            {((displayConfigPage - 1) * officeInitPageSize) + index + 1}
                          </td>
                          <td style={{ verticalAlign: 'top', paddingTop: '18px' }}>
                            <div className="opening-stock-item-info">
                              <span className="opening-stock-item-name">{d.item_name}</span>
                              <span className="opening-stock-item-meta">Code: <code>{d.item_code}</code></span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
                              {rows.map((row, idx) => (
                                <div key={idx} className="batch-config-row-card">
                                  <div className="batch-config-field">
                                    <span>Batch Number</span>
                                    <input 
                                      type="text" 
                                      placeholder="Batch Code" 
                                      value={row.batch_number} 
                                      onChange={(e) => updateBatchRow(d.id, idx, 'batch_number', e.target.value)} 
                                      className="batch-config-input"
                                      style={{ width: '145px' }}
                                    />
                                  </div>
                                  <div className="batch-config-field">
                                    <span>MFG Date</span>
                                    <input 
                                      type="date" 
                                      value={formatDateForInput(row.manufacturing_date)} 
                                      onChange={(e) => updateBatchRow(d.id, idx, 'manufacturing_date', e.target.value)} 
                                      className="batch-config-input"
                                      style={{ width: '135px' }}
                                    />
                                  </div>
                                  <div className="batch-config-field">
                                    <span>Expiry Date</span>
                                    <input 
                                      type="date" 
                                      value={formatDateForInput(row.expiry_date)} 
                                      onChange={(e) => updateBatchRow(d.id, idx, 'expiry_date', e.target.value)} 
                                      className="batch-config-input"
                                      style={{ width: '135px' }}
                                    />
                                  </div>
                                  <div className="batch-config-field">
                                    <span>Opening Qty</span>
                                    <input 
                                      type="number" 
                                      placeholder="0.00" 
                                      min="0" 
                                      step="0.01" 
                                      value={row.opening_stock} 
                                      onChange={(e) => updateBatchRow(d.id, idx, 'opening_stock', e.target.value)} 
                                      className="batch-config-input"
                                      style={{ width: '100px', textAlign: 'right', fontWeight: '700' }}
                                    />
                                  </div>
                                  {rows.length > 1 && (
                                    <button 
                                      type="button" 
                                      onClick={() => removeBatchRow(d.id, idx)} 
                                      className="remove-batch-btn"
                                      title="Delete Batch Row"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button 
                                type="button" 
                                onClick={() => addBatchRow(d.id)} 
                                className="add-batch-btn"
                              >
                                <Plus size={13} /> <span>Add Another Batch Row</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Pagination Row for Configuration */}
              {totalConfigDrugs > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '16px 12px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    Showing {((displayConfigPage - 1) * officeInitPageSize) + 1} to {Math.min(displayConfigPage * officeInitPageSize, totalConfigDrugs)} of {totalConfigDrugs} materials
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Rows per page:</span>
                      <CustomSelect
                        value={officeInitPageSize}
                        onChange={(e) => {
                          setOfficeInitPageSize(Number(e.target.value));
                          setOfficeInitPage(1);
                        }}
                        options={[
                          { value: 10, label: '10' },
                          { value: 20, label: '20' },
                          { value: 50, label: '50' }
                        ]}
                        compact={true}
                        placement="top"
                        style={{ width: '80px' }}
                      />
                    </div>
                    {totalConfigPages > 1 && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="filter-btn"
                          disabled={displayConfigPage === 1}
                          onClick={() => setOfficeInitPage(prev => Math.max(prev - 1, 1))}
                          style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        {(() => {
                          const pages = [];
                          if (totalConfigPages <= 7) {
                            for (let i = 1; i <= totalConfigPages; i++) pages.push(i);
                          } else {
                            pages.push(1);
                            if (displayConfigPage > 3) pages.push('...');
                            const start = Math.max(2, displayConfigPage - 1);
                            const end = Math.min(totalConfigPages - 1, displayConfigPage + 1);
                            for (let i = start; i <= end; i++) pages.push(i);
                            if (displayConfigPage < totalConfigPages - 2) pages.push('...');
                            pages.push(totalConfigPages);
                          }
                          return pages.map((p, idx) => {
                            if (p === '...') {
                              return <span key={`ellipsis-cfg-${idx}`} style={{ color: '#94a3b8', padding: '0 8px', fontSize: '13px', alignSelf: 'center' }}>...</span>;
                            }
                            return (
                              <button
                                key={p}
                                type="button"
                                className={`filter-btn ${displayConfigPage === p ? 'active' : ''}`}
                                onClick={() => setOfficeInitPage(p)}
                                style={{
                                  padding: '6px 14px',
                                  backgroundColor: displayConfigPage === p ? '#d81159' : '#ffffff',
                                  color: displayConfigPage === p ? '#ffffff' : '#1e293b',
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
                          disabled={displayConfigPage === totalConfigPages}
                          onClick={() => setOfficeInitPage(prev => Math.min(prev + 1, totalConfigPages))}
                          style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Controls */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '20px', borderTop: '1px solid #f1f5f9', gap: '12px' }}>
            <button
              type="button"
              className="opening-stock-cancel-btn"
              onClick={() => setShowOfficeInventoryModal(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              className="opening-stock-draft-btn"
              onClick={() => {
                if (!officeInitOffice) {
                  toast.error("Please select a facility/office before saving a draft.");
                  return;
                }
                localStorage.setItem(`opening_stock_draft_${officeInitProject}_${officeInitOffice}`, JSON.stringify(officeInitQuantities));
                toast.success("Progress saved as draft locally!");
              }}
            >
              Save Draft
            </button>

            <button
              type="button"
              className="opening-stock-save-btn"
              onClick={async () => {
                if (!officeInitOffice) {
                  toast.error("Please select a facility/office.");
                  return;
                }

                const itemsToInit = [];
                Object.entries(officeInitQuantities).forEach(([id, rows]) => {
                  if (Array.isArray(rows)) {
                    rows.forEach(row => {
                      const qty = parseFloat(row.opening_stock);
                      if (!isNaN(qty) && qty >= 0) {
                        itemsToInit.push({
                          drug_id: parseInt(id),
                          opening_stock: qty,
                          batch_number: row.batch_number || undefined,
                          expiry_date: row.expiry_date || undefined,
                          manufacturing_date: row.manufacturing_date || undefined
                        });
                      }
                    });
                  }
                });

                if (itemsToInit.length === 0) {
                  toast.error("Please enter opening stock quantity for at least one item.");
                  return;
                }

                try {
                  const data = await api.inventory.initInventory(officeInitProject, officeInitOffice, itemsToInit);
                  toast.success(data.message || "Successfully configured local stock!");
                  localStorage.removeItem(`opening_stock_draft_${officeInitProject}_${officeInitOffice}`);
                  setShowOfficeInventoryModal(false);
                  fetchOfficeInventory(officeInitProject, officeInitOffice);
                } catch (err) {
                  console.error(err);
                  toast.error(err.message || "Failed to initialize opening stock.");
                }
              }}
            >
              Confirm Setup & Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
