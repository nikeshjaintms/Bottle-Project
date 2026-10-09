import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';
import Select from 'react-select';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { useSelector, useDispatch } from 'react-redux';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchItemTypes } from '../../redux/slices/itemTypeSlice';
import { parseShrenoChallan } from '../../redux/slices/visionSlice';

export default function AddShrenoIncoming() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { bottleSpecs } = useSelector(state => state.bottleSpecs);
  const { itemTypes } = useSelector(state => state.itemTypes);
  const { loading: visionLoading } = useSelector(state => state.vision);
  const { companies } = useSelector(state => state.companies);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    challanNo: '',
    poNo: '',
    poDate: '',
  });

  const [items, setItems] = useState([
    { bottleName: '', itemType: '', configuration: '', quantity: '' }
  ]);
  const [imageFiles, setImageFiles] = useState([]);
  const [scannedImageFiles, setScannedImageFiles] = useState([]);
  const [cameraSource, setCameraSource] = useState(null);
  const [mode, setMode] = useState('manual');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: "false" }));
    dispatch(fetchBottleSpecs({ pagination: "false", type: "all" }));
    dispatch(fetchItemTypes({ page: 1, limit: 1000 }));
  }, [dispatch]);

  const uniqueShrenoBottles = useMemo(() => {
    if (!bottleSpecs || !companies) return [];
    
    // Find Shreno company
    const shrenoCompany = companies.find(c => c.name.toLowerCase().includes('shreno'));
    const shrenoId = shrenoCompany?._id;
    
    const shrenoSpecs = shrenoId 
      ? bottleSpecs.filter(spec => spec.brandId?.companyId?._id === shrenoId || spec.brandId?.companyId === shrenoId)
      : bottleSpecs;
      
    // Deduplicate by bottleName
    const unique = [];
    const seen = new Set();
    for (const spec of shrenoSpecs) {
      if (!seen.has(spec.bottleName)) {
        seen.add(spec.bottleName);
        unique.push(spec);
      }
    }
    return unique;
  }, [bottleSpecs, companies]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { bottleName: '', itemType: '', configuration: '', quantity: '' }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.challanNo || !formData.date) {
      return Swal.fire('Error', 'Date and Challan Number are required.', 'error');
    }
    

    for (let i = 0; i < items.length; i++) {
      if (!items[i].bottleName || !items[i].itemType || !items[i].configuration || !items[i].quantity) {
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
      data.append('items', JSON.stringify(items));
      imageFiles.forEach(file => {
        data.append('images', file);
      });

      const res = await api.post('/shreno-incoming', data);
      if (res.data.success) {
        Swal.fire('Success', 'Shreno incoming added successfully', 'success');
        navigate('/shreno-incoming');
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Server error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMatch = async () => {
    if (scannedImageFiles.length === 0) {
      Swal.fire('Error', 'Please upload at least one challan document.', 'error');
      return;
    }
    if (scannedImageFiles.length > 5) {
      Swal.fire('Error', 'You can only upload up to 5 files.', 'error');
      return;
    }
    try {
      const res = await dispatch(parseShrenoChallan(scannedImageFiles)).unwrap();
      setFormData(prev => ({ 
        ...prev, 
        challanNo: res.deliveryNumber || '',
        date: res.documentDate || prev.date,
        poNo: res.poNo || '',
        poDate: res.poDate || ''
      }));

      const itemsToSet = (res.items || []).map(item => {
        // The API returns a BottlePerBox object, but we need the matching BottleSpec ID for the dropdown
        const parsedName = item.bottleId?.bottleName || item.bottleName || '';
        const matchedSpec = uniqueShrenoBottles.find(spec => spec.bottleName === parsedName);
        
        return {
          bottleName: matchedSpec ? matchedSpec._id : '',
          itemType: item.itemType || '',
          configuration: item.configuration || '',
          quantity: item.totalQty || item.qty || ''
        };
      });

      if (res.unmatchedItems && res.unmatchedItems.length > 0) {
        res.unmatchedItems.forEach(uItem => {
          itemsToSet.push({
            bottleName: '',
            itemType: uItem.itemType || '',
            configuration: uItem.configuration || '',
            quantity: uItem.totalQty || uItem.qty || ''
          });
        });
      }

      let warningText = '';
      if (!res.deliveryNumber) {
        warningText += `<br/><br/><b style='color:#e63946;'>Warning:</b> Could not detect a valid Challan or Delivery Number.`;
      }
      if (res.unmatchedItems && res.unmatchedItems.length > 0) {
        const unmatchedNames = res.unmatchedItems.map(i => i.suggestedName).join(', ');
        warningText += `<br/><br/><b style='color:#e63946;'>Warning:</b> Found ${res.unmatchedItems.length} item(s) that do not match: ${unmatchedNames}.`;
      }

      if (itemsToSet.length > 0) {
        setItems(itemsToSet);
        Swal.fire({
          icon: (res.unmatchedItems && res.unmatchedItems.length > 0) ? 'warning' : 'success',
          title: 'Challan Parsed',
          html: `Found Challan No: <b>${res.deliveryNumber || 'N/A'}</b>.<br/>Matched ${res.items?.length || 0} items! ${warningText}`,
        });
        setMode('manual');
      } else {
        Swal.fire('Warning', 'No items could be detected from this challan.', 'warning').then(() => setMode('manual'));
      }
    } catch (error) {
      Swal.fire('Error', error || 'Failed to parse challan', 'error');
    }
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
      
      const newItemsToAppend = (res.items || []).map(item => {
        const parsedName = item.bottleId?.bottleName || item.bottleName || '';
        const matchedSpec = uniqueShrenoBottles.find(spec => spec.bottleName === parsedName);
        
        return {
          bottleName: matchedSpec ? matchedSpec._id : '',
          itemType: item.itemType || '',
          configuration: item.configuration || '',
          quantity: item.totalQty || item.qty || ''
        };
      });

      if (res.unmatchedItems && res.unmatchedItems.length > 0) {
        res.unmatchedItems.forEach(uItem => {
          newItemsToAppend.push({
            bottleName: '',
            itemType: '',
            configuration: '',
            quantity: uItem.totalQty || uItem.qty || ''
          });
        });
      }

      if (newItemsToAppend.length > 0) {
        setItems(prevItems => {
          // If the only item is a completely empty default row, overwrite it. Otherwise append.
          if (prevItems.length === 1 && !prevItems[0].bottleName && !prevItems[0].itemType && !prevItems[0].configuration && !prevItems[0].quantity) {
            return newItemsToAppend;
          }
          return [...prevItems, ...newItemsToAppend];
        });
        
        Swal.fire({
          icon: 'success',
          title: 'Document Parsed',
          text: `Added ${newItemsToAppend.length} new items from the document.`
        });
      } else {
        Swal.fire('Warning', 'No new items could be detected from this document.', 'warning');
      }
    } catch (error) {
      Swal.fire('Error', error || 'Failed to parse additional document', 'error');
    }
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between user-form-page-header">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left fs-5 text-secondary" />
          </button>
          <div>
            <h1 className="page-title">Add Shreno Challan</h1>
            <p className="page-subtitle">Record items specifically from Shreno</p>
          </div>
        </div>
        <div className="mode-toggle-container p-1 bg-light rounded-4 d-flex" style={{ border: '1px solid #eee' }}>
          <button
            className={`btn btn-sm py-2 px-4 rounded-3 border-0 transition-all ${mode === 'camera' ? 'btn-accent shadow-sm text-white' : 'btn-ghost'}`}
            onClick={() => setMode('camera')}
          >
            <i className="bi bi-cloud-arrow-up-fill me-2" /> Upload File
          </button>
          <button
            className={`btn btn-sm py-2 px-4 rounded-3 border-0 transition-all ${mode === 'manual' ? 'btn-accent shadow-sm text-white' : 'btn-ghost'}`}
            onClick={() => setMode('manual')}
          >
            <i className="bi bi-pencil-square me-2" /> Manual Mode
          </button>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          {mode === 'camera' ? (
            <div className="dash-card mb-4 overflow-hidden border-0 shadow-lg" style={{ borderRadius: 24 }}>
              <div className="dash-card-body p-3 p-md-5 text-center">
                {!cameraSource && (!scannedImageFiles || scannedImageFiles.length === 0) ? (
                  <div className="py-5">
                    <h3 className="fw-bold mb-4">How would you like to provide the document?</h3>
                    <div className="d-flex justify-content-center gap-4">
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
                    <div
                      className="upload-placeholder mx-auto mb-4 d-flex flex-column align-items-center justify-content-center"
                      style={{
                        maxWidth: 240,
                        width: '100%',
                        aspectRatio: '1 / 1',
                        borderRadius: 30,
                        border: '3px dashed #ddd',
                        background: (scannedImageFiles && scannedImageFiles.length > 0) ? 'transparent' : '#fcfcfc',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        position: 'relative'
                      }}
                      onClick={() => (scannedImageFiles && scannedImageFiles.length > 0) ? null : document.getElementById('camera-file').click()}
                    >
                      {scannedImageFiles && scannedImageFiles.length > 0 ? (
                        <div className="w-100 h-100 d-flex flex-column">
                          <div className="d-flex flex-wrap gap-1 justify-content-center align-items-center p-2" style={{ flex: 1 }}>
                            {scannedImageFiles.map((file, i) => (
                              <div key={i} className="position-relative" style={{ width: 60, height: 60 }}>
                                {file.type === 'application/pdf' ? (
                                  <div className="bg-white rounded-3 shadow-sm d-flex flex-column align-items-center justify-content-center w-100 h-100 border">
                                    <i className="bi bi-file-pdf-fill text-danger fs-4"></i>
                                  </div>
                                ) : (
                                  <img src={URL.createObjectURL(file)} alt="doc" className="rounded-3 shadow-sm object-fit-cover w-100 h-100 border" />
                                )}
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger rounded-circle position-absolute d-flex align-items-center justify-content-center p-0 shadow"
                                  style={{ width: 20, height: 20, top: -8, right: -8, zIndex: 10 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newFiles = [...scannedImageFiles];
                                    newFiles.splice(i, 1);
                                    setScannedImageFiles(newFiles);
                                    if (newFiles.length === 0) setCameraSource(null);
                                  }}
                                >
                                  <i className="bi bi-x" style={{ fontSize: 14 }} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="text-center pb-2 bg-light w-100">
                            <span className="badge bg-primary px-2 py-1 rounded-pill shadow-sm" style={{ fontSize: '0.7rem' }}>
                              <i className="bi bi-check-circle me-1"></i> {scannedImageFiles.length} file(s)
                            </span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <i className="bi bi-cloud-arrow-up text-accent mb-2" style={{ fontSize: 48 }} />
                          <span className="fw-600 text-muted text-center">Click to upload document<br/><small>(Max 5)</small></span>
                          <button className="btn btn-sm btn-ghost position-absolute top-0 end-0 m-2" onClick={(e) => { e.stopPropagation(); setCameraSource(null); }}>
                            <i className="bi bi-x-lg" />
                          </button>
                        </>
                      )}
                    </div>

                    <input
                      type="file"
                      id="camera-file"
                      hidden
                      multiple
                      accept="image/*,.pdf"
                      onChange={e => {
                        const files = Array.from(e.target.files);
                        if (scannedImageFiles.length + files.length > 5) {
                          Swal.fire('Error', 'You can only upload up to 5 files.', 'error');
                          return;
                        }
                        if (files.length > 0) {
                          setScannedImageFiles(prev => [...prev, ...files]);
                        }
                        setCameraSource('upload');
                      }}
                    />

                    {scannedImageFiles && scannedImageFiles.length > 0 && (
                      <>
                        <h3 className="fw-bold mt-4">Document Provided</h3>
                        <p className="text-muted">Process the document to auto-fill items</p>
                      </>
                    )}
                  </div>
                )}
                
                {(cameraSource || (scannedImageFiles && scannedImageFiles.length > 0)) && (
                  <div className="d-flex flex-column flex-sm-row justify-content-center align-items-center gap-3 mt-4">
                    <button className="btn-accent px-5 py-3 rounded-4 shadow-sm d-flex align-items-center gap-2 w-100 w-sm-auto justify-content-center" onClick={handleMatch} disabled={!scannedImageFiles || scannedImageFiles.length === 0 || visionLoading}>
                      {visionLoading ? (
                        <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Scanning...</>
                      ) : (
                        <><i className="bi bi-magic" /> Scan Document</>
                      )}
                    </button>
                    <button className="btn-ghost px-5 py-3 rounded-4 w-100 w-sm-auto" onClick={() => { setScannedImageFiles([]); setCameraSource(null); }} disabled={visionLoading}>
                      {(scannedImageFiles && scannedImageFiles.length > 0) ? 'Change Document' : 'Cancel'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (

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
                  <th className="small text-muted" style={{width: '35%'}}>Bottle Name <span className="text-danger">*</span></th>
                  <th className="small text-muted" style={{width: '15%'}}>Item Type <span className="text-danger">*</span></th>
                  <th className="small text-muted" style={{width: '20%'}}>Configuration (e.g. 2PC, 64x1) <span className="text-danger">*</span></th>
                  <th className="small text-muted text-end" style={{width: '15%'}}>Quantity <span className="text-danger">*</span></th>
                  <th className="small text-muted text-center" style={{width: '10%'}}>Action</th>
                </tr>
              </thead>
              <tbody className="border-top-0">
                {items.map((item, index) => (
                  <tr key={index}>
                    <td className="text-center text-muted">{index + 1}</td>
                    <td>
                      <Select 
                        options={uniqueShrenoBottles.map(b => ({ value: b._id, label: b.bottleName }))}
                        value={uniqueShrenoBottles.map(b => ({ value: b._id, label: b.bottleName })).find(opt => opt.value === item.bottleName) || null}
                        onChange={(selected) => handleItemChange(index, 'bottleName', selected?.value || '')}
                        placeholder="Select Bottle"
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: base => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)', minHeight: '38px' })
                        }}
                      />
                    </td>
                    <td>
                      <select className="form-select shadow-none" style={{ borderRadius: 8, backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' }} value={item.itemType} onChange={(e) => handleItemChange(index, 'itemType', e.target.value)} required>
                        <option value="">Select Type</option>
                        {itemTypes?.map(it => (
                          <option key={it._id} value={it._id}>{it.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="text" className="form-control shadow-none" style={{ borderRadius: 8 }} placeholder="e.g. 2PC, 64x1" value={item.configuration} onChange={(e) => handleItemChange(index, 'configuration', e.target.value)} required />
                    </td>
                    <td>
                      <input type="number" min="0" step="0.01" className="form-control text-end shadow-none" style={{ borderRadius: 8 }} value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} required />
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                      >
                        <i className="bi bi-trash fs-6"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-between">
            <button type="button" className="btn btn-sm btn-outline-primary fw-600 rounded-pill px-3 mb-4" onClick={addItem}>
              <i className="bi bi-plus-lg me-1"></i> Add Another Item
            </button>
            
            <button type="button" className="btn btn-sm btn-outline-secondary fw-600 rounded-pill px-3 mb-4" onClick={() => document.getElementById('manual-upload-more').click()}>
              <i className="bi bi-magic me-1"></i> Scan Another Document
            </button>
            <input 
              type="file" 
              id="manual-upload-more"
              multiple 
              hidden
              accept="image/*,.pdf" 
              onChange={(e) => {
                const files = Array.from(e.target.files);
                if (imageFiles.length + files.length > 5) {
                  Swal.fire('Error', 'You can only upload up to 5 files total.', 'error');
                  return;
                }
                handleUploadMoreParse(files);
                // Reset value so same file can be selected again if needed
                e.target.value = null;
              }} 
            />
          </div>

          <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
            <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
              <i className="bi bi-check2-circle me-2" /> {loading ? 'Saving...' : 'Save Record'}
            </button>
            <button type="button" onClick={() => navigate('/shreno-incoming')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
              Cancel
            </button>
          </div>
        </form>
      </div>
          )}
        </div>
      </div>
    </div>
  );
}
