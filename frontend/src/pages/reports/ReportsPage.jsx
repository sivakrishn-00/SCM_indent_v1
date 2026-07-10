import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Download, Search, ChevronLeft, ChevronRight, FileText, ClipboardCheck, Database, Building, IndianRupee } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CustomSelect from '../../components/CustomSelect';
import api from '../../services/api';

export default function ReportsPage() {
  const {
    user,
    userRole,
    projects,
    userProject,
    isWarehouseUser,
    activeTab,
  } = useApp();

  // Reports State
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reportProject, setReportProject] = useState('');
  const [reportOffice, setReportOffice] = useState('Whole Project');
  const [reportOffices, setReportOffices] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(10);
  const [reportSearch, setReportSearch] = useState('');
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const [reportViewMode, setReportViewMode] = useState('flat'); // 'flat' or 'grouped'

  const fetchReportData = async () => {
    if (!reportProject) return;
    setLoadingReport(true);
    try {
      const data = await api.shifts.getReport(reportProject, reportOffice, reportStartDate, reportEndDate);
      setReportData(data);
    } catch (err) {
      console.error(err);
      setReportData([]);
      toast.error("Error loading report data.");
    } finally {
      setLoadingReport(false);
    }
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const downloadGroupedPdf = async () => {
    if (allGroupedData.length === 0) {
      toast.error("No data available to download.");
      return;
    }
    setDownloadingPdf(true);
    const toastId = toast.loading("Generating PDF report...");
    try {
      // 1. Dynamic Load of html2pdf library from CDN
      const html2pdf = await new Promise((resolve, reject) => {
        if (window.html2pdf) {
          resolve(window.html2pdf);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = () => resolve(window.html2pdf);
        script.onerror = () => reject(new Error('Failed to load html2pdf'));
        document.body.appendChild(script);
      });

      // 2. Clone the print template container from offscreen to keep all records
      const element = document.getElementById('report-pdf-print-container');
      if (!element) {
        throw new Error("PDF layout element not found.");
      }

      // Configure export settings
      const opt = {
        margin: 10,
        filename: `Consumption_Report_${(reportProject || 'Global').replace(/\s+/g, '_')}_${reportStartDate}_to_${reportEndDate}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      };

      // Generate the PDF
      await html2pdf().from(element).set(opt).save();
      toast.success("PDF Report downloaded successfully!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Error generating PDF download.", { id: toastId });
    } finally {
      setDownloadingPdf(false);
    }
  };
  
  const downloadExcelReport = () => {
    if (reportData.length === 0) {
      toast.error("No data available to export.");
      return;
    }

    let csvContent = "";

    if (reportViewMode === 'grouped') {
      const csvLines = [];
      
      // Title Row
      csvLines.push(`"BAVYA HEALTH SERVICES PVT. LTD. - Grouped Consumption Report"`);
      csvLines.push(`"Report Range: ${reportStartDate} to ${reportEndDate}"`);
      csvLines.push(`"Exported At: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}"`);
      csvLines.push(`"Total Shift Logs: ${allGroupedData.length}","Distinct Units: ${distinctUnitsCount}","Grand Consumed Qty: ${grandConsumedQty}","Grand Total Cost: INR ${Math.round(grandTotalCostVal)}"`);
      csvLines.push(""); // spacing

      allGroupedData.forEach(group => {
        // Group Header
        csvLines.push(`"SHIFT GROUP","Date/Time: ${group.dateTime}","Project: ${group.project || reportProject}","Office/Location: ${group.office_name || 'Global'}","Shift: ${group.shift_type === 'shift_1' ? 'Shift 1' : 'Shift 2'}","Logged By: ${group.logged_by}","Vehicle: ${group.vehicle_number}"`);
        
        // Item Columns Title
        csvLines.push(`"S.No.","Material / Code","Batch","MFG / EXP","Store OB","Store Received","Store Sent Back","Store Drawn","Store Closing","Bag OB","Bag Received","Bag Sent Back","Bag Consumed","Bag Closing","Unit MRP","Total Cost"`);

        let currentSNo = 0;
        let lastItemKey = '';
        const itemsWithSNo = group.items.map((d) => {
          const itemKey = `${d.item_name}_${d.item_code}`;
          if (itemKey !== lastItemKey) {
            currentSNo += 1;
            lastItemKey = itemKey;
          }
          return { ...d, sNo: currentSNo };
        });

        let totOfficeOB = 0;
        let totOfficeRec = 0;
        let totOfficeSent = 0;
        let totOfficeDrawn = 0;
        let totOfficeClosing = 0;
        let totBagOB = 0;
        let totBagRec = 0;
        let totBagSent = 0;
        let totBagCons = 0;
        let totBagClosing = 0;
        let totCost = 0;

        itemsWithSNo.forEach(item => {
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
            officeReceived = Math.round(item.received_qty || 0);
            officeClosing = Math.round(item.closing_balance || 0);
            bagOB = 0;
            bagReceived = officeConsumed;
            bagConsumed = officeConsumed;
            bagClosing = 0;
          } else {
            officeReceived = 0;
            officeClosing = officeOB;
            bagOB = Math.round(item.received_qty || 0);
            bagReceived = 0;
            bagConsumed = 0;
            bagClosing = bagOB;
          }

          totOfficeOB += officeOB;
          totOfficeRec += officeReceived;
          totOfficeSent += officeSentBack;
          totOfficeDrawn += officeConsumed;
          totOfficeClosing += officeClosing;
          totBagOB += bagOB;
          totBagRec += bagReceived;
          totBagCons += bagConsumed;
          totBagClosing += bagClosing;
          totCost += bagConsumed * (item.unit_mrp || 0);

          const mfgExpDate = `M: ${item.manufacturing_date || '—'} / E: ${item.expiry_date || '—'}`;

          csvLines.push([
            item.sNo,
            `"${item.item_name} (${item.item_code})"`,
            `"${item.batch_number || 'N/A'}"`,
            `"${mfgExpDate}"`,
            officeOB,
            officeReceived,
            officeSentBack,
            officeConsumed,
            officeClosing,
            bagOB,
            bagReceived,
            0, // bag sent back
            bagConsumed,
            bagClosing,
            Math.round(item.unit_mrp || 0),
            Math.round(bagConsumed * (item.unit_mrp || 0))
          ].join(","));
        });

        // Totals Row
        csvLines.push([
          `"Total Summary"`,
          `""`,
          `""`,
          `""`,
          totOfficeOB,
          totOfficeRec,
          totOfficeSent,
          totOfficeDrawn,
          totOfficeClosing,
          totBagOB,
          totBagRec,
          0,
          totBagCons,
          totBagClosing,
          `""`,
          Math.round(totCost)
        ].join(","));

        if (group.remarks) {
          csvLines.push(`"Discussion:","${group.remarks.replace(/"/g, '""')}"`);
        }
        csvLines.push(""); // separator spacing row
      });

      csvContent = csvLines.join("\n");
    } else {
      // Flat CSV
      const headers = [
        "Date",
        "Shift",
        "Vehicle Number",
        "Item Name",
        "Item Code",
        "Opening Balance",
        "Received Quantity",
        "Consumed Quantity",
        "Closing Balance",
        "Unit MRP",
        "Total Cost",
        "Office / Facility",
        "Logged By",
        "Remarks / Discussion"
      ];

      const rows = reportData.map(log => [
        log.date,
        log.shift_type === 'shift_1' ? 'Shift 1' : 'Shift 2',
        log.vehicle_number,
        log.item_name,
        log.item_code,
        log.opening_balance.toFixed(2),
        log.received_qty.toFixed(2),
        log.consumed_qty.toFixed(2),
        log.closing_balance.toFixed(2),
        (log.unit_mrp || 0).toFixed(2),
        (log.consumed_qty * (log.unit_mrp || 0)).toFixed(2),
        log.office_name || 'Global',
        log.logged_by,
        log.remarks || ''
      ]);

      csvContent = [
        `"BAVYA HEALTH SERVICES PVT. LTD. - Consumption Report"`,
        `"Report Range: ${reportStartDate} to ${reportEndDate}"`,
        `"Exported At: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}"`,
        `"Total Shift Logs: ${allGroupedData.length}","Distinct Units: ${distinctUnitsCount}","Grand Consumed Qty: ${grandConsumedQty}","Grand Total Cost: INR ${Math.round(grandTotalCostVal)}"`,
        "",
        headers.join(","),
        ...rows.map(row => 
          row.map(val => {
            const str = String(val === null || val === undefined ? '' : val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(",")
        )
      ].join("\n");
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const suffix = reportViewMode === 'grouped' ? '_grouped' : '';
    const fileName = `Consumption_Report_${(reportProject || 'Global').replace(/\s+/g, '_')}_${reportStartDate}_to_${reportEndDate}${suffix}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel/CSV Report downloaded successfully!");
  };

  useEffect(() => {
    if (reportProject && !hasLoadedInitial) {
      fetchReportData();
      setHasLoadedInitial(true);
    }
  }, [reportProject, hasLoadedInitial]);

  useEffect(() => {
    setReportPage(1);
  }, [reportProject, reportOffice, reportStartDate, reportEndDate, reportSearch]);

  useEffect(() => {
    if (reportProject) {
      const fetchReportOffices = async () => {
        try {
          const data = await api.projects.getOffices(reportProject);
          setReportOffices(data);
        } catch (err) {
          console.error("Error fetching report offices:", err);
          setReportOffices([]);
        }
      };
      fetchReportOffices();
    } else {
      setReportOffices([]);
    }
    setReportOffice('Whole Project');
  }, [reportProject]);

  useEffect(() => {
    const defaultProj = userProject || (projects.length > 0 ? projects[0] : '');
    if (defaultProj && !reportProject) {
      setReportProject(defaultProj);
    }
  }, [userProject, projects, reportProject]);

  const filteredReportData = reportData.filter(log => {
    if (!reportSearch) return true;
    const s = reportSearch.toLowerCase();
    return (
      (log.item_name && log.item_name.toLowerCase().includes(s)) ||
      (log.item_code && log.item_code.toLowerCase().includes(s)) ||
      (log.vehicle_number && log.vehicle_number.toLowerCase().includes(s)) ||
      (log.logged_by && log.logged_by.toLowerCase().includes(s)) ||
      (log.office_name && log.office_name.toLowerCase().includes(s)) ||
      (log.item_group && log.item_group.toLowerCase().includes(s)) ||
      (log.remarks && log.remarks.toLowerCase().includes(s))
    );
  });

  const getGroupedData = (dataList) => {
    const groups = {};
    dataList.forEach(log => {
      const datePart = log.date ? log.date.split(' ')[0] : 'N/A';
      const key = `${datePart}_${log.shift_type}_${log.logged_by}_${log.office_name || 'Global'}_${log.vehicle_number || 'N/A'}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          date: datePart,
          dateTime: log.date,
          shift_type: log.shift_type,
          logged_by: log.logged_by,
          office_name: log.office_name,
          vehicle_number: log.vehicle_number,
          remarks: log.remarks || '',
          items: []
        };
      }
      groups[key].items.push(log);
    });
    return Object.values(groups);
  };

  const allGroupedData = getGroupedData(filteredReportData);
  const distinctUnitsCount = new Set(filteredReportData.map(log => log.office_name || 'Global')).size;
  const grandConsumedQty = filteredReportData.reduce((acc, log) => acc + Math.round(log.consumed_qty || 0), 0);
  const grandTotalCostVal = filteredReportData.reduce((acc, log) => acc + Math.round(log.consumed_qty || 0) * (log.unit_mrp || 0), 0);
  const groupedPageSize = 5;
  const totalGroupedPages = Math.ceil(allGroupedData.length / groupedPageSize) || 1;
  const currentGroupedPage = Math.min(reportPage, totalGroupedPages);
  const paginatedGroupedData = allGroupedData.slice(
    (currentGroupedPage - 1) * groupedPageSize,
    currentGroupedPage * groupedPageSize
  );

  const totalReportPages = Math.ceil(filteredReportData.length / reportPageSize) || 1;
  const paginatedReportData = filteredReportData.slice(
    (reportPage - 1) * reportPageSize,
    reportPage * reportPageSize
  );

  const totalPagesToUse = reportViewMode === 'grouped' ? totalGroupedPages : totalReportPages;
  const currentPageToUse = reportViewMode === 'grouped' ? currentGroupedPage : reportPage;

  const handleReportPageChange = (page) => {
    if (page >= 1 && page <= totalPagesToUse) {
      setReportPage(page);
    }
  };

  const getReportPageNumbers = () => {
    const pages = [];
    if (totalPagesToUse <= 7) {
      for (let i = 1; i <= totalPagesToUse; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, currentPageToUse - 1);
      const end = Math.min(totalPagesToUse - 1, currentPageToUse + 1);
      if (start > 2) {
        pages.push('...');
      }
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPagesToUse - 1) {
        pages.push('...');
      }
      pages.push(totalPagesToUse);
    }
    return pages;
  };

  return (
    <div className="tab-pane" style={{ animation: 'fadeIn 0.2s ease-out', width: '100%', padding: '24px' }}>
      <div className="section-header-flex no-print-section" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
        <div className="section-header-left">
          <h2>Consumption Reports</h2>
          <p>Generate and analyze project-specific and facility-level material consumption logs.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            type="button"
            onClick={fetchReportData} 
            className="filter-btn" 
            disabled={loadingReport}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            Refresh Data
          </button>
          <button 
            type="button"
            onClick={downloadGroupedPdf} 
            className="action-btn-primary" 
            disabled={downloadingPdf || allGroupedData.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0284c7', borderColor: '#0284c7', opacity: allGroupedData.length === 0 ? 0.6 : 1 }}
          >
            <FileText size={16} />
            <span>{downloadingPdf ? 'Exporting...' : 'Download PDF'}</span>
          </button>
          <button 
            type="button"
            onClick={downloadExcelReport} 
            className="action-btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Download size={16} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="form-container-card" style={{ padding: '20px', marginBottom: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {/* Project Filter */}
          <div className="form-group">
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', display: 'block' }}>Project *</label>
            <CustomSelect 
              value={reportProject}
              onChange={(e) => setReportProject(e.target.value)}
              placeholder="-- Choose Project --"
              disabled={userRole !== 'admin' && !isWarehouseUser}
              options={projects.map(p => ({ value: p, label: p }))}
            />
          </div>

          {/* Office Filter */}
          <div className="form-group">
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', display: 'block' }}>Office / Facility</label>
            <CustomSelect 
              value={reportOffice}
              onChange={(e) => setReportOffice(e.target.value)}
              options={[
                { value: 'Whole Project', label: 'Whole Project (All Offices)' },
                ...reportOffices.map(o => ({ value: o.name, label: o.name }))
              ]}
            />
          </div>

          {/* Start Date */}
          <div className="form-group">
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', display: 'block' }}>From Date</label>
            <input 
              type="date" 
              value={reportStartDate} 
              onChange={e => setReportStartDate(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#f8fafc', width: '100%', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {/* End Date */}
          <div className="form-group">
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', display: 'block' }}>To Date</label>
            <input 
              type="date" 
              value={reportEndDate} 
              onChange={e => setReportEndDate(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#f8fafc', width: '100%', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {/* Action Generate button */}
          <div className="form-group">
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'transparent', marginBottom: '6px', display: 'block', userSelect: 'none' }}>&nbsp;</label>
            <button 
              type="button"
              onClick={fetchReportData} 
              className="action-btn-primary" 
              disabled={loadingReport || !reportProject}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '38px', padding: '8px 16px', boxSizing: 'border-box', borderRadius: '8px', fontWeight: '750' }}
            >
              Generate
            </button>
          </div>
        </div>
      </div>

      {/* Quick Summary Widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Total Shift Logs */}
        <div className="metric-card" style={{
          padding: '20px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '16px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #fff8f5 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '12px', backgroundColor: '#fff7ed', borderRadius: '12px', color: '#f7931e', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <FileText size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
              Total Logs
            </span>
            <span style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {allGroupedData.length}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
              finalized shift reports
            </span>
          </div>
        </div>

        {/* Distinct Units */}
        <div className="metric-card" style={{
          padding: '20px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '16px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '12px', backgroundColor: '#e0f2fe', borderRadius: '12px', color: '#0284c7', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Building size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
              Distinct Units
            </span>
            <span style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {distinctUnitsCount}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
              active project offices
            </span>
          </div>
        </div>

        {/* Grand Consumed */}
        <div className="metric-card" style={{
          padding: '20px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '16px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '12px', backgroundColor: '#fff5f5', borderRadius: '12px', color: '#d81159', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <ClipboardCheck size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
              Grand Consumed
            </span>
            <span style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1', display: 'block' }}>
              {grandConsumedQty}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
              total units consumed
            </span>
          </div>
        </div>

        {/* Grand Total Cost */}
        <div className="metric-card" style={{
          padding: '20px', 
          border: '1px solid #e2e8f0', 
          borderRadius: '16px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '12px', backgroundColor: '#dcfce7', borderRadius: '12px', color: '#16a34a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <IndianRupee size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
              Grand Total Cost
            </span>
            <span style={{ fontSize: '22px', fontWeight: '800', color: '#16a34a', lineHeight: '1.1', display: 'block' }}>
              ₹{grandTotalCostVal.toLocaleString('en-IN')}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
              total consumption value
            </span>
          </div>
        </div>
      </div>

      {/* Report Data Table */}
      <div className="table-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Consumption Records</h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Project: <strong style={{ color: '#1e293b' }}>{reportProject || 'N/A'}</strong> | Office: <strong style={{ color: '#1e293b' }}>{reportOffice}</strong>
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {/* View Mode Toggle Segmented Control */}
            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', height: '32px' }}>
              <button
                type="button"
                onClick={() => {
                  setReportViewMode('flat');
                  setReportPage(1);
                }}
                style={{
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: '700',
                  border: 'none',
                  backgroundColor: reportViewMode === 'flat' ? 'var(--primary)' : '#ffffff',
                  color: reportViewMode === 'flat' ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Flat List
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportViewMode('grouped');
                  setReportPage(1);
                }}
                style={{
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: '700',
                  border: 'none',
                  backgroundColor: reportViewMode === 'grouped' ? 'var(--primary)' : '#ffffff',
                  color: reportViewMode === 'grouped' ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Grouped Grid
              </button>
            </div>

            {/* Rows Per Page Selector (Only for flat view) */}
            {reportViewMode === 'flat' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Rows per page:</span>
                <CustomSelect
                  value={reportPageSize}
                  onChange={e => {
                    setReportPageSize(Number(e.target.value));
                    setReportPage(1);
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
            )}

            {/* Search Bar */}
            <div className="search-bar" style={{ width: '220px', minWidth: '180px', position: 'relative' }}>
              <Search className="search-icon" size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text"
                placeholder="Search reports..."
                value={reportSearch}
                onChange={e => setReportSearch(e.target.value)}
                style={{ padding: '6px 12px 6px 30px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          </div>
        </div>
        
        {reportViewMode === 'flat' ? (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="portal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'left' }}>Date / Time</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'left' }}>Shift</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'left' }}>Vehicle</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'left' }}>Item / Code</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'right' }}>Opening</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'right' }}>Received</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'right' }}>Consumed</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'right' }}>Closing</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'left' }}>Office</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'left' }}>Logged By</th>
                </tr>
              </thead>
              <tbody>
                {loadingReport ? (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="bavya-spinner" style={{ margin: '0 auto 12px' }}>
                        <div className="petal petal-tl"></div>
                        <div className="petal petal-tr"></div>
                        <div className="petal petal-bl"></div>
                        <div className="petal petal-br"></div>
                      </div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Generating report logs...</span>
                    </td>
                  </tr>
                ) : paginatedReportData.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      No consumption records found for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedReportData.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>{log.date}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#475569' }}>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '6px', 
                          backgroundColor: log.shift_type === 'shift_1' ? '#f0fdf4' : '#fef2f2',
                          color: log.shift_type === 'shift_1' ? '#166534' : '#991b1b',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          {log.shift_type === 'shift_1' ? 'Shift 1' : 'Shift 2'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{log.vehicle_number}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155', display: 'block' }}>{log.item_name}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{log.item_code}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'right', color: '#475569' }}>{log.opening_balance.toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'right', color: '#475569' }}>{log.received_qty.toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'right', fontWeight: '700', color: 'var(--primary)' }}>{log.consumed_qty.toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'right', fontWeight: '700', color: '#047857' }}>{log.closing_balance.toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#475569' }}>{log.office_name || 'Global'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#475569' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700', color: '#475569' }}>
                            {log.logged_by.charAt(0).toUpperCase()}
                          </span>
                          {log.logged_by}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '20px' }}>
            {loadingReport ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="bavya-spinner" style={{ margin: '0 auto 12px' }}>
                  <div className="petal petal-tl"></div>
                  <div className="petal petal-tr"></div>
                  <div className="petal petal-bl"></div>
                  <div className="petal petal-br"></div>
                </div>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Generating report logs...</span>
              </div>
            ) : paginatedGroupedData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                No consumption records found for the selected criteria.
              </div>
            ) : (
              paginatedGroupedData.map(group => {
                let currentSNo = 0;
                let lastItemKey = '';
                const itemsWithSNo = group.items.map((d) => {
                  const itemKey = `${d.item_name}_${d.item_code}`;
                  if (itemKey !== lastItemKey) {
                    currentSNo += 1;
                    lastItemKey = itemKey;
                  }
                  return { ...d, sNo: currentSNo };
                });

                const localItemCounts = {};
                group.items.forEach(item => {
                  const itemKey = `${item.item_name}_${item.item_code}`;
                  localItemCounts[itemKey] = (localItemCounts[itemKey] || 0) + 1;
                });
                const localItemSpanTracker = {};

                // Compute shift group totals
                let totOfficeOB = 0;
                let totOfficeRec = 0;
                let totOfficeSent = 0;
                let totOfficeDrawn = 0;
                let totOfficeClosing = 0;
                let totBagOB = 0;
                let totBagRec = 0;
                let totBagSent = 0;
                let totBagCons = 0;
                let totBagClosing = 0;
                let totCost = 0;

                group.items.forEach(item => {
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
                    officeReceived = Math.round(item.received_qty || 0);
                    officeClosing = Math.round(item.closing_balance || 0);
                    bagOB = 0;
                    bagReceived = officeConsumed;
                    bagConsumed = officeConsumed;
                    bagClosing = 0;
                  } else {
                    officeReceived = 0;
                    officeClosing = officeOB;
                    bagOB = Math.round(item.received_qty || 0);
                    bagReceived = 0;
                    bagConsumed = 0;
                    bagClosing = bagOB;
                  }

                  totOfficeOB += officeOB;
                  totOfficeRec += officeReceived;
                  totOfficeSent += officeSentBack;
                  totOfficeDrawn += officeConsumed;
                  totOfficeClosing += officeClosing;
                  totBagOB += bagOB;
                  totBagRec += bagReceived;
                  totBagCons += bagConsumed;
                  totBagClosing += bagClosing;
                  totCost += bagConsumed * (item.unit_mrp || 0);
                });

                return (
                  <div key={group.key} className="grouped-card" style={{ border: '1px solid #cbd5e1', borderRadius: '12px', marginBottom: '24px', backgroundColor: '#ffffff', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', padding: '16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                      <div>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', display: 'block', marginBottom: '2px' }}>Project</span>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>{group.project || reportProject}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', display: 'block', marginBottom: '2px' }}>Office / Location</span>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>{group.office_name || 'Global'}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', display: 'block', marginBottom: '2px' }}>Shift Type</span>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>
                          {group.shift_type === 'shift_1' ? 'Shift 1' : 'Shift 2'}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', display: 'block', marginBottom: '2px' }}>Date / Time</span>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>{group.dateTime}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', display: 'block', marginBottom: '2px' }}>Logged By</span>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>{group.logged_by}</span>
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', minWidth: '950px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                            <th rowSpan={2} style={{ padding: '10px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '50px' }}>S.No.</th>
                            <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px' }}>Material / Code</th>
                            <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '90px' }}>Batch</th>
                            <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#334155', borderRight: '1px solid #cbd5e1', fontSize: '11px', width: '140px' }}>MFG / EXP</th>
                            <th colSpan={5} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '850', color: '#c2410c', backgroundColor: '#fff7ed', borderRight: '1px solid #ffd8a8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              Store / Room Stock (Local Facility)
                            </th>
                            <th colSpan={5} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '850', color: '#0369a1', backgroundColor: '#f0f9ff', borderRight: '1px solid #cbd5e1', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              Transit Bag (Operator Bag)
                            </th>
                            <th colSpan={2} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '850', color: '#15803d', backgroundColor: '#f0fdf4', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              Cost (INR)
                            </th>
                          </tr>
                          <tr style={{ backgroundColor: '#fdfdfd', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>OB</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Received</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Sent Back</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#7c2d12', backgroundColor: '#fffaf5', borderRight: '1px solid #ffe8cc', fontSize: '10px' }}>Drawn</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#7c2d12', backgroundColor: '#fff7ed', borderRight: '1px solid #ffd8a8', fontSize: '10px' }}>Closing</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>OB</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Received</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Sent Back</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe', fontSize: '10px' }}>Consumed</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#0c4a6e', backgroundColor: '#e0f2fe', borderRight: '1px solid #cbd5e1', fontSize: '10px' }}>Closing</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700', color: '#166534', backgroundColor: '#f0fdf4', borderRight: '1px solid #bbf7d0', fontSize: '10px' }}>Unit MRP</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '800', color: '#166534', backgroundColor: '#dcfce7', fontSize: '10px' }}>Consumed Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemsWithSNo.map((item) => {
                            const itemKey = `${item.item_name}_${item.item_code}`;
                            let rowSpan = 0;
                            if (!localItemSpanTracker[itemKey]) {
                              rowSpan = localItemCounts[itemKey];
                              localItemSpanTracker[itemKey] = true;
                            }

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
                              officeReceived = Math.round(item.received_qty || 0);
                              officeClosing = Math.round(item.closing_balance || 0);
                              bagOB = 0;
                              bagReceived = officeConsumed;
                              bagConsumed = officeConsumed;
                              bagClosing = 0;
                            } else {
                              officeReceived = 0;
                              officeClosing = officeOB;
                              bagOB = Math.round(item.received_qty || 0);
                              bagReceived = 0;
                              bagConsumed = 0;
                              bagClosing = bagOB;
                            }

                            return (
                              <tr key={item.id} style={{ borderBottom: '1px solid #cbd5e1', backgroundColor: '#ffffff' }}>
                                {rowSpan > 0 && (
                                  <td rowSpan={rowSpan} style={{ padding: '10px', textAlign: 'center', color: '#475569', fontWeight: '700', borderRight: '1px solid #cbd5e1', backgroundColor: '#f8fafc', verticalAlign: 'middle' }}>
                                    {item.sNo}
                                  </td>
                                )}
                                {rowSpan > 0 && (
                                  <td rowSpan={rowSpan} style={{ padding: '10px 12px', borderRight: '1px solid #cbd5e1', verticalAlign: 'middle', fontWeight: '600', color: '#1e293b' }}>
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
                                  <div>MFG: <strong style={{ color: '#475569' }}>{item.manufacturing_date || '—'}</strong></div>
                                  <div style={{ marginTop: '2px' }}>EXP: <strong style={{ color: '#475569' }}>{item.expiry_date || '—'}</strong></div>
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: '#451a03', fontWeight: '500' }}>{officeOB}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeReceived > 0 ? '#16a34a' : '#78716c', fontWeight: officeReceived > 0 ? '700' : '400' }}>{officeReceived > 0 ? `+${officeReceived}` : '0'}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeSentBack > 0 ? '#dc2626' : '#78716c', fontWeight: officeSentBack > 0 ? '700' : '400' }}>{officeSentBack > 0 ? `-${officeSentBack}` : '0'}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: officeConsumed > 0 ? '#ea580c' : '#78716c', fontWeight: officeConsumed > 0 ? '700' : '400' }}>{officeConsumed > 0 ? `-${officeConsumed}` : '0'}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffd8a8', color: '#9a3412', fontWeight: '700', backgroundColor: '#fff7ed' }}>{officeClosing}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: '#0c4a6e', fontWeight: '500', backgroundColor: '#f0f9ff' }}>{bagOB}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: bagReceived > 0 ? '#16a34a' : '#64748b', fontWeight: bagReceived > 0 ? '700' : '400', backgroundColor: '#f0f9ff' }}>{bagReceived > 0 ? `+${bagReceived}` : '0'}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', color: '#cbd5e1', backgroundColor: '#f0f9ff' }}>-</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #cbd5e1', color: '#cbd5e1', backgroundColor: '#f0f9ff' }}>{bagConsumed}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #cbd5e1', color: '#0369a1', fontWeight: '700', backgroundColor: '#e0f2fe' }}>{bagClosing}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #bbf7d0', color: '#166534', fontWeight: '500', backgroundColor: '#f0fdf4' }}>₹{Math.round(item.unit_mrp || 0)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#15803d', fontWeight: '700', backgroundColor: '#dcfce7' }}>₹{Math.round(bagConsumed * (item.unit_mrp || 0))}</td>
                              </tr>
                            );
                          })}
                          
                          {/* Summary Totals Row */}
                          <tr style={{ backgroundColor: '#f1f5f9', fontWeight: '800', borderTop: '2px solid #cbd5e1' }}>
                            <td colSpan={4} style={{ padding: '12px 14px', textAlign: 'right', borderRight: '1px solid #cbd5e1', fontSize: '11px', textTransform: 'uppercase', color: '#475569' }}>
                              Total Summary / Shift Total
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: '#451a03' }}>{totOfficeOB}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: '#16a34a' }}>{totOfficeRec}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: '#dc2626' }}>{totOfficeSent}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffe8cc', color: '#ea580c' }}>{totOfficeDrawn}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #ffd8a8', backgroundColor: '#fff7ed', color: '#9a3412' }}>{totOfficeClosing}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', backgroundColor: '#f0f9ff', color: '#0c4a6e' }}>{totBagOB}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', backgroundColor: '#f0f9ff', color: '#16a34a' }}>{totBagRec}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #e0f2fe', backgroundColor: '#f0f9ff', color: '#94a3b8' }}>-</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #cbd5e1', backgroundColor: '#f0f9ff', color: '#ea580c' }}>{totBagCons}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #cbd5e1', backgroundColor: '#e0f2fe', color: '#0369a1' }}>{totBagClosing}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#94a3b8' }}>-</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', backgroundColor: '#dcfce7', color: '#15803d' }}>₹{Math.round(totCost)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {group.remarks && (
                      <div style={{ margin: '16px', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Discussion:</h4>
                        <p style={{ margin: 0, fontSize: '13px', color: '#334155', whiteSpace: 'pre-wrap' }}>{group.remarks}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Report Client-Side Pagination controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid #f1f5f9', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
            Showing <span style={{ fontWeight: '600', color: '#1e293b' }}>
              {currentPageToUse === 1 ? (totalPagesToUse === 0 ? 0 : 1) : (currentPageToUse - 1) * (reportViewMode === 'grouped' ? groupedPageSize : reportPageSize) + 1}
            </span> to{' '}
            <span style={{ fontWeight: '600', color: '#1e293b' }}>
              {reportViewMode === 'grouped' ? Math.min(currentPageToUse * groupedPageSize, allGroupedData.length) : Math.min(currentPageToUse * reportPageSize, filteredReportData.length)}
            </span> of{' '}
            <span style={{ fontWeight: '600', color: '#1e293b' }}>
              {reportViewMode === 'grouped' ? allGroupedData.length : filteredReportData.length}
            </span> {reportViewMode === 'grouped' ? 'shifts' : 'records'}
          </span>
          {totalPagesToUse > 1 && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button 
                type="button" 
                className="filter-btn"
                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: currentPageToUse === 1 ? 'not-allowed' : 'pointer' }}
                disabled={currentPageToUse === 1}
                onClick={() => handleReportPageChange(currentPageToUse - 1)}
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              
              {getReportPageNumbers().map((p, idx) => {
                if (p === '...') {
                  return <span key={`ellipsis-${idx}`} style={{ color: '#94a3b8', padding: '0 4px', fontSize: '12px' }}>...</span>;
                }
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleReportPageChange(p)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: currentPageToUse === p ? 'var(--primary)' : '#e2e8f0',
                      backgroundColor: currentPageToUse === p ? 'var(--primary)' : '#ffffff',
                      color: currentPageToUse === p ? '#ffffff' : '#475569',
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
                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: currentPageToUse === totalPagesToUse ? 'not-allowed' : 'pointer' }}
                disabled={currentPageToUse === totalPagesToUse}
                onClick={() => handleReportPageChange(currentPageToUse + 1)}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stylesheet and print-only wrappers for native PDF export */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          header, footer, nav, .no-print, .form-container-card, .metric-card, .search-bar, button, select, input, .no-print-section, .table-card {
            display: none !important;
          }
          body, html, #root, .App, .dashboard-container, .dashboard-main, .tab-pane {
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            min-height: auto !important;
            width: 100% !important;
          }
          .only-print {
            display: block !important;
            width: 100% !important;
          }
          .print-card-group {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 24px !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 12px !important;
            overflow: hidden !important;
            background: #ffffff !important;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #cbd5e1 !important;
          }
        }
        @media screen {
          .only-print {
            display: block !important;
          }
        }
      `}} />

      {/* Outer wrapper hidden from DOM display but fully editable and renderable by html2canvas */}
      <div style={{ height: 0, overflow: 'hidden', position: 'relative' }} className="no-print-section">
        <div id="report-pdf-print-container" style={{ width: '1020px', padding: '24px', background: '#ffffff', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
          
          {/* Header section with Logo and Generated Date */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #f7931e', paddingBottom: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img src="/bavya-logo.png" style={{ height: '56px', width: 'auto' }} alt="Bavya Logo" />
              <div>
                <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '850', color: '#1e293b', letterSpacing: '0.02em' }}>
                  BAVYA HEALTH SERVICES PVT. LTD.
                </h1>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'block', marginTop: '2px' }}>
                  Material Consumption Report
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '750', display: 'block' }}>Report Range</span>
              <strong style={{ fontSize: '13px', color: '#1e293b' }}>{reportStartDate} to {reportEndDate}</strong>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '750', display: 'block', marginTop: '6px' }}>Generated Date / Time</span>
              <strong style={{ fontSize: '12px', color: '#f7931e' }}>{new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</strong>
            </div>
          </div>

          {/* Grand Summary Metrics Panel for PDF */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Shift Logs</span>
              <strong style={{ fontSize: '18px', color: '#1e293b', marginTop: '2px', lineHeight: '1.2' }}>{allGroupedData.length}</strong>
              <span style={{ fontSize: '8.5px', color: '#64748b', marginTop: '2px' }}>finalized reports</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distinct Units</span>
              <strong style={{ fontSize: '18px', color: '#1e293b', marginTop: '2px', lineHeight: '1.2' }}>{distinctUnitsCount}</strong>
              <span style={{ fontSize: '8.5px', color: '#64748b', marginTop: '2px' }}>active facilities</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grand Consumed</span>
              <strong style={{ fontSize: '18px', color: '#1e293b', marginTop: '2px', lineHeight: '1.2' }}>{grandConsumedQty}</strong>
              <span style={{ fontSize: '8.5px', color: '#64748b', marginTop: '2px' }}>total items</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grand Total Cost</span>
              <strong style={{ fontSize: '18px', color: '#16a34a', marginTop: '2px', lineHeight: '1.2' }}>₹{grandTotalCostVal.toLocaleString('en-IN')}</strong>
              <span style={{ fontSize: '8.5px', color: '#64748b', marginTop: '2px' }}>consumption value</span>
            </div>
          </div>

          {allGroupedData.map(group => {
            let currentSNo = 0;
            let lastItemKey = '';
            const itemsWithSNo = group.items.map((d) => {
              const itemKey = `${d.item_name}_${d.item_code}`;
              if (itemKey !== lastItemKey) {
                currentSNo += 1;
                lastItemKey = itemKey;
              }
              return { ...d, sNo: currentSNo };
            });

            const localItemCounts = {};
            group.items.forEach(item => {
              const itemKey = `${item.item_name}_${item.item_code}`;
              localItemCounts[itemKey] = (localItemCounts[itemKey] || 0) + 1;
            });
            const localItemSpanTracker = {};

            // Compute totals for printable card
            let totOfficeOB = 0;
            let totOfficeRec = 0;
            let totOfficeSent = 0;
            let totOfficeDrawn = 0;
            let totOfficeClosing = 0;
            let totBagOB = 0;
            let totBagRec = 0;
            let totBagSent = 0;
            let totBagCons = 0;
            let totBagClosing = 0;
            let totCost = 0;

            group.items.forEach(item => {
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
                officeReceived = Math.round(item.received_qty || 0);
                officeClosing = Math.round(item.closing_balance || 0);
                bagOB = 0;
                bagReceived = officeConsumed;
                bagConsumed = officeConsumed;
                bagClosing = 0;
              } else {
                officeReceived = 0;
                officeClosing = officeOB;
                bagOB = Math.round(item.received_qty || 0);
                bagReceived = 0;
                bagConsumed = 0;
                bagClosing = bagOB;
              }

              totOfficeOB += officeOB;
              totOfficeRec += officeReceived;
              totOfficeSent += officeSentBack;
              totOfficeDrawn += officeConsumed;
              totOfficeClosing += officeClosing;
              totBagOB += bagOB;
              totBagRec += bagReceived;
              totBagCons += bagConsumed;
              totBagClosing += bagClosing;
              totCost += bagConsumed * (item.unit_mrp || 0);
            });

            return (
              <div key={`print-${group.key}`} className="print-card-group" style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '28px', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#ffffff', position: 'relative' }}>
                
                {/* Watermark in background */}
                <div style={{
                  position: 'absolute',
                  top: '55%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-15deg)',
                  opacity: 0.045,
                  pointerEvents: 'none',
                  zIndex: 0,
                  textAlign: 'center',
                  width: '380px'
                }}>
                  <img src="/bavya-logo.png" style={{ width: '100%', height: 'auto' }} alt="Bavya Logo Watermark" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', padding: '12px', backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', position: 'relative', zIndex: 1 }}>
                  <div>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '750', display: 'block' }}>Project</span>
                    <strong style={{ fontSize: '11px', color: '#1e293b' }}>{group.project || reportProject}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '750', display: 'block' }}>Office / Location</span>
                    <strong style={{ fontSize: '11px', color: '#1e293b' }}>{group.office_name || 'Global'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '750', display: 'block' }}>Shift Type</span>
                    <strong style={{ fontSize: '11px', color: '#1e293b' }}>{group.shift_type === 'shift_1' ? 'Shift 1' : 'Shift 2'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '750', display: 'block' }}>Date / Time</span>
                    <strong style={{ fontSize: '11px', color: '#1e293b' }}>{group.dateTime}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '750', display: 'block' }}>Logged By</span>
                    <strong style={{ fontSize: '11px', color: '#1e293b' }}>{group.logged_by}</strong>
                  </div>
                </div>

                <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', position: 'relative', zIndex: 1, backgroundColor: 'transparent' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '800', width: '35px', borderRight: '1px solid #cbd5e1' }}>S.No.</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '800', borderRight: '1px solid #cbd5e1' }}>Material / Code</th>
                      <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: '800', width: '70px', borderRight: '1px solid #cbd5e1' }}>Batch</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '800', width: '105px', borderRight: '1px solid #cbd5e1' }}>MFG / EXP</th>
                      
                      {/* Store columns */}
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#fff7ed', color: '#c2410c', borderRight: '1px solid #ffe8cc' }}>Store OB</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#fff7ed', color: '#c2410c', borderRight: '1px solid #ffe8cc' }}>Store Rec</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#fff7ed', color: '#c2410c', borderRight: '1px solid #ffe8cc' }}>Store Sent</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#fff7ed', color: '#c2410c', borderRight: '1px solid #ffe8cc' }}>Store Drawn</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', fontWeight: '800', backgroundColor: '#ffd8a8', color: '#c2410c', borderRight: '1px solid #cbd5e1' }}>Store Closing</th>
                      
                      {/* Bag columns */}
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#f0f9ff', color: '#0369a1', borderRight: '1px solid #e0f2fe' }}>Bag OB</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#f0f9ff', color: '#0369a1', borderRight: '1px solid #e0f2fe' }}>Bag Rec</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#f0f9ff', color: '#0369a1', borderRight: '1px solid #e0f2fe' }}>Bag Sent</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#f0f9ff', color: '#0369a1', borderRight: '1px solid #e0f2fe' }}>Bag Cons</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', fontWeight: '800', backgroundColor: '#e0f2fe', color: '#0369a1', borderRight: '1px solid #cbd5e1' }}>Bag Closing</th>

                      {/* Cost columns */}
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', backgroundColor: '#f0fdf4', color: '#15803d', borderRight: '1px solid #bbf7d0' }}>Unit MRP</th>
                      <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px', fontWeight: '800', backgroundColor: '#dcfce7', color: '#15803d' }}>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsWithSNo.map((item, idx) => {
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
                        officeReceived = Math.round(item.received_qty || 0);
                        officeClosing = Math.round(item.closing_balance || 0);
                        bagOB = 0;
                        bagReceived = officeConsumed;
                        bagConsumed = officeConsumed;
                        bagClosing = 0;
                      } else {
                        officeReceived = 0;
                        officeClosing = officeOB;
                        bagOB = Math.round(item.received_qty || 0);
                        bagReceived = 0;
                        bagConsumed = 0;
                        bagClosing = bagOB;
                      }

                      return (
                        <tr key={`print-row-${item.id}-${idx}`} style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderBottom: '1px solid #cbd5e1' }}>
                          <td style={{ padding: '6px', textAlign: 'center', fontWeight: '700', borderRight: '1px solid #cbd5e1' }}>
                            {item.sNo}
                          </td>
                          <td style={{ padding: '6px', fontWeight: '600', borderRight: '1px solid #cbd5e1' }}>
                            <div>{item.item_name}</div>
                            <div style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 'normal' }}>
                              {item.item_code}
                            </div>
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center', fontWeight: '600', color: '#0369a1', borderRight: '1px solid #cbd5e1' }}>
                            {item.batch_number || 'N/A'}
                          </td>
                          <td style={{ padding: '6px', fontSize: '8px', color: '#64748b', borderRight: '1px solid #cbd5e1' }}>
                            <div>M: {item.manufacturing_date || '—'}</div>
                            <div>E: {item.expiry_date || '—'}</div>
                          </td>
                          <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #ffe8cc' }}>{officeOB}</td>
                          <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #ffe8cc' }}>{officeReceived > 0 ? `+${officeReceived}` : '0'}</td>
                          <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #ffe8cc' }}>{officeSentBack > 0 ? `-${officeSentBack}` : '0'}</td>
                          <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #ffe8cc' }}>{officeConsumed > 0 ? `-${officeConsumed}` : '0'}</td>
                          <td style={{ padding: '4px', textAlign: 'center', fontWeight: '700', backgroundColor: '#fff7ed', borderRight: '1px solid #cbd5e1' }}>{officeClosing}</td>
                          <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe' }}>{bagOB}</td>
                          <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe' }}>{bagReceived > 0 ? `+${bagReceived}` : '0'}</td>
                          <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe' }}>-</td>
                          <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe' }}>{bagConsumed}</td>
                          <td style={{ padding: '4px', textAlign: 'center', fontWeight: '700', backgroundColor: '#e0f2fe', borderRight: '1px solid #cbd5e1' }}>{bagClosing}</td>
                          <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0fdf4', borderRight: '1px solid #bbf7d0', color: '#166534' }}>₹{Math.round(item.unit_mrp || 0)}</td>
                          <td style={{ padding: '4px', textAlign: 'center', fontWeight: '700', backgroundColor: '#dcfce7', color: '#15803d' }}>₹{Math.round(bagConsumed * (item.unit_mrp || 0))}</td>
                        </tr>
                      );
                    })}

                    {/* PDF Summary Totals Row */}
                    <tr style={{ backgroundColor: '#f1f5f9', fontWeight: '800', borderTop: '2px solid #cbd5e1' }}>
                      <td colSpan={4} style={{ padding: '6px 8px', textAlign: 'right', borderRight: '1px solid #cbd5e1', fontSize: '9px', textTransform: 'uppercase', color: '#475569' }}>
                        Total Summary
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #ffe8cc' }}>{totOfficeOB}</td>
                      <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #ffe8cc' }}>{totOfficeRec}</td>
                      <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #ffe8cc' }}>{totOfficeSent}</td>
                      <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #ffe8cc' }}>{totOfficeDrawn}</td>
                      <td style={{ padding: '4px', textAlign: 'center', fontWeight: '700', backgroundColor: '#fff7ed', borderRight: '1px solid #cbd5e1' }}>{totOfficeClosing}</td>
                      <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe' }}>{totBagOB}</td>
                      <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe' }}>{totBagRec}</td>
                      <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe' }}>-</td>
                      <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0f9ff', borderRight: '1px solid #e0f2fe' }}>{totBagCons}</td>
                      <td style={{ padding: '4px', textAlign: 'center', fontWeight: '700', backgroundColor: '#e0f2fe', borderRight: '1px solid #cbd5e1' }}>{totBagClosing}</td>
                      <td style={{ padding: '4px', textAlign: 'center', backgroundColor: '#f0fdf4', borderRight: '1px solid #bbf7d0', color: '#cbd5e1' }}>-</td>
                      <td style={{ padding: '4px', textAlign: 'center', fontWeight: '700', backgroundColor: '#dcfce7', color: '#15803d' }}>₹{Math.round(totCost)}</td>
                    </tr>
                  </tbody>
                </table>

                {group.remarks && (
                  <div style={{ margin: '8px', padding: '8px', backgroundColor: 'rgba(248, 250, 252, 0.95)', borderRadius: '4px', border: '1px solid #cbd5e1', position: 'relative', zIndex: 1 }}>
                    <span style={{ fontSize: '8.5px', fontWeight: '800', color: '#475569', display: 'block', textTransform: 'uppercase' }}>Discussion:</span>
                    <p style={{ margin: 0, fontSize: '10px', color: '#334155', whiteSpace: 'pre-wrap' }}>{group.remarks}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
