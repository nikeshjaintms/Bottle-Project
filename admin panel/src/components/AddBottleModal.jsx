import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { createBottlePerBox, fetchBottlePerBoxes } from '../redux/slices/bottlePerBoxSlice';
import { fetchBottleSpecs } from '../redux/slices/bottleSpecSlice';
import CreatableSelect from 'react-select/creatable';
import Swal from 'sweetalert2';
import { derivePlainBottleName } from '../utils/derivePlainBottleName';

/**
 * Reusable modal for creating a new BottlePerBox
 * Props:
 *   show: boolean - whether modal is visible
 *   initialBottleName: string - pre-filled bottle name
 *   suggestedBottles: array - suggested bottle matches from fuzzy matching (e.g., [{bottleName, plainBottleName, similarity}])
 *   onClose: function - callback when modal closes
 *   onSuccess: function - callback after successful creation
 */
export default function AddBottleModal({ show, initialBottleName, suggestedBottles = [], onClose, onSuccess }) {
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.bottlePerBox);
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);

  useEffect(() => {
    if (show) {
      dispatch(fetchBottleSpecs({ pagination: 'false' }));
    }
  }, [show, dispatch]);

  const allRawBottleNames = useMemo(() => {
    return Array.from(new Set(
      (bottleSpecs || [])
        .map(s => s.BottlePerBox || s.bottleName)
        .filter(name => name && name.trim() !== '')
    ));
  }, [bottleSpecs]);

  // Extract all unique plain bottle names from bottleSpecs
  const allPlainBottles = useMemo(() => {
    return Array.from(new Set(
      (bottleSpecs || [])
        .map(s => s.plainBottleName)
        .filter(name => name && name.trim() !== '')
    ));
  }, [bottleSpecs]);

  const [formData, setFormData] = useState({
    plainBottleName: '',
    bottleNames: [],
    bottlePerBox: '',
    status: 'active'
  });

  const [isPlainBottleManuallyEdited, setIsPlainBottleManuallyEdited] = useState(false);
  const [errors, setErrors] = useState({ bottleNames: '', bottlePerBox: '' });

  // Plain bottle dropdown options - shows ALL plain bottles
  const plainBottleOptions = useMemo(() => {
    // Sort alphabetically, with search matches first
    const target = (formData.plainBottleName || '').trim().toLowerCase();
    const list = [...allPlainBottles];

    if (target) {
      list.sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();

        // Exact match or starts with
        const aExact = aLower === target || aLower.startsWith(target);
        const bExact = bLower === target || bLower.startsWith(target);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        // Contains
        const aContains = aLower.includes(target);
        const bContains = bLower.includes(target);
        if (aContains && !bContains) return -1;
        if (!aContains && bContains) return 1;

        return a.localeCompare(b);
      });
    } else {
      // No search, sort all alphabetically
      list.sort((a, b) => a.localeCompare(b));
    }

    return list.map(name => ({ value: name, label: name }));
  }, [allPlainBottles, formData.plainBottleName]);

  // Auto-select bottle names when plain bottle is selected
  const bottleNamesForPlainBottle = useMemo(() => {
    if (!formData.plainBottleName || !bottleSpecs) return [];
    
    const plainBottle = formData.plainBottleName.toLowerCase().trim();
    const matchingBottles = bottleSpecs
      .filter(spec => {
        const specPlain = (spec.plainBottleName || '').toLowerCase().trim();
        return specPlain === plainBottle;
      })
      .map(spec => spec.BottlePerBox || spec.bottleName)
      .filter((name, index, self) => self.indexOf(name) === index); // Unique only
    
    return matchingBottles;
  }, [formData.plainBottleName, bottleSpecs]);

  // Update form when initialBottleName changes
  useEffect(() => {
    if (show && initialBottleName) {
      const plainName = derivePlainBottleName(initialBottleName);
      
      // If we have suggested bottles, pre-populate with them
      let bottleNamesToUse = [{ value: initialBottleName, label: initialBottleName }];
      if (suggestedBottles && suggestedBottles.length > 0) {
        bottleNamesToUse = suggestedBottles.map(sb => ({
          value: sb.plainBottleName || sb.bottleName,
          label: sb.plainBottleName || sb.bottleName
        }));
      }
      
      setFormData({
        plainBottleName: plainName,
        bottleNames: bottleNamesToUse,
        bottlePerBox: '',
        status: 'active'
      });
      setIsPlainBottleManuallyEdited(false);
    } else if (!show) {
      // Reset when modal closes
      setFormData({
        plainBottleName: '',
        bottleNames: [],
        bottlePerBox: '',
        status: 'active'
      });
      setErrors({ bottleNames: '', bottlePerBox: '' });
      setIsPlainBottleManuallyEdited(false);
    }
  }, [show, initialBottleName, suggestedBottles]);

  // Auto-populate bottle names when plain bottle is selected
  useEffect(() => {
    if (formData.plainBottleName && isPlainBottleManuallyEdited && bottleNamesForPlainBottle.length > 0) {
      // When plain bottle is selected, auto-populate matching bottle names
      // But preserve any manually added ones
      const existingValues = new Set(formData.bottleNames.map(b => b.value));
      const autoSelectedValues = bottleNamesForPlainBottle;
      
      // Combine: keep existing + add all auto-selected ones (no duplicates)
      const combined = Array.from(new Set([...existingValues, ...autoSelectedValues]))
        .map(val => ({ value: val, label: val }));
      
      if (combined.length > 0) {
        setFormData(prev => ({
          ...prev,
          bottleNames: combined
        }));
      }
    }
  }, [formData.plainBottleName, bottleNamesForPlainBottle, isPlainBottleManuallyEdited]);

  const uniqueBottleNames = useMemo(() => {
    const target = (formData.plainBottleName || '').trim().toLowerCase();

    const capMatch = target.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?/i);
    const numPart = capMatch ? capMatch[1] : '';
    const unitPart = capMatch && capMatch[2] ? capMatch[2] : 'ml';
    const volumePrefix = numPart ? `${numPart} ${unitPart}`.toLowerCase() : '';

    const list = [...allRawBottleNames];

    list.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      if (target) {
        const aExact = aLower === target || aLower.startsWith(target);
        const bExact = bLower === target || bLower.startsWith(target);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aContains = aLower.includes(target);
        const bContains = bLower.includes(target);
        if (aContains && !bContains) return -1;
        if (!aContains && bContains) return 1;

        if (volumePrefix) {
          const aVol = aLower.startsWith(volumePrefix);
          const bVol = bLower.startsWith(volumePrefix);
          if (aVol && !bVol) return -1;
          if (!aVol && bVol) return 1;
        }

        if (numPart) {
          const aNum = aLower.startsWith(numPart);
          const bNum = bLower.startsWith(numPart);
          if (aNum && !bNum) return -1;
          if (!aNum && bNum) return 1;
        }
      }

      return a.localeCompare(b);
    });

    return list.map(name => ({ value: name, label: name }));
  }, [allRawBottleNames, formData.plainBottleName]);

  const validateField = (name, value) => {
    let msg = '';
    if (name === 'bottleNames' && (!value || value.length === 0)) {
      msg = 'Please select at least one bottle';
    } else if (name === 'bottlePerBox' && !value) {
      msg = 'Bottle per Box is mandatory';
    }
    setErrors(prev => ({ ...prev, [name]: msg }));
    return msg;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nameError = validateField('bottleNames', formData.bottleNames);
    const countError = validateField('bottlePerBox', formData.bottlePerBox);

    if (nameError || countError) {
      return Swal.fire('Validation Error', 'Please fill all required fields.', 'error');
    }

    const payload = {
      ...formData,
      bottleNames: formData.bottleNames.map(opt => opt.value)
    };

    try {
      const res = await dispatch(createBottlePerBox(payload));
      if (!res.error) {
        Swal.fire('Created!', 'Bottle configuration added successfully!', 'success');
        // Refresh bottle list
        await dispatch(fetchBottlePerBoxes());
        if (onSuccess) {
          onSuccess(formData.bottleNames.map(opt => opt.value)[0]);
        }
        onClose();
      } else {
        Swal.fire('Error!', res.payload || 'Failed to create configuration.', 'error');
      }
    } catch (err) {
      Swal.fire('Error!', 'Failed to create bottle configuration.', 'error');
    }
  };

  if (!show) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content border-0 shadow">
          <div className="modal-header" style={{ background: 'linear-gradient(135deg, #00aeef, #0099cc)', color: 'white' }}>
            <h5 className="modal-title fw-bold">
              <i className="bi bi-plus-circle me-2"></i> Add New Bottle Configuration
              {suggestedBottles && suggestedBottles.length > 0 && (
                <span className="badge bg-warning text-dark ms-2" style={{ fontSize: '0.75rem' }}>
                  {suggestedBottles.length} Match{suggestedBottles.length !== 1 ? 'es' : ''}
                </span>
              )}
            </h5>
            <button 
              type="button" 
              className="btn-close btn-close-white shadow-none" 
              onClick={onClose}
              disabled={loading}
            ></button>
          </div>

          <div className="modal-body p-4">
            {suggestedBottles && suggestedBottles.length > 0 && (
              <div className="alert alert-info mb-4 border-0 rounded-3" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                <i className="bi bi-lightbulb me-2"></i>
                <strong>Suggestions found:</strong> We found {suggestedBottles.length} similar bottle(s) in the system based on fuzzy matching. They're pre-selected below. Adjust as needed or keep them.
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="row g-4">
                <div className="col-md-6">
                  <label className="form-label fw-600 small text-uppercase text-muted">
                    Plain Bottle (Base Mold)
                  </label>
                  <CreatableSelect
                    options={plainBottleOptions}
                    value={formData.plainBottleName ? { value: formData.plainBottleName, label: formData.plainBottleName } : null}
                    onChange={(option) => {
                      setIsPlainBottleManuallyEdited(true);
                      setFormData(prev => ({ 
                        ...prev, 
                        plainBottleName: option ? option.value : '' 
                      }));
                    }}
                    onInputChange={(val) => {
                      setIsPlainBottleManuallyEdited(true);
                      setFormData(prev => ({ ...prev, plainBottleName: val }));
                    }}
                    isClearable
                    isSearchable
                    isCreatable
                    placeholder="Select or type plain bottle..."
                    classNamePrefix="react-select"
                    styles={{
                      control: (base) => ({
                        ...base,
                        borderRadius: '8px',
                        borderColor: '#00aeef',
                        borderWidth: '2px',
                        minHeight: '42px',
                        boxShadow: 'none',
                        '&:hover': {
                          borderColor: '#0099cc'
                        },
                        '&:focus': {
                          borderColor: '#0099cc',
                          boxShadow: '0 0 0 3px rgba(0, 174, 239, 0.1)'
                        }
                      }),
                      option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isSelected ? '#00aeef' : state.isFocused ? '#e0f2fe' : 'white',
                        color: state.isSelected ? 'white' : '#333',
                        cursor: 'pointer',
                        '&:active': {
                          backgroundColor: '#00aeef'
                        }
                      }),
                      menuList: (base) => ({
                        ...base,
                        maxHeight: '250px'
                      })
                    }}
                    formatCreateLabel={(inputValue) => `Add "${inputValue}" as plain bottle`}
                  />
                  <small className="text-muted d-block mt-2">
                    <i className="bi bi-info-circle me-1"></i>
                    Select from existing plain bottles or type a new one
                  </small>
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-600 small text-uppercase text-muted">
                    Bottle Name(s) <span className="text-danger">*</span>
                    {bottleNamesForPlainBottle.length > 0 && formData.plainBottleName && (
                      <span className="badge bg-success ms-2" style={{ fontSize: '0.7rem' }}>
                        {bottleNamesForPlainBottle.length} auto-matched
                      </span>
                    )}
                  </label>
                  <CreatableSelect
                    isMulti
                    options={uniqueBottleNames}
                    value={formData.bottleNames}
                    onChange={(selected) => {
                      const newSelection = selected || [];
                      setFormData(prev => {
                        const updated = { ...prev, bottleNames: newSelection };
                        // Only auto-derive plain bottle if NOT manually edited by plain bottle field
                        if (!isPlainBottleManuallyEdited && newSelection.length > 0) {
                          updated.plainBottleName = derivePlainBottleName(newSelection[0].value);
                        }
                        return updated;
                      });
                      if (errors.bottleNames) setErrors(prev => ({ ...prev, bottleNames: '' }));
                    }}
                    onBlur={() => validateField('bottleNames', formData.bottleNames)}
                    isClearable
                    isSearchable
                    isCreatable
                    isMulti
                    placeholder="Select or type bottle names (supports spelling variations)..."
                    classNamePrefix="react-select"
                    className={errors.bottleNames ? 'is-invalid' : ''}
                    styles={{
                      control: (base, state) => ({
                        ...base,
                        borderRadius: '8px',
                        borderColor: errors.bottleNames ? '#dc3545' : state.isFocused ? '#0099cc' : '#00aeef',
                        borderWidth: '2px',
                        minHeight: '42px',
                        boxShadow: state.isFocused ? '0 0 0 3px rgba(0, 174, 239, 0.1)' : 'none',
                        backgroundColor: '#fff',
                        '&:hover': {
                          borderColor: errors.bottleNames ? '#dc3545' : '#0099cc'
                        }
                      }),
                      multiValue: (base) => ({
                        ...base,
                        backgroundColor: '#e0f2fe',
                        borderRadius: '6px',
                        padding: '4px'
                      }),
                      multiValueLabel: (base) => ({
                        ...base,
                        color: '#0369a1',
                        fontSize: '0.95em',
                        fontWeight: '500'
                      }),
                      multiValueRemove: (base) => ({
                        ...base,
                        color: '#0369a1',
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: '#0369a1',
                          color: 'white'
                        }
                      }),
                      option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isSelected ? '#00aeef' : state.isFocused ? '#e0f2fe' : 'white',
                        color: state.isSelected ? 'white' : '#333',
                        cursor: 'pointer',
                        fontWeight: state.isSelected ? '600' : '400',
                        '&:active': {
                          backgroundColor: '#00aeef'
                        }
                      }),
                      menuList: (base) => ({
                        ...base,
                        maxHeight: '250px'
                      })
                    }}
                    formatCreateLabel={(inputValue) => `Add "${inputValue}" as bottle name`}
                    noOptionsMessage={() => 'Start typing to create new bottle name'}
                  />
                  <small className="text-muted d-block mt-2">
                    <i className="bi bi-info-circle me-1"></i>
                    Select multiple bottles, including spelling variations. Auto-selects related bottles when you pick a plain bottle.
                  </small>
                  {errors.bottleNames && (
                    <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>
                      {errors.bottleNames}
                    </div>
                  )}
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-600 small text-uppercase text-muted">
                    Bottle per Box <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    className={`form-control custom-input-field ${errors.bottlePerBox ? 'is-invalid' : ''}`}
                    name="bottlePerBox"
                    value={formData.bottlePerBox}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, bottlePerBox: e.target.value }));
                      if (errors.bottlePerBox) setErrors(prev => ({ ...prev, bottlePerBox: '' }));
                    }}
                    onBlur={() => validateField('bottlePerBox', formData.bottlePerBox)}
                    placeholder="e.g. 24"
                    min="1"
                    style={{ borderRadius: 12, padding: '8px 12px' }}
                  />
                  {errors.bottlePerBox && (
                    <div className="invalid-feedback" style={{ display: 'block' }}>
                      {errors.bottlePerBox}
                    </div>
                  )}
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-600 small text-uppercase text-muted">Status</label>
                  <select
                    className="form-select custom-input-field"
                    name="status"
                    value={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    style={{ borderRadius: 12 }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </form>
          </div>

          <div className="modal-footer bg-light border-top pt-3">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className="btn btn-accent" 
              onClick={handleSubmit}
              disabled={loading}
              style={{ background: 'linear-gradient(135deg, #00aeef, #0099cc)', color: 'white', border: 'none' }}
            >
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : <><i className="bi bi-check2-circle me-2" /> Save Configuration</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
