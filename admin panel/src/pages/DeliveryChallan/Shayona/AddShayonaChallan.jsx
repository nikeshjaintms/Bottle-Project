import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  createDeliveryChallan,
  fetchNextChallanNo,
} from '../../../redux/slices/deliveryChallanSlice';
import { fetchCompanies } from '../../../redux/slices/companySlice';
import SearchableSelect from '../../../components/SearchableSelect';
import SearchableMultiSelect from '../../../components/SearchableMultiSelect';
import API from '../../../services/api';
import Swal from 'sweetalert2';

export default function AddShayonaChallan() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { companies = [] } = useSelector((state) => state.companies);
  const { nextNo = '806', loading } = useSelector((state) => state.deliveryChallans);

  // Form states
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState(new Date().toISOString().split('T')[0]);
  const [challanTime, setChallanTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
  const [buyersOrderNo, setBuyersOrderNo] = useState('');
  const [poDate, setPoDate] = useState('');
  const [dispatchThrough, setDispatchThrough] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');

  // Company and Addresses
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddresses, setCompanyAddresses] = useState([]);

  // Billed To Address
  const [billedToAddressId, setBilledToAddressId] = useState('');
  const [billedTo, setBilledTo] = useState({
    name: '',
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
    name: '',
    addressTitle: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: 'GUJARAT',
    stateCode: '24',
    pincode: '',
    gstNo: '',
  });

  // Bottle Specs for the selected company
  const [companyBottleSpecs, setCompanyBottleSpecs] = useState([]);
  const [loadingSpecs, setLoadingSpecs] = useState(false);

  // Bottle Per Box master
  const [bottlePerBoxes, setBottlePerBoxes] = useState([]);

  // Cache variants per bottleSpecId: { [specId]: [variant1, variant2, ...] }
  const [specVariantsCache, setSpecVariantsCache] = useState({});

  // Items grouped by Bottle Specification (supporting multi-variants per spec)
  const [specGroups, setSpecGroups] = useState([
    {
      id: 'grp_1',
      bottleSpecId: '',
      title: '',
      selectedVariantIds: [],
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

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchNextChallanNo('shayoona'));

    // Fetch BottlePerBox master for automatic Unit (Pcs per Box) mapping
    API.get('/bottle-per-box', { params: { pagination: 'false' } })
      .then((res) => {
        if (res.data?.data) {
          setBottlePerBoxes(res.data.data);
        }
      })
      .catch((err) => console.error('Failed to load BottlePerBox master:', err));
  }, [dispatch]);

  // Set default challan number
  useEffect(() => {
    if (nextNo && !challanNo) {
      setChallanNo(nextNo);
    }
  }, [nextNo]);

  // Fetch addresses and bottle specs when company changes
  const handleCompanyChange = async (selectedId) => {
    setCompanyId(selectedId);
    const selectedComp = companies.find((c) => c._id === selectedId);
    const compName = selectedComp ? selectedComp.name : '';
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
      } else {
        const emptyAddr = {
          name: compName,
          addressTitle: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: 'GUJARAT',
          stateCode: '24',
          pincode: '',
          gstNo: '',
        };
        setBilledTo(emptyAddr);
        setShippedTo(emptyAddr);
        setBilledToAddressId('');
        setShippedToAddressId('');
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
  };

  const mapAddressToState = (compName, addr) => {
    const gst = addr.gstNo || '';
    const stCode = gst.length >= 2 ? gst.substring(0, 2) : '24';
    return {
      name: compName,
      addressTitle: addr.addressTitle || '',
      addressLine1: addr.addressLine1 || '',
      addressLine2: addr.addressLine2 || '',
      city: addr.city || '',
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

  // Memoized Plain Bottle Options (Company Plain Bottles first, then remaining Master Bottles)
  const plainBottleOptions = useMemo(() => {
    const companyPlainNames = new Set();
    (companyBottleSpecs || []).forEach((spec) => {
      const raw = (spec.bottleName || spec.name || '').trim();
      if (!raw) return;
      const matchedBpb = (bottlePerBoxes || []).find((b) => {
        const pName = (b.plainBottleName || b.bottleName || '').trim();
        if (pName.toLowerCase() === raw.toLowerCase()) return true;
        if (Array.isArray(b.bottleNames) && b.bottleNames.some((n) => n.toLowerCase() === raw.toLowerCase())) {
          return true;
        }
        return false;
      });
      if (matchedBpb) {
        companyPlainNames.add(matchedBpb.plainBottleName || matchedBpb.bottleName);
      } else {
        companyPlainNames.add(raw);
      }
    });

    const companyList = Array.from(companyPlainNames).sort();
    const masterList = (bottlePerBoxes || [])
      .map((b) => (b.plainBottleName || b.bottleName || '').trim())
      .filter(Boolean)
      .filter((name) => !companyPlainNames.has(name))
      .sort();

    return [
      ...companyList.map((name) => ({
        value: name,
        label: name,
        sublabel: companyBottleSpecs.length > 0 ? 'Company Bottle' : '',
      })),
      ...masterList.map((name) => ({
        value: name,
        label: name,
        sublabel: 'Master Bottle',
      })),
    ];
  }, [companyBottleSpecs, bottlePerBoxes]);

  // Helper to fetch variants for a plain bottle
  const loadVariantsForBottle = async (bottleName) => {
    if (!bottleName || specVariantsCache[bottleName]) return;
    try {
      const res = await API.get('/variant', {
        params: {
          plainBottleName: bottleName,
          companyId: companyId || undefined,
          pagination: 'false',
        },
      });
      const vars = res.data?.data || [];
      setSpecVariantsCache((prev) => ({ ...prev, [bottleName]: vars }));
    } catch (err) {
      console.error('Failed to load variants for bottle:', err);
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
  const handleBottleSelect = async (gIdx, selectedBottleName) => {
    const updated = [...specGroups];
    const cleanName = (selectedBottleName || '').trim();

    if (cleanName) {
      updated[gIdx].plainBottle = cleanName;
      updated[gIdx].title = cleanName;

      // Match an underlying spec ID if one exists for this bottle
      const spec = companyBottleSpecs.find(
        (s) => (s.bottleName || s.name || '').trim().toLowerCase() === cleanName.toLowerCase()
      );
      updated[gIdx].bottleSpecId = spec ? spec._id : '';

      // Auto-fetch Unit from BottlePerBox master
      const autoUnit = findUnitPerBox(cleanName);
      if (autoUnit) {
        updated[gIdx].variantLines = updated[gIdx].variantLines.map((vl) => {
          const newLine = { ...vl, unit: vl.unit || autoUnit };
          const { total, box, boxCount } = calculateItemTotal(newLine);
          return { ...newLine, total, box, boxCount };
        });
      }

      // Load variants for this plain bottle
      await loadVariantsForBottle(cleanName);
    } else {
      updated[gIdx].plainBottle = '';
      updated[gIdx].title = '';
      updated[gIdx].bottleSpecId = '';
    }

    setSpecGroups(updated);
  };

  // When Variants are Multi-Selected
  const handleVariantMultiSelect = (gIdx, newVariantIds) => {
    const updated = [...specGroups];
    const group = updated[gIdx];
    const bottleKey = group.plainBottle || group.title || group.bottleSpecId;
    const variantsForSpec = specVariantsCache[bottleKey] || [];
    const autoUnit = findUnitPerBox(group.plainBottle || group.title) || '';

    group.selectedVariantIds = newVariantIds;

    // Map existing lines by variantId to preserve entered Box Details & Unit
    const existingByVar = {};
    group.variantLines.forEach((vl) => {
      if (vl.variantId) {
        existingByVar[vl.variantId] = vl;
      }
    });

    const newLines = [];
    newVariantIds.forEach((vId) => {
      if (existingByVar[vId]) {
        newLines.push(existingByVar[vId]);
      } else {
        const variant = variantsForSpec.find((v) => v._id === vId);
        let formattedDesc = '';
        if (variant) {
          const shade = variant.coatingShade ? variant.coatingShade.trim() : '';
          const name = variant.variantName ? variant.variantName.trim() : '';
          const color =
            variant.detectedTextColor &&
            variant.detectedTextColor !== 'Not Detected' &&
            variant.detectedTextColor !== 'Analysis Failed' &&
            variant.detectedTextColor !== 'Detection Failed'
              ? variant.detectedTextColor.trim()
              : '';
          formattedDesc = [shade, name, color].filter(Boolean).join('-');
        }

        newLines.push({
          id: 'line_' + Math.random().toString(36).substr(2, 9),
          variantId: vId,
          materialCode: existingByVar[vId]?.materialCode || '',
          description: formattedDesc,
          box: '',
          fullBox: '',
          looseBox: '1',
          looseQty: '',
          unit: autoUnit,
          total: '',
          boxCount: 0,
          remarks: '',
        });
      }
    });

    // If no variants selected, provide 1 blank line so user can type manually
    if (newLines.length === 0) {
      const defaultUnit = group.variantLines[0]?.unit || autoUnit || '';
      newLines.push({
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
    }

    group.variantLines = newLines;
    setSpecGroups(updated);
  };

  // Change individual field in a variant line
  const handleVariantLineChange = (gIdx, lineIdx, field, value) => {
    const updated = [...specGroups];
    const line = updated[gIdx].variantLines[lineIdx];
    line[field] = value;

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

  // Add an extra line under the same Bottle Spec
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

  // Remove a variant line
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
      group.selectedVariantIds = [];
      setSpecGroups(updated);
      return;
    }

    if (removedLine.variantId) {
      group.selectedVariantIds = group.selectedVariantIds.filter((id) => id !== removedLine.variantId);
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

  // Add a new Bottle Spec group
  const addSpecGroup = () => {
    setSpecGroups((prev) => [
      ...prev,
      {
        id: 'grp_' + Math.random().toString(36).substr(2, 9),
        bottleSpecId: '',
        title: '',
        selectedVariantIds: [],
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

  // Remove an entire Bottle Spec group
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

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!challanNo.trim()) {
      return Swal.fire('Error', 'Delivery Challan No is required', 'warning');
    }
    if (!companyId) {
      return Swal.fire('Error', 'Please select a Company', 'warning');
    }

    const payloadItems = [];
    specGroups.forEach((g) => {
      g.variantLines.forEach((vl) => {
        if (vl.description && vl.description.trim()) {
          payloadItems.push({
            bottleSpecId: g.bottleSpecId || undefined,
            variantId: vl.variantId || undefined,
            title: g.title,
            materialCode: vl.materialCode ? vl.materialCode.trim() : '',
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
      challanType: 'shayoona',
      challanNo: challanNo.trim(),
      challanDate,
      challanTime,
      buyersOrderNo,
      poNo: buyersOrderNo,
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

    dispatch(createDeliveryChallan(payload)).then((res) => {
      if (!res.error) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Delivery Challan #${challanNo} created successfully!`,
          showCancelButton: true,
          confirmButtonText: 'Print / View Challan',
          cancelButtonText: 'Back to List',
        }).then((result) => {
          if (result.isConfirmed && res.payload?.data?._id) {
            navigate(`/delivery-challan/shayoona/view/${res.payload.data._id}`);
          } else {
            navigate('/delivery-challan/shayoona');
          }
        });
      } else {
        Swal.fire('Error!', res.payload || 'Failed to create Delivery Challan.', 'error');
      }
    });
  };

  const companyOptions = companies.map((c) => ({
    value: c._id,
    label: c.name,
  }));

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link
          to="/delivery-challan/shayoona"
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
          <h1 className="page-title">New Shayona Delivery Challan</h1>
          <p className="page-subtitle">
            Create an official delivery challan with automated Bottle Spec, Variant and Unit/Box lookup
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* SECTION 1: Challan Meta & Company Selection */}
        <div className="dash-card mb-4">
          <div className="dash-card-header bg-white p-3 border-bottom d-flex align-items-center gap-2">
            <i className="bi bi-receipt text-primary fs-5" />
            <h5 className="mb-0 fw-bold">1. Challan & Company Details</h5>
          </div>
          <div className="dash-card-body p-4">
            <div className="row g-3">
              {/* Company Selection */}
              <div className="col-md-6">
                <label className="form-label fw-600 small text-uppercase text-muted">
                  Select Company <span className="text-danger">*</span>
                </label>
                <SearchableSelect
                  options={companyOptions}
                  value={companyId}
                  onChange={handleCompanyChange}
                  placeholder="-- Select Company --"
                />
                {companyId && (
                  <div className="small text-muted mt-1">
                    <i className="bi bi-info-circle me-1 text-primary" />
                    Loaded {companyAddresses.length} addresses and {companyBottleSpecs.length} bottle specs for this company.
                  </div>
                )}
              </div>

              {/* Challan No */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">
                  Delivery Challan No <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control custom-input-field font-monospace fw-bold"
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  placeholder="e.g. 806"
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

              {/* Time */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Time</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={challanTime}
                  onChange={(e) => setChallanTime(e.target.value)}
                  placeholder="e.g. 5.30 PM"
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* Buyer's Order / P.O. No */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Buyer's Order / P.O. No</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={buyersOrderNo}
                  onChange={(e) => setBuyersOrderNo(e.target.value)}
                  placeholder="e.g. 7300302293"
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* P.O. Date */}
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

              {/* Vehicle No */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Vehicle No</label>
                <input
                  type="text"
                  className="form-control custom-input-field font-monospace text-uppercase"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                  placeholder="e.g. GJ 27 U 2334"
                  style={{ borderRadius: 12 }}
                />
              </div>

              {/* LR No */}
              <div className="col-md-3 col-sm-6">
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

              {/* Dispatch Through */}
              <div className="col-md-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Dispatch Through</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={dispatchThrough}
                  onChange={(e) => setDispatchThrough(e.target.value)}
                  placeholder="e.g. VRL Logistics, Direct Truck, Courier"
                  style={{ borderRadius: 12 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Billed To and Shipped To Address Selection */}
        <div className="dash-card mb-4">
          <div className="dash-card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-geo-alt text-primary fs-5" />
              <h5 className="mb-0 fw-bold">2. Address Details (Billed To & Shipped To)</h5>
            </div>
            {companyId && (
              <Link
                to={`/company-addresses/add?companyId=${companyId}`}
                target="_blank"
                className="btn btn-sm btn-outline-primary"
              >
                <i className="bi bi-plus-lg me-1" /> Add Address for {companyName}
              </Link>
            )}
          </div>
          <div className="dash-card-body p-4">
            {!companyId ? (
              <div className="alert alert-info d-flex align-items-center gap-2 mb-0">
                <i className="bi bi-info-circle fs-5" />
                <span>Please select a Company above to view and choose its Billed To and Shipped To addresses.</span>
              </div>
            ) : (
              <div className="row g-4">
                {/* BILLED TO BOX */}
                <div className="col-md-6 border-end">
                  <div className="p-3 bg-light rounded-3 border">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <h6 className="fw-bold text-primary mb-0">
                        <i className="bi bi-building me-1" /> BILLED TO
                      </h6>
                      <span className="badge bg-primary text-white">Billing</span>
                    </div>

                    <div className="mb-3">
                      <label className="form-label small fw-600 text-muted">Select Company Address</label>
                      <select
                        className="form-select custom-input-field"
                        value={billedToAddressId}
                        onChange={(e) => handleBilledToChange(e.target.value)}
                        style={{ borderRadius: 10 }}
                      >
                        {companyAddresses.length === 0 ? (
                          <option value="">No registered addresses for this company</option>
                        ) : (
                          companyAddresses.map((addr) => (
                            <option key={addr._id} value={addr._id}>
                              {addr.addressType} - {addr.addressTitle || addr.addressLine1} ({addr.city})
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="small">
                      <div className="mb-2">
                        <label className="text-muted fw-600">Company / Factory Name</label>
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
                      <div className="mb-2">
                        <label className="text-muted fw-600">Address Line 2</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={billedTo.addressLine2}
                          onChange={(e) => setBilledTo({ ...billedTo, addressLine2: e.target.value })}
                        />
                      </div>
                      <div className="row g-2 mb-2">
                        <div className="col-7">
                          <label className="text-muted fw-600">Taluka / City / Dist</label>
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
                      <div className="row g-2">
                        <div className="col-7">
                          <label className="text-muted fw-600">GSTIN NO</label>
                          <input
                            type="text"
                            className="form-control form-control-sm font-monospace text-uppercase"
                            value={billedTo.gstNo}
                            onChange={(e) => setBilledTo({ ...billedTo, gstNo: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="col-5">
                          <label className="text-muted fw-600">State & Code</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={`${billedTo.state || 'GUJARAT'}, CODE: ${billedTo.stateCode || '24'}`}
                            onChange={(e) => setBilledTo({ ...billedTo, state: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SHIPPED TO BOX */}
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-3 border">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <h6 className="fw-bold text-info mb-0">
                        <i className="bi bi-truck me-1" /> SHIPPED TO
                      </h6>
                      <div className="form-check form-switch mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="sameAsBilledSwitch"
                          checked={sameAsBilledTo}
                          onChange={(e) => toggleSameAsBilledTo(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <label className="form-check-label small fw-600 ms-1" htmlFor="sameAsBilledSwitch">
                          Same as Billed To
                        </label>
                      </div>
                    </div>

                    {!sameAsBilledTo && (
                      <div className="mb-3">
                        <label className="form-label small fw-600 text-muted">Select Delivery / Shipping Address</label>
                        <select
                          className="form-select custom-input-field"
                          value={shippedToAddressId}
                          onChange={(e) => handleShippedToChange(e.target.value)}
                          style={{ borderRadius: 10 }}
                        >
                          {companyAddresses.map((addr) => (
                            <option key={addr._id} value={addr._id}>
                              {addr.addressType} - {addr.addressTitle || addr.addressLine1} ({addr.city})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="small">
                      <div className="mb-2">
                        <label className="text-muted fw-600">Company / Factory Name</label>
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
                      <div className="mb-2">
                        <label className="text-muted fw-600">Address Line 2</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={shippedTo.addressLine2}
                          onChange={(e) => setShippedTo({ ...shippedTo, addressLine2: e.target.value })}
                          disabled={sameAsBilledTo}
                        />
                      </div>
                      <div className="row g-2 mb-2">
                        <div className="col-7">
                          <label className="text-muted fw-600">Taluka / City / Dist</label>
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
                      <div className="row g-2">
                        <div className="col-7">
                          <label className="text-muted fw-600">GSTIN NO</label>
                          <input
                            type="text"
                            className="form-control form-control-sm font-monospace text-uppercase"
                            value={shippedTo.gstNo}
                            onChange={(e) => setShippedTo({ ...shippedTo, gstNo: e.target.value.toUpperCase() })}
                            disabled={sameAsBilledTo}
                          />
                        </div>
                        <div className="col-5">
                          <label className="text-muted fw-600">State & Code</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={`${shippedTo.state || 'GUJARAT'}, CODE: ${shippedTo.stateCode || '24'}`}
                            disabled={sameAsBilledTo}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Line Items with Bottle Spec, Variant & Unit/Box Lookup */}
        <div className="dash-card mb-4" style={{ minHeight: 480 }}>
          <div className="dash-card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-box-seam text-primary fs-5" />
                <h5 className="mb-0 fw-bold">3. Challan Items</h5>
              </div>
              <small className="text-muted">
                Select Plain Bottle & multi-select Variants. Each variant has its own Box Details and Unit.
              </small>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-accent"
              onClick={addSpecGroup}
            >
              <i className="bi bi-plus-circle me-1" /> Add Plain Bottle
            </button>
          </div>

          <div className="dash-card-body p-3" style={{ minHeight: 400 }}>
            <div className="table-responsive" style={{ minHeight: 360, paddingBottom: 180, overflowX: 'auto', overflowY: 'visible' }}>
              <table className="table table-bordered align-middle mb-0">
                <thead className="table-light text-center small text-uppercase">
                  <tr>
                    <th style={{ width: 45 }}>#</th>
                    <th style={{ width: 220 }}>Plain Bottle</th>
                    <th style={{ width: 230 }}>Select Variant(s)</th>
                    <th style={{ width: 135 }}>Material Code</th>
                    <th style={{ minWidth: 260 }}>Description (Coating-Variant-Color)</th>
                    <th style={{ width: 190 }}>Box Details</th>
                    <th style={{ width: 90 }}>Unit</th>
                    <th style={{ width: 110 }}>Total Qty</th>
                    <th style={{ width: 55 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {specGroups.map((group, gIdx) => {
                    const bottleKey = group.plainBottle || group.title || group.bottleSpecId;
                    const variantsForThisBottle = bottleKey
                      ? specVariantsCache[bottleKey] || []
                      : [];

                    const variantOptions = variantsForThisBottle.map((v) => {
                      const label = [
                        v.coatingShade,
                        v.variantName,
                        v.detectedTextColor &&
                        v.detectedTextColor !== 'Not Detected' &&
                        v.detectedTextColor !== 'Analysis Failed'
                          ? v.detectedTextColor
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' - ');
                      return {
                        value: v._id,
                        label: label || v.variantName || 'Unnamed Variant',
                        sublabel: v.variantName && v.variantName !== label ? v.variantName : '',
                      };
                    });

                    const numLines = group.variantLines.length;

                    return group.variantLines.map((line, lIdx) => (
                      <tr key={line.id || `${gIdx}-${lIdx}`}>
                        {/* Sr No (Spanning all variant lines of this bottle) */}
                        {lIdx === 0 && (
                          <td
                            rowSpan={numLines}
                            className="text-center fw-bold text-muted align-top pt-3"
                            style={{ background: '#fdfdfe' }}
                          >
                            {gIdx + 1}
                          </td>
                        )}

                        {/* Plain Bottle Selection (Spanning all variant lines) */}
                        {lIdx === 0 && (
                          <td
                            rowSpan={numLines}
                            className="align-top"
                            style={{ background: '#fdfdfe' }}
                          >
                            <SearchableSelect
                              options={plainBottleOptions}
                              value={group.plainBottle || group.title}
                              onChange={(val) => handleBottleSelect(gIdx, val)}
                              placeholder="-- Select Plain Bottle --"
                              style={{
                                borderRadius: 8,
                                minHeight: 38,
                                padding: '6px 10px',
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            />
                            <input
                              type="text"
                              className="form-control mt-1 text-muted small"
                              value={group.title}
                              onChange={(e) => {
                                const updated = [...specGroups];
                                updated[gIdx].title = e.target.value;
                                setSpecGroups(updated);
                              }}
                              placeholder="Title override"
                              title="Title displayed on Challan Header"
                              style={{ height: 30, fontSize: 12, borderRadius: 6 }}
                            />
                            {specGroups.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-xs btn-outline-danger mt-2 w-100 py-1"
                                style={{ fontSize: 11, borderRadius: 6 }}
                                onClick={() => removeSpecGroup(gIdx)}
                                title="Delete this entire Plain Bottle block"
                              >
                                <i className="bi bi-trash me-1" /> Remove Block
                              </button>
                            )}
                          </td>
                        )}

                        {/* Multi-Select Variant with Search (Spanning all variant lines) */}
                        {lIdx === 0 && (
                          <td
                            rowSpan={numLines}
                            className="align-top"
                            style={{ background: '#fdfdfe' }}
                          >
                            {group.plainBottle || group.title ? (
                              <SearchableMultiSelect
                                options={variantOptions}
                                selectedValues={group.selectedVariantIds}
                                onChange={(newVals) => handleVariantMultiSelect(gIdx, newVals)}
                                placeholder="-- Pick Variant(s) --"
                                style={{
                                  borderRadius: 8,
                                  minHeight: 38,
                                  padding: '6px 10px',
                                  fontSize: 13,
                                }}
                              />
                            ) : (
                              <div className="text-muted small fst-italic text-center py-2">
                                Select Plain Bottle first
                              </div>
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

                        {/* Description (Coating shade-Variant name-Text color) */}
                        <td>
                          <input
                            type="text"
                            className="form-control text-uppercase fw-semibold"
                            placeholder="e.g. PLAIN-DRAMA QUEEN-ROSE GOLD FOIL"
                            value={line.description}
                            onChange={(e) =>
                              handleVariantLineChange(gIdx, lIdx, 'description', e.target.value)
                            }
                            required
                            style={{ height: 38, fontSize: 13, borderRadius: 8 }}
                          />
                        </td>

                        {/* Box Details (Multiple based on variant) */}
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
                                title="Full Boxes (e.g. 60)"
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
                                title="Loose Pieces (e.g. 28)"
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

                        {/* Unit (Pcs per Box, multiple based on variant) */}
                        <td>
                          <input
                            type="number"
                            className="form-control text-center font-monospace"
                            placeholder="42"
                            value={line.unit}
                            onChange={(e) =>
                              handleVariantLineChange(gIdx, lIdx, 'unit', e.target.value)
                            }
                            title="Auto-filled from BottlePerBox master"
                            required
                            style={{ height: 38, fontSize: 13, borderRadius: 8 }}
                          />
                        </td>

                        {/* Total Qty (Per variant line) */}
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

                        {/* Action (Delete variant line) */}
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger p-1 rounded-2"
                            onClick={() => removeVariantLine(gIdx, lIdx)}
                            title="Remove this line"
                          >
                            <i className="bi bi-trash" />
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

        {/* SECTION 4: Checks & Submit */}
        <div className="dash-card mb-4">
          <div className="dash-card-body p-4">
            <div className="row g-3 align-items-center">
              <div className="col-md-6">
                <label className="form-label small fw-600 text-muted">Checked By</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  placeholder="e.g. Quality Supervisor"
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
                  placeholder="Additional notes, instructions..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{ borderRadius: 12 }}
                />
              </div>
            </div>

            <div className="d-flex gap-3 mt-4 pt-3 border-top user-form-actions">
              <button
                type="submit"
                className="btn-accent px-5 py-3 flex-grow-1"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    Saving Delivery Challan...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle me-2" /> Save Delivery Challan
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => navigate('/delivery-challan/shayoona')}
                className="btn-ghost px-5 py-3"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
