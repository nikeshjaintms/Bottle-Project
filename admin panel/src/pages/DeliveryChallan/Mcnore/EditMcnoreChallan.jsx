import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDeliveryChallanById,
  updateDeliveryChallan,
} from '../../../redux/slices/deliveryChallanSlice';
import { fetchCompanies } from '../../../redux/slices/companySlice';
import API from '../../../services/api';
import Swal from 'sweetalert2';
import ChallanProductSelector from '../ChallanProductSelector';

async function submitChallanWithMaterialCodeConfirmation({ payload, submit, onReject }) {
  let response = await submit(payload);

  while (response.error && response.payload?.code === 'VARIANT_MATERIAL_CODE_CONFLICT') {
    const { conflict } = response.payload;
    const confirmation = await Swal.fire({
      icon: 'warning',
      title: `Variant ${conflict.variantName} already has Material Code ${conflict.oldMaterialCode}. Update it to ${conflict.newMaterialCode}?`,
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'No',
    });

    if (!confirmation.isConfirmed) {
      onReject(conflict);
      return null;
    }

    const item = payload.items[conflict.itemIndex];
    if (!item) return response;
    item.confirmVariantCodeUpdate = true;
    response = await submit(payload);
  }

  if (!response.error) ChallanProductSelector.clearOptionCache();
  return response;
}

