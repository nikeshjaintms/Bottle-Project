import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../../services/api';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

export default function ViewReadyToDispatch() {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef(null);

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        setLoading(true);
        const res = await API.get(`/ready-to-dispatch/${id}`);
        if (res.data?.success) {
          setRecord(res.data.data);
        }
      } catch (err) {
        console.error('Failed to load record:', err);
        Swal.fire('Error', err.response?.data?.message || 'Failed to load record', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchRecord();
  }, [id]);

  // Format Date to "Tuesday, September 29, 2026"
  const formattedDate = record?.dispatchDate
    ? new Date(record.dispatchDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Export to Excel in exact Google Sheet format
  const handleExportExcel = () => {
    if (!record) return;

    const rows = [];

    // Row 1: Title
    rows.push([record.sheetTitle || 'ready to dispatch material']);
    // Row 2: Date
    rows.push([formattedDate]);
    // Row 3: Headers
    rows.push([
      'sr.no',
      'description',
      'no.of boxes',
      'produced qty',
      'weight',
      'total weight',
    ]);

    let srNo = 1;
    (record.groups || []).forEach((grp) => {
      // Group Plain Bottle Header
      rows.push([srNo++, grp.plainBottleName, '', '', '', '']);

      // Variant Lines
      (grp.variantLines || []).forEach((vl) => {
        rows.push([
          '',
          vl.description,
          vl.noOfBoxes || 0,
          vl.producedQty || 0,
          Number(vl.weight || 9.5).toFixed(3),
          Number(vl.totalWeight || 0).toFixed(1),
        ]);
      });

      // Spacer row
      rows.push(['', '', '', '', '', '']);
    });

    // Grand Totals row
    rows.push([
      '',
      '',
      record.summary?.totalBoxes || 0,
      record.summary?.totalProducedQty || 0,
      '',
      Number(record.summary?.totalWeight || 0).toFixed(1),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set Column Widths
    ws['!cols'] = [
      { wch: 8 },
      { wch: 45 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = record.sheetTitle
      ? record.sheetTitle.slice(0, 30).replace(/[:\\\/\?\*\[\]]/g, '_')
      : 'Ready_To_Dispatch';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const filename = `${(record.sheetTitle || 'Ready_To_Dispatch').replace(/\s+/g, '_')}_${new Date(
      record.dispatchDate || Date.now()
    )
      .toISOString()
      .slice(0, 10)}.xlsx`;

    XLSX.writeFile(wb, filename);
  };

  if (loading) {
    return (
      <div className="page-content py-5 text-center">
        <div className="spinner-border text-primary" role="status" />
        <div className="text-muted mt-2">Loading sheet details...</div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="page-content py-5 text-center">
        <i className="bi bi-exclamation-triangle text-warning fs-1 d-block mb-3" />
        <h5>Record not found</h5>
        <Link to="/ready-to-dispatch" className="btn btn-primary btn-sm mt-2">
          Back to List
        </Link>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Action Toolbar (Hidden in Print) */}
      <div className="d-print-none d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-1 small">
              <li className="breadcrumb-item">
                <Link to="/ready-to-dispatch" className="text-decoration-none">
                  Ready to Dispatch
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                {record.sheetTitle || 'View Sheet'}
              </li>
            </ol>
          </nav>
          <h1 className="page-title mb-0 d-flex align-items-center gap-2">
            <i className="bi bi-table text-primary" />
            {record.sheetTitle || 'Ready to Dispatch Material'}
          </h1>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-success btn-sm shadow-sm"
            onClick={handleExportExcel}
          >
            <i className="bi bi-file-earmark-excel me-1" /> Export Excel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm shadow-sm"
            onClick={handlePrint}
          >
            <i className="bi bi-printer me-1" /> Print Sheet
          </button>
          <Link
            to={`/ready-to-dispatch/edit/${record._id}`}
            className="btn btn-outline-secondary btn-sm shadow-sm"
          >
            <i className="bi bi-pencil me-1" /> Edit
          </Link>
          <Link to="/ready-to-dispatch" className="btn btn-outline-secondary btn-sm shadow-sm">
            <i className="bi bi-arrow-left me-1" /> Back to List
          </Link>
        </div>
      </div>

      {/* SPREADSHEET CARD (Styled exactly like the Google Sheet in Screenshot) */}
      <div className="card border-0 shadow-sm rounded-3 bg-white p-3 p-md-4 mb-4">
        <div ref={printRef} className="sheet-container mx-auto" style={{ maxWidth: 1050 }}>
          <div
            className="border border-danger border-2 rounded-1 overflow-hidden bg-white"
            style={{ borderColor: '#e53935' }}
          >
            {/* Sheet Title Row */}
            <div
              className="text-center py-2 px-3 fw-bold fs-4 text-primary"
              style={{
                backgroundColor: '#e8f0fe',
                borderBottom: '1px solid #c2e7ff',
                letterSpacing: '0.5px',
                fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
              }}
            >
              {record.sheetTitle || 'TPP - ready to dispatch material'}
            </div>

            {/* Date Subtitle Row */}
            <div
              className="text-center py-1 px-3 fw-semibold text-primary small"
              style={{
                backgroundColor: '#f1f7fe',
                borderBottom: '2px solid #5f6368',
                fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
              }}
            >
              {formattedDate}
            </div>

            {/* Table */}
            <div className="table-responsive">
              <table
                className="table table-bordered mb-0 align-middle text-center"
                style={{
                  borderColor: '#5f6368',
                  fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
                }}
              >
                {/* Column Headers in Red */}
                <thead style={{ backgroundColor: '#ffffff' }}>
                  <tr style={{ color: '#b71c1c', fontWeight: 'bold' }}>
                    <th style={{ width: 60, padding: '6px 4px', fontSize: '0.9rem' }}>
                      sr.no
                    </th>
                    <th style={{ minWidth: 320, padding: '6px 8px', fontSize: '0.9rem' }}>
                      description
                    </th>
                    <th style={{ width: 110, padding: '6px 4px', fontSize: '0.9rem' }}>
                      no.of boxes
                    </th>
                    <th style={{ width: 120, padding: '6px 4px', fontSize: '0.9rem' }}>
                      produced qty
                    </th>
                    <th style={{ width: 95, padding: '6px 4px', fontSize: '0.9rem' }}>
                      weight
                    </th>
                    <th style={{ width: 110, padding: '6px 4px', fontSize: '0.9rem' }}>
                      total weight
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {(record.groups || []).map((grp, grpIdx) => (
                    <React.Fragment key={grp._id || grpIdx}>
                      {/* Plain Bottle Group Header */}
                      <tr style={{ backgroundColor: '#ffffff' }}>
                        <td className="fw-bold text-dark" style={{ padding: '6px 4px' }}>
                          {grpIdx + 1}
                        </td>
                        <td
                          className="text-center fw-bold text-primary"
                          style={{
                            padding: '6px 8px',
                            color: '#1a73e8',
                            textDecoration: 'underline',
                            fontSize: '0.95rem',
                          }}
                        >
                          {grp.plainBottleName}
                        </td>
                        <td style={{ backgroundColor: '#ffffff' }}></td>
                        <td style={{ backgroundColor: '#ffffff' }}></td>
                        <td style={{ backgroundColor: '#ffffff' }}></td>
                        <td style={{ backgroundColor: '#ffffff' }}></td>
                      </tr>

                      {/* Variant Lines */}
                      {(grp.variantLines || []).map((vl, lineIdx) => (
                        <tr key={vl._id || lineIdx} style={{ backgroundColor: '#ffffff' }}>
                          <td style={{ padding: '6px 4px' }}></td>
                          <td
                            className="text-center fw-semibold text-dark"
                            style={{ padding: '6px 8px', fontSize: '0.88rem' }}
                          >
                            {vl.description}
                          </td>
                          <td className="fw-bold text-dark" style={{ padding: '6px 4px' }}>
                            {vl.noOfBoxes || 0}
                          </td>
                          <td className="fw-bold text-dark" style={{ padding: '6px 4px' }}>
                            {(vl.producedQty || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 4px' }}>
                            {Number(vl.weight || 9.5).toFixed(3)}
                          </td>
                          <td className="fw-semibold text-dark" style={{ padding: '6px 4px' }}>
                            {Number(vl.totalWeight || 0).toFixed(1)}
                          </td>
                        </tr>
                      ))}

                      {/* Empty spacer row between groups */}
                      <tr style={{ height: 18, backgroundColor: '#ffffff' }}>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    </React.Fragment>
                  ))}

                  {/* Summary / Total Footer Row in Bold Red matching spreadsheet */}
                  <tr
                    style={{
                      backgroundColor: '#ffffff',
                      borderTop: '2px solid #5f6368',
                      color: '#b71c1c',
                      fontWeight: 'bold',
                      fontSize: '1rem',
                    }}
                  >
                    <td></td>
                    <td></td>
                    <td className="fw-bold text-danger" style={{ padding: '8px 4px' }}>
                      {record.summary?.totalBoxes || 0}
                    </td>
                    <td className="fw-bold text-danger" style={{ padding: '8px 4px' }}>
                      {(record.summary?.totalProducedQty || 0).toLocaleString()}
                    </td>
                    <td></td>
                    <td className="fw-bold text-danger" style={{ padding: '8px 4px' }}>
                      {Number(record.summary?.totalWeight || 0).toFixed(1)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Remarks Box */}
          {record.remarks && (
            <div className="mt-3 p-3 bg-light rounded-2 border text-muted small">
              <strong>Remarks:</strong> {record.remarks}
            </div>
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .admin-layout, .main-content, .page-wrapper {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          .sidebar, .topbar, .page-header, .btn, .d-print-none {
            display: none !important;
          }
          .sheet-container {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .card {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          table {
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #5f6368 !important;
          }
        }
      `}</style>
    </div>
  );
}
