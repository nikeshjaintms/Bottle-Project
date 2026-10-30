import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { fetchIncoming, deleteIncoming } from '../../redux/slices/incomingSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { PO_REQUIRED_COMPANY } from '../../config/incomingConfig';
import Select from 'react-select';
import ShrenoIncomingTable from './ShrenoIncomingTable';
import IncomingImportModal from './IncomingImportModal';
import { Can } from '../../context/AbilityContext';
import Swal from 'sweetalert2';
import api from '../../services/api';
import * as XLSX from 'xlsx';

export default function IncomingList() {
  const dispatch = useDispatch();
  const { data: incomings, loading, totalPages, total, page } = useSelector(state => state.incoming);
  const { companies } = useSelector(state => state.companies);
  const { items: bottlePerBoxes } = useSelector(state => state.bottlePerBox);
  const { bottleSpecs } = useSelector(state => state.bottleSpecs);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showImportModal, setShowImportModal] = useState(false);
  
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [bottleFilter, setBottleFilter] = useState('');
  
  const { companyId } = useParams();
  const navigate = useNavigate();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get("page") || '';
  const currentPage = Number(urlPage) || page || 1;

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: "false" }));
    if (companyId) {
      dispatch(fetchBottlePerBoxes({ pagination: "false" }));
      dispatch(fetchBottleSpecs({ pagination: "false" }));
    }
  }, [dispatch, companyId]);

  const isShreno = React.useMemo(() => {
    if (!companyId || !companies) return false;
    if (companyId === PO_REQUIRED_COMPANY.id) return true;
    const selectedCompany = companies.find(c => c._id === companyId);
    if (selectedCompany && selectedCompany.name.trim().toLowerCase() === PO_REQUIRED_COMPANY.name.trim().toLowerCase()) {
      return true;
    }
    return false;
  }, [companyId, companies]);

  const selectedCompany = React.useMemo(() => {
    if (!companyId || !companies) return null;
    return companies.find(c => c._id === companyId);
  }, [companyId, companies]);

  // Calculate which bottles have actual incoming records for this company
  // Fetch all incoming data (no pagination) for bottle list calculation
  const { data: allIncomings } = useSelector(state => state.incoming);
  const [allIncomingsForBottles, setAllIncomingsForBottles] = useState([]);

  useEffect(() => {
    if (companyId) {
      // Fetch all incoming records for this company without pagination
      dispatch(fetchIncoming({ pagination: "false", companyId, search: '', status: '' })).then(res => {
        if (res.payload && res.payload.data) {
          setAllIncomingsForBottles(res.payload.data);
        }
      });
    }
  }, [companyId, dispatch]);

  const availableBottlesWithRecords = React.useMemo(() => {
    const dataToUse = allIncomingsForBottles.length > 0 ? allIncomingsForBottles : incomings;
    if (!dataToUse || !Array.isArray(dataToUse) || dataToUse.length === 0) return [];
    
    const bottleIds = new Set();
    dataToUse.forEach(inc => {
      if (inc.items && Array.isArray(inc.items)) {
        inc.items.forEach(item => {
          if (item.bottleId) {
            // Handle both object IDs and string IDs
            const id = typeof item.bottleId === 'object' ? (item.bottleId._id || item.bottleId.id) : item.bottleId;
            if (id) {
              bottleIds.add(String(id));
            }
          }
        });
      }
    });
    
    // Return only bottlePerBoxes that have incoming records
    return (bottlePerBoxes || []).filter(b => bottleIds.has(String(b._id)));
  }, [allIncomingsForBottles, incomings, bottlePerBoxes]);

  // Auto-select first bottle when company changes (only once per company)
  const [autoSelectDone, setAutoSelectDone] = useState(false);
  useEffect(() => {
    if (companyId) {
      setAutoSelectDone(false);
      setBottleFilter('');
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId && !autoSelectDone && bottleFilter === '' && availableBottlesWithRecords.length > 0) {
      const firstBottleId = availableBottlesWithRecords[0]._id;
      setBottleFilter(firstBottleId);
      setAutoSelectDone(true);
      setSearchParams({ page: 1 });
    }
  }, [availableBottlesWithRecords, autoSelectDone, companyId, bottleFilter]);

  useEffect(() => {
    if (isShreno) {
      dispatch(fetchIncoming({ pagination: "false", search: searchTerm, status: statusFilter, companyId, fromDate, toDate, bottleName: bottleFilter }));
    } else {
      dispatch(fetchIncoming({ page: currentPage, limit: itemsPerPage, search: searchTerm, status: statusFilter, companyId, fromDate, toDate, bottleName: bottleFilter }));
    }
  }, [dispatch, currentPage, itemsPerPage, searchTerm, statusFilter, companyId, isShreno, fromDate, toDate, bottleFilter]);
  
  const handlePageChange = (newPage) => {
    setSearchParams({ page: newPage });
  };

  const handleDelete = (id, deliveryNumber) => {
    Swal.fire({
      title: 'Delete Record?',
      text: `Are you sure you want to delete the ENTIRE delivery "${deliveryNumber}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteIncoming(id)).then(res => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Record removed.', 'success');
            dispatch(fetchIncoming({ page: currentPage, limit: itemsPerPage, search: searchTerm, status: statusFilter, companyId }));
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
          }
        });
      }
    });
  };

  const handleDeleteItem = (inc, itemIdx) => {
    if (inc.items.length === 1) {
      return handleDelete(inc._id, inc.deliveryNumber);
    }

    Swal.fire({
      title: 'Delete Item?',
      text: `Are you sure you want to remove this item from delivery "${inc.deliveryNumber}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, remove it!'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const updatedItems = [...inc.items];
          updatedItems.splice(itemIdx, 1);
          
          const formattedItems = updatedItems.map(item => ({
             bottleId: item.bottleId?._id || item.bottleId,
             box: item.box,
             qty: item.qty,
             totalQty: item.totalQty
          }));
          
          const payload = {
            date: inc.date || inc.documentDate,
            deliveryNumber: inc.deliveryNumber,
            billToId: inc.billToId?._id || inc.billToId,
            poDate: inc.poDate,
            poNo: inc.poNo,
            poOrderQty: inc.poOrderQty,
            items: formattedItems
          };
          
          await api.put(`/incoming/${inc._id}`, payload);
          Swal.fire('Removed!', 'Item removed from delivery.', 'success');
          dispatch(fetchIncoming({ page: currentPage, limit: itemsPerPage, search: searchTerm, status: statusFilter, companyId }));
        } catch (error) {
           Swal.fire('Error!', error.response?.data?.message || 'Failed to remove item.', 'error');
        }
      }
    });
  };

  const handleExport = async () => {
    try {
      Swal.fire({
        title: 'Generating Export...',
        text: 'Please wait while we fetch the data.',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const response = await api.get('/incoming', {
        params: {
          search: searchTerm,
          status: statusFilter,
          companyId,
          fromDate,
          toDate,
          bottleName: bottleFilter,
          pagination: 'false'
        }
      });

      const allData = response.data.data || [];

      if (allData.length === 0) {
        Swal.fire('No Data', 'There is no data to export for the selected filters.', 'info');
        return;
      }

      let exportedData = [];
      
      allData.forEach((inc, incIdx) => {
          if (inc.items && inc.items.length > 0) {
              inc.items.forEach((item, itemIdx) => {
                  exportedData.push({
                      'Sr No': `${incIdx + 1}.${itemIdx + 1}`,
                      'Date': inc.date ? new Date(inc.date).toLocaleDateString() : (inc.documentDate ? new Date(inc.documentDate).toLocaleDateString() : 'N/A'),
                      'Delivery Number': inc.deliveryNumber || inc.challanNo || 'N/A',
                      'Company': inc.billToId?.name || inc.companyId?.name || 'N/A',
                      'PO No': inc.poNo || 'N/A',
                      'PO Date': inc.poDate ? new Date(inc.poDate).toLocaleDateString() : 'N/A',
                      'Bottle Name': item.bottleId?.plainBottleName || item.bottleId?.bottleName || 'N/A',
                      'Box': item.box || 0,
                      'Qty/Box': item.qty || 0,
                      'Total Qty': item.totalQty || 0
                  });
              });
          } else {
              exportedData.push({
                  'Sr No': incIdx + 1,
                  'Date': inc.date ? new Date(inc.date).toLocaleDateString() : (inc.documentDate ? new Date(inc.documentDate).toLocaleDateString() : 'N/A'),
                  'Delivery Number': inc.deliveryNumber || inc.challanNo || 'N/A',
                  'Company': inc.billToId?.name || inc.companyId?.name || 'N/A',
                  'PO No': inc.poNo || 'N/A',
                  'PO Date': inc.poDate ? new Date(inc.poDate).toLocaleDateString() : 'N/A',
                  'Bottle Name': 'N/A',
                  'Box': 0,
                  'Qty/Box': 0,
                  'Total Qty': 0
              });
          }
      });

      const worksheet = XLSX.utils.json_to_sheet(exportedData);
      worksheet['!cols'] = [
        { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 25 },
        { wch: 10 }, { wch: 12 }, { wch: 15 }
      ];
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Incoming`);

      let filename = `Incoming`;
      if (fromDate) filename += `_from_${fromDate}`;
      if (toDate) filename += `_to_${toDate}`;
      filename += ".xlsx";

      XLSX.writeFile(workbook, filename);
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire('Export Failed', 'An error occurred while generating the export.', 'error');
    }
  };

  return (
    <div className="page-content incoming-module-page incoming-module-list">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div className="d-flex align-items-center gap-3">
          {companyId && (
            <button onClick={() => navigate('/incoming')} className="btn-ghost border-0" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
            </button>
          )}
          <div>
            <h1 className="page-title mb-0">Incoming Register{selectedCompany ? ` - ${selectedCompany.name}` : ''}</h1>
            <p className="page-subtitle mb-0">Record plain bottle stock against delivery</p>
          </div>
        </div>
        <div className="d-flex gap-2">
          {companyId && (
            <button onClick={handleExport} className="btn btn-outline-accent shadow-sm px-4 py-2 rounded-3" style={{ fontWeight: 600 }}>
              <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
            </button>
          )}
          <Can I="create" a="incoming">
            <button 
              className="btn btn-outline-success shadow-sm px-4 py-2 rounded-3"
              onClick={() => setShowImportModal(true)}
              title="Import from Excel"
              style={{ fontWeight: 600 }}
            >
              <i className="bi bi-file-earmark-excel me-2" /> Import Excel
            </button>
          </Can>
          <Can I="create" a="incoming">
            <Link to="/incoming/add" className="btn-accent companies-header-action">
              <i className="bi bi-plus-lg me-2" /> New Incoming
            </Link>
          </Can>
        </div>
      </div>

      {companyId && (
        <div className="dash-card mb-4 border-top-accent" style={{ borderTop: '3px solid var(--accent)' }}>
          <div className="dash-card-body p-3">
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-funnel text-accent fw-bold" style={{ fontSize: 18 }}></i>
              <h6 className="mb-0 fw-bold text-dark">Filter by Bottle Name & Date</h6>
            </div>
            <div className="row g-3 align-items-end">
              <div className="col-12 col-sm-6 col-md-3 col-lg-2">
                <label className="small text-muted fw-bold mb-1 d-block">From</label>
                <input
                  type="date"
                  className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                  style={{ borderRadius: 10, height: 38 }}
                  value={fromDate}
                  onChange={(e) => {
                    setSearchParams({ page: 1 });
                    setFromDate(e.target.value);
                  }}
                />
              </div>
              <div className="col-12 col-sm-6 col-md-3 col-lg-2">
                <label className="small text-muted fw-bold mb-1 d-block">To</label>
                <input
                  type="date"
                  className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                  style={{ borderRadius: 10, height: 38 }}
                  value={toDate}
                  onChange={(e) => {
                    setSearchParams({ page: 1 });
                    setToDate(e.target.value);
                  }}
                />
              </div>
              <div className="col-12 col-sm-12 col-md-6 col-lg-3">
                <label className="small text-muted fw-bold mb-1 d-block">🔍 Plain Bottle Name</label>
                <Select
                  isClearable={true}
                  isSearchable
                  options={
                    (availableBottlesWithRecords || [])
                      .sort((a, b) => {
                        const nameA = (a.bottleName || a.plainBottleName).toLowerCase();
                        const nameB = (b.bottleName || b.plainBottleName).toLowerCase();
                        
                        // Natural sort: handle numbers numerically
                        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
                      })
                      .map(b => ({ value: b._id, label: b.bottleName || b.plainBottleName }))
                  }
                  value={
                    bottleFilter && bottleFilter !== '' 
                      ? { value: bottleFilter, label: availableBottlesWithRecords?.find(b => String(b._id) === String(bottleFilter))?.bottleName || availableBottlesWithRecords?.find(b => String(b._id) === String(bottleFilter))?.plainBottleName || 'Unknown' } 
                      : null
                  }
                  onChange={(selected) => {
                    setSearchParams({ page: 1 });
                    if (selected && selected.value !== undefined && selected.value !== null) {
                      setBottleFilter(selected.value);
                    } else {
                      setBottleFilter('');
                    }
                  }}
                  classNamePrefix="react-select"
                  placeholder="Select bottle name..."
                  styles={{
                    control: (base) => ({
                      ...base,
                      borderRadius: 10,
                      minHeight: 38,
                      borderColor: 'var(--bs-border-color-translucent)',
                      backgroundColor: 'var(--bs-light)',
                      boxShadow: 'none'
                    })
                  }}
                />
              </div>
              <div className="col-12 col-sm-6 col-md-6 col-lg-3">
                <label className="small text-muted fw-bold mb-1 d-block">Search Challan No</label>
                <div className="search-input-wrapper position-relative">
                  <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
                  <input
                    type="text"
                    className="form-control form-control-sm border-light-subtle bg-light ps-5 shadow-none w-100"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSearchParams({ page: 1 });
                    }}
                    style={{ borderRadius: 10, height: 38 }}
                  />
                </div>
              </div>
              <div className="col-12 col-sm-6 col-md-6 col-lg-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setFromDate('');
                    setToDate('');
                    setBottleFilter('');
                    setAutoSelectDone(false);
                    setSearchParams({ page: 1 });
                  }}
                  className="btn btn-sm btn-light border-light-subtle w-100"
                  style={{ borderRadius: 10, fontWeight: 600, height: 38 }}
                >
                  ✕ Reset All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dash-card border-0 shadow-sm">
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setSearchParams({ page: 1 });
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span>entries</span>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            {!companyId && (
              <div className="search-input-wrapper position-relative companies-search-wrap">
                <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
                <input
                  type="text"
                  className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
                  placeholder="Search Challan / Delivery No..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setSearchParams({ page: 1 }); }}
                  style={{ borderRadius: 10, fontSize: 13, width: 250 }}
                />
              </div>
            )}
          </div>
        </div>
        
        <div className="dash-card-body p-0">
          {loading ? (
            <div className="p-5 text-center text-muted">
              <div className="spinner-border text-primary mb-3" />
              <div>Loading Incoming Register...</div>
            </div>
          ) : incomings.length === 0 ? (
            <div className="p-5 text-center text-muted">
              <i className="bi bi-inbox fs-1 d-block mb-3" />
              No incoming records found.
            </div>
          ) : isShreno ? (
            <ShrenoIncomingTable incomings={incomings} handleDelete={handleDelete} bottleFilter={bottleFilter} />
          ) : (
            <div className="table-responsive companies-list-desktop">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="py-3 text-uppercase small fw-bold text-muted ps-4 text-start" style={{ width: 80 }}>Sr No</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 80 }}>Image</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Date</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Challan / Delivery No</th>
                    {!companyId && <th className="py-3 text-uppercase small fw-bold text-muted">Bill To</th>}
                    {isShreno && (
                      <>
                        <th className="py-3 text-uppercase small fw-bold text-muted">PO Date</th>
                        <th className="py-3 text-uppercase small fw-bold text-muted">PO No</th>
                        <th className="py-3 text-uppercase small fw-bold text-muted">PO Qty</th>
                      </>
                    )}
                    <th className="py-3 text-uppercase small fw-bold text-muted">Bottle Name</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">No of boxes</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">Qty</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-end">Total Qty</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {incomings?.map((inc, index) => {
                    let itemsToRender = inc.items || [];
                    if (bottleFilter) {
                      itemsToRender = itemsToRender.filter(item => {
                        const itemBottleId = item.bottleId?._id || item.bottleId;
                        return itemBottleId === bottleFilter;
                      });
                    }

                    if (itemsToRender.length === 0) {
                      if (bottleFilter) return null; // Don't show empty challenges if filtering
                      return (
                        <tr key={`${inc._id}-${index}`} className="align-middle border-bottom transition-all hover-bg-light">
                          <td className="py-3 ps-4 text-start">
                            <span className="text-muted fw-bold" style={{ fontSize: 13 }}>
                              {String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}
                            </span>
                          </td>
                          <td className="text-center py-3">
                            {(inc.images && inc.images.length > 0) || inc.image ? (
                              <img 
                                src={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://application.shayonaglass.com'}${(inc.images && inc.images.length > 0) ? inc.images[0] : inc.image}`} 
                                alt="Invoice" 
                                style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px' }} 
                                onClick={() => window.open(`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://application.shayonaglass.com'}${(inc.images && inc.images.length > 0) ? inc.images[0] : inc.image}`, '_blank')}
                                className="cursor-pointer border border-light-subtle shadow-sm"
                              />
                            ) : (
                              <div className="bg-light d-flex align-items-center justify-content-center mx-auto border border-light-subtle shadow-sm" style={{ width: '40px', height: '40px', borderRadius: '8px' }}>
                                <i className="bi bi-image text-muted" style={{ fontSize: '18px' }} />
                              </div>
                            )}
                          </td>
                          <td className="fw-500">
                            {inc.deliveryNumber === 'OLD STOCK' 
                              ? '-' 
                              : new Date(inc.documentDate || inc.date || inc.createdAt).toLocaleDateString()}
                          </td>
                          <td className="fw-bold text-primary">{inc.deliveryNumber}</td>
                          {!companyId && <td>{inc.billToId?.name || '-'}</td>}
                          {isShreno && (
                            <>
                              <td className="py-3 text-center">{inc.poDate ? new Date(inc.poDate).toLocaleDateString() : '-'}</td>
                              <td className="py-3 text-center fw-bold text-primary">{inc.poNo || '-'}</td>
                              <td className="py-3 text-center">{inc.poOrderQty ? inc.poOrderQty.toLocaleString() : '-'}</td>
                            </>
                          )}
                          <td colSpan={4} className="text-center text-muted small py-3">No items</td>
                          <td className="py-3 text-center">
                            <div className="d-flex justify-content-center gap-2">
                              <Link to={`/incoming/view/${inc._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View Delivery">
                                <i className="bi bi-eye fs-6"></i>
                              </Link>
                              <Can I="edit" a="incoming">
                                <Link to={`/incoming/edit/${inc._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit Delivery">
                                  <i className="bi bi-pencil-square fs-6"></i>
                                </Link>
                              </Can>
                              <Can I="delete" a="incoming">
                                <button onClick={() => handleDelete(inc._id, inc.deliveryNumber)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete Delivery">
                                  <i className="bi bi-trash fs-6"></i>
                                </button>
                              </Can>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <React.Fragment key={inc._id}>
                        {itemsToRender.map((item, itemIdx) => {
                          const originalItemIdx = inc.items.findIndex(orig => orig === item);
                          return (
                            <tr key={`${inc._id}-${itemIdx}`} className={`align-middle transition-all hover-bg-light ${itemIdx === itemsToRender.length - 1 ? 'border-bottom' : ''}`}>
                              {itemIdx === 0 && (
                                <>
                                  <td rowSpan={itemsToRender.length} className="py-3 ps-4 text-start border-bottom">
                                    <span className="text-muted fw-bold" style={{ fontSize: 13 }}>
                                      {String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}
                                    </span>
                                  </td>
                                  <td rowSpan={itemsToRender.length} className="text-center py-3 border-bottom">
                                    {(inc.images && inc.images.length > 0) || inc.image ? (
                                      <img 
                                        src={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://application.shayonaglass.com'}${(inc.images && inc.images.length > 0) ? inc.images[0] : inc.image}`} 
                                        alt="Invoice" 
                                        style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px' }} 
                                        onClick={() => window.open(`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://application.shayonaglass.com'}${(inc.images && inc.images.length > 0) ? inc.images[0] : inc.image}`, '_blank')}
                                        className="cursor-pointer border border-light-subtle shadow-sm"
                                      />
                                    ) : (
                                      <div className="bg-light d-flex align-items-center justify-content-center mx-auto border border-light-subtle shadow-sm" style={{ width: '40px', height: '40px', borderRadius: '8px' }}>
                                        <i className="bi bi-image text-muted" style={{ fontSize: '18px' }} />
                                      </div>
                                    )}
                                  </td>
                                  <td rowSpan={itemsToRender.length} className="fw-500 border-bottom">
                                    {inc.deliveryNumber === 'OLD STOCK'
                                      ? '-'
                                      : new Date(inc.documentDate || inc.date || inc.createdAt).toLocaleDateString()}
                                  </td>
                                  <td rowSpan={itemsToRender.length} className="fw-bold text-primary border-bottom">
                                    {inc.deliveryNumber}
                                  </td>
                                  {!companyId && (
                                    <td rowSpan={itemsToRender.length} className="border-bottom">
                                      {inc.billToId?.name || '-'}
                                    </td>
                                  )}
                                  {isShreno && (
                                    <>
                                      <td rowSpan={itemsToRender.length} className="py-3 text-center border-bottom">
                                        {inc.poDate ? new Date(inc.poDate).toLocaleDateString() : '-'}
                                      </td>
                                      <td rowSpan={itemsToRender.length} className="py-3 text-center fw-bold text-primary border-bottom">
                                        {inc.poNo || '-'}
                                      </td>
                                      <td rowSpan={itemsToRender.length} className="py-3 text-center border-bottom">
                                        {inc.poOrderQty ? inc.poOrderQty.toLocaleString() : '-'}
                                      </td>
                                    </>
                                  )}
                                </>
                              )}
                              
                              <td className="py-3 border-bottom">
                                <div className="fw-500">{item.bottleId?.bottleName}</div>
                              </td>
                              <td className="py-3 text-center border-bottom">{item.box}</td>
                              <td className="py-3 text-center border-bottom">{item.qty}</td>
                              <td className="py-3 text-end fw-bold text-accent border-bottom">{item.totalQty}</td>
                              <td className="py-3 text-center border-bottom">
                                <div className="d-flex justify-content-center gap-2">
                                  <Can I="read" a="incoming">
                                    <Link to={`/incoming/view/${inc._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View Delivery">
                                      <i className="bi bi-eye fs-6"></i>
                                    </Link>
                                  </Can>
                                  <Can I="edit" a="incoming">
                                    <Link to={`/incoming/edit/${inc._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit Delivery">
                                      <i className="bi bi-pencil-square fs-6"></i>
                                    </Link>
                                  </Can>
                                  <Can I="delete" a="incoming">
                                    <button onClick={() => handleDeleteItem(inc, originalItemIdx !== -1 ? originalItemIdx : itemIdx)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete Item">
                                      <i className="bi bi-trash fs-6"></i>
                                    </button>
                                  </Can>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* ── Footer / Pagination ──────────────────────────────────────────────── */}
        {!isShreno && (
          <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
            <div className="text-muted small fw-500">
            Showing <b>{total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</b> to <b>{Math.min(currentPage * itemsPerPage, total || 0)}</b> of <b>{total || 0}</b> entries
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === 1}
              onClick={() => { if (currentPage > 1) handlePageChange(currentPage - 1); }}
            >
              Previous
            </button>

            {(() => {
              const pages = [];
              const delta = 2;
              const left = currentPage - delta;
              const right = currentPage + delta;
              pages.push(1);
              if (left > 2) pages.push('...');
              for (let i = Math.max(2, left); i <= Math.min(totalPages - 1, right); i++) pages.push(i);
              if (right < totalPages - 1) pages.push('...');
              if (totalPages > 1) pages.push(totalPages);
              return pages.map((p, idx) =>
                p === '...'
                  ? <span key={`e-${idx}`} className="px-1 text-muted" style={{ fontSize: 13 }}>…</span>
                  : <button key={p} className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`} onClick={() => handlePageChange(p)}>{p}</button>
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => { if (currentPage < totalPages) handlePageChange(currentPage + 1); }}
            >
              Next
            </button>
          </div>
        </div>
        )}
      </div>

      <IncomingImportModal 
        show={showImportModal} 
        companyId={companyId}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          dispatch(fetchIncoming({ page: currentPage, limit: itemsPerPage, search: searchTerm, status: statusFilter, companyId }));
        }}
      />
    </div>
  );
}
