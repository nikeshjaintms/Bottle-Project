import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSingleUser, updateUser, uploadUserImage, deleteUserImage } from '../../redux/slices/userSlice';
import { fetchRoles } from '../../redux/slices/roleSlice';
import { updateUserImage } from '../../redux/slices/loginSlice';
import { getFullImageUrl } from '../../utils/imageUrl';
import Swal from 'sweetalert2';

const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function EditUser() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { singleUser } = useSelector((state) => state.users);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shouldDeleteImage, setShouldDeleteImage] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [showCamera, setShowCamera] = useState(false);

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
      setShouldDeleteImage(false);
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
    setShouldDeleteImage(true);
  };

  const handleTakePhoto = async () => {
    try {
      setImageError('');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' },
        audio: false 
      });
      setCameraStream(stream);
      setShowCamera(true);
    } catch (err) {
      console.error('Camera error:', err);
      setImageError(err.name === 'NotAllowedError' 
        ? 'Camera permission denied.' 
        : 'Camera not available. Use Upload File instead.');
    }
  };

  const handleCapturePhoto = () => {
    if (!cameraStream) return;
    const video = document.getElementById('camera-video');
    if (!video) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelectedImage(file);
        setImagePreview(canvas.toDataURL('image/jpeg'));
        setShouldDeleteImage(false);
        handleCloseCamera();
      }
    }, 'image/jpeg', 0.95);
  };

  const handleCloseCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  useEffect(() => {
    const videoElement = document.getElementById('camera-video');
    if (videoElement && cameraStream) {
      videoElement.srcObject = cameraStream;
    }
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

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
        password: '',
        role: roleId || '',
        status: singleUser.status || 'active'
      });
    }
  }, [singleUser, id]);

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (name === 'password' && !value.trim()) return;
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const nameError = validateField('name', formData.name);
    const emailError = validateField('email', formData.email);
    const passwordError = formData.password ? validateField('password', formData.password) : '';

    if (nameError) return Swal.fire('Validation Error', nameError, 'error');
    if (emailError) return Swal.fire('Validation Error', emailError, 'error');
    if (passwordError) return Swal.fire('Validation Error', passwordError, 'error');

    setIsSubmitting(true);

    try {
      const updateResult = await dispatch(updateUser({ id, formData }));
      if (updateResult.error) {
        setIsSubmitting(false);
        return Swal.fire('Error!', updateResult.payload || 'Failed to update user.', 'error');
      }

      if (shouldDeleteImage && singleUser?.image) {
        try {
          await dispatch(deleteUserImage(id));
          if (authUser?.id === id) {
            dispatch(updateUserImage(null));
          }
          setShouldDeleteImage(false);
        } catch (err) {
          console.error('Delete error:', err);
        }
      }
      
      if (selectedImage) {
        try {
          const uploadResult = await dispatch(uploadUserImage({ id, imageFile: selectedImage }));
          if (!uploadResult.error && uploadResult.payload?.image) {
            if (authUser?.id === id) {
              dispatch(updateUserImage(uploadResult.payload.image));
            }
            removeImage();
          }
        } catch (err) {
          console.error('Upload error:', err);
        }
      }

      setIsSubmitting(false);
      Swal.fire('Updated!', 'User updated successfully.', 'success');
      setTimeout(() => navigate('/users'), 1000);
    } catch (err) {
      setIsSubmitting(false);
      Swal.fire('Error!', err.message || 'Failed to update user.', 'error');
    }
  };

  const currentImageUrl = !shouldDeleteImage ? getFullImageUrl(singleUser?.image) : null;
  const displayImageUrl = imagePreview || currentImageUrl;

  // Debug logging
  if (singleUser?.image) {
    console.log('DB Image Path:', singleUser.image);
    console.log('Full Image URL:', currentImageUrl);
  }

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
                <input type="text" name="prevent_autofill_username" autoComplete="username" tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }} />
                <input type="password" name="prevent_autofill_password" autoComplete="current-password" tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }} />
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
                    <label className="form-label fw-600 small text-uppercase text-muted">Email Address <span className="text-danger">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                        <i className="bi bi-envelope text-muted" />
                      </span>
                      <input
                        type="text"
                        name="email"
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
                    <label className="form-label fw-600 small text-uppercase text-muted">Password (Leave blank to keep current)</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                        <i className="bi bi-shield-lock text-muted" />
                      </span>
                      <input
                        type="password"
                        name="password"
                        className={`form-control custom-input-field ${errors.password ? 'is-invalid' : ''}`}
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
                          <input type="radio" className="btn-check" name="role" id={`role-${role._id}`} checked={formData.role === role._id} onChange={() => setFormData({ ...formData, role: role._id })} />
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
                    <select className="form-select custom-input-field" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={{ borderRadius: 12 }}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted mb-3">Profile Image (Optional)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '24px', borderRadius: '12px', border: '2px dashed var(--card-border)', backgroundColor: 'var(--bg-subtle)' }}>
                      <div style={{ width: '120px', height: '120px', borderRadius: '50%', backgroundColor: displayImageUrl ? 'transparent' : 'linear-gradient(135deg, #00aeef, #008ecc)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: '3px solid rgba(0, 174, 239, 0.2)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
                        {displayImageUrl ? (
                          <img src={displayImageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <i className="bi bi-image" style={{ fontSize: 48, color: 'white' }} />
                        )}
                      </div>

                      {displayImageUrl ? (
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>✓ Image selected</div>
                      ) : (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No image selected</div>
                      )}

                      <input type="file" id="profile-image-edit" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} style={{ display: 'none' }} />

                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                        <button type="button" onClick={() => document.getElementById('profile-image-edit').click()} className="btn btn-accent btn-sm" style={{ borderRadius: '8px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }} disabled={isSubmitting}>
                          <i className="bi bi-cloud-upload" /> Upload File
                        </button>

                        <button type="button" onClick={handleTakePhoto} className="btn btn-info btn-sm" style={{ borderRadius: '8px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', backgroundColor: '#17a2b8', borderColor: '#17a2b8', color: 'white' }} disabled={isSubmitting}>
                          <i className="bi bi-camera-fill" /> Take Photo
                        </button>
                      </div>

                      {displayImageUrl && (
                        <button type="button" onClick={removeImage} className="btn btn-outline-danger btn-sm" style={{ borderRadius: '8px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }} disabled={isSubmitting}>
                          <i className="bi bi-trash" /> Remove Image
                        </button>
                      )}

                      {imageError && (
                        <div style={{ color: '#dc3545', fontSize: '12px', textAlign: 'center', backgroundColor: 'rgba(220, 53, 69, 0.1)', padding: '8px 12px', borderRadius: '6px', width: '100%' }}>
                          <i className="bi bi-exclamation-circle me-2" /> {imageError}
                        </div>
                      )}

                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
                        <div>JPG, PNG or WEBP • Max 5MB</div>
                        <div style={{ marginTop: '4px', fontSize: '10px' }}>Upload a file or take a photo to change your profile picture</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="d-flex gap-2 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={isSubmitting}>
                    {isSubmitting ? (
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
                  <button type="button" onClick={() => navigate('/users')} className="btn-ghost px-5 py-3" disabled={isSubmitting}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {showCamera && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <video id="camera-video" autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', bottom: '30px', display: 'flex', gap: '20px' }}>
            <button type="button" onClick={handleCapturePhoto} style={{ backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '50%', width: '70px', height: '70px', cursor: 'pointer', fontSize: '24px' }}>✓</button>
            <button type="button" onClick={handleCloseCamera} style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '50%', width: '70px', height: '70px', cursor: 'pointer', fontSize: '24px' }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
