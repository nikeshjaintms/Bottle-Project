import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import API from '../../services/api';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

export default function ViewReadyToDispatch() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const focusLineId = searchParams.get('focus');
  const isNewSend = searchParams.get('new') !== 'false';

  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlyFocused, setOnlyFocused] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        setLoading(true);
        const res = await API.get(`/ready-to-dispatch/${id}`);
        if (res.data?.success) {
          const recordData = res.data.data;
          setRecord(recordData);
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

// Helper to format line description - use stored description field
const getFormattedDescription = (vl) => {
  if (!vl) return '-';
  
  // First priority: use the stored description (user-edited or auto-generated)
  // This is what comes from backend in variantLines.description
  if (vl.description && String(vl.description).trim()) {
    return vl.description;
  }
  
  // Fallback: reconstruct from component data (for legacy records)
  const vDoc = vl.variantId && typeof vl.variantId === 'object' ? vl.variantId : null;
  const shade = vl.coatingShade || vDoc?.coatingShade || '';
  const variant = vl.variantName || vDoc?.variantName || vDoc?.name || '';
  const text = vl.textColor || (vDoc?.detectedTextColor && vDoc.detectedTextColor !== 'Not Detected' ? vDoc.detectedTextColor : '') || '';

  if (shade || variant || text) {
    const parts = [shade, variant, text].map((s) => String(s || '').trim()).filter(Boolean);
    if (parts.length > 0) return parts.join(' - ');
  }

  return vl.Description || '-';
};

  // Find focused line info if focusLineId is present
  let focusedLineInfo = null;
  if (record && focusLineId) {
    for (const grp of record.groups || []) {
      for (const line of grp.variantLines || []) {
        if (line._id?.toString() === focusLineId.toString()) {
          focusedLineInfo = {
            bottleName: grp.plainBottleName,
            description: getFormattedDescription(line),
            line,
            grp,
          };
          break;
        }
      }
      if (focusedLineInfo) break;
    }
  }

  // Auto-scroll to focused line
  useEffect(() => {
    if (record && focusLineId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`line-${focusLineId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [record, focusLineId]);

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

  // Export to Excel in Google Sheet format including Brand
  const handleExportExcel = () => {
    if (!record) return;

    const rows = [];

    // Row 1: Title
    rows.push([record.sheetTitle || 'Ready to Dispatch Material']);
    // Row 2: Date
    rows.push([formattedDate]);
    // Row 3: Headers
    rows.push([
      'Sr.No',
      'Description',
      'No.Of Boxes',
      'Produced Qty',
      'Weight',
      'Total Weight',
    ]);

    let srNo = 1;
    const groupsToExport = onlyFocused && focusedLineInfo
      ? [{ ...focusedLineInfo.grp, variantLines: [focusedLineInfo.line] }]
      : (record.groups || []);

    groupsToExport.forEach((grp) => {
      // Group Plain Bottle Header
      rows.push([srNo++, grp.plainBottleName, '', '', '', '']);

      // Variant Lines
      (grp.variantLines || []).forEach((vl) => {
        const descStr = getFormattedDescription(vl);
        rows.push([
          '',
          descStr,
          vl.noOfBoxes || 0,
          vl.producedQty || 0,
          vl.weight !== null && vl.weight !== undefined && vl.weight !== '' ? Number(vl.weight).toFixed(3) : '-',
          vl.totalWeight !== null && vl.totalWeight !== undefined && vl.totalWeight !== '' ? Number(vl.totalWeight).toFixed(1) : '-',
        ]);
      });

      // Spacer row
      rows.push(['', '', '', '', '', '']);
    });

    // Grand Totals row
    const totalBoxesCalc = groupsToExport.reduce((sum, g) => sum + (g.variantLines || []).reduce((s, l) => s + (Number(l.noOfBoxes) || 0), 0), 0);
    const totalQtyCalc = groupsToExport.reduce((sum, g) => sum + (g.variantLines || []).reduce((s, l) => s + (Number(l.producedQty) || 0), 0), 0);
    let totalWeightCalc = 0;
    let hasWeightCalc = false;
    groupsToExport.forEach((g) => {
      (g.variantLines || []).forEach((l) => {
        if (l.totalWeight !== null && l.totalWeight !== undefined && l.totalWeight !== '') {
          totalWeightCalc += Number(l.totalWeight);
          hasWeightCalc = true;
        }
      });
    });

    rows.push([
      '',
      '',
      totalBoxesCalc,
      totalQtyCalc,
      '',
      hasWeightCalc ? totalWeightCalc.toFixed(1) : '-',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws['!cols'] = [
      { wch: 8 },
      { wch: 45 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
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
          Back to Companies
        </Link>
      </div>
    );
  }

  // Visible groups based on onlyFocused toggle
  const displayGroups = (onlyFocused && focusedLineInfo)
    ? [{
      ...focusedLineInfo.grp,
      variantLines: focusedLineInfo.grp.variantLines.filter(
        (l) => l._id?.toString() === focusLineId?.toString()
      ),
    }]
    : (record.groups || []);

  const handleBack = () => {
    const compId = record?.companyId?._id || record?.companyId;
    if (compId) {
      navigate(`/ready-to-dispatch/company/${compId}`);
    } else {
      navigate('/ready-to-dispatch');
    }
  };

  return (
    <div className="page-content ready-to-dispatch-page ready-to-dispatch-view">
      {/* Action Toolbar (Hidden in Print) */}
      <div className="d-print-none d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="btn-ghost border-0 shadow-sm"
            style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Back to Company Ready To Dispatch"
          >
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-table text-primary" />
              {record.sheetTitle || 'Ready to Dispatch Material'}
            </h1>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3"
            onClick={handleExportExcel}
          >
            <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
          </button>
          <button
            type="button"
            className="btn btn-accent shadow-sm px-4 py-2 rounded-3"
            style={{ color: 'white', textDecoration: 'none' }}
            onClick={handlePrint}
          >
            <i className="bi bi-printer-fill me-2" /> Print Sheet
          </button>
          <Link
            to={`/ready-to-dispatch/edit/${record._id}`}
            className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3"
          >
            <i className="bi bi-pencil-fill me-2" /> Edit
          </Link>
        </div>
      </div>

      {/* Just added Banner when focused line is present */}
      {focusedLineInfo && (
        <div
          id="rtd-just-added-banner"
          className="alert alert-success d-print-none d-flex flex-wrap align-items-center justify-content-between p-3 rounded-3 shadow-sm mb-4 border border-success-subtle"
        >
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-check-circle-fill fs-4 text-success" />
            <div>
              <span className="badge bg-success me-2">{isNewSend ? 'Just added' : 'Entry view'}</span>
              <strong className="text-dark">{focusedLineInfo.bottleName}</strong>
              <span className="text-muted mx-1">·</span>
              <span className="fw-semibold text-dark">{focusedLineInfo.description}</span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-3">
            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input shadow-none cursor-pointer"
                type="checkbox"
                id="onlyFocusedToggle"
                checked={onlyFocused}
                onChange={(e) => setOnlyFocused(e.target.checked)}
              />
              <label className="form-check-label fw-semibold small cursor-pointer" htmlFor="onlyFocusedToggle">
                Show only this entry
              </label>
            </div>
          </div>
        </div>
      )}

      {/* SPREADSHEET CARD (Styled like Google Sheet) */}
      <div className="card border-0 shadow-sm rounded-3 bg-white p-3 p-md-4 mb-4">
        <div ref={printRef} className="sheet-container mx-auto" style={{ maxWidth: 1100 }}>
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
              {record.sheetTitle || 'TPP - Ready to Dispatch Material'}
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
            <div className="table-responsive ready-to-dispatch-sheet-table">
              <table
                className="table table-bordered mb-0 align-middle text-center"
                style={{
                  borderColor: '#5f6368',
                  fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
                }}
              >
                {/* Column Headers in Red matching Google Sheet */}
                <thead style={{ backgroundColor: '#ffffff' }}>
                  <tr style={{ color: '#b71c1c', fontWeight: 'bold' }}>
                    <th style={{ width: 50, padding: '6px 4px', fontSize: '0.9rem' }}>
                      Sr.No
                    </th>
                    <th style={{ minWidth: 280, padding: '6px 8px', fontSize: '0.9rem' }}>
                      description
                    </th>
                    <th style={{ width: 110, padding: '6px 4px', fontSize: '0.9rem' }}>
                      No.Of Boxes
                    </th>
                    <th style={{ width: 120, padding: '6px 4px', fontSize: '0.9rem' }}>
                      Produced Qty
                    </th>
                    <th style={{ width: 100, padding: '6px 4px', fontSize: '0.9rem' }}>
                      Weight
                    </th>
                    <th style={{ width: 115, padding: '6px 4px', fontSize: '0.9rem' }}>
                      Total Weight
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {displayGroups.map((grp, grpIdx) => (
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
                      {(grp.variantLines || []).map((vl, lineIdx) => {
                        const isFocused = focusLineId && vl._id?.toString() === focusLineId.toString();

                        return (
                          <tr
                            key={vl._id || lineIdx}
                            id={`line-${vl._id}`}
                            style={{
                              backgroundColor: isFocused ? '#fff9db' : '#ffffff',
                              border: isFocused ? '2px solid #fab005' : undefined,
                              transition: 'all 0.3s ease',
                            }}
                          >
                            <td style={{ padding: '6px 4px' }}></td>
                            <td
                              className="text-center fw-semibold text-dark"
                              style={{ padding: '6px 8px', fontSize: '0.88rem' }}
                            >
                              {getFormattedDescription(vl)}
                            </td>
                            <td className="fw-bold text-dark" style={{ padding: '6px 4px' }}>
                              {vl.noOfBoxes !== undefined && vl.noOfBoxes !== null ? vl.noOfBoxes : 0}
                            </td>
                            <td className="fw-bold text-dark" style={{ padding: '6px 4px' }}>
                              {(vl.producedQty || 0).toLocaleString()}
                            </td>
                            <td style={{ padding: '6px 4px' }}>
                              {vl.weight !== null && vl.weight !== undefined && vl.weight !== ''
                                ? Number(vl.weight).toFixed(3)
                                : '-'}
                            </td>
                            <td className="fw-semibold text-dark" style={{ padding: '6px 4px' }}>
                              {vl.totalWeight !== null && vl.totalWeight !== undefined && vl.totalWeight !== ''
                                ? Number(vl.totalWeight).toFixed(1)
                                : '-'}
                            </td>
                          </tr>
                        );
                      })}

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
                  {(() => {
                    const totalBoxes = displayGroups.reduce(
                      (sum, g) => sum + (g.variantLines || []).reduce((s, l) => s + (Number(l.noOfBoxes) || 0), 0),
                      0
                    );
                    const totalProducedQty = displayGroups.reduce(
                      (sum, g) => sum + (g.variantLines || []).reduce((s, l) => s + (Number(l.producedQty) || 0), 0),
                      0
                    );
                    let totalWeight = 0;
                    let hasWeight = false;
                    displayGroups.forEach((g) => {
                      (g.variantLines || []).forEach((l) => {
                        if (l.totalWeight !== null && l.totalWeight !== undefined && l.totalWeight !== '') {
                          totalWeight += Number(l.totalWeight);
                          hasWeight = true;
                        }
                      });
                    });

                    return (
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
                          {totalBoxes}
                        </td>
                        <td className="fw-bold text-danger" style={{ padding: '8px 4px' }}>
                          {totalProducedQty.toLocaleString()}
                        </td>
                        <td></td>
                        <td className="fw-bold text-danger" style={{ padding: '8px 4px' }}>
                          {hasWeight ? Number(totalWeight).toFixed(1) : '-'}
                        </td>
                      </tr>
                    );
                  })()}
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
    </div>
  );
}
