import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSingleUser, updateUser, uploadUserImage, deleteUserImage } from '../../redux/slices/userSlice';
import { fetchRoles } from '../../redux/slices/roleSlice';
import { updateUserImage } from '../../redux/slices/loginSlice';
import Swal from 'sweetalert2';

const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  return `${import.meta.env.VITE_API_URL || 'https://application.shayonaglass.com/api'}/../${imagePath}`;
};

export default function EditUser() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { singleUser, loading } = useSelector((state) => state.users);
  const { user: authUser } = useSelector((state) => state.auth);
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
  const [uploadingImage, setUploadingImage] = useState(false);

  const [errors, setErrors] = useState({
    name: '',
    email: '',
    password: ''
  });

  const validateField = (name, value) => {
    let error = '';
    if (name === 'password' && !value) {
      error = '';
    } else if (!value || value.trim() === '') {
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
    
    if (!file) return;

    if (!ALLOWED_FORMATS.includes(file.type)) {
      setImageError('Invalid file type. Only JPG, PNG, and WEBP are allowed.');
      setSelectedImage(null);
      setImagePreview(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setImageError('File size exceeds 5MB limit');
      setSelectedImage(null);
      setImagePreview(null);
      return;
    }

    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    validateImage(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setImageError('');
  };

  const uploadImage = async () => {
    if (!selectedImage) return;
    
    setUploadingImage(true);
    const result = await dispatch(uploadUserImage({ id, imageFile: selectedImage }));
    setUploadingImage(false);

    if (!result.error) {
      Swal.fire('Success!', 'Profile image updated successfully.', 'success');
      removeImage();
      
      // Update auth user's image in Redux if uploading own image
      if (authUser?.id === id) {
        dispatch(updateUserImage(result.payload.image));
      }
    } else {
      Swal.fire('Error!', result.payload || 'Failed to upload image.', 'error');
    }
  };

  const deleteImage = async () => {
    if (!singleUser?.image) return;

    Swal.fire({
      title: 'Delete Profile Image?',
      text: 'This will remove the profile image.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete it'
    }).then(async (result) => {
      if (result.isConfirmed) {
        setUploadingImage(true);
        const delResult = await dispatch(deleteUserImage(id));
        setUploadingImage(false);

        if (!delResult.error) {
          Swal.fire('Deleted!', 'Profile image removed.', 'success');
          
          if (authUser?.id === id) {
            dispatch(updateUserImage(''));
          }
        } else {
          Swal.fire('Error!', delResult.payload || 'Failed to delete image.', 'error');
        }
      }
    });
  };

  useEffect(() => {
    dispatch(fetchSingleUser(id));
    dispatch(fetchRoles({ pagination: 'false' }));
  }, [dispatch, id]);

  useEffect(() => {
    if (singleUser && singleUser._id === id) {
      const roleId = typeof singleUser.role === 'object' ? singleUser.role._id : singleUser.role;
      setFormData({
        name: singleUser.name || '',
        email: singleUser.email || '',
        password: '', // Password is empty for editing until user types it
        role: roleId || '',
        status: singleUser.status || 'active'
      });
    }
  }, [singleUser, id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate all fields before submission
    const nameError = validateField('name', formData.name);
    const emailError = validateField('email', formData.email);
    const passwordError = formData.password ? validateField('password', formData.password) : '';

    if (nameError) return Swal.fire('Validation Error', nameError, 'error');
    if (emailError) return Swal.fire('Validation Error', emailError, 'error');
    if (passwordError) return Swal.fire('Validation Error', passwordError, 'error');

    dispatch(updateUser({ id, formData })).then((res) => {
      if (!res.error) {
        Swal.fire('Updated!', 'User details updated successfully.', 'success');
        navigate('/users');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update user.', 'error');
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/users" className="btn-ghost" style={{ width: 40, height: 40, padding: 0, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit User</h1>
          <p className="page-subtitle">Modify existing team member details</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-7">
          <div className="dash-card">
            <div className="dash-card-header">
              <span className="dash-card-title">Account Details</span>
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
                    <label className="form-label fw-600 small text-uppercase text-muted" htmlFor="edit-user-name">
                      Full Name <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                        <i className="bi bi-person text-muted" />
                      </span>
                      <input
                        id="edit-user-name"
                        type="text"
                        name="name"
                        className={`form-control custom-input-field ${errors.name ? 'is-invalid' : ''}`}
                        placeholder="John Doe"
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
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Email Address <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                        <i className="bi bi-envelope text-muted" />
                      </span>
                      <input
                        id="edit-user-email"
                        type="text"
                        name="email"
                        inputMode="email"
                        className={`form-control custom-input-field ${errors.email ? 'is-invalid' : ''}`}
                        placeholder="john@example.com"
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
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Password (Leave blank to keep current)
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                        <i className="bi bi-shield-lock text-muted" />
                      </span>
                      <input
                        id="edit-user-password"
                        type="password"
                        name="password"
                        className={`form-control custom-input-field ${errors.password ? 'is-invalid' : ''}`}
                        placeholder="Enter new password"
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
                            id={`role-edit-${role._id}`}
                            checked={formData.role === role._id}
                            onChange={() => setFormData({ ...formData, role: role._id })}
                          />
                          <label className={`btn btn-outline-light w-100 py-3 d-flex flex-column align-items-center gap-2 ${formData.role === role._id ? 'active-role' : 'inactive-role'}`} htmlFor={`role-edit-${role._id}`} style={{ borderRadius: 12, borderWidth: 2, transition: 'all 0.2s' }}>
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

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted mb-3">Profile Image</label>
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
                      <div style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        backgroundColor: (imagePreview || singleUser?.image) ? 'transparent' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}>
                        {imagePreview ? (
                          <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : singleUser?.image ? (
                          <img src={getImageUrl(singleUser.image)} alt="Current" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)'; }} />
                        ) : (
                          <i className="bi bi-image" style={{ fontSize: 32, color: 'rgba(255,255,255,0.5)' }} />
                        )}
                      </div>

                      <input
                        type="file"
                        id="profile-image-edit"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageChange}
                        style={{ display: 'none' }}
                      />

                      <button
                        type="button"
                        onClick={() => document.getElementById('profile-image-edit').click()}
                        className="btn btn-accent btn-sm px-4"
                        style={{ borderRadius: 8 }}
                        disabled={uploadingImage}
                      >
                        <i className="bi bi-cloud-upload me-2" />
                        Upload New Image
                      </button>

                      {selectedImage && (
                        <>
                          <button
                            type="button"
                            onClick={uploadImage}
                            className="btn btn-success btn-sm px-4"
                            style={{ borderRadius: 8 }}
                            disabled={uploadingImage}
                          >
                            {uploadingImage ? 'Uploading...' : (
                              <>
                                <i className="bi bi-check-circle me-2" />
                                Save New Image
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={removeImage}
                            className="btn btn-outline-secondary btn-sm px-4"
                            style={{ borderRadius: 8 }}
                            disabled={uploadingImage}
                          >
                            <i className="bi bi-x-circle me-2" />
                            Cancel
                          </button>
                        </>
                      )}

                      {singleUser?.image && !selectedImage && (
                        <button
                          type="button"
                          onClick={deleteImage}
                          className="btn btn-outline-danger btn-sm px-4"
                          style={{ borderRadius: 8 }}
                          disabled={uploadingImage}
                        >
                          <i className="bi bi-trash me-2" />
                          Remove Current Image
                        </button>
                      )}

                      {imageError && (
                        <div style={{ color: 'var(--danger)', fontSize: '12px', textAlign: 'center' }}>
                          {imageError}
                        </div>
                      )}

                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                        JPG, PNG or WEBP • Max 5MB
                      </div>
                    </div>
                  </div>
                </div>

                <div className="d-flex gap-2 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check2-circle me-2" /> Save Changes
                      </>
                    )}
                  </button>
                  <button type="button" onClick={() => navigate('/users')} className="btn-ghost px-5 py-3">
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