export default function EditMcnoreChallan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { companies = [] } = useSelector((state) => state.companies);
  const { currentChallan, loading } = useSelector((state) => state.deliveryChallans);

  // Mode: 'without_po' or 'with_po'
  const [poMode, setPoMode] = useState('with_po');

  // Form states
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState('');
  const [challanTime, setChallanTime] = useState('');
  const [taxInvoiceNo, setTaxInvoiceNo] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState('');
  const [poNo, setPoNo] = useState('');
  const [poDate, setPoDate] = useState('');
  const [dispatchThrough, setDispatchThrough] = useState('SHREE SANGAM ROADLINES');
  const [transporter, setTransporter] = useState('SHREE SANGAM ROADLINES');
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');

  // Company and Addresses
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('MCNORE');
  const [companyAddresses, setCompanyAddresses] = useState([]);

  // Billed To Address
  const [billedToAddressId, setBilledToAddressId] = useState('');
  const [billedTo, setBilledTo] = useState({
    name: 'MCNROE CONSUMER PRODUCT PVT.LTD',
    addressTitle: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: 'GUJARAT',
    stateCode: '24',
    pincode: '',
    gstNo: '',
  });

  // Shipped To Address
  const [sameAsBilledTo, setSameAsBilledTo] = useState(false);
  const [shippedToAddressId, setShippedToAddressId] = useState('');
  const [shippedTo, setShippedTo] = useState({
    name: 'MCNROE CONSUMER PRODUCT PVT.LTD',
    addressTitle: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: 'GUJARAT',
    stateCode: '24',
    pincode: '',
    gstNo: '',
  });

  // Bottle Specs for Mcnore
  const [companyBottleSpecs, setCompanyBottleSpecs] = useState([]);
  const [loadingSpecs, setLoadingSpecs] = useState(false);

  // Bottle Per Box master
  const [bottlePerBoxes, setBottlePerBoxes] = useState([]);


  // Items grouped by Bottle Specification
  const [specGroups, setSpecGroups] = useState([]);

  // Checked and remarks
  const [checkedBy, setCheckedBy] = useState('');
  const [checkedDate, setCheckedDate] = useState('');
  const [checkedTime, setCheckedTime] = useState('');
  const [remarks, setRemarks] = useState('');

  // Initial load
  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    if (id) {
      dispatch(fetchDeliveryChallanById(id));
    }

    API.get('/bottle-per-box', { params: { pagination: 'false' } })
      .then((res) => {
        if (res.data?.data) {
          setBottlePerBoxes(res.data.data);
        }
      })
      .catch((err) => console.error('Failed to load BottlePerBox master:', err));
  }, [dispatch, id]);

  // Populate data when currentChallan loads
  useEffect(() => {
    if (currentChallan && currentChallan._id === id) {
      const c = currentChallan;
      setPoMode(c.poMode || (c.poNo || (c.items && c.items.some((it) => !!it.materialCode)) ? 'with_po' : 'with_po'));
      setChallanNo(c.challanNo || '');
      setChallanDate(c.challanDate ? c.challanDate.split('T')[0] : '');
      setChallanTime(c.challanTime || '');
      setTaxInvoiceNo(c.taxInvoiceNo || '');
      setTaxInvoiceDate(c.taxInvoiceDate ? c.taxInvoiceDate.split('T')[0] : '');
      setPoNo(c.poNo || '');
      setPoDate(c.poDate ? c.poDate.split('T')[0] : '');
      setDispatchThrough(c.dispatchThrough || 'SHREE SANGAM ROADLINES');
      setTransporter(c.transporter || c.dispatchThrough || 'SHREE SANGAM ROADLINES');
      setVehicleNo(c.vehicleNo || '');
      setLrNo(c.lrNo || '');

      const cId = c.companyId?._id || c.companyId || '';
      setCompanyId(cId);
      setCompanyName(c.companyName || 'MCNORE');

      if (c.billedTo) setBilledTo({ ...c.billedTo });
      if (c.shippedTo) setShippedTo({ ...c.shippedTo });
      setBilledToAddressId(c.billedToAddressId || '');
      setShippedToAddressId(c.shippedToAddressId || '');

      setCheckedBy(c.checkedBy || '');
      setCheckedDate(c.checkedDate || '');
      setCheckedTime(c.checkedTime || '');
      setRemarks(c.remarks || '');

      // Load company addresses & specs and reconstruct specGroups
      const initData = async () => {
        let specs = [];
        if (cId) {
          try {
            const resAddr = await API.get('/company-address', {
              params: { companyId: cId, pagination: 'false' },
            });
            setCompanyAddresses(resAddr.data?.data || []);
          } catch (err) {
            console.error('Failed to load company addresses:', err);
          }

          try {
            setLoadingSpecs(true);
            const resSpecs = await API.get('/bottle-spec', {
              params: { companyId: cId, pagination: 'false' },
            });
            specs = resSpecs.data?.data || [];
            setCompanyBottleSpecs(specs);
          } catch (err) {
            console.error('Failed to load bottle specs:', err);
          } finally {
            setLoadingSpecs(false);
          }
        }

        // Reconstruct specGroups from items
        if (c.items && c.items.length > 0) {
          const groups = [];
          let currGrp = null;
          for (const it of c.items) {
            const title = (it.title || 'General').trim();
            if (!currGrp || currGrp.title !== title) {
              const matchedSpec = specs.find(
                (s) =>
                  (s.bottleName && s.bottleName.trim().toLowerCase() === title.toLowerCase()) ||
                  (s.code && s.code.trim().toLowerCase() === title.toLowerCase()) ||
                  (s.bottleName && title.toLowerCase().includes(s.bottleName.trim().toLowerCase()))
              );

              const specId = matchedSpec ? String(matchedSpec._id) : '';

              currGrp = {
                id: `grp_${Date.now()}_${Math.random()}`,
                plainBottle: title,
                plainBottleId: it.plainBottleId?._id || it.plainBottleId || '',
                bottleSpecId: specId,
                title: title,
                hsn: it.hsn || '70109000',
                variantLines: [],
              };
              groups.push(currGrp);

            }

            // Parse box expression if possible
            let fullBox = '';
            let looseBox = '1';
            let looseQty = '';
            const match = String(it.box || '').match(/^(\d+)\s*\+\s*\((\d+)\s*\*\s*(\d+)\)$/);
            if (match) {
              fullBox = match[1];
              looseBox = match[2];
              looseQty = match[3];
            } else {
              fullBox = String(it.box || '');
            }

            currGrp.variantLines.push({
              id: `line_${Date.now()}_${Math.random()}`,
              variantId: it.variantId?._id || it.variantId || '',
              materialCode: it.materialCode || '',
              materialCodeDirty: false,
              description: it.description || '',
              boxFormatType: match ? 'loose' : 'single',
              fullBox,
              looseBox,
              looseQty,
              box: it.box || '',
              boxCount: it.boxCount || 0,
              unit: it.unit || 1,
              total: it.total || 0,
              rate: it.rate || '',
              taxableValue: it.taxableValue || '',
              jobWorkRate: it.jobWorkRate || '',
              jobWorkTaxableValue: it.jobWorkTaxableValue || '',
            });
          }

          setSpecGroups(groups);
        }
      };

      initData();
    }
  }, [currentChallan, id]);

  const loadCompanyDependencies = async (cId) => {
    try {
      const resAddr = await API.get('/company-address', {
        params: { companyId: cId, pagination: 'false' },
      });
      setCompanyAddresses(resAddr.data?.data || []);
    } catch (err) {
      console.error(err);
    }

    try {
      setLoadingSpecs(true);
      const resSpecs = await API.get('/bottle-spec', {
        params: { companyId: cId, pagination: 'false' },
      });
      const specs = resSpecs.data?.data || [];
      setCompanyBottleSpecs(specs);
      return specs;
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoadingSpecs(false);
    }
  };

  const lookupUnitForBottle = (specName) => {
    if (!specName || !bottlePerBoxes.length) return '';
    const cleanSpec = String(specName).trim().toLowerCase().replace(/\s+/g, ' ');

    // 1. Exact match on plainBottleName or bottleName
    const exact = bottlePerBoxes.find((b) => {
      const p = (b.plainBottleName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const n = (b.bottleName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return p === cleanSpec || n === cleanSpec;
    });
    if (exact && exact.bottlePerBox) return String(exact.bottlePerBox);

    // 2. In alias array
    const inArray = bottlePerBoxes.find((b) => {
      if (Array.isArray(b.bottleNames)) {
        return b.bottleNames.some(
          (alias) => alias.trim().toLowerCase().replace(/\s+/g, ' ') === cleanSpec
        );
      }
      return false;
    });
    if (inArray && inArray.bottlePerBox) return String(inArray.bottlePerBox);

    // 3. Partial
    const partial = bottlePerBoxes.find((b) => {
      const p = (b.plainBottleName || b.bottleName || '').trim().toLowerCase();
      return p && (cleanSpec.includes(p) || p.includes(cleanSpec));
    });
    return partial?.bottlePerBox ? String(partial.bottlePerBox) : '';
  };

  const handleGroupBottleChange = (grpIdx, selectedBottle) => {
    const newGroups = [...specGroups];
    const grp = newGroups[grpIdx];
    const cleanName = selectedBottle?.name || '';

    grp.plainBottle = cleanName;
    grp.plainBottleId = selectedBottle?.id || selectedBottle?.value || '';
    grp.title = cleanName;

    const foundSpec = companyBottleSpecs.find(
      (s) => (s.bottleName || s.name || '').trim().toLowerCase() === cleanName.toLowerCase()
    );
    grp.bottleSpecId = foundSpec ? foundSpec._id : '';

    const suggestedUnit = lookupUnitForBottle(cleanName);
    // Apply unit to variant lines if empty
    grp.variantLines = grp.variantLines.map((vl) => {
      const updatedUnit = vl.unit || suggestedUnit;
      const rec = recalculateLineTotals(
        vl.boxFormatType,
        vl.fullBox,
        vl.looseBox,
        vl.looseQty,
        updatedUnit,
        vl.box,
        vl.rate,
        vl.jobWorkRate
      );
      return {
        ...vl,
        variantId: '',
        materialCode: '',
        materialCodeDirty: true,
        description: '',
        unit: updatedUnit,
        ...rec,
      };
    });

    setSpecGroups(newGroups);
  };

  const recalculateLineTotals = (
    boxFormatType,
    fullBox,
    looseBox,
    looseQty,
    unit,
    customBox,
    rate,
    jobWorkRate
  ) => {
    const u = Number(unit) || 0;
    const r = Number(rate) || 0;
    const jwR = Number(jobWorkRate) || 0;
    let computedBoxStr = '';
    let numericBoxes = 0;
    let computedTotal = 0;

    if (boxFormatType === 'loose') {
      const fBox = Number(fullBox) || 0;
      const lBox = Number(looseBox) || 0;
      const lQty = Number(looseQty) || 0;

      numericBoxes = fBox + lBox;
      computedTotal = fBox * u + lQty;

      if (fBox > 0 && lQty > 0) {
        computedBoxStr = `${fBox}+(${lBox}*${lQty})`;
      } else if (fBox > 0) {
        computedBoxStr = String(fBox);
      } else if (lQty > 0) {
        computedBoxStr = `(${lBox}*${lQty})`;
      }
    } else {
      const fBox = Number(fullBox) || 0;
      numericBoxes = fBox;
      computedTotal = fBox * u;
      computedBoxStr = fullBox ? String(fullBox) : customBox || '';
    }

    const taxableValue = r > 0 && computedTotal > 0 ? parseFloat((computedTotal * r).toFixed(2)) : 0;
    const jobWorkTaxableValue = jwR > 0 && computedTotal > 0 ? parseFloat((computedTotal * jwR).toFixed(2)) : 0;

    return {
      box: computedBoxStr,
      boxCount: numericBoxes,
      total: computedTotal > 0 ? computedTotal : '',
      taxableValue: taxableValue > 0 ? taxableValue : '',
      jobWorkTaxableValue: jobWorkTaxableValue > 0 ? jobWorkTaxableValue : '',
    };
  };

  const handleVariantLineChange = (grpIdx, lineIdx, field, value, selectedVariant) => {
    const newGroups = [...specGroups];
    const line = newGroups[grpIdx].variantLines[lineIdx];
    line[field] = value;

    if (field === 'variantId' && selectedVariant !== undefined) {
      line.variantId = selectedVariant?.variantId || '';
      line.description = selectedVariant?.name || '';
      line.materialCode = selectedVariant?.materialCode || '';
      line.materialCodeDirty = true;
    } else if (field === 'materialCode') {
      line.materialCodeDirty = true;
    }

    if (
      ['boxFormatType', 'fullBox', 'looseBox', 'looseQty', 'unit', 'box', 'rate', 'jobWorkRate'].includes(
        field
      )
    ) {
      const rec = recalculateLineTotals(
        line.boxFormatType,
        line.fullBox,
        line.looseBox,
        line.looseQty,
        line.unit,
        line.box,
        line.rate,
        line.jobWorkRate
      );
      Object.assign(line, rec);
    }

    setSpecGroups(newGroups);
  };

  const addSpecGroup = () => {
    setSpecGroups([
      ...specGroups,
      {
        id: `grp_${Date.now()}`,
        plainBottle: '',
        bottleSpecId: '',
        title: '',
        hsn: '70109000',
        variantLines: [
          {
            id: `line_${Date.now()}`,
            variantId: '',
            materialCode: '',
            description: '',
            boxFormatType: 'loose',
            fullBox: '',
            looseBox: '1',
            looseQty: '',
            box: '',
            boxCount: 0,
            unit: '',
            total: '',
            rate: '',
            taxableValue: '',
            jobWorkRate: '',
            jobWorkTaxableValue: '',
          },
        ],
      },
    ]);
  };

  const removeSpecGroup = (grpIdx) => {
    if (specGroups.length <= 1) {
      return Swal.fire('Info', 'At least one Plain Bottle group is required.', 'info');
    }
    setSpecGroups(specGroups.filter((_, idx) => idx !== grpIdx));
  };

  const addVariantLine = (grpIdx) => {
    const newGroups = [...specGroups];
    const grp = newGroups[grpIdx];
    const suggestedUnit = lookupUnitForBottle(grp.title);
    grp.variantLines.push({
      id: `line_${Date.now()}`,
      variantId: '',
      materialCode: '',
      description: '',
      boxFormatType: 'loose',
      fullBox: '',
      looseBox: '1',
      looseQty: '',
      box: '',
      boxCount: 0,
      unit: suggestedUnit,
      total: '',
      rate: '',
      taxableValue: '',
      jobWorkRate: '',
      jobWorkTaxableValue: '',
    });
    setSpecGroups(newGroups);
  };

  const removeVariantLine = (grpIdx, lineIdx) => {
    const newGroups = [...specGroups];
    if (newGroups[grpIdx].variantLines.length <= 1) {
      return Swal.fire('Info', 'A group must have at least one variant line.', 'info');
    }
    newGroups[grpIdx].variantLines = newGroups[grpIdx].variantLines.filter((_, idx) => idx !== lineIdx);
    setSpecGroups(newGroups);
  };

  const { totalBoxes, totalQuantity, glassBottleValue, jobWorkChargesValue, sgst, cgst, igst, grandTotal } =
    useMemo(() => {
      let bCount = 0;
      let qCount = 0;
      let gbVal = 0;
      let jwVal = 0;

      specGroups.forEach((g) => {
        g.variantLines.forEach((vl) => {
          bCount += Number(vl.boxCount) || 0;
          qCount += Number(vl.total) || 0;
          gbVal += Number(vl.taxableValue) || 0;
          jwVal += Number(vl.jobWorkTaxableValue) || 0;
        });
      });

      const isUttarakhand = billedTo.stateCode === '05' || (billedTo.gstNo && billedTo.gstNo.startsWith('05'));
      let sgstVal = 0;
      let cgstVal = 0;
      let igstVal = 0;
      let gTotal = 0;

      if (poMode === 'without_po') {
        if (jwVal > 0) {
          sgstVal = parseFloat((jwVal * 0.09).toFixed(2));
          cgstVal = parseFloat((jwVal * 0.09).toFixed(2));
        }
        gTotal = parseFloat((gbVal + jwVal + sgstVal + cgstVal).toFixed(2));
      } else {
        const taxable = gbVal + jwVal;
        if (taxable > 0) {
          if (isUttarakhand) {
            igstVal = parseFloat((taxable * 0.18).toFixed(2));
          } else {
            sgstVal = parseFloat((taxable * 0.09).toFixed(2));
            cgstVal = parseFloat((taxable * 0.09).toFixed(2));
          }
        }
        gTotal = parseFloat((taxable + igstVal + sgstVal + cgstVal).toFixed(2));
      }

      return {
        totalBoxes: bCount,
        totalQuantity: qCount,
        glassBottleValue: gbVal,
        jobWorkChargesValue: jwVal,
        sgst: sgstVal,
        cgst: cgstVal,
        igst: igstVal,
        grandTotal: gTotal,
      };
    }, [specGroups, poMode, billedTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!challanNo || !challanNo.trim()) {
      return Swal.fire('Error', 'Please enter a valid DC Number', 'warning');
    }

    if (poMode === 'with_po' && (!poNo || !poNo.trim())) {
      return Swal.fire('Error', 'PO Number is required in "With PO" mode', 'warning');
    }

    const payloadItems = [];
    const lineRefs = [];
    specGroups.forEach((g) => {
      g.variantLines.forEach((vl) => {
        if (vl.description && vl.description.trim()) {
          lineRefs.push({ groupIndex: specGroups.indexOf(g), lineIndex: g.variantLines.indexOf(vl) });
          payloadItems.push({
            title: g.title,
            plainBottleId: g.plainBottleId || null,
            hsn: g.hsn || (poMode === 'with_po' ? '70109000' : '7010'),
            materialCode: String(vl.materialCode || '').trim(),
            variantId: vl.variantId || null,
            description: vl.description,
            box: vl.box || (vl.fullBox ? String(vl.fullBox) : '0'),
            boxCount: Number(vl.boxCount) || 0,
            unit: Number(vl.unit) || 1,
            total: Number(vl.total) || 0,
            rate: Number(vl.rate) || 0,
            taxableValue: Number(vl.taxableValue) || 0,
            jobWorkRate: Number(vl.jobWorkRate) || 0,
            jobWorkTaxableValue: Number(vl.jobWorkTaxableValue) || 0,
          });
        }
      });
    });

    if (payloadItems.length === 0) {
      return Swal.fire('Error', 'Please add at least one item description', 'warning');
    }

    const payload = {
      challanType: 'mcnore',
      poMode,
      challanNo: challanNo.trim(),
      challanDate,
      challanTime,
      taxInvoiceNo,
      taxInvoiceDate,
      poNo: poMode === 'with_po' ? poNo.trim() : '',
      poDate: poMode === 'with_po' ? poDate : '',
      dispatchThrough,
      transporter,
      vehicleNo,
      lrNo,
      companyId,
      companyName,
      billedToAddressId,
      billedTo,
      shippedToAddressId,
      shippedTo,
      items: payloadItems,
      totalBoxes,
      totalQuantity,
      glassBottleValue,
      jobWorkChargesValue,
      sgst,
      cgst,
      igst,
      grandTotalValue: grandTotal,
      checkedBy,
      checkedDate,
      checkedTime,
      remarks,
    };

    const res = await submitChallanWithMaterialCodeConfirmation({
      payload,
      submit: (requestPayload) => dispatch(updateDeliveryChallan({ id, ...requestPayload })),
      onReject: ({ itemIndex, oldMaterialCode }) => {
        const lineRef = lineRefs[itemIndex];
        if (!lineRef) return;
        setSpecGroups((groups) => {
          const next = [...groups];
          next[lineRef.groupIndex] = { ...next[lineRef.groupIndex], variantLines: [...next[lineRef.groupIndex].variantLines] };
          next[lineRef.groupIndex].variantLines[lineRef.lineIndex] = {
            ...next[lineRef.groupIndex].variantLines[lineRef.lineIndex],
            materialCode: oldMaterialCode,
            materialCodeDirty: false,
          };
          return next;
        });
      },
    });
    if (!res) return;
    {
      if (!res.error) {
        Swal.fire({
          icon: 'success',
          title: 'Updated!',
          text: `Mcnore Delivery Challan #${challanNo} updated successfully!`,
          showCancelButton: true,
          confirmButtonText: 'View Challan',
          cancelButtonText: 'Back to List',
        }).then((result) => {
          if (result.isConfirmed) {
            navigate(`/delivery-challan/mcnore/view/${id}`);
          } else {
            navigate('/delivery-challan/mcnore');
          }
        });
      } else {
        Swal.fire('Error!', res.payload?.message || res.payload || 'Failed to update Delivery Challan.', 'error');
      }
    }
  };

  return (
    <div className="page-content delivery-challan-form-page">
      {/* Header */}
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link
          to="/delivery-challan/mcnore"
          className="btn-ghost"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Mcnore Delivery Challan #{challanNo}</h1>
          <p className="page-subtitle">
            Update Mcnroe Consumer Products delivery challan details, items, or switch PO mode
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mcnore-challan-form">
        <style>{`
          .mcnore-challan-form .form-control,
          .mcnore-challan-form .form-select {
            min-height: 38px;
            padding: 0.375rem 0.75rem;
            border: 1px solid #dee2e6 !important;
            border-radius: 0.375rem !important;
            background-color: #fff;
            box-shadow: none !important;
            font-size: 1rem;
          }
          .mcnore-challan-form .form-control:focus,
          .mcnore-challan-form .form-select:focus {
            border-color: #86b7fe !important;
            box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.15) !important;
          }
        `}</style>
        {/* Section 1: Company & Challan Mode */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom">
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-building text-primary" />
              1. Company &amp; Challan Mode
            </h6>
          </div>
          <div className="card-body p-4">
            <div className="row g-4 align-items-center">
              {/* Company Selection */}
              <div className="col-lg-5 col-md-12">
                <label className="form-label fw-bold small text-uppercase text-muted d-block mb-2">
                  <i className="bi bi-building me-2 text-primary fs-6" />
                  Company <span className="text-danger">*</span>
                </label>
                <ChallanProductSelector
                  level="company"
                  companies={companies}
                  companyId={companyId}
                  onChange={(val) => {
                    if (String(val || '') !== String(companyId || '')) {
                      setSpecGroups((groups) => ChallanProductSelector.clearSelections(groups));
                    }
                    setCompanyId(val);
                    const comp = companies.find((c) => String(c._id) === String(val));
                    if (comp) setCompanyName(comp.name);
                    loadCompanyDependencies(val);
                  }}
                />
                <div className="small text-muted mt-2 d-flex align-items-center gap-1">
                  <i className="bi bi-check-circle-fill text-success" />
                  <span>Selected: </span>
                  <strong className="text-dark bg-white px-2 py-0.5 border rounded">
                    {companyName || 'MCNORE'}
                  </strong>
                </div>
              </div>

              {/* Challan Mode Radio Selector */}
              <div className="col-lg-7 col-md-12">
                <label className="form-label fw-bold small text-uppercase text-muted d-block mb-2">
                  <i className="bi bi-ui-radios-grid me-2 text-primary fs-6" />
                  Challan Mode <span className="text-danger">*</span>
                </label>

                <div className="row g-2">
                  <div className="col-sm-6">
                    <div
                      className={`p-3 border rounded-3 cursor-pointer d-flex align-items-center gap-3 transition-all ${
                        poMode === 'without_po'
                          ? 'border-primary bg-primary bg-opacity-10 shadow-sm'
                          : 'border-light-subtle bg-white hover-bg-light'
                      }`}
                      onClick={() => setPoMode('without_po')}
                      style={{ cursor: 'pointer' }}
                    >
                      <input
                        type="radio"
                        name="poModeRadio"
                        id="radioWithoutPoEdit"
                        className="form-check-input mt-0 fs-5"
                        checked={poMode === 'without_po'}
                        onChange={() => setPoMode('without_po')}
                      />
                      <div className="flex-grow-1">
                        <label htmlFor="radioWithoutPoEdit" className="fw-bold d-block text-dark cursor-pointer mb-0">
                          Without PO
                        </label>
                        <small className="text-muted d-block" style={{ fontSize: '11px' }}>
                          Format 1 (Invoice No &amp; Date)
                        </small>
                      </div>
                      <span className="badge bg-secondary-subtle text-secondary border">Standard</span>
                    </div>
                  </div>

                  <div className="col-sm-6">
                    <div
                      className={`p-3 border rounded-3 cursor-pointer d-flex align-items-center gap-3 transition-all ${
                        poMode === 'with_po'
                          ? 'border-success bg-success bg-opacity-10 shadow-sm'
                          : 'border-light-subtle bg-white hover-bg-light'
                      }`}
                      onClick={() => setPoMode('with_po')}
                      style={{ cursor: 'pointer' }}
                    >
                      <input
                        type="radio"
                        name="poModeRadio"
                        id="radioWithPoEdit"
                        className="form-check-input mt-0 fs-5"
                        checked={poMode === 'with_po'}
                        onChange={() => setPoMode('with_po')}
                      />
                      <div className="flex-grow-1">
                        <label htmlFor="radioWithPoEdit" className="fw-bold d-block text-dark cursor-pointer mb-0">
                          With PO
                        </label>
                        <small className="text-muted d-block" style={{ fontSize: '11px' }}>
                          Format 2 (PO No &amp; Material Code)
                        </small>
                      </div>
                      <span className="badge bg-success-subtle text-success border">PO Required</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Challan & Dispatch Information */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <h6 className="fw-bold text-dark mb-0">
              <i className="bi bi-info-circle-fill text-primary me-2" />
              2. Challan &amp; Dispatch Information
            </h6>
          </div>

          <div className="card-body p-4">
            <div className="row g-3">
              {poMode === 'with_po' ? (
                <>
                  <div className="col-md-3">
                    <label className="form-label fw-bold small text-success">
                      PO No <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm border-success shadow-none"
                      value={poNo}
                      onChange={(e) => setPoNo(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-bold small text-success">PO Date</label>
                    <input
                      type="date"
                      className="form-control form-control-sm border-success shadow-none"
                      value={poDate}
                      onChange={(e) => setPoDate(e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-bold small text-muted">Original Tax Invoice No</label>
                    <input
                      type="text"
                      className="form-control form-control-sm shadow-none"
                      value={taxInvoiceNo}
                      onChange={(e) => setTaxInvoiceNo(e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-bold small text-muted">Original Tax Invoice Date</label>
                    <input
                      type="date"
                      className="form-control form-control-sm shadow-none"
                      value={taxInvoiceDate}
                      onChange={(e) => setTaxInvoiceDate(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="col-md-3">
                    <label className="form-label fw-bold small text-muted">Original Tax Invoice No</label>
                    <input
                      type="text"
                      className="form-control form-control-sm shadow-none"
                      value={taxInvoiceNo}
                      onChange={(e) => setTaxInvoiceNo(e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-bold small text-muted">Original Tax Invoice Date</label>
                    <input
                      type="date"
                      className="form-control form-control-sm shadow-none"
                      value={taxInvoiceDate}
                      onChange={(e) => setTaxInvoiceDate(e.target.value)}
                    />
                  </div>
                  <div className="col-md-6" />
                </>
              )}

              <div className="col-md-3">
                <label className="form-label fw-bold small">DC No.</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none fw-bold"
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-3">
                <label className="form-label fw-bold small">Dis Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm shadow-none"
                  value={challanDate}
                  onChange={(e) => setChallanDate(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-3">
                <label className="form-label fw-bold small">Time</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  value={challanTime}
                  onChange={(e) => setChallanTime(e.target.value)}
                />
              </div>

              <div className="col-md-3">
                <label className="form-label fw-bold small">Vehicle No.</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                />
              </div>

              <div className="col-md-4">
                <label className="form-label fw-bold small">Transporter</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  value={transporter}
                  onChange={(e) => {
                    setTransporter(e.target.value);
                    setDispatchThrough(e.target.value);
                  }}
                />
              </div>

              <div className="col-md-4">
                <label className="form-label fw-bold small">Company</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  value={companyName}
                  disabled
                />
              </div>

              <div className="col-md-4">
                <label className="form-label fw-bold small">LR No.</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  value={lrNo}
                  onChange={(e) => setLrNo(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Consignee Details */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <h6 className="fw-bold text-dark mb-0">
              <i className="bi bi-geo-alt-fill text-primary me-2" />
              3. Consignee Details (Billed To &amp; Shipped To)
            </h6>
          </div>
          <div className="card-body p-4">
            <div className="row g-4">
              <div className="col-md-6 border-end">
                <div className="fw-bold mb-2 text-dark">BILLED TO</div>
                <div className="p-3 bg-white border border-light-subtle rounded-3">
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2 fw-bold"
                    value={billedTo.name}
                    onChange={(e) => setBilledTo({ ...billedTo, name: e.target.value })}
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2"
                    value={billedTo.addressTitle}
                    onChange={(e) => setBilledTo({ ...billedTo, addressTitle: e.target.value })}
                    placeholder="Address Line / Title"
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2"
                    value={billedTo.addressLine1}
                    onChange={(e) => setBilledTo({ ...billedTo, addressLine1: e.target.value })}
                    placeholder="Address Line 1"
                  />
                  <div className="row g-2 mb-2">
                    <div className="col-6">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={billedTo.city}
                        onChange={(e) => setBilledTo({ ...billedTo, city: e.target.value })}
                        placeholder="City"
                      />
                    </div>
                    <div className="col-6">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={billedTo.pincode}
                        onChange={(e) => setBilledTo({ ...billedTo, pincode: e.target.value })}
                        placeholder="Pincode"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={billedTo.gstNo}
                    onChange={(e) => setBilledTo({ ...billedTo, gstNo: e.target.value })}
                    placeholder="GSTIN No"
                  />
                </div>
              </div>

              <div className="col-md-6">
                <div className="fw-bold mb-2 text-dark">
                  {poMode === 'with_po' ? 'SHIPPED TO (PLACE OF SUPPLY)' : 'SHIPPED TO'}
                </div>
                <div className="p-3 bg-white border border-light-subtle rounded-3">
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2 fw-bold"
                    value={shippedTo.name}
                    onChange={(e) => setShippedTo({ ...shippedTo, name: e.target.value })}
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2"
                    value={shippedTo.addressTitle}
                    onChange={(e) => setShippedTo({ ...shippedTo, addressTitle: e.target.value })}
                    placeholder="Address Line / Title"
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2"
                    value={shippedTo.addressLine1}
                    onChange={(e) => setShippedTo({ ...shippedTo, addressLine1: e.target.value })}
                    placeholder="Address Line 1"
                  />
                  <div className="row g-2 mb-2">
                    <div className="col-6">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={shippedTo.city}
                        onChange={(e) => setShippedTo({ ...shippedTo, city: e.target.value })}
                        placeholder="City"
                      />
                    </div>
                    <div className="col-6">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={shippedTo.pincode}
                        onChange={(e) => setShippedTo({ ...shippedTo, pincode: e.target.value })}
                        placeholder="Pincode"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={shippedTo.gstNo}
                    onChange={(e) => setShippedTo({ ...shippedTo, gstNo: e.target.value })}
                    placeholder="GSTIN No"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Plain Bottles & Quantities */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <h6 className="fw-bold text-dark mb-0">
              <i className="bi bi-box-seam-fill text-primary me-2" />
              4. Plain Bottles &amp; Quantities
            </h6>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={addSpecGroup}>
              <i className="bi bi-plus-lg me-1" /> Add Plain Bottle
            </button>
          </div>

          <div className="card-body p-4">
            {specGroups.map((grp, grpIdx) => {
              return (
                <div key={grp.id} className="mcnore-item-group border border-light-subtle rounded-3 mb-4 bg-white p-4 shadow-sm">
                  {/* Group Header: Plain Bottle Selector */}
                  <div className="row g-2 align-items-center mb-3 pb-3 border-bottom">
                    <div className="col-md-7">
                      <label className="form-label small fw-bold text-muted mb-1">
                        Plain Bottle
                      </label>
                      <ChallanProductSelector
                        level="plainBottle"
                        companyId={companyId}
                        value={grp.plainBottleId || ''}
                        legacyLabel={grp.plainBottle || grp.title}
                        onChange={(selected) => handleGroupBottleChange(grpIdx, selected)}
                        placeholder="Select Plain Bottle..."
                      />
                    </div>

                    <div className="col-md-2">
                      <label className="form-label small fw-bold text-muted mb-1">HSN Code</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={grp.hsn}
                        onChange={(e) => {
                          const newGroups = [...specGroups];
                          newGroups[grpIdx].hsn = e.target.value;
                          setSpecGroups(newGroups);
                        }}
                        placeholder="7010"
                      />
                    </div>

                    <div className="col-md-2 text-end pt-3">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => removeSpecGroup(grpIdx)}
                        title="Remove this specification group"
                      >
                        <i className="bi bi-trash" /> Remove Group
                      </button>
                    </div>
                  </div>

                  {/* Variant Lines */}
                  <div className="table-responsive mcnore-variant-lines">
                    <table
                      className="table table-bordered table-sm align-middle mb-2 mcnore-variant-lines-table"
                      style={{
                        width: '100%',
                        minWidth: poMode === 'with_po' ? 1280 : 1390,
                        tableLayout: 'fixed',
                      }}
                    >
                      <thead className="table-light small text-uppercase">
                        <tr>
                          {poMode === 'with_po' && <th style={{ width: 115 }}>Material Code</th>}
                          <th style={{ width: 200 }}>Variant / Shade</th>
                          <th style={{ width: 210 }}>Description</th>
                          <th style={{ width: 220 }}>Boxes Calculation</th>
                          <th style={{ width: 105 }}>BottlePerBox</th>
                          <th style={{ width: 90 }}>Total Qty</th>
                          <th style={{ width: 110 }}>Rate (INR)</th>
                          {poMode === 'without_po' && <th style={{ width: 110 }}>JW Rate (INR)</th>}
                          <th style={{ width: 125 }}>Taxable Value (INR)</th>
                          <th style={{ width: 45 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {grp.variantLines.map((vl, lineIdx) => {
                          return (
                            <tr key={vl.id}>
                              {poMode === 'with_po' && (
                                <td data-label="Material Code">
                                  <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    placeholder="e.g. 1504517"
                                    value={vl.materialCode}
                                    onChange={(e) =>
                                      handleVariantLineChange(grpIdx, lineIdx, 'materialCode', e.target.value)
                                    }
                                  />
                                </td>
                              )}
                              <td data-label="Variant / Shade">
                                <ChallanProductSelector
                                  level="variant"
                                  companyId={companyId}
                                  plainBottleId={grp.plainBottleId}
                                  value={vl.variantId}
                                  legacyLabel={vl.description}
                                  onChange={(selected) =>
                                    handleVariantLineChange(
                                      grpIdx,
                                      lineIdx,
                                      'variantId',
                                      selected?.variantId || '',
                                      selected || null
                                    )
                                  }
                                />
                              </td>
                              <td data-label="Description">
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  style={{ fontSize: 12 }}
                                  placeholder="Variant description / shade"
                                  value={vl.description}
                                  onChange={(e) =>
                                    handleVariantLineChange(grpIdx, lineIdx, 'description', e.target.value)
                                  }
                                  required
                                />
                              </td>
                              <td data-label="Boxes Calculation">
                                <div
                                  className="mcnore-box-calculation"
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    width: '100%',
                                  }}
                                >
                                  <input
                                    type="number"
                                    className="form-control form-control-sm text-center"
                                    style={{ width: '100%', minWidth: 0 }}
                                    placeholder="Boxes"
                                    value={vl.fullBox}
                                    onChange={(e) =>
                                      handleVariantLineChange(grpIdx, lineIdx, 'fullBox', e.target.value)
                                    }
                                  />
                                  <span className="small text-muted">+</span>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm text-center"
                                    style={{ width: '100%', minWidth: 0 }}
                                    placeholder="Loose"
                                    value={vl.looseQty}
                                    onChange={(e) =>
                                      handleVariantLineChange(grpIdx, lineIdx, 'looseQty', e.target.value)
                                    }
                                  />
                                </div>
                                {vl.box && <div className="small text-muted mt-1">{vl.box}</div>}
                              </td>
                              <td data-label="BottlePerBox">
                                <input
                                  type="number"
                                  className="form-control form-control-sm text-center"
                                  value={vl.unit}
                                  onChange={(e) =>
                                    handleVariantLineChange(grpIdx, lineIdx, 'unit', e.target.value)
                                  }
                                  placeholder="BottlePerBox"
                                />
                              </td>
                              <td data-label="Total Qty">
                                <input
                                  type="number"
                                  className="form-control form-control-sm text-end fw-bold"
                                  value={vl.total}
                                  onChange={(e) =>
                                    handleVariantLineChange(grpIdx, lineIdx, 'total', e.target.value)
                                  }
                                  placeholder="0"
                                />
                              </td>
                              <td data-label="Rate (INR)">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="form-control form-control-sm text-end"
                                  value={vl.rate}
                                  onChange={(e) =>
                                    handleVariantLineChange(grpIdx, lineIdx, 'rate', e.target.value)
                                  }
                                  placeholder="Rate"
                                  title="Rate in INR"
                                />
                              </td>
                              {poMode === 'without_po' && (
                                <td data-label="JW Rate (INR)">
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="form-control form-control-sm text-end"
                                    value={vl.jobWorkRate}
                                    onChange={(e) =>
                                      handleVariantLineChange(grpIdx, lineIdx, 'jobWorkRate', e.target.value)
                                    }
                                    placeholder="JW Rate"
                                    title="Job-work rate in INR"
                                  />
                                </td>
                              )}
                              <td data-label="Taxable Value (INR)" className="text-end fw-500">
                                {vl.taxableValue || vl.jobWorkTaxableValue ? (
                                  <div>
                                    {vl.taxableValue > 0 && <div>INR {vl.taxableValue}</div>}
                                    {vl.jobWorkTaxableValue > 0 && (
                                      <small className="text-muted d-block">JW: INR {vl.jobWorkTaxableValue}</small>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted small">-</span>
                                )}
                              </td>
                              <td data-label="Action" className="text-center">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                                  onClick={() => removeVariantLine(grpIdx, lineIdx)}
                                  title="Delete line"
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

                  <button
                    type="button"
                    className="btn btn-sm btn-light border text-primary"
                    onClick={() => addVariantLine(grpIdx)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Variant Line
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 5: Quantities & Tax Summary */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <h6 className="fw-bold text-dark mb-0">
              <i className="bi bi-calculator-fill text-primary me-2" />
              5. Quantities &amp; Tax Calculation Breakdown
            </h6>
            <span className="badge bg-light text-dark border">
              Total Boxes: {totalBoxes} | Total Qty: {totalQuantity.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="card-body p-4">
            <div className="row g-4">
              <div className="col-md-6">
                <div className="p-3 bg-light rounded-3">
                  <div className="d-flex justify-content-between mb-2">
                    <span className="fw-bold">Total Physical Boxes:</span>
                    <span className="fw-bold fs-5 text-primary">{totalBoxes}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="fw-bold">Total Quantity (Pieces):</span>
                    <span className="fw-bold fs-5 text-dark">
                      {totalQuantity.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className="border rounded-3 p-3 bg-white shadow-sm">
                  <h6 className="fw-bold text-dark mb-3 border-bottom pb-2">
                    Challan Summary ({poMode === 'without_po' ? 'Without PO' : 'With PO'})
                  </h6>

                  {poMode === 'without_po' ? (
                    <>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span>GLASS BOTTLE VALUE:</span>
                        <span className="fw-bold">
                          {glassBottleValue > 0 ? `INR ${glassBottleValue.toLocaleString('en-IN')}` : '-'}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span>JOB WORK CHARGES VALUE:</span>
                        <span className="fw-bold">
                          {jobWorkChargesValue > 0 ? `INR ${jobWorkChargesValue.toLocaleString('en-IN')}` : '-'}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span>JOB WORK CHARGES SGST@9%:</span>
                        <span className="fw-bold">
                          {sgst > 0 ? `INR ${sgst.toLocaleString('en-IN')}` : '-'}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between mb-2 small">
                        <span>JOB WORK CHARGES CGST@9%:</span>
                        <span className="fw-bold">
                          {cgst > 0 ? `INR ${cgst.toLocaleString('en-IN')}` : '-'}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between pt-2 border-top fw-bold text-primary">
                        <span>TOTAL:</span>
                        <span>{grandTotal > 0 ? `INR ${grandTotal.toLocaleString('en-IN')}` : '-'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span>TAXABLE VALUE:</span>
                        <span className="fw-bold">
                          {glassBottleValue + jobWorkChargesValue > 0
                            ? `INR ${(glassBottleValue + jobWorkChargesValue).toLocaleString('en-IN')}`
                            : '-'}
                        </span>
                      </div>
                      {igst > 0 ? (
                        <div className="d-flex justify-content-between mb-1 small">
                          <span>IGST@18%:</span>
                          <span className="fw-bold">INR {igst.toLocaleString('en-IN')}</span>
                        </div>
                      ) : (
                        <>
                          <div className="d-flex justify-content-between mb-1 small">
                            <span>SGST@9%:</span>
                            <span className="fw-bold">
                              {sgst > 0 ? `INR ${sgst.toLocaleString('en-IN')}` : '-'}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-1 small">
                            <span>CGST@9%:</span>
                            <span className="fw-bold">
                              {cgst > 0 ? `INR ${cgst.toLocaleString('en-IN')}` : '-'}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="d-flex justify-content-between pt-2 border-top fw-bold text-success">
                        <span>TOTAL:</span>
                        <span>{grandTotal > 0 ? `INR ${grandTotal.toLocaleString('en-IN')}` : '-'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Verification & Remarks */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom">
            <h6 className="fw-bold text-dark mb-0">
              <i className="bi bi-shield-check text-primary me-2" />
              6. Verification &amp; Security Signature Info
            </h6>
          </div>
          <div className="card-body p-4">
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label fw-bold small">Checked By</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  value={checkedBy}
                  onChange={(e) => setCheckedBy(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-bold small">Checked Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm shadow-none"
                  value={checkedDate}
                  onChange={(e) => setCheckedDate(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-bold small">Checked Time</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  value={checkedTime}
                  onChange={(e) => setCheckedTime(e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-bold small">Remarks</label>
                <textarea
                  className="form-control form-control-sm shadow-none"
                  rows="2"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4 mb-5">
          <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Updating...
              </>
            ) : (
              <>
                <i className="bi bi-check-circle-fill me-2" />
                Update Mcnore Challan
              </>
            )}
          </button>
          <Link to="/delivery-challan/mcnore" className="btn-ghost px-5 py-3 text-decoration-none text-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
