import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDeliveryChallanById } from '../../../redux/slices/deliveryChallanSlice';

export default function ViewShayonaChallan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { currentChallan, loading } = useSelector((state) => state.deliveryChallans);
  const printRef = useRef(null);

  useEffect(() => {
    dispatch(fetchDeliveryChallanById(id));
  }, [dispatch, id]);

  const handlePrint = () => {
    window.print();
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
            Delivery Challan #{c.challanNo}
          </span>
        </div>

        <div className="d-flex gap-2">
          <Link
            to={`/delivery-challan/shayoona/edit/${c._id}`}
            className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
          >
            <i className="bi bi-pencil" /> Edit Challan
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-accent d-flex align-items-center gap-2 px-3 shadow-sm"
            onClick={handlePrint}
          >
            <i className="bi bi-printer-fill fs-6" /> Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Printable Challan Sheet Container */}
      <div className="challan-print-wrapper d-flex justify-content-center">
        <div
          ref={printRef}
          className="challan-document bg-white p-4 text-dark"
          style={{
            width: '100%',
            maxWidth: '850px',
            border: '2px solid #000',
            fontFamily: '"Times New Roman", Times, serif',
            color: '#000',
            fontSize: '13px',
            lineHeight: 1.35,
          }}
        >
          {/* Header Section */}
          <div className="text-center pb-2 border-bottom border-dark">
            <h3
              className="fw-bold mb-1"
              style={{
                color: '#1a56db',
                letterSpacing: '1px',
                fontSize: '22px',
                fontFamily: '"Times New Roman", Times, serif',
              }}
            >
              SHAYONA GLASS DECOR PVT. LTD.
            </h3>
            <div className="fw-semibold" style={{ fontSize: '12px' }}>
              Plot.no-128,At & Post Vavdi, Ta. Jambusar, Dist : Bharuch, 392150
            </div>
            <div className="fw-bold" style={{ fontSize: '12px' }}>
              GSTIN NO:-24AAUCS9498K1Z5
            </div>
            <div
              className="fw-bold text-uppercase mt-1 text-decoration-underline"
              style={{ fontSize: '14px', letterSpacing: '0.5px' }}
            >
              DELIVERY CHALLAN
            </div>
          </div>

          {/* Meta Information Grid (2 Columns) */}
          <div className="row g-0 border-bottom border-dark">
            {/* Left Column: Challan No, Date, Order, Billed To */}
            <div className="col-6 border-end border-dark p-2">
              <div className="mb-1">
                <strong>DELIVERY CHALLAN NO : </strong>
                <span className="fw-bold">{c.challanNo}</span>
              </div>
              <div className="mb-1">
                <strong>DATE & TIME : </strong>
                <span>{dateTimeStr || '-'}</span>
              </div>
              <div className="mb-2">
                <strong>BUYERS ORDER NO : </strong>
                <span>{c.buyersOrderNo || ''}</span>
              </div>

              {/* BILLED TO */}
              <div className="pt-1 border-top border-dark">
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
            </div>

            {/* Right Column: Dispatch, LR, Vehicle, Shipped To */}
            <div className="col-6 p-2">
              <div className="mb-1">
                <strong>DISPATCH THROUGH : </strong>
                <span>{c.dispatchThrough || ''}</span>
              </div>
              <div className="mb-1">
                <strong>LR.NO : </strong>
                <span>{c.lrNo || ''}</span>
              </div>
              <div className="mb-2">
                <strong>VEHICLE NO : </strong>
                <span className="fw-bold">{c.vehicleNo || ''}</span>
              </div>

              {/* SHIPPED TO */}
              <div className="pt-1 border-top border-dark">
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
                  {c.shippedTo?.stateCode || c.billedTo?.stateCode || '24'}
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table
            className="table table-bordered border-dark mb-0 w-100"
            style={{
              borderColor: '#000',
              borderCollapse: 'collapse',
              fontSize: '12px',
            }}
          >
            <thead>
              <tr className="text-center align-middle" style={{ borderColor: '#000' }}>
                <th
                  rowSpan={2}
                  className="p-1 border border-dark"
                  style={{ width: '45px', fontWeight: 'bold' }}
                >
                  Sr No.
                </th>
                <th
                  rowSpan={2}
                  className="p-1 border border-dark"
                  style={{ fontWeight: 'bold' }}
                >
                  DESCRIPTION
                </th>
                <th
                  colSpan={3}
                  className="p-1 border border-dark"
                  style={{ fontWeight: 'bold' }}
                >
                  QUANTITY
                </th>
              </tr>
              <tr className="text-center" style={{ borderColor: '#000' }}>
                <th
                  className="p-1 border border-dark"
                  style={{ width: '110px', fontWeight: 'bold' }}
                >
                  BOX
                </th>
                <th
                  className="p-1 border border-dark"
                  style={{ width: '70px', fontWeight: 'bold' }}
                >
                  UNIT
                </th>
                <th
                  className="p-1 border border-dark"
                  style={{ width: '90px', fontWeight: 'bold' }}
                >
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((group, gIdx) => (
                <React.Fragment key={gIdx}>
                  {group.lines.map((item, lineIdx) => (
                    <tr
                      key={lineIdx}
                      style={{
                        borderColor: '#000',
                        minHeight: '38px',
                      }}
                    >
                      {/* Sr No shown on first line of group */}
                      <td
                        className="text-center p-2 border border-dark fw-bold align-top"
                        style={{ verticalAlign: 'top' }}
                      >
                        {lineIdx === 0 ? gIdx + 1 : ''}
                      </td>

                      {/* Description with Title */}
                      <td className="p-2 border border-dark align-top">
                        {lineIdx === 0 && group.title && (
                          <div
                            className="fw-bold text-decoration-underline text-uppercase mb-1"
                            style={{ letterSpacing: '0.5px' }}
                          >
                            {group.title}
                          </div>
                        )}
                        <div className="fw-semibold text-uppercase">
                          {item.description}
                        </div>
                      </td>

                      {/* Box expression / count */}
                      <td className="text-center p-2 border border-dark fw-bold align-middle">
                        {item.box || item.boxCount || '-'}
                      </td>

                      {/* Unit */}
                      <td className="text-center p-2 border border-dark align-middle">
                        {item.unit || '-'}
                      </td>

                      {/* Total */}
                      <td className="text-center p-2 border border-dark fw-bold align-middle">
                        {item.total ? item.total.toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}

              {/* Total Summary Row */}
              <tr
                className="border-top-2 border-dark fw-bold"
                style={{ borderColor: '#000', height: '36px' }}
              >
                <td colSpan={2} className="text-center p-2 border border-dark text-uppercase">
                  TOTAL
                </td>
                <td className="text-center p-2 border border-dark fs-6 fw-bold">
                  {c.totalBoxes || 0}
                </td>
                <td className="p-2 border border-dark"></td>
                <td className="text-center p-2 border border-dark fs-6 fw-bold">
                  {c.totalQuantity ? c.totalQuantity.toLocaleString() : 0}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer Signature Section */}
          <div className="border border-dark border-top-0 p-2">
            <div className="row g-0 align-items-end pt-2 pb-1">
              <div className="col-6 small">
                <div className="mb-1">
                  <strong>Checked :-</strong> {c.checkedBy || ''}
                </div>
                <div className="mb-1">
                  <strong>Date :-</strong> {c.checkedDate || formattedDate}
                </div>
                <div>
                  <strong>Time :-</strong> {c.checkedTime || c.challanTime || ''}
                </div>
              </div>

              <div className="col-6 text-end small">
                <div className="mb-4 fw-bold">MATERIAL ISSUED BY</div>
                <div className="border-top border-dark d-inline-block pt-1 text-center" style={{ minWidth: '180px' }}>
                  <div className="fw-bold">SIGNATURE</div>
                  <div className="text-muted" style={{ fontSize: '11px' }}>
                    Security Office / Signature of Security
                  </div>
                </div>
              </div>
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
