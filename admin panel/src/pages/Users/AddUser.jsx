import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { addUser, uploadUserImage } from '../../redux/slices/userSlice';
import { fetchRoles } from '../../redux/slices/roleSlice';
import Swal from 'sweetalert2';

const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function AddUser() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.users);
  const { roles } = useSelector((state) => state.roles);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: '',
    status: 'active'
  });

  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errors, setErrors] = useState({
    name: '',
    email: '',
    password: ''
  });

  const validateField = (name, value) => {
    let error = '';
    if (!value || value.trim() === '') {
      error = `${name === 'name' ? 'Full Name' : name.charAt(0).toUpperCase() + name.slice(1)} is mandatory`;
    } else {
      if (name !== 'name' && /\s/.test(value)) {
        error = 'Whitespace is not allowed';
      } else if (name === 'name') {
        if (!/^[a-zA-Z\s]+$/.test(value)) {
          error = 'Full Name should only contain characters';
        }
      } else if (name === 'email') {
        if (!value.includes('@') || !value.endsWith('.com')) {
          error = 'Email must contain @ and end with .com';
        }
      } else if (name === 'password') {
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
          error = 'Password must contain at least one special character';
        }
      }
    }
    setErrors(prev => ({ ...prev, [name]: error }));
    return error;
  };

  const validateImage = (file) => {
    setImageError('');
    
    if (!file) return true;

    if (!ALLOWED_FORMATS.includes(file.type)) {
      setImageError('Invalid file type. Only JPG, PNG, and WEBP are allowed.');
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setImageError('File size exceeds 5MB limit');
      return false;
    }

    return true;
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file && validateImage(file)) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setImageError('');
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (!value.trim()) return;
    const error = validateField(name, value);
    if (error) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Warning',
        text: error,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const cleanValue = name === 'name' ? value : value.replace(/\s/g, '');
    setFormData(prev => ({ ...prev, [name]: cleanValue }));
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  useEffect(() => {
    dispatch(fetchRoles({ pagination: 'false' }));
  }, [dispatch]);

  useEffect(() => {
    if (roles.length > 0 && !formData.role) {
      setFormData(prev => ({ ...prev, role: roles[0]._id }));
    }
  }, [roles, formData.role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all fields before submission
    const nameError = validateField('name', formData.name);
    const emailError = validateField('email', formData.email);
    const passwordError = validateField('password', formData.password);

    if (nameError) return Swal.fire('Validation Error', nameError, 'error');
    if (emailError) return Swal.fire('Validation Error', emailError, 'error');
    if (passwordError) return Swal.fire('Validation Error', passwordError, 'error');

    if (!formData.role) return Swal.fire('Error', 'Please select a role', 'error');

    setIsSubmitting(true);

    try {
      const submitData = { ...formData };

      // Step 1: Create user
      const createResult = await dispatch(addUser(submitData));
      
      if (createResult.error) {
        setIsSubmitting(false);
        return Swal.fire('Error!', createResult.payload || 'Failed to create user.', 'error');
      }

      // Step 2: Upload image if selected
      if (selectedImage && createResult.payload?._id) {
        const uploadResult = await dispatch(uploadUserImage({
          id: createResult.payload._id,
          imageFile: selectedImage
        }));

        if (!uploadResult.error) {
          removeImage();
          setIsSubmitting(false);
          Swal.fire('Success!', 'User created with profile image.', 'success');
        } else {
          setIsSubmitting(false);
          Swal.fire('Success!', 'User created, but image upload failed.', 'warning');
        }
      } else {
        setIsSubmitting(false);
        Swal.fire('Success!', 'User created successfully.', 'success');
      }

      navigate('/users');
    } catch (err) {
      setIsSubmitting(false);
      Swal.fire('Error!', err.message || 'Failed to create user.', 'error');
    }
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/users" className="btn-ghost" style={{ width: 40, height: 40, padding: 0, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Add New User</h1>
          <p className="page-subtitle">Create a new team member account</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-7">
          <div className="dash-card">
            <div className="dash-card-header">
              <span className="dash-card-title">User Information</span>
            </div>
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit} autoComplete="off">
                <input
                  type="text"
                  name="prevent_autofill_username"
                  autoComplete="username"
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }}
                />
                <input
                  type="password"
                  name="prevent_autofill_password"
                  autoComplete="current-password"
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }}
                />
                <div className="row g-4">
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted" htmlFor="add-user-name">
                      Full Name <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                        <i className="bi bi-person text-muted" />
                      </span>
                      <input
                        id="add-user-name"
                        type="text"
                        name="name"
                        className={`form-control custom-input-field ${errors.name ? 'is-invalid' : ''}`}
                        required
                        autoComplete="off"
                        value={formData.name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        style={{ borderLeft: 'none', borderRadius: '0 12px 12px 0' }}
                      />
                      {errors.name && <div className="invalid-feedback">{errors.name}</div>}
                    </div>
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted" htmlFor="add-user-email">
                      Email Address <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                        <i className="bi bi-envelope text-muted" />
                      </span>
                      <input
                        id="add-user-email"
                        type="text"
                        name="email"
                        inputMode="email"
                        className={`form-control custom-input-field ${errors.email ? 'is-invalid' : ''}`}
                        required
                        autoComplete="off"
                        value={formData.email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        style={{ borderLeft: 'none', borderRadius: '0 12px 12px 0' }}
                      />
                      {errors.email && <div className="invalid-feedback">{errors.email}</div>}
                    </div>
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted" htmlFor="add-user-password">
                      Password <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                        <i className="bi bi-shield-lock text-muted" />
                      </span>
                      <input
                        id="add-user-password"
                        type="password"
                        name="password"
                        className={`form-control custom-input-field ${errors.password ? 'is-invalid' : ''}`}
                        required
                        autoComplete="new-password"
                        value={formData.password}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        style={{ borderLeft: 'none', borderRadius: '0 12px 12px 0' }}
                      />
                      {errors.password && <div className="invalid-feedback">{errors.password}</div>}
                    </div>
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">User Role</label>
                    <div className="d-flex flex-wrap gap-3 user-role-picker">
                      {roles.map((role) => (
                        <div key={role._id} style={{ minWidth: '140px' }} className="flex-fill user-role-option">
                          <input
                            type="radio"
                            className="btn-check"
                            name="role"
                            id={`role-${role._id}`}
                            checked={formData.role === role._id}
                            onChange={() => setFormData({ ...formData, role: role._id })}
                          />
                          <label className={`btn btn-outline-light w-100 py-3 d-flex flex-column align-items-center gap-2 ${formData.role === role._id ? 'active-role' : 'inactive-role'}`} htmlFor={`role-${role._id}`} style={{ borderRadius: 12, borderWidth: 2, transition: 'all 0.2s' }}>
                            <i className={`bi ${role.name === 'Admin' ? 'bi-shield-check' : role.name === 'Manager' ? 'bi-person-badge' : 'bi-person'} fs-4`} />
                            <span className="fw-bold">{role.name}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">Account Status</label>
                    <select
                      className="form-select custom-input-field"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      style={{ borderRadius: 12 }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Profile Image Section */}
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted mb-3">Profile Image (Optional)</label>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '24px',
                      borderRadius: '12px',
                      border: '2px dashed var(--card-border)',
                      backgroundColor: 'var(--bg-subtle)'
                    }}>
                      {/* Image Preview */}
                      <div style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        backgroundColor: imagePreview ? 'transparent' : 'linear-gradient(135deg, #00aeef, #008ecc)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '3px solid rgba(0, 174, 239, 0.2)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                      }}>
                        {imagePreview ? (
                          <img 
                            src={imagePreview} 
                            alt="Preview" 
                            style={{ 
                              width: '100%', 
                              height: '100%', 
                              objectFit: 'cover' 
                            }} 
                          />
                        ) : (
                          <i className="bi bi-image" style={{ fontSize: 48, color: 'white' }} />
                        )}
                      </div>

                      {/* Status Text */}
                      {imagePreview ? (
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          ✓ Image selected
                        </div>
                      ) : (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          No image selected
                        </div>
                      )}

                      {/* File Input */}
                      <input
                        type="file"
                        id="profile-image"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageChange}
                        style={{ display: 'none' }}
                      />

                      {/* Action Buttons */}
                      <div style={{
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        width: '100%'
                      }}>
                        <button
                          type="button"
                          onClick={() => document.getElementById('profile-image').click()}
                          className="btn btn-accent btn-sm"
                          style={{ 
                            borderRadius: '8px', 
                            padding: '8px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '13px'
                          }}
                          disabled={isSubmitting}
                        >
                          <i className="bi bi-cloud-upload" />
                          Upload File
                        </button>
                      </div>

                      {/* Remove Button */}
                      {imagePreview && (
                        <button
                          type="button"
                          onClick={removeImage}
                          className="btn btn-outline-danger btn-sm"
                          style={{ 
                            borderRadius: '8px', 
                            padding: '8px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '13px'
                          }}
                          disabled={isSubmitting}
                        >
                          <i className="bi bi-trash" />
                          Remove Image
                        </button>
                      )}

                      {/* Error Message */}
                      {imageError && (
                        <div style={{ 
                          color: '#dc3545', 
                          fontSize: '12px', 
                          textAlign: 'center',
                          backgroundColor: 'rgba(220, 53, 69, 0.1)',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          width: '100%'
                        }}>
                          <i className="bi bi-exclamation-circle me-2" />
                          {imageError}
                        </div>
                      )}

                      {/* Help Text */}
                      <div style={{ 
                        fontSize: '11px', 
                        color: 'var(--text-muted)', 
                        textAlign: 'center',
                        marginTop: '8px'
                      }}>
                        <div>JPG, PNG or WEBP • Max 5MB</div>
                        <div style={{ marginTop: '4px', fontSize: '10px' }}>
                          Upload a file to add a profile picture (optional)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Single Create User Button - Handles Everything */}
                <div className="d-flex gap-2 mt-5 user-form-actions">
                  <button 
                    type="submit" 
                    className="btn-accent px-5 py-3 flex-grow-1" 
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Creating...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-person-plus-fill me-2" /> Create User
                      </>
                    )}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => navigate('/users')} 
                    className="btn-ghost px-5 py-3"
                    disabled={isSubmitting}
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
