import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  createDeliveryChallan,
  fetchNextChallanNo,
} from '../../../redux/slices/deliveryChallanSlice';
import { fetchCompanies } from '../../../redux/slices/companySlice';
import Select from 'react-select';
import SearchableSelect from '../../../components/SearchableSelect';
import API from '../../../services/api';
import Swal from 'sweetalert2';

export default function AddMcnoreChallan() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { companies = [] } = useSelector((state) => state.companies);
  const { nextNo = '955', loading } = useSelector((state) => state.deliveryChallans);

  // Mode: 'without_po' or 'with_po' (Default to 'with_po' as per Mcnore standard)
  const [poMode, setPoMode] = useState('with_po');

  // Form states
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState(new Date().toISOString().split('T')[0]);
  const [challanTime, setChallanTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
  const [taxInvoiceNo, setTaxInvoiceNo] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState('');
  const [poNo, setPoNo] = useState('');
  const [poDate, setPoDate] = useState('');
  const [dispatchThrough, setDispatchThrough] = useState('SHREE SANGAM ROADLINES');
  const [transporter, setTransporter] = useState('SHREE SANGAM ROADLINES');
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');

  // Company and Addresses
  const [companyId, setCompanyId] = useState('6a17d6fae933dc474615eb94');
  const [companyName, setCompanyName] = useState('MCNORE');
  const [companyAddresses, setCompanyAddresses] = useState([]);

  // Billed To Address
  const [billedToAddressId, setBilledToAddressId] = useState('');
  const [billedTo, setBilledTo] = useState({
    name: 'MCNROE CONSUMER PRODUCT PVT.LTD',
    addressTitle: 'BLOCK No.: 128,C/O SHAYONA GLASS DÉCOR PVT LTD ,VAVLI, BHARUCH',
    addressLine1: 'SWAMINARAYAN TEMPLE JAMBUSAR-392150',
    addressLine2: '',
    city: 'BHARUCH',
    state: 'GUJARAT',
    stateCode: '24',
    pincode: '392150',
    gstNo: '24AABCM5674J1ZA',
  });

  // Shipped To Address
  const [sameAsBilledTo, setSameAsBilledTo] = useState(true);
  const [shippedToAddressId, setShippedToAddressId] = useState('');
  const [shippedTo, setShippedTo] = useState({
    name: 'MCNROE CONSUMER PRODUCT PVT.LTD',
    addressTitle: 'BLOCK No.: 128,C/O SHAYONA GLASS DÉCOR PVT LTD ,VAVLI, BHARUCH',
    addressLine1: 'SWAMINARAYAN TEMPLE JAMBUSAR-392150',
    addressLine2: '',
    city: 'BHARUCH',
    state: 'GUJARAT',
    stateCode: '24',
    pincode: '392150',
    gstNo: '24AABCM5674J1ZA',
  });

  // Bottle Specs for Mcnore
  const [companyBottleSpecs, setCompanyBottleSpecs] = useState([]);
  const [loadingSpecs, setLoadingSpecs] = useState(false);

  // Bottle Per Box master
  const [bottlePerBoxes, setBottlePerBoxes] = useState([]);

  // Cache variants per bottleSpecId: { [specId]: [variant1, variant2, ...] }
  const [specVariantsCache, setSpecVariantsCache] = useState({});

  // Items grouped by Bottle Specification
  const [specGroups, setSpecGroups] = useState([
    {
      id: 'grp_1',
      bottleSpecId: '',
      title: '',
      hsn: '70109000',
      variantLines: [
        {
          id: 'line_1',
          variantId: '',
          materialCode: '',
          description: '',
          boxFormatType: 'loose', // 'single' or 'loose'
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

  // Checked and remarks
  const [checkedBy, setCheckedBy] = useState('');
  const [checkedDate, setCheckedDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkedTime, setCheckedTime] = useState('');
  const [remarks, setRemarks] = useState('');

  // Initial Load: Companies, Next DC No for Mcnore, BottlePerBox
  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchNextChallanNo('mcnore'));

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

  // Auto-detect and select Mcnore company on load
  useEffect(() => {
    const defaultMcnoreId = '6a17d6fae933dc474615eb94';
    if (companies && companies.length > 0) {
      const found = companies.find(
        (c) => c.name && (c.name.trim().toUpperCase() === 'MCNORE' || c.name.trim().toUpperCase() === 'MCNROE')
      );
      const targetId = found ? String(found._id) : defaultMcnoreId;
      setCompanyId(targetId);
      setCompanyName(found ? found.name : 'MCNORE');
      handleCompanyChange(targetId);
    } else {
      handleCompanyChange(defaultMcnoreId);
    }
  }, [companies]);

  // Fetch addresses and bottle specs when company changes
  const handleCompanyChange = async (selectedId) => {
    const idStr = String(selectedId || '');
    setCompanyId(idStr);
    const selectedComp = (companies || []).find((c) => String(c._id) === idStr);
    const compName = selectedComp ? selectedComp.name : 'MCNORE';
    setCompanyName(compName);

    if (!idStr) {
      setCompanyAddresses([]);
      setCompanyBottleSpecs([]);
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
  const fetchVariantsForBottle = async (bottleName) => {
    if (!bottleName) return [];
    if (specVariantsCache[bottleName]) return specVariantsCache[bottleName];

    try {
      const res = await API.get('/variant', {
        params: {
          plainBottleName: bottleName,
          companyId: companyId || undefined,
          pagination: 'false',
        },
      });
      const variants = res.data?.data || [];
      setSpecVariantsCache((prev) => ({ ...prev, [bottleName]: variants }));
      return variants;
    } catch (err) {
      console.error(`Failed to load variants for bottle ${bottleName}:`, err);
      return [];
    }
  };

  // Helper to lookup Unit from BottlePerBox master
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

  // Handle Spec / Plain Bottle Group Changes
  const handleGroupBottleChange = async (grpIdx, selectedBottleName) => {
    const newGroups = [...specGroups];
    const grp = newGroups[grpIdx];
    const cleanName = (selectedBottleName || '').trim();

    grp.plainBottle = cleanName;
    grp.title = cleanName;

    const foundSpec = companyBottleSpecs.find(
      (s) => (s.bottleName || s.name || '').trim().toLowerCase() === cleanName.toLowerCase()
    );
    grp.bottleSpecId = foundSpec ? foundSpec._id : '';

    const suggestedUnit = lookupUnitForBottle(cleanName);
    const variants = await fetchVariantsForBottle(cleanName);

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
        unit: updatedUnit,
        ...rec,
      };
    });

    setSpecGroups(newGroups);
  };

  // Recalculate line total, box count, and taxable values
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
      // Single / custom box number
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

  // Handle Variant Line Changes
  const handleVariantLineChange = (grpIdx, lineIdx, field, value) => {
    const newGroups = [...specGroups];
    const line = newGroups[grpIdx].variantLines[lineIdx];
    line[field] = value;

    if (field === 'variantId') {
      const bottleKey = newGroups[grpIdx].plainBottle || newGroups[grpIdx].title || newGroups[grpIdx].bottleSpecId;
      const variants = specVariantsCache[bottleKey] || [];
      const foundVar = variants.find((v) => v._id === value);
      if (foundVar) {
        line.description = foundVar.variantName || foundVar.name || '';
      }
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

  // Add & Remove Spec Groups
  const addSpecGroup = () => {
    setSpecGroups([
      ...specGroups,
      {
        id: `grp_${Date.now()}`,
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
      return Swal.fire('Info', 'At least one Bottle Specification group is required.', 'info');
    }
    setSpecGroups(specGroups.filter((_, idx) => idx !== grpIdx));
  };

  // Add & Remove Variant Lines inside a group
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

  // Company dropdown options - always guaranteed to include MCNORE
  const companyOptions = useMemo(() => {
    let list = (companies || []).map((c) => ({
      value: String(c._id),
      label: c.name,
    }));
    // If companyId is set, ensure it is represented in the list
    if (companyId && !list.some((c) => String(c.value) === String(companyId))) {
      list.unshift({
        value: String(companyId),
        label: companyName || 'MCNORE',
      });
    }
    // If companies are still loading or empty, fallback with default MCNORE option
    if (list.length === 0) {
      list = [{ value: '6a17d6fae933dc474615eb94', label: 'MCNORE' }];
    }
    return list;
  }, [companies, companyId, companyName]);

  // Calculated Totals
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
        // In Without PO: SGST 9% + CGST 9% on Job Work Charges
        if (jwVal > 0) {
          sgstVal = parseFloat((jwVal * 0.09).toFixed(2));
          cgstVal = parseFloat((jwVal * 0.09).toFixed(2));
        }
        gTotal = parseFloat((gbVal + jwVal + sgstVal + cgstVal).toFixed(2));
      } else {
        // In With PO: IGST 18% (if interstate) or CGST+SGST
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

  // Submit Handler
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!challanNo || !challanNo.trim()) {
      return Swal.fire('Error', 'Please enter a valid DC Number', 'warning');
    }

    if (poMode === 'with_po' && (!poNo || !poNo.trim())) {
      return Swal.fire('Error', 'PO Number is required in "With PO" mode', 'warning');
    }

    const payloadItems = [];
    specGroups.forEach((g) => {
      g.variantLines.forEach((vl) => {
        if (vl.description && vl.description.trim()) {
          payloadItems.push({
            title: g.title,
            hsn: g.hsn || (poMode === 'with_po' ? '70109000' : '7010'),
            materialCode: vl.materialCode || '',
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

    dispatch(createDeliveryChallan(payload)).then((res) => {
      if (!res.error) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Mcnore Delivery Challan #${challanNo} (${poMode === 'with_po' ? 'With PO' : 'Without PO'}) created successfully!`,
          showCancelButton: true,
          confirmButtonText: 'Print / View Challan',
          cancelButtonText: 'Back to List',
        }).then((result) => {
          if (result.isConfirmed && res.payload?.data?._id) {
            navigate(`/delivery-challan/mcnore/view/${res.payload.data._id}`);
          } else {
            navigate('/delivery-challan/mcnore');
          }
        });
      } else {
        Swal.fire('Error!', res.payload || 'Failed to create Mcnore Delivery Challan.', 'error');
      }
    });
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
          <h1 className="page-title">New Mcnore Delivery Challan</h1>
          <p className="page-subtitle">
            Generate official Mcnroe Consumer Products delivery challan (choose Without PO or With PO)
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
              {/* Company Selection with MCNORE selected */}
              <div className="col-lg-5 col-md-12">
                <label className="form-label fw-bold small text-uppercase text-muted d-block mb-2">
                  <i className="bi bi-building me-2 text-primary fs-6" />
                  Select Company <span className="text-danger">*</span>
                </label>
                <SearchableSelect
                  options={companyOptions}
                  value={companyId}
                  onChange={(val) => handleCompanyChange(val)}
                  placeholder="-- Select Company --"
                  disabled={true}
                  displayValue={companyName || 'MCNORE'}
                />
                <div className="small text-muted mt-2 d-flex align-items-center gap-1">
                  <i className="bi bi-check-circle-fill text-success" />
                  <span>Selected Company: </span>
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
                  {/* Option 1: Without PO */}
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
                        id="radioWithoutPo"
                        className="form-check-input mt-0 fs-5"
                        checked={poMode === 'without_po'}
                        onChange={() => setPoMode('without_po')}
                      />
                      <div className="flex-grow-1">
                        <label htmlFor="radioWithoutPo" className="fw-bold d-block text-dark cursor-pointer mb-0">
                          Without PO
                        </label>
                        <small className="text-muted d-block" style={{ fontSize: '11px' }}>
                          Format 1 (Invoice No &amp; Date)
                        </small>
                      </div>
                      <span className="badge bg-secondary-subtle text-secondary border">Standard</span>
                    </div>
                  </div>

                  {/* Option 2: With PO */}
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
                        id="radioWithPo"
                        className="form-check-input mt-0 fs-5"
                        checked={poMode === 'with_po'}
                        onChange={() => setPoMode('with_po')}
                      />
                      <div className="flex-grow-1">
                        <label htmlFor="radioWithPo" className="fw-bold d-block text-dark cursor-pointer mb-0">
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
            <span className="badge bg-light text-muted border">
              Mode: {poMode === 'with_po' ? 'With PO' : 'Without PO'}
            </span>
          </div>

          <div className="card-body p-4">
            <div className="row g-3">
              {/* Conditional PO vs Invoice fields */}
              {poMode === 'with_po' ? (
                <>
                  <div className="col-md-3">
                    <label className="form-label fw-bold small text-success">
                      PO No <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm border-success shadow-none"
                      placeholder="e.g. 44028764"
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
                      placeholder="Optional Invoice No"
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
                      placeholder="Enter Invoice No (if any)"
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

              {/* DC No & Dates */}
              <div className="col-md-3">
                <label className="form-label fw-bold small">
                  DC No. <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none fw-bold"
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  placeholder="e.g. 955"
                  required
                />
              </div>

              <div className="col-md-3">
                <label className="form-label fw-bold small">
                  Dis Date <span className="text-danger">*</span>
                </label>
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
                  placeholder="e.g. 4.00 PM"
                  value={challanTime}
                  onChange={(e) => setChallanTime(e.target.value)}
                />
              </div>

              <div className="col-md-3">
                <label className="form-label fw-bold small">Vehicle No.</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  placeholder="e.g. GJ 06 BY 4203"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label fw-bold small">Transporter</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  placeholder="e.g. SHREE SANGAM ROADLINES"
                  value={transporter}
                  onChange={(e) => {
                    setTransporter(e.target.value);
                    setDispatchThrough(e.target.value);
                  }}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label fw-bold small">LR No. (Optional)</label>
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  placeholder="LR Number"
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
            <div className="form-check form-switch m-0">
              <input
                className="form-check-input"
                type="checkbox"
                id="sameAsBilledCheck"
                checked={sameAsBilledTo}
                onChange={(e) => {
                  setSameAsBilledTo(e.target.checked);
                  if (e.target.checked) setShippedTo({ ...billedTo });
                }}
              />
              <label className="form-check-label small fw-500" htmlFor="sameAsBilledCheck">
                Shipped To Same as Billed To
              </label>
            </div>
          </div>

          <div className="card-body p-4">
            <div className="row g-4">
              {/* BILLED TO */}
              <div className="col-md-6 border-end">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="fw-bold text-dark">BILLED TO</span>
                  {companyAddresses.length > 0 && (
                    <select
                      className="form-select form-select-sm shadow-none w-auto"
                      value={billedToAddressId}
                      onChange={(e) => {
                        const sel = companyAddresses.find((a) => a._id === e.target.value);
                        if (sel) {
                          setBilledToAddressId(sel._id);
                          const mapped = mapAddressToState(companyName, sel);
                          setBilledTo(mapped);
                          if (sameAsBilledTo) setShippedTo(mapped);
                        }
                      }}
                    >
                      {companyAddresses.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.addressTitle || a.city || 'Address'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="p-3 bg-white border border-light-subtle rounded-3">
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2 fw-bold"
                    value={billedTo.name}
                    onChange={(e) => setBilledTo({ ...billedTo, name: e.target.value })}
                    placeholder="Company Name"
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

              {/* SHIPPED TO */}
              <div className="col-md-6">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="fw-bold text-dark">
                    {poMode === 'with_po' ? 'SHIPPED TO (PLACE OF SUPPLY)' : 'SHIPPED TO'}
                  </span>
                  {!sameAsBilledTo && companyAddresses.length > 0 && (
                    <select
                      className="form-select form-select-sm shadow-none w-auto"
                      value={shippedToAddressId}
                      onChange={(e) => {
                        const sel = companyAddresses.find((a) => a._id === e.target.value);
                        if (sel) {
                          setShippedToAddressId(sel._id);
                          setShippedTo(mapAddressToState(companyName, sel));
                        }
                      }}
                    >
                      {companyAddresses.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.addressTitle || a.city || 'Address'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="p-3 bg-white border border-light-subtle rounded-3">
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2 fw-bold"
                    value={shippedTo.name}
                    onChange={(e) => setShippedTo({ ...shippedTo, name: e.target.value })}
                    placeholder="Company Name"
                    disabled={sameAsBilledTo}
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2"
                    value={shippedTo.addressTitle}
                    onChange={(e) => setShippedTo({ ...shippedTo, addressTitle: e.target.value })}
                    placeholder="Address Line / Title"
                    disabled={sameAsBilledTo}
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2"
                    value={shippedTo.addressLine1}
                    onChange={(e) => setShippedTo({ ...shippedTo, addressLine1: e.target.value })}
                    placeholder="Address Line 1"
                    disabled={sameAsBilledTo}
                  />
                  <div className="row g-2 mb-2">
                    <div className="col-6">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={shippedTo.city}
                        onChange={(e) => setShippedTo({ ...shippedTo, city: e.target.value })}
                        placeholder="City"
                        disabled={sameAsBilledTo}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={shippedTo.pincode}
                        onChange={(e) => setShippedTo({ ...shippedTo, pincode: e.target.value })}
                        placeholder="Pincode"
                        disabled={sameAsBilledTo}
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={shippedTo.gstNo}
                    onChange={(e) => setShippedTo({ ...shippedTo, gstNo: e.target.value })}
                    placeholder="GSTIN No"
                    disabled={sameAsBilledTo}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Plain Bottles & Quantities */}
        <div className="card border border-light-subtle shadow-sm rounded-3 mb-4 bg-white">
          <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <div>
              <h6 className="fw-bold text-dark mb-0">
                <i className="bi bi-box-seam-fill text-primary me-2" />
                4. Plain Bottles &amp; Quantities
              </h6>
              <small className="text-muted">
                {poMode === 'without_po'
                  ? 'Each item outputs a Glass Bottle (HSN 7010) row and Job Work Charges (HSN 9988) row'
                  : 'Each item outputs a Material Code row and Glass Bottle spec row'}
              </small>
            </div>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={addSpecGroup}>
              <i className="bi bi-plus-lg me-1" /> Add Plain Bottle
            </button>
          </div>

          <div className="card-body p-4">
            {specGroups.map((grp, grpIdx) => {
              const bottleKey = grp.plainBottle || grp.title || grp.bottleSpecId;
              const variants = bottleKey ? specVariantsCache[bottleKey] || [] : [];

              return (
                <div key={grp.id} className="mcnore-item-group border border-light-subtle rounded-3 mb-4 bg-white p-4 shadow-sm">
                  {/* Group Header: Plain Bottle Selector */}
                  <div className="row g-2 align-items-center mb-3 pb-3 border-bottom">
                    <div className="col-md-7">
                      <label className="form-label small fw-bold text-muted mb-1">
                        Plain Bottle
                      </label>
                      <Select
                        options={plainBottleOptions}
                        value={plainBottleOptions.find((option) => option.value === (grp.plainBottle || grp.title)) || null}
                        onChange={(selected) => handleGroupBottleChange(grpIdx, selected?.value || '')}
                        placeholder="Select Plain Bottle..."
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({ ...base, minHeight: 42, height: 'auto', alignItems: 'flex-start' }),
                          valueContainer: (base) => ({ ...base, minHeight: 40, flexWrap: 'wrap', whiteSpace: 'normal' }),
                          singleValue: (base) => ({ ...base, position: 'relative', top: 'auto', transform: 'none', maxWidth: '100%', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', wordBreak: 'break-word' }),
                        }}
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
                        minWidth: poMode === 'with_po' ? 1180 : 1160,
                        tableLayout: 'fixed',
                      }}
                    >
                      <thead className="table-light small text-uppercase">
                        <tr>
                          {poMode === 'with_po' && <th style={{ width: 115 }}>Material Code</th>}
                          <th style={{ width: 200 }}>Variant / Shade</th>
                          <th style={{ width: 210 }}>Description</th>
                          <th style={{ width: 190 }}>Boxes Calculation</th>
                          <th style={{ width: 105 }}>BottlePerBox</th>
                          <th style={{ width: 90 }}>Total Qty</th>
                          <th style={{ width: 95 }}>Rate</th>
                          {poMode === 'without_po' && <th style={{ width: 95 }}>JW Rate</th>}
                          <th style={{ width: 105 }}>Taxable Value</th>
                          <th style={{ width: 45 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {grp.variantLines.map((vl, lineIdx) => {
                          const variantOptions = variants.map((v) => {
                            const label = [
                              v.coatingShade,
                              v.variantName,
                              v.detectedTextColor && v.detectedTextColor !== 'Not Detected'
                                ? v.detectedTextColor
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' - ');
                            return {
                              value: v._id,
                              label: label || v.variantName || v.name,
                            };
                          });

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
                                <Select
                                  options={variantOptions}
                                  value={variantOptions.find((option) => option.value === vl.variantId) || null}
                                  onChange={(selected) =>
                                    handleVariantLineChange(grpIdx, lineIdx, 'variantId', selected?.value || '')
                                  }
                                  placeholder={!bottleKey ? 'Choose bottle first' : variants.length ? 'Choose variant...' : 'No preset variants'}
                                  isDisabled={!bottleKey || variants.length === 0}
                                  isClearable
                                  menuPortalTarget={document.body}
                                  menuPosition="fixed"
                                  menuPlacement="auto"
                                  styles={{
                                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                    control: (base) => ({ ...base, minWidth: 0, minHeight: 38, height: 'auto', alignItems: 'center', flexWrap: 'nowrap' }),
                                    valueContainer: (base) => ({
                                      ...base,
                                      flex: '1 1 0%',
                                      width: 0,
                                      minWidth: 0,
                                      overflow: 'visible',
                                      flexWrap: 'wrap',
                                      whiteSpace: 'normal',
                                    }),
                                    placeholder: (base) => ({ ...base, whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'break-word' }),
                                    singleValue: (base) => ({
                                      ...base,
                                      position: 'relative',
                                      top: 'auto',
                                      transform: 'none',
                                      maxWidth: '100%',
                                      margin: 0,
                                      whiteSpace: 'normal',
                                      overflow: 'visible',
                                      textOverflow: 'clip',
                                      wordBreak: 'normal',
                                      overflowWrap: 'break-word',
                                    }),
                                    indicatorsContainer: (base) => ({ ...base, flexShrink: 0, alignSelf: 'center' }),
                                    indicatorSeparator: () => ({ display: 'none' }),
                                    option: (base) => ({ ...base, whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'break-word' }),
                                  }}
                                />
                              </td>
                              <td data-label="Description">
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  style={{ fontSize: 12 }}
                                  placeholder="e.g. 175C BROWN - OUD IMPERIAL- ROSE GOLD FOIL"
                                  value={vl.description}
                                  onChange={(e) =>
                                    handleVariantLineChange(grpIdx, lineIdx, 'description', e.target.value)
                                  }
                                  required
                                />
                              </td>
                              <td data-label="Boxes Calculation">
                                <div className="d-flex align-items-center gap-1">
                                  <input
                                    type="number"
                                    className="form-control form-control-sm text-center"
                                    style={{ width: 78, minWidth: 78 }}
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
                                    style={{ width: 82, minWidth: 82 }}
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
                              <td data-label="Rate">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="form-control form-control-sm text-end"
                                  value={vl.rate}
                                  onChange={(e) =>
                                    handleVariantLineChange(grpIdx, lineIdx, 'rate', e.target.value)
                                  }
                                  placeholder="₹ Rate"
                                />
                              </td>
                              {poMode === 'without_po' && (
                                <td data-label="JW Rate">
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="form-control form-control-sm text-end"
                                    value={vl.jobWorkRate}
                                    onChange={(e) =>
                                      handleVariantLineChange(grpIdx, lineIdx, 'jobWorkRate', e.target.value)
                                    }
                                    placeholder="JW Rate"
                                  />
                                </td>
                              )}
                              <td data-label="Taxable Value" className="text-end fw-500">
                                {vl.taxableValue || vl.jobWorkTaxableValue ? (
                                  <div>
                                    {vl.taxableValue > 0 && <div>₹{vl.taxableValue}</div>}
                                    {vl.jobWorkTaxableValue > 0 && (
                                      <small className="text-muted d-block">JW: ₹{vl.jobWorkTaxableValue}</small>
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
                  <hr />
                  <small className="text-muted">
                    * If Rates are left blank, value fields will remain empty/unspecified on the final delivery challan.
                  </small>
                </div>
              </div>

              <div className="col-md-6">
                <div className="border rounded-3 p-3 bg-white shadow-sm">
                  <h6 className="fw-bold text-dark mb-3 border-bottom pb-2">
                    {poMode === 'without_po' ? 'Challan Summary (Without PO)' : 'Challan Summary (With PO)'}
                  </h6>

                  {poMode === 'without_po' ? (
                    <>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span>GLASS BOTTLE VALUE:</span>
                        <span className="fw-bold">
                          {glassBottleValue > 0 ? `₹${glassBottleValue.toLocaleString('en-IN')}` : '-'}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span>JOB WORK CHARGES VALUE:</span>
                        <span className="fw-bold">
                          {jobWorkChargesValue > 0 ? `₹${jobWorkChargesValue.toLocaleString('en-IN')}` : '-'}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span>JOB WORK CHARGES SGST@9%:</span>
                        <span className="fw-bold">
                          {sgst > 0 ? `₹${sgst.toLocaleString('en-IN')}` : '-'}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between mb-2 small">
                        <span>JOB WORK CHARGES CGST@9%:</span>
                        <span className="fw-bold">
                          {cgst > 0 ? `₹${cgst.toLocaleString('en-IN')}` : '-'}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between pt-2 border-top fw-bold text-primary">
                        <span>TOTAL:</span>
                        <span>{grandTotal > 0 ? `₹${grandTotal.toLocaleString('en-IN')}` : '-'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span>TAXABLE VALUE:</span>
                        <span className="fw-bold">
                          {glassBottleValue + jobWorkChargesValue > 0
                            ? `₹${(glassBottleValue + jobWorkChargesValue).toLocaleString('en-IN')}`
                            : '-'}
                        </span>
                      </div>
                      {igst > 0 ? (
                        <div className="d-flex justify-content-between mb-1 small">
                          <span>IGST@18%:</span>
                          <span className="fw-bold">₹{igst.toLocaleString('en-IN')}</span>
                        </div>
                      ) : (
                        <>
                          <div className="d-flex justify-content-between mb-1 small">
                            <span>SGST@9%:</span>
                            <span className="fw-bold">
                              {sgst > 0 ? `₹${sgst.toLocaleString('en-IN')}` : '-'}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-1 small">
                            <span>CGST@9%:</span>
                            <span className="fw-bold">
                              {cgst > 0 ? `₹${cgst.toLocaleString('en-IN')}` : '-'}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="d-flex justify-content-between pt-2 border-top fw-bold text-success">
                        <span>TOTAL:</span>
                        <span>{grandTotal > 0 ? `₹${grandTotal.toLocaleString('en-IN')}` : '-'}</span>
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
                  placeholder="Security Office / Verifier Name"
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
                  placeholder="e.g. 4.00 PM"
                  value={checkedTime}
                  onChange={(e) => setCheckedTime(e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-bold small">Remarks</label>
                <textarea
                  className="form-control form-control-sm shadow-none"
                  rows="2"
                  placeholder="Any special dispatch or packing remarks..."
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
                Creating...
              </>
            ) : (
              <>
                <i className="bi bi-check-circle-fill me-2" />
                Submit Mcnore Challan ({poMode === 'with_po' ? 'With PO' : 'Without PO'})
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
