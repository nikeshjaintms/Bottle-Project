import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateCompanyAddress, fetchCompanyAddresses } from '../../redux/slices/companyAddressSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import SearchableSelect from '../../components/SearchableSelect';
import Swal from 'sweetalert2';
import API from '../../services/api';

export default function EditCompanyAddress() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { companies = [] } = useSelector((state) => state.companies);
  const { addresses = [], loading } = useSelector((state) => state.companyAddresses);

  const [formData, setFormData] = useState({
    companyId: '',
    addressType: 'Billing',
    addressTitle: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    gstNo: '',
    contactPerson: '',
    contactPhone: '',
    isDefault: false,
    status: 'active',
  });

  const [initialLoading, setInitialLoading] = useState(true);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
  }, [dispatch]);

  // Load existing address data
  useEffect(() => {
    let found = addresses.find((a) => a._id === id);
    if (found) {
      setFormData({
        companyId: found.companyId?._id || found.companyId || '',
        addressType: found.addressType || 'Billing',
        addressTitle: found.addressTitle || '',
        addressLine1: found.addressLine1 || '',
        addressLine2: found.addressLine2 || '',
        city: found.city || '',
        state: found.state || '',
        pincode: found.pincode || '',
        gstNo: found.gstNo || '',
        contactPerson: found.contactPerson || '',
        contactPhone: found.contactPhone || '',
        isDefault: Boolean(found.isDefault),
        status: found.status === true || found.status === 'active' ? 'active' : 'inactive',
      });
      setInitialLoading(false);
    } else {
      // If not in redux state, fetch directly
      API.get(`/company-address/${id}`)
        .then((res) => {
          const data = res.data?.data;
          if (data) {
            setFormData({
              companyId: data.companyId?._id || data.companyId || '',
              addressType: data.addressType || 'Billing',
              addressTitle: data.addressTitle || '',
              addressLine1: data.addressLine1 || '',
              addressLine2: data.addressLine2 || '',
              city: data.city || '',
              state: data.state || '',
              pincode: data.pincode || '',
              gstNo: data.gstNo || '',
              contactPerson: data.contactPerson || '',
              contactPhone: data.contactPhone || '',
              isDefault: Boolean(data.isDefault),
              status: data.status === true || data.status === 'active' ? 'active' : 'inactive',
            });
          }
        })
        .catch((err) => {
          Swal.fire('Error', 'Unable to load company address details.', 'error');
        })
        .finally(() => setInitialLoading(false));
    }
  }, [id, addresses]);

  const companyOptions = companies.map((c) => ({
    value: c._id,
    label: c.name,
  }));

  const validate = () => {
    const errs = {};
    if (!formData.companyId) {
      errs.companyId = 'Please select a company';
    }
    if (!formData.addressLine1 || !formData.addressLine1.trim()) {
      errs.addressLine1 = 'Address Line 1 is mandatory';
    }
    if (formData.gstNo && formData.gstNo.trim().length > 0) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(formData.gstNo.trim().toUpperCase())) {
        errs.gstNo = 'Invalid GST format (e.g. 24AAAAA0000A1Z5)';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleCompanyChange = (val) => {
    setFormData((prev) => ({ ...prev, companyId: val }));
    if (errors.companyId) {
      setErrors((prev) => ({ ...prev, companyId: '' }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please correct the highlighted fields before saving.',
      });
      return;
    }

    dispatch(updateCompanyAddress({ id, formData })).then((res) => {
      if (!res.error) {
        Swal.fire('Success!', 'Company address updated successfully!', 'success');
        navigate('/company-addresses');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update address.', 'error');
      }
    });
  };

  if (initialLoading) {
    return (
      <div className="page-content text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link
          to="/company-addresses"
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
          <h1 className="page-title">Edit Company Address</h1>
          <p className="page-subtitle">Modify address and contact details</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-9 col-xl-8">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  {/* Company Selection */}
                  <div className="col-md-7">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Company <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={companyOptions}
                      value={formData.companyId}
                      onChange={handleCompanyChange}
                      placeholder="-- Select Company --"
                      isInvalid={Boolean(errors.companyId)}
                    />
                    {errors.companyId && (
                      <div className="text-danger small mt-1">{errors.companyId}</div>
                    )}
                  </div>

                  {/* Address Type */}
                  <div className="col-md-5">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Address Type <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select custom-input-field"
                      name="addressType"
                      value={formData.addressType}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                      required
                    >
                      <option value="Billing">Billing Address</option>
                      <option value="Shipping">Shipping / Delivery Address</option>
                      <option value="Plant">Plant / Factory</option>
                      <option value="Warehouse">Warehouse / Godown</option>
                      <option value="Head Office">Head Office</option>
                      <option value="Branch Office">Branch Office</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Address Title */}
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Address Title / Branch Name <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="addressTitle"
                      placeholder="e.g. Unit 2 - Sanand Plant, Corporate HQ, Central Depot"
                      value={formData.addressTitle}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  {/* Address Line 1 */}
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Address Line 1 <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className={`form-control custom-input-field ${
                        errors.addressLine1 ? 'is-invalid' : ''
                      }`}
                      name="addressLine1"
                      placeholder="Flat / Plot / Survey No, Building name, Street"
                      required
                      value={formData.addressLine1}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                    {errors.addressLine1 && (
                      <div className="invalid-feedback">{errors.addressLine1}</div>
                    )}
                  </div>

                  {/* Address Line 2 */}
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Address Line 2 <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="addressLine2"
                      placeholder="Area, Landmark, Road name"
                      value={formData.addressLine2}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  {/* City */}
                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">City</label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="city"
                      placeholder="e.g. Ahmedabad, Mumbai"
                      value={formData.city}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  {/* State */}
                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">State</label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="state"
                      placeholder="e.g. Gujarat, Maharashtra"
                      value={formData.state}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  {/* Pincode */}
                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">Pincode</label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="pincode"
                      placeholder="e.g. 382110"
                      value={formData.pincode}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  {/* GST No */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      GST Number <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className={`form-control custom-input-field ${errors.gstNo ? 'is-invalid' : ''}`}
                      name="gstNo"
                      placeholder="e.g. 24AAAAA0000A1Z5"
                      value={formData.gstNo}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, gstNo: e.target.value.toUpperCase() }))
                      }
                      style={{ borderRadius: 12 }}
                    />
                    {errors.gstNo && <div className="invalid-feedback">{errors.gstNo}</div>}
                  </div>

                  {/* Status */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Status</label>
                    <select
                      className="form-select custom-input-field"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Contact Person */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Contact Person <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="contactPerson"
                      placeholder="Site supervisor / Dispatch manager"
                      value={formData.contactPerson}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  {/* Contact Phone */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Contact Phone <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="contactPhone"
                      placeholder="Phone or mobile number"
                      value={formData.contactPhone}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  {/* Is Default Checkbox */}
                  <div className="col-md-12 pt-2">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="isDefaultSwitch"
                        name="isDefault"
                        checked={formData.isDefault}
                        onChange={handleChange}
                        style={{ cursor: 'pointer' }}
                      />
                      <label
                        className="form-check-label fw-500 ms-2"
                        htmlFor="isDefaultSwitch"
                        style={{ cursor: 'pointer' }}
                      >
                        Set as Default Address for this Company
                      </label>
                    </div>
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="d-flex gap-2 mt-4 user-form-actions">
                  <button
                    type="submit"
                    className="btn-accent px-5 py-3 flex-grow-1"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Updating...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check2-circle me-2" /> Update Address
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/company-addresses')}
                    className="btn-ghost px-5 py-3"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
