import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Can } from '../../context/AbilityContext';
import API from '../../services/api';

const Detail = ({ label, value, icon }) => (
  <div className="company-address-detail">
    <span className="company-address-detail-icon"><i className={`bi ${icon}`} /></span>
    <div>
      <div className="company-address-detail-label">{label}</div>
      <div className="company-address-detail-value">{value || <span className="text-muted">Not provided</span>}</div>
    </div>
  </div>
);

export default function ViewCompanyAddress() {
  const { id } = useParams();
  const [result, setResult] = useState({ id: null, address: null, loading: true, error: '' });

  useEffect(() => {
    let active = true;
    API.get(`/company-address/${id}`)
      .then((response) => {
        if (active) {
          setResult({ id, address: response.data?.data || null, loading: false, error: '' });
        }
      })
      .catch(() => {
        if (active) {
          setResult({ id, address: null, loading: false, error: 'Unable to load company address details.' });
        }
      });

    return () => {
      active = false;
    };
  }, [id]);

  const loading = result.id !== id || result.loading;
  const address = result.id === id ? result.address : null;
  const error = result.id === id ? result.error : '';

  if (loading) {
    return (
      <div className="page-content company-address-view-page text-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading address details...</span>
        </div>
      </div>
    );
  }

  if (error || !address) {
    return (
      <div className="page-content company-address-view-page">
        <div className="company-address-view-error">
          <i className="bi bi-exclamation-circle" />
          <p>{error || 'Company address not found.'}</p>
          <Link to="/company-addresses" className="btn-accent">Back to addresses</Link>
        </div>
      </div>
    );
  }

  const companyName = typeof address.companyId === 'object'
    ? address.companyId?.name
    : address.companyName;
  const statusActive = address.status === true || address.status === 'active' || address.status === undefined;
  const fullAddress = [address.addressLine1, address.addressLine2, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="page-content company-address-view-page">
      <div className="page-header d-flex align-items-center gap-3">
        <Link to="/company-addresses" className="btn-ghost company-address-back" aria-label="Back to company addresses">
          <i className="bi bi-arrow-left" />
        </Link>
        <div className="company-address-heading">
          <span className="company-address-heading-icon"><i className="bi bi-geo-alt" /></span>
          <div>
            <h1 className="page-title">{address.addressTitle || 'Company Address'}</h1>
            <p className="page-subtitle">{companyName || 'Address details'}</p>
          </div>
        </div>
        <div className="company-address-view-actions ms-auto">
          <Link to="/company-addresses" className="btn-ghost">Back to list</Link>
          <Can I="edit" a="company-address">
            <Link to={`/company-addresses/edit/${id}`} className="btn-accent">
              <i className="bi bi-pencil-square me-2" />Edit address
            </Link>
          </Can>
        </div>
      </div>

      <section className="dash-card company-address-view-card">
        <div className="company-address-view-banner">
          <div>
            <span className="company-address-type">{address.addressType || 'Address'}</span>
            {address.isDefault && <span className="company-address-default"><i className="bi bi-check-circle-fill me-1" />Default address</span>}
            <h2>{address.addressTitle || address.addressType || 'Company Address'}</h2>
            <p><i className="bi bi-building me-2" />{companyName || 'Company'}</p>
          </div>
          <span className={`company-address-status ${statusActive ? 'is-active' : 'is-inactive'}`}>
            <span />{statusActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="company-address-view-content">
          <div className="company-address-view-section">
            <h3><i className="bi bi-signpost-2" /> Location</h3>
            <div className="company-address-location">
              <i className="bi bi-geo-alt-fill" />
              <span>{fullAddress || 'No address details provided'}</span>
            </div>
            <div className="company-address-detail-grid">
              <Detail label="City" value={address.city} icon="bi-buildings" />
              <Detail label="State" value={address.state} icon="bi-map" />
              <Detail label="Pincode" value={address.pincode} icon="bi-mailbox" />
            </div>
          </div>
          <div className="company-address-view-section">
            <h3><i className="bi bi-receipt" /> Tax details</h3>
            <div className="company-address-detail-grid">
              <Detail label="GST number" value={address.gstNo} icon="bi-card-text" />
              <Detail label="Address type" value={address.addressType} icon="bi-tags" />
            </div>
          </div>
          <div className="company-address-view-section">
            <h3><i className="bi bi-person-lines-fill" /> Contact information</h3>
            <div className="company-address-detail-grid">
              <Detail label="Contact person" value={address.contactPerson} icon="bi-person" />
              <Detail label="Contact phone" value={address.contactPhone} icon="bi-telephone" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
