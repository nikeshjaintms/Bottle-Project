import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { createProduction } from '../../redux/slices/productionSlice';
import { matchBottle, clearMatchResult } from '../../redux/slices/visionSlice';
import API from '../../services/api';
import Swal from 'sweetalert2';
import SearchableSelect from '../../components/SearchableSelect';

const hasDateValidation = (user, permissionName) => {
  if (typeof user?.role === 'object' && Array.isArray(user.role.permissions)) {
    return user.role.permissions.some(p => (p.name || p) === permissionName);
  }
  return false;
};

export default function AddProduction() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { user: authUser } = useSelector((state) => state.auth);
  const enforceValidation = hasDateValidation(authUser, 'production-date-validation');

  const { brands } = useSelector((state) => state.brands);
  const { bottleSpecs: specs } = useSelector((state) => state.bottleSpecs);
  const { variants } = useSelector((state) => state.variants);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);
  const { loading: saving } = useSelector((state) => state.productions);
  const { loading: matching, matchResult } = useSelector((state) => state.vision);

  // Calculate min and max dates (Yesterday, Today, Tomorrow)
  const today = new Date();
  
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const maxDate = tomorrow.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const minDate = yesterday.toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    brandId: '',
    bottleSpecId: '',
    variantId: '',
    date: new Date().toISOString().split('T')[0],
    totalPrinted: '',
    bottlePerBox: '',
  });

  const [errors, setErrors] = useState({
    brandId: '',
    bottleSpecId: '',
    variantId: '',
    date: '',
    totalPrinted: '',
    bottlePerBox: ''
  });

  const validateField = (name, value) => {
    let msg = '';
    const fieldNames = {
      brandId: 'Brand',
      bottleSpecId: 'Bottle Spec',
      variantId: 'Variant',
      date: 'Production Date',
      totalPrinted: 'Total Printed',
      bottlePerBox: 'Per Box'
    };

    if (!value) {
      msg = `${fieldNames[name] || name} is mandatory`;
    } else if (['totalPrinted', 'bottlePerBox'].includes(name) && /\s/.test(value.toString())) {
      msg = 'Whitespace is not allowed';
    }
    setErrors(prev => ({ ...prev, [name]: msg }));
    return msg;
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    const msg = validateField(name, value);
    if (msg) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Warning',
        text: msg,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let cleanValue = value;

    if (['totalPrinted', 'bottlePerBox'].includes(name)) {
      cleanValue = value.replace(/\s/g, '');
    }

    if (name === 'brandId') {
      setFormData({ ...formData, brandId: cleanValue, bottleSpecId: '', variantId: '' });
    } else if (name === 'bottleSpecId') {
      setFormData({ ...formData, bottleSpecId: cleanValue, variantId: '' });
    } else {
      setFormData({ ...formData, [name]: cleanValue });
    }

    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const [calc, setCalc] = useState({ boxes: 0, rem: 0 });

  const [mode, setMode] = useState('camera'); // 'manual' or 'camera'
  const [image, setImage] = useState(null);
  const [cameraSource, setCameraSource] = useState(null); // 'upload' or 'capture'
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchBottleSpecs({ pagination: 'false' }));
    dispatch(fetchVariants({ pagination: 'false' }));
    dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
  }, [dispatch]);

  // Hierarchical Filtering Logic
  const availableSpecs = specs.filter(s => {
    const sBrandId = (s.brandId?._id || s.brandId)?.toString();
    const isBrandActive = s.brandId?.status !== false; // If brandId is just an ID, we assume true or handle elsewhere
    return sBrandId === formData.brandId?.toString() && s.status && isBrandActive;
  });

  const filteredVariants = variants.filter(v => {
    const vSpecId = (v.bottleSpecId?._id || v.bottleSpecId)?.toString();
    const isSpecActive = v.bottleSpecId?.status !== false;
    return vSpecId === formData.bottleSpecId?.toString() && v.status && isSpecActive;
  });

  useEffect(() => {
    const printed = parseInt(formData.totalPrinted) || 0;
    const perBox = parseInt(formData.bottlePerBox) || 1;
    setCalc({
      boxes: Math.floor(printed / perBox),
      rem: printed % perBox
    });
  }, [formData.totalPrinted, formData.bottlePerBox]);

  const startCamera = async () => {
    setImage(null);
    setCameraSource('capture');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      videoRef.current.srcObject = stream;
      streamRef.current = stream;
    } catch (err) {
      Swal.fire('Error', 'Could not access camera', 'error');
      setCameraSource(null);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      setImage(file);
      stopCamera();
      setCameraSource('upload'); // Preview the captured image in the upload area
    }, 'image/jpeg');
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const applyVisionMatchToForm = (data) => {
    let autoBoxValue = '';
    if (data.bottleSpecId && bottlePerBoxes) {
      const spec = availableSpecs.find(s => s._id === data.bottleSpecId);
      if (spec && spec.bottleName) {
        const foundBox = bottlePerBoxes.find(b => b.bottleName === spec.bottleName);
        if (foundBox && foundBox.bottlePerBox != null) {
          autoBoxValue = foundBox.bottlePerBox.toString();
        }
      }
    }
    setFormData((prev) => ({
      ...prev,
      brandId: data.brandId || '',
      bottleSpecId: data.bottleSpecId || '',
      variantId: data.variantId || '',
      ...(autoBoxValue ? { bottlePerBox: autoBoxValue } : {})
    }));
  };

  const handleSizeOptionChange = (variantId) => {
    const option = matchResult?.sizeOptions?.find((o) => o.variantId === variantId);
    if (!option) return;
    setFormData((prev) => ({ ...prev, variantId: option.variantId }));
  };

  const handleMatch = () => {
    if (!image) return Swal.fire('Error', 'Please provide an image first', 'error');

    dispatch(matchBottle(image)).then((res) => {
      if (res.payload?.match) {
        const data = res.payload;
        applyVisionMatchToForm(data);
        setMode('manual');

        const sizeNote = data.sizeSelectionRequired
          ? `<br/><small class="text-muted">Size not on label — default <b>${data.variantSize || data.sizeOptions?.[0]?.variantSize}</b>. Change size from the dropdown if needed.</small>`
          : data.detectedSizeOnBottle
            ? `<br/><small class="text-muted">Size on bottle: <b>${data.detectedSizeOnBottle}</b></small>`
            : '';

        Swal.fire({
          icon: 'success',
          title: 'Match Found!',
          html: `<b>Detected:</b> ${data.brandName} - ${data.variantName}${data.variantSize ? ` (${data.variantSize})` : ''}<br/><b>Text Color:</b> <span class="badge bg-dark">${data.detectedTextColor || 'N/A'}</span>${sizeNote}`
        });
      } else if (res.payload) {
        Swal.fire('No Match', res.payload.message || 'Bottle not recognized', 'warning');
      } else {
        Swal.fire('Error', res.error?.message || 'Vision API failed', 'error');
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate all mandatory fields
    const brandError = validateField('brandId', formData.brandId);
    const specError = validateField('bottleSpecId', formData.bottleSpecId);
    const varError = validateField('variantId', formData.variantId);
    const dateError = validateField('date', formData.date);
    const printedError = validateField('totalPrinted', formData.totalPrinted);
    const boxError = validateField('bottlePerBox', formData.bottlePerBox);

    if (brandError) return Swal.fire('Validation Error', brandError, 'error');
    if (specError) return Swal.fire('Validation Error', specError, 'error');
    if (varError) return Swal.fire('Validation Error', varError, 'error');
    if (dateError) return Swal.fire('Validation Error', dateError, 'error');
    if (printedError) return Swal.fire('Validation Error', printedError, 'error');
    if (boxError) return Swal.fire('Validation Error', boxError, 'error');

    dispatch(createProduction(formData)).then((res) => {
      if (!res.error) {
        Swal.fire('Success!', `Production log saved!`, 'success');
        dispatch(clearMatchResult());
        navigate('/productions');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to save log.', 'error');
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between productions-add-header user-form-page-header">
        <div className="d-flex align-items-center gap-3">
          <Link to="/productions" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
          </Link>
          <div>
            <h1 className="page-title">Add Printing Production</h1>
            <p className="page-subtitle">Choose entry mode and log details</p>
          </div>
        </div>

        <div className="mode-toggle-container p-1 bg-light rounded-4 d-flex productions-mode-toggle" style={{ border: '1px solid #eee' }}>
          <button
            className={`btn btn-sm py-2 px-4 rounded-3 border-0 transition-all ${mode === 'camera' ? 'btn-accent shadow-sm' : 'btn-ghost'}`}
            onClick={() => setMode('camera')}
          >
            <i className="bi bi-camera-fill me-2" /> Camera Mode
          </button>
          <button
            className={`btn btn-sm py-2 px-4 rounded-3 border-0 transition-all ${mode === 'manual' ? 'btn-accent shadow-sm' : 'btn-ghost'}`}
            onClick={() => setMode('manual')}
          >
            <i className="bi bi-pencil-square me-2" /> Manual Mode
          </button>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-10">

          {mode === 'camera' ? (
            <div className="dash-card mb-4 overflow-hidden border-0 shadow-lg" style={{ borderRadius: 24 }}>
              <div className="dash-card-body p-5 text-center">

                {!cameraSource && !image ? (
                  <div className="py-5">
                    <h3 className="fw-bold mb-4">How would you like to provide the image?</h3>
                    <div className="d-flex justify-content-center gap-4">
                      <button
                        className="btn btn-outline-accent p-4 rounded-4 d-flex flex-column align-items-center gap-2"
                        style={{ width: 180, borderWidth: 2 }}
                        onClick={startCamera}
                      >
                        <i className="bi bi-camera" style={{ fontSize: 32 }} />
                        <span className="fw-bold">Use Camera</span>
                      </button>
                      <button
                        className="btn btn-outline-accent p-4 rounded-4 d-flex flex-column align-items-center gap-2"
                        style={{ width: 180, borderWidth: 2 }}
                        onClick={() => setCameraSource('upload')}
                      >
                        <i className="bi bi-folder" style={{ fontSize: 32 }} />
                        <span className="fw-bold">Upload File</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    {cameraSource === 'capture' ? (
                      <div className="position-relative mx-auto" style={{ width: '100%', maxWidth: 400, aspectRatio: '4/3', borderRadius: 24, overflow: 'hidden', background: '#000' }}>
                        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div className="position-absolute bottom-0 start-0 end-0 p-3 bg-dark bg-opacity-50">
                          <button className="btn btn-accent rounded-circle p-0" style={{ width: 64, height: 64 }} onClick={capturePhoto}>
                            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid white', margin: 'auto' }} />
                          </button>
                        </div>
                        <button className="btn btn-sm btn-light position-absolute top-0 end-0 m-3 rounded-circle" onClick={() => { stopCamera(); setCameraSource(null); }}>
                          <i className="bi bi-x-lg" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="upload-placeholder mx-auto mb-4 d-flex flex-column align-items-center justify-content-center"
                        style={{
                          width: 240,
                          height: 240,
                          borderRadius: 30,
                          border: '3px dashed #ddd',
                          background: image ? 'transparent' : '#fcfcfc',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          position: 'relative'
                        }}
                        onClick={() => image ? null : document.getElementById('camera-file').click()}
                      >
                        {image ? (
                          <img src={URL.createObjectURL(image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                        ) : (
                          <>
                            <i className="bi bi-cloud-arrow-up text-accent mb-2" style={{ fontSize: 48 }} />
                            <span className="fw-600 text-muted">Click to upload image</span>
                            <button className="btn btn-sm btn-ghost position-absolute top-0 end-0 m-2" onClick={(e) => { e.stopPropagation(); setCameraSource(null); }}>
                              <i className="bi bi-x-lg" />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <input
                      type="file"
                      id="camera-file"
                      hidden
                      accept="image/*"
                      onChange={e => {
                        setImage(e.target.files[0]);
                        setCameraSource('upload');
                      }}
                    />

                    {image && (
                      <>
                        <h3 className="fw-bold mt-4">Bottle Identified?</h3>
                        <p className="text-muted">Process the image to auto-fill the form</p>
                      </>
                    )}
                  </div>
                )}

                {(image || cameraSource) && (
                  <div className="d-flex justify-content-center gap-3 mt-4">
                    <button
                      className="btn-accent px-5 py-3 rounded-4 shadow-sm d-flex align-items-center gap-2"
                      onClick={handleMatch}
                      disabled={!image || matching}
                    >
                      {matching ? (
                        <><span className="spinner-border spinner-border-sm" /> Matching...</>
                      ) : (
                        <><i className="bi bi-magic" /> Identify Bottle</>
                      )}
                    </button>
                    <button className="btn-ghost px-5 py-3 rounded-4" onClick={() => { stopCamera(); setImage(null); setCameraSource(null); }}>
                      {image ? 'Change Image' : 'Cancel'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="dash-card border-0 shadow-sm" style={{ borderRadius: 24 }}>
              <div className="dash-card-body p-4 p-md-5">
                
                {matchResult?.match && (
                  <div className="alert alert-success mb-4" style={{ borderRadius: 12 }}>
                    <div className="d-flex align-items-start">
                      <i className="bi bi-check-circle-fill me-3 fs-4" />
                      <div className="flex-grow-1">
                        <h6 className="mb-1 fw-bold">Successfully Matched via Camera</h6>
                        <span className="small d-block">
                          Brand: {matchResult.brandName} | Variant: {matchResult.variantName} | Text Color:{' '}
                          <b className="text-dark">{matchResult.detectedTextColor}</b>
                        </span>
                        {matchResult.detectedSizeOnBottle && (
                          <span className="small d-block mt-1 text-muted">
                            Size read from bottle: <b>{matchResult.detectedSizeOnBottle}</b>
                          </span>
                        )}
                      </div>
                    </div>
                    {matchResult.sizeSelectionRequired && matchResult.sizeOptions?.length > 1 && (
                      <div className="mt-3 pt-3 border-top border-success-subtle">
                        <label className="form-label fw-600 small text-uppercase text-muted mb-2">
                          Select bottle size (ml)
                        </label>
                        <select
                          className="form-select custom-input-field"
                          value={formData.variantId}
                          onChange={(e) => handleSizeOptionChange(e.target.value)}
                          style={{ borderRadius: 12, maxWidth: 320 }}
                        >
                          {matchResult.sizeOptions.map((opt) => (
                            <option key={opt.variantId} value={opt.variantId}>
                              {opt.variantSize}
                            </option>
                          ))}
                        </select>
                        <div className="form-text small text-muted mt-1">
                          Smallest size ({matchResult.sizeOptions[0]?.variantSize}) selected automatically. Choose 50 ml, 100 ml, etc. if this bottle is a different size.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="row g-4">
                    <div className="col-md-6">
                      <label className="form-label fw-600 small text-uppercase text-muted">
                        1. Brand <span className="text-danger">*</span>
                      </label>
                      <SearchableSelect
                        options={brands.filter(b => b.status).map(b => ({
                          value: b._id,
                          label: `${b.name}${b.companyId?.name ? ` (${b.companyId.name})` : ''}`
                        }))}
                        value={formData.brandId}
                        onChange={(val) => {
                          setFormData({ ...formData, brandId: val, bottleSpecId: '', variantId: '' });
                          if (errors.brandId) setErrors(prev => ({ ...prev, brandId: '' }));
                        }}
                        placeholder="-- Choose Brand --"
                        isInvalid={!!errors.brandId}
                      />
                      {errors.brandId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.brandId}</div>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-600 small text-uppercase text-muted">
                        2. Bottle Spec <span className="text-danger">*</span>
                      </label>
                      <SearchableSelect
                        options={availableSpecs.map(s => ({
                          value: s._id,
                          label: `${s.bottleName} — ${s.code} (${s.printingTypeId?.name || 'N/A'} / ${s.printingColorId?.name || 'No Color'})`
                        }))}
                        value={formData.bottleSpecId}
                        onChange={(val) => {
                          let newFormData = { ...formData, bottleSpecId: val, variantId: '' };
                          const spec = availableSpecs.find(s => s._id === val);
                          if (spec && spec.bottleName && bottlePerBoxes) {
                            const foundBox = bottlePerBoxes.find(b => b.bottleName === spec.bottleName);
                            if (foundBox && foundBox.bottlePerBox != null) {
                              newFormData.bottlePerBox = foundBox.bottlePerBox.toString();
                            }
                          }
                          setFormData(newFormData);
                          if (errors.bottleSpecId) setErrors(prev => ({ ...prev, bottleSpecId: '' }));
                          if (errors.bottlePerBox) setErrors(prev => ({ ...prev, bottlePerBox: '' }));
                        }}
                        placeholder="-- Choose Specification --"
                        disabled={!formData.brandId}
                        isInvalid={!!errors.bottleSpecId}
                      />
                      {errors.bottleSpecId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.bottleSpecId}</div>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">
                        3. Variant <span className="text-danger">*</span>
                      </label>
                      <SearchableSelect
                        options={filteredVariants.map(v => ({
                          value: v._id,
                          label: `${v.variantName} — ${v.variantSize || 'N/A'}`
                        }))}
                        value={formData.variantId}
                        onChange={(val) => {
                          setFormData({ ...formData, variantId: val });
                          if (errors.variantId) setErrors(prev => ({ ...prev, variantId: '' }));
                        }}
                        placeholder="-- Choose Variant --"
                        disabled={!formData.bottleSpecId}
                        isInvalid={!!errors.variantId}
                      />
                      {errors.variantId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.variantId}</div>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">
                        Coating Shade
                      </label>
                      <div className="form-control custom-input-field bg-light text-center fw-bold text-dark d-flex align-items-center justify-content-center" style={{ borderRadius: 12 }}>
                        {formData.variantId ? (variants.find(v => v._id === formData.variantId)?.coatingShade || 'N/A') : 'N/A'}
                      </div>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">
                        Text Color
                      </label>
                      <div className="form-control custom-input-field bg-light text-center fw-bold text-dark d-flex align-items-center justify-content-center" style={{ borderRadius: 12 }}>
                         {formData.variantId ? (variants.find(v => v._id === formData.variantId)?.detectedTextColor || 'Not Detected') : 'N/A'}
                      </div>
                    </div>

                    <div className="col-12"><hr className="my-4 opacity-50" /></div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">
                        Production Date <span className="text-danger">*</span>
                      </label>
                      <input
                        type="date"
                        name="date"
                        className={`form-control custom-input-field ${errors.date ? 'is-invalid' : ''}`}
                        required
                        {...(enforceValidation && { min: minDate, max: maxDate })}
                        value={formData.date}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        style={{ borderRadius: 12 }}
                      />
                      {errors.date && <div className="invalid-feedback">{errors.date}</div>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">
                        Total Printed Bottles <span className="text-danger">*</span>
                      </label>
                      <input
                        type="number"
                        name="totalPrinted"
                        className={`form-control custom-input-field ${errors.totalPrinted ? 'is-invalid' : ''}`}
                        required
                        value={formData.totalPrinted}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        style={{ borderRadius: 12 }}
                      />
                      {errors.totalPrinted && <div className="invalid-feedback">{errors.totalPrinted}</div>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">
                        Bottles Per Box <span className="text-danger">*</span>
                      </label>
                      <input
                        type="number"
                        name="bottlePerBox"
                        className={`form-control custom-input-field ${errors.bottlePerBox ? 'is-invalid' : ''}`}
                        required
                        value={formData.bottlePerBox}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        style={{ borderRadius: 12 }}
                      />
                      {errors.bottlePerBox && <div className="invalid-feedback">{errors.bottlePerBox}</div>}
                    </div>
                  </div>

                  <div className="mt-5 p-4 rounded-4 d-flex justify-content-around text-center" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div className="text-muted small text-uppercase fw-bold mb-1">Boxes</div>
                      <div className="h2 mb-0 text-accent fw-bold">{calc.boxes}</div>
                    </div>
                    <div style={{ width: 1, background: '#cbd5e1' }} />
                    <div>
                      <div className="text-muted small text-uppercase fw-bold mb-1">Extra Printed Bottles</div>
                      <div className={`h2 mb-0 fw-bold ${calc.rem > 0 ? 'text-danger' : 'text-success'}`}>{calc.rem}</div>
                    </div>
                  </div>

                  <div className="d-flex gap-3 mt-5 user-form-actions">
                    <button type="submit" className="btn-accent px-5 py-3 flex-grow-1 rounded-4 shadow-sm" disabled={saving}>
                      {saving ? (
                        <><span className="spinner-border spinner-border-sm me-2" /> Saving...</>
                      ) : (
                        <><i className="bi bi-check2-circle me-2" /> Save Entry</>
                      )}
                    </button>
                    <button type="button" onClick={() => navigate('/productions')} className="btn-ghost px-5 py-3 rounded-4">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

