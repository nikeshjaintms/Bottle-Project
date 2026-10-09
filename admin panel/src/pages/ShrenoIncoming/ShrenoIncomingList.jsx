import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchShrenoIncoming, deleteShrenoIncoming } from '../../redux/slices/shrenoIncomingSlice';
import { Can } from '../../context/AbilityContext';
import Swal from 'sweetalert2';
import api from '../../services/api';

export default function ShrenoIncomingList() {
  const dispatch = useDispatch();
  const { data: incomings, loading, totalPages, total, page } = useSelector(state => state.shrenoIncoming);

  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get("page") || '';
  const currentPage = Number(urlPage) || page || 1;

  useEffect(() => {
    dispatch(fetchShrenoIncoming({ page: currentPage, limit: itemsPerPage, search: searchTerm }));
  }, [dispatch, currentPage, itemsPerPage, searchTerm]);
  
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
             bottleName: item.bottleName?._id || item.bottleName,
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

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title mb-0">Shreno Incoming</h1>
          <p className="page-subtitle mb-0">Record items specifically from Shreno</p>
        </div>
        <Can I="create" a="incoming">
          <Link to="/shreno-incoming/add" className="btn-accent companies-header-action">
            <i className="bi bi-plus-lg me-2" /> Add Shreno Challan
          </Link>
        </Can>
      </div>

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
                    <th className="py-3 text-uppercase small fw-bold text-muted">Bottle Name</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Configuration</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">Quantity</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-end pe-4" style={{ width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {incomings?.map((inc, index) => {
                    if (!inc.items || inc.items.length === 0) {
                      return (
                        <tr key={inc._id} className="align-middle border-bottom transition-all hover-bg-light">
                          <td className="ps-4 text-muted fw-bold">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                          <td><div className="fw-600">{new Date(inc.date).toLocaleDateString('en-GB')}</div></td>
                          <td><div className="fw-bold text-primary">{inc.challanNo}</div></td>
                          <td><div className="text-muted">{inc.poNo || '-'}</div></td>
                          <td colSpan="3" className="text-muted text-center fst-italic py-3">No items</td>
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
                        {inc.items.map((item, itemIdx) => (
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
                            <td className="py-3 border-bottom">
                              <span className="fw-bold">{item.bottleName?.bottleName || 'N/A'}</span>
                            </td>
                            <td className="py-3 border-bottom">
                              <span className="text-muted">{item.itemType?.name || item.itemType || 'N/A'}</span>
                              {item.configuration && <span className="ms-1">- {item.configuration}</span>}
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
                        ))}
                      </React.Fragment>
                    );
                  })}
                  {!incomings?.length && !loading && (
                    <tr>
                      <td colSpan="7" className="text-center py-5 text-muted">
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
        </div>
      </div>
    </div>
  );
}
