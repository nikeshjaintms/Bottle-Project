import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchShrenoIncoming, deleteShrenoIncoming } from '../../redux/slices/shrenoIncomingSlice';
import { Can } from '../../context/AbilityContext';
import Swal from 'sweetalert2';
import api from '../../services/api';
import Select from 'react-select';
import ShrenoIncomingImportModal from './ShrenoIncomingImportModal';

export default function ShrenoIncomingList() {
  const dispatch = useDispatch();
  const { data: incomings, loading, totalPages, total, page } = useSelector(state => state.shrenoIncoming);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBottleId, setSelectedBottleId] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showImportModal, setShowImportModal] = useState(false);
  const [bottleOptions, setBottleOptions] = useState([]);
  const [initializedDefaultBottle, setInitializedDefaultBottle] = useState(false);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get("page") || '';
  const currentPage = Number(urlPage) || page || 1;

  // Fetch data on mount
  useEffect(() => {
    // No need to pre-fetch bottlePerBoxes - we'll get bottles from incoming records
    const params = {
      page: 1,
      limit: itemsPerPage,
      search: ''
    };
    dispatch(fetchShrenoIncoming(params));
  }, [dispatch]);

  // Build bottle options from actual SHRENO incoming records (only bottles used in SHRENO)
  useEffect(() => {
    if (incomings && incomings.length > 0) {
      // Extract unique bottle IDs from SHRENO incoming records
      const bottleMap = new Map();
      
      incomings.forEach(record => {
        record.items?.forEach(item => {
          const bottleId = typeof item.plainBottle === 'object' 
            ? item.plainBottle?._id 
            : item.plainBottle;
          
          const bottleName = typeof item.plainBottle === 'object'
            ? (item.plainBottle?.plainBottleName || item.plainBottle?.bottleName)
            : null;
          
          if (bottleId && !bottleMap.has(bottleId)) {
            bottleMap.set(bottleId, bottleName || 'Unknown');
          }
        });
      });

      // Convert to options and sort
      const options = Array.from(bottleMap.entries())
        .map(([id, name]) => ({
          value: id,
          label: name
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      
      setBottleOptions(options);
    }
  }, [incomings]);

  // Set default bottle to most recently saved on first load
  useEffect(() => {
    if (!initializedDefaultBottle && bottleOptions && bottleOptions.length > 0) {
      // Set default to the first bottle (most recently used bottle will be determined after data loads)
      setSelectedBottleId(bottleOptions[0].value);
      setInitializedDefaultBottle(true);
    }
  }, [initializedDefaultBottle, bottleOptions]);

  // Fetch incoming records (without bottle filter - will filter client-side)
  useEffect(() => {
    const params = {
      page: currentPage,
      limit: itemsPerPage,
      search: searchTerm
    };
    dispatch(fetchShrenoIncoming(params));
  }, [dispatch, currentPage, itemsPerPage, searchTerm]);

  // Filter the incoming records by selected bottle on the client side
  const filteredIncomings = React.useMemo(() => {
    if (!selectedBottleId || !incomings) return incomings;

    // Filter records that have at least one item with the selected bottle
    return incomings.filter(inc => {
      if (!inc.items || inc.items.length === 0) return false;
      return inc.items.some(item => {
        const itemBottleId = typeof item.plainBottle === 'object' 
          ? item.plainBottle?._id 
          : item.plainBottle;
        return itemBottleId === selectedBottleId;
      });
    });
  }, [incomings, selectedBottleId]);

  // Calculate pagination based on filtered results (not backend totalPages)
  const filteredTotalPages = Math.ceil((filteredIncomings?.length || 0) / itemsPerPage);
  
  const handlePageChange = (newPage) => {
    setSearchParams({ page: newPage });
  };

  const handleDelete = (id, challanNo) => {
    Swal.fire({
      title: 'Delete Record?',
      text: `Are you sure you want to delete the ENTIRE challan "${challanNo}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteShrenoIncoming(id)).then(res => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Record removed.', 'success');
            dispatch(fetchShrenoIncoming({ page: currentPage, limit: itemsPerPage, search: searchTerm }));
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
          }
        });
      }
    });
  };

  const handleDeleteItem = (inc, itemIdx) => {
    if (inc.items.length === 1) {
      // If it's the only item, they should delete the whole challan
      return handleDelete(inc._id, inc.challanNo);
    }

    Swal.fire({
      title: 'Delete Item?',
      text: `Are you sure you want to remove this item from challan "${inc.challanNo}"?`,
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
             plainBottle: item.plainBottle?._id || item.plainBottle,
             itemType: item.itemType?._id || item.itemType,
             configuration: item.configuration,
             quantity: item.quantity
          }));
          await api.put(`/shreno-incoming/${inc._id}`, { items: formattedItems });
          Swal.fire('Removed!', 'Item removed from challan.', 'success');
          dispatch(fetchShrenoIncoming({ page: currentPage, limit: itemsPerPage, search: searchTerm }));
        } catch (error) {
           Swal.fire('Error!', error.response?.data?.message || 'Failed to remove item.', 'error');
        }
      }
    });
  };

  const handleBottleChange = (option) => {
    setSelectedBottleId(option ? option.value : '');
    setSearchParams({ page: 1 });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title mb-0">Shreno Incoming</h1>
          <p className="page-subtitle mb-0">Record items specifically from Shreno</p>
        </div>
        <div className="d-flex gap-2">
          <Can I="create" a="incoming">
            <button 
              className="btn btn-outline-primary"
              onClick={() => setShowImportModal(true)}
              title="Import from Excel"
            >
              <i className="bi bi-file-earmark-excel me-2" /> Import Excel
            </button>
          </Can>
          <Can I="create" a="incoming">
            <Link to="/shreno-incoming/add" className="btn-accent companies-header-action">
              <i className="bi bi-plus-lg me-2" /> Add Shreno Challan
            </Link>
          </Can>
        </div>
      </div>

      <ShrenoIncomingImportModal 
        show={showImportModal} 
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          dispatch(fetchShrenoIncoming({ page: currentPage, limit: itemsPerPage, search: searchTerm }));
        }}
      />

      <div className="dash-card border-0 shadow-sm">
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>entries</span>
          </div>

          <div className="d-flex align-items-center gap-3">
            <div style={{ minWidth: 250 }}>
              <Select
                isClearable
                isSearchable
                options={bottleOptions}
                value={bottleOptions.find(opt => opt.value === selectedBottleId) || null}
                onChange={handleBottleChange}
                placeholder="Filter by Bottle Name..."
                className="react-select-container"
                classNamePrefix="react-select"
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: 36,
                    fontSize: 13,
                    borderRadius: 10,
                    borderColor: '#e9ecef',
                    backgroundColor: '#f8f9fa',
                    boxShadow: 'none',
                    '&:hover': {
                      borderColor: '#e9ecef'
                    }
                  }),
                  option: (base, state) => ({
                    ...base,
                    backgroundColor: state.isSelected ? '#0d6efd' : state.isFocused ? '#e9ecef' : 'white',
                    color: state.isSelected ? 'white' : 'black',
                    cursor: 'pointer'
                  })
                }}
              />
            </div>

            <div className="search-input-wrapper position-relative companies-search-wrap">
              <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
              <input
                type="text"
                className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
                placeholder="Search by Challan/Invoice..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSearchParams({ page: 1 });
                }}
                style={{ borderRadius: 10, fontSize: 13, minWidth: '250px' }}
              />
            </div>
          </div>
        </div>

        <div className="p-0">
          <div className="companies-list-desktop" style={{ overflowX: 'auto' }}>
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : (
              <table className="data-table" style={{ minWidth: '1000px' }}>
                <thead>
                  <tr>
                    <th className="py-3 text-uppercase small fw-bold text-muted ps-4 text-start" style={{ width: 60 }}>#</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Date</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Challan No</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">PO No</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Plain Bottle</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Item Type</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Configuration</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">Quantity</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-end pe-4" style={{ width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncomings?.map((inc, index) => {
                    if (!inc.items || inc.items.length === 0) {
                      return (
                        <tr key={inc._id} className="align-middle border-bottom transition-all hover-bg-light">
                          <td className="ps-4 text-muted fw-bold">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                          <td><div className="fw-600">{new Date(inc.date).toLocaleDateString('en-GB')}</div></td>
                          <td><div className="fw-bold text-primary">{inc.challanNo}</div></td>
                          <td><div className="text-muted">{inc.poNo || '-'}</div></td>
                          <td colSpan="4" className="text-muted text-center fst-italic py-3">No items</td>
                          <td className="text-center py-3">
                            <div className="d-flex justify-content-center gap-2">
                              <Can I="read" a="incoming">
                                <Link to={`/shreno-incoming/view/${inc._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View"><i className="bi bi-eye fs-6" /></Link>
                              </Can>
                              <Can I="update" a="incoming">
                                <Link to={`/shreno-incoming/edit/${inc._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit"><i className="bi bi-pencil-square fs-6" /></Link>
                              </Can>
                              <Can I="delete" a="incoming">
                                <button onClick={() => handleDelete(inc._id, inc.challanNo)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete"><i className="bi bi-trash fs-6" /></button>
                              </Can>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <React.Fragment key={inc._id}>
                        {inc.items.map((item, itemIdx) => {
                          const getRefKey = (value) => String(value?._id || value || '');
                          const bottleKey = getRefKey(item.plainBottle);
                          const itemTypeKey = getRefKey(item.itemType);
                          const previousItem = inc.items[itemIdx - 1];
                          const isFirstInBottleGroup = itemIdx === 0 || getRefKey(previousItem.plainBottle) !== bottleKey;
                          const isFirstInItemTypeGroup = isFirstInBottleGroup || getRefKey(previousItem.itemType) !== itemTypeKey;

                          let bottleRowSpan = 1;
                          if (isFirstInBottleGroup) {
                            for (let i = itemIdx + 1; i < inc.items.length && getRefKey(inc.items[i].plainBottle) === bottleKey; i += 1) {
                              bottleRowSpan += 1;
                            }
                          }

                          let itemTypeRowSpan = 1;
                          if (isFirstInItemTypeGroup) {
                            for (
                              let i = itemIdx + 1;
                              i < inc.items.length &&
                              getRefKey(inc.items[i].plainBottle) === bottleKey &&
                              getRefKey(inc.items[i].itemType) === itemTypeKey;
                              i += 1
                            ) {
                              itemTypeRowSpan += 1;
                            }
                          }

                          return (
                          <tr key={`${inc._id}-${itemIdx}`} className={`align-middle transition-all hover-bg-light ${itemIdx === inc.items.length - 1 ? 'border-bottom' : ''}`}>
                            {itemIdx === 0 && (
                              <>
                                <td rowSpan={inc.items.length} className="py-3 ps-4 text-muted fw-bold border-bottom">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                                <td rowSpan={inc.items.length} className="fw-500 border-bottom">
                                  {new Date(inc.date).toLocaleDateString('en-GB')}
                                </td>
                                <td rowSpan={inc.items.length} className="fw-bold text-primary border-bottom">
                                  {inc.challanNo}
                                </td>
                                <td rowSpan={inc.items.length} className="text-muted border-bottom">
                                  {inc.poNo || '-'}
                                </td>
                              </>
                            )}
                            {isFirstInBottleGroup && <td rowSpan={bottleRowSpan} className="py-3 border-bottom align-middle">
                              <span className="fw-bold">
                                {typeof item.plainBottle === 'object' && item.plainBottle
                                  ? (item.plainBottle.plainBottleName || item.plainBottle.bottleName || 'Unknown') 
                                  : 'N/A'}
                              </span>
                            </td>}
                            {isFirstInItemTypeGroup && <td rowSpan={itemTypeRowSpan} className="py-3 border-bottom align-middle">
                              <span className="text-muted">
                                {typeof item.itemType === 'object' && item.itemType?.name
                                  ? item.itemType.name 
                                  : '-'}
                              </span>
                            </td>}
                            <td className="py-3 border-bottom">
                              <span className="text-muted">
                                {item.configuration || '-'}
                              </span>
                            </td>
                            <td className="py-3 text-center border-bottom">
                              <span className="fw-bold text-success">{item.quantity}</span>
                            </td>
                            <td className="text-center py-3 border-bottom">
                              <div className="d-flex justify-content-center gap-2">
                                <Can I="read" a="incoming">
                                  <Link to={`/shreno-incoming/view/${inc._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View Challan">
                                    <i className="bi bi-eye fs-6"></i>
                                  </Link>
                                </Can>
                                <Can I="update" a="incoming">
                                  <Link to={`/shreno-incoming/edit/${inc._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit Challan">
                                    <i className="bi bi-pencil-square fs-6"></i>
                                  </Link>
                                </Can>
                                <Can I="delete" a="incoming">
                                  <button
                                    onClick={() => handleDeleteItem(inc, itemIdx)}
                                    className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete Item"
                                  >
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
                  {!filteredIncomings?.length && !loading && (
                    <tr>
                      <td colSpan="8" className="text-center py-5 text-muted">
                        <div className="d-flex flex-column align-items-center">
                          <i className="bi bi-inbox fs-1 mb-2 text-light-subtle" />
                          <p className="mb-0">No records found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
            <div className="text-muted small fw-500">
            Showing <b>{filteredIncomings && filteredIncomings.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</b> to <b>{Math.min(currentPage * itemsPerPage, filteredIncomings?.length || 0)}</b> of <b>{filteredIncomings?.length || 0}</b> entries
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
              for (let i = Math.max(2, left); i <= Math.min(filteredTotalPages - 1, right); i++) pages.push(i);
              if (right < filteredTotalPages - 1) pages.push('...');
              if (filteredTotalPages > 1) pages.push(filteredTotalPages);
              return pages.map((p, idx) =>
                p === '...'
                  ? <span key={`e-${idx}`} className="px-1 text-muted" style={{ fontSize: 13 }}>…</span>
                  : <button key={p} className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`} onClick={() => handlePageChange(p)}>{p}</button>
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === filteredTotalPages || filteredTotalPages === 0}
              onClick={() => { if (currentPage < filteredTotalPages) handlePageChange(currentPage + 1); }}
            >
              Next
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
