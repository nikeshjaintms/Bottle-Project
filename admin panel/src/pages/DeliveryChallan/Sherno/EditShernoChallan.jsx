import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDeliveryChallanById,
  updateDeliveryChallan,
} from '../../../redux/slices/deliveryChallanSlice';
import { fetchCompanies } from '../../../redux/slices/companySlice';
import SearchableSelect from '../../../components/SearchableSelect';
import SearchableMultiSelect from '../../../components/SearchableMultiSelect';
import API from '../../../services/api';
import Swal from 'sweetalert2';

export default function EditShernoChallan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { companies = [] } = useSelector((state) => state.companies);
  const { currentChallan, loading } = useSelector((state) => state.deliveryChallans);

  // Form states
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState('');
  const [challanTime, setChallanTime] = useState('');
  const [poNo, setPoNo] = useState('');
  const [poDate, setPoDate] = useState('');
  const [dispatchThrough, setDispatchThrough] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');

  // Company and Addresses
  const [companyId, setCompanyId] = useState('');
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

  // Bottle Specs
  const [companyBottleSpecs, setCompanyBottleSpecs] = useState([]);
  const [loadingSpecs, setLoadingSpecs] = useState(false);

  // Bottle Per Box master
  const [bottlePerBoxes, setBottlePerBoxes] = useState([]);

  // Cache variants per bottleSpecId
  const [specVariantsCache, setSpecVariantsCache] = useState({});

  // Items grouped by Bottle Specification
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
    dispatch(fetchDeliveryChallanById(id));

    API.get('/bottle-per-box', { params: { pagination: 'false' } })
      .then((res) => {
        if (res.data?.data) {
          setBottlePerBoxes(res.data.data);
        }
      })
      .catch((err) => console.error('Failed to load BottlePerBox master:', err));
  }, [dispatch, id]);

  const loadVariantsForSpec = async (specId) => {
    if (!specId || specVariantsCache[specId]) return;
    try {
      const res = await API.get('/variant', {
        params: { bottleSpecId: specId, pagination: 'false' },
      });
      const vars = res.data?.data || [];
      setSpecVariantsCache((prev) => ({ ...prev, [specId]: vars }));
    } catch (err) {
      console.error('Failed to load variants for spec:', err);
    }
  };

  const findUnitPerBox = (bottleName) => {
    if (!bottleName) return '';
    const cleanName = bottleName.trim().toLowerCase().replace(/\s+/g, ' ');

    const exact = bottlePerBoxes.find(
      (b) => b.bottleName && b.bottleName.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName
    );
    if (exact && exact.bottlePerBox) return exact.bottlePerBox;

    const partial = bottlePerBoxes.find(
      (b) =>
        b.bottleName &&
        (cleanName.includes(b.bottleName.trim().toLowerCase()) ||
          b.bottleName.trim().toLowerCase().includes(cleanName))
    );
    if (partial && partial.bottlePerBox) return partial.bottlePerBox;

    return '';
  };

  // Load current challan into state
  useEffect(() => {
    if (currentChallan && currentChallan._id === id) {
      setChallanNo(currentChallan.challanNo || '');
      setChallanDate(
        currentChallan.challanDate
          ? new Date(currentChallan.challanDate).toISOString().split('T')[0]
          : ''
      );
      setChallanTime(currentChallan.challanTime || '');
      setPoNo(currentChallan.poNo || currentChallan.buyersOrderNo || '');
      setPoDate(
        currentChallan.poDate
          ? new Date(currentChallan.poDate).toISOString().split('T')[0]
          : ''
      );
      setDispatchThrough(currentChallan.dispatchThrough || '');
      setLrNo(currentChallan.lrNo || '');
      setVehicleNo(currentChallan.vehicleNo || '');
      setCheckedBy(currentChallan.checkedBy || '');
      setRemarks(currentChallan.remarks || '');

      const cId = currentChallan.companyId?._id || currentChallan.companyId || '';
      setCompanyId(cId);
      setCompanyName(currentChallan.companyName || currentChallan.companyId?.name || 'SHRENO');

      setBilledToAddressId(currentChallan.billedToAddressId?._id || currentChallan.billedToAddressId || '');
      setBilledTo(currentChallan.billedTo || {});

      setShippedToAddressId(currentChallan.shippedToAddressId?._id || currentChallan.shippedToAddressId || '');
      setShippedTo(currentChallan.shippedTo || {});

      // Parse loaded items
      const loadedGroups = [];
      let lastGroup = null;

      (currentChallan.items || []).forEach((it) => {
        let fBox = '';
        let lQty = '';
        const match = String(it.box).match(/^(\d+)\s*\+\s*\((\d+)\s*\*\s*(\d+)\)$/);
        if (match) {
          fBox = match[1];
          lQty = match[3];
        } else if (!isNaN(Number(it.box))) {
          fBox = it.box;
        }

        const vLine = {
          id: 'line_' + Math.random().toString(36).substr(2, 9),
          variantId: it.variantId || '',
          materialCode: it.materialCode || '',
          description: it.description || '',
          box: it.box || '',
          fullBox: fBox,
          looseBox: '1',
          looseQty: lQty,
          unit: it.unit || '',
          total: it.total || '',
          remarks: it.remarks || '',
          boxCount: it.boxCount || 0,
        };

        const titleKey = (it.title || '').trim();
        if (lastGroup && lastGroup.title === titleKey) {
          lastGroup.variantLines.push(vLine);
          if (it.variantId && !lastGroup.selectedVariantIds.includes(it.variantId)) {
            lastGroup.selectedVariantIds.push(it.variantId);
          }
        } else {
          lastGroup = {
            id: 'grp_' + Math.random().toString(36).substr(2, 9),
            bottleSpecId: it.bottleSpecId || '',
            title: titleKey,
            selectedVariantIds: it.variantId ? [it.variantId] : [],
            variantLines: [vLine],
          };
          loadedGroups.push(lastGroup);
        }
      });

      setSpecGroups(
        loadedGroups.length > 0
          ? loadedGroups
          : [
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
            ]
      );

      // Load addresses & specs for this company
      if (cId) {
        API.get('/company-address', { params: { companyId: cId, pagination: 'false' } })
          .then((res) => setCompanyAddresses(res.data?.data || []))
          .catch((err) => console.error(err));

        API.get('/bottle-spec', { params: { companyId: cId, pagination: 'false' } })
          .then((res) => setCompanyBottleSpecs(res.data?.data || []))
          .catch((err) => console.error(err));
      }
    }
  }, [currentChallan, id]);

  const handleCompanyChange = async (selectedId) => {
    setCompanyId(selectedId);
    const selectedComp = companies.find((c) => c._id === selectedId);
    const compName = selectedComp ? selectedComp.name : 'SHRENO';
    setCompanyName(compName);

    if (!selectedId) {
      setCompanyAddresses([]);
      setCompanyBottleSpecs([]);
      return;
    }

    try {
      const resAddr = await API.get('/company-address', {
        params: { companyId: selectedId, pagination: 'false' },
      });
      setCompanyAddresses(resAddr.data?.data || []);
    } catch (err) {
      console.error(err);
    }

    try {
      setLoadingSpecs(true);
      const resSpecs = await API.get('/bottle-spec', {
        params: { companyId: selectedId, pagination: 'false' },
      });
      setCompanyBottleSpecs(resSpecs.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSpecs(false);
    }
  };

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

  const handleSpecSelect = async (gIdx, specId) => {
    const updated = [...specGroups];
    const spec = companyBottleSpecs.find((s) => s._id === specId);

    if (spec) {
      const titleName = (spec.bottleName || spec.name || '').trim();
      updated[gIdx].bottleSpecId = spec._id;
      updated[gIdx].title = titleName;

      const autoUnit = findUnitPerBox(titleName);
      if (autoUnit) {
        updated[gIdx].variantLines = updated[gIdx].variantLines.map((vl) => {
          const newLine = { ...vl, unit: vl.unit || autoUnit };
          const { total, box, boxCount } = calculateItemTotal(newLine);
          return { ...newLine, total, box, boxCount };
        });
      }

      await loadVariantsForSpec(spec._id);
    } else {
      updated[gIdx].bottleSpecId = '';
    }

    setSpecGroups(updated);
  };

  const handleVariantMultiSelect = (gIdx, newVariantIds) => {
    const updated = [...specGroups];
    const group = updated[gIdx];
    const specId = group.bottleSpecId;
    const variantsForSpec = specVariantsCache[specId] || [];
    const autoUnit = findUnitPerBox(group.title) || '';

    group.selectedVariantIds = newVariantIds;

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

  const removeSpecGroup = (gIdx) => {
    if (specGroups.length === 1) {
      Swal.fire('Notice', 'At least one item line is required.', 'info');
      return;
    }
    setSpecGroups((prev) => prev.filter((_, idx) => idx !== gIdx));
  };

  const allLines = specGroups.flatMap((g) => g.variantLines);
  const totalBoxes = allLines.reduce((acc, it) => acc + (Number(it.boxCount) || 0), 0);
  const totalQuantity = allLines.reduce((acc, it) => acc + (Number(it.total) || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!challanNo.trim()) {
      return Swal.fire('Error', 'Delivery Challan / Gate Pass No is required', 'warning');
    }
    if (!companyId) {
      return Swal.fire('Error', 'Please select Company', 'warning');
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

    dispatch(updateDeliveryChallan({ id, formData: payload })).then((res) => {
      if (!res.error) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Sherno Delivery Challan #${challanNo} updated successfully!`,
          showCancelButton: true,
          confirmButtonText: 'Print / View Challan',
          cancelButtonText: 'Back to List',
        }).then((result) => {
          if (result.isConfirmed) {
            navigate(`/delivery-challan/sherno/view/${id}`);
          } else {
            navigate('/delivery-challan/sherno');
          }
        });
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update Delivery Challan.', 'error');
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
          <h1 className="page-title">Edit Sherno Delivery Challan</h1>
          <p className="page-subtitle">Update Gate Pass #{challanNo} details, addresses, and line items</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* SECTION 1: Meta Details */}
        <div className="dash-card mb-4">
          <div className="dash-card-header bg-white p-3 border-bottom d-flex align-items-center gap-2">
            <i className="bi bi-receipt text-primary fs-5" />
            <h5 className="mb-0 fw-bold">1. Gate Pass & P.O. Details</h5>
          </div>
          <div className="dash-card-body p-4">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Company</label>
                <SearchableSelect
                  options={companyOptions}
                  value={companyId}
                  onChange={handleCompanyChange}
                  placeholder="-- Select Company --"
                  disabled={true}
                  displayValue={companyName || 'SHRENO'}
                />
              </div>

              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Gate Pass No</label>
                <input
                  type="text"
                  className="form-control custom-input-field font-monospace fw-bold"
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  required
                  style={{ borderRadius: 12 }}
                />
              </div>

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

              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">P.O. No.</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={poNo}
                  onChange={(e) => setPoNo(e.target.value)}
                  style={{ borderRadius: 12 }}
                />
              </div>

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

              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Time</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={challanTime}
                  onChange={(e) => setChallanTime(e.target.value)}
                  style={{ borderRadius: 12 }}
                />
              </div>

              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Vehicle No</label>
                <input
                  type="text"
                  className="form-control custom-input-field font-monospace text-uppercase"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                  style={{ borderRadius: 12 }}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label fw-600 small text-uppercase text-muted">Dispatch Through</label>
                <input
                  type="text"
                  className="form-control custom-input-field"
                  value={dispatchThrough}
                  onChange={(e) => setDispatchThrough(e.target.value)}
                  style={{ borderRadius: 12 }}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label fw-600 small text-uppercase text-muted">LR No</label>
                <input
                  type="text"
                  className="form-control custom-input-field font-monospace"
                  value={lrNo}
                  onChange={(e) => setLrNo(e.target.value)}
                  style={{ borderRadius: 12 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Consignee Address */}
        <div className="dash-card mb-4">
          <div className="dash-card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-geo-alt text-primary fs-5" />
              <h5 className="mb-0 fw-bold">2. Consignee (M/S SHRENO LTD)</h5>
            </div>
          </div>
          <div className="dash-card-body p-4">
            <div className="row g-4">
              <div className="col-md-6 border-end">
                <h6 className="fw-bold mb-3 text-primary">Consignee Address (Billed To)</h6>
                <div className="small">
                  <div className="mb-2">
                    <label className="text-muted fw-600">Company Name</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={billedTo.name || ''}
                      onChange={(e) => setBilledTo({ ...billedTo, name: e.target.value })}
                    />
                  </div>
                  <div className="mb-2">
                    <label className="text-muted fw-600">Address Line 1</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={billedTo.addressLine1 || ''}
                      onChange={(e) => setBilledTo({ ...billedTo, addressLine1: e.target.value })}
                    />
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-7">
                      <label className="text-muted fw-600">City</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={billedTo.city || ''}
                        onChange={(e) => setBilledTo({ ...billedTo, city: e.target.value })}
                      />
                    </div>
                    <div className="col-5">
                      <label className="text-muted fw-600">Pincode</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={billedTo.pincode || ''}
                        onChange={(e) => setBilledTo({ ...billedTo, pincode: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="text-muted fw-600">GSTIN NO</label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-monospace text-uppercase"
                      value={billedTo.gstNo || ''}
                      onChange={(e) => setBilledTo({ ...billedTo, gstNo: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <h6 className="fw-bold mb-3 text-success">Delivery / Shipped To</h6>
                <div className="small">
                  <div className="mb-2">
                    <label className="text-muted fw-600">Company Name</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={shippedTo.name || ''}
                      onChange={(e) => setShippedTo({ ...shippedTo, name: e.target.value })}
                    />
                  </div>
                  <div className="mb-2">
                    <label className="text-muted fw-600">Address Line 1</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={shippedTo.addressLine1 || ''}
                      onChange={(e) => setShippedTo({ ...shippedTo, addressLine1: e.target.value })}
                    />
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-7">
                      <label className="text-muted fw-600">City</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={shippedTo.city || ''}
                        onChange={(e) => setShippedTo({ ...shippedTo, city: e.target.value })}
                      />
                    </div>
                    <div className="col-5">
                      <label className="text-muted fw-600">Pincode</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={shippedTo.pincode || ''}
                        onChange={(e) => setShippedTo({ ...shippedTo, pincode: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="text-muted fw-600">GSTIN NO</label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-monospace text-uppercase"
                      value={shippedTo.gstNo || ''}
                      onChange={(e) => setShippedTo({ ...shippedTo, gstNo: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Line Items */}
        <div className="dash-card mb-4" style={{ minHeight: 480 }}>
          <div className="dash-card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
            <div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-box-seam text-primary fs-5" />
                <h5 className="mb-0 fw-bold">3. Challan Items</h5>
              </div>
              <small className="text-muted">
                Each item includes Material Code (e.g. 82003708), Bottle Spec, Variant, and Quantities.
              </small>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-accent"
              onClick={addSpecGroup}
            >
              <i className="bi bi-plus-circle me-1" /> Add Bottle Spec
            </button>
          </div>

          <div className="dash-card-body p-3" style={{ minHeight: 400 }}>
            <div className="table-responsive" style={{ minHeight: 360, paddingBottom: 180, overflowX: 'auto', overflowY: 'visible' }}>
              <table className="table table-bordered align-middle mb-0">
                <thead className="table-light text-center small text-uppercase">
                  <tr>
                    <th style={{ width: 45 }}>#</th>
                    <th style={{ width: 220 }}>Bottle Spec</th>
                    <th style={{ width: 230 }}>Select Variant(s)</th>
                    <th style={{ width: 140 }}>Material Code</th>
                    <th style={{ minWidth: 260 }}>Description (Coating-Variant-Color)</th>
                    <th style={{ width: 190 }}>Box Details</th>
                    <th style={{ width: 90 }}>Unit</th>
                    <th style={{ width: 110 }}>Total Qty</th>
                    <th style={{ width: 55 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {specGroups.map((group, gIdx) => {
                    const variantsForThisSpec = group.bottleSpecId
                      ? specVariantsCache[group.bottleSpecId] || []
                      : [];

                    const variantOptions = variantsForThisSpec.map((v) => {
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
                        label: label || v.variantName || 'Unnamed Variant',
                        sublabel: v.variantName && v.variantName !== label ? v.variantName : '',
                      };
                    });

                    const specOptions = companyBottleSpecs.map((s) => ({
                      value: s._id,
                      label: s.bottleName || s.name || 'Unnamed Spec',
                    }));

                    const numLines = group.variantLines.length;

                    return group.variantLines.map((line, lIdx) => (
                      <tr key={line.id || `${gIdx}-${lIdx}`}>
                        {lIdx === 0 && (
                          <td
                            rowSpan={numLines}
                            className="text-center fw-bold text-muted align-top pt-3"
                            style={{ background: '#fdfdfe' }}
                          >
                            {gIdx + 1}
                          </td>
                        )}

                        {lIdx === 0 && (
                          <td
                            rowSpan={numLines}
                            className="align-top"
                            style={{ background: '#fdfdfe' }}
                          >
                            {companyBottleSpecs.length > 0 ? (
                              <SearchableSelect
                                options={specOptions}
                                value={group.bottleSpecId}
                                onChange={(val) => handleSpecSelect(gIdx, val)}
                                placeholder="-- Search Spec --"
                                style={{
                                  borderRadius: 8,
                                  minHeight: 38,
                                  padding: '6px 10px',
                                  fontSize: 13,
                                  fontWeight: 600,
                                }}
                              />
                            ) : (
                              <input
                                type="text"
                                className="form-control fw-bold text-uppercase"
                                placeholder={companyId ? 'Type Bottle Spec' : 'Select Company first'}
                                value={group.title}
                                onChange={(e) => {
                                  const updated = [...specGroups];
                                  updated[gIdx].title = e.target.value;
                                  setSpecGroups(updated);
                                }}
                                style={{ height: 38, fontSize: 13, borderRadius: 8 }}
                              />
                            )}
                            <input
                              type="text"
                              className="form-control mt-1 text-muted small"
                              value={group.title}
                              onChange={(e) => {
                                const updated = [...specGroups];
                                updated[gIdx].title = e.target.value;
                                setSpecGroups(updated);
                              }}
                              placeholder="Spec Title (e.g. BS350- (CUBA JAR)-BABY PINK-4PC)"
                              title="Spec Title displayed on Challan"
                              style={{ height: 30, fontSize: 12, borderRadius: 6 }}
                            />
                            {specGroups.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-xs btn-outline-danger mt-2 w-100 py-1"
                                style={{ fontSize: 11, borderRadius: 6 }}
                                onClick={() => removeSpecGroup(gIdx)}
                                title="Delete this entire Bottle Spec block"
                              >
                                <i className="bi bi-trash me-1" /> Remove Spec
                              </button>
                            )}
                          </td>
                        )}

                        {lIdx === 0 && (
                          <td
                            rowSpan={numLines}
                            className="align-top"
                            style={{ background: '#fdfdfe' }}
                          >
                            {group.bottleSpecId ? (
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
                                Search Bottle Spec first
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
                            title="Pcs per Box (e.g. 64)"
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

            <div className="d-flex align-items-center justify-content-end gap-3 mt-4 pt-3 border-top">
              <Link to="/delivery-challan/sherno" className="btn btn-outline-secondary px-4">
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-accent px-5 fw-bold"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" /> Updating...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle me-2" /> Update Challan
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
