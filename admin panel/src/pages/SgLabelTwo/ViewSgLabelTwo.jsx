import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSgLabels } from '../../redux/slices/sgLabelSlice';
import API from '../../services/api';
import Barcode from 'react-barcode';
import Swal from 'sweetalert2';

export default function ViewSgLabelTwo() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { sgLabels } = useSelector(state => state.sgLabels);
  
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const previewContainerRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(1);
  const canvasWidth = template?.canvasWidth || 284;
  const canvasHeight = template?.canvasHeight || 95;

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return undefined;

    const updatePreviewScale = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth > 0) {
        setPreviewScale(Math.min(1.5, availableWidth / canvasWidth));
      }
    };

    const resizeObserver = new ResizeObserver(updatePreviewScale);
    resizeObserver.observe(container);
    updatePreviewScale();

    return () => resizeObserver.disconnect();
  }, [canvasWidth]);

  useEffect(() => {
    dispatch(fetchSgLabels({ page: 1, limit: 1000 }));
  }, [dispatch]);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const response = await API.get(`/sg-label-2/${id}`);
        setTemplate(response.data);
        setLoading(false);
      } catch (err) {
        setError(err.message || 'Error fetching template');
        setLoading(false);
      }
    };
    fetchTemplate();
  }, [id]);

  const handlePrint = (action) => {
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

  if (loading) {
    return (
      <div className="page-content d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="page-content">
        <div className="alert alert-danger">
          Failed to load template: {error}
        </div>
        <Link to="/sg-labels-2" className="btn btn-outline-secondary">Back to List</Link>
      </div>
    );
  }

  return (
    <div className="page-content sg-label-two-view-page">
      <div className="page-header d-flex justify-content-between align-items-center mb-4 sg-label-two-view-header">
        <div className="d-flex align-items-center gap-3">
          <Link to="/sg-labels-2" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
          </Link>
          <h1 className="page-title mb-0">Template Detailed</h1>
        </div>
        <div className="d-flex gap-2 sg-label-two-view-header-actions">
          <button onClick={() => handlePrint('print')} className="btn btn-primary shadow-sm">
            <i className="bi bi-printer me-2"></i> Print Template
          </button>
        </div>
      </div>

      <div className="row mt-4 justify-content-center">
        <div className="col-12 col-md-8 col-lg-6 mb-4">
          <div className="dash-card sg-label-two-view-card">
            <div className="dash-card-body text-center d-flex flex-column align-items-center justify-content-center p-5 sg-label-two-view-card-body">
              <div ref={previewContainerRef} className="sg-label-two-preview-container">
                <div
                  className="sg-label-two-preview-stage"
                  style={{
                    width: canvasWidth * previewScale,
                    height: canvasHeight * previewScale
                  }}
                >
                  <div
                    className="bg-white shadow-sm position-relative print-area"
                    style={{
                      width: canvasWidth,
                      height: canvasHeight,
                      border: '1px solid #d1d5db',
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                      overflow: 'visible'
                    }}
                  >
                {template.elements.map((el) => (
                  <div
                    key={el.id}
                    style={{
                      position: 'absolute',
                      left: el.x,
                      top: el.y,
                      width: el.width,
                      height: el.height,
                      fontSize: `${el.fontSize}px`,
                      fontWeight: el.fontWeight,
                      fontFamily: el.fontFamily,
                      color: el.color,
                      textAlign: el.textAlign,
                      whiteSpace: el.type === 'barcode' ? 'nowrap' : 'normal',
                      wordBreak: 'break-word',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
                      transform: `rotate(${el.rotation || 0}deg)`,
                      overflow: el.type === 'barcode' ? 'hidden' : 'visible',
                      zIndex: el.zIndex,
                    }}
                  >
                    {el.type === 'barcode' ? (
                      <Barcode value={el.content || '123456'} width={1.5} height={el.height - 20} fontSize={12} margin={0} background="transparent" />
                    ) : (
                      el.content
                    )}
                  </div>
                ))}
                  </div>
                </div>
              </div>
              
              <p className="text-muted fw-bold text-uppercase mt-4 mb-0 fs-5 sg-label-two-view-name">{template.name}</p>
              
              <div className="mt-4 d-flex gap-2 justify-content-center">
                <span className={`badge-status badge-${template.status ? 'active' : 'inactive'} px-3 py-2`} style={{ fontSize: 13 }}>
                  {template.status ? 'ACTIVE' : 'INACTIVE'}
                </span>
                <span className="badge bg-soft-info text-info px-4 py-2 border rounded-pill" style={{ fontSize: 13 }}>
                  {canvasWidth}px × {canvasHeight}px
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
