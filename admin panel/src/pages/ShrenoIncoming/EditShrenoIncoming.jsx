import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { useSelector, useDispatch } from 'react-redux';
import { fetchItemTypes, updateItemType } from '../../redux/slices/itemTypeSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { parseShrenoChallan } from '../../redux/slices/visionSlice';
import { fetchIncomingPlainBottleOptions } from '../../redux/slices/incomingSlice';
import { PO_REQUIRED_COMPANY } from '../../config/incomingConfig';

// Simple debounce utility
const debounce = (fn, wait) => {
  let timeout;
  const debounced = (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
};

const normalizeBottleName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export default function EditShrenoIncoming() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { itemTypes } = useSelector(state => state.itemTypes || { itemTypes: [] });
  const { items: bottlePerBoxes } = useSelector(state => state.bottlePerBox || { items: [] });
  const { plainBottleOptionsByCompany } = useSelector(state => state.incoming);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    challanNo: '',
    poNo: '',
    poDate: '',
    vehicleNo: '',
  });

  const [items, setItems] = useState([
    { plainBottle: '', itemType: '', configuration: '', quantity: '' }
  ]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [otherBottles, setOtherBottles] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createErrors, setCreateErrors] = useState({});
  const [newBottlesToCreate, setNewBottlesToCreate] = useState({});
  const [imageFiles, setImageFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Cleanup state on mount (reset search results)
  useEffect(() => {
    setOtherBottles([]);
    setSearchLoading(false);
    setCreateErrors({});
    setNewBottlesToCreate({});
  }, []);

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ pagination: "false" }));
    dispatch(fetchItemTypes({ page: 1, limit: 1000 }));
    dispatch(fetchIncomingPlainBottleOptions(PO_REQUIRED_COMPANY.id));
    
    // Fetch record data
    const fetchRecord = async () => {
      try {
        const res = await api.get(`/shreno-incoming/${id}`);
        if (res.data.success) {
          const record = res.data.data;
          setFormData({
            date: record.date ? new Date(record.date).toISOString().split('T')[0] : '',
            challanNo: record.challanNo || '',
            poNo: record.poNo || '',
            poDate: record.poDate ? new Date(record.poDate).toISOString().split('T')[0] : ''
          });
          if (record.items && record.items.length > 0) {
            setItems(record.items.map((item, idx) => ({
              plainBottle: item.plainBottle?._id || item.plainBottle || '',
              itemType: item.itemType?._id || item.itemType || '',
              configuration: item.configuration || '',
              quantity: item.quantity || '',
              sharedGroupId: 'grp_' + id + '_' + idx
            })));
          }
        }
      } catch (err) {
        // Silently handle fetch error - could show error state if needed
      }
    };
    
    fetchRecord();
  }, [dispatch, id]);

  const companyBottleOptions = plainBottleOptionsByCompany[PO_REQUIRED_COMPANY.id] || {};
  const plainBottleOptions = companyBottleOptions.options || [];

  // Debounced global bottle search
  const debouncedSearch = useMemo(() => {
    const fn = async (inputValue) => {
      if (!inputValue || inputValue.trim().length < 2) {
        setOtherBottles([]);
        return;
      }
      setSearchLoading(true);
      try {
        const url = `/api/bottle-per-box/search?q=${encodeURIComponent(inputValue)}&limit=10`;
        const res = await fetch(url);
        
        if (!res.ok) {
          setOtherBottles([]);
          return;
        }
        
        const data = await res.json();
        const items = data.data || data.items || (Array.isArray(data) ? data : []);
        if (!Array.isArray(items)) {
          setOtherBottles([]);
          return;
        }
        
        const companyBottleValues = new Set(plainBottleOptions.map(b => (b.plainBottleName || b.value || '').toLowerCase()));
        const otherBottlesList = (items || []).filter(item => {
          const itemName = (item.plainBottleName || item.bottleName || item.name || '').toLowerCase();
          return !companyBottleValues.has(itemName);
        }).map(item => ({
          value: item.plainBottleName || item.bottleName || item.name,
          label: item.plainBottleName || item.bottleName || item.name,
          plainBottleName: item.plainBottleName || item.bottleName || item.name,
          isOtherBottle: true,
          bottlePerBoxData: item
        }));
        
        setOtherBottles(otherBottlesList);
      } catch (err) {
        setOtherBottles([]);
      } finally {
        setSearchLoading(false);
      }
    };
    const debounced = debounce(fn, 300);
    return debounced;
  }, [plainBottleOptions]);

  const handleInputChangeBottle = (inputValue) => {
    if (!inputValue || inputValue.trim().length < 2) {
      setOtherBottles([]);
      if (debouncedSearch.cancel) {
        debouncedSearch.cancel();
      }
    } else {
      const companyMatches = plainBottleOptions.filter(opt => 
        (opt.label || '').toLowerCase().includes(inputValue.toLowerCase())
      );
      
      if (companyMatches.length > 0) {
        setOtherBottles([]);
        if (debouncedSearch.cancel) {
          debouncedSearch.cancel();
        }
      } else {
        debouncedSearch(inputValue);
      }
    }
  };

  // Memoize combined + deduplicated bottle options
  const optionsList = useMemo(() => {
    const combined = [...plainBottleOptions, ...otherBottles];
    const seen = new Set();
    return combined
      .filter(opt => {
        if (seen.has(opt.value)) return false;
        seen.add(opt.value);
        return true;
      })
      .sort((a, b) => {
        if (a.isOtherBottle !== b.isOtherBottle) {
          return a.isOtherBottle ? 1 : -1;
        }
        return (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [plainBottleOptions, otherBottles]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Handle CreatableSelect "Create" option - store bottle name, don't create yet
  const handleCreateBottle = (inputValue, index) => {
    const bottleName = inputValue.trim();
    if (!bottleName || bottleName.length < 2) {
      setCreateErrors(prev => ({
        ...prev,
        [index]: 'Bottle name must be at least 2 characters'
      }));
      return;
    }

    // Show toast notification for bottle creation
    Swal.fire({
      position: 'top-right',
      icon: 'info',
      title: 'Plain Bottle Created',
      text: `"${bottleName}" created successfully`,
      timer: 2000,
      timerProgressBar: true,
      showConfirmButton: false,
      toast: true
    });

    // Store the bottle name to create later on submit
    setNewBottlesToCreate(prev => ({
      ...prev,
      [index]: bottleName
    }));

    // Set plainBottle to the bottle name
    handleItemChange(index, 'plainBottle', bottleName);
    
    // Clear any previous error for this item
    setCreateErrors(prev => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    if (field === 'plainBottle') newItems[index].bottleHint = '';
    setItems(newItems);
  };

  // Handle creating new configuration
  const handleCreateConfiguration = async (inputValue, itemTypeId, index) => {
    const configName = inputValue.trim();
    if (!configName || configName.length < 1) {
      return;
    }

    try {
      // Find the ItemType to get current data
      const itemType = itemTypes.find(it => it._id === itemTypeId);
      if (!itemType) return;

      // Check if configuration already exists
      if (itemType.options && itemType.options.includes(configName)) {
        return;
      }

      // Update ItemType with new configuration via Redux
      const updatedOptions = [...(itemType.options || []), configName];
      const result = await dispatch(updateItemType({
        id: itemTypeId,
        data: {
          name: itemType.name,
          status: itemType.status,
          options: updatedOptions
        }
      })).unwrap();

      // Show success toast
      Swal.fire({
        position: 'top-right',
        icon: 'success',
        title: 'Configuration Created',
        text: `"${configName}" added to ${itemType.name}`,
        timer: 1500,
        timerProgressBar: true,
        showConfirmButton: false,
        toast: true
      });
    } catch (err) {
      Swal.fire({
        position: 'top-right',
        icon: 'error',
        title: 'Error',
        text: 'Failed to create configuration',
        timer: 1500,
        timerProgressBar: true,
        showConfirmButton: false,
        toast: true
      });
    }
  };

  const addItem = () => {
    setItems([...items, { plainBottle: '', itemType: '', configuration: '', quantity: '' }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUploadMoreParse = async (files) => {
    if (!files || files.length === 0) return;
    
    // First save them to imageFiles
    setImageFiles(prev => [...prev, ...files]);
    
    // Show a loading swal since this triggers right on file selection
    Swal.fire({
      title: 'Parsing document...',
      text: 'Extracting bottle data...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    try {
      const res = await dispatch(parseShrenoChallan(files)).unwrap();
      
      const { options: allowedBottleOptions } = await dispatch(
        fetchIncomingPlainBottleOptions(PO_REQUIRED_COMPANY.id)
      ).unwrap();
      const allowedBottleIds = new Set(allowedBottleOptions.map(option => option.value));
      const newItemsToAppend = (res.items || []).map(item => {
        // Item should have bottleId (BottlePerBox ObjectId) from vision parser
        const bottleId = item.bottleId?._id || item.bottleId;
        const allowedBottleId = allowedBottleIds.has(String(bottleId || '')) ? String(bottleId) : '';
        return {
          plainBottle: allowedBottleId,
          bottleHint: allowedBottleId ? '' : item.bottleName || item.suggestedName || '',
          itemType: '',
          configuration: '',
          quantity: item.qty || item.totalQty || ''
        };
      });

      if (res.unmatchedItems && res.unmatchedItems.length > 0) {
        res.unmatchedItems.forEach(u => {
          newItemsToAppend.push({
            plainBottle: '',
            bottleHint: u.suggestedName || '',
            itemType: '',
            configuration: '',
            quantity: u.qty || u.totalQty || ''
          });
        });
      }

      setItems(prev => {
        const newItems = [...prev];
        if (newItems.length === 1 && !newItems[0].plainBottle && !newItems[0].quantity) {
          return newItemsToAppend.length > 0 ? newItemsToAppend : newItems;
        }
        return [...newItems, ...newItemsToAppend];
      });

      Swal.fire({
        icon: 'success',
        title: 'Document Parsed',
        text: `Appended ${newItemsToAppend.length} items to the table.`,
      });
    } catch (err) {
      Swal.fire('Error', err || 'Failed to parse the uploaded document', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.challanNo || !formData.date) {
      return Swal.fire('Error', 'Date and Challan Number are required.', 'error');
    }
    

    for (let i = 0; i < items.length; i++) {
      if (!items[i].plainBottle || !items[i].itemType || !items[i].configuration || !items[i].quantity) {
        return Swal.fire('Error', `Please fill all fields for item row ${i + 1}`, 'error');
      }
    }

    setLoading(true);
    try {
      const data = new FormData();
      data.append('date', formData.date);
      data.append('challanNo', formData.challanNo);
      data.append('poNo', formData.poNo);
      data.append('poDate', formData.poDate);
      data.append('items', JSON.stringify(items.map((item) => {
        const savedItem = { ...item };
        delete savedItem.bottleHint;
        return savedItem;
      })));
      if (imageFiles && imageFiles.length > 0) {
        imageFiles.forEach(file => data.append('images', file));
      }

      const res = await api.put(`/shreno-incoming/${id}`, data);
      if (res.data.success) {
        // Show success SweetAlert modal (centered, not toast)
        Swal.fire({
          position: 'center',
          icon: 'success',
          title: 'Success!',
          text: 'Shreno incoming updated successfully',
          confirmButtonText: 'OK'
        }).then(() => {
          navigate('/shreno-incoming');
        });
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Server error', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Group items by plainBottle to show "add item type" button
  const itemsByBottle = useMemo(() => {
    const grouped = {};
    items.forEach((item, index) => {
      if (item.plainBottle) {
        if (!grouped[item.plainBottle]) {
          grouped[item.plainBottle] = [];
        }
        grouped[item.plainBottle].push(index);
      }
    });
    return grouped;
  }, [items]);

  // Get configuration options for a selected itemType
  const getConfigurationOptions = (selectedItemTypeId) => {
    if (!selectedItemTypeId || !itemTypes) return [];
    const itemType = itemTypes.find(it => it._id === selectedItemTypeId);
    if (!itemType || !itemType.options) return [];
    return itemType.options.map(opt => ({ value: opt, label: opt }));
  };

  return (
    <div className="page-content">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">Edit Shreno Challan</h1>
            <p className="page-subtitle mb-0">Modify items from Shreno</p>
          </div>
        </div>
      </div>

      <div className="dash-card border-0 shadow-sm p-4 bg-white rounded-4">
        <form onSubmit={handleSubmit}>
          <div className="row g-3 mb-4">
            <div className="col-md-3">
              <label className="form-label fw-bold small">Date <span className="text-danger">*</span></label>
              <input type="date" className="form-control shadow-none" style={{ borderRadius: 8 }} name="date" value={formData.date} onChange={handleChange} required />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold small">Challan / Delivery No <span className="text-danger">*</span></label>
              <input type="text" className="form-control shadow-none" style={{ borderRadius: 8 }} name="challanNo" value={formData.challanNo} onChange={handleChange} required placeholder="e.g. DOM/..." />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold small">PO No</label>
              <input type="text" className="form-control shadow-none" style={{ borderRadius: 8 }} name="poNo" value={formData.poNo} onChange={handleChange} />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold small">PO Date</label>
              <input type="date" className="form-control shadow-none" style={{ borderRadius: 8 }} name="poDate" value={formData.poDate} onChange={handleChange} />
            </div>

          </div>

          <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2 mt-4">
            <h6 className="fw-bold text-primary mb-0">PRODUCT ENTRIES</h6>
          </div>
          
          <div className="table-responsive mb-3">
            <table className="table table-bordered align-middle">
              <thead className="table-light">
                <tr>
                  <th className="small text-muted text-center" style={{width: '5%', minWidth: '50px'}}>Sr.</th>
                  <th className="small text-muted" style={{width: '30%'}}>Plain Bottle <span className="text-danger">*</span></th>
                  <th className="small text-muted" style={{width: '20%'}}>Item Type <span className="text-danger">*</span></th>
                  <th className="small text-muted" style={{width: '25%'}}>Configuration (e.g. 2PC, 64x1) <span className="text-danger">*</span></th>
                  <th className="small text-muted text-end" style={{width: '12%'}}>Quantity <span className="text-danger">*</span></th>
                  <th className="small text-muted text-center" style={{width: '8%'}}>Action</th>
                </tr>
              </thead>
              <tbody className="border-top-0">
                {items.map((item, index) => {
                  const plainBottleOption = plainBottleOptions.find(opt => opt.value === String(item.plainBottle)) || (
                    item.plainBottle
                      ? {
                          value: String(item.plainBottle),
                          label: bottlePerBoxes.find(bottle => String(bottle._id) === String(item.plainBottle))?.plainBottleName ||
                            bottlePerBoxes.find(bottle => String(bottle._id) === String(item.plainBottle))?.bottleName ||
                            'Previously saved bottle',
                        }
                      : null
                  );
                  
                  // Check if this is the first item in its bottle group (for rowSpan)
                  const isFirstInBottleGroup = !items.slice(0, index).some(i => i.plainBottle === item.plainBottle);
                  
                  // Check if this is the first item in its itemType group (for rowSpan)
                  const isFirstInItemTypeGroup = !items.slice(0, index).some(i => i.plainBottle === item.plainBottle && i.itemType === item.itemType);
                  
                  // Count total items in this bottle group
                  const itemsInBottleGroup = items.filter(i => i.plainBottle === item.plainBottle).length;
                  
                  // Count total items in this itemType group (same bottle AND same itemType)
                  const itemsInItemTypeGroup = items.filter(i => i.plainBottle === item.plainBottle && i.itemType === item.itemType).length;
                  
                  // Calculate rowSpan for bottle column
                  const bottleRowSpan = isFirstInBottleGroup ? itemsInBottleGroup : 0;
                  
                  // Calculate rowSpan for itemType column
                  const itemTypeRowSpan = isFirstInItemTypeGroup ? itemsInItemTypeGroup : 0;

                  return (
                  <tr key={index}>
                    <td className="text-center text-muted">{index + 1}</td>
                    {isFirstInBottleGroup && (
                      <td rowSpan={bottleRowSpan}>
                        <CreatableSelect 
                          options={optionsList}
                          value={plainBottleOption || null}
                          onChange={(selected) => {
                            const newBottleId = selected?.value || '';
                            handleItemChange(index, 'plainBottle', newBottleId);
                          }}
                          onCreateOption={(inputValue) => handleCreateBottle(inputValue, index)}
                          placeholder={companyBottleOptions.loading || !companyBottleOptions.loaded
                            ? 'Loading SHRENO plain bottles...'
                            : 'Select or Create Plain Bottle'}
                          isClearable
                          isDisabled={companyBottleOptions.loading || !companyBottleOptions.loaded || Boolean(companyBottleOptions.error)}
                          menuPortalTarget={document.body}
                          formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                          styles={{
                            menuPortal: base => ({ ...base, zIndex: 9999 }),
                            control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)', minHeight: '38px' })
                          }}
                        />
                        {createErrors[index] && (
                          <small className="text-danger d-block mt-1">{createErrors[index]}</small>
                        )}
                        {item.bottleHint && (
                          <small className="text-warning-emphasis d-block mt-1">
                            Scanned bottle: {item.bottleHint}. Choose a plain bottle for SHRENO.
                          </small>
                        )}
                        {companyBottleOptions.error && (
                          <small className="text-danger d-block mt-1">{companyBottleOptions.error}</small>
                        )}
                      </td>
                    )}
                    {isFirstInItemTypeGroup && (
                      <td rowSpan={itemTypeRowSpan}>
                        <select className="form-select shadow-none" style={{ borderRadius: 8, backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' }} value={item.itemType} onChange={(e) => handleItemChange(index, 'itemType', e.target.value)} required>
                          <option value="">Select Type</option>
                          {itemTypes?.map(it => (
                            <option key={it._id} value={it._id}>{it.name}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td>
                      {(() => {
                        // Get all configurations for this itemType group
                        const itemTypeGroupItems = items.filter(i => i.plainBottle === item.plainBottle && i.itemType === item.itemType);
                        const selectedConfigs = new Set(itemTypeGroupItems.map(gi => gi.configuration).filter(Boolean));
                        
                        // Filter out already selected configurations
                        const availableOptions = getConfigurationOptions(item.itemType).filter(
                          opt => !selectedConfigs.has(opt.value) || opt.value === item.configuration
                        );
                        
                        return (
                          <CreatableSelect 
                            options={availableOptions}
                            value={item.configuration ? { value: item.configuration, label: item.configuration } : null}
                            onChange={(selected) => {
                              if (selected && Array.isArray(selected)) {
                                // Multiple selections - create rows for each configuration
                                const newRows = selected.map((config, idx) => ({
                                  plainBottle: item.plainBottle,
                                  itemType: item.itemType,
                                  configuration: config.value,
                                  quantity: idx === 0 ? item.quantity : '',
                                }));
                                // Replace current item and add rest of the new rows
                                const beforeItems = items.slice(0, index);
                                const afterItems = items.slice(index + 1);
                                setItems([...beforeItems, ...newRows, ...afterItems]);
                              } else if (selected) {
                                // Single selection
                                handleItemChange(index, 'configuration', selected.value);
                              } else {
                                // Clear selection
                                handleItemChange(index, 'configuration', '');
                              }
                            }}
                            onCreateOption={(inputValue) => {
                              handleCreateConfiguration(inputValue, item.itemType, index);
                              
                              // Smart placement: if current field is empty, use it
                              if (!item.configuration) {
                                handleItemChange(index, 'configuration', inputValue);
                              } else {
                                // Find empty field in same itemType group
                                const itemTypeGroupItems = items.filter(i => i.plainBottle === item.plainBottle && i.itemType === item.itemType);
                                const emptyFieldIndex = itemTypeGroupItems.findIndex(gi => !gi.configuration);
                                
                                if (emptyFieldIndex !== -1) {
                                  const actualIndex = items.indexOf(itemTypeGroupItems[emptyFieldIndex]);
                                  handleItemChange(actualIndex, 'configuration', inputValue);
                                }
                              }
                            }}
                            placeholder={!item.itemType ? 'Select Item Type first' : 'Select or Create Configuration(s)'}
                            isClearable
                            isDisabled={!item.itemType}
                            isMulti
                            formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                            menuPortalTarget={document.body}
                            styles={{
                              menuPortal: base => ({ ...base, zIndex: 9999 }),
                              control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' })
                            }}
                          />
                        );
                      })()}
                    </td>
                    <td>
                      <input type="number" min="0" step="0.01" className="form-control text-end shadow-none" style={{ borderRadius: 8 }} value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} required />
                    </td>
                    <td className="text-center">
                      <div className="d-flex gap-1 justify-content-center">
                        {isFirstInItemTypeGroup && item.plainBottle && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2"
                            title="Add another item type for this bottle"
                            onClick={() => {
                              setItems([...items, { 
                                plainBottle: item.plainBottle, 
                                itemType: '', 
                                configuration: '', 
                                quantity: ''
                              }]);
                            }}
                          >
                            <i className="bi bi-plus-lg fs-6"></i>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                        >
                          <i className="bi bi-trash fs-6"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="d-flex gap-3 mb-4">
            <button type="button" className="btn btn-sm btn-outline-primary fw-600 rounded-pill px-3 mb-0" onClick={addItem}>
              <i className="bi bi-plus-lg me-1"></i> Add Another Item
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary fw-600 rounded-pill px-3 mb-0" onClick={() => document.getElementById('manual-upload-more').click()}>
              <i className="bi bi-magic me-1"></i> Scan Another Document
            </button>
            <input 
              type="file" 
              id="manual-upload-more"
              accept="image/*,application/pdf" 
              multiple 
              className="d-none" 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUploadMoreParse(Array.from(e.target.files));
                }
              }} 
            />
          </div>

          <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
            <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
              <i className="bi bi-check2-circle me-2" /> {loading ? 'Saving...' : 'Update Record'}
            </button>
            <button type="button" onClick={() => navigate('/shreno-incoming')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
