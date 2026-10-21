import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDeliveryChallanById } from '../../../redux/slices/deliveryChallanSlice';
import html2pdf from 'html2pdf.js';

export default function ViewShayonaChallan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { currentChallan, loading } = useSelector((state) => state.deliveryChallans);
  const printRef = useRef(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    dispatch(fetchDeliveryChallanById(id));
  }, [dispatch, id]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!currentChallan?._id) return;
    setDownloadingPdf(true);

    try {
      // First try downloading high-fidelity backend generated PDF with exact pagination
      const response = await fetch(`http://localhost:5000/api/delivery-challans/${currentChallan._id}/pdf`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Delivery_Challan_${currentChallan.challanNo || 'Shayona'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setDownloadingPdf(false);
        return;
      }
    } catch (err) {
      console.warn('Backend PDF endpoint fallback to client html2pdf:', err);
    }

    // Client-side fallback if server puppeteer is busy
    if (!printRef.current) {
      setDownloadingPdf(false);
      return;
    }

    const opt = {
      margin: [8, 8, 8, 8],
      filename: `Delivery_Challan_${currentChallan.challanNo || 'Shayona'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { avoid: ['tr', '.challan-meta-grid', '.challan-signatures'] },
    };

    html2pdf()
      .set(opt)
      .from(printRef.current)
      .save()
      .then(() => setDownloadingPdf(false))
      .catch((err) => {
        console.error('PDF generation failed:', err);
        setDownloadingPdf(false);
      });
  };

  const handleOpenHtmlPreview = () => {
    if (!currentChallan?._id) return;
    window.open(`http://localhost:5000/api/delivery-challans/${currentChallan._id}/html`, '_blank');
  };

  if (loading || !currentChallan) {
    return (
      <div className="page-content text-center py-5">
        <div className="spinner-border text-primary" role="status" />
        <p className="text-muted mt-2">Loading Delivery Challan...</p>
      </div>
    );
  }

  const c = currentChallan;

  // Format date and time
  const formattedDate = c.challanDate
    ? new Date(c.challanDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).replace(/\//g, '.')
    : '';

  const dateTimeStr = [formattedDate, c.challanTime].filter(Boolean).join(' & ');

  // Group items by Title/Specification (like in the official format)
  const groupedItems = [];
  let currentGroup = null;

  (c.items || []).forEach((item) => {
    const titleKey = item.title?.trim() || '';
    if (titleKey && currentGroup && currentGroup.title === titleKey) {
      currentGroup.lines.push(item);
    } else {
      if (currentGroup) {
        groupedItems.push(currentGroup);
      }
      currentGroup = {
        title: titleKey,
        lines: [item],
      };
    }
  });
  if (currentGroup) {
    groupedItems.push(currentGroup);
  }

  const isShreno =
    c.challanType === 'shreno' ||
    (c.companyName && c.companyName.toLowerCase().includes('shreno')) ||
    (c.companyId && c.companyId.name && c.companyId.name.toLowerCase().includes('shreno')) ||
    (c.billedTo && c.billedTo.name && c.billedTo.name.toLowerCase().includes('shreno'));

  const poDateStr = c.poDate
    ? new Date(c.poDate)
        .toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
        .replace(/\//g, '.')
    : '';

  return (
    <div className="page-content">
      {/* Action Toolbar (hidden on print) */}
      <div className="d-flex align-items-center justify-content-between mb-4 no-print flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <Link
            to="/delivery-challan/shayoona"
            className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          >
            <i className="bi bi-arrow-left" /> Back to Challans
          </Link>
          <span className="text-muted small">|</span>
          <span className="fw-bold text-dark fs-5">
            Delivery Challan #{c.challanNo} {isShreno && <span className="badge bg-primary ms-2 fs-6">SHRENO</span>}
          </span>
        </div>

        <div className="d-flex gap-2">
          <Link
            to={`/delivery-challan/shayoona/edit/${c._id}`}
            className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          >
            <i className="bi bi-pencil" /> Edit Challan
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-outline-info d-flex align-items-center gap-2 px-3 shadow-sm"
            onClick={handleOpenHtmlPreview}
            title="Open pure Backend HTML template in new tab"
          >
            <i className="bi bi-filetype-html fs-6" /> HTML Preview
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary d-flex align-items-center gap-2 px-3 shadow-sm"
            onClick={handleDownloadPDF}
            disabled={downloadingPdf}
          >
            <i className={`bi ${downloadingPdf ? 'bi-hourglass-split' : 'bi-file-earmark-pdf-fill'} fs-6 text-danger`} />
            {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-accent d-flex align-items-center gap-2 px-3 shadow-sm"
            onClick={handlePrint}
          >
            <i className="bi bi-printer-fill fs-6" /> Print
          </button>
        </div>
      </div>

      {/* Printable Challan Sheet Container */}
      <div className="challan-print-wrapper d-flex justify-content-center">
        <div
          ref={printRef}
          className="challan-document bg-white text-dark"
          style={{
            width: '100%',
            maxWidth: '850px',
            border: '2px solid #000',
            outline: '2px solid #000',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            fontFamily: '"Times New Roman", Times, serif',
            color: '#000',
            fontSize: '13px',
            lineHeight: 1.35,
          }}
        >
          {/* Header Section */}
          <div className="text-center border-bottom border-dark border-2 pb-0">
            <h3
              className="fw-bold mb-1 pt-2"
              style={{
                color: '#1a56db',
                letterSpacing: '0.5px',
                fontSize: '22px',
                fontFamily: '"Times New Roman", Times, serif',
              }}
            >
              SHAYONA GLASS DECOR PVT. LTD.
            </h3>
            <div className="fw-bold" style={{ fontSize: '11px' }}>
              Plot.no-128,At &amp; Post Vavli, Ta. Jambusar, Dist : Bharuch, 392150
            </div>
            <div className="fw-bold pb-2" style={{ fontSize: '11px' }}>
              GSTIN NO:-24AAUCS9498K1Z5
            </div>
            <div
              className="fw-bold text-uppercase py-1 text-decoration-underline border-top border-dark border-2"
              style={{ fontSize: '15px', letterSpacing: '1px' }}
            >
              DELIVERY CHALLAN
            </div>
          </div>

          {/* Meta Information Grid */}
          {isShreno ? (
            <div className="row g-0 border-bottom border-dark border-2" style={{ fontSize: '13px' }}>
              <div className="col-6 border-end border-dark border-2 p-3 text-start" style={{ lineHeight: 1.6 }}>
                <div><strong>GATE PASS NO:</strong> <span className="fw-bold">{c.challanNo}</span></div>
                <div><strong>P.O. DATE:</strong>{poDateStr}</div>
                <div><strong>P.O. NO.:</strong>{c.poNo || c.buyersOrderNo || ''}</div>
                <div><strong>Date :</strong>{formattedDate}</div>
                <div><strong>Time:</strong>{c.challanTime || ''}</div>
                <div><strong>VEHICLE NO:</strong> <span className="fw-bold">{c.vehicleNo || ''}</span></div>
              </div>
              <div className="col-6 p-3 text-center d-flex flex-column justify-content-center" style={{ lineHeight: 1.5 }}>
                <div className="fw-bold mb-1">CONSIGNEE</div>
                <div className="fw-bold mb-1">{c.billedTo?.name || c.companyName || 'M/S SHRENO LTD'}</div>
                <div className="fw-bold mb-1">{c.billedTo?.addressLine1 || c.billedTo?.addressTitle || 'ALEMBIC ROAD'}</div>
                <div className="fw-bold mb-1">{c.billedTo?.city || 'VADODRA'}</div>
                <div className="fw-bold"><strong>GSTIN:</strong> {c.billedTo?.gstNo || '24AABCA7953Q1Z6'}</div>
              </div>
            </div>
          ) : (
            <div className="border-bottom border-dark border-2">
              {/* Row 1: Challan No, Date, Order / Dispatch Through, LR, Vehicle */}
              <div className="row g-0 border-bottom border-dark border-2">
                <div className="col-6 border-end border-dark border-2 p-2">
                  <div className="mb-1">
                    <strong>DELIVERY CHALLAN NO : </strong>
                    <span className="fw-bold">{c.challanNo}</span>
                  </div>
                  <div className="mb-1">
                    <strong>DATE &amp; TIME : </strong>
                    <span>{dateTimeStr || '-'}</span>
                  </div>
                  <div>
                    <strong>BUYERS ORDER NO : </strong>
                    <span>{c.buyersOrderNo || ''}</span>
                  </div>
                </div>

                <div className="col-6 p-2">
                  <div className="mb-1">
                    <strong>DISPATCH THROUGH : </strong>
                    <span>{c.dispatchThrough || ''}</span>
                  </div>
                  <div className="mb-1">
                    <strong>LR.NO : </strong>
                    <span>{c.lrNo || ''}</span>
                  </div>
                  <div>
                    <strong>VEHICLE NO : </strong>
                    <span className="fw-bold">{c.vehicleNo || ''}</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Billed To / Shipped To */}
              <div className="row g-0">
                {/* BILLED TO */}
                <div className="col-6 border-end border-dark border-2 p-2">
                  <div className="text-decoration-underline fw-bold mb-1">
                    BILLED TO :
                  </div>
                  <div className="fw-bold text-uppercase">
                    {c.billedTo?.name || c.companyName || ''}
                  </div>
                  {c.billedTo?.addressLine1 && (
                    <div className="text-uppercase">{c.billedTo.addressLine1},</div>
                  )}
                  {c.billedTo?.addressLine2 && (
                    <div className="text-uppercase">{c.billedTo.addressLine2},</div>
                  )}
                  {(c.billedTo?.city || c.billedTo?.pincode) && (
                    <div className="text-uppercase">
                      {c.billedTo?.city}
                      {c.billedTo?.pincode ? `-${c.billedTo.pincode}` : ''}
                    </div>
                  )}
                  {c.billedTo?.gstNo && (
                    <div className="fw-bold">
                      GSTIN NO - {c.billedTo.gstNo}
                    </div>
                  )}
                  <div>
                    <strong>STATE NAME:</strong>
                    {c.billedTo?.state || 'GUJARAT'},
                    <strong>CODE :</strong>
                    {c.billedTo?.stateCode || (c.billedTo?.gstNo ? c.billedTo.gstNo.substring(0, 2) : '24')}
                  </div>
                </div>

                {/* SHIPPED TO */}
                <div className="col-6 p-2">
                  <div className="text-decoration-underline fw-bold mb-1">
                    SHIPPED TO :
                  </div>
                  <div className="fw-bold text-uppercase">
                    {c.shippedTo?.name || c.billedTo?.name || c.companyName || ''}
                  </div>
                  {(c.shippedTo?.addressLine1 || c.billedTo?.addressLine1) && (
                    <div className="text-uppercase">
                      {c.shippedTo?.addressLine1 || c.billedTo?.addressLine1},
                    </div>
                  )}
                  {(c.shippedTo?.addressLine2 || c.billedTo?.addressLine2) && (
                    <div className="text-uppercase">
                      {c.shippedTo?.addressLine2 || c.billedTo?.addressLine2},
                    </div>
                  )}
                  {(c.shippedTo?.city || c.billedTo?.city) && (
                    <div className="text-uppercase">
                      {c.shippedTo?.city || c.billedTo?.city}
                      {(c.shippedTo?.pincode || c.billedTo?.pincode)
                        ? `-${c.shippedTo?.pincode || c.billedTo?.pincode}`
                        : ''}
                    </div>
                  )}
                  {(c.shippedTo?.gstNo || c.billedTo?.gstNo) && (
                    <div className="fw-bold">
                      GSTIN NO - {c.shippedTo?.gstNo || c.billedTo?.gstNo}
                    </div>
                  )}
                  <div>
                    <strong>STATE NAME:</strong>
                    {c.shippedTo?.state || c.billedTo?.state || 'GUJARAT'},
                    <strong>CODE :</strong>
                    {c.shippedTo?.stateCode || (c.shippedTo?.gstNo ? c.shippedTo.gstNo.substring(0, 2) : (c.billedTo?.stateCode || '24'))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Items Table */}
          <table
            className="table table-bordered border-dark mb-0 w-100"
            style={{
              borderColor: '#000',
              borderCollapse: 'collapse',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr className="text-center align-middle" style={{ borderColor: '#000' }}>
                <th
                  rowSpan={2}
                  className="p-1 border border-dark border-2 text-uppercase"
                  style={{ width: isShreno ? '60px' : '45px', fontWeight: 'bold' }}
                >
                  Sr No.
                </th>
                <th
                  rowSpan={2}
                  className="p-1 border border-dark border-2 text-uppercase"
                  style={{ fontWeight: 'bold' }}
                >
                  DESCRIPTION
                </th>
                <th
                  colSpan={3}
                  className="p-1 border border-dark border-2 text-uppercase"
                  style={{ fontWeight: 'bold' }}
                >
                  QUANTITY
                </th>
              </tr>
              <tr className="text-center" style={{ borderColor: '#000' }}>
                <th
                  className="p-1 border border-dark border-2 text-uppercase"
                  style={{ width: '110px', fontWeight: 'bold' }}
                >
                  BOX
                </th>
                <th
                  className="p-1 border border-dark border-2 text-uppercase"
                  style={{ width: isShreno ? '80px' : '70px', fontWeight: 'bold' }}
                >
                  UNIT
                </th>
                <th
                  className="p-1 border border-dark border-2 text-uppercase"
                  style={{ width: isShreno ? '120px' : '90px', fontWeight: 'bold' }}
                >
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {isShreno ? (
                // Shreno direct item list with material code, bottle spec, variant
                (c.items || []).map((item, idx) => (
                  <tr
                    key={idx}
                    style={{ borderColor: '#000' }}
                  >
                    <td
                      className="text-center p-2 border border-dark border-2 fw-bold align-middle"
                      style={{ verticalAlign: 'middle', width: '60px' }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      className="p-2 border border-dark border-2 align-middle text-start"
                      style={{ verticalAlign: 'middle', lineHeight: 1.5 }}
                    >
                      {item.materialCode && (
                        <div>
                          <u><b>{item.materialCode}</b></u>
                        </div>
                      )}
                      {item.title && (
                        <div>
                          <u><b>{item.title}</b></u>
                        </div>
                      )}
                      {item.description && (
                        <div>
                          <b>{item.description}</b>
                        </div>
                      )}
                    </td>
                    <td className="text-center p-2 border border-dark border-2 fw-bold align-middle">
                      {item.box || item.boxCount || '-'}
                    </td>
                    <td className="text-center p-2 border border-dark border-2 fw-bold align-middle">
                      {item.unit || '-'}
                    </td>
                    <td className="text-center p-2 border border-dark border-2 fw-bold align-middle">
                      {item.total ? Number(item.total).toLocaleString('en-IN') : '-'}
                    </td>
                  </tr>
                ))
              ) : (
                // Generic grouped items
                groupedItems.map((group, gIdx) => (
                  <React.Fragment key={gIdx}>
                    {group.lines.map((item, lineIdx) => (
                      <tr
                        key={lineIdx}
                        style={{
                          borderColor: '#000',
                          minHeight: '38px',
                        }}
                      >
                        <td
                          className="text-center p-2 border border-dark fw-bold align-top"
                          style={{ verticalAlign: 'top' }}
                        >
                          {lineIdx === 0 ? gIdx + 1 : ''}
                        </td>
                        <td className="p-2 border border-dark align-top">
                          {lineIdx === 0 && group.title && (
                            <div
                              className="fw-bold text-decoration-underline text-uppercase mb-1"
                              style={{ letterSpacing: '0.5px' }}
                            >
                              {group.title}
                            </div>
                          )}
                          {item.materialCode && (
                            <div>
                              <u><b>{item.materialCode}</b></u>
                            </div>
                          )}
                          <div className="fw-semibold text-uppercase">
                            {item.description}
                          </div>
                        </td>
                        <td className="text-center p-2 border border-dark fw-bold align-middle">
                          {item.box || item.boxCount || '-'}
                        </td>
                        <td className="text-center p-2 border border-dark align-middle">
                          {item.unit || '-'}
                        </td>
                        <td className="text-center p-2 border border-dark fw-bold align-middle">
                          {item.total ? Number(item.total).toLocaleString('en-IN') : '-'}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}

              {/* Total Summary Row */}
              <tr
                className="fw-bold"
                style={{ borderColor: '#000', height: '36px' }}
              >
                <td colSpan={2} className="text-center p-2 border border-dark border-2 text-uppercase letter-spacing-1">
                  TOTAL
                </td>
                <td className="text-center p-2 border border-dark border-2 fs-6 fw-bold">
                  {c.totalBoxes || (c.items || []).reduce((acc, it) => acc + (Number(it.boxCount) || Number(it.box) || 0), 0)}
                </td>
                <td className="p-2 border border-dark border-2"></td>
                <td className="text-center p-2 border border-dark border-2 fs-6 fw-bold">
                  {(c.totalQuantity !== undefined && c.totalQuantity !== null)
                    ? Number(c.totalQuantity).toLocaleString('en-IN')
                    : (c.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0).toLocaleString('en-IN')}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Signatures Section */}
          <div className="border-bottom border-dark border-2 p-3 d-flex justify-content-end">
            <div className="text-center" style={{ minWidth: '220px' }}>
              <div className="fw-bold small text-uppercase mb-4">MATERIAL ISSUED BY</div>
              <div className="fw-bold small text-uppercase">SIGNATURE</div>
            </div>
          </div>

          {/* Security Table Footer */}
          <div className="row g-0">
            <div className="col-6 border-end border-dark border-2 p-2" style={{ lineHeight: 1.8 }}>
              <div><strong>Checked :-</strong> {c.checkedBy || ''}</div>
              <div><strong>Date :-</strong> {c.checkedDate ? new Date(c.checkedDate).toLocaleDateString('en-GB').replace(/\//g, '.') : formattedDate}</div>
              <div><strong>Time :-</strong> {c.checkedTime || c.challanTime || ''}</div>
            </div>
            <div className="col-6 p-2 text-center">
              <div className="fw-bold small mb-4">Security Office</div>
              <div className="fw-bold small">Signature of Security</div>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .no-print,
          .navbar,
          .sidebar,
          .sidebar-nav,
          .mobile-close-btn,
          .header,
          header,
          aside {
            display: none !important;
          }
          .challan-print-wrapper,
          .challan-document,
          .challan-document * {
            visibility: visible;
          }
          .challan-print-wrapper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          .challan-document {
            max-width: 100% !important;
            border: 2px solid #000 !important;
            padding: 12px !important;
            box-shadow: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
}
