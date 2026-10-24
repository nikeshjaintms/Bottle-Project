import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API from '../../services/api';
import Select from 'react-select';
import Swal from 'sweetalert2';

export default function EditReadyToDispatch() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Master Data
  const [companies, setCompanies] = useState([]);
  const [plainBottleOptions, setPlainBottleOptions] = useState([]);
  const [loadingPlainBottles, setLoadingPlainBottles] = useState(false);
  const [variantsCache, setVariantsCache] = useState({});
  const [loadingVariants, setLoadingVariants] = useState({});

  // Form State
  const [companyId, setCompanyId] = useState('');
  const [dispatchDate, setDispatchDate] = useState('');
  const [sheetTitle, setSheetTitle] = useState('');
  const [remarks, setRemarks] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load Companies & Record
  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        const [resComp, resDoc] = await Promise.all([
          API.get('/company', { params: { pagination: 'false' } }),
          API.get(`/ready-to-dispatch/${id}`),
        ]);

        const compList = (resComp.data?.data || []).filter((c) => !c.isDeleted);
        setCompanies(compList);

        const record = resDoc.data?.data;
        if (record) {
          const cId = record.companyId?._id || record.companyId || '';
          setCompanyId(cId);
          setDispatchDate(
            record.dispatchDate ? new Date(record.dispatchDate).toISOString().slice(0, 10) : ''
          );
          setSheetTitle(record.sheetTitle || '');
          setRemarks(record.remarks || '');

          // Load plain bottles for this company
          let pbOptionsList = [];
          if (cId) {
            try {
              const resPB = await API.get('/ready-to-dispatch/options/plain-bottles', {
                params: { companyId: cId },
              });
              const list = resPB.data?.data || [];
              pbOptionsList = list.map((b) => ({
                value: b.id,
                label: b.name,
                name: b.name,
                id: b.id,
                bottlePerBox: b.bottlePerBox,
                boxWeight: b.boxWeight,
                variantCount: b.variantCount,
              }));
              pbOptionsList.sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" })
              );
              setPlainBottleOptions(pbOptionsList);
            } catch (err) {
              console.error('Failed to load plain bottle options:', err);
            }
          }

          // Populate groups
          const loadedGroups = (record.groups || []).map((grp, gIdx) => {
            // Match plain bottle by plainBottleId or by name
            const matchedOpt =
              pbOptionsList.find((opt) => opt.id === String(grp.plainBottleId)) ||
              pbOptionsList.find((opt) => (opt.name || '').trim().toLowerCase() === (grp.plainBottleName || '').trim().toLowerCase());

            const resolvedPbId = matchedOpt ? matchedOpt.id : (grp.plainBottleId || grp.plainBottleName);

            return {
              id: `grp_${Date.now()}_${gIdx}`,
              _id: grp._id,
              plainBottleId: matchedOpt ? matchedOpt.id : (grp.plainBottleId || ''),
              plainBottleName: grp.plainBottleName || (matchedOpt ? matchedOpt.name : ''),
              unit: grp.unit !== undefined && grp.unit !== null ? String(grp.unit) : (matchedOpt?.bottlePerBox ? String(matchedOpt.bottlePerBox) : ''),
              weight: matchedOpt?.boxWeight !== undefined && matchedOpt?.boxWeight !== null ? String(matchedOpt.boxWeight) : '',
              bottleSpecId: grp.bottleSpecId?._id || grp.bottleSpecId || '',
              variantLines: (grp.variantLines || []).map((vl, lIdx) => {
                const vDoc = vl.variantId;
                const vId = vDoc?._id ? String(vDoc._id) : (vl.variantId ? String(vl.variantId) : '');
                const bId = vl.brandId?._id ? String(vl.brandId._id) : (vl.brandId ? String(vl.brandId) : '');
                const sId = vl.bottleSpecId?._id ? String(vl.bottleSpecId._id) : (vl.bottleSpecId ? String(vl.bottleSpecId) : '');
                const uKey = vl.uniqueKey || (vId && bId ? `${vId}_${bId}_${sId}` : (vId ? `${vId}_${bId}` : ''));

                return {
                  id: `line_${Date.now()}_${gIdx}_${lIdx}`,
                  _id: vl._id,
                  uniqueKey: uKey,
                  variantId: vId,
                  bottleSpecId: sId,
                  specCode: vl.bottleSpecId?.code || '',
                  specBottleName: vl.bottleSpecId?.bottleName || '',
                  brandId: bId,
                  brandName: vl.brandName || vl.brandId?.name || '',
                  variantName: vDoc?.variantName || vDoc?.name || '',
                  coatingShade: vDoc?.coatingShade || '',
                  textColor: (vDoc?.detectedTextColor && vDoc.detectedTextColor !== 'Not Detected') ? vDoc.detectedTextColor : '',
                  variantDescription: vl.description || (() => {
                    const shade = vDoc?.coatingShade || '';
                    const vName = vDoc?.variantName || vDoc?.name || '';
                    const txt = (vDoc?.detectedTextColor && vDoc.detectedTextColor !== 'Not Detected') ? vDoc.detectedTextColor : '';
                    const parts = [shade, vName, txt].map((s) => String(s || '').trim()).filter(Boolean);
                    return parts.length > 0 ? parts.join(' - ') : '';
                  })(),
                  sourcePlanType: vl.sourcePlanType || '',
                  sourcePlanId: vl.sourcePlanId || '',
                  noOfBoxes: vl.noOfBoxes !== undefined && vl.noOfBoxes !== null ? String(vl.noOfBoxes) : '',
                  producedQty: vl.producedQty !== undefined && vl.producedQty !== null ? String(vl.producedQty) : '',
                  weight: vl.weight !== undefined && vl.weight !== null ? String(vl.weight) : '',
                  totalWeight: vl.totalWeight !== undefined && vl.totalWeight !== null ? String(vl.totalWeight) : '',
                };
              }),
            };
          });

          setGroups(loadedGroups);

          // Preload variants for all groups
          loadedGroups.forEach((g) => {
            if (g.plainBottleId) {
              fetchVariantsForBottle(g.plainBottleId, cId);
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

  // Load plain bottles for selected company
  const loadPlainBottles = async (cId) => {
    if (!cId) {
      setPlainBottleOptions([]);
      return;
    }
    try {
      setLoadingPlainBottles(true);
      const res = await API.get('/ready-to-dispatch/options/plain-bottles', {
        params: { companyId: cId },
      });
      const list = res.data?.data || [];
      const options = list.map((b) => ({
        value: b.id,
        label: b.name,
        name: b.name,
        id: b.id,
        bottlePerBox: b.bottlePerBox,
        boxWeight: b.boxWeight,
        variantCount: b.variantCount,
      }));
      options.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" })
      );
      setPlainBottleOptions(options);
    } catch (err) {
      console.error('Failed to load plain bottle options:', err);
      setPlainBottleOptions([]);
    } finally {
      setLoadingPlainBottles(false);
    }
  };

  // Fetch variants for plain bottle
  const fetchVariantsForBottle = async (pbId, cId) => {
    const comp = cId || companyId;
    if (!pbId || !comp) return [];
    const cacheKey = `${comp}_${pbId}`;
    if (variantsCache[cacheKey]) return variantsCache[cacheKey];

    try {
      setLoadingVariants((prev) => ({ ...prev, [pbId]: true }));
      const res = await API.get('/ready-to-dispatch/options/variants', {
        params: {
          companyId: comp,
          plainBottleId: pbId,
        },
      });
      const vars = res.data?.data || [];
      setVariantsCache((prev) => ({ ...prev, [cacheKey]: vars }));
      return vars;
    } catch (err) {
      console.error(`Failed to load variants for bottle ${pbId}:`, err);
      return [];
    } finally {
      setLoadingVariants((prev) => ({ ...prev, [pbId]: false }));
    }
  };

  // Handle Company Change (with confirm prompt)
  const handleCompanyChange = async (newCId) => {
    if (newCId === companyId) return;

    const hasContent = groups.some(
      (g) =>
        g.plainBottleId ||
        g.plainBottleName ||
        g.variantLines.some((l) => l.variantId || l.variantDescription || l.noOfBoxes)
    );

    if (hasContent) {
      const confirm = await Swal.fire({
        title: 'Change Company?',
        text: 'Changing company will clear the currently selected plain bottle and variant lines.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, change',
        cancelButtonText: 'Cancel',
      });
      if (!confirm.isConfirmed) return;
    }

    setCompanyId(newCId);
    const comp = companies.find((c) => c._id === newCId);
    if (comp) {
      setSheetTitle(`${comp.shortName || comp.name} - Ready to Dispatch Material`);
    }

    setGroups([
      {
        id: `grp_${Date.now()}`,
        plainBottleId: '',
        plainBottleName: '',
        unit: '',
        weight: '',
        variantLines: [
          {
            id: `line_${Date.now()}_1`,
            uniqueKey: '',
            variantId: '',
            bottleSpecId: '',
            brandId: '',
            brandName: '',
            variantName: '',
            coatingShade: '',
            textColor: '',
            specCode: '',
            specBottleName: '',
            variantDescription: '',
            noOfBoxes: '',
            producedQty: '',
            weight: '',
            totalWeight: '',
          },
        ],
      },
    ]);
    setVariantsCache({});

    if (newCId) {
      loadPlainBottles(newCId);
    } else {
      setPlainBottleOptions([]);
    }
  };

  // Handle Plain Bottle Selection on a Group
  const handleGroupBottleChange = async (grpIdx, selectedOption) => {
    const newGroups = [...groups];
    const grp = newGroups[grpIdx];

    if (!selectedOption) {
      grp.plainBottleId = '';
      grp.plainBottleName = '';
      grp.unit = '';
      grp.weight = '';
      grp.variantLines = grp.variantLines.map((vl) => ({
        ...vl,
        uniqueKey: '',
        variantId: '',
        bottleSpecId: '',
        brandId: '',
        brandName: '',
        variantName: '',
        coatingShade: '',
        textColor: '',
        specCode: '',
        specBottleName: '',
        variantDescription: '',
        producedQty: '',
        totalWeight: '',
        weight: '',
      }));
      setGroups(newGroups);
      return;
    }

    grp.plainBottleId = selectedOption.id;
    grp.plainBottleName = selectedOption.name;
    const unit =
      selectedOption.bottlePerBox !== null && selectedOption.bottlePerBox !== undefined
        ? String(selectedOption.bottlePerBox)
        : '';
    grp.unit = unit;

    const boxW =
      selectedOption.boxWeight !== null && selectedOption.boxWeight !== undefined
        ? String(selectedOption.boxWeight)
        : '';
    grp.weight = boxW;

    await fetchVariantsForBottle(selectedOption.id, companyId);

    grp.variantLines = grp.variantLines.map((vl) => {
      const boxes = Number(vl.noOfBoxes) || 0;
      const u = Number(unit) || 0;
      const w = boxW !== '' ? Number(boxW) : null;
      const calcQty = u > 0 && boxes > 0 ? String(boxes * u) : '';
      const totalW = boxes > 0 && w !== null && w > 0 ? String(parseFloat((boxes * w).toFixed(3))) : '';

      return {
        ...vl,
        uniqueKey: '',
        variantId: '',
        bottleSpecId: '',
        brandId: '',
        brandName: '',
        variantName: '',
        coatingShade: '',
        textColor: '',
        specCode: '',
        specBottleName: '',
        variantDescription: '',
        producedQty: calcQty,
        weight: boxW,
        totalWeight: totalW,
      };
    });

    setGroups(newGroups);
  };

  // Handle Variant Selection on a Line
  const handleVariantSelect = (grpIdx, lineIdx, selectedVariantOption) => {
    const newGroups = [...groups];
    const grp = newGroups[grpIdx];
    const line = grp.variantLines[lineIdx];

    if (!selectedVariantOption) {
      line.uniqueKey = '';
      line.variantId = '';
      line.bottleSpecId = '';
      line.brandId = '';
      line.brandName = '';
      line.variantName = '';
      line.coatingShade = '';
      line.textColor = '';
      line.specCode = '';
      line.specBottleName = '';
      line.variantDescription = '';
      setGroups(newGroups);
      return;
    }

    const v = selectedVariantOption.raw;
    line.uniqueKey = v.uniqueKey;
    line.variantId = v.variantId;
    line.bottleSpecId = v.bottleSpecId;
    line.brandId = v.brandId;
    line.brandName = v.brandName;
    line.variantName = v.variantName;
    line.coatingShade = v.coatingShade;
    line.textColor = v.textColor;
    line.specCode = v.specCode || '';
    line.specBottleName = v.specBottleName || '';

    const descParts = [v.coatingShade, v.variantName, v.textColor].map((s) => String(s || '').trim()).filter(Boolean);
    line.variantDescription = descParts.join(' - ') || v.variantName || 'Unnamed Variant';

    setGroups(newGroups);
  };

  // Handle Variant Description Change
  const handleVariantDescriptionChange = (grpIdx, lineIdx, value) => {
    const newGroups = [...groups];
    const grp = newGroups[grpIdx];
    const line = grp.variantLines[lineIdx];
    line.variantDescription = value;
    setGroups(newGroups);
  };

  // Handle Line input changes
  const handleLineChange = (grpIdx, lineIdx, field, value) => {
    const newGroups = [...groups];
    const grp = newGroups[grpIdx];
    const line = grp.variantLines[lineIdx];

    line[field] = value;

    const boxes = Number(line.noOfBoxes) || 0;
    const unit = Number(grp.unit) || 0;
    const weightVal = line.weight !== '' && line.weight !== undefined && line.weight !== null ? Number(line.weight) : null;

    if (field === 'noOfBoxes') {
      if (unit > 0) {
        line.producedQty = boxes > 0 ? String(boxes * unit) : '';
      }
      if (weightVal !== null && weightVal > 0) {
        line.totalWeight = boxes > 0 ? String(parseFloat((boxes * weightVal).toFixed(3))) : '';
      } else {
        line.totalWeight = '';
      }
    } else if (field === 'weight') {
      if (weightVal !== null && weightVal > 0) {
        line.totalWeight = boxes > 0 ? String(parseFloat((boxes * weightVal).toFixed(3))) : '';
      } else {
        line.totalWeight = '';
      }
    }

    setGroups(newGroups);
  };

  // Add Variant Line
  const addVariantLine = (grpIdx) => {
    const newGroups = [...groups];
    const grp = newGroups[grpIdx];
    newGroups[grpIdx].variantLines.push({
      id: `line_${Date.now()}_${Math.random()}`,
      uniqueKey: '',
      variantId: '',
      bottleSpecId: '',
      brandId: '',
      brandName: '',
      variantName: '',
      coatingShade: '',
      textColor: '',
      specCode: '',
      specBottleName: '',
      variantDescription: '',
      noOfBoxes: '',
      producedQty: '',
      weight: grp.weight || '',
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
        plainBottleId: '',
        plainBottleName: '',
        unit: '',
        weight: '',
        variantLines: [
          {
            id: `line_${Date.now()}_1`,
            uniqueKey: '',
            variantId: '',
            bottleSpecId: '',
            brandId: '',
            brandName: '',
            variantName: '',
            coatingShade: '',
            textColor: '',
            specCode: '',
            specBottleName: '',
            variantDescription: '',
            noOfBoxes: '',
            producedQty: '',
            weight: '',
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
    let hasWeight = false;

    groups.forEach((grp) => {
      grp.variantLines.forEach((vl) => {
        const b = Number(vl.noOfBoxes) || 0;
        const q = Number(vl.producedQty) || 0;
        const wVal =
          vl.totalWeight !== '' && vl.totalWeight !== null && vl.totalWeight !== undefined
            ? Number(vl.totalWeight)
            : (vl.weight !== '' && vl.weight !== null && vl.weight !== undefined ? b * Number(vl.weight) : null);

        totalBoxes += b;
        totalProducedQty += q;
        if (wVal !== null && !isNaN(wVal)) {
          totalWeight += wVal;
          hasWeight = true;
        }
      });
    });

    return {
      totalBoxes,
      totalProducedQty,
      totalWeight: hasWeight ? parseFloat(totalWeight.toFixed(3)) : null,
    };
  }, [groups]);

  // Handle Form Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!companyId) {
      return Swal.fire('Warning', 'Please select a Company', 'warning');
    }

    if (!dispatchDate) {
      return Swal.fire('Warning', 'Please select a Dispatch Date', 'warning');
    }

    const emptyBottle = groups.find((g) => !g.plainBottleName || !g.plainBottleName.trim());
    if (emptyBottle) {
      return Swal.fire('Warning', 'Please select a Plain Bottle for all groups', 'warning');
    }

    const payloadGroups = groups
      .map((g) => ({
        _id: g._id || undefined,
        plainBottleName: g.plainBottleName.trim(),
        plainBottleId: g.plainBottleId || null,
        unit: Number(g.unit) || 0,
        variantLines: g.variantLines
          .filter(
            (vl) =>
              (vl.variantDescription && vl.variantDescription.trim()) ||
              Number(vl.noOfBoxes) > 0 ||
              vl.variantId ||
              vl.uniqueKey
          )
          .map((vl) => ({
            _id: vl._id || undefined,
            sourcePlanType: vl.sourcePlanType || null,
            sourcePlanId: vl.sourcePlanId || null,
            variantId: vl.variantId || null,
            bottleSpecId: vl.bottleSpecId || null,
            uniqueKey: vl.uniqueKey || null,
            description: vl.variantDescription || '',
            brandId: vl.brandId || null,
            brandName: vl.brandName || null,
            noOfBoxes: Number(vl.noOfBoxes) || 0,
            producedQty: Number(vl.producedQty) || 0,
            weight: vl.weight !== '' && vl.weight !== null && vl.weight !== undefined ? Number(vl.weight) : null,
            totalWeight:
              vl.totalWeight !== '' && vl.totalWeight !== null && vl.totalWeight !== undefined
                ? Number(vl.totalWeight)
                : null,
          })),
      }))
      .filter((g) => g.variantLines.length > 0 && g.plainBottleName);

    if (payloadGroups.length === 0) {
      return Swal.fire('Warning', 'Please enter at least one valid variant line', 'warning');
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
        navigate(companyId ? `/ready-to-dispatch/company/${companyId}` : '/ready-to-dispatch');
      }
    } catch (err) {
      console.error('Submit error:', err);
      Swal.fire('Error', err.response?.data?.message || 'Failed to update record', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (companyId) {
      navigate(`/ready-to-dispatch/company/${companyId}`);
    } else {
      navigate('/ready-to-dispatch');
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
    <div className="page-content ready-to-dispatch-page ready-to-dispatch-form-page">
      {/* Header */}
      <div className="page-header user-form-page-header d-flex align-items-center gap-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="btn-ghost"
            style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
          </button>
          <div>
            <h1 className="page-title mb-0">Edit Ready to Dispatch Material</h1>
            <p className="page-subtitle mb-0">Selection order: Company &rarr; Plain Bottle &rarr; Variant</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="ready-to-dispatch-form">
        {/* Section 1: Sheet & Party Details */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom">
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-file-text-fill text-primary" />
              1. Sheet &amp; Party Details
            </h6>
          </div>
          <div className="card-body p-4">
            <div className="row g-4">
              <div className="col-md-4">
                <label className="form-label small fw-bold text-muted">
                  Company / Party <span className="text-danger">*</span>
                </label>
                <select
                  id="rtd-edit-company-select"
                  className="form-select shadow-none bg-white border-light-subtle rounded-3"
                  value={companyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
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
                  className="form-control shadow-none bg-white border-light-subtle rounded-3"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-5">
                <label className="form-label small fw-bold text-muted">Sheet Title / Heading</label>
                <input
                  type="text"
                  className="form-control shadow-none bg-white border-light-subtle rounded-3"
                  value={sheetTitle}
                  onChange={(e) => setSheetTitle(e.target.value)}
                  placeholder="e.g. TPP - Ready to Dispatch Material"
                />
              </div>

              <div className="col-12">
                <label className="form-label small fw-bold text-muted">Remarks / Notes</label>
                <input
                  type="text"
                  className="form-control shadow-none bg-white border-light-subtle rounded-3"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional notes or vehicle / batch reference"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Plain Bottles & Variant Lines */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-boxes text-primary" />
              2. Plain Bottles &amp; Variant Quantities
            </h6>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={addPlainBottleGroup}
              disabled={!companyId}
              id="add-plain-bottle-btn"
            >
              <i className="bi bi-plus-lg me-1" /> Add Plain Bottle
            </button>
          </div>

          <div className="card-body p-4">
            {!companyId && (
              <div className="alert alert-secondary text-center py-4 rounded-3 border-dashed mb-0">
                <i className="bi bi-building fs-3 text-secondary d-block mb-2" />
                <h6 className="fw-bold text-dark mb-1">Please select a Company</h6>
              </div>
            )}

            {companyId && !loadingPlainBottles && plainBottleOptions.length === 0 && (
              <div className="alert alert-info text-center py-4 rounded-3 mb-3">
                <i className="bi bi-info-circle fs-3 text-info d-block mb-2" />
                <h6 className="fw-bold text-dark mb-1">No Plain Bottles Found</h6>
                <p className="text-muted small mb-0">
                  This company has no bottle specs or coating specs mapped to plain bottles.
                </p>
              </div>
            )}

            {companyId && groups.map((grp, grpIdx) => {
              const cacheKey = `${companyId}_${grp.plainBottleId}`;
              const availableVariants = variantsCache[cacheKey] || [];
              const isLoadingVars = loadingVariants[grp.plainBottleId] || false;

              // Format variant options: coating shade -> variant -> text color
              const variantSelectOptions = availableVariants.map((v) => {
                const parts = [v.coatingShade, v.variantName, v.textColor].map((s) => String(s || '').trim()).filter(Boolean);
                return {
                  value: v.uniqueKey,
                  label: parts.join(' · ') || v.variantName || 'Unnamed Variant',
                  raw: v,
                };
              });

              const selectedPlainBottleOpt =
                plainBottleOptions.find((opt) => opt.value === grp.plainBottleId) ||
                plainBottleOptions.find((opt) => (opt.name || '').trim().toLowerCase() === (grp.plainBottleName || '').trim().toLowerCase()) ||
                (grp.plainBottleName ? { value: grp.plainBottleId || grp.plainBottleName, label: grp.plainBottleName } : null);

              return (
                <div key={grp.id} className="border border-light-subtle rounded-3 mb-4 bg-white p-4 shadow-sm">
                  {/* Group Header: Plain Bottle Selection */}
                  <div className="row g-2 align-items-center mb-3 pb-3 border-bottom bg-white p-2 rounded-2 border border-light-subtle">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-primary mb-1">
                        Plain Bottle <span className="text-danger">*</span>
                        {loadingPlainBottles && <span className="ms-2 spinner-border spinner-border-sm text-primary" />}
                      </label>
                      <Select
                        id={`edit-plain-bottle-select-${grpIdx}`}
                        options={plainBottleOptions}
                        value={selectedPlainBottleOpt}
                        onChange={(selected) => handleGroupBottleChange(grpIdx, selected)}
                        placeholder={
                          !companyId
                            ? 'Select company first...'
                            : loadingPlainBottles
                            ? 'Loading plain bottles...'
                            : plainBottleOptions.length === 0
                            ? 'No plain bottles for this company'
                            : 'Select Plain Bottle...'
                        }
                        isDisabled={!companyId || loadingPlainBottles || plainBottleOptions.length === 0}
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                      />
                    </div>

                    <div className="col-md-3">
                      <label className="form-label small fw-bold text-muted mb-1">BottlePerBox</label>
                      <input
                        type="number"
                        id={`edit-bpb-unit-${grpIdx}`}
                        className="form-control shadow-none bg-light border-light-subtle rounded-3"
                        value={grp.unit}
                        placeholder="Master count"
                        onChange={(e) => {
                          const newGroups = [...groups];
                          newGroups[grpIdx].unit = e.target.value;
                          setGroups(newGroups);
                        }}
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
                  <div className="table-responsive ready-to-dispatch-lines-responsive">
                    <table className="table table-bordered table-sm align-middle mb-2 bg-white ready-to-dispatch-lines-table">
                      <thead className="table-light small text-uppercase text-secondary">
                        <tr>
                          <th style={{ width: 40 }} className="text-center">#</th>
                          <th style={{ minWidth: 320 }}>Variant / Shade Description</th>
                          <th style={{ width: 110 }} className="text-center">No. of Boxes</th>
                          <th style={{ width: 120 }} className="text-center">Produced Qty</th>
                          <th style={{ width: 110 }} className="text-center">Weight / Box (kg)</th>
                          <th style={{ width: 120 }} className="text-end">Total Weight (kg)</th>
                          <th style={{ width: 45 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {grp.variantLines.map((vl, lineIdx) => {
                          // Match option by uniqueKey, or by variantId + brandId, or fallback
                          let currentSelectedOpt =
                            (vl.uniqueKey && variantSelectOptions.find((opt) => opt.value === vl.uniqueKey)) ||
                            (vl.variantId && vl.brandId && variantSelectOptions.find(
                              (opt) => opt.raw?.variantId === vl.variantId && opt.raw?.brandId === vl.brandId
                            )) ||
                            (vl.variantId && variantSelectOptions.find((opt) => opt.raw?.variantId === vl.variantId));

                          // If not found in current options but has saved description, create fallback option so saved data is never lost
                          if (!currentSelectedOpt && (vl.variantDescription || vl.variantName)) {
                            const desc = vl.variantDescription || vl.variantName;
                            currentSelectedOpt = {
                              value: vl.uniqueKey || vl.variantId || `custom_${lineIdx}`,
                              label: desc,
                              raw: {
                                uniqueKey: vl.uniqueKey || vl.variantId || `custom_${lineIdx}`,
                                variantId: vl.variantId || '',
                                bottleSpecId: vl.bottleSpecId || '',
                                brandId: vl.brandId || '',
                                brandName: vl.brandName || '',
                                variantName: vl.variantName || desc,
                                coatingShade: vl.coatingShade || '',
                                textColor: vl.textColor || '',
                              },
                            };
                          }

                          const optionsWithCurrent =
                            currentSelectedOpt && !variantSelectOptions.some((opt) => opt.value === currentSelectedOpt.value)
                              ? [currentSelectedOpt, ...variantSelectOptions]
                              : variantSelectOptions;

                          return (
                            <tr key={vl.id}>
                              <td className="text-center small text-muted">{lineIdx + 1}</td>

                              {/* Variant Picker column */}
                              <td>
                                {!vl.variantId ? (
                                  <Select
                                    id={`edit-variant-picker-${grpIdx}-${lineIdx}`}
                                    options={optionsWithCurrent}
                                    value={currentSelectedOpt}
                                    onChange={(opt) => handleVariantSelect(grpIdx, lineIdx, opt)}
                                    placeholder={
                                      !grp.plainBottleId && !grp.plainBottleName
                                        ? 'Select plain bottle first...'
                                        : isLoadingVars
                                        ? 'Loading variants...'
                                        : optionsWithCurrent.length === 0
                                        ? 'No variants found'
                                        : 'Search & select variant...'
                                    }
                                    isClearable
                                    isDisabled={!grp.plainBottleId && !grp.plainBottleName}
                                    menuPortalTarget={document.body}
                                    styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                                  />
                                ) : (
                                  <div className="d-flex align-items-center gap-2">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm shadow-none bg-white border-light-subtle rounded-2"
                                      value={vl.variantDescription}
                                      onChange={(e) => handleVariantDescriptionChange(grpIdx, lineIdx, e.target.value)}
                                      title="Edit the variant description text"
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary border-0 rounded-2"
                                      onClick={() => handleVariantSelect(grpIdx, lineIdx, null)}
                                      title="Clear variant selection"
                                    >
                                      <i className="bi bi-x fs-6" />
                                    </button>
                                  </div>
                                )}
                                {(vl.bottleSpecId || vl.coatingShade || vl.textColor) && vl.variantId && (
                                  <div className="d-flex align-items-center gap-2 mt-1 small text-muted">
                                    {vl.specCode && <span className="badge bg-light text-dark border">Spec: {vl.specCode}</span>}
                                    {vl.coatingShade && <span>Shade: <strong>{vl.coatingShade}</strong></span>}
                                    {vl.textColor && <span>Text: <strong>{vl.textColor}</strong></span>}
                                  </div>
                                )}
                              </td>

                              {/* No of Boxes */}
                              <td>
                                <input
                                  type="number"
                                  id={`edit-boxes-input-${grpIdx}-${lineIdx}`}
                                  className="form-control shadow-none bg-white border-light-subtle rounded-3 text-center fw-bold"
                                  placeholder="0"
                                  min="0"
                                  value={vl.noOfBoxes}
                                  onChange={(e) =>
                                    handleLineChange(grpIdx, lineIdx, 'noOfBoxes', e.target.value)
                                  }
                                  required
                                />
                              </td>

                              {/* Produced Qty */}
                              <td>
                                <input
                                  type="number"
                                  id={`edit-produced-qty-${grpIdx}-${lineIdx}`}
                                  className="form-control shadow-none bg-white border-light-subtle rounded-3 text-center text-primary fw-bold"
                                  placeholder="0"
                                  min="0"
                                  value={vl.producedQty}
                                  onChange={(e) =>
                                    handleLineChange(grpIdx, lineIdx, 'producedQty', e.target.value)
                                  }
                                />
                              </td>

                              {/* Weight / Box */}
                              <td>
                                <input
                                  type="number"
                                  step="0.001"
                                  id={`edit-weight-box-${grpIdx}-${lineIdx}`}
                                  className="form-control shadow-none bg-white border-light-subtle rounded-3 text-center"
                                  placeholder="-"
                                  value={vl.weight}
                                  onChange={(e) =>
                                    handleLineChange(grpIdx, lineIdx, 'weight', e.target.value)
                                  }
                                />
                              </td>

                              {/* Total Weight */}
                              <td>
                                <input
                                  type="text"
                                  id={`edit-total-weight-${grpIdx}-${lineIdx}`}
                                  className="form-control shadow-none bg-light border-light-subtle rounded-3 text-end fw-bold"
                                  value={
                                    vl.totalWeight !== '' && vl.totalWeight !== null && vl.totalWeight !== undefined
                                      ? vl.totalWeight
                                      : '-'
                                  }
                                  readOnly
                                  placeholder="-"
                                />
                              </td>

                              {/* Action */}
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                                  onClick={() => removeVariantLine(grpIdx, lineIdx)}
                                  title="Remove Line"
                                >
                                  <i className="bi bi-trash fs-6" />
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
                      id={`edit-add-variant-line-btn-${grpIdx}`}
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => addVariantLine(grpIdx)}
                      disabled={!grp.plainBottleId && !grp.plainBottleName}
                    >
                      <i className="bi bi-plus-lg me-1" /> Add Variant Line
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Summary Totals */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom">
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-calculator-fill text-primary" />
              3. Summary Totals
            </h6>
          </div>
          <div className="card-body p-4">
            <div className="row g-3 text-center">
              <div className="col-md-4">
                <div className="p-3 bg-light rounded-3 border border-light-subtle">
                  <div className="text-muted small text-uppercase fw-semibold mb-1">Total Boxes</div>
                  <div className="fs-4 fw-bold text-dark" id="edit-summary-total-boxes">{totals.totalBoxes}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 bg-light rounded-3 border border-light-subtle">
                  <div className="text-muted small text-uppercase fw-semibold mb-1">Total Produced Qty</div>
                  <div className="fs-4 fw-bold text-primary" id="edit-summary-total-qty">{totals.totalProducedQty.toLocaleString()}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 bg-light rounded-3 border border-light-subtle">
                  <div className="text-muted small text-uppercase fw-semibold mb-1">Total Weight (kg)</div>
                  <div className="fs-4 fw-bold text-dark" id="edit-summary-total-weight">
                    {totals.totalWeight !== null ? totals.totalWeight.toFixed(3) : '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4 mb-5">
          <button
            type="submit"
            id="edit-submit-rtd-btn"
            className="btn-accent px-5 py-3 flex-grow-1"
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" />
                Updating...
              </>
            ) : (
              <>
                <i className="bi bi-check-lg me-1" /> Update Ready to Dispatch
              </>
            )}
          </button>
          <button
            type="button"
            className="btn-ghost px-5 py-3 text-center"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
