import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  createDeliveryChallan,
  fetchNextChallanNo,
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

export default function AddShernoChallan() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { companies = [] } = useSelector((state) => state.companies);
  const { nextNo = '944', loading } = useSelector((state) => state.deliveryChallans);

  // Form states
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState(new Date().toISOString().split('T')[0]);
  const [challanTime, setChallanTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
  const [poNo, setPoNo] = useState('');
  const [poDate, setPoDate] = useState('');
  const [dispatchThrough, setDispatchThrough] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');

  // Company and Addresses (Pre-configured for SHRENO)
  const [companyId, setCompanyId] = useState('6a17d6d3e933dc474615eb92');
  const [companyName, setCompanyName] = useState('SHRENO');
  const [companyAddresses, setCompanyAddresses] = useState([]);

  // Billed To Address
  const [billedToAddressId, setBilledToAddressId] = useState('');
  const [billedTo, setBilledTo] = useState({
    name: 'M/S SHRENO LTD',
    addressTitle: 'M/S SHRENO LTD',
    addressLine1: 'ALEMBIC ROAD',
    addressLine2: '',
    city: 'VADODRA',
    state: 'GUJARAT',
    stateCode: '24',
    pincode: '390003',
    gstNo: '24AABCA7953Q1Z6',
  });

  // Shipped To Address
  const [sameAsBilledTo, setSameAsBilledTo] = useState(true);
  const [shippedToAddressId, setShippedToAddressId] = useState('');
  const [shippedTo, setShippedTo] = useState({
    name: 'M/S SHRENO LTD',
    addressTitle: 'M/S SHRENO LTD',
    addressLine1: 'ALEMBIC ROAD',
    addressLine2: '',
    city: 'VADODRA',
    state: 'GUJARAT',
    stateCode: '24',
    pincode: '390003',
    gstNo: '24AABCA7953Q1Z6',
  });

  // Bottle Specs for Shreno
  const [companyBottleSpecs, setCompanyBottleSpecs] = useState([]);
  const [loadingSpecs, setLoadingSpecs] = useState(false);

  // Bottle Per Box master
  const [bottlePerBoxes, setBottlePerBoxes] = useState([]);


  // Items grouped by Bottle Specification
  const [specGroups, setSpecGroups] = useState([
    {
      id: 'grp_1',
      bottleSpecId: '',
      title: '',
      variantLines: [
        {
          id: 'line_1',
          variantId: '',
          materialCode: '',
          description: '',
          box: '',
          fullBox: '',
          looseBox: '1',
          looseQty: '',
          unit: '',
          total: '',
          boxCount: 0,
          remarks: '',
        },
      ],
    },
  ]);

  // Checked and remarks
  const [checkedBy, setCheckedBy] = useState('');
  const [remarks, setRemarks] = useState('');

  // Initial loading: Fetch companies, nextNo for sherno, and bottlePerBox master
  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchNextChallanNo('sherno'));

    // Automatically load Shreno addresses and specs
    handleCompanyChange('6a17d6d3e933dc474615eb92');

    API.get('/bottle-per-box', { params: { pagination: 'false' } })
      .then((res) => {
        if (res.data?.data) {
          setBottlePerBoxes(res.data.data);
        }
      })
      .catch((err) => console.error('Failed to load BottlePerBox master:', err));
  }, [dispatch]);

  // Auto-detect and ensure SHRENO company is selected
  useEffect(() => {
    if (companies.length > 0) {
      const shreno = companies.find(
        (c) => c.name && (c.name.toLowerCase().includes('shreno') || c.name.toLowerCase().includes('sherno'))
      );
      if (shreno && shreno._id !== companyId) {
        handleCompanyChange(shreno._id);
      }
    }
  }, [companies]);

  // Set default challan number
  useEffect(() => {
    if (nextNo && !challanNo) {
      setChallanNo(nextNo);
    }
  }, [nextNo]);

  // Fetch addresses and bottle specs when company changes
  async function handleCompanyChange(selectedId) {
    if (String(selectedId || '') !== String(companyId || '')) {
      setSpecGroups((groups) => ChallanProductSelector.clearSelections(groups));
    }
    setCompanyId(selectedId);
    const selectedComp = companies.find((c) => c._id === selectedId);
    const compName = selectedComp ? selectedComp.name : 'SHRENO';
    setCompanyName(compName);

    if (!selectedId) {
      setCompanyAddresses([]);
      setCompanyBottleSpecs([]);
      setBilledToAddressId('');
      setShippedToAddressId('');
      return;
    }

    // 1. Fetch Company Addresses
    try {
      const resAddr = await API.get('/company-address', {
        params: { companyId: selectedId, pagination: 'false' },
      });
      const addrs = resAddr.data?.data || [];
      setCompanyAddresses(addrs);

      if (addrs.length > 0) {
        const defaultAddr = addrs.find((a) => a.isDefault) || addrs[0];
        setBilledToAddressId(defaultAddr._id);
        const mapped = mapAddressToState(compName, defaultAddr);
        setBilledTo(mapped);
        if (sameAsBilledTo) {
          setShippedToAddressId(defaultAddr._id);
          setShippedTo(mapped);
        }
      }
    } catch (err) {
      console.error('Failed to load company addresses:', err);
    }

    // 2. Fetch Bottle Specs for this company
    try {
      setLoadingSpecs(true);
      const resSpecs = await API.get('/bottle-spec', {
        params: { companyId: selectedId, pagination: 'false' },
      });
      const specs = resSpecs.data?.data || [];
      setCompanyBottleSpecs(specs);
    } catch (err) {
      console.error('Failed to load company bottle specs:', err);
    } finally {
      setLoadingSpecs(false);
    }
  }

  const mapAddressToState = (compName, addr) => {
    const gst = addr.gstNo || '';
    const stCode = gst.length >= 2 ? gst.substring(0, 2) : '24';
    return {
      name: addr.addressTitle || compName || 'M/S SHRENO LTD',
      addressTitle: addr.addressTitle || '',
      addressLine1: addr.addressLine1 || '',
      addressLine2: addr.addressLine2 || '',
      city: addr.city || 'VADODRA',
      state: addr.state || 'GUJARAT',
      stateCode: stCode,
      pincode: addr.pincode || '',
      gstNo: gst,
    };
  };

  const handleBilledToChange = (addrId) => {
    setBilledToAddressId(addrId);
    const addr = companyAddresses.find((a) => a._id === addrId);
    if (addr) {
      const mapped = mapAddressToState(companyName, addr);
      setBilledTo(mapped);
      if (sameAsBilledTo) {
        setShippedToAddressId(addrId);
        setShippedTo(mapped);
      }
    }
  };

  const handleShippedToChange = (addrId) => {
    setShippedToAddressId(addrId);
    const addr = companyAddresses.find((a) => a._id === addrId);
    if (addr) {
      setShippedTo(mapAddressToState(companyName, addr));
    }
  };

  const toggleSameAsBilledTo = (checked) => {
    setSameAsBilledTo(checked);
    if (checked) {
      setShippedToAddressId(billedToAddressId);
      setShippedTo({ ...billedTo });
    }
  };

  // Helper to find unit (bottlePerBox) for a bottleName
  const findUnitPerBox = (bottleName) => {
    if (!bottleName || !bottlePerBoxes || !bottlePerBoxes.length) return '';
    const cleanName = bottleName.trim().toLowerCase().replace(/\s+/g, ' ');

    // 1. Exact match on plainBottleName or bottleName
    const exact = bottlePerBoxes.find((b) => {
      const p = (b.plainBottleName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const n = (b.bottleName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return p === cleanName || n === cleanName;
    });
    if (exact && exact.bottlePerBox) return exact.bottlePerBox;

    // 2. Match in bottleNames alias array
    const inArray = bottlePerBoxes.find((b) => {
      if (Array.isArray(b.bottleNames)) {
        return b.bottleNames.some(
          (alias) => alias.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName
        );
      }
      return false;
    });
    if (inArray && inArray.bottlePerBox) return inArray.bottlePerBox;

    // 3. Partial match
    const partial = bottlePerBoxes.find((b) => {
      const p = (b.plainBottleName || b.bottleName || '').trim().toLowerCase();
      return p && (cleanName.includes(p) || p.includes(cleanName));
    });
    if (partial && partial.bottlePerBox) return partial.bottlePerBox;

    return '';
  };

  // Calculate box expression and totals for a line
  const calculateItemTotal = (item) => {
    const unit = Number(item.unit) || 0;
    const fullBox = Number(item.fullBox) || 0;
    const looseQty = Number(item.looseQty) || 0;

    if (item.fullBox !== '' && item.looseQty !== '') {
      const total = fullBox * unit + looseQty;
      const looseBoxCount = Number(item.looseBox) || 1;
      const boxExp = `${fullBox}+(${looseBoxCount}*${looseQty})`;
      const totalBoxes = fullBox + (looseQty > 0 ? looseBoxCount : 0);
      return { total, box: boxExp, boxCount: totalBoxes };
    } else if (item.fullBox !== '') {
      const total = fullBox * unit;
      return { total, box: String(fullBox), boxCount: fullBox };
    } else if (item.box) {
      const match = String(item.box).match(/^(\d+)\s*\+\s*\((\d+)\s*\*\s*(\d+)\)$/);
      if (match) {
        const fBox = parseInt(match[1]);
        const lBox = parseInt(match[2]);
        const lQty = parseInt(match[3]);
        return { total: fBox * unit + lQty, box: item.box, boxCount: fBox + lBox };
      }
      const bNum = parseFloat(item.box) || 0;
      return { total: Math.round(bNum * unit), box: item.box, boxCount: bNum };
    }
    return { total: 0, box: item.box || '', boxCount: 0 };
  };

  // When a Plain Bottle is selected for a group
  const handleBottleSelect = (gIdx, selectedBottle) => {
    const updated = [...specGroups];
    const cleanName = selectedBottle?.name || '';

    if (cleanName) {
      updated[gIdx].plainBottle = cleanName;
      updated[gIdx].plainBottleId = selectedBottle.id || selectedBottle.value;
      updated[gIdx].title = cleanName;

      const spec = companyBottleSpecs.find(
        (s) => (s.bottleName || s.name || '').trim().toLowerCase() === cleanName.toLowerCase()
      );
      updated[gIdx].bottleSpecId = spec ? spec._id : '';

      const autoUnit = findUnitPerBox(cleanName);
      if (autoUnit) {
        updated[gIdx].variantLines = updated[gIdx].variantLines.map((vl) => {
          const newLine = { ...vl, variantId: '', materialCode: '', materialCodeDirty: true, description: '', unit: vl.unit || autoUnit };
          const { total, box, boxCount } = calculateItemTotal(newLine);
          return { ...newLine, total, box, boxCount };
        });
      }

    } else {
      updated[gIdx].plainBottle = '';
      updated[gIdx].plainBottleId = '';
      updated[gIdx].title = '';
      updated[gIdx].bottleSpecId = '';
      updated[gIdx].variantLines = updated[gIdx].variantLines.map((line) => ({
        ...line,
        variantId: '',
        materialCode: '',
        materialCodeDirty: true,
        description: '',
      }));
    }

    setSpecGroups(updated);
  };

  // Select a variant for an individual challan line
  const handleVariantSelect = (gIdx, lineIdx, selectedVariant) => {
    const updated = [...specGroups];
    const group = updated[gIdx];
    const line = group.variantLines[lineIdx];
    const variantId = selectedVariant?.variantId || '';
    line.variantId = variantId;
    const foundVariant = selectedVariant;
    if (foundVariant) {
      line.description = foundVariant.variantName || foundVariant.name || '';
    } else if (!variantId) {
      line.description = '';
    }
    line.materialCode = foundVariant?.materialCode || '';
    line.materialCodeDirty = true;
    setSpecGroups(updated);
  };

  const handleVariantLineChange = (gIdx, lineIdx, field, value) => {
    const updated = [...specGroups];
    const line = updated[gIdx].variantLines[lineIdx];
    line[field] = value;
    if (field === 'materialCode') line.materialCodeDirty = true;

    if (field === 'fullBox' || field === 'looseQty' || field === 'looseBox' || field === 'unit') {
      const { total, box, boxCount } = calculateItemTotal(line);
      line.total = total;
      line.box = box;
      line.boxCount = boxCount;
    } else if (field === 'box') {
      const { total, boxCount } = calculateItemTotal(line);
      line.total = total;
      line.boxCount = boxCount;
    }

    setSpecGroups(updated);
  };

  const addLineToSpecGroup = (gIdx) => {
    const updated = [...specGroups];
    const group = updated[gIdx];
    const defaultUnit = group.variantLines[0]?.unit || findUnitPerBox(group.title) || '';
    group.variantLines.push({
      id: 'line_' + Math.random().toString(36).substr(2, 9),
      variantId: '',
      materialCode: '',
      description: '',
      box: '',
      fullBox: '',
      looseBox: '1',
      looseQty: '',
      unit: defaultUnit,
      total: '',
      boxCount: 0,
      remarks: '',
    });
    setSpecGroups(updated);
  };

  const removeVariantLine = (gIdx, lineIdx) => {
    const updated = [...specGroups];
    const group = updated[gIdx];
    const removedLine = group.variantLines[lineIdx];

    if (group.variantLines.length === 1 && specGroups.length === 1) {
      group.variantLines[0] = {
        id: 'line_' + Math.random().toString(36).substr(2, 9),
        variantId: '',
        materialCode: '',
        description: '',
        box: '',
        fullBox: '',
        looseBox: '1',
        looseQty: '',
        unit: findUnitPerBox(group.title) || '',
        total: '',
        boxCount: 0,
        remarks: '',
      };
      setSpecGroups(updated);
      return;
    }

    group.variantLines = group.variantLines.filter((_, idx) => idx !== lineIdx);

    if (group.variantLines.length === 0) {
      group.variantLines.push({
        id: 'line_' + Math.random().toString(36).substr(2, 9),
        variantId: '',
        materialCode: '',
        description: '',
        box: '',
        fullBox: '',
        looseBox: '1',
        looseQty: '',
        unit: findUnitPerBox(group.title) || '',
        total: '',
        boxCount: 0,
        remarks: '',
      });
    }

    setSpecGroups(updated);
  };

  const addSpecGroup = () => {
    setSpecGroups((prev) => [
      ...prev,
      {
        id: 'grp_' + Math.random().toString(36).substr(2, 9),
        bottleSpecId: '',
        title: '',
        variantLines: [
          {
            id: 'line_' + Math.random().toString(36).substr(2, 9),
            variantId: '',
            materialCode: '',
            description: '',
            box: '',
            fullBox: '',
            looseBox: '1',
            looseQty: '',
            unit: '',
            total: '',
            boxCount: 0,
            remarks: '',
          },
        ],
      },
    ]);
  };

  const removeSpecGroup = (gIdx) => {
    if (specGroups.length === 1) {
      Swal.fire('Notice', 'At least one item line is required.', 'info');
      return;
    }
    setSpecGroups((prev) => prev.filter((_, idx) => idx !== gIdx));
  };

  // Summary Totals
  const allLines = specGroups.flatMap((g) => g.variantLines);
  const totalBoxes = allLines.reduce((acc, it) => acc + (Number(it.boxCount) || 0), 0);
  const totalQuantity = allLines.reduce((acc, it) => acc + (Number(it.total) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!challanNo.trim()) {
      return Swal.fire('Error', 'Delivery Challan / Gate Pass No is required', 'warning');
    }
    if (!companyId) {
      return Swal.fire('Error', 'Please select Company (SHRENO)', 'warning');
    }

    const payloadItems = [];
    const lineRefs = [];
    specGroups.forEach((g) => {
      g.variantLines.forEach((vl) => {
        if (vl.description && vl.description.trim()) {
          lineRefs.push({ groupIndex: specGroups.indexOf(g), lineIndex: g.variantLines.indexOf(vl) });
          payloadItems.push({
            bottleSpecId: g.bottleSpecId || undefined,
            plainBottleId: g.plainBottleId || undefined,
            variantId: vl.variantId || undefined,
            title: g.title,
            materialCode: String(vl.materialCode || '').trim(),
            description: vl.description,
            box: vl.box || (vl.fullBox ? String(vl.fullBox) : '0'),
            boxCount: Number(vl.boxCount) || 0,
            unit: Number(vl.unit) || 1,
            total: Number(vl.total) || 0,
            remarks: vl.remarks || '',
          });
        }
      });
    });

    if (payloadItems.length === 0) {
      return Swal.fire('Error', 'Please add at least one item description', 'warning');
    }

    const payload = {
      challanType: 'sherno',
      challanNo: challanNo.trim(),
      challanDate,
      challanTime,
      buyersOrderNo: poNo,
      poNo: poNo,
      poDate: poDate || undefined,
      dispatchThrough,
      lrNo,
      vehicleNo,
      companyId,
      companyName,
      billedToAddressId,
      billedTo,
      shippedToAddressId,
      shippedTo,
      items: payloadItems,
      totalBoxes,
      totalQuantity,
      checkedBy,
      remarks,
    };

    const res = await submitChallanWithMaterialCodeConfirmation({
      payload,
      submit: (requestPayload) => dispatch(createDeliveryChallan(requestPayload)),
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
          title: 'Success!',
          text: `Sherno Delivery Challan #${challanNo} created successfully!`,
          showCancelButton: true,
          confirmButtonText: 'Print / View Challan',
          cancelButtonText: 'Back to List',
        }).then((result) => {
          if (result.isConfirmed && res.payload?.data?._id) {
            navigate(`/delivery-challan/sherno/view/${res.payload.data._id}`);
          } else {
            navigate('/delivery-challan/sherno');
          }
        });
      } else {
        Swal.fire('Error!', res.payload?.message || res.payload || 'Failed to create Delivery Challan.', 'error');
      }
    }
  };

  return (
    <div className="page-content delivery-challan-form-page">
      {/* Header */}
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link
          to="/delivery-challan/sherno"
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
          <h1 className="page-title">New Sherno Delivery Challan</h1>
          <p className="page-subtitle">
            Create an official delivery challan for M/S Shreno Ltd with Gate Pass No, P.O. Details, and Material Codes
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="sherno-challan-form">
        <style>{`
          .sherno-challan-form .form-control,
          .sherno-challan-form .form-select {
            min-height: 38px;
            padding: 0.375rem 0.75rem;
            border: 1px solid #dee2e6 !important;
            border-radius: 0.375rem !important;
            background-color: #fff;
            box-shadow: none !important;
            font-size: 1rem;
          }
          .sherno-challan-form .form-control:focus,
          .sherno-challan-form .form-select:focus {
            border-color: #86b7fe !important;
            box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.15) !important;
          }
        `}</style>
        {/* Section 1: Gate Pass & P.O. Details */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center gap-2">
            <i className="bi bi-receipt text-primary fs-5" />
            <h6 className="mb-0 fw-bold">1. Gate Pass &amp; P.O. Details</h6>
          </div>
          <div className="card-body p-4">
            <div className="row g-3">
              {/* Company Selection */}
              <div className="col-md-6">
                <label className="form-label fw-600 small text-uppercase text-muted">
                  Company <span className="text-danger">*</span>
                </label>
                <ChallanProductSelector
                  level="company"
                  companies={companies}
                  value={companyId}
                  companyId={companyId}
                  onChange={handleCompanyChange}
                  placeholder="-- Select Company --"
                />
                {companyId && (
                  <div className="small text-muted mt-1">
                    <i className="bi bi-info-circle me-1 text-primary" />
                    Loaded {companyAddresses.length} addresses and {companyBottleSpecs.length} bottle specs for {companyName}.
                  </div>
                )}
              </div>

              {/* Gate Pass / Challan No */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">
                  Gate Pass No <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control custom-input-field font-monospace fw-bold"
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  placeholder="e.g. 943"
                  required
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* Challan Date */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Date</label>
                <input
                  type="date"
                  className="form-control custom-input-field"
                  value={challanDate}
                  onChange={(e) => setChallanDate(e.target.value)}
                  style={{ borderRadius: 12 }}
                  required
                />
              </div>

              {/* P.O. NO */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">P.O. No.</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={poNo}
                  onChange={(e) => setPoNo(e.target.value)}
                  placeholder="e.g. 7300302293"
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* P.O. DATE */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">P.O. Date</label>
                <input
                  type="date"
                  className="form-control custom-input-field"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* Time */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Time</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={challanTime}
                  onChange={(e) => setChallanTime(e.target.value)}
                  placeholder="e.g. 12.00 PM"
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* Vehicle No */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Vehicle No</label>
                <input
                  type="text"
                  className="form-control custom-input-field font-monospace text-uppercase"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                  placeholder="e.g. GJ 06 BV 5092"
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* Dispatch Through */}
              <div className="col-md-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Dispatch Through</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={dispatchThrough}
                  onChange={(e) => setDispatchThrough(e.target.value)}
                  placeholder="e.g. Direct Truck, Logistics"
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* LR No */}
              <div className="col-md-6">
                <label className="form-label fw-600 small text-uppercase text-muted">LR No</label>
                <input
                  type="text"
                  className="form-control custom-input-field font-monospace"
                  value={lrNo}
                  onChange={(e) => setLrNo(e.target.value)}
                  placeholder="e.g. LR-4491"
                  style={{ borderRadius: 12 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Consignee Address */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-geo-alt text-primary fs-5" />
              <h6 className="mb-0 fw-bold">2. Consignee (M/S SHRENO LTD)</h6>
            </div>
            {companyId && (
              <Link
                to={`/company-addresses/add?companyId=${companyId}`}
                target="_blank"
                className="btn btn-sm btn-outline-primary"
              >
                <i className="bi bi-plus-lg me-1" /> Add Address
              </Link>
            )}
          </div>
          <div className="card-body p-4">
            <div className="row g-4">
              {/* BILLED TO / CONSIGNEE */}
              <div className="col-md-6 border-end">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h6 className="fw-bold mb-0 text-primary">Consignee Address (Billed To)</h6>
                  <span className="badge bg-primary-subtle text-primary">Primary</span>
                </div>
                {companyAddresses.length > 0 && (
                  <div className="mb-3">
                    <label className="text-muted small fw-600">Choose Address Preset</label>
                    <select
                      className="form-select form-select-sm"
                      value={billedToAddressId}
                      onChange={(e) => handleBilledToChange(e.target.value)}
                    >
                      {companyAddresses.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.addressTitle ? `${a.addressTitle} - ` : ''}
                          {a.addressLine1}, {a.city}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="small">
                  <div className="mb-2">
                    <label className="text-muted fw-600">Company Name</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={billedTo.name}
                      onChange={(e) => setBilledTo({ ...billedTo, name: e.target.value })}
                    />
                  </div>
                  <div className="mb-2">
                    <label className="text-muted fw-600">Address Line 1</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={billedTo.addressLine1}
                      onChange={(e) => setBilledTo({ ...billedTo, addressLine1: e.target.value })}
                    />
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-7">
                      <label className="text-muted fw-600">City</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={billedTo.city}
                        onChange={(e) => setBilledTo({ ...billedTo, city: e.target.value })}
                      />
                    </div>
                    <div className="col-5">
                      <label className="text-muted fw-600">Pincode</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={billedTo.pincode}
                        onChange={(e) => setBilledTo({ ...billedTo, pincode: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="text-muted fw-600">GSTIN NO</label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-monospace text-uppercase"
                      value={billedTo.gstNo}
                      onChange={(e) => setBilledTo({ ...billedTo, gstNo: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
              </div>

              {/* SHIPPED TO */}
              <div className="col-md-6">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h6 className="fw-bold mb-0 text-success">Delivery / Shipped To</h6>
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="sameAsBilledToSherno"
                      checked={sameAsBilledTo}
                      onChange={(e) => toggleSameAsBilledTo(e.target.checked)}
                    />
                    <label className="form-check-label small fw-600" htmlFor="sameAsBilledToSherno">
                      Same as Consignee
                    </label>
                  </div>
                </div>
                <div className="small">
                  <div className="mb-2">
                    <label className="text-muted fw-600">Company Name</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={shippedTo.name}
                      onChange={(e) => setShippedTo({ ...shippedTo, name: e.target.value })}
                      disabled={sameAsBilledTo}
                    />
                  </div>
                  <div className="mb-2">
                    <label className="text-muted fw-600">Address Line 1</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={shippedTo.addressLine1}
                      onChange={(e) => setShippedTo({ ...shippedTo, addressLine1: e.target.value })}
                      disabled={sameAsBilledTo}
                    />
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-7">
                      <label className="text-muted fw-600">City</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={shippedTo.city}
                        onChange={(e) => setShippedTo({ ...shippedTo, city: e.target.value })}
                        disabled={sameAsBilledTo}
                      />
                    </div>
                    <div className="col-5">
                      <label className="text-muted fw-600">Pincode</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={shippedTo.pincode}
                        onChange={(e) => setShippedTo({ ...shippedTo, pincode: e.target.value })}
                        disabled={sameAsBilledTo}
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="text-muted fw-600">GSTIN NO</label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-monospace text-uppercase"
                      value={shippedTo.gstNo}
                      onChange={(e) => setShippedTo({ ...shippedTo, gstNo: e.target.value.toUpperCase() })}
                      disabled={sameAsBilledTo}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Challan Items */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-box-seam text-primary fs-5" />
                <h6 className="mb-0 fw-bold">3. Challan Items</h6>
              </div>
              <small className="text-muted">
                Each item includes Material Code (e.g. 82003708), Plain Bottle, Variant, and Quantities.
              </small>
            </div>
            <button
              type="button"
              className="btn btn-accent px-4 py-2"
              onClick={addSpecGroup}
            >
              <i className="bi bi-plus-circle me-1" /> Add Plain Bottle
            </button>
          </div>

          <div className="card-body p-4">
            <div className="table-responsive sherno-challan-items-responsive" style={{ overflowX: 'auto', overflowY: 'visible' }}>
              <table className="table table-bordered align-middle mb-0 sherno-challan-items-table">
                <thead className="table-light text-center small text-uppercase">
                  <tr>
                    <th style={{ width: 45 }}>#</th>
                    <th style={{ width: 300 }}>Plain Bottle</th>
                    <th style={{ width: 140 }}>Material Code</th>
                    <th style={{ width: 230 }}>Variant / Shade</th>
                    <th style={{ minWidth: 260 }}>Description (Coating-Variant-Color)</th>
                    <th style={{ width: 190 }}>Box Details</th>
                    <th style={{ width: 90 }}>BottlePerBox</th>
                    <th style={{ width: 110 }}>Total Qty</th>
                    <th style={{ width: 55 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {specGroups.map((group, gIdx) => {
                    const numLines = group.variantLines.length;

                    return group.variantLines.map((line, lIdx) => (
                      <tr key={line.id || `${gIdx}-${lIdx}`}>
                        {/* Sr No */}
                        {lIdx === 0 && (
                          <td
                            rowSpan={numLines}
                            className="text-center fw-bold text-muted align-top pt-3"
                            style={{ background: '#fdfdfe' }}
                          >
                            {gIdx + 1}
                          </td>
                        )}

                        {/* Plain Bottle Selection */}
                        {lIdx === 0 && (
                          <td
                            rowSpan={numLines}
                            className="align-top"
                            style={{ background: '#fdfdfe' }}
                          >
                            <ChallanProductSelector
                              level="plainBottle"
                              companyId={companyId}
                              value={group.plainBottleId || ''}
                              legacyLabel={group.plainBottle || group.title}
                              onChange={(selected) => handleBottleSelect(gIdx, selected)}
                              placeholder="-- Select Plain Bottle --"
                            />
                            {specGroups.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-xs btn-outline-danger mt-2 w-100 py-1"
                                style={{ fontSize: 11, borderRadius: 6 }}
                                onClick={() => removeSpecGroup(gIdx)}
                                title="Delete this entire Plain Bottle block"
                              >
                                <i className="bi bi-trash me-1" /> Remove Bottle
                              </button>
                            )}
                          </td>
                        )}

                        {/* Material Code */}
                        <td>
                          <input
                            type="text"
                            className="form-control font-monospace fw-bold"
                            placeholder="e.g. 82003708"
                            value={line.materialCode || ''}
                            onChange={(e) =>
                              handleVariantLineChange(gIdx, lIdx, 'materialCode', e.target.value)
                            }
                            title="Material Code (e.g. 82003708 for Shreno)"
                            style={{ height: 38, fontSize: 13, borderRadius: 8 }}
                          />
                        </td>

                        {/* Variant selection per item line */}
                        <td>
                          <ChallanProductSelector
                            level="variant"
                            companyId={companyId}
                            plainBottleId={group.plainBottleId}
                            value={line.variantId}
                            legacyLabel={line.description}
                            onChange={(selected) => handleVariantSelect(gIdx, lIdx, selected)}
                          />
                        </td>

                        {/* Description */}
                        <td>
                          <input
                            type="text"
                            className="form-control text-uppercase fw-semibold"
                            placeholder="e.g. NEW HORIZON DESIGN - GOLD FOIL"
                            value={line.description}
                            onChange={(e) =>
                              handleVariantLineChange(gIdx, lIdx, 'description', e.target.value)
                            }
                            required
                            style={{ height: 38, fontSize: 13, borderRadius: 8 }}
                          />
                        </td>

                        {/* Box Details */}
                        <td>
                          <div className="d-flex flex-column gap-1">
                            <div className="d-flex gap-1 align-items-center">
                              <input
                                type="number"
                                className="form-control text-center"
                                placeholder="Full"
                                value={line.fullBox}
                                onChange={(e) =>
                                  handleVariantLineChange(gIdx, lIdx, 'fullBox', e.target.value)
                                }
                                title="Full Boxes (e.g. 93)"
                                style={{ width: '50%', height: 38, fontSize: 13, borderRadius: 8 }}
                              />
                              <span className="small text-muted fw-bold">+</span>
                              <input
                                type="number"
                                className="form-control text-center"
                                placeholder="Loose"
                                value={line.looseQty}
                                onChange={(e) =>
                                  handleVariantLineChange(gIdx, lIdx, 'looseQty', e.target.value)
                                }
                                title="Loose Pieces (if any)"
                                style={{ width: '50%', height: 38, fontSize: 13, borderRadius: 8 }}
                              />
                            </div>
                            {line.box && (
                              <div
                                className="font-monospace text-primary fw-bold text-center"
                                style={{ fontSize: 12, marginTop: 2 }}
                              >
                                {line.box}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Unit */}
                        <td>
                          <input
                            type="number"
                            className="form-control text-center font-monospace"
                            placeholder="64"
                            value={line.unit}
                            onChange={(e) =>
                              handleVariantLineChange(gIdx, lIdx, 'unit', e.target.value)
                            }
                            title="BottlePerBox (e.g. 64)"
                            required
                            style={{ height: 38, fontSize: 13, borderRadius: 8 }}
                          />
                        </td>

                        {/* Total Qty */}
                        <td>
                          <input
                            type="number"
                            className="form-control text-center font-monospace fw-bold bg-light"
                            value={line.total}
                            readOnly
                            title="Auto calculated: (Full Box * Unit) + Loose"
                            style={{ height: 38, fontSize: 14, borderRadius: 8 }}
                          />
                        </td>

                        {/* Action */}
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                            onClick={() => removeVariantLine(gIdx, lIdx)}
                            title="Remove this line"
                          >
                            <i className="bi bi-trash fs-6" />
                          </button>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
                <tfoot className="table-light fw-bold">
                  <tr>
                    <td colSpan={5} className="text-end pe-3 text-uppercase">
                      TOTAL
                    </td>
                    <td className="text-center font-monospace fs-6 text-primary">{totalBoxes}</td>
                    <td className="text-center text-muted">-</td>
                    <td className="text-center font-monospace fs-6 text-success">
                      {totalQuantity.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Section 4: Checks & Submission */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom">
            <h6 className="fw-bold text-dark mb-0">4. Checks &amp; Submission</h6>
          </div>
          <div className="card-body p-4">
            <div className="row g-3 align-items-center">
              <div className="col-md-6">
                <label className="form-label small fw-600 text-muted">Checked By</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  placeholder="e.g. Security / Supervisor"
                  value={checkedBy}
                  onChange={(e) => setCheckedBy(e.target.value)}
                  style={{ borderRadius: 12 }}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label small fw-600 text-muted">Remarks</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  placeholder="e.g. Urgently dispatched"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{ borderRadius: 12 }}
                />
              </div>
            </div>

            <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
              <button
                type="submit"
                className="btn-accent px-5 py-3 flex-grow-1"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" /> Saving...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle me-2" /> Save &amp; Generate Challan
                  </>
                )}
              </button>
              <Link to="/delivery-challan/sherno" className="btn-ghost px-5 py-3 text-decoration-none text-center">
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
