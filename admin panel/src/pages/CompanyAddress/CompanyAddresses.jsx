import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Can } from '../../context/AbilityContext';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCompanyAddresses,
  deleteCompanyAddress,
  setSearchTerm,
} from '../../redux/slices/companyAddressSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import SearchableSelect from '../../components/SearchableSelect';
import Swal from 'sweetalert2';

export default function CompanyAddresses() {
  const dispatch = useDispatch();
  const { addresses: companyGroups = [], loading, page, totalPages, total, searchTerm } = useSelector(
    (state) => state.companyAddresses
  );
  const { companies = [] } = useSelector((state) => state.companies);

  const search = searchTerm || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get('page') || '';
  const currentPage = Number(urlPage) || page || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expandedCompanies, setExpandedCompanies] = useState({});

  // Fetch all companies for the filter selector
  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
  }, [dispatch]);

  // Fetch grouped company addresses
  const loadData = () => {
    const params = {
      page: currentPage,
      limit: itemsPerPage,
      search,
      grouped: 'true',
    };
    if (selectedCompanyId) {
      params.companyId = selectedCompanyId;
    }
    if (selectedType) {
      params.addressType = selectedType;
    }

    dispatch(fetchCompanyAddresses(params));
  };

  useEffect(() => {
    loadData();
  }, [dispatch, currentPage, itemsPerPage, search, selectedCompanyId, selectedType]);

  // Automatically expand companies that have addresses by default
  useEffect(() => {
    if (companyGroups.length > 0) {
      const nextExpanded = {};
      companyGroups.forEach((group) => {
        // Expand if it has addresses or if user is searching
        nextExpanded[group._id] = group.addressCount > 0 || Boolean(search);
      });
      setExpandedCompanies(nextExpanded);
    }
  }, [companyGroups, search]);

  const toggleExpand = (companyId) => {
    setExpandedCompanies((prev) => ({
      ...prev,
      [companyId]: !prev[companyId],
    }));
  };

  const handleExpandAll = () => {
    const next = {};
    companyGroups.forEach((g) => {
      next[g._id] = true;
    });
    setExpandedCompanies(next);
  };

  const handleCollapseAll = () => {
    setExpandedCompanies({});
  };

  const handleDeleteAddress = (id, title, companyName) => {
    Swal.fire({
      title: 'Delete Address?',
      text: `Are you sure you want to delete this address${title ? ` (${title})` : ''} for "${companyName}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete!',
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteCompanyAddress(id)).then((res) => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Company address removed.', 'success');
            loadData();
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete address.', 'error');
          }
        });
      }
    });
  };

  const isCompanyActive = (c) =>
    c.status === true || c.status === 'active' || c.status === undefined;

  const typeBadgeColors = {
    Billing: 'bg-primary text-white',
    Shipping: 'bg-info text-dark',
    Plant: 'bg-warning text-dark',
    Warehouse: 'bg-secondary text-white',
    'Head Office': 'bg-success text-white',
    'Branch Office': 'bg-dark text-white',
    Other: 'bg-light text-dark border',
  };

  const companyOptions = companies.map((c) => ({
    value: c._id,
    label: c.name,
  }));

  const totalAddressCount = companyGroups.reduce((acc, c) => acc + (c.addressCount || 0), 0);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title">Company Addresses</h1>
          <p className="page-subtitle">
            View all companies, their address count, and detailed addresses in a single view
          </p>
        </div>
        <Can I="create" a="company-address">
          <Link to="/company-addresses/add" className="btn-accent companies-header-action">
            <i className="bi bi-plus-circle-fill me-2" /> Add New Address
          </Link>
        </Can>
      </div>

      {/* Main Card */}
      <div className="dash-card">
        {/* Toolbar & Filters */}
        <div className="dash-card-header p-3 border-bottom bg-white">
          <div className="row g-2 align-items-center">
            {/* Entries count */}
            <div className="col-auto d-flex align-items-center gap-2 text-muted small fw-500">
              <span>Show</span>
              <select
                className="form-select form-select-sm shadow-none border-light-subtle bg-light"
                style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
                value={itemsPerPage}
                onChange={(e) => {
                  setSearchParams({ page: 1 });
                  setItemsPerPage(Number(e.target.value));
                }}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
              <span>companies</span>
            </div>

            {/* Filter by Company */}
            <div className="col-md-3 col-sm-6">
              <div style={{ minWidth: 180 }}>
                <SearchableSelect
                  options={companyOptions}
                  value={selectedCompanyId}
                  onChange={(val) => {
                    setSelectedCompanyId(val);
                    setSearchParams({ page: 1 });
                  }}
                  placeholder="All Companies"
                  style={{ fontSize: 13, padding: '6px 12px' }}
                />
              </div>
            </div>

            {/* Filter by Type */}
            <div className="col-md-2 col-sm-6">
              <select
                className="form-select form-select-sm border-light-subtle bg-light shadow-none"
                style={{ borderRadius: 10, fontSize: 13, height: 38 }}
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setSearchParams({ page: 1 });
                }}
              >
                <option value="">All Address Types</option>
                <option value="Billing">Billing</option>
                <option value="Shipping">Shipping</option>
                <option value="Plant">Plant</option>
                <option value="Warehouse">Warehouse</option>
                <option value="Head Office">Head Office</option>
                <option value="Branch Office">Branch Office</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Expand / Collapse All Buttons */}
            <div className="col-auto d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary rounded-3 shadow-none px-2"
                onClick={handleExpandAll}
                title="Expand All Companies"
                style={{ fontSize: 12 }}
              >
                <i className="bi bi-arrows-expand me-1" /> Expand All
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary rounded-3 shadow-none px-2"
                onClick={handleCollapseAll}
                title="Collapse All Companies"
                style={{ fontSize: 12 }}
              >
                <i className="bi bi-arrows-collapse me-1" /> Collapse All
              </button>
            </div>

            {/* Search Input */}
            <div className="col-md-3 ms-auto">
              <div className="search-input-wrapper position-relative">
                <i
                  className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3"
                  style={{ pointerEvents: 'none' }}
                />
                <input
                  type="text"
                  className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
                  placeholder="Search company, address, city, GST..."
                  value={search}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchParams({ page: 1 });
                    dispatch(setSearchTerm(val));
                  }}
                  style={{ borderRadius: 10, fontSize: 13 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile View */}
        <div className="d-md-none p-3">
          {companyGroups.map((group, index) => {
            const isExpanded = Boolean(expandedCompanies[group._id]);
            return (
              <div key={group._id} className="card border rounded-3 mb-3 shadow-sm overflow-hidden">
                <div
                  className="card-header bg-white d-flex align-items-center justify-content-between p-3"
                  onClick={() => toggleExpand(group._id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-light text-dark">
                      #{String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h6 className="mb-0 fw-bold">{group.name}</h6>
                      <span
                        className={`badge ${
                          group.addressCount > 0 ? 'bg-primary-subtle text-primary' : 'bg-light text-muted'
                        } mt-1`}
                        style={{ fontSize: 11 }}
                      >
                        <i className="bi bi-geo-alt me-1" />
                        {group.addressCount} {group.addressCount === 1 ? 'Address' : 'Addresses'}
                      </span>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <Link
                      to={`/company-addresses/add?companyId=${group._id}`}
                      className="btn btn-sm btn-outline-primary py-1 px-2"
                      onClick={(e) => e.stopPropagation()}
                      title="Add Address for this company"
                    >
                      <i className="bi bi-plus-lg" />
                    </Link>
                    <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} text-muted fs-5`} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="card-body bg-light p-3 border-top">
                    {group.addresses.length === 0 ? (
                      <div className="text-center py-3 text-muted small">
                        No addresses recorded yet.{' '}
                        <Link to={`/company-addresses/add?companyId=${group._id}`} className="fw-bold">
                          Add one now
                        </Link>
                      </div>
                    ) : (
                      group.addresses.map((addr) => (
                        <div key={addr._id} className="bg-white rounded-3 p-3 mb-2 border shadow-none">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <span
                              className={`badge ${typeBadgeColors[addr.addressType] || 'bg-secondary text-white'}`}
                              style={{ fontSize: 11 }}
                            >
                              {addr.addressType}
                            </span>
                            {addr.isDefault && (
                              <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: 10 }}>
                                Default
                              </span>
                            )}
                          </div>
                          {addr.addressTitle && (
                            <div className="fw-semibold text-primary small mb-1">{addr.addressTitle}</div>
                          )}
                          <div className="text-muted small mb-1">
                            {addr.addressLine1}
                            {addr.addressLine2 ? `, ${addr.addressLine2}` : ''}
                          </div>
                          {(addr.city || addr.state || addr.pincode) && (
                            <div className="text-secondary small mb-1">
                              {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                            </div>
                          )}
                          {addr.gstNo && (
                            <div className="small text-muted mb-1">
                              <strong>GST:</strong> {addr.gstNo}
                            </div>
                          )}
                          {(addr.contactPerson || addr.contactPhone) && (
                            <div className="small text-muted mb-2">
                              <strong>Contact:</strong> {addr.contactPerson} {addr.contactPhone ? `(${addr.contactPhone})` : ''}
                            </div>
                          )}
                          <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                            <Can I="edit" a="company-address">
                              <Link
                                to={`/company-addresses/edit/${addr._id}`}
                                className="btn btn-sm btn-outline-primary py-1 px-2"
                                title="Edit"
                              >
                                <i className="bi bi-pencil-square" /> Edit
                              </Link>
                            </Can>
                            <Can I="delete" a="company-address">
                              <button
                                type="button"
                                onClick={() => handleDeleteAddress(addr._id, addr.addressTitle, group.name)}
                                className="btn btn-sm btn-outline-danger py-1 px-2"
                                title="Delete"
                              >
                                <i className="bi bi-trash" />
                              </button>
                            </Can>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop Grouped View in Table Form */}
        <div className="companies-list-desktop d-none d-md-block" style={{ overflowX: 'auto' }}>
          <table className="table data-table mb-0 w-100 align-middle">
            <thead>
              <tr className="bg-light">
                <th className="py-3 text-uppercase small fw-bold text-muted ps-4" style={{ width: 60 }}>
                  #
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted" style={{ minWidth: 260 }}>
                  Company Name
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 180 }}>
                  Address Count
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 130 }}>
                  Company Status
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-end pe-4" style={{ width: 220 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {companyGroups.map((group, index) => {
                const isExpanded = Boolean(expandedCompanies[group._id]);
                const hasAddresses = group.addressCount > 0;

                return (
                  <React.Fragment key={group._id}>
                    {/* Primary Company Header Row */}
                    <tr
                      className={`border-bottom transition-all ${
                        isExpanded ? 'table-active' : 'hover-bg-light'
                      }`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleExpand(group._id)}
                    >
                      {/* Sr No & Chevron */}
                      <td className="py-3 ps-4">
                        <div className="d-flex align-items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-light p-1 border rounded-circle d-flex align-items-center justify-content-center shadow-none"
                            style={{ width: 24, height: 24 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(group._id);
                            }}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <i
                              className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} text-primary`}
                              style={{ fontSize: 11 }}
                            />
                          </button>
                          <span className="text-muted fw-bold" style={{ fontSize: 13 }}>
                            {String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}
                          </span>
                        </div>
                      </td>

                      {/* Company Name */}
                      <td className="py-3">
                        <div className="d-flex align-items-center gap-2">
                          <div
                            className="rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-bold"
                            style={{ width: 34, height: 34, fontSize: 14 }}
                          >
                            {group.name?.charAt(0).toUpperCase() || 'C'}
                          </div>
                          <div>
                            <div className="fw-bold text-dark fs-6">{group.name}</div>
                            <span className="text-muted small">
                              Created {group.createdAt ? new Date(group.createdAt).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Address Count Badge */}
                      <td className="py-3 text-center">
                        <span
                          className={`badge px-3 py-2 ${
                            hasAddresses
                              ? 'bg-primary-subtle text-primary border border-primary-subtle fw-semibold'
                              : 'bg-light text-muted border fw-normal'
                          }`}
                          style={{ fontSize: 12, borderRadius: 20 }}
                        >
                          <i className="bi bi-geo-alt-fill me-1" />
                          {group.addressCount} {group.addressCount === 1 ? 'Address' : 'Addresses'}
                        </span>
                      </td>

                      {/* Company Status */}
                      <td className="py-3 text-center">
                        <span className={`badge-status badge-${isCompanyActive(group) ? 'active' : 'inactive'}`}>
                          {isCompanyActive(group) ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 text-end pe-4" onClick={(e) => e.stopPropagation()}>
                        <div className="d-flex gap-2 justify-content-end align-items-center">
                          <Can I="create" a="company-address">
                            <Link
                              to={`/company-addresses/add?companyId=${group._id}`}
                              className="btn btn-sm btn-outline-primary rounded-3 shadow-none px-3 py-1 d-inline-flex align-items-center gap-1"
                              title="Add Address for this Company"
                            >
                              <i className="bi bi-plus-circle" /> Add Address
                            </Link>
                          </Can>
                          <button
                            type="button"
                            className="btn btn-sm btn-light border rounded-3 px-2 py-1 shadow-none"
                            onClick={() => toggleExpand(group._id)}
                            title={isExpanded ? 'Collapse Addresses' : 'View Addresses'}
                          >
                            <i className={`bi bi-${isExpanded ? 'eye-slash' : 'eye'} me-1`} />
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Sub-Row: Nested Table with All Addresses for this Company */}
                    {isExpanded && (
                      <tr className="bg-light">
                        <td colSpan={5} className="p-0 border-bottom">
                          <div className="p-3 bg-light-subtle border-start border-4 border-primary mx-3 my-2 rounded-3 shadow-sm">
                            <div className="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom">
                              <div className="d-flex align-items-center gap-2">
                                <i className="bi bi-diagram-3-fill text-primary" />
                                <span className="fw-bold small text-uppercase text-secondary">
                                  All Addresses for "{group.name}" ({group.addressCount})
                                </span>
                              </div>
                              <Can I="create" a="company-address">
                                <Link
                                  to={`/company-addresses/add?companyId=${group._id}`}
                                  className="btn btn-xs btn-primary text-white rounded-2 px-2 py-1 shadow-none"
                                  style={{ fontSize: 11 }}
                                >
                                  <i className="bi bi-plus-lg me-1" /> Add Address
                                </Link>
                              </Can>
                            </div>

                            {group.addresses.length === 0 ? (
                              <div className="text-center py-4 bg-white rounded-3 border">
                                <i className="bi bi-geo-alt text-muted fs-4 d-block mb-1" />
                                <span className="text-muted small">No address recorded yet for this company.</span>
                                <div className="mt-2">
                                  <Link
                                    to={`/company-addresses/add?companyId=${group._id}`}
                                    className="btn btn-sm btn-outline-primary"
                                    style={{ fontSize: 12 }}
                                  >
                                    <i className="bi bi-plus-circle me-1" /> Add First Address
                                  </Link>
                                </div>
                              </div>
                            ) : (
                              <div className="table-responsive bg-white rounded-3 border shadow-none">
                                <table className="table table-sm mb-0 align-middle">
                                  <thead className="bg-light">
                                    <tr>
                                      <th className="py-2 ps-3 small text-muted text-uppercase" style={{ width: 40 }}>
                                        #
                                      </th>
                                      <th className="py-2 small text-muted text-uppercase" style={{ width: 120 }}>
                                        Type
                                      </th>
                                      <th className="py-2 small text-muted text-uppercase" style={{ minWidth: 160 }}>
                                        Title / Branch
                                      </th>
                                      <th className="py-2 small text-muted text-uppercase" style={{ minWidth: 240 }}>
                                        Address Details
                                      </th>
                                      <th className="py-2 small text-muted text-uppercase" style={{ minWidth: 160 }}>
                                        City / State / Pin
                                      </th>
                                      <th className="py-2 small text-muted text-uppercase" style={{ minWidth: 150 }}>
                                        GST & Contact
                                      </th>
                                      <th className="py-2 small text-muted text-uppercase text-center" style={{ width: 90 }}>
                                        Status
                                      </th>
                                      <th className="py-2 pe-3 small text-muted text-uppercase text-center" style={{ width: 100 }}>
                                        Actions
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.addresses.map((addr, addrIdx) => (
                                      <tr key={addr._id} className="border-bottom hover-bg-light">
                                        {/* Sub-table Sr No */}
                                        <td className="ps-3 py-2 text-muted small fw-semibold">
                                          {addrIdx + 1}
                                        </td>

                                        {/* Type */}
                                        <td className="py-2">
                                          <span
                                            className={`badge ${
                                              typeBadgeColors[addr.addressType] || 'bg-secondary text-white'
                                            }`}
                                            style={{ fontSize: 11, borderRadius: 6 }}
                                          >
                                            {addr.addressType}
                                          </span>
                                        </td>

                                        {/* Title & Default */}
                                        <td className="py-2">
                                          <div className="fw-semibold text-dark small">
                                            {addr.addressTitle || <span className="text-muted fst-italic">Untitled</span>}
                                          </div>
                                          {addr.isDefault && (
                                            <span
                                              className="badge bg-success-subtle text-success border border-success-subtle mt-1"
                                              style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4 }}
                                            >
                                              <i className="bi bi-check-circle-fill me-1" />
                                              Default
                                            </span>
                                          )}
                                        </td>

                                        {/* Address Lines */}
                                        <td className="py-2 small">
                                          <div className="text-dark fw-500">{addr.addressLine1}</div>
                                          {addr.addressLine2 && (
                                            <div className="text-muted">{addr.addressLine2}</div>
                                          )}
                                        </td>

                                        {/* City / State / Pin */}
                                        <td className="py-2 small text-secondary">
                                          <div>
                                            {[addr.city, addr.state].filter(Boolean).join(', ') || '-'}
                                          </div>
                                          {addr.pincode && (
                                            <div className="text-muted">Pin: {addr.pincode}</div>
                                          )}
                                        </td>

                                        {/* GST & Contact */}
                                        <td className="py-2 small">
                                          {addr.gstNo && (
                                            <div>
                                              <span className="text-muted">GST:</span>{' '}
                                              <span className="font-monospace fw-semibold">{addr.gstNo}</span>
                                            </div>
                                          )}
                                          {addr.contactPerson && (
                                            <div className="text-secondary">
                                              <i className="bi bi-person me-1 text-muted" />
                                              {addr.contactPerson}
                                            </div>
                                          )}
                                          {addr.contactPhone && (
                                            <div className="text-muted">
                                              <i className="bi bi-telephone me-1 text-muted" />
                                              {addr.contactPhone}
                                            </div>
                                          )}
                                          {!addr.gstNo && !addr.contactPerson && !addr.contactPhone && (
                                            <span className="text-muted">-</span>
                                          )}
                                        </td>

                                        {/* Address Status */}
                                        <td className="py-2 text-center">
                                          <span
                                            className={`badge-status badge-${
                                              addr.status === true || addr.status === 'active' || addr.status === undefined
                                                ? 'active'
                                                : 'inactive'
                                            }`}
                                          >
                                            {addr.status === true || addr.status === 'active' || addr.status === undefined
                                              ? 'ACTIVE'
                                              : 'INACTIVE'}
                                          </span>
                                        </td>

                                        {/* Sub-table Actions */}
                                        <td className="py-2 pe-3 text-center">
                                          <div className="d-flex gap-1 justify-content-center">
                                            <Can I="edit" a="company-address">
                                              <Link
                                                to={`/company-addresses/edit/${addr._id}`}
                                                className="btn btn-sm btn-outline-primary border-0 rounded-2 p-1"
                                                title="Edit Address"
                                              >
                                                <i className="bi bi-pencil-square fs-6" />
                                              </Link>
                                            </Can>
                                            <Can I="delete" a="company-address">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleDeleteAddress(addr._id, addr.addressTitle, group.name)
                                                }
                                                className="btn btn-sm btn-outline-danger border-0 rounded-2 p-1"
                                                title="Delete Address"
                                              >
                                                <i className="bi bi-trash fs-6" />
                                              </button>
                                            </Can>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {companyGroups.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="text-center py-5 text-muted">
                    <div className="d-flex flex-column align-items-center justify-content-center gap-2">
                      <i className="bi bi-building-slash text-muted" style={{ fontSize: 36 }} />
                      <span className="fs-6">No companies found matching your criteria</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
          <div className="text-muted small fw-500">
            Showing <b>{total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</b> to{' '}
            <b>{Math.min(currentPage * itemsPerPage, total)}</b> of <b>{total}</b> companies (Total{' '}
            <b>{totalAddressCount}</b> addresses)
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === 1}
              onClick={() => {
                if (currentPage > 1) setSearchParams({ page: currentPage - 1 });
              }}
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
              for (let i = Math.max(2, left); i <= Math.min(totalPages - 1, right); i++) {
                pages.push(i);
              }
              if (right < totalPages - 1) pages.push('...');
              if (totalPages > 1) pages.push(totalPages);
              return pages.map((p, idx) =>
                p === '...' ? (
                  <span key={`e-${idx}`} className="px-1 text-muted" style={{ fontSize: 13 }}>
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`}
                    onClick={() => setSearchParams({ page: p })}
                  >
                    {p}
                  </button>
                )
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => {
                if (currentPage < totalPages) setSearchParams({ page: currentPage + 1 });
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
