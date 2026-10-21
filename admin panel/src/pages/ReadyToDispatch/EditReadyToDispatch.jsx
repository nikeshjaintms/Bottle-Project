import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import API from '../../services/api';
import SearchableSelect from '../../components/SearchableSelect';
import Swal from 'sweetalert2';

export default function EditReadyToDispatch() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Master Data
  const [companies, setCompanies] = useState([]);
  const [plainBottleOptions, setPlainBottleOptions] = useState([]);
  const [bottlePerBoxes, setBottlePerBoxes] = useState([]);
  const [variantsCache, setVariantsCache] = useState({});

  // Form State
  const [companyId, setCompanyId] = useState('');
  const [dispatchDate, setDispatchDate] = useState('');
  const [sheetTitle, setSheetTitle] = useState('');
  const [remarks, setRemarks] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load Masters & Existing Record
  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        const [resComp, resBPB, resDoc] = await Promise.all([
          API.get('/company', { params: { pagination: 'false' } }),
          API.get('/bottle-per-box', { params: { pagination: 'false' } }),
          API.get(`/ready-to-dispatch/${id}`),
        ]);

        const compList = resComp.data?.data || [];
        setCompanies(compList);

        const bpbList = resBPB.data?.data || [];
        setBottlePerBoxes(bpbList);

        const uniquePlainBottles = new Set();
        bpbList.forEach((b) => {
          if (b.plainBottleName && b.plainBottleName.trim()) {
            uniquePlainBottles.add(b.plainBottleName.trim());
          } else if (b.bottleName && b.bottleName.trim()) {
            uniquePlainBottles.add(b.bottleName.trim());
          }
        });

        const options = Array.from(uniquePlainBottles)
          .sort()
          .map((name) => ({ value: name, label: name }));
        setPlainBottleOptions(options);

        // Populate Existing Record
        const record = resDoc.data?.data;
        if (record) {
          setCompanyId(record.companyId?._id || record.companyId || '');
          setDispatchDate(
            record.dispatchDate ? new Date(record.dispatchDate).toISOString().slice(0, 10) : ''
          );
          setSheetTitle(record.sheetTitle || '');
          setRemarks(record.remarks || '');

          const loadedGroups = (record.groups || []).map((grp, gIdx) => ({
            id: `grp_${Date.now()}_${gIdx}`,
            plainBottleName: grp.plainBottleName || '',
            unit: grp.unit || '',
            bottleSpecId: grp.bottleSpecId?._id || grp.bottleSpecId || '',
            variantLines: (grp.variantLines || []).map((vl, lIdx) => ({
              id: `line_${Date.now()}_${gIdx}_${lIdx}`,
              variantId: vl.variantId?._id || vl.variantId || '',
              description: vl.description || '',
              noOfBoxes: vl.noOfBoxes !== undefined ? String(vl.noOfBoxes) : '',
              producedQty: vl.producedQty !== undefined ? String(vl.producedQty) : '',
              weight: vl.weight !== undefined ? String(vl.weight) : '9.500',
              totalWeight: vl.totalWeight !== undefined ? String(vl.totalWeight) : '',
            })),
          }));

          setGroups(loadedGroups);

          // Preload variants for all groups
          loadedGroups.forEach((g) => {
            if (g.plainBottleName) {
              fetchVariantsForBottle(g.plainBottleName, record.companyId?._id || record.companyId);
            }
          });
        }
      } catch (err) {
        console.error('Failed to initialize edit page:', err);
        Swal.fire('Error', err.response?.data?.message || 'Failed to load record', 'error');
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, [id]);

  // Lookup Unit (Pcs per Box) from master
  const lookupUnitForBottle = (bottleName) => {
    if (!bottleName || !bottlePerBoxes.length) return '';
    const clean = bottleName.trim().toLowerCase().replace(/\s+/g, ' ');

    const exact = bottlePerBoxes.find((b) => {
      const p = (b.plainBottleName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const n = (b.bottleName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return p === clean || n === clean;
    });
    if (exact && exact.bottlePerBox) return String(exact.bottlePerBox);

    const inAliases = bottlePerBoxes.find((b) => {
      if (Array.isArray(b.bottleNames)) {
        return b.bottleNames.some(
          (alias) => alias.trim().toLowerCase().replace(/\s+/g, ' ') === clean
        );
      }
      return false;
    });
    if (inAliases && inAliases.bottlePerBox) return String(inAliases.bottlePerBox);

    const partial = bottlePerBoxes.find((b) => {
      const p = (b.plainBottleName || b.bottleName || '').trim().toLowerCase();
      return p && (clean.includes(p) || p.includes(clean));
    });
    return partial?.bottlePerBox ? String(partial.bottlePerBox) : '';
  };

  // Fetch Variants for selected bottle
  const fetchVariantsForBottle = async (bottleName, cId = companyId) => {
    if (!bottleName) return [];
    if (variantsCache[bottleName]) return variantsCache[bottleName];

    try {
      const res = await API.get('/variant', {
        params: {
          plainBottleName: bottleName,
          companyId: cId || undefined,
          pagination: 'false',
        },
      });
      const vars = res.data?.data || [];
      setVariantsCache((prev) => ({ ...prev, [bottleName]: vars }));
      return vars;
    } catch (err) {
      console.error(`Failed to load variants for bottle ${bottleName}:`, err);
      return [];
    }
  };

  // Handle Plain Bottle Selection
  const handleGroupBottleChange = async (grpIdx, selectedBottle) => {
    const newGroups = [...groups];
    const grp = newGroups[grpIdx];
    grp.plainBottleName = selectedBottle;

    const unit = lookupUnitForBottle(selectedBottle);
    grp.unit = unit;

    await fetchVariantsForBottle(selectedBottle);

    grp.variantLines = grp.variantLines.map((vl) => {
      const boxes = Number(vl.noOfBoxes) || 0;
      const u = Number(unit) || 0;
      const calcQty = u > 0 && boxes > 0 ? boxes * u : vl.producedQty || '';
      const w = Number(vl.weight) || 9.5;
      const totalW = boxes > 0 ? parseFloat((boxes * w).toFixed(3)) : '';
      return {
        ...vl,
        producedQty: calcQty,
        totalWeight: totalW,
      };
    });

    setGroups(newGroups);
  };

  // Handle Variant Line Changes
  const handleLineChange = (grpIdx, lineIdx, field, value) => {
    const newGroups = [...groups];
    const grp = newGroups[grpIdx];
    const line = grp.variantLines[lineIdx];

    line[field] = value;

    if (field === 'variantId') {
      const vars = variantsCache[grp.plainBottleName] || [];
      const found = vars.find((v) => v._id === value);
      if (found) {
        const shade = found.coatingShade || '';
        const name = found.variantName || '';
        const text =
          found.detectedTextColor && found.detectedTextColor !== 'Not Detected'
            ? found.detectedTextColor
            : '';
        line.description = [shade, name, text].filter(Boolean).join(' - ') || found.variantName || found.name;
      }
    }

    const boxes = Number(line.noOfBoxes) || 0;
    const unit = Number(grp.unit) || 0;
    const weight = line.weight !== '' && line.weight !== undefined ? Number(line.weight) : 9.5;

    if (field === 'noOfBoxes') {
      if (unit > 0) {
        line.producedQty = boxes > 0 ? boxes * unit : '';
      }
      line.totalWeight = boxes > 0 ? parseFloat((boxes * weight).toFixed(3)) : '';
    } else if (field === 'weight') {
      line.totalWeight = boxes > 0 ? parseFloat((boxes * weight).toFixed(3)) : '';
    }

    setGroups(newGroups);
  };

  // Add Variant Line
  const addVariantLine = (grpIdx) => {
    const newGroups = [...groups];
    newGroups[grpIdx].variantLines.push({
      id: `line_${Date.now()}_${Math.random()}`,
      variantId: '',
      description: '',
      noOfBoxes: '',
      producedQty: '',
      weight: '9.500',
      totalWeight: '',
    });
    setGroups(newGroups);
  };

  // Remove Variant Line
  const removeVariantLine = (grpIdx, lineIdx) => {
    const newGroups = [...groups];
    if (newGroups[grpIdx].variantLines.length <= 1) {
      return Swal.fire('Info', 'Each plain bottle must have at least one variant line.', 'info');
    }
    newGroups[grpIdx].variantLines = newGroups[grpIdx].variantLines.filter(
      (_, idx) => idx !== lineIdx
    );
    setGroups(newGroups);
  };

  // Add Plain Bottle Group
  const addPlainBottleGroup = () => {
    setGroups([
      ...groups,
      {
        id: `grp_${Date.now()}`,
        plainBottleName: '',
        unit: '',
        variantLines: [
          {
            id: `line_${Date.now()}_1`,
            variantId: '',
            description: '',
            noOfBoxes: '',
            producedQty: '',
            weight: '9.500',
            totalWeight: '',
          },
        ],
      },
    ]);
  };

  // Remove Plain Bottle Group
  const removePlainBottleGroup = (grpIdx) => {
    if (groups.length <= 1) {
      return Swal.fire('Info', 'At least one Plain Bottle group is required.', 'info');
    }
    setGroups(groups.filter((_, idx) => idx !== grpIdx));
  };

  // Live Totals
  const totals = useMemo(() => {
    let totalBoxes = 0;
    let totalProducedQty = 0;
    let totalWeight = 0;

    groups.forEach((grp) => {
      grp.variantLines.forEach((vl) => {
        const b = Number(vl.noOfBoxes) || 0;
        const q = Number(vl.producedQty) || 0;
        const w = Number(vl.totalWeight) || (b * (Number(vl.weight) || 9.5));

        totalBoxes += b;
        totalProducedQty += q;
        totalWeight += w;
      });
    });

    return {
      totalBoxes,
      totalProducedQty,
      totalWeight: parseFloat(totalWeight.toFixed(3)),
    };
  }, [groups]);

  // Handle Update Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!companyId) {
      return Swal.fire('Warning', 'Please select a Company', 'warning');
    }

    if (!dispatchDate) {
      return Swal.fire('Warning', 'Please select a Dispatch Date', 'warning');
    }

    const payloadGroups = groups
      .map((g) => ({
        plainBottleName: g.plainBottleName.trim(),
        unit: Number(g.unit) || 0,
        variantLines: g.variantLines
          .filter((vl) => vl.description && vl.description.trim())
          .map((vl) => ({
            variantId: vl.variantId || null,
            description: vl.description.trim(),
            noOfBoxes: Number(vl.noOfBoxes) || 0,
            producedQty: Number(vl.producedQty) || 0,
            weight: Number(vl.weight) || 9.5,
            totalWeight: Number(vl.totalWeight) || 0,
          })),
      }))
      .filter((g) => g.variantLines.length > 0);

    if (payloadGroups.length === 0) {
      return Swal.fire(
        'Warning',
        'Please enter at least one valid variant line with description',
        'warning'
      );
    }

    try {
      setSaving(true);
      const res = await API.put(`/ready-to-dispatch/${id}`, {
        companyId,
        dispatchDate,
        sheetTitle,
        remarks,
        groups: payloadGroups,
      });

      if (res.data?.success) {
        Swal.fire({
          icon: 'success',
          title: 'Updated Successfully!',
          text: 'Ready to Dispatch sheet updated.',
          timer: 1500,
          showConfirmButton: false,
        });
        navigate(`/ready-to-dispatch/view/${id}`);
      }
    } catch (err) {
      console.error('Update error:', err);
      Swal.fire('Error', err.response?.data?.message || 'Failed to update record', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-content py-5 text-center">
        <div className="spinner-border text-primary" role="status" />
        <div className="text-muted mt-2">Loading sheet details...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-1 small">
              <li className="breadcrumb-item">
                <Link to="/ready-to-dispatch" className="text-decoration-none">
                  Ready to Dispatch
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                Edit Sheet
              </li>
            </ol>
          </nav>
          <h1 className="page-title mb-0 d-flex align-items-center gap-2">
            <i className="bi bi-pencil-square text-primary" />
            Edit Ready to Dispatch Material
          </h1>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Link
            to={`/ready-to-dispatch/view/${id}`}
            className="btn btn-outline-primary btn-sm shadow-sm"
          >
            <i className="bi bi-eye me-1" /> View Sheet
          </Link>
          <Link to="/ready-to-dispatch" className="btn btn-outline-secondary btn-sm shadow-sm">
            <i className="bi bi-arrow-left me-1" /> Back to List
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Section 1: Sheet & Party Details */}
        <div className="card border-0 shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom">
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-file-text-fill text-primary" />
              1. Sheet &amp; Party Details
            </h6>
          </div>
          <div className="card-body p-4">
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label small fw-bold text-muted">
                  Company / Party <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select form-select-sm"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Company --</option>
                  {companies.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} {c.shortName ? `(${c.shortName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-3">
                <label className="form-label small fw-bold text-muted">
                  Dispatch Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-5">
                <label className="form-label small fw-bold text-muted">Sheet Title / Heading</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={sheetTitle}
                  onChange={(e) => setSheetTitle(e.target.value)}
                  placeholder="e.g. TPP - ready to dispatch material"
                />
              </div>

              <div className="col-12">
                <label className="form-label small fw-bold text-muted">Remarks / Notes</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional notes or vehicle / batch reference"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Plain Bottles & Variant Lines */}
        <div className="card border-0 shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-boxes text-primary" />
              2. Plain Bottles &amp; Variant Quantities
            </h6>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={addPlainBottleGroup}
            >
              <i className="bi bi-plus-lg me-1" /> Add Plain Bottle
            </button>
          </div>

          <div className="card-body p-4">
            {groups.map((grp, grpIdx) => {
              const variants = variantsCache[grp.plainBottleName] || [];

              return (
                <div key={grp.id} className="p-3 border rounded-3 mb-4 bg-light shadow-sm">
                  {/* Group Header */}
                  <div className="row g-2 align-items-center mb-3 pb-3 border-bottom bg-white p-2 rounded-2">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-primary mb-1">
                        Plain Bottle #{grpIdx + 1} <span className="text-danger">*</span>
                      </label>
                      <SearchableSelect
                        options={plainBottleOptions}
                        value={grp.plainBottleName}
                        onChange={(val) => handleGroupBottleChange(grpIdx, val)}
                        placeholder="Search & Select Plain Bottle..."
                      />
                    </div>

                    <div className="col-md-3">
                      <label className="form-label small fw-bold text-muted mb-1">
                        Unit (Pcs / Box)
                      </label>
                      <input
                        type="number"
                        className="form-control form-control-sm bg-light"
                        value={grp.unit}
                        onChange={(e) => {
                          const newGroups = [...groups];
                          newGroups[grpIdx].unit = e.target.value;
                          setGroups(newGroups);
                        }}
                        placeholder="Auto-resolved or input"
                      />
                    </div>

                    <div className="col-md-3 text-end pt-3">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => removePlainBottleGroup(grpIdx)}
                        title="Remove Plain Bottle group"
                      >
                        <i className="bi bi-trash me-1" /> Remove Bottle
                      </button>
                    </div>
                  </div>

                  {/* Variant Lines Table */}
                  <div className="table-responsive">
                    <table className="table table-bordered table-sm align-middle mb-2 bg-white">
                      <thead className="table-light small text-uppercase text-secondary">
                        <tr>
                          <th style={{ width: 40 }} className="text-center">#</th>
                          <th style={{ minWidth: 260 }}>Variant / Shade Description</th>
                          <th style={{ width: 130 }} className="text-center">No. of Boxes</th>
                          <th style={{ width: 140 }} className="text-center">Produced Qty</th>
                          <th style={{ width: 120 }} className="text-center">Weight / Box (kg)</th>
                          <th style={{ width: 140 }} className="text-end">Total Weight (kg)</th>
                          <th style={{ width: 45 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {grp.variantLines.map((vl, lineIdx) => {
                          const variantOptions = variants.map((v) => {
                            const shade = v.coatingShade || '';
                            const vName = v.variantName || v.name || '';
                            const textColor =
                              v.detectedTextColor && v.detectedTextColor !== 'Not Detected'
                                ? v.detectedTextColor
                                : '';
                            const label = [shade, vName, textColor].filter(Boolean).join(' - ');
                            return {
                              value: v._id,
                              label: label || vName,
                            };
                          });

                          return (
                            <tr key={vl.id}>
                              <td className="text-center small text-muted">{lineIdx + 1}</td>

                              <td>
                                {variants.length > 0 && (
                                  <select
                                    className="form-select form-select-sm mb-1 text-primary fw-medium"
                                    value={vl.variantId}
                                    onChange={(e) =>
                                      handleLineChange(grpIdx, lineIdx, 'variantId', e.target.value)
                                    }
                                  >
                                    <option value="">-- Quick Choose Preset Variant --</option>
                                    {variantOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  placeholder="e.g. TR.RED-GOD FATHER-WHITE ORGANIC"
                                  value={vl.description}
                                  onChange={(e) =>
                                    handleLineChange(grpIdx, lineIdx, 'description', e.target.value)
                                  }
                                  required
                                />
                              </td>

                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm text-center fw-bold"
                                  placeholder="0"
                                  min="0"
                                  value={vl.noOfBoxes}
                                  onChange={(e) =>
                                    handleLineChange(grpIdx, lineIdx, 'noOfBoxes', e.target.value)
                                  }
                                  required
                                />
                              </td>

                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm text-center text-primary fw-bold"
                                  placeholder="0"
                                  min="0"
                                  value={vl.producedQty}
                                  onChange={(e) =>
                                    handleLineChange(grpIdx, lineIdx, 'producedQty', e.target.value)
                                  }
                                />
                              </td>

                              <td>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="form-control form-control-sm text-center"
                                  placeholder="9.500"
                                  value={vl.weight}
                                  onChange={(e) =>
                                    handleLineChange(grpIdx, lineIdx, 'weight', e.target.value)
                                  }
                                />
                              </td>

                              <td>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="form-control form-control-sm text-end fw-bold bg-light"
                                  value={vl.totalWeight}
                                  readOnly
                                  placeholder="0.000"
                                />
                              </td>

                              <td className="text-center">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger p-1"
                                  onClick={() => removeVariantLine(grpIdx, lineIdx)}
                                  title="Remove Line"
                                >
                                  <i className="bi bi-x-lg" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mt-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => addVariantLine(grpIdx)}
                    >
                      <i className="bi bi-plus-lg me-1" /> Add Variant Line
                    </button>
                    <div className="text-muted small">
                      Group Subtotal:{' '}
                      <strong className="text-dark">
                        {grp.variantLines.reduce((acc, vl) => acc + (Number(vl.noOfBoxes) || 0), 0)}{' '}
                        boxes
                      </strong>{' '}
                      |{' '}
                      <strong className="text-primary">
                        {grp.variantLines
                          .reduce((acc, vl) => acc + (Number(vl.producedQty) || 0), 0)
                          .toLocaleString()}{' '}
                        pcs
                      </strong>{' '}
                      |{' '}
                      <strong className="text-dark">
                        {grp.variantLines
                          .reduce((acc, vl) => acc + (Number(vl.totalWeight) || 0), 0)
                          .toFixed(3)}{' '}
                        kg
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Summary Totals */}
        <div className="card border-0 shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-body p-4">
            <div className="row g-3 text-center align-items-center">
              <div className="col-12 col-md-3">
                <div className="text-muted small text-uppercase fw-bold">Plain Bottle Groups</div>
                <div className="fs-3 fw-bold text-dark">{groups.length}</div>
              </div>
              <div className="col-12 col-md-3">
                <div className="text-muted small text-uppercase fw-bold">Total Boxes</div>
                <div className="fs-3 fw-bold text-success">
                  {totals.totalBoxes.toLocaleString()}
                </div>
              </div>
              <div className="col-12 col-md-3">
                <div className="text-muted small text-uppercase fw-bold">Total Produced Qty</div>
                <div className="fs-3 fw-bold text-primary">
                  {totals.totalProducedQty.toLocaleString()}
                </div>
              </div>
              <div className="col-12 col-md-3">
                <div className="text-muted small text-uppercase fw-bold">Total Weight (kg)</div>
                <div className="fs-3 fw-bold text-warning">
                  {totals.totalWeight.toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 3,
                  })}
                </div>
              </div>
            </div>

            <hr className="my-4" />

            <div className="d-flex justify-content-end gap-2">
              <Link to="/ready-to-dispatch" className="btn btn-outline-secondary px-4">
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-primary px-5 fw-bold shadow-sm"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    Updating...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle me-1" /> Update Sheet
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
