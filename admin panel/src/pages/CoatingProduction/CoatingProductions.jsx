import { useState, useEffect, useMemo } from 'react';
import Select from 'react-select';
import { Link, useSearchParams } from 'react-router-dom';
import { Can } from '../../context/AbilityContext.js';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import {fetchCoatingProductions, deleteCoatingProduction, clearCoatingProductions, setSearchTerm} from '../../redux/slices/coatingProductionSlice.js';
import {fetchBrands} from '../../redux/slices/brandSlice.js';
import {fetchCoatingSpecs} from '../../redux/slices/coatingSpecSlice.js';
import {fetchCompanies} from '../../redux/slices/companySlice.js';
import {fetchShifts} from '../../redux/slices/shiftSlice.js';
import {fetchUnits} from '../../redux/slices/unitSlice.js';
import {getUnitNumberByName} from '../../utils/unitMapper.js';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { V_URL } from '../../../Baseurl.js';
import API from '../../services/api';

const parseProductionDate = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return new Date(dateStr);
  return new Date(y, m - 1, d);
};

const daysFromToday = (dateStr) => {
  const day = parseProductionDate(dateStr);
  if (!day) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  day.setHours(0, 0, 0, 0);
  return Math.round((today - day) / 86400000);
};

const formatProductionDate = (dateStr) => {
  const offset = daysFromToday(dateStr);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  if (offset === 2) return 'Day before yesterday';
  const day = parseProductionDate(dateStr);
  return day ? day.toLocaleDateString() : 'N/A';
};

const toIsoDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function CoatingProductions() {
  const { unit } = useParams();
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { coatingProductions: productions,
    loading,
    page,
    totalPages,
    total, searchTerm } = useSelector((state) => state.coatingProductions);

  const { brands } = useSelector((state) => state.brands);
  const { companies } = useSelector((state) => state.companies);
  const { coatingSpecs } = useSelector((state) => state.coatingSpecs);
  const { shifts } = useSelector((state) => state.shifts || { shifts: [] });
  const { units } = useSelector((state) => state.units || { units: [] });

  const search = searchTerm || "";
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedSpec, setSelectedSpec] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  // Initialize unit filter from URL param so the correct unit is pre-selected on load
  const [selectedUnit, setSelectedUnit] = useState(unit || '');

  // Sync selectedUnit when URL unit param changes (e.g. navigating unit/1 → unit/2)
  useEffect(() => {
    setSelectedUnit(unit || '');
  }, [unit]);

  const allUnits = useMemo(() => {
    return (units || [])
      .filter(u => u.status !== false && !u.isDeleted)
      .map(u => getUnitNumberByName(u.name))
      .filter(num => num !== null)
      .sort((a, b) => a - b);
  }, [units]);

  const urlPage = searchParams.get('page') || '';
  const currentPage = Number(urlPage) || page || 1;

  const [limit, setLimit] = useState(10);

  useEffect(() => {
    dispatch(clearCoatingProductions());
    dispatch(fetchCoatingProductions({
      page: urlPage,
      limit,
      // Empty string = All Units (no filter); otherwise filter by selected unit
      ...(selectedUnit !== '' ? { unit: selectedUnit } : {}),
      shift: selectedShift || undefined,
      companyId: selectedCompany,
      brandId: selectedBrand,
      coatingSpecId: selectedSpec,
      variantId: selectedVariant,
      search,
      startDate,
      endDate,
    }));
  }, [dispatch, urlPage, limit, search, startDate, endDate, selectedCompany, selectedBrand, selectedSpec, selectedVariant, selectedShift, selectedUnit]);

  useEffect(() => {
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchCoatingSpecs({ pagination: 'false' }));
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchShifts({ pagination: 'false' }));
    dispatch(fetchUnits({ limit: 1000 }));
  }, [dispatch]);

  const handleDelete = (id) => {
    Swal.fire({
      title: 'Delete Coating Production Log?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteCoatingProduction(id)).then(res => {
          if (!res.error) Swal.fire('Deleted!', 'Coating Production log removed.', 'success');
          else Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
        });
      }
    });
  };

  const filteredCompanies = useMemo(() => companies, [companies]);

  const filteredBrands = useMemo(() => {
    return brands.filter((b) => {
      if (!selectedCompany) return true;
      return b.companyId?._id === selectedCompany || b.companyId === selectedCompany;
    });
  }, [brands, selectedCompany]);

  const filteredCoatingSpecs = useMemo(() => {
    return coatingSpecs.filter((s) => {
      const matchesBrand = !selectedBrand || s.brandId?._id === selectedBrand || s.brandId === selectedBrand;
      const matchesCompany = !selectedCompany || s.brandId?.companyId?._id === selectedCompany || s.brandId?.companyId === selectedCompany;
      const matchesVariant = !selectedVariant || s.variantId?._id === selectedVariant || s.variantId === selectedVariant;
      return matchesBrand && matchesCompany && matchesVariant;
    });
  }, [coatingSpecs, selectedBrand, selectedCompany, selectedVariant]);

  const uniqueVariants = useMemo(() => {
    const variantsMap = new Map();
    // Use the filtered coating specs (by brand/company) to determine available variants
    coatingSpecs.filter((s) => {
      const matchesBrand = !selectedBrand || s.brandId?._id === selectedBrand || s.brandId === selectedBrand;
      const matchesCompany = !selectedCompany || s.brandId?.companyId?._id === selectedCompany || s.brandId?.companyId === selectedCompany;
      return matchesBrand && matchesCompany;
    }).forEach(s => {
      if (s.variantId && !variantsMap.has(s.variantId._id)) {
        variantsMap.set(s.variantId._id, s.variantId);
      }
    });
    return Array.from(variantsMap.values());
  }, [coatingSpecs, selectedBrand, selectedCompany]);

  useEffect(() => {
    if (selectedBrand && !filteredBrands.some(b => b._id === selectedBrand)) {
      setSelectedBrand('');
      setSelectedSpec('');
    }
  }, [filteredBrands, selectedBrand]);

  useEffect(() => {
    if (selectedSpec && !filteredCoatingSpecs.some(s => s._id === selectedSpec)) {
      setSelectedSpec('');
    }
  }, [filteredCoatingSpecs, selectedSpec]);

  useEffect(() => {
    if (selectedVariant && !uniqueVariants.some(v => v._id === selectedVariant)) {
      setSelectedVariant('');
    }
  }, [uniqueVariants, selectedVariant]);

  const handleExport = async () => {
    try {
      Swal.fire({
        title: 'Generating Export...',
        text: 'Please wait while we fetch the data.',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const response = await API.get("/coating-production", {
        params: {
          // No unit = all units; only filter when explicitly selected
          ...(selectedUnit !== '' ? { unit: selectedUnit } : {}),
          ...(selectedShift !== '' ? { shift: selectedShift } : {}),
          companyId: selectedCompany,
          brandId: selectedBrand,
          coatingSpecId: selectedSpec,
          variantId: selectedVariant,
          search,
          startDate,
          endDate,
          pagination: 'false'
        }
      });

      const allProductions = response.data.data || [];

      if (allProductions.length === 0) {
        Swal.fire('No Data', 'There is no data to export for the selected filters.', 'info');
        return;
      }

      const data = allProductions.map((p, index) => {
        const actual = Number(p.actualQuantity) || 0;
        const bpb = Number(p.bottlePerBox) || 0;
        const totalBoxes = bpb > 0 ? Math.floor(actual / bpb) : 0;
        const extraBottles = bpb > 0 ? actual % bpb : 0;

        return {
          'Sr No': index + 1,
          'Date': parseProductionDate(p.date)?.toLocaleDateString() || 'N/A',
          'Unit': `Unit ${p.unit}`,
          'Shift': p.shift?.name || 'N/A',
          'Operator Name': p.operatorId?.name || 'N/A',
          'Company': p.brandId?.companyId?.name || 'N/A',
          'Brand': p.brandId?.name || 'N/A',
          'Bottle Name': p.coatingSpecId?.bottleName || 'N/A',
          'Coating Type': p.coatingSpecId?.coatingTypeId?.name || 'N/A',
          'Coating Shade': p.coatingSpecId?.coatingShade || p.coatingShade || 'N/A',
          'Actual Quantity': actual,
          'Rejection Quantity': Number(p.rejectionQuantity) || 0,
          'Actual Total Coated': Number(p.totalActualCoatedBottle) || 0,
          'Total Bottle Coated': Number(p.totalBottleCoated) || 0,
          'Bottle Per Box': bpb,
          'Total Boxes': totalBoxes,
          'Extra Bottles': extraBottles,
          'Rejection Reason': p.rejectionReason || 'N/A',
          'Rejection Percentage': p.totalBottleCoated > 0 ? `${((Number(p.rejectionQuantity) || 0) / Number(p.totalBottleCoated) * 100).toFixed(2)}%` : '0.00%'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);

      worksheet['!cols'] = [
        { wch: 5 },   // Sr No
        { wch: 12 },  // Date
        { wch: 6 },   // Unit
        { wch: 7 },   // Shift
        { wch: 18 },  // Operator Name
        { wch: 22 },  // Company
        { wch: 18 },  // Brand
        { wch: 22 },  // Bottle Name
        { wch: 20 },  // Coating Type
        { wch: 20 },  // Coating Shade
        { wch: 15 },  // Actual Quantity
        { wch: 18 },  // Rejection Quantity
        { wch: 20 },  // Actual Total Coated
        { wch: 20 },  // Total Bottle Coated
        { wch: 14 },  // Bottle Per Box
        { wch: 12 },  // Total Boxes
        { wch: 14 },  // Extra Bottles
        { wch: 25 },  // Rejection Reason
        { wch: 20 },  // Rejection Percentage
      ];

      const workbook = XLSX.utils.book_new();
      const sheetLabel = selectedUnit !== '' ? `Unit ${selectedUnit}` : 'All Units';
      XLSX.utils.book_append_sheet(workbook, worksheet, `Coating Prod ${sheetLabel}`);

      let filename = `Coating_Production_${selectedUnit !== '' ? `Unit_${selectedUnit}` : 'All_Units'}`;
      if (selectedShift) filename += `_Shift_${selectedShift}`;
      if (startDate) filename += `_from_${startDate}`;
      if (endDate) filename += `_to_${endDate}`;
      filename += ".xlsx";

      XLSX.writeFile(workbook, filename);
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire('Export Failed', 'An error occurred while generating the export.', 'error');
    }
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title">
            Coating Production{selectedUnit !== '' ? ` - Unit ${selectedUnit}` : ' - All Units'}
          </h1>
          <p className="page-subtitle">Track and manage coating production entries</p>
        </div>
        <div className="d-flex align-items-center gap-3 productions-page-actions">
          <button onClick={handleExport} className="btn btn-outline-success shadow-sm px-4 py-2 rounded-3">
            <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
          </button>
          <Can I="create" a="coatingproduction">
            <Link to={`/coating-productions/add/unit/${unit}`} className="btn-accent shadow-sm px-4 py-2 rounded-3">
              <i className="bi bi-plus-lg me-2" /> New Entry
            </Link>
          </Can>
        </div>
      </div>

      <div className="dash-card mb-4">
        <div className="dash-card-body p-3">
          <div className="row g-3 align-items-end productions-filters-panel">
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">From</label>
              <input
                type="date"
                className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                style={{ borderRadius: 10, height: 38 }}
                value={startDate}
                onChange={(e) => { setSearchParams({ page: 1 }); setStartDate(e.target.value); }}
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">To</label>
              <input
                type="date"
                className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                style={{ borderRadius: 10, height: 38 }}
                value={endDate}
                onChange={(e) => { setSearchParams({ page: 1 }); setEndDate(e.target.value); }}
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Company</label>
              <Select
                options={[{ value: '', label: 'All Companies' }, ...filteredCompanies.map(c => ({ value: c._id, label: c.name }))]}
                value={selectedCompany ? { value: selectedCompany, label: filteredCompanies.find(c => c._id === selectedCompany)?.name || 'Unknown' } : { value: '', label: 'All Companies' }}
                onChange={(option) => {
                  setSearchParams({ page: 1 });
                  setSelectedCompany(option.value);
                  setSelectedBrand('');
                  setSelectedSpec('');
                }}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Brand</label>
              <Select
                options={[{ value: '', label: 'All Brands' }, ...filteredBrands.map(b => ({ value: b._id, label: b.name }))]}
                value={selectedBrand ? { value: selectedBrand, label: filteredBrands.find(b => b._id === selectedBrand)?.name || 'Unknown' } : { value: '', label: 'All Brands' }}
                onChange={(option) => {
                  setSearchParams({ page: 1 });
                  setSelectedBrand(option.value);
                  setSelectedSpec('');
                }}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Coating Spec</label>
              <Select
                options={[{ value: '', label: 'All Specs' }, ...filteredCoatingSpecs.map(s => ({ value: s._id, label: `${s.bottleName}${s.variantId ? ` - ${s.variantId.variantName}${s.variantId.variantSize ? ' ' + s.variantId.variantSize : ''}` : ''}` }))]}
                value={selectedSpec ? { value: selectedSpec, label: filteredCoatingSpecs.find(s => s._id === selectedSpec) ? `${filteredCoatingSpecs.find(s => s._id === selectedSpec).bottleName}${filteredCoatingSpecs.find(s => s._id === selectedSpec).variantId ? ` - ${filteredCoatingSpecs.find(s => s._id === selectedSpec).variantId.variantName}` : ''}` : 'Unknown' } : { value: '', label: 'All Specs' }}
                onChange={(option) => {
                  setSearchParams({ page: 1 });
                  setSelectedSpec(option.value);
                }}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Variant</label>
              <Select
                options={[{ value: '', label: 'All Variants' }, ...uniqueVariants.map(v => ({ value: v._id, label: `${v.variantName} - ${v.variantSize}` }))]}
                value={selectedVariant ? { value: selectedVariant, label: uniqueVariants.find(v => v._id === selectedVariant) ? `${uniqueVariants.find(v => v._id === selectedVariant).variantName} - ${uniqueVariants.find(v => v._id === selectedVariant).variantSize}` : 'Unknown' } : { value: '', label: 'All Variants' }}
                onChange={(option) => {
                  setSearchParams({ page: 1 });
                  setSelectedVariant(option.value);
                  setSelectedSpec(''); // Clear spec if variant changes
                }}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>

            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Unit</label>
              <Select
                options={[{ value: '', label: 'All Units' }, ...allUnits.map(u => ({ value: u, label: `Unit ${u}` }))]}
                value={selectedUnit !== '' ? { value: selectedUnit, label: `Unit ${selectedUnit}` } : { value: '', label: 'All Units' }}
                onChange={(option) => { setSearchParams({ page: 1 }); setSelectedUnit(option.value); }}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Shift</label>
              <Select
                options={[{ value: '', label: 'All Shifts' }, ...shifts.map(s => ({ value: s._id, label: `Shift ${s.name}` }))]}
                value={selectedShift ? { value: selectedShift, label: shifts.find(s => s._id === selectedShift) ? `Shift ${shifts.find(s => s._id === selectedShift).name}` : 'Unknown' } : { value: '', label: 'All Shifts' }}
                onChange={(option) => { setSearchParams({ page: 1 }); setSelectedShift(option.value); }}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Search</label>
              <div className="search-input-wrapper position-relative">
                <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
                <input
                  type="text"
                  className="form-control form-control-sm border-light-subtle bg-light ps-5 shadow-none w-100"
                  placeholder="Search logs..."
                  value={search}
                  onChange={(e) => {
                    const val = e.target.value;
                    dispatch(setSearchTerm(val));
                    setSearchParams({ page: 1 });
                  }}
                  style={{ borderRadius: 10, height: 38 }}
                />
              </div>
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <button
                type="button"
                onClick={() => {
                  dispatch(setSearchTerm('')); setStartDate(''); setEndDate(''); setSelectedCompany(''); setSelectedBrand(''); setSelectedSpec(''); setSelectedVariant(''); setSelectedShift(''); setSelectedUnit(unit || ''); setSearchParams({ page: 1 });
                }}
                className="btn btn-sm btn-light border-light-subtle w-100"
                style={{ borderRadius: 10, fontWeight: 600, height: 38 }}
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={limit}
              onChange={(e) => { setSearchParams({ page: 1 }); dispatch(clearCoatingProductions()); setLimit(Number(e.target.value)); }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* Mobile card list */}
        <div className="companies-list-mobile">
          {productions.map((p, index) => {
            const specId = p.coatingSpecId?._id || p.coatingSpecId;
            const specImage = p.coatingSpecId?.image || coatingSpecs.find(s => s._id === specId)?.image;
            const bottlePerBox = p.bottlePerBox || 0;
            const boxes = bottlePerBox > 0 ? Math.floor((p.totalActualCoatedBottle || 0) / bottlePerBox) : 0;
            const extraCoatedBottles = bottlePerBox > 0 ? (p.totalActualCoatedBottle || 0) % bottlePerBox : 0;
            return (
              <div key={p._id} className="companies-mobile-card brands-mobile-card">
                <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                  {specImage ? (
                    <img src={`${V_URL}${specImage}`} alt="Bottle" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 50, height: 50, borderRadius: 8, background: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="bi bi-image text-muted fs-5" />
                    </div>
                  )}
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <span className="text-muted small fw-bold">#{String((currentPage - 1) * limit + index + 1).padStart(2, '0')}</span>
                      <span className="fw-semibold">{formatProductionDate(p.date)}</span>
                      {daysFromToday(p.date) <= 2 && (
                        <span className="text-muted" style={{ fontSize: 11 }}>{parseProductionDate(p.date)?.toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="small text-muted mb-1">{p.brandId?.companyId?.name || p.coatingSpecId?.brandId?.companyId?.name || 'N/A'} · <span className="text-accent fw-600">{p.brandId?.name || p.coatingSpecId?.brandId?.name || 'Deleted Brand'}</span></div>
                    <div className="small fw-bold text-dark">{p.coatingSpecId?.bottleName || '—'}</div>
                    {p.coatingSpecId?.code && (
                      <span className="badge bg-light text-dark border fw-normal small">{p.coatingSpecId.code}</span>
                    )}
                    {(p.coatingSpecId?.coatingTypeId?.name || p.coatingSpecId?.coatingShade) && (
                      <div className="small text-muted mt-1">{p.coatingSpecId?.coatingTypeId?.name || 'Unknown'} — {p.coatingSpecId?.coatingShade || p.coatingShade || '—'}</div>
                    )}
                    {(() => {
                      const spec = coatingSpecs.find(s => s._id === specId) || p.coatingSpecId;
                      const variant = spec?.variantId;
                      if (!variant) return null;
                      return (
                        <div className="d-flex align-items-center gap-2 mt-2">
                          {variant.image && (
                            <img src={`${V_URL}${variant.image}`} alt={variant.variantName} style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                          )}
                          <span className="badge bg-light text-primary border" style={{ fontSize: 10 }}>{variant.variantName} - {variant.variantSize}</span>
                        </div>
                      );
                    })()}
                    <div className="small text-muted mt-2">Operator: <span className="fw-600 text-dark">{p.operatorId?.name || '—'}</span>
                      {p.shift && <span className={`ms-2 badge ${p.shift?.name === 'A' ? 'bg-soft-primary text-primary' : 'bg-soft-warning text-warning'}`} style={{ fontSize: 10 }}>Shift {p.shift?.name}</span>}
                    </div>
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      <span className="badge bg-light text-dark border" style={{ fontSize: 11 }}>Actual: {p.actualQuantity}</span>
                      <span className="badge bg-soft-success text-success" style={{ fontSize: 11 }}>Total Actual: {p.totalActualCoatedBottle}</span>
                      <span className="badge bg-soft-primary text-primary" style={{ fontSize: 11 }}>Boxes: {boxes}</span>
                      <span className="badge bg-soft-warning text-warning" style={{ fontSize: 11 }}>Extra: {extraCoatedBottles}</span>
                    </div>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      <span className="badge bg-light text-danger border" style={{ fontSize: 11 }}>Rejections: {p.rejectionQuantity}</span>
                      <span className="badge bg-soft-danger text-danger" style={{ fontSize: 11 }}>Rej %: {p.totalBottleCoated > 0 ? ((p.rejectionQuantity || 0) / p.totalBottleCoated * 100).toFixed(2) : 0}%</span>
                      <span className="badge bg-light text-dark border" style={{ fontSize: 11 }}>Total Coated: {p.totalBottleCoated}</span>
                    </div>
                  </div>
                </div>
                <div className="companies-mobile-actions brands-mobile-actions">
                  <Can I="read" a="coatingproductiondetail">
                    <Link to={`/coating-productions/view/${p._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none companies-mobile-action-btn" title="View"><i className="bi bi-eye fs-6" /></Link>
                  </Can>
                  <Can I="edit" a="coatingproduction">
                    <Link to={`/coating-productions/edit/${p._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Edit"><i className="bi bi-pencil-square fs-6" /></Link>
                  </Can>
                  <Can I="delete" a="coatingproduction">
                    <button onClick={() => handleDelete(p._id)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Delete"><i className="bi bi-trash fs-6" /></button>
                  </Can>
                </div>
              </div>
            );
          })}
          {productions.length === 0 && !loading && (
            <div className="companies-mobile-empty">No coating production logs found</div>
          )}
        </div>

        {/* Desktop table */}
        <div className="companies-list-desktop" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="py-3 text-uppercase small fw-bold text-muted ps-5 text-start" style={{ width: 120 }}>Sr No</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Date</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 80 }}>Image</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Company &amp; Brand</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Coating Specs</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Variant</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Operator</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Quantities</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Rejections</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {productions.map((p, index) => {
                const specId = p.coatingSpecId?._id || p.coatingSpecId;
                const specImage = p.coatingSpecId?.image || coatingSpecs.find(s => s._id === specId)?.image;
                return (
                  <tr key={p._id} className="align-middle border-bottom transition-all hover-bg-light">
                    <td className="py-3 ps-5 text-start">
                      <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{String((currentPage - 1) * limit + index + 1).padStart(2, '0')}</span>
                    </td>
                    <td className="py-3 text-center">
                      <div className="fw-600 text-dark">{formatProductionDate(p.date)}</div>
                      {daysFromToday(p.date) <= 2 && (
                        <div className="small text-muted" style={{ fontSize: 11 }}>{parseProductionDate(p.date)?.toLocaleDateString()}</div>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {specImage ? (
                        <img src={`${V_URL}${specImage}`} alt="Bottle" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                      ) : (
                        <div className="bg-light d-flex align-items-center justify-content-center text-muted mx-auto" style={{ width: 48, height: 48, borderRadius: 8, fontSize: 18 }}>
                          <i className="bi bi-image" />
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <div className="fw-bold text-dark mb-1" style={{ fontSize: 14 }}>{p.brandId?.companyId?.name || p.coatingSpecId?.brandId?.companyId?.name || 'N/A'}</div>
                      <div className="fw-600 text-accent" style={{ fontSize: 13 }}>{p.brandId?.name || p.coatingSpecId?.brandId?.name || 'Deleted Brand'}</div>
                    </td>
                    <td className="py-3 text-center">
                      <div className="fw-bold text-dark mb-1" style={{ fontSize: 14 }}>
                        {p.coatingSpecId?.bottleName || '—'}
                      </div>
                      {p.coatingSpecId?.code && (
                        <div className="mb-1">
                          <span className="badge bg-light text-dark border fw-normal" style={{ fontSize: 11, borderRadius: 6 }}>
                            {p.coatingSpecId.code}
                          </span>
                        </div>
                      )}
                      {(p.coatingSpecId?.coatingTypeId?.name || p.coatingSpecId?.coatingShade) && (
                        <div className="fw-500 text-muted small mb-1">
                          {p.coatingSpecId?.coatingTypeId?.name || 'Unknown Type'}
                          {' - '}
                          {p.coatingSpecId?.coatingShade || p.coatingShade || '—'}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {(() => {
                        const spec = coatingSpecs.find(s => s._id === specId) || p.coatingSpecId;
                        const variant = spec?.variantId;
                        if (!variant) return <span className="text-muted" style={{ fontSize: 12 }}>—</span>;
                        return (
                          <div className="d-flex flex-column align-items-center gap-1">
                            {variant.image && (
                              <img src={`${V_URL}${variant.image}`} alt={variant.variantName} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                            )}
                            <div className="fw-600 text-dark" style={{ fontSize: 12 }}>{variant.variantName}</div>
                            <div className="text-muted small" style={{ fontSize: 11 }}>{variant.variantSize}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 text-center">
                      <div className="d-flex flex-column align-items-center justify-content-center h-100 gap-1">
                        <span className="fw-600 text-dark" style={{ fontSize: 13 }}>{p.operatorId?.name || '—'}</span>
                        {p.shift && (
                          <span className={`badge ${p.shift?.name === 'A' ? 'bg-soft-primary text-primary' : 'bg-soft-warning text-warning'}`} style={{ fontSize: 11 }}>
                            Shift {p.shift?.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      {(() => {
                        const bottlePerBox = p.bottlePerBox || 0;
                        const boxes = bottlePerBox > 0 ? Math.floor((p.totalActualCoatedBottle || 0) / bottlePerBox) : 0;
                        const extraCoatedBottles = bottlePerBox > 0 ? (p.totalActualCoatedBottle || 0) % bottlePerBox : 0;

                        return (
                          <div className="d-flex flex-column align-items-center gap-1">
                            <div className="fw-bold text-dark">Actual: {p.actualQuantity}</div>
                            <span className="badge bg-soft-success text-success rounded-pill px-3 py-1" style={{ fontSize: 12 }}>Total Actual: {p.totalActualCoatedBottle}</span>
                            <span className="badge bg-soft-primary text-primary rounded-pill px-3 py-1" style={{ fontSize: 12 }}>Boxes: {boxes}</span>
                            <span className="badge bg-soft-warning text-warning rounded-pill px-3 py-1" style={{ fontSize: 12 }}>Extra Bottles: {extraCoatedBottles}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 text-center">
                      {(() => {
                        const rejPercentage = p.totalBottleCoated > 0 ? ((p.rejectionQuantity || 0) / p.totalBottleCoated * 100).toFixed(2) : 0;
                        return (
                          <div className="d-flex flex-column align-items-center gap-1">
                            <div className="fw-bold text-danger mb-1">Rejection: {p.rejectionQuantity}</div>
                            <span className="badge bg-soft-danger text-danger rounded-pill px-3 py-1" style={{ fontSize: 12 }}>Rej %: {rejPercentage}%</span>
                            <div className="text-muted mt-2 small">Total Coated: <span className="fw-bold text-dark">{p.totalBottleCoated}</span></div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 text-center">
                      <div className="d-flex gap-2 justify-content-center">
                        <Can I="read" a="coatingproductiondetail">
                          <Link to={`/coating-productions/view/${p._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View"><i className="bi bi-eye fs-6" /></Link>
                        </Can>
                        <Can I="edit" a="coatingproduction">
                          <Link to={`/coating-productions/edit/${p._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit"><i className="bi bi-pencil-square fs-6" /></Link>
                        </Can>
                        <Can I="delete" a="coatingproduction">
                          <button onClick={() => handleDelete(p._id)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete"><i className="bi bi-trash fs-6" /></button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {productions.length === 0 && !loading && (
                <tr><td colSpan={10} className="text-center py-5 text-muted">No coating production logs found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
          <div className="text-muted small fw-500">
            Showing <b>{total === 0 ? 0 : (currentPage - 1) * limit + 1}</b> to <b>{Math.min(currentPage * limit, total)}</b> of <b>{total}</b> entries
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === 1}
              onClick={() => { if (currentPage > 1) setSearchParams({ page: currentPage - 1 }); }}
            >
              Previous
            </button>

            {(() => {
              const pages = [];
              const delta = 2;
              const left = currentPage - delta;
              const right = currentPage + delta;
              pages.push(1);
              if (left > 2) pages.push('...');
              for (let i = Math.max(2, left); i <= Math.min(totalPages - 1, right); i++) pages.push(i);
              if (right < totalPages - 1) pages.push('...');
              if (totalPages > 1) pages.push(totalPages);
              return pages.map((p, idx) =>
                p === '...'
                  ? <span key={`e-${idx}`} className="px-1 text-muted" style={{ fontSize: 13 }}>…</span>
                  : <button key={p} className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`} onClick={() => setSearchParams({ page: p })}>{p}</button>
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => { if (currentPage < totalPages) setSearchParams({ page: currentPage + 1 }); }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

