import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  TrendingUp, Pill, Database, AlertTriangle, Search, RefreshCw, 
  Building, Calendar, Layers, MapPin, BarChart3, Clock, 
  ArrowUpDown, Compass, CheckCircle2, XCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';

export default function AnalyticsPage() {
  const { user, userRole, projects, userProject } = useApp();

  // Route protection
  const isAuthorized = userRole === 'admin' || userRole === 'project_manager' || userRole === 'supervisor';

  // Filters State
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedOffice, setSelectedOffice] = useState('Whole Project');
  const [offices, setOffices] = useState([]);
  
  // Data State
  const [inventoryList, setInventoryList] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // UI Controls State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('quantity'); // 'quantity', 'expiry', 'name'
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [projectConfigs, setProjectConfigs] = useState([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [hoveredBar, setHoveredBar] = useState(null);

  // Fetch configs for the project/threshold setting
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const configs = await api.projects.getConfigs();
        setProjectConfigs(configs);
        const match = configs.find(c => c.project_name === (userRole === 'admin' ? selectedProject : userProject));
        if (match) {
          setLowStockThreshold(match.low_stock_threshold || 10);
        } else {
          setLowStockThreshold(10);
        }
      } catch (err) {
        console.error("Error fetching project configs:", err);
      }
    };
    const targetProj = userRole === 'admin' ? selectedProject : userProject;
    if (targetProj) {
      fetchConfigs();
    }
  }, [selectedProject, userProject, userRole]);

  const handleSaveThreshold = async () => {
    const currentProj = userRole === 'admin' ? selectedProject : userProject;
    if (!currentProj) return;
    setSavingThreshold(true);
    try {
      const match = projectConfigs.find(c => c.project_name === currentProj) || {};
      const skipRoles = match.skip_roles || '';
      const stopRole = match.stop_role || null;
      await api.projects.saveConfig(currentProj, skipRoles, stopRole, lowStockThreshold);
      // Refresh configs
      const configs = await api.projects.getConfigs();
      setProjectConfigs(configs);
      toast.success('Low stock threshold saved successfully!');
    } catch (err) {
      console.error("Error saving low stock threshold:", err);
      toast.error('Failed to save low stock threshold.');
    } finally {
      setSavingThreshold(false);
    }
  };
  // Reset pagination when controls change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortBy, sortOrder, selectedProject, selectedOffice]);

  // Load Projects and Offices (Admin)
  useEffect(() => {
    const defaultProj = userProject || (projects.length > 0 ? projects[0] : '');
    if (defaultProj && !selectedProject) {
      setSelectedProject(defaultProj);
    }
  }, [userProject, projects, selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      const fetchOffices = async () => {
        try {
          const data = await api.projects.getOffices(selectedProject);
          setOffices(data);
        } catch (err) {
          console.error("Error fetching offices:", err);
          setOffices([]);
        }
      };
      fetchOffices();
    } else {
      setOffices([]);
    }
    // Non-admin will have their office resolved by current user info in the backend
    if (userRole !== 'admin') {
      setSelectedOffice('');
    } else {
      setSelectedOffice('Whole Project');
    }
  }, [selectedProject, userRole]);

  // Fetch Inventory Data
  const fetchAnalyticsData = async () => {
    if (!selectedProject && userRole === 'admin') return;
    setLoading(true);
    try {
      let data = [];
      const currentProj = userRole === 'admin' ? selectedProject : userProject;
      if (selectedOffice === 'Whole Project') {
        // Fetch project-wide drug masters when "Whole Project" is selected
        const rawDrugs = await api.drugs.getDrugs(currentProj);
        data = (rawDrugs || [])
          .filter(d => d.is_active !== false)
          .map(d => ({
            id: d.id,
            drug_id: d.id,
            project: d.project,
            office_name: 'Master Data',
            item_code: d.item_code,
            item_name: d.item_name,
            batch_number: d.batch_number || 'Global',
            quantity: d.quantity || 0,
            opening_stock: d.initial_quantity || d.quantity || 0,
            manufacturing_date: d.manufacturing_date || '',
            expiry_date: d.expiry_date || '',
            uom: d.uom || ''
          }));
      } else {
        // Fetch specific office inventory
        data = await api.inventory.getOfficeInventory(currentProj, selectedOffice);
      }
      setInventoryList(data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load analytics inventory data.");
      setInventoryList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [selectedProject, selectedOffice]);

  if (!isAuthorized) {
    return (
      <div className="tab-pane" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '40px' }}>
        <div style={{ padding: '24px', backgroundColor: '#fef2f2', borderRadius: '50%', color: '#ef4444', marginBottom: '20px' }}>
          <XCircle size={60} />
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: '850', color: '#1e293b', marginBottom: '8px' }}>Access Denied</h2>
        <p style={{ color: '#64748b', maxWidth: '420px', fontSize: '14px', lineHeight: '1.6' }}>
          You do not have administrative or supervisory privileges required to access the stock and batch logs analytics interface.
        </p>
      </div>
    );
  }

  // Row and Shelf locator generator
  const getLocator = (itemCode, batchNumber) => {
    if (!itemCode) return { row: '-', shelf: '-', track: '-', full: '-' };
    // Generate a consistent locator based on code hash
    let hash = 0;
    const str = itemCode + (batchNumber || '');
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const row = String.fromCharCode(65 + (Math.abs(hash) % 4)); // A, B, C, D
    const shelfNum = (Math.abs(hash) % 3) + 1; // 1, 2, 3
    const binNum = (Math.abs(hash) % 5) + 1; // 1, 2, 3, 4, 5
    return {
      row,
      shelf: `Shelf ${shelfNum}`,
      track: `Track ${binNum}`,
      full: `Row ${row} / Shelf ${shelfNum} / Track ${binNum}`
    };
  };

  // Expiration Days Calculator
  const getDaysToExpiry = (expiryStr) => {
    if (!expiryStr) return Infinity;
    const expiryDate = new Date(expiryStr);
    const today = new Date();
    // Reset hours
    expiryDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Calculations
  const calculatedItems = inventoryList.map(item => {
    const locator = getLocator(item.item_code, item.batch_number);
    const daysLeft = getDaysToExpiry(item.expiry_date);
    
    let state = 'good'; // 'good', 'warning', 'low', 'expired'
    if (daysLeft <= 0) {
      state = 'expired';
    } else if (daysLeft <= 90) {
      state = 'expiry_warning';
    } else if (item.quantity <= lowStockThreshold) {
      state = 'low_stock';
    }

    return {
      ...item,
      locator,
      daysLeft,
      state
    };
  });

  // Filter & Sort
  const filteredItems = calculatedItems.filter(item => {
    // Search filter
    const matchesSearch = 
      (item.item_name && item.item_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.item_code && item.item_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.batch_number && item.batch_number.toLowerCase().includes(searchTerm.toLowerCase()));

    // Alert Status filter
    if (statusFilter === 'All') return matchesSearch;
    if (statusFilter === 'LowStock') return matchesSearch && item.quantity <= lowStockThreshold;
    if (statusFilter === 'NearExpiry') return matchesSearch && item.daysLeft > 0 && item.daysLeft <= 90;
    if (statusFilter === 'Expired') return matchesSearch && item.daysLeft <= 0;
    return matchesSearch;
  });

  // Sort
  const sortedItems = [...filteredItems].sort((a, b) => {
    let comp = 0;
    if (sortBy === 'quantity') {
      comp = a.quantity - b.quantity;
    } else if (sortBy === 'expiry') {
      comp = a.daysLeft - b.daysLeft;
    } else if (sortBy === 'name') {
      comp = (a.item_name || '').localeCompare(b.item_name || '');
    }
    return sortOrder === 'asc' ? comp : -comp;
  });

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Pagination Calculations
  const totalItems = sortedItems.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const displayPage = currentPage > totalPages && totalPages > 0 ? 1 : currentPage;
  const paginatedItems = sortedItems.slice(
    (displayPage - 1) * pageSize,
    displayPage * pageSize
  );

  // KPI Calculations
  const totalMedsCount = new Set(inventoryList.map(i => i.item_code)).size;
  const totalQtyVolume = inventoryList.reduce((acc, i) => acc + i.quantity, 0);
  const lowStockCount = calculatedItems.filter(i => i.quantity <= lowStockThreshold).length;
  const nearExpiryCount = calculatedItems.filter(i => i.daysLeft > 0 && i.daysLeft <= 90).length;
  const expiredCount = calculatedItems.filter(i => i.daysLeft <= 0).length;

  return (
    <div className="tab-pane" style={{ padding: '0 8px' }}>
      
      {/* Header section with Dynamic Selector */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '16px', 
        marginBottom: '24px',
        backgroundColor: '#ffffff',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '850', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '10px' }}>
             
            Stock & Consumption Analytics
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', display: 'block' }}>
            Real-time office storage levels, batch tracking, row layout indices, and expiration risk meters.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {userRole === 'admin' ? (
            <>
              <div style={{ width: '180px' }}>
                <CustomSelect
                  options={projects.map(proj => ({ value: proj, label: proj }))}
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    setSelectedOffice('Whole Project');
                  }}
                  placeholder="Select Project"
                />
              </div>
              <div style={{ width: '180px' }}>
                <CustomSelect
                  options={[
                    { value: 'Whole Project', label: 'Whole Project' },
                    ...offices.map(o => ({ value: o.name, label: o.name }))
                  ]}
                  value={selectedOffice}
                  onChange={(e) => setSelectedOffice(e.target.value)}
                  placeholder="Select Location"
                />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1e293b', backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <Building size={14} style={{ color: 'var(--primary)' }} />
                <span><strong>Scope:</strong> {userProject} - {user?.office_name || 'My Facility'}</span>
              </div>
            </div>
          )}

          {/* Low Stock Config */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            backgroundColor: '#fffbeb', 
            border: '1px solid #fde68a', 
            padding: '4px 12px', 
            borderRadius: '10px',
            height: '38px',
            fontSize: '12.5px',
            color: '#b45309'
          }}>
            <AlertTriangle size={14} style={{ color: '#d97706' }} />
            <span>Low Stock Limit:</span>
            {userRole === 'admin' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{
                    width: '50px',
                    height: '24px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    textAlign: 'center',
                    fontWeight: '700',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveThreshold}
                  disabled={savingThreshold}
                  style={{
                    backgroundColor: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {savingThreshold ? '...' : 'Set'}
                </button>
              </div>
            ) : (
              <strong style={{ color: '#78350f' }}>{lowStockThreshold} units</strong>
            )}
          </div>

          <button
            type="button"
            className="filter-btn"
            onClick={fetchAnalyticsData}
            disabled={loading}
            style={{ 
              padding: '10px', 
              borderRadius: '10px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              backgroundColor: '#fff', 
              border: '1px solid #cbd5e1',
              cursor: 'pointer' 
            }}
          >
            <RefreshCw size={15} className={loading ? 'spin-anim' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        
        {/* Total Medicines */}
        <div style={{
          padding: '20px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '16px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ padding: '12px', backgroundColor: '#e0f2fe', borderRadius: '12px', color: '#0284c7', display: 'flex' }}>
            <Pill size={22} />
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inventory Catalog</span>
            <strong style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', display: 'block', marginTop: '2px' }}>{totalMedsCount}</strong>
            <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '2px' }}>Unique Product Types</span>
          </div>
        </div>

        {/* Current Quantity Vol */}
        <div style={{
          padding: '20px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '16px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ padding: '12px', backgroundColor: '#dcfce7', borderRadius: '12px', color: '#16a34a', display: 'flex' }}>
            <Database size={22} />
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total In Stock</span>
            <strong style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', display: 'block', marginTop: '2px' }}>
              {Math.round(totalQtyVolume).toLocaleString('en-IN')} Units
            </strong>
            <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '2px' }}>Aggregated Box/Bag items</span>
          </div>
        </div>

        {/* Low Stock count */}
        <div style={{
          padding: '20px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '16px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ padding: '12px', backgroundColor: '#fef3c7', borderRadius: '12px', color: '#d97706', display: 'flex' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Restock Warnings</span>
            <strong style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', display: 'block', marginTop: '2px' }}>{lowStockCount} Items</strong>
            <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '2px' }}>Quantity at / under 10</span>
          </div>
        </div>

        {/* Expiry Risk status count */}
        <div style={{
          padding: '20px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '16px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ padding: '12px', backgroundColor: '#fee2e2', borderRadius: '12px', color: '#dc2626', display: 'flex' }}>
            <Clock size={22} />
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expiration Threats</span>
            <strong style={{ fontSize: '24px', fontWeight: '900', color: '#dc2626', display: 'block', marginTop: '2px' }}>{nearExpiryCount + expiredCount} Batches</strong>
            <span style={{ fontSize: '11.5px', color: '#ef4444', display: 'block', marginTop: '2px' }}>
              <strong>{expiredCount}</strong> Expired | <strong>{nearExpiryCount}</strong> &lt; 90 days
            </span>
          </div>
        </div>

      </div>

      {/* Analytics Visual Gauges Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '24px', marginBottom: '24px', alignItems: 'stretch' }}>
        
        {/* Left Side: Top Stock Levels Progress */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={18} style={{ color: '#16a34a' }} />
            Stock Volume Breakdown by Medicine
          </h3>
          <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginTop: '2px', marginBottom: '20px' }}>
            Comparative visualization of product quantities in storage.
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
            {loading ? (
              <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Calculating meters...
              </div>
            ) : inventoryList.length > 0 ? (() => {
              const sortedAll = [...inventoryList]
                .sort((a, b) => b.quantity - a.quantity);
              const maxVal = Math.max(1, ...sortedAll.map(i => i.quantity));
              
              const barWidth = 32;
              const step = 64;
              const chartWidth = Math.max(500, sortedAll.length * step + 80);

              return (
                <div style={{ 
                  position: 'relative', 
                  width: '100%', 
                  padding: '10px',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  backgroundColor: '#fafafa',
                  borderRadius: '12px',
                  border: '1px solid #f1f5f9'
                }}>
                  {/* Tooltip Overlay */}
                  {hoveredBar && (() => {
                    const idx = sortedAll.findIndex(i => i.id === hoveredBar.id);
                    if (idx === -1) return null;
                    const tooltipX = 55 + idx * step + (step - barWidth) / 2 + (barWidth / 2) + 10;
                    return (
                      <div style={{
                        position: 'absolute',
                        top: '5px',
                        left: `${tooltipX}px`,
                        transform: 'translateX(-50%)',
                        backgroundColor: '#1e293b',
                        color: '#ffffff',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)',
                        zIndex: 10,
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        border: '1px solid #475569',
                        transition: 'left 0.15s ease'
                      }}>
                        <strong style={{ color: 'var(--primary)' }}>{hoveredBar.item_name}</strong>
                        <span style={{ margin: '0 6px', color: '#94a3b8' }}>|</span>
                        <span>Stock: <strong>{hoveredBar.quantity} {hoveredBar.uom || 'units'}</strong></span>
                        {hoveredBar.batch_number && (
                          <>
                            <span style={{ margin: '0 6px', color: '#94a3b8' }}>|</span>
                            <span>Batch: {hoveredBar.batch_number}</span>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <svg viewBox={`0 0 ${chartWidth} 200`} width={chartWidth} height="220" style={{ overflow: 'visible' }}>
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                      <linearGradient id="barGradLow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" />
                        <stop offset="100%" stopColor="#dc2626" />
                      </linearGradient>
                    </defs>

                    {/* Y-Axis Gridlines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                      const yPos = 150 - (ratio * 120);
                      const labelVal = Math.round(ratio * maxVal);
                      return (
                        <g key={i}>
                          <line 
                            x1="45" 
                            y1={yPos} 
                            x2={chartWidth - 15} 
                            y2={yPos} 
                            stroke="#e2e8f0" 
                            strokeWidth="1" 
                            strokeDasharray={i === 0 ? "0" : "4 4"}
                          />
                          <text 
                            x="35" 
                            y={yPos + 4} 
                            textAnchor="end" 
                            fill="#94a3b8" 
                            fontSize="10" 
                            fontWeight="600"
                          >
                            {labelVal}
                          </text>
                        </g>
                      );
                    })}

                    {/* X-Axis baseline */}
                    <line x1="45" y1="150" x2={chartWidth - 15} y2="150" stroke="#cbd5e1" strokeWidth="1.5" />

                    {/* Bars rendering */}
                    {sortedAll.map((item, idx) => {
                      const x = 55 + idx * step + (step - barWidth) / 2;
                      const barHeight = (item.quantity / maxVal) * 120;
                      const y = 150 - barHeight;
                      const label = item.item_name && item.item_name.length > 8 
                        ? item.item_name.substring(0, 8) + '..' 
                        : item.item_name;
                      const isLow = item.quantity <= lowStockThreshold;

                      return (
                        <g 
                          key={item.id || idx}
                          onMouseEnter={() => setHoveredBar(item)}
                          onMouseLeave={() => setHoveredBar(null)}
                          style={{ cursor: 'pointer' }}
                        >
                          {/* Main Bar rectangle */}
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={Math.max(2, barHeight)}
                            rx="5"
                            ry="5"
                            fill={isLow ? "url(#barGradLow)" : "url(#barGrad)"}
                            style={{
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              opacity: hoveredBar && hoveredBar.id !== item.id ? 0.6 : 1,
                              transformOrigin: `${x + barWidth/2}px 150px`
                            }}
                          />
                          {/* Value on top of the bar */}
                          <text
                            x={x + barWidth / 2}
                            y={y - 6}
                            textAnchor="middle"
                            fill={isLow ? '#dc2626' : '#1e293b'}
                            fontSize="10.5"
                            fontWeight="800"
                          >
                            {item.quantity}
                          </text>
                          {/* Label below the bar */}
                          <text
                            x={x + barWidth / 2}
                            y="170"
                            textAnchor="middle"
                            fill="#475569"
                            fontSize="9.5"
                            fontWeight="700"
                          >
                            {label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })() : (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '30px' }}>
                No items found to profile.
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Expiry Risk visual segments */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={18} style={{ color: '#dc2626' }} />
            Expiration Risk Segments
          </h3>
          <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginTop: '2px', marginBottom: '20px' }}>
            Breakdown of drug batches grouped by days remaining until expiration.
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
            {/* Sector expired */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
              <div style={{ width: '8px', height: '36px', backgroundColor: '#ef4444', borderRadius: '4px' }}></div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>Expired (Risk Critical)</span>
                <span style={{ fontSize: '12px', color: '#ef4444' }}><strong>{expiredCount}</strong> batch(es) past expiry date.</span>
              </div>
            </div>

            {/* Sector critical */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#fffbeb', borderRadius: '12px', border: '1px solid #fef3c7' }}>
              <div style={{ width: '8px', height: '36px', backgroundColor: '#f59e0b', borderRadius: '4px' }}></div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>Near Expiry Warning (&lt; 90 Days)</span>
                <span style={{ fontSize: '12px', color: '#d97706' }}><strong>{nearExpiryCount}</strong> batch(es) demand immediate utilization.</span>
              </div>
            </div>

            {/* Sector healthy */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
              <div style={{ width: '8px', height: '36px', backgroundColor: '#10b981', borderRadius: '4px' }}></div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>Healthy Stock (&gt; 90 Days)</span>
                <span style={{ fontSize: '12px', color: '#16a34a' }}>
                  <strong>{calculatedItems.filter(i => {
                    const days = getDaysToExpiry(i.expiry_date);
                    return days > 90;
                  }).length}</strong> batch(es) completely safe.
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Main Stock Locator & Batch Analysis Grid */}
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
        
        {/* Table Filter Controls */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: '850', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Medicine Batches & Storage Rows</h3>
            <span style={{ fontSize: '11.5px', padding: '4px 10px', backgroundColor: '#f1f5f9', borderRadius: '20px', fontWeight: '700', color: '#475569' }}>
              {sortedItems.length} records found
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Search Input bar */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search Item / Batch..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px 8px 36px', 
                  fontSize: '12.5px', 
                  borderRadius: '10px', 
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  outline: 'none',
                  transition: 'all 0.15s ease'
                }}
              />
            </div>

            {/* Filter select */}
            <div style={{ width: '150px' }}>
              <CustomSelect
                options={[
                  { value: 'All', label: 'All' },
                  { value: 'LowStock', label: 'Low Stock' },
                  { value: 'NearExpiry', label: 'Near Expiry' },
                  { value: 'Expired', label: 'Expired' }
                ]}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                placeholder="Alert Level"
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px' }}>S.No</th>
                <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                  Material / Code <ArrowUpDown size={11} style={{ marginLeft: '4px', display: 'inline' }} />
                </th>
                <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Batch #</th>
                <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }} onClick={() => toggleSort('quantity')}>
                  Available Stock <ArrowUpDown size={11} style={{ marginLeft: '4px', display: 'inline' }} />
                </th>
                <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MFG Date</th>
                <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }} onClick={() => toggleSort('expiry')}>
                  Expiry Date <ArrowUpDown size={11} style={{ marginLeft: '4px', display: 'inline' }} />
                </th>
                <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Indicators</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <RefreshCw size={20} className="spin-anim" style={{ margin: '0 auto 10px', display: 'block', color: 'var(--primary)' }} />
                    Analyzing office database log files...
                  </td>
                </tr>
              ) : paginatedItems.length > 0 ? (
                paginatedItems.map((item, idx) => {
                  const itemIndex = ((displayPage - 1) * pageSize) + idx + 1;
                  return (
                    <tr 
                      key={item.id} 
                      style={{ 
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: item.state === 'expired' ? '#fff8f8' : 'transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = item.state === 'expired' ? '#fee2e2' : '#f8fafc';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = item.state === 'expired' ? '#fff8f8' : 'transparent';
                      }}
                    >
                      {/* S.No */}
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>{itemIndex}</td>
                      
                      {/* Material Detail */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: '750', color: '#0f172a' }}>{item.item_name}</span>
                          <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>Code: {item.item_code}</span>
                        </div>
                      </td>

                      {/* Batch */}
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: '#0f172a', fontWeight: '600', fontFamily: 'monospace' }}>
                        {item.batch_number || 'N/A'}
                      </td>

                      {/* Quantity */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <strong style={{ fontSize: '13.5px', color: item.quantity <= 10 ? '#ef4444' : '#0f172a' }}>
                            {item.quantity} {item.uom || 'units'}
                          </strong>
                          {item.opening_stock > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100px' }}>
                              <div style={{ height: '4px', flex: 1, backgroundColor: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ 
                                  height: '100%', 
                                  width: `${Math.min(100, (item.quantity / item.opening_stock) * 100)}%`,
                                  backgroundColor: (item.quantity / item.opening_stock) <= 0.2 ? '#ef4444' : '#10b981'
                                }} />
                              </div>
                              <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                                {Math.round((item.quantity / item.opening_stock) * 100)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* MFG */}
                      <td style={{ padding: '14px 20px', fontSize: '12.5px', color: '#475569', fontWeight: '600' }}>
                        {item.manufacturing_date || '-'}
                      </td>

                      {/* EXP */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: '700', color: item.daysLeft <= 0 ? '#ef4444' : '#0f172a' }}>
                            {item.expiry_date || '-'}
                          </span>
                          {item.daysLeft !== Infinity && item.daysLeft > 0 && item.daysLeft <= 90 && (
                            <span style={{ fontSize: '10px', color: '#b45309', fontWeight: '700' }}>
                              Expiring in {item.daysLeft} days
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Indicators */}
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        {item.state === 'expired' ? (
                          <span style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#fee2e2', 
                            color: '#ef4444', 
                            fontSize: '11px', 
                            fontWeight: '800', 
                            borderRadius: '20px', 
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <XCircle size={12} />
                            Expired
                          </span>
                        ) : item.state === 'expiry_warning' ? (
                          <span style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#fffbeb', 
                            color: '#d97706', 
                            fontSize: '11px', 
                            fontWeight: '800', 
                            borderRadius: '20px', 
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <AlertTriangle size={12} />
                            Near Expiry
                          </span>
                        ) : item.state === 'low_stock' ? (
                          <span style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#eff6ff', 
                            color: '#2563eb', 
                            fontSize: '11px', 
                            fontWeight: '800', 
                            borderRadius: '20px', 
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Layers size={12} />
                            Low Stock
                          </span>
                        ) : (
                          <span style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#ecfdf5', 
                            color: '#10b981', 
                            fontSize: '11px', 
                            fontWeight: '850', 
                            borderRadius: '20px', 
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <CheckCircle2 size={12} />
                            In Stock
                          </span>
                        )}
                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' }}>
                    No stock inventory logs match the search query inside this facility.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Row for Analytics */}
        {totalItems > 0 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '16px 24px', 
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            flexWrap: 'wrap', 
            gap: '12px' 
          }}>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              Showing {((displayPage - 1) * pageSize) + 1} to {Math.min(displayPage * pageSize, totalItems)} of {totalItems} records
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Rows per page:</span>
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
                  compact={true}
                  placement="top"
                  style={{ width: '80px' }}
                />
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="filter-btn"
                    disabled={displayPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {(() => {
                    const pages = [];
                    if (totalPages <= 7) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (displayPage > 3) pages.push('...');
                      const start = Math.max(2, displayPage - 1);
                      const end = Math.min(totalPages - 1, displayPage + 1);
                      for (let i = start; i <= end; i++) pages.push(i);
                      if (displayPage < totalPages - 2) pages.push('...');
                      pages.push(totalPages);
                    }
                    return pages.map((p, idx) => {
                      if (p === '...') {
                        return <span key={`ellipsis-${idx}`} style={{ color: '#94a3b8', padding: '0 8px', fontSize: '13px', alignSelf: 'center' }}>...</span>;
                      }
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`filter-btn ${displayPage === p ? 'active' : ''}`}
                          onClick={() => setCurrentPage(p)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: displayPage === p ? 'var(--primary)' : '#ffffff',
                            color: displayPage === p ? '#ffffff' : '#1e293b',
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
                    disabled={displayPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
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
  );
}
