import { useState, useEffect, useMemo } from 'react';
import Select from 'react-select';
import { Link, useSearchParams } from 'react-router-dom';
import { Can } from '../../context/AbilityContext.js';
import { useDispatch, useSelector } from 'react-redux';
import {fetchProductions, deleteProduction, clearProductions, setSearchTerm} from '../../redux/slices/productionSlice.js';
import {fetchBrands} from '../../redux/slices/brandSlice.js';
import {fetchBottleSpecs} from '../../redux/slices/bottleSpecSlice.js';
import {fetchCompanies} from '../../redux/slices/companySlice.js';
import {fetchVariants} from '../../redux/slices/variantSlice.js';
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

const matchesDateRange = (dateStr, startIso, endIso) => {
  const prodDay = parseProductionDate(dateStr);
  if (!prodDay) return !startIso && !endIso;
  prodDay.setHours(0, 0, 0, 0);
  const start = startIso ? parseProductionDate(startIso) : null;
  const end = endIso ? parseProductionDate(endIso) : null;
  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(23, 59, 59, 999);
  return (!start || prodDay >= start) && (!end || prodDay <= end);
};

export default function Productions() {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] =
    useSearchParams();
  const { productions,
    loading,
    page,
    totalPages,
    total, searchTerm } = useSelector((state) => state.productions);
  const { brands } = useSelector((state) => state.brands);
  const { companies } = useSelector((state) => state.companies);
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);
  const { variants } = useSelector((state) => state.variants);
  const search = searchTerm || "";
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedSpec, setSelectedSpec] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const urlPage = searchParams.get('page') || '';
  const currentPage = Number(urlPage) || page || 1;
  const [limit, setLimit] = useState(10);
  
  const maxFilterDate = toIsoDate(new Date());


  useEffect(() => {
    dispatch(clearProductions());
    dispatch(fetchProductions({
      page: urlPage,
      limit,
      companyId: selectedCompany,
      brandId: selectedBrand,
      bottleSpecId: selectedSpec,
      variantId: selectedVariant,
      search,
      startDate,
      endDate,
    }));
  }, [dispatch, urlPage, limit, search, startDate, endDate, selectedCompany, selectedBrand, selectedSpec, selectedVariant]);

  useEffect(() => {
    dispatch(fetchBrands({ pagination: false }));
    dispatch(fetchBottleSpecs({ pagination: false }));
    dispatch(fetchCompanies({ pagination: false }));
    dispatch(fetchVariants({ pagination: false }));
  }, [dispatch]);

  const handleDelete = (id) => {
    Swal.fire({
      title: 'Delete Production Log?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteProduction(id)).then(res => {
          if (!res.error) Swal.fire('Deleted!', 'Production log removed.', 'success');
          else Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
        });
      }
    });
  };

  const filteredCompanies = useMemo(() => {

    return companies;

  }, [companies]);

  const filteredBrands = useMemo(() => {

    return brands.filter((b) => {

      if (!selectedCompany) return true;

      return (
        b.companyId?._id === selectedCompany ||
        b.companyId === selectedCompany
      );

    });

  }, [brands, selectedCompany]);

  const filteredBottleSpecs = useMemo(() => {

    return bottleSpecs.filter((s) => {

      const matchesBrand =

        !selectedBrand ||

        s.brandId?._id === selectedBrand ||

        s.brandId === selectedBrand;

      const matchesCompany =

        !selectedCompany ||

        s.brandId?.companyId?._id === selectedCompany ||

        s.brandId?.companyId === selectedCompany;

      return (
        matchesBrand &&
        matchesCompany
      );

    });

  }, [

    bottleSpecs,

    selectedBrand,

    selectedCompany,

  ]);

  const filteredVariants = useMemo(() => {

    return variants.filter((v) => {

      const matchesSpec =

        !selectedSpec ||

        v.bottleSpecId?._id === selectedSpec ||

        v.bottleSpecId === selectedSpec;

      const matchesBrand =

        !selectedBrand ||

        v.bottleSpecId?.brandId?._id === selectedBrand ||

        v.bottleSpecId?.brandId === selectedBrand;

      const matchesCompany =

        !selectedCompany ||

        v.bottleSpecId?.brandId?.companyId?._id === selectedCompany ||

        v.bottleSpecId?.brandId?.companyId === selectedCompany;

      return (

        matchesSpec &&
        matchesBrand &&
        matchesCompany

      );

    });

  }, [

    variants,

    selectedSpec,

    selectedBrand,

    selectedCompany,

  ]);


  useEffect(() => {
    if (selectedBrand && !filteredBrands.some(b => b._id === selectedBrand)) {
      setSelectedBrand('');
      setSelectedSpec('');
      setSelectedVariant('');
    }
  }, [filteredBrands, selectedBrand]);

  useEffect(() => {
    if (selectedSpec && !filteredBottleSpecs.some(s => s._id === selectedSpec)) {
      setSelectedSpec('');
      setSelectedVariant('');
    }
  }, [filteredBottleSpecs, selectedSpec]);

  useEffect(() => {
    if (selectedVariant && !filteredVariants.some(v => v._id === selectedVariant)) {
      setSelectedVariant('');
    }
  }, [filteredVariants, selectedVariant]);



  const handleExport = async () => {
    try {
      Swal.fire({
        title: 'Generating Export...',
        text: 'Please wait while we fetch the data.',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      // Fetch all productions matching current filters but without pagination
      const response = await API.get("/production", {
        params: {
          companyId: selectedCompany,
          brandId: selectedBrand,
          bottleSpecId: selectedSpec,
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

      const data = allProductions.map((p, index) => ({
        'Sr No': index + 1,
        'Date': parseProductionDate(p.date)?.toLocaleDateString() || 'N/A',
        'Company': p.brandId?.companyId?.name || 'N/A',
        'Brand': p.brandId?.name || 'N/A',
        'Bottle Name': p.bottleSpecId?.bottleName || 'N/A',
        'Variant Name': p.variantId?.variantName || 'N/A',
        'Coating Shade': p.variantId?.coatingShade ||
          variants.find(v => v._id === (p.variantId?._id || p.variantId))?.coatingShade ||
          'N/A',
        'Text Color': p.variantId?.detectedTextColor ||
          variants.find(v => v._id === (p.variantId?._id || p.variantId))?.detectedTextColor ||
          'N/A',
        'Total Printed Bottles': p.totalPrinted,
        'Bottles Per Box': p.bottlePerBox,
        'Total Boxes': p.totalBoxes,
        'Extra Printed Bottles': p.remainingBottles
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      // Define column widths for Sr No, Date, Company, Brand only
      const wscols = [
        { wch: 8 },   // Sr No
        { wch: 15 },  // Date
        { wch: 20 },  // Company
        { wch: 20 },  // Brand
        { wch: 20 },  // Bottle Name
        { wch: 25 },  // Variant Name
        { wch: 20 },  // Coating Shade
        { wch: 25 },  // Text Color
        { wch: 15 },  // Total Printed Bottles
        { wch: 15 },  // Bottles Per Box
        { wch: 15 },  // Total Boxes
        { wch: 15 },  // Extra Printed Bottles
      ];
      worksheet['!cols'] = wscols;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Printing Production Report");

      // Generate filename based on dates
      let filename = "Printing_Production_Report";
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
          <h1 className="page-title">Printing Production</h1>
          <p className="page-subtitle">Track and manage daily production entries</p>
        </div>
        <div className="d-flex align-items-center gap-3 productions-page-actions">
          <button onClick={handleExport} className="btn btn-outline-success shadow-sm px-4 py-2 rounded-3">
            <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
          </button>
          <Can I="create" a="production">
            <Link to="/productions/add" className="btn-accent shadow-sm px-4 py-2 rounded-3">
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
                onChange={(e) => {

                  setSearchParams({ page: 1 });

                  setStartDate(e.target.value);

                }}
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">To</label>
              <input
                type="date"
                className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                style={{ borderRadius: 10, height: 38 }}
                value={endDate}
                onChange={(e) => {

                  setSearchParams({ page: 1 });

                  setEndDate(e.target.value);

                }}
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
                  setSelectedVariant('');
                }}
                className="react-select-container"
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                styles={{
                  control: (base) => ({
                    ...base,
                    borderRadius: 10,
                    minHeight: 38,
                    borderColor: 'var(--bs-border-color-translucent)',
                    backgroundColor: 'var(--bs-light)',
                    boxShadow: 'none',
                    '&:hover': { borderColor: 'var(--bs-border-color)' }
                  }),
                  menuPortal: base => ({ ...base, zIndex: 9999 })
                }}
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
                  setSelectedVariant('');
                }}
                className="react-select-container"
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                styles={{
                  control: (base) => ({
                    ...base,
                    borderRadius: 10,
                    minHeight: 38,
                    borderColor: 'var(--bs-border-color-translucent)',
                    backgroundColor: 'var(--bs-light)',
                    boxShadow: 'none',
                    '&:hover': { borderColor: 'var(--bs-border-color)' }
                  }),
                  menuPortal: base => ({ ...base, zIndex: 9999 })
                }}
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Bottle Spec</label>
              <Select
                options={[{ value: '', label: 'All Specs' }, ...filteredBottleSpecs.map(s => ({ value: s._id, label: `${s.bottleName} (${s.code || 'No Code'})` }))]}
                value={selectedSpec ? { value: selectedSpec, label: filteredBottleSpecs.find(s => s._id === selectedSpec) ? `${filteredBottleSpecs.find(s => s._id === selectedSpec).bottleName} (${filteredBottleSpecs.find(s => s._id === selectedSpec).code || 'No Code'})` : 'Unknown' } : { value: '', label: 'All Specs' }}
                onChange={(option) => {
                  setSearchParams({ page: 1 });
                  setSelectedSpec(option.value);
                  setSelectedVariant('');
                }}
                className="react-select-container"
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                styles={{
                  control: (base) => ({
                    ...base,
                    borderRadius: 10,
                    minHeight: 38,
                    borderColor: 'var(--bs-border-color-translucent)',
                    backgroundColor: 'var(--bs-light)',
                    boxShadow: 'none',
                    '&:hover': { borderColor: 'var(--bs-border-color)' }
                  }),
                  menuPortal: base => ({ ...base, zIndex: 9999 })
                }}
              />
            </div>
            <div className="col-12 col-sm-6 col-md-4 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Variant</label>
              <Select
                options={[{ value: '', label: 'All Variants' }, ...filteredVariants.map(v => ({ value: v._id, label: v.variantSize ? `${v.variantName} (${v.variantSize})` : v.variantName }))]}
                value={selectedVariant
                  ? {
                    value: selectedVariant,
                    label: (() => {
                      const v = filteredVariants.find(v => v._id === selectedVariant);
                      return v ? (v.variantSize ? `${v.variantName} (${v.variantSize})` : v.variantName) : 'Unknown';
                    })()
                  }
                  : { value: '', label: 'All Variants' }
                }
                onChange={(option) => {
                  setSearchParams({ page: 1 });
                  setSelectedVariant(option.value);
                }}
                className="react-select-container"
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                styles={{
                  control: (base) => ({
                    ...base,
                    borderRadius: 10,
                    minHeight: 38,
                    borderColor: 'var(--bs-border-color-translucent)',
                    backgroundColor: 'var(--bs-light)',
                    boxShadow: 'none',
                    '&:hover': { borderColor: 'var(--bs-border-color)' }
                  }),
                  menuPortal: base => ({ ...base, zIndex: 9999 })
                }}
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

                  dispatch(setSearchTerm(''));

                  setStartDate('');

                  setEndDate('');

                  setSelectedCompany('');

                  setSelectedBrand('');

                  setSelectedSpec('');

                  setSelectedVariant('');

                  setSearchParams({
                    page: 1,
                  });

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
              onChange={(e) => {

                setSearchParams({ page: 1 });

                dispatch(clearProductions());

                setLimit(Number(e.target.value));

              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span>entries</span>
          </div>
        </div>

        <div className="companies-list-mobile">
          {productions.map((p, index) => {
            const variantId = p.variantId?._id || p.variantId;
            const variantImage =
              p.variantId?.image ||
              variants.find(v => v._id === variantId)?.image;
            return (
              <div key={p._id} className="companies-mobile-card brands-mobile-card">
                <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                  {variantImage ? (
                    <img
                      src={`${V_URL}${variantImage}`}
                      alt={p.variantId?.variantName || 'Bottle'}
                      className="companies-mobile-avatar"
                      style={{ objectFit: 'cover', borderRadius: 10 }}
                    />
                  ) : (
                    <div className="companies-mobile-avatar bg-light text-muted d-flex align-items-center justify-content-center">
                      <i className="bi bi-image" />
                    </div>
                  )}
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <span className="text-muted small fw-bold">#{String((currentPage - 1) * limit + index + 1).padStart(2, '0')}</span>
                      <span className="fw-semibold">{formatProductionDate(p.date)}</span>
                    </div>
                    <div className="small text-muted">
                      {p.brandId?.companyId?.name || p.bottleSpecId?.brandId?.companyId?.name || 'N/A'} · {p.brandId?.name || p.bottleSpecId?.brandId?.name || 'N/A'}
                    </div>
                    <div className="small fw-600 text-truncate">{p.bottleSpecId?.bottleName || '—'}</div>
                    <div className="small text-muted">
                      {p.variantId?.variantName} {p.variantId?.variantSize ? `(${p.variantId.variantSize})` : ''}
                    </div>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      <span className="badge bg-soft-primary text-primary small">{p.totalBoxes} Boxes</span>
                      <span className="badge bg-light text-dark border small">{p.totalPrinted} pcs</span>
                      {(p.remainingBottles ?? 0) > 0 && (
                        <span className="badge bg-soft-warning text-warning-accent small">{p.remainingBottles} extra</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="companies-mobile-actions brands-mobile-actions">
                  <Can I="read" a="productiondetail">
                    <Link to={`/productions/view/${p._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none companies-mobile-action-btn" title="View">
                      <i className="bi bi-eye fs-6" />
                    </Link>
                  </Can>
                  <Can I="edit" a="production">
                    <Link to={`/productions/edit/${p._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Edit">
                      <i className="bi bi-pencil-square fs-6" />
                    </Link>
                  </Can>
                  <Can I="delete" a="production">
                    <button type="button" onClick={() => handleDelete(p._id)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Delete">
                      <i className="bi bi-trash fs-6" />
                    </button>
                  </Can>
                </div>
              </div>
            );
          })}
          {productions.length === 0 && !loading && (
            <div className="companies-mobile-empty">No production logs found</div>
          )}
        </div>

        <div className="companies-list-desktop" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="py-3 text-uppercase small fw-bold text-muted ps-5 text-start" style={{ width: 120 }}>Sr No</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Date</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 80 }}>Image</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Company & Brand</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Product & Variant</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Qty / Boxes</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {productions.map((p, index) => {
                const variantId = p.variantId?._id || p.variantId;
                const variantImage =
                  p.variantId?.image ||
                  variants.find(v => v._id === variantId)?.image;
                return (
                  <tr key={p._id} className="align-middle border-bottom transition-all hover-bg-light">
                    <td className="py-3 ps-5 text-start">
                      <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{String((currentPage - 1) * limit + index + 1).padStart(2, '0')}</span>
                    </td>
                    <td className="py-3 text-center">
                      <div className="fw-600 text-dark">{formatProductionDate(p.date)}</div>
                      {daysFromToday(p.date) <= 2 && (
                        <div className="small text-muted" style={{ fontSize: 11 }}>
                          {parseProductionDate(p.date)?.toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {variantImage ? (
                        <img
                          src={`${V_URL}${variantImage}`}
                          alt={p.variantId?.variantName || 'Bottle'}
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                        />
                      ) : (
                        <div
                          className="bg-light d-flex align-items-center justify-content-center text-muted mx-auto"
                          style={{ width: 48, height: 48, borderRadius: 8, fontSize: 18 }}
                        >
                          <i className="bi bi-image" />
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <div className="fw-bold text-dark mb-1" style={{ fontSize: 14 }}>
                        {p.brandId?.companyId?.name || p.bottleSpecId?.brandId?.companyId?.name || 'N/A'}
                      </div>
                      <div className="fw-600 text-accent" style={{ fontSize: 13 }}>
                        {p.brandId?.name || p.bottleSpecId?.brandId?.name || 'Deleted Brand'}
                      </div>
                      <div className="fw-500 text-dark small">{p.bottleSpecId?.bottleName || '—'}</div>
                      <div className="small text-muted" style={{ fontSize: 11 }}>
                        {p.bottleSpecId?.printingTypeId?.name || 'N/A'} — {p.bottleSpecId?.printingColorId?.name || 'No Color'}
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <div className="fw-600 text-dark">{p.variantId?.productName}</div>
                      <div className="small text-muted mb-1">{p.variantId?.variantName} {p.variantId?.variantSize ? `(${p.variantId.variantSize})` : ''}</div>
                      {p.variantId?.coatingShade && (
                        <span className="badge bg-soft-warning text-warning-accent px-2 py-1 mt-1" style={{ fontSize: 10 }}>
                          Coating: {p.variantId.coatingShade}
                        </span>
                      )}
                      {p.variantId?.detectedTextColor && (
                        <span className="badge bg-light text-dark border px-2 py-1 mt-1" style={{ fontSize: 10 }}>
                          Text: {p.variantId.detectedTextColor}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <div className="d-flex flex-column align-items-center gap-1">
                        <div className="fw-bold text-dark">{p.totalPrinted} <small className="text-muted fw-normal">pcs</small></div>
                        <span className="badge bg-soft-primary text-primary rounded-pill px-3 py-1" style={{ fontSize: 12 }}>
                          {p.totalBoxes} <small className="fw-normal">Boxes</small>
                        </span>
                        <span className="badge bg-soft-warning text-warning-accent rounded-pill px-3 py-1" style={{ fontSize: 12 }}>
                          {p.remainingBottles ?? 0} <small className="fw-normal">Extra Printed Bottles</small>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <div className="d-flex gap-2 justify-content-center">
                        <Can I="read" a="productiondetail">
                          <Link to={`/productions/view/${p._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View">
                            <i className="bi bi-eye fs-6" />
                          </Link>
                        </Can>
                        <Can I="edit" a="production">
                          <Link to={`/productions/edit/${p._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit">
                            <i className="bi bi-pencil-square fs-6" />
                          </Link>
                        </Can>
                        <Can I="delete" a="production">
                          <button onClick={() => handleDelete(p._id)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete">
                            <i className="bi bi-trash fs-6" />
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {productions.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">No production logs found</td>
                </tr>
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

