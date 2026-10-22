import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateBottlePerBox, fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import CreatableSelect from 'react-select/creatable';
import Swal from 'sweetalert2';
import API from '../../services/api';
import { derivePlainBottleName } from '../../utils/derivePlainBottleName';

export default function EditBottlePerBox() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { items, loading } = useSelector((state) => state.bottlePerBox);

  const [dropdownItems, setDropdownItems] = useState([]);

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
    API.get('/bottle-per-box/dropdown')
      .then(res => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setDropdownItems(res.data.data);
        }
      })
      .catch(err => {
        console.error('Failed to fetch bottle names dropdown:', err);
      });
  }, [dispatch]);

  // Sourced from all bottle names across all BottlePerBox records
  const allBottleNames = useMemo(() => {
    const nameMap = new Map();

    // Sourced from /api/bottle-per-box/dropdown
    (dropdownItems || []).forEach(item => {
      const name = typeof item === 'string' ? item : item.name;
      if (name && name.trim()) {
        const clean = name.trim();
        if (!nameMap.has(clean)) {
          nameMap.set(clean, {
            name: clean,
            ownerPlainBottle: item.plainBottleName || null,
            ownerDocId: item.id || null
          });
        }
      }
    });

    // Enriched with real-time items in store
    (items || []).forEach(record => {
      const pName = record.plainBottleName || record.bottleName;
      const recId = record._id;
      const recNames = Array.isArray(record.bottleNames) && record.bottleNames.length > 0
        ? record.bottleNames
        : [record.bottleName || record.plainBottleName].filter(Boolean);

      recNames.forEach(n => {
        if (n && n.trim()) {
          const clean = n.trim();
          if (!nameMap.has(clean)) {
            nameMap.set(clean, {
              name: clean,
              ownerPlainBottle: pName,
              ownerDocId: recId
            });
          }
        }
      });
    });

    return Array.from(nameMap.values());
  }, [dropdownItems, items]);

  const [formData, setFormData] = useState({
    plainBottleName: '',
    bottleNames: [],
    bottlePerBox: '',
    boxWeight: '',
    status: 'active'
  });

  const [isPlainBottleManuallyEdited, setIsPlainBottleManuallyEdited] = useState(false);

  // Sort unique options dynamically based on the current plainBottleName:
  // 1st: Exact match / starts with full plain name (e.g. "20 ML SAAB...")
  // 2nd: Matches full volume & unit (e.g. starts with "20 ML ")
  // 3rd: Matches number volume (e.g. starts with "20")
  // 4th: Other options alphabetically
  const uniqueBottleNames = useMemo(() => {
    const target = (formData.plainBottleName || '').trim().toLowerCase();

    const capMatch = target.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?/i);
    const numPart = capMatch ? capMatch[1] : '';
    const unitPart = capMatch && capMatch[2] ? capMatch[2] : 'ml';
    const volumePrefix = numPart ? `${numPart} ${unitPart}`.toLowerCase() : '';

    const list = [...allBottleNames];

    list.sort((a, b) => {
      const aLower = a.name.toLowerCase();
      const bLower = b.name.toLowerCase();

      if (target) {
        // Priority 1: Exact target or starts with full target mold name
        const aExact = aLower === target || aLower.startsWith(target);
        const bExact = bLower === target || bLower.startsWith(target);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        // Priority 2: Contains target words
        const aContains = aLower.includes(target);
        const bContains = bLower.includes(target);
        if (aContains && !bContains) return -1;
        if (!aContains && bContains) return 1;

        // Priority 3: Matches volume prefix (e.g. "20 ml ")
        if (volumePrefix) {
          const aVol = aLower.startsWith(volumePrefix);
          const bVol = bLower.startsWith(volumePrefix);
          if (aVol && !bVol) return -1;
          if (!aVol && bVol) return 1;
        }

        // Priority 4: Starts with number (e.g. "20 ")
        if (numPart) {
          const aNum = aLower.startsWith(numPart);
          const bNum = bLower.startsWith(numPart);
          if (aNum && !bNum) return -1;
          if (!aNum && bNum) return 1;
        }
      }

      return a.name.localeCompare(b.name);
    });

    return list.map(item => ({
      value: item.name,
      label: item.name,
      ownerPlainBottle: item.ownerPlainBottle,
      ownerDocId: item.ownerDocId
    }));
  }, [allBottleNames, formData.plainBottleName]);

  const [errors, setErrors] = useState({
    bottleNames: '',
    bottlePerBox: '',
    boxWeight: ''
  });

  useEffect(() => {
    const record = items.find(s => s._id === id);
    if (record) {
      const namesList = record.bottleNames && record.bottleNames.length > 0
        ? record.bottleNames
        : [record.bottleName].filter(Boolean);

      setFormData({
        plainBottleName: record.plainBottleName || derivePlainBottleName(record.bottleName),
        bottleNames: namesList.map(n => ({ value: n, label: n })),
        bottlePerBox: record.bottlePerBox !== null && record.bottlePerBox !== undefined ? record.bottlePerBox : '',
        boxWeight: record.boxWeight !== null && record.boxWeight !== undefined ? record.boxWeight : '',
        status: record.status === true ? 'active' : 'inactive'
      });
      setIsPlainBottleManuallyEdited(!!record.plainBottleName);
    }
  }, [id, items]);

  const validateField = (name, value) => {
    let msg = '';
    if (name === 'bottleNames' && (!value || value.length === 0)) {
      msg = 'Please select at least one bottle';
    } else if (name !== 'bottleNames' && !value) {
      msg = name === 'boxWeight' ? 'Box Weight is mandatory' : 'Bottle per Box is mandatory';
    }
    setErrors(prev => ({ ...prev, [name]: msg }));
    return msg;
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    validateField(name, value);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const executeSave = (payload) => {
    dispatch(updateBottlePerBox({ id, formData: payload })).then((res) => {
      if (!res.error) {
        dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
        Swal.fire('Updated!', res.payload?.message || 'Bottle per Box configuration updated successfully!', 'success');
        navigate('/bottle-per-box');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update configuration.', 'error');
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const nameError = validateField('bottleNames', formData.bottleNames);
    const countError = validateField('bottlePerBox', formData.bottlePerBox);
    const weightError = validateField('boxWeight', formData.boxWeight);

    if (nameError || countError || weightError) {
      return Swal.fire('Validation Error', 'Please fill all required fields.', 'error');
    }

    const currentSelectedNames = formData.bottleNames.map(opt => opt.value);

    // Check if moving any selected bottle names will leave another Plain Bottle empty
    const emptiedOtherPlainBottles = [];
    for (const otherDoc of items) {
      if (otherDoc._id === id || otherDoc.isDeleted) continue;
      const otherNames = (otherDoc.bottleNames && otherDoc.bottleNames.length > 0)
        ? otherDoc.bottleNames
        : [otherDoc.bottleName || otherDoc.plainBottleName].filter(Boolean);

      const movingNames = currentSelectedNames.filter(n =>
        otherNames.some(existing => existing.toLowerCase() === n.toLowerCase())
      );

      if (movingNames.length > 0) {
        const remaining = otherNames.filter(existing =>
          !movingNames.some(m => m.toLowerCase() === existing.toLowerCase())
        );
        if (remaining.length === 0) {
          emptiedOtherPlainBottles.push(otherDoc.plainBottleName || otherDoc.bottleName);
        }
      }
    }

    const basePayload = {
      ...formData,
      bottleNames: currentSelectedNames
    };

    if (emptiedOtherPlainBottles.length > 0) {
      const namesListHtml = emptiedOtherPlainBottles.map(n => `<b>"${n}"</b>`).join(', ');
      Swal.fire({
        title: 'Plain Bottle will become empty',
        html: `Moving bottle name(s) will leave Plain Bottle ${namesListHtml} with no bottle names remaining.<br/><br/>Do you want to delete the empty Plain Bottle record?`,
        icon: 'warning',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Yes, delete empty record',
        denyButtonText: 'Keep as empty record',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#e91e63',
        denyButtonColor: '#6c757d'
      }).then((result) => {
        if (result.isConfirmed) {
          executeSave({ ...basePayload, deleteEmpty: true });
        } else if (result.isDenied) {
          executeSave({ ...basePayload, deleteEmpty: false });
        }
      });
    } else {
      executeSave({ ...basePayload, deleteEmpty: false });
    }
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/bottle-per-box" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Configuration</h1>
          <p className="page-subtitle">Update configuration</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row g-4">
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Plain Bottle (Base Mold)
                    </label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="plainBottleName"
                      value={formData.plainBottleName || ''}
                      onChange={(e) => {
                        setIsPlainBottleManuallyEdited(true);
                        setFormData(prev => ({ ...prev, plainBottleName: e.target.value }));
                      }}
                      placeholder="Auto-derived base mold (editable)..."
                      style={{ borderRadius: 12, padding: '8px 12px' }}
                    />

                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Bottle Name(s) <span className="text-danger">*</span></label>
                    <CreatableSelect
                      isMulti
                      options={uniqueBottleNames}
                      value={formData.bottleNames}
                      onChange={(selected) => {
                        const newSelection = selected || [];
                        setFormData(prev => {
                          const updated = { ...prev, bottleNames: newSelection };
                          if (!isPlainBottleManuallyEdited && newSelection.length > 0) {
                            updated.plainBottleName = derivePlainBottleName(newSelection[0].value);
                          }
                          return updated;
                        });
                        if (errors.bottleNames) setErrors(prev => ({ ...prev, bottleNames: '' }));
                      }}
                      onBlur={() => validateField('bottleNames', formData.bottleNames)}
                      placeholder="Select bottle(s)..."
                      classNamePrefix="react-select"
                      className={errors.bottleNames ? 'is-invalid' : ''}
                      formatOptionLabel={(option, { context }) => {
                        if (context === 'menu' && option.ownerPlainBottle && option.ownerPlainBottle !== formData.plainBottleName) {
                          return (
                            <div className="d-flex justify-content-between align-items-center">
                              <span>{option.value}</span>
                              <span className="badge bg-light text-muted border small ms-2" style={{ fontSize: '0.72rem', fontWeight: 500 }}>
                                In Plain: {option.ownerPlainBottle}
                              </span>
                            </div>
                          );
                        }
                        return option.label || option.value;
                      }}
                    />
                    {errors.bottleNames && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.bottleNames}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Bottle per Box <span className="text-danger">*</span></label>
                    <input
                      type="number"
                      className={`form-control custom-input-field ${errors.bottlePerBox ? 'is-invalid' : ''}`}
                      name="bottlePerBox"
                      value={formData.bottlePerBox}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="e.g. 24"
                      min="1"
                      style={{ borderRadius: 12, padding: '8px 12px' }}
                    />
                    {errors.bottlePerBox && <div className="invalid-feedback">{errors.bottlePerBox}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Box Weight <span className="text-danger">*</span></label>
                    <input
                      type="number"
                      className={`form-control custom-input-field ${errors.boxWeight ? 'is-invalid' : ''}`}
                      name="boxWeight"
                      value={formData.boxWeight}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Enter box weight"
                      min="0"
                      step="any"
                      style={{ borderRadius: 12, padding: '8px 12px' }}
                    />
                    {errors.boxWeight && <div className="invalid-feedback">{errors.boxWeight}</div>}
                  </div>

                  <div className="col-md-12">
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
                </div>

                <div className="d-flex flex-column flex-md-row gap-2 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Updating...</> : <><i className="bi bi-check2-circle me-2" /> Update Configuration</>}
                  </button>
                  <button type="button" onClick={() => navigate('/bottle-per-box')} className="btn-ghost px-5 py-3">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
