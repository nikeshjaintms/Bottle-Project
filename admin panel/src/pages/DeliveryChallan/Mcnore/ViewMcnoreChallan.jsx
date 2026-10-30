import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDeliveryChallanById } from '../../../redux/slices/deliveryChallanSlice';
import API from '../../../services/api';
import Swal from 'sweetalert2';
import logo from '../../../assets/hero.png';

export default function ViewMcnoreChallan() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { currentChallan, loading } = useSelector((state) => state.deliveryChallans);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchDeliveryChallanById(id));
    }
  }, [id, dispatch]);

  const handlePrint = () => {
    window.print();
  };

  const handleOpenHtmlPreview = () => {
    const backendUrl = API.defaults.baseURL || 'http://localhost:5000/api';
    window.open(`${backendUrl}/delivery-challan/${id}/html`, '_blank');
  };

  const handleDownloadPDF = async () => {
    try {
      setDownloadingPdf(true);
      const response = await API.get(`/delivery-challan/${id}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Delivery_Challan_Mcnore_${currentChallan?.challanNo || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('PDF download error:', err);
      Swal.fire('Error', 'Failed to generate PDF. You can use the Print button to Save as PDF.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading && !currentChallan) {
    return (
      <div className="page-content text-center py-5">
        <div className="spinner-border text-primary" role="status" />
        <div className="mt-3 text-muted">Loading Mcnore delivery challan details...</div>
      </div>
    );
  }

  if (!currentChallan) {
    return (
      <div className="page-content text-center py-5">
        <h4>Delivery Challan Not Found</h4>
        <Link to="/delivery-challan/mcnore" className="btn btn-outline-primary mt-3">
          Back to Mcnore Challan List
        </Link>
      </div>
    );
  }

  const c = currentChallan;
  const items = c.items || [];
  const isWithPo = c.poMode === 'with_po' || !!c.poNo || items.some((it) => !!it.materialCode);
  const billedTo = c.billedTo || {};
  const shippedTo = c.shippedTo || {};

  const formatMaterialCode = (code) => {
    if (!code || !String(code).trim()) return 'MATERIAL CODE -';
    const clean = String(code).trim();
    if (/^material\s*code\s*[:-]?\s*/i.test(clean)) {
      return clean.replace(/^material\s*code\s*[:-]?\s*/i, 'MATERIAL CODE -').toUpperCase();
    }
    return `MATERIAL CODE -${clean}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null || val === '' || isNaN(val)) return '';
    const num = Number(val);
    if (num === 0) return '';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formattedDisDate = formatDate(c.challanDate);
  const formattedTaxInvDate = formatDate(c.taxInvoiceDate);
  const poCombined = isWithPo
    ? [c.poNo, formatDate(c.poDate)].filter(Boolean).join(' - ')
    : '';

  let srCounter = 1;

  return (
    <div className="page-content mcnore-view-page delivery-challan-view-page">
      {/* Top Action Bar (hidden on print) */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2 no-print">
        <div className="d-flex align-items-center gap-3">
          <Link
            to="/delivery-challan/mcnore"
            className="btn-ghost border-0 shadow-sm"
            style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Back to Mcnore Challans"
            aria-label="Back to Mcnore Challans"
          >
            <i className="bi bi-arrow-left fs-5" />
          </Link>
          <span className="badge bg-light text-dark border fs-6 px-3 py-2">
            Mcnore Challan #{c.challanNo} &nbsp;
            {isWithPo ? (
              <span className="badge bg-success-subtle text-success border border-success-subtle ms-1">With PO</span>
            ) : (
              <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle ms-1">Without PO</span>
            )}
          </span>
        </div>

        <div className="d-flex align-items-center gap-2">
          <Link
            to={`/delivery-challan/mcnore/edit/${c._id}`}
            className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3"
          >
            <i className="bi bi-pencil-fill me-2" /> Edit Challan
          </Link>
          <button
            type="button"
            className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3"
            onClick={handleOpenHtmlPreview}
            title="Open pure Backend HTML template in new tab"
          >
            <i className="bi bi-filetype-html me-2" /> HTML Preview
          </button>
          <button
            type="button"
            className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3"
            onClick={handleDownloadPDF}
            disabled={downloadingPdf}
          >
            <i className={`bi ${downloadingPdf ? 'bi-hourglass-split' : 'bi-file-earmark-pdf-fill'} me-2 text-danger`} />
            {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>
          <button
            type="button"
            className="btn btn-accent shadow-sm px-4 py-2 rounded-3"
            style={{ color: 'white', textDecoration: 'none' }}
            onClick={handlePrint}
          >
            <i className="bi bi-printer-fill me-2" /> Print
          </button>
        </div>
      </div>

      {/* Main Printable Challan Sheet */}
      <div className="challan-print-wrapper d-flex justify-content-center">
        <div
          className="mcnore-challan-sheet bg-white p-0 shadow"
          style={{
            width: '100%',
            maxWidth: '850px',
            border: '2px solid #000',
            outline: '2px solid #000',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            fontFamily: '"Times New Roman", Times, serif',
            color: '#000',
            fontSize: '12.5px',
            lineHeight: 1.3,
            backgroundColor: '#fff',
          }}
        >
          {/* Header */}
          <div className="text-center p-2 border-bottom border-dark border-2" style={{ position: 'relative' }}>
            <img
              src={logo}
              alt="Shayona Glass Decor logo"
              style={{ position: 'absolute', top: 0, left: 0, width: 140, height: 92, objectFit: 'contain' }}
            />
            <div
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#00b2ff',
                letterSpacing: '0.5px',
              }}
            >
              SHAYONA GLASS DECOR PVT. LTD.
            </div>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>
              Plot.no-128,At &amp; Post Vavli, Ta. Jambusar, Dist : Bharuch, 392150
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
              GSTIN NO:-24AAUCS9498K1Z5
            </div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                letterSpacing: '1px',
                marginTop: '3px',
              }}
            >
              DELIVERY CHALLAN
            </div>
          </div>

          {/* Meta Information Table (Stacked rows on left side) */}
          <table
            className="w-100"
            style={{
              borderCollapse: 'collapse',
              borderBottom: '2px solid #000',
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    width: '210px',
                    fontWeight: 'bold',
                    padding: '3px 8px',
                    borderRight: '2px solid #000',
                    borderBottom: '1px solid #000',
                  }}
                >
                  ORIGINAL TAX INVOICE NO:
                </td>
                <td style={{ padding: '3px 10px', borderBottom: '1px solid #000' }}>
                  {c.taxInvoiceNo || ''}
                </td>
              </tr>
              {isWithPo ? (
                <tr>
                  <td
                    style={{
                      fontWeight: 'bold',
                      padding: '3px 8px',
                      borderRight: '2px solid #000',
                      borderBottom: '1px solid #000',
                    }}
                  >
                    PO NO &amp; PO DATE:-
                  </td>
                  <td style={{ padding: '3px 10px', borderBottom: '1px solid #000', fontWeight: 'bold' }}>
                    {poCombined}
                  </td>
                </tr>
              ) : (
                <tr>
                  <td
                    style={{
                      fontWeight: 'bold',
                      padding: '3px 8px',
                      borderRight: '2px solid #000',
                      borderBottom: '1px solid #000',
                    }}
                  >
                    ORIGINAL TAX INVOICE DATE:
                  </td>
                  <td style={{ padding: '3px 10px', borderBottom: '1px solid #000' }}>
                    {formattedTaxInvDate}
                  </td>
                </tr>
              )}
              <tr>
                <td
                  style={{
                    fontWeight: 'bold',
                    padding: '3px 8px',
                    borderRight: '2px solid #000',
                    borderBottom: '1px solid #000',
                  }}
                >
                  DC NO:
                </td>
                <td style={{ padding: '3px 10px', borderBottom: '1px solid #000', fontWeight: 'bold' }}>
                  {c.challanNo}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    fontWeight: 'bold',
                    padding: '3px 8px',
                    borderRight: '2px solid #000',
                    borderBottom: '1px solid #000',
                  }}
                >
                  Dis Date :
                </td>
                <td style={{ padding: '3px 10px', borderBottom: '1px solid #000' }}>
                  {formattedDisDate}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    fontWeight: 'bold',
                    padding: '3px 8px',
                    borderRight: '2px solid #000',
                    borderBottom: '1px solid #000',
                  }}
                >
                  Time:
                </td>
                <td style={{ padding: '3px 10px', borderBottom: '1px solid #000' }}>
                  {c.challanTime || ''}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    fontWeight: 'bold',
                    padding: '3px 8px',
                    borderRight: '2px solid #000',
                    borderBottom: '1px solid #000',
                  }}
                >
                  Vehical No:
                </td>
                <td style={{ padding: '3px 10px', borderBottom: '1px solid #000', fontWeight: 'bold' }}>
                  {c.vehicleNo || ''}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    fontWeight: 'bold',
                    padding: '3px 8px',
                    borderRight: '2px solid #000',
                  }}
                >
                  Transporter
                </td>
                <td style={{ padding: '3px 10px' }}>
                  {c.transporter || c.dispatchThrough || ''}
                </td>
              </tr>
            </tbody>
          </table>

          {/* CONSIGNEE Banner */}
          <div
            className="text-center fw-bold py-1"
            style={{
              letterSpacing: '1px',
              borderBottom: '2px solid #000',
              fontSize: '13px',
              backgroundColor: '#fff',
            }}
          >
            CONSIGNEE
          </div>

          {/* BILLED TO / SHIPPED TO Table */}
          <table
            className="w-100"
            style={{
              borderCollapse: 'collapse',
              borderBottom: '2px solid #000',
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    width: '50%',
                    verticalAlign: 'top',
                    padding: '6px 10px',
                    borderRight: '2px solid #000',
                    fontSize: '12px',
                    textTransform: 'uppercase',
                  }}
                >
                  <div className="fw-bold mb-1">BILLED TO:</div>
                  <div className="fw-bold">{billedTo.name || c.companyName || 'MCNROE CONSUMER PRODUCT PVT.LTD'}</div>
                  {billedTo.addressTitle && <div>{billedTo.addressTitle}</div>}
                  {billedTo.addressLine1 && <div>{billedTo.addressLine1}</div>}
                  {billedTo.addressLine2 && <div>{billedTo.addressLine2}</div>}
                  {billedTo.city && (
                    <div>
                      TALUKA:{billedTo.city} DIST.:{billedTo.city}-{billedTo.pincode || ''}
                    </div>
                  )}
                  <div>GST NO-{billedTo.gstNo || '24AABCM5674J1ZA'}</div>
                </td>
                <td
                  style={{
                    width: '50%',
                    verticalAlign: 'top',
                    padding: '6px 10px',
                    fontSize: '12px',
                    textTransform: 'uppercase',
                  }}
                >
                  <div className="fw-bold mb-1">
                    {isWithPo ? 'SHIPPED TO:(PLACE OF SUPPLY)' : 'SHIPPED TO:'}
                  </div>
                  <div className="fw-bold">
                    {shippedTo.name || billedTo.name || c.companyName || 'MCNROE CONSUMER PRODUCT PVT.LTD'}
                  </div>
                  {shippedTo.addressTitle && <div>{shippedTo.addressTitle}</div>}
                  {shippedTo.addressLine1 && <div>{shippedTo.addressLine1}</div>}
                  {shippedTo.addressLine2 && <div>{shippedTo.addressLine2}</div>}
                  {shippedTo.city && (
                    <div>
                      TALUKA:{shippedTo.city} DIST.:{shippedTo.city}-{shippedTo.pincode || ''}
                    </div>
                  )}
                  <div>GST NO-{shippedTo.gstNo || billedTo.gstNo || '24AABCM5674J1ZA'}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Items Table */}
          <table
            className="w-100"
            style={{
              borderCollapse: 'collapse',
              fontSize: '12px',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid #000', textAlign: 'center', fontWeight: 'bold' }}>
                <th
                  rowSpan="2"
                  style={{
                    width: '45px',
                    borderRight: '2px solid #000',
                    borderBottom: '2px solid #000',
                    padding: '5px 2px',
                  }}
                >
                  SR.No.
                </th>
                <th
                  rowSpan="2"
                  style={{
                    borderRight: '2px solid #000',
                    borderBottom: '2px solid #000',
                    padding: '5px 6px',
                    textAlign: 'center',
                  }}
                >
                  DESCRIPTION
                </th>
                <th
                  rowSpan="2"
                  style={{
                    width: '65px',
                    borderRight: '2px solid #000',
                    borderBottom: '2px solid #000',
                    padding: '5px 2px',
                  }}
                >
                  HSN/SAC
                </th>
                <th
                  colSpan="3"
                  style={{
                    borderRight: '2px solid #000',
                    borderBottom: '1px solid #000',
                    padding: '3px 4px',
                    textAlign: 'center',
                  }}
                >
                  QUANTITY
                </th>
                <th
                  rowSpan="2"
                  style={{
                    width: '60px',
                    borderRight: '2px solid #000',
                    borderBottom: '2px solid #000',
                    padding: '5px 2px',
                  }}
                >
                  RATE
                </th>
                <th
                  rowSpan="2"
                  style={{
                    width: '80px',
                    borderBottom: '2px solid #000',
                    padding: '5px 2px',
                  }}
                >
                  TAXABLE<br />VALUE
                </th>
              </tr>
              <tr style={{ borderBottom: '2px solid #000', textAlign: 'center', fontWeight: 'bold' }}>
                <th
                  style={{
                    width: '100px',
                    borderRight: '2px solid #000',
                    borderBottom: '2px solid #000',
                    padding: '3px 2px',
                  }}
                >
                  BOX
                </th>
                <th
                  style={{
                    width: '55px',
                    borderRight: '2px solid #000',
                    borderBottom: '2px solid #000',
                    padding: '3px 2px',
                  }}
                >
                  UNIT
                </th>
                <th
                  style={{
                    width: '80px',
                    borderRight: '2px solid #000',
                    borderBottom: '2px solid #000',
                    padding: '3px 2px',
                  }}
                >
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const sr1 = srCounter++;
                const sr2 = srCounter++;
                const rateStr = it.rate ? formatCurrency(it.rate) : '';
                const taxValStr = it.taxableValue ? formatCurrency(it.taxableValue) : '';
                const jwRateStr = it.jobWorkRate ? formatCurrency(it.jobWorkRate) : '';
                const jwTaxValStr = it.jobWorkTaxableValue ? formatCurrency(it.jobWorkTaxableValue) : '';

                if (isWithPo || it.materialCode) {
                  // FORMAT 2: WITH PO / MATERIAL CODE (Format matching MCNORE DC FORMET 2 .xlsx)
                  // Row 1: MATERIAL CODE -<codeNumber> (Sr No 1, spanning HSN, Box, Unit, Total, Rate, Taxable Value)
                  // Row 2: GLASS BOTTLE + Spec title + Variant description (Sr No 2)
                  const matCodeLabel = formatMaterialCode(it.materialCode);
                  return (
                    <React.Fragment key={idx}>
                      {/* Line 1: MATERIAL CODE */}
                      <tr>
                        <td
                          className="text-center fw-bold"
                          style={{ borderRight: '2px solid #000', borderBottom: 'none', padding: '5px 2px', verticalAlign: 'top' }}
                        >
                          {sr1}
                        </td>
                        <td
                          className="fw-bold"
                          style={{ borderRight: '2px solid #000', borderBottom: 'none', padding: '5px 6px', verticalAlign: 'top' }}
                        >
                          {matCodeLabel}
                        </td>
                        <td
                          className="text-center"
                          style={{ borderRight: '2px solid #000', borderBottom: 'none', padding: '5px 2px', verticalAlign: 'top' }}
                        >
                          {it.hsn || '70109000'}
                        </td>
                        <td
                          className="text-center fw-bold"
                          style={{ borderRight: '2px solid #000', borderBottom: 'none', padding: '5px 2px', verticalAlign: 'top' }}
                        >
                          {it.box || ''}
                        </td>
                        <td
                          className="text-center"
                          style={{ borderRight: '2px solid #000', borderBottom: 'none', padding: '5px 2px', verticalAlign: 'top' }}
                        >
                          {it.unit || ''}
                        </td>
                        <td
                          className="text-end fw-bold pe-2"
                          style={{ borderRight: '2px solid #000', borderBottom: 'none', padding: '5px 4px', verticalAlign: 'top' }}
                        >
                          {it.total ? Number(it.total).toLocaleString('en-IN') : ''}
                        </td>
                        <td
                          className="text-end pe-2"
                          style={{ borderRight: '2px solid #000', borderBottom: 'none', padding: '5px 2px', verticalAlign: 'top' }}
                        >
                          {rateStr}
                        </td>
                        <td
                          className="text-end pe-2"
                          style={{ borderBottom: 'none', padding: '5px 2px', verticalAlign: 'top' }}
                        >
                          {taxValStr}
                        </td>
                      </tr>

                      {/* Line 2: GLASS BOTTLE + Spec Name & Variant */}
                      <tr>
                        <td
                          className="text-center fw-bold"
                          style={{ borderRight: '2px solid #000', borderTop: 'none', borderBottom: '1px solid #000', padding: '4px 2px', verticalAlign: 'top' }}
                        >
                          {sr2}
                        </td>
                        <td
                          style={{ borderRight: '2px solid #000', borderTop: 'none', borderBottom: '1px solid #000', padding: '4px 6px', verticalAlign: 'top' }}
                        >
                          <div className="fw-bold">GLASS BOTTLE</div>
                          {it.title && <div className="mt-1">{it.title}</div>}
                          {it.description && <div className="mt-1 small">{it.description}</div>}
                        </td>
                        <td style={{ borderRight: '2px solid #000', borderTop: 'none', borderBottom: '1px solid #000' }}>&nbsp;</td>
                        <td style={{ borderRight: '2px solid #000', borderTop: 'none', borderBottom: '1px solid #000' }}>&nbsp;</td>
                        <td style={{ borderRight: '2px solid #000', borderTop: 'none', borderBottom: '1px solid #000' }}>&nbsp;</td>
                        <td style={{ borderRight: '2px solid #000', borderTop: 'none', borderBottom: '1px solid #000' }}>&nbsp;</td>
                        <td style={{ borderRight: '2px solid #000', borderTop: 'none', borderBottom: '1px solid #000' }}>&nbsp;</td>
                        <td style={{ borderTop: 'none', borderBottom: '1px solid #000' }}>&nbsp;</td>
                      </tr>
                    </React.Fragment>
                  );
                } else {
                  // FORMAT 1: WITHOUT PO (Job Work charges)
                  return (
                    <React.Fragment key={idx}>
                      {/* Line 1: GLASS BOTTLE */}
                      <tr>
                        <td
                          className="text-center fw-bold"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {sr1}
                        </td>
                        <td
                          className="fw-bold"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                        >
                          GLASS BOTTLE
                        </td>
                        <td
                          className="text-center"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {it.hsn || '7010'}
                        </td>
                        <td
                          className="text-center fw-bold"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {it.box || ''}
                        </td>
                        <td
                          className="text-center"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {it.unit || ''}
                        </td>
                        <td
                          className="text-end fw-bold pe-2"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 4px' }}
                        >
                          {it.total ? Number(it.total).toLocaleString('en-IN') : ''}
                        </td>
                        <td
                          className="text-end pe-2"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {rateStr}
                        </td>
                        <td
                          className="text-end pe-2"
                          style={{ borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {taxValStr}
                        </td>
                      </tr>

                      {/* Line 2: JOB WORK CHARGES + Spec Name & Variant */}
                      <tr>
                        <td
                          className="text-center fw-bold"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {sr2}
                        </td>
                        <td
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                        >
                          <div className="fw-bold">JOB WORK CHARGES</div>
                          {it.title && <div className="mt-1">{it.title}</div>}
                          {it.description && <div className="mt-1 small">{it.description}</div>}
                        </td>
                        <td
                          className="text-center"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          9988
                        </td>
                        <td style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000' }}></td>
                        <td style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000' }}></td>
                        <td style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000' }}></td>
                        <td
                          className="text-end pe-2"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {jwRateStr}
                        </td>
                        <td
                          className="text-end pe-2"
                          style={{ borderBottom: '1px solid #000', padding: '3px 2px' }}
                        >
                          {jwTaxValStr}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                }
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', fontWeight: 'bold' }}>
                <td style={{ borderRight: '2px solid #000' }}></td>
                <td
                  className="text-center"
                  style={{
                    letterSpacing: '1px',
                    borderRight: '2px solid #000',
                    padding: '4px 6px',
                  }}
                >
                  TOTAL
                </td>
                <td style={{ borderRight: '2px solid #000' }}></td>
                <td
                  className="text-center"
                  style={{
                    borderRight: '2px solid #000',
                    padding: '4px 2px',
                  }}
                >
                  {c.totalBoxes || 0}
                </td>
                <td style={{ borderRight: '2px solid #000' }}></td>
                <td
                  className="text-end pe-2"
                  style={{
                    borderRight: '2px solid #000',
                    padding: '4px 4px',
                  }}
                >
                  {Number(c.totalQuantity || 0).toLocaleString('en-IN')}
                </td>
                <td style={{ borderRight: '2px solid #000' }}></td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {/* Bottom Right Summary Table */}
          <div className="d-flex justify-content-end" style={{ borderBottom: '2px solid #000' }}>
            <table
              style={{
                width: '330px',
                borderCollapse: 'collapse',
                borderLeft: '2px solid #000',
                fontSize: '11.5px',
              }}
            >
              <tbody>
                {!isWithPo ? (
                  <>
                    <tr>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                      >
                        GLASS BOTTLE VALUE
                      </td>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ width: '100px', borderBottom: '1px solid #000', padding: '3px 6px' }}
                      >
                        {formatCurrency(c.glassBottleValue)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                      >
                        JOB WORK CHARGES VALUE
                      </td>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderBottom: '1px solid #000', padding: '3px 6px' }}
                      >
                        {formatCurrency(c.jobWorkChargesValue)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                      >
                        JOB WORK CHARGES SGST@9%
                      </td>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderBottom: '1px solid #000', padding: '3px 6px' }}
                      >
                        {formatCurrency(c.sgst)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                      >
                        JOB WORK CHARGES CGST@9%
                      </td>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderBottom: '1px solid #000', padding: '3px 6px' }}
                      >
                        {formatCurrency(c.cgst)}
                      </td>
                    </tr>
                    <tr style={{ borderTop: '2px solid #000' }}>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderRight: '2px solid #000', padding: '4px 6px' }}
                      >
                        TOTAL
                      </td>
                      <td className="text-end fw-bold pe-2" style={{ padding: '4px 6px' }}>
                        {formatCurrency(c.grandTotalValue)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    {c.igst ? (
                      <tr>
                        <td
                          className="text-end fw-bold pe-2"
                          style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                        >
                          IGST@18%
                        </td>
                        <td
                          className="text-end fw-bold pe-2"
                          style={{ width: '100px', borderBottom: '1px solid #000', padding: '3px 6px' }}
                        >
                          {formatCurrency(c.igst)}
                        </td>
                      </tr>
                    ) : (
                      <>
                        <tr>
                          <td
                            className="text-end fw-bold pe-2"
                            style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                          >
                            SGST@9%
                          </td>
                          <td
                            className="text-end fw-bold pe-2"
                            style={{ width: '100px', borderBottom: '1px solid #000', padding: '3px 6px' }}
                          >
                            {formatCurrency(c.sgst)}
                          </td>
                        </tr>
                        <tr>
                          <td
                            className="text-end fw-bold pe-2"
                            style={{ borderRight: '2px solid #000', borderBottom: '1px solid #000', padding: '3px 6px' }}
                          >
                            CGST@9%
                          </td>
                          <td
                            className="text-end fw-bold pe-2"
                            style={{ borderBottom: '1px solid #000', padding: '3px 6px' }}
                          >
                            {formatCurrency(c.cgst)}
                          </td>
                        </tr>
                      </>
                    )}
                    <tr style={{ borderTop: '2px solid #000' }}>
                      <td
                        className="text-end fw-bold pe-2"
                        style={{ borderRight: '2px solid #000', padding: '4px 6px' }}
                      >
                        TOTAL
                      </td>
                      <td className="text-end fw-bold pe-2" style={{ padding: '4px 6px' }}>
                        {formatCurrency(c.grandTotalValue)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Signature Box */}
          <table
            className="w-100"
            style={{
              borderCollapse: 'collapse',
              fontSize: '12px',
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    width: '55%',
                    borderRight: '2px solid #000',
                    padding: '8px 10px',
                    verticalAlign: 'bottom',
                  }}
                >
                  <div className="mb-1">
                    <strong>Checked :-</strong> {c.checkedBy || ''}
                  </div>
                  <div className="mb-1">
                    <strong>Date :-</strong> {c.checkedDate || formattedDisDate}
                  </div>
                  <div>
                    <strong>Time :-</strong> {c.checkedTime || c.challanTime || ''}
                  </div>
                </td>
                <td
                  className="text-center"
                  style={{
                    width: '45%',
                    padding: '8px 10px',
                    verticalAlign: 'top',
                  }}
                >
                  <div className="fw-bold mb-3" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                    MATERIAL ISSUED BY
                  </div>
                  <div
                    className="d-inline-block text-center"
                    style={{ minWidth: '170px', marginTop: '10px' }}
                  >
                    <div className="fw-bold">SIGNATURE</div>
                    <div className="text-muted" style={{ fontSize: '10px' }}>
                      Security Office
                    </div>
                  </div>
                  <div className="fw-bold mt-3" style={{ fontSize: '11px' }}>
                    Signature of Security
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        .mcnore-challan-sheet,
        .mcnore-challan-sheet * {
          border-width: 1px !important;
        }
        .mcnore-challan-sheet {
          border: 1px solid #000 !important;
          outline: none !important;
        }
        @media print {
          body {
            background-color: #fff !important;
          }
          .no-print {
            display: none !important;
          }
          .mcnore-view-page {
            padding: 0 !important;
            margin: 0 !important;
          }
          .mcnore-challan-sheet {
            box-shadow: none !important;
            border: 1px solid #000 !important;
            outline: none !important;
            max-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
