import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDeliveryChallanById } from '../../../redux/slices/deliveryChallanSlice';
import API from '../../../services/api';
import Swal from 'sweetalert2';

export default function ViewShernoChallan() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const printRef = useRef(null);

  const { currentChallan, loading } = useSelector((state) => state.deliveryChallans);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchDeliveryChallanById(id));
    }
  }, [dispatch, id]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      const res = await API.get(`/delivery-challan/${id}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Delivery_Challan_Sherno_${currentChallan?.challanNo || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('PDF download error:', err);
      Swal.fire('Error', 'Failed to generate PDF. You can use Print (Save as PDF).', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading || !currentChallan) {
    return (
      <div className="page-content text-center py-5">
        <div className="spinner-border text-primary me-2" />
        <span>Loading Sherno Delivery Challan...</span>
      </div>
    );
  }

  const c = currentChallan;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const challanDateStr = formatDate(c.challanDate);
  const poDateStr = formatDate(c.poDate || c.buyersOrderDate || '');
  const poNoStr = c.poNo || c.buyersOrderNo || '';
  const totalBoxes = c.totalBoxes || (c.items || []).reduce((acc, it) => acc + (Number(it.boxCount) || Number(it.box) || 0), 0);
  const totalQuantity = (c.totalQuantity !== undefined && c.totalQuantity !== null)
    ? Number(c.totalQuantity)
    : (c.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0);

  return (
    <div className="page-content">
      {/* Top Action Bar (Hidden in Print) */}
      <div className="page-header d-flex align-items-center justify-content-between mb-3 no-print">
        <div className="d-flex align-items-center gap-3">
          <Link
            to="/delivery-challan/sherno"
            className="btn btn-outline-secondary d-flex align-items-center gap-1"
          >
            <i className="bi bi-arrow-left" /> Back to Challans
          </Link>
          <h1 className="page-title mb-0 fs-4">
            Delivery Challan #{c.challanNo}{' '}
            <span className="badge bg-primary text-white ms-2 fs-6">SHRENO</span>
          </h1>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Link
            to={`/delivery-challan/sherno/edit/${c._id}`}
            className="btn btn-outline-secondary d-flex align-items-center gap-1"
          >
            <i className="bi bi-pencil" /> Edit Challan
          </Link>
          <a
            href={`http://localhost:5000/api/delivery-challan/${c._id}/html`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline-info d-flex align-items-center gap-1"
          >
            <i className="bi bi-filetype-html" /> HTML Preview
          </a>
          <button
            type="button"
            className="btn btn-outline-danger d-flex align-items-center gap-1"
            disabled={downloadingPdf}
            onClick={handleDownloadPdf}
          >
            {downloadingPdf ? (
              <span className="spinner-border spinner-border-sm" />
            ) : (
              <i className="bi bi-file-earmark-pdf" />
            )}
            Download PDF
          </button>
          <button
            type="button"
            className="btn btn-accent d-flex align-items-center gap-1 fw-bold"
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
            maxWidth: '820px',
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
                fontSize: '21px',
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
          <div className="row g-0 border-bottom border-dark border-2" style={{ fontSize: '13px' }}>
            {/* Left: Gate Pass, PO Details, Vehicle */}
            <div className="col-6 border-end border-dark border-2 p-3 text-start" style={{ lineHeight: 1.6 }}>
              <div><strong>GATE PASS NO:</strong> <span className="fw-bold">{c.challanNo}</span></div>
              <div><strong>P.O. DATE:</strong>{poDateStr}</div>
              <div><strong>P.O. NO.:</strong>{poNoStr}</div>
              <div><strong>Date :</strong>{challanDateStr}</div>
              <div><strong>Time:</strong>{c.challanTime || ''}</div>
              <div><strong>VEHICLE NO:</strong> <span className="fw-bold">{c.vehicleNo || ''}</span></div>
            </div>

            {/* Right: Consignee M/S SHRENO LTD */}
            <div className="col-6 p-3 text-center d-flex flex-column justify-content-center" style={{ lineHeight: 1.5 }}>
              <div className="fw-bold mb-1">CONSIGNEE</div>
              <div className="fw-bold mb-1">{c.billedTo?.name || 'M/S SHRENO LTD'}</div>
              <div className="fw-bold mb-1">{c.billedTo?.addressLine1 || c.billedTo?.addressTitle || 'ALEMBIC ROAD'}</div>
              <div className="fw-bold mb-1">{c.billedTo?.city || 'VADODRA'}</div>
              <div className="fw-bold"><strong>GSTIN:</strong> {c.billedTo?.gstNo || '24AABCA7953Q1Z6'}</div>
            </div>
          </div>

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
                  style={{ width: '60px', fontWeight: 'bold' }}
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
                  style={{ width: '80px', fontWeight: 'bold' }}
                >
                  UNIT
                </th>
                <th
                  className="p-1 border border-dark border-2 text-uppercase"
                  style={{ width: '120px', fontWeight: 'bold' }}
                >
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {(c.items || []).map((item, idx) => (
                <tr key={idx} style={{ borderColor: '#000' }}>
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
              ))}

              {/* Total Summary Row */}
              <tr className="fw-bold" style={{ borderColor: '#000', height: '36px' }}>
                <td
                  colSpan={2}
                  className="text-center p-2 border border-dark border-2 text-uppercase letter-spacing-1"
                >
                  TOTAL
                </td>
                <td className="text-center p-2 border border-dark border-2 fs-6 fw-bold">
                  {totalBoxes}
                </td>
                <td className="p-2 border border-dark border-2"></td>
                <td className="text-center p-2 border border-dark border-2 fs-6 fw-bold">
                  {totalQuantity.toLocaleString('en-IN')}
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
              <div><strong>Date :-</strong> {c.checkedDate ? formatDate(c.checkedDate) : challanDateStr}</div>
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
