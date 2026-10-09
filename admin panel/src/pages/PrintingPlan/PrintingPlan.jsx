import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { fetchPrintingPlans, deletePrintingPlan } from '../../redux/slices/printingPlanSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import API from '../../services/api';
import Swal from 'sweetalert2';
import Select from 'react-select';
import ImportExcelModal from './ImportExcelModal';
import { usePrintingPlanLanguage } from '../../hooks/usePrintingPlanLanguage';
import { sortPrintingPlans } from '../../utils/printingPlanSort';
import { buildContiguousGroups, buildMultipleContiguousGroups } from '../../utils/tableGrouping';
import ZoomControl from '../../components/ZoomControl';
import * as XLSX from 'xlsx';
const DoubleScrollContainer = ({ children }) => {
  const topScrollRef = React.useRef(null);
  const bottomScrollRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const [contentWidth, setContentWidth] = React.useState(0);

  const isSyncingLeft = React.useRef(false);
  const isSyncingRight = React.useRef(false);

  const handleTopScroll = (e) => {
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    if (bottomScrollRef.current && topScrollRef.current) {
      isSyncingRight.current = true;
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = (e) => {
    if (isSyncingRight.current) {
      isSyncingRight.current = false;
      return;
    }
    if (topScrollRef.current && bottomScrollRef.current) {
      isSyncingLeft.current = true;
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  React.useEffect(() => {
    if (!bottomScrollRef.current) return;
    
    const updateWidth = () => {
      if (bottomScrollRef.current) {
        setContentWidth(bottomScrollRef.current.scrollWidth);
      }
    };
    
    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });
    
    resizeObserver.observe(bottomScrollRef.current);
    if (bottomScrollRef.current.firstElementChild) {
      resizeObserver.observe(bottomScrollRef.current.firstElementChild);
    }
    
    updateWidth();
    
    return () => resizeObserver.disconnect();
  }, [children]);

  return (
    <div>
      <div 
        ref={topScrollRef} 
        onScroll={handleTopScroll} 
        style={{ overflowX: 'auto', marginBottom: '4px', height: '14px' }}
        className="top-scrollbar"
      >
        <div style={{ width: contentWidth > 0 ? contentWidth : '100%', height: '1px' }}></div>
      </div>
      <div 
        ref={bottomScrollRef} 
        onScroll={handleBottomScroll} 
        style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}
        className="companies-list-desktop"
      >
        <div ref={contentRef} style={{ display: 'inline-block', minWidth: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default function PrintingPlan() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { plans, loading } = useSelector((state) => state.printingPlans);
  const { companies } = useSelector((state) => state.companies || { companies: [] });
  const { brands } = useSelector((state) => state.brands || { brands: [] });
  const { labels, language, toggleLanguage } = usePrintingPlanLanguage();
  
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);
  const [showImportModal, setShowImportModal] = useState(false);
  
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  
  const [importing, setImporting] = useState(false);

  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('printingPlanZoom');
    return saved ? parseInt(saved, 10) : 100;
  });

  useEffect(() => {
    localStorage.setItem('printingPlanZoom', zoom.toString());
  }, [zoom]);

  const fetchPlans = () => {
    dispatch(fetchPrintingPlans({
      date: (!fromDate && !toDate) ? selectedDate : '',
      fromDate,
      toDate,
      search,
      companyId: selectedCompanyId,
      brandId: selectedBrandId
    }));
  };

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchBrands({ pagination: 'false' }));
  }, [dispatch]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchPlans();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [dispatch, selectedDate, fromDate, toDate, search, selectedCompanyId, selectedBrandId]);

  const handleCompanyChange = (companyId) => {
    setSelectedCompanyId(companyId);
    if (companyId && selectedBrandId && companyId !== 'UNASSIGNED') {
      // Check if selected brand belongs to the newly selected company
      const brandObj = brands?.find(b => b._id === selectedBrandId);
      if (brandObj) {
         const bCompId = (brandObj.companyId?._id || brandObj.companyId)?.toString();
         const bComp = (brandObj.company?._id || brandObj.company)?.toString();
         if (bCompId !== companyId?.toString() && bComp !== companyId?.toString()) {
            setSelectedBrandId(''); // Reset if invalid combo
         }
      }
    }
  };

  const handleReset = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    setSelectedDate(todayStr);
    setFromDate('');
    setToDate('');
    setSearch('');
    setSelectedCompanyId('');
    setSelectedBrandId('');
    dispatch(fetchPrintingPlans({ date: todayStr }));
  };

  const filteredPlans = useMemo(() => {
    let result = plans || [];
    
    if (selectedCompanyId) {
      if (selectedCompanyId === 'UNASSIGNED') {
         result = result.filter(p => !p.companyId || (p.canonicalCompanyId === 'UNASSIGNED'));
      } else {
         result = result.filter(p => {
            const pCompanyId = (p.companyId?._id || p.companyId)?.toString();
            return pCompanyId === selectedCompanyId?.toString();
         });
      }
    }
    
    if (selectedBrandId) {
      result = result.filter(p => {
         const pBrandId = (p.brandId?._id || p.brandId)?.toString();
         return pBrandId === selectedBrandId?.toString();
      });
    }
    
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p => 
        (p.bottleName?.toLowerCase().includes(s)) ||
        (p.brandId?.name?.toLowerCase().includes(s)) ||
        (p.brandName?.toLowerCase().includes(s)) ||
        (p.variantId?.variantName?.toLowerCase().includes(s)) ||
        (p.variantName?.toLowerCase().includes(s))
      );
    }
    return result;
  }, [plans, selectedCompanyId, selectedBrandId, search]);

  const handleDelete = (id) => {
    Swal.fire({
      title: 'Are you sure?',
      text: 'Do you really want to delete this plan?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deletePrintingPlan(id)).then(() => {
          dispatch(fetchPrintingPlans({ date: selectedDate }));
          Swal.fire('Deleted!', 'Plan has been deleted.', 'success');
        });
      }
    });
  };

  const handleImportPrevious = async () => {
    try {
      const defaultPrevDate = new Date(selectedDate);
      defaultPrevDate.setDate(defaultPrevDate.getDate() - 1);
      const defaultPrevDateStr = defaultPrevDate.toISOString().split('T')[0];
      
      const result = await Swal.fire({
        title: 'Import Previous Plan?',
        html: `
          <p class="mb-3 text-muted">Select the date you want to import the Printing Plan from.</p>
          <div class="form-group text-start px-3">
            <label class="form-label fw-bold small text-muted">Source Date <span class="text-danger">*</span></label>
            <input type="date" id="swal-source-date" class="form-control shadow-none" style="border-radius: 8px" value="${defaultPrevDateStr}" max="${defaultPrevDateStr}">
          </div>
          <p class="mt-3 mb-0 small text-muted">This will copy all plans from the selected date and create new entries for <strong>${selectedDate}</strong>.</p>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, import it!',
        preConfirm: () => {
          const sourceDate = document.getElementById('swal-source-date').value;
          if (!sourceDate) {
            Swal.showValidationMessage('Please select a source date');
          }
          return sourceDate;
        }
      });

      if (!result.isConfirmed) {
         return;
      }
      
      const sourceDate = result.value;

      setImporting(true);
      const res = await API.post('/printing-plan/import-previous', { targetDate: selectedDate, sourceDate });
      if (res.data.success) {
        dispatch(fetchPrintingPlans({ date: selectedDate }));
        Swal.fire('Imported!', 'Previous plan imported successfully.', 'success');
      }
    } catch(err) {
      Swal.fire('Error', err.response?.data?.message || 'Failed to import previous day', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    try {
      if (filteredPlans.length === 0) {
        Swal.fire('No Data', 'There is no data to export for the selected filters.', 'info');
        return;
      }
      
      const isShrenoExport = filteredPlans.length > 0 && (filteredPlans[0].companyId?.name || filteredPlans[0].company?.name || filteredPlans[0].companyName || '').toUpperCase().includes('SHRENO');

      let exportedData = [];
      
      const comps = Array.from(new Set(filteredPlans.map(p => (p.companyId?.name || p.companyName || p.company?.name || p.brandId?.companyId?.name || p.brandId?.company?.name || 'UNASSIGNED'))));
      
      comps.forEach(comp => {
         const compPlans = filteredPlans.filter(p => (p.companyId?.name || p.companyName || p.company?.name || p.brandId?.companyId?.name || p.brandId?.company?.name || 'UNASSIGNED') === comp);
         const sortedCompPlans = [...compPlans].sort(sortPrintingPlans);
         
         sortedCompPlans.forEach((p, index) => {
            if (isShrenoExport) {
                exportedData.push({
                  'Sr No': index + 1,
                  'Company': comp,
                  'Date': p.planDate ? new Date(p.planDate).toLocaleDateString() : 'N/A',
                  'Bottle Name': p.bottleName || 'N/A',
                  'Coating Shade': p.coatingShade || 'N/A',
                  'Printing To Be Done': p.printingToBeDone || 'N/A',
                  'Text Color': p.textColor || 'N/A',
                  'Plain/Coloured Stock': p.plainBottleStock ?? '',
                  'Order Qty': p.orderQty ?? '',
                  'Balance To Make': p.balanceToMake ?? '',
                  'Bottle Per Box': p.boxQty ?? '',
                  'No. Of Order Boxes': p.noOfBoxes ?? '',
                  'Ready Printed Qty': p.producedQty ?? 0,
                  'Balance To Be Dispatched': p.dispatchBalance ?? '',
                  'Sold Qty': p.soldQty ?? '',
                  'Ready Boxes': p.readyBoxes ?? '',
                  'Remarks': p.remarks || ''
                });
            } else {
                exportedData.push({
                  'Sr No': index + 1,
                  'Company': comp,
                  'Brand': p.brandId?.name || p.brandName || 'N/A',
                  'Date': p.planDate ? new Date(p.planDate).toLocaleDateString() : 'N/A',
                  'Bottle Name': p.bottleName || 'N/A',
                  'Coating Shade': p.coatingShade || 'N/A',
                  'Printing To Be Done': p.printingToBeDone || 'N/A',
                  'Plain/Coloured Stock': p.plainBottleStock ?? '',
                  'Order Qty': p.orderQty ?? '',
                  'Balance To Make': p.balanceToMake ?? '',
                  'Bottle Per Box': p.boxQty ?? '',
                  'No. Of Order Boxes': p.noOfBoxes ?? '',
                  'Ready Printed Qty': p.producedQty ?? 0,
                  'Balance To Be Dispatched': p.dispatchBalance ?? '',
                  'Sold Qty': p.soldQty ?? '',
                  'Ready Boxes': p.readyBoxes ?? '',
                  'Remarks': p.remarks || ''
                });
            }
         });
      });

      const worksheet = XLSX.utils.json_to_sheet(exportedData);
      
      const colWidths = isShrenoExport ? [
        { wch: 5 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 15 },
        { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 22 },
        { wch: 10 }, { wch: 12 }, { wch: 20 }
      ] : [
        { wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 25 },
        { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 22 },
        { wch: 10 }, { wch: 12 }, { wch: 20 }
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Printing Plan`);

      let filename = `Printing_Plan`;
      if (selectedDate) filename += `_${selectedDate}`;
      if (fromDate) filename += `_from_${fromDate}`;
      if (toDate) filename += `_to_${toDate}`;
      filename += ".xlsx";

      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error(err);
      Swal.fire('Export Failed', 'An error occurred while generating the export.', 'error');
    }
  };

  const renderGroupedTables = (planList, showDate = false) => {
    if (!planList || planList.length === 0) {
      return renderDailyTable([], showDate, 0);
    }
    const groupedByCompany = {};
    planList.forEach(plan => {
      const compName = plan.companyId?.name || plan.brandId?.companyId?.name || plan.brandId?.company?.name || plan.company?.name || plan.companyName || 'Unidentified Company';
      if (!groupedByCompany[compName]) groupedByCompany[compName] = [];
      groupedByCompany[compName].push(plan);
    });

    let currentSrNo = 0;
    return Object.keys(groupedByCompany).map(compName => {
      const startSrNo = currentSrNo;
      currentSrNo += groupedByCompany[compName].length;
      return (
        <div key={compName} className="mb-4">
          <h5 className="text-center py-3 bg-light border-top border-bottom text-uppercase fw-bold text-dark tracking-wide mb-0" style={{ letterSpacing: '2px' }}>
            {compName}
          </h5>
          {renderDailyTable(groupedByCompany[compName].sort(sortPrintingPlans), showDate, startSrNo)}
        </div>
      )
    });
  };

  const renderDailyTable = (planList, showDate = false, startSrNo = 0) => {
    
    const isShreno = planList.length > 0 && (planList[0].companyId?.name || planList[0].company?.name || planList[0].companyName || '').toUpperCase().includes('SHRENO');
    
    const getBoundary = (r) => `${r.companyId?._id || r.companyId || r.companyName || r.company}_${r.planDate}`;
    
    // Use a stable ID for non-grouped SHRENO columns instead of Math.random()
    const getRowStableId = (r) => r._id || `temp-${r.excelRowNumber || r.srNo || Math.floor(Math.random() * 1000000)}`;
    
    const groupConfigs = [
        { idKey: '_cBottle', keySelector: r => `${getBoundary(r)}_${r.bottleName}` },
        { idKey: '_cShade', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.coatingShade}` },
        { idKey: '_cPrinting', keySelector: r => isShreno ? `nogroup_${getRowStableId(r)}` : `${getBoundary(r)}_${r.bottleName}_${r.coatingShade}_${r.printingToBeDone}` },
        { idKey: '_cTextColor', keySelector: r => isShreno ? `nogroup_${getRowStableId(r)}` : `${getBoundary(r)}_${r.bottleName}_${r.coatingShade}_${r.printingToBeDone}_${r.textColor}` },
        { idKey: '_cStock', keySelector: r => {
             const shade = r.coatingShade ? String(r.coatingShade).trim().toUpperCase() : '';
             if (shade === 'PLAIN') return `${getBoundary(r)}_${r.bottleName}_${r.plainBottleStock}`;
             return `nogroup_${getRowStableId(r)}`;
        }},
        { idKey: '_cOrderQty', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.orderQty}` },
        { idKey: '_cBalance', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.balanceToMake}` },
        { idKey: '_cBoxQty', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.boxQty}` },
        { idKey: '_cNoOfBoxes', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.noOfBoxes}` },
        { idKey: '_cProduced', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.producedQty}` },
        { idKey: '_cDispatch', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.dispatchBalance}` },
        { idKey: '_cSold', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.soldQty}` },
        { idKey: '_cReadyBoxes', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.readyBoxes}` },
        { idKey: '_cRemarks', keySelector: r => `${getBoundary(r)}_${r.bottleName}_${r.remarks}` }
    ];
    
    const { contiguousList: contiguousPlanList, groupSpans } = buildMultipleContiguousGroups(planList, groupConfigs);
    
    const renderedSets = {
        _cBottle: new Set(),
        _cShade: new Set(),
        _cPrinting: new Set(),
        _cTextColor: new Set(),
        _cStock: new Set(),
        _cOrderQty: new Set(),
        _cBalance: new Set(),
        _cBoxQty: new Set(),
        _cNoOfBoxes: new Set(),
        _cProduced: new Set(),
        _cDispatch: new Set(),
        _cSold: new Set(),
        _cReadyBoxes: new Set(),
        _cRemarks: new Set()
    };

    const shrenoComponentHeaders = isShreno ? 
        (contiguousPlanList.find(p => p.componentHeadersList && p.componentHeadersList.length > 0)?.componentHeadersList || []) 
        : [];

    return (
      <table className="data-table" style={{ minWidth: '1800px', borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
          <tr style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', color: 'white' }}>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.sr}</th>
            {showDate && <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.date}</th>}
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.bottleName}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.coatingShade}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.printingToBeDone}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{isShreno && language === 'gu' ? 'ટાઈપ' : labels.textColor}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.plainColouredBottleStock}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.orderQty}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.balanceToMake}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.bottlePerBox}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.noOfOrderBoxes}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.readyPrintedQty}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.balanceToBeDispatched}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.soldQty}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.readyBoxes}</th>
            {shrenoComponentHeaders.map((comp, idx) => (
                <th key={`comp_th_${idx}`} className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{comp}</th>
            ))}
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.remarks}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ width: 100, fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.actions}</th>
          </tr>
        </thead>
        <tbody>
          {contiguousPlanList.length > 0 ? contiguousPlanList.map((plan, index) => {
            
            const renderGroupedTd = (colKey, content, className = "py-3 text-center align-middle") => {
                const groupId = plan[colKey];
                if (!groupId) return <td className={className}>{content}</td>;
                const isFirst = !renderedSets[colKey].has(groupId);
                if (isFirst) {
                    renderedSets[colKey].add(groupId);
                    const rSpan = groupSpans[colKey][groupId] || 1;
                    return <td className={className} rowSpan={rSpan}>{content}</td>;
                }
                return null;
            };

            const isFirstInBottleBlock = index === 0 || contiguousPlanList[index - 1]._cBottle !== plan._cBottle;
            
            const rowClasses = [
                'align-middle',
                'transition-all',
                'hover-bg-light',
                isFirstInBottleBlock && index !== 0 ? 'bottle-group-divider' : '',
                (!renderedSets._cBottle.has(plan._cBottle)) ? 'border-top' : 'border-bottom'
            ].filter(Boolean).join(' ');

            const isBottleFirst = !renderedSets._cBottle.has(plan._cBottle);
            const isShadeFirst = !renderedSets._cShade.has(plan._cShade);
            const isPrintingFirst = !renderedSets._cPrinting.has(plan._cPrinting);
            const isTextFirst = !renderedSets._cTextColor.has(plan._cTextColor);

            // UI Debug log as explicitly requested
            if (isShreno) {
                console.log("[SHRENO UI FINAL ROW]", {
                    rowNumber: index,
                    bottleName: plan.bottleName,
                    coatingShade: plan.coatingShade,
                    printingToBeDone: plan.printingToBeDone,
                    textColor: plan.textColor
                });
                
                console.log("[SHRENO CELL TRACE]", {
                    rowNumber: index,
                    renderBottleCell: isBottleFirst,
                    renderShadeCell: isShadeFirst,
                    renderPrintingCell: isPrintingFirst,
                    renderTextColorCell: isTextFirst,

                    bottleValue: plan.bottleName,
                    shadeValue: plan.coatingShade,
                    printingValue: plan.printingToBeDone,
                    textColorValue: plan.textColor
                });
            }

            return (
            <tr key={plan._id || index} className={rowClasses}>
              <td className="py-3 ps-4 text-start">
                <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{(startSrNo + index + 1).toString().padStart(2, '0')}</span>
              </td>
              {showDate && <td className="py-3 text-center">{new Date(plan.planDate).toLocaleDateString()}</td>}
              
              {renderGroupedTd('_cBottle', plan.bottleName || '*', "py-3 text-center fw-600 text-dark align-middle")}
              
              {renderGroupedTd('_cShade', plan.coatingShade ? (
                <span className="badge bg-soft-warning text-warning-accent px-2 py-1" style={{ fontSize: 10 }}>{plan.coatingShade}</span>
              ) : '-')}
              
              {renderGroupedTd('_cPrinting', (
                <span className="badge bg-soft-info text-info px-2 py-1" style={{ fontSize: 11 }}>{plan.printingToBeDone || '-'}</span>
              ))}
              
              {renderGroupedTd('_cTextColor', (
                <span className="badge bg-soft-secondary text-secondary px-2 py-1" style={{ fontSize: 11 }}>{plan.textColor || '-'}</span>
              ))}
              
              {renderGroupedTd('_cStock', plan.plainBottleStock !== null && plan.plainBottleStock !== undefined && plan.plainBottleStock !== '' ? plan.plainBottleStock : '')}
              
              {renderGroupedTd('_cOrderQty', plan.orderQty, "py-3 text-center fw-bold")}
              
              {renderGroupedTd('_cBalance', (
                <>
                  {plan.balanceToMake}
                  {plan.balanceToMake <= 0 && <span className="d-block mt-1 badge bg-success" style={{ fontSize: 10 }}>COMPLETED</span>}
                </>
              ), `py-3 text-center fw-bold align-middle ${plan.balanceToMake <= 0 ? 'text-success' : 'text-danger'}`)}
              
              {renderGroupedTd('_cBoxQty', plan.boxQty !== null && plan.boxQty !== undefined && plan.boxQty > 0 ? plan.boxQty : '-')}
              
              {renderGroupedTd('_cNoOfBoxes', plan.noOfBoxes || '-')}
              {renderGroupedTd('_cProduced', plan.producedQty || 0)}
              {renderGroupedTd('_cDispatch', plan.dispatchBalance || 0)}
              {renderGroupedTd('_cSold', plan.soldQty || 0)}
              {renderGroupedTd('_cReadyBoxes', plan.readyBoxes || '-')}
              
              {shrenoComponentHeaders.map((comp, idx) => {
                  const compData = plan.components?.find(c => (c.itemType || c.componentType) === comp);
                  return <td key={`comp_td_${idx}`} className="py-3 text-center align-middle fw-bold">{compData ? compData.quantity : '-'}</td>;
              })}
              
              {renderGroupedTd('_cRemarks', plan.remarks || '-', "py-3 text-center small text-muted")}
              
              <td className="py-3 text-center">
                <div className="d-flex gap-2 justify-content-center">
                  <Link to={`/printing-plan/view/${plan._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View">
                    <i className="bi bi-eye fs-6"></i>
                  </Link>
                  <Link 
                     to={`/printing-plan/edit/${contiguousPlanList.filter(p => p._cBottle === plan._cBottle).map(p => p._id).join(',')}`} 
                     state={{ editGroup: contiguousPlanList.filter(p => p._cBottle === plan._cBottle) }}
                     className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" 
                     title="Edit Group"
                  >
                    <i className="bi bi-pencil-square fs-6"></i>
                  </Link>
                  <button onClick={() => handleDelete(plan._id)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete">
                    <i className="bi bi-trash fs-6"></i>
                  </button>
                </div>
              </td>
            </tr>
          );
          }) : (
            <tr>
              <td colSpan={showDate ? "19" : "18"} className="text-center py-5 text-muted">No plans found</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <div className="page-content">
      <style>{`
        tr.bottle-group-divider > td {
          border-top: 2px solid #adb5bd !important;
        }
        .data-table th, .data-table td {
          border-right: 1px solid #dee2e6;
        }
        .data-table td:first-child, .data-table th:first-child {
          border-left: 1px solid #dee2e6;
        }
        /* Zoom-Aware Workspace */
        .zoomable-workspace {
          --z: var(--zoom-scale, 1);
          font-size: calc(14px * var(--z));
        }
        .zoomable-workspace table.data-table {
          min-width: calc(1800px * var(--z)) !important;
        }
        .zoomable-workspace th, .zoomable-workspace td {
          padding: calc(1rem * var(--z)) calc(0.5rem * var(--z)) !important;
        }
        .zoomable-workspace th {
          font-size: calc(15px * var(--z)) !important;
        }
        .zoomable-workspace h5 {
          font-size: calc(1.25rem * var(--z)) !important;
          padding: calc(1rem * var(--z)) 0 !important;
          letter-spacing: calc(2px * var(--z)) !important;
        }
        .zoomable-workspace .badge {
          font-size: calc(11px * var(--z)) !important;
          padding: calc(0.25rem * var(--z)) calc(0.5rem * var(--z)) !important;
        }
        .zoomable-workspace .btn {
          font-size: calc(14px * var(--z)) !important;
          padding: calc(0.25rem * var(--z)) calc(0.5rem * var(--z)) !important;
        }
        .zoomable-workspace .btn i {
          font-size: calc(16px * var(--z)) !important;
        }
      `}</style>
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title mb-0">Printing Plan</h1>
          <p className="page-subtitle mb-0">Manage and track your printing plans</p>
        </div>
        <div className="d-flex align-items-center gap-3 productions-page-actions">
          <button onClick={toggleLanguage} className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold">
            {language === 'en' ? 'ગુજરાતી' : 'English'}
          </button>
          <button onClick={handleExport} className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3">
            <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-outline-success shadow-sm px-4 py-2 rounded-3">
            <i className="bi bi-file-earmark-excel-fill me-2" /> {labels.importExcel}
          </button>
          <Link to={`/printing-plan/add?date=${selectedDate}`} className="btn-accent shadow-sm px-4 py-2 rounded-3">
            <i className="bi bi-plus-lg me-2" /> {labels.addPlan}
          </Link>
        </div>
      </div>

      <div className="dash-card mb-4">
        <div className="dash-card-body p-3 border-bottom bg-white companies-dash-toolbar">
          <div className="row g-3 align-items-end productions-filters-panel">
            {/* Date Filter */}
            <div className="col-12 col-sm-6 col-md-4 col-lg-2">
              <label className="small text-muted fw-bold mb-1 d-block">{labels.date}</label>
              <input 
                type="date" 
                className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100" 
                value={selectedDate} 
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setFromDate('');
                  setToDate('');
                }} 
                style={{ borderRadius: 10, height: 38 }} 
              />
            </div>

            {/* From Date Filter */}
            <div className="col-12 col-sm-6 col-md-4 col-lg-2">
              <label className="small text-muted fw-bold mb-1 d-block">{labels.fromDate}</label>
              <input 
                type="date" 
                className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100" 
                value={fromDate} 
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setSelectedDate('');
                }} 
                style={{ borderRadius: 10, height: 38 }} 
              />
            </div>

            {/* To Date Filter */}
            <div className="col-12 col-sm-6 col-md-4 col-lg-2">
              <label className="small text-muted fw-bold mb-1 d-block">{labels.toDate}</label>
              <input 
                type="date" 
                className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100" 
                value={toDate} 
                onChange={(e) => {
                  setToDate(e.target.value);
                  setSelectedDate('');
                }} 
                style={{ borderRadius: 10, height: 38 }} 
              />
            </div>

            {/* Company Filter */}
            <div className="col-12 col-sm-6 col-md-4 col-lg-2">
              <label className="small text-muted fw-bold mb-1 d-block">{labels.company || 'Company'}</label>
              <Select
                options={[{ value: '', label: 'All Companies' }, ...(companies || []).map(c => ({ value: c._id, label: c.name })), { value: 'UNASSIGNED', label: 'UNASSIGNED' }]}
                value={selectedCompanyId ? (selectedCompanyId === 'UNASSIGNED' ? { value: 'UNASSIGNED', label: 'UNASSIGNED' } : { value: selectedCompanyId, label: companies?.find(c => c._id === selectedCompanyId)?.name || 'Unknown' }) : { value: '', label: 'All Companies' }}
                onChange={(option) => handleCompanyChange(option.value)}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
              />
            </div>

            {/* Search */}
            <div className="col-12 col-sm-6 col-md-4 col-lg-2">
              <label className="small text-muted fw-bold mb-1 d-block">{labels.search}</label>
              <div className="search-input-wrapper position-relative">
                <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
                <input
                  type="text"
                  className="form-control form-control-sm border-light-subtle bg-light ps-5 shadow-none w-100"
                  placeholder="Search bottle name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ borderRadius: 10, height: 38 }}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="col-12 col-sm-6 col-md-4 col-lg-2">
              <button 
                onClick={handleReset} 
                type="button"
                className="btn btn-sm btn-light border-light-subtle w-100" 
                style={{ borderRadius: 10, fontWeight: 600, height: 38 }}
              >
                Reset Filters
              </button>
            </div>
            {/* Zoom Control */}
            <div className="col-12 col-md-auto ms-md-auto d-flex align-items-end justify-content-end mt-3 mt-md-0">
               <ZoomControl value={zoom} onChange={setZoom} />
            </div>
          </div>
        </div>

        <div className="p-0">
          {/* Data Rendering */}
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : (!filteredPlans || filteredPlans.length === 0) ? (
            <div className="text-center py-5" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="bg-light rounded-circle d-flex align-items-center justify-content-center mb-4" style={{ width: '80px', height: '80px' }}>
                <i className="bi bi-calendar-x text-muted" style={{ fontSize: '2rem' }}></i>
              </div>
              <h4 className="text-dark fw-bold mb-2">No Printing Plan Found</h4>
              
              <div className="d-flex gap-3 align-items-center justify-content-center">
                <div style={{ width: '260px' }}>
                  <Link to={`/printing-plan/add?date=${selectedDate}`} className="btn btn-accent py-2 w-100 d-flex align-items-center justify-content-center" style={{ borderRadius: '8px', whiteSpace: 'nowrap' }}>
                    <i className="bi bi-plus-circle me-2"></i> Create New Plan
                  </Link>
                </div>
                {(!fromDate && !toDate) && (
                  <div style={{ width: '260px' }}>
                    <button 
                      onClick={handleImportPrevious} 
                      className="btn btn-outline-secondary py-2 w-100 d-flex align-items-center justify-content-center" 
                      style={{ borderRadius: '8px', whiteSpace: 'nowrap' }}
                      disabled={importing}
                    >
                      {importing ? (
                        <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Importing...</>
                      ) : (
                        <><i className="bi bi-clock-history me-2"></i> Import Previous Plan</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
             <DoubleScrollContainer>
                <div className="zoomable-workspace" style={{ '--zoom-scale': zoom / 100 }}>
                  {renderGroupedTables(filteredPlans, !!(fromDate || toDate))}
                </div>
             </DoubleScrollContainer>
          )}
        </div>
      </div>

      <ImportExcelModal 
        show={showImportModal} 
        onClose={() => setShowImportModal(false)} 
        onImportComplete={() => fetchPlans()} 
      />
    </div>
  );
}
