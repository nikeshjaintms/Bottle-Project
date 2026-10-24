import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchTemplates, deleteTemplate, createTemplate } from '../../redux/slices/sgLabelTwoSlice';
import { fetchSgLabels } from '../../redux/slices/sgLabelSlice';
import Swal from 'sweetalert2';
import { Can } from '../../context/AbilityContext';
import API from '../../services/api';

export default function SgLabelTwoList() {
  const dispatch = useDispatch();
  const { templates, loading } = useSelector(state => state.sgLabelTwo);
  const { sgLabels } = useSelector(state => state.sgLabels);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    dispatch(fetchTemplates());
    dispatch(fetchSgLabels({ page: 1, limit: 1000 }));
  }, [dispatch]);

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const total = filteredTemplates.length;
  const totalPages = Math.ceil(total / itemsPerPage);
  
  const paginatedTemplates = filteredTemplates.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleDelete = (id, name) => {
    Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteTemplate(id)).then((res) => {
          if (!res.error) {
            Swal.fire('Deleted!', `Template "${name}" has been deleted.`, 'success');
          }
        });
      }
    });
  };

  const handleCopy = (template) => {
    Swal.fire({
      title: 'Copy Template',
      input: 'text',
      inputLabel: 'New Template Name',
      inputValue: `${template.name} (Copy)`,
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) {
          return 'Template name is required';
        }
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const newTemplate = {
          name: result.value,
          canvasWidth: template.canvasWidth,
          canvasHeight: template.canvasHeight,
          elements: template.elements,
          status: true
        };
        
        dispatch(createTemplate(newTemplate)).then((res) => {
          if (!res.error) {
            Swal.fire('Copied!', `Template "${result.value}" has been created.`, 'success');
          } else {
            Swal.fire('Error', res.payload || 'Failed to copy template', 'error');
          }
        });
      }
    });
  };

  const handlePrint = (template, action) => {
    const today = new Date().toISOString().split('T')[0];
    const isPrint = action === 'print';

    Swal.fire({
      title: isPrint ? 'Print Label Details' : 'Download PDF Details',
      html: `
        <div class="text-start mb-3 mt-3">
          <label class="form-label fw-bold small text-muted">Date <span class="text-danger">*</span></label>
          <input type="date" id="print-date" class="form-control custom-input-field shadow-none" value="${today}" style="border-radius: 10px;" />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: isPrint ? 'Print' : 'Download PDF',
      confirmButtonColor: isPrint ? '#007bff' : '#28a745',
      cancelButtonColor: '#6c757d',
      preConfirm: () => {
        const date = document.getElementById('print-date').value;
        
        if (!date) {
          Swal.showValidationMessage('Please enter the date');
          return false;
        }
        
        return { date };
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { date } = result.value;
        const dtStr = `${date.split('-')[2]}.${date.split('-')[1]}.${date.split('-')[0].slice(2)}`;

        try {
          Swal.fire({
            title: 'Generating PDF...',
            text: 'Please wait while the PDF is generated.',
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            }
          });

          const parseContent = (content) => {
            let parsed = content;
            parsed = parsed.replace(/{{date}}/g, dtStr);
            return parsed;
          };

          const parsedElements = template.elements.map(el => ({
            ...el,
            content: parseContent(el.content)
          }));

          const response = await API.post('/sg-label-2/pdf', {
            templateId: template._id,
            parsedElements
          }, {
            responseType: 'blob'
          });

          const blob = new Blob([response.data], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          
          Swal.close();

          if (isPrint) {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = url;
            document.body.appendChild(iframe);
            iframe.onload = () => {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
            };
          } else {
            const link = document.createElement('a');
            link.href = url;
            link.download = `Sticker_Template_${template.name}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        } catch (error) {
          console.error(error);
          Swal.fire('Error', 'Failed to generate PDF', 'error');
        }
      }
    });
  };

  return (
    <div className="page-content sg-label-two-page">
      <div className="page-header d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between mb-4 gap-3">
        <div>
          <h1 className="page-title mb-1">SG Label 2 Templates</h1>
          <p className="page-subtitle mb-0">Manage visual drag-and-drop sticker templates</p>
        </div>
          <Can I="create" a="sg-label-2">
            <div className="d-flex gap-2">
              <Link to="/sg-labels-2/add" className="btn-accent companies-header-action">
                <i className="bi bi-plus-lg me-2"></i> Add Template
              </Link>
            </div>
          </Can>
      </div>

      <div className="dash-card border-0 shadow-sm rounded-4 overflow-hidden">
        <div className="dash-card-header d-flex flex-column flex-md-row justify-content-between align-items-center p-4 border-bottom bg-white companies-dash-header sg-label-two-toolbar">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={10}
              readOnly
            >
              <option value="10">10</option>
            </select>
            <span>entries</span>
          </div>

          <div className="search-input-wrapper position-relative companies-search-wrap">
            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-control form-control-sm border-0 bg-light ps-5 py-2 shadow-none"
              placeholder="Search custom labels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : (
          <div className="companies-list-mobile d-md-none sg-label-two-mobile-list">
            {paginatedTemplates.length === 0 ? (
              <div className="companies-mobile-empty">No templates found. Click "Create New Template" to get started.</div>
            ) : (
              paginatedTemplates.map((template, index) => (
                <div key={template._id} className="companies-mobile-card brands-mobile-card sg-label-two-template-card">
                  <div className="d-flex align-items-start justify-content-between gap-2 w-100 min-w-0">
                    <div className="min-w-0">
                      <div className="d-flex align-items-start gap-2 mb-2">
                        <span className="text-muted small fw-bold flex-shrink-0">
                          #{String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}
                        </span>
                        <span className="fw-semibold text-dark text-break">{template.name}</span>
                      </div>
                      <div className="small text-muted mb-2">
                        <span className="fw-semibold">Elements:</span>{' '}
                        <span className="text-break">{template.elements?.[0]?.content || 'N/A'}</span>
                      </div>
                      <span className={`badge-status badge-${template.status ? 'active' : 'inactive'} d-inline-block`}>
                        {template.status ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                  </div>

                  <div className="companies-mobile-actions brands-mobile-actions sg-label-two-template-actions">
                    <button onClick={() => handlePrint(template, 'print')} className="btn btn-sm btn-outline-secondary border-0 rounded-3 shadow-none p-2" title="Print Template" aria-label="Print template">
                      <i className="bi bi-printer fs-6"></i>
                    </button>
                    <button onClick={() => handlePrint(template, 'download')} className="btn btn-sm btn-outline-success border-0 rounded-3 shadow-none p-2" title="Download Template" aria-label="Download template">
                      <i className="bi bi-download fs-6"></i>
                    </button>
                    <Link to={`/sg-labels-2/view/${template._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View Template" aria-label="View template">
                      <i className="bi bi-eye fs-6"></i>
                    </Link>
                    <Can I="create" a="sg-label-2">
                      <button onClick={() => handleCopy(template)} className="btn btn-sm btn-outline-secondary border-0 rounded-3 shadow-none p-2" title="Copy Template" aria-label="Copy template">
                        <i className="bi bi-files fs-6"></i>
                      </button>
                    </Can>
                    <Can I="edit" a="sg-label-2">
                      <Link to={`/sg-labels-2/edit/${template._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit Template" aria-label="Edit template">
                        <i className="bi bi-pencil-square fs-6"></i>
                      </Link>
                    </Can>
                    <Can I="delete" a="sg-label-2">
                      <button onClick={() => handleDelete(template._id, template.name)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete Template" aria-label="Delete template">
                        <i className="bi bi-trash fs-6"></i>
                      </button>
                    </Can>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && (
          <div className="table-responsive d-none d-md-block" style={{ overflowX: 'auto' }}>
            <table className="data-table mb-0" style={{ width: '100%' }}>
              <thead className="bg-light">
                <tr>
                  <th className="py-3 text-uppercase small fw-bold text-muted ps-5 text-start" style={{ width: 100 }}>SR NO</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-start">TEMPLATE NAME</th>

                  <th className="py-3 text-uppercase small fw-bold text-muted text-center">ELEMENTS</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center">STATUS</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 140 }}>PRINT / DOWNLOAD</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 100 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTemplates.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-5">
                      <i className="bi bi-inbox fs-1 mb-3 d-block"></i>
                      No templates found. Click "Create New Template" to get started.
                    </td>
                  </tr>
                ) : (
                  paginatedTemplates.map((template, index) => (
                    <tr key={template._id} className="align-middle border-bottom transition-all hover-bg-light">
                      <td className="py-3 ps-5 text-start">
                        <span className="text-muted fw-bold" style={{ fontSize: 13 }}>
                          {String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}
                        </span>
                      </td>
                      <td className="py-3 text-start fw-600 text-dark" style={{ fontSize: 13 }}>
                        {template.name}
                      </td>

                      <td className="py-3 text-center text-muted" style={{ fontSize: 13 }}>
                        <span className="d-inline-block text-wrap text-break" style={{ maxWidth: '300px', lineHeight: '1.4' }}>
                          {template.elements && template.elements.length > 0 ? template.elements[0].content : 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`badge-status badge-${template.status ? 'active' : 'inactive'} d-inline-block`}>
                          {template.status ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <div className="d-flex justify-content-center gap-2">
                          <button onClick={() => handlePrint(template, 'print')} className="btn btn-outline-secondary btn-sm border-0 rounded-3 shadow-none p-2" title="Print Template">
                            <i className="bi bi-printer fs-6"></i>
                          </button>
                          <button onClick={() => handlePrint(template, 'download')} className="btn btn-outline-success btn-sm border-0 rounded-3 shadow-none p-2" title="Download Template">
                            <i className="bi bi-download fs-6"></i>
                          </button>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <div className="d-flex justify-content-center gap-2">
                          <Link to={`/sg-labels-2/view/${template._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View Template">
                            <i className="bi bi-eye fs-6"></i>
                          </Link>
                          <Can I="create" a="sg-label-2">
                            <button onClick={() => handleCopy(template)} className="btn btn-sm btn-outline-secondary border-0 rounded-3 shadow-none p-2" title="Copy Template">
                              <i className="bi bi-files fs-6"></i>
                            </button>
                          </Can>
                          <Can I="edit" a="sg-label-2">
                            <Link to={`/sg-labels-2/edit/${template._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit Template">
                              <i className="bi bi-pencil-square fs-6"></i>
                            </Link>
                          </Can>
                          <Can I="delete" a="sg-label-2">
                            <button onClick={() => handleDelete(template._id, template.name)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete Template">
                              <i className="bi bi-trash fs-6"></i>
                            </button>
                          </Can>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Footer / Pagination */}
        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
          <div className="text-muted small fw-500">
            Showing <b>{total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</b> to <b>{Math.min(currentPage * itemsPerPage, total)}</b> of <b>{total}</b> entries
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === 1}
              onClick={() => { if (currentPage > 1) setCurrentPage(currentPage - 1); }}
            >
              Previous
            </button>

            {(() => {
              const pages = [];
              const delta = 2;
              const left = currentPage - delta;
              const right = currentPage + delta;
              for (let i = Math.max(2, left); i <= Math.min(totalPages - 1, right); i++) pages.push(i);
              if (right < totalPages - 1) pages.push('...');
              if (totalPages > 1) pages.push(totalPages);
              if (totalPages > 0) pages.unshift(1); // Ensure page 1 is always visible if there are pages
              
              // Remove duplicates
              const uniquePages = [...new Set(pages)];

              return uniquePages.map((p, idx) =>
                p === '...'
                  ? <span key={`e-${idx}`} className="px-1 text-muted" style={{ fontSize: 13 }}>...</span>
                  : <button key={p} className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`} onClick={() => setCurrentPage(p)}>{p}</button>
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
