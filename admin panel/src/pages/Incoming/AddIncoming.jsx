import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { createIncoming } from '../../redux/slices/incomingSlice';
import { parseChallan } from '../../redux/slices/visionSlice';
import { PO_REQUIRED_COMPANY } from '../../config/incomingConfig';
import Swal from 'sweetalert2';
import Select from 'react-select';

// Filter out OCR noise and document metadata from unmatched items
const filterNoiseItems = (items) => {
  if (!items || items.length === 0) return [];
  
  return items.filter(item => {
    const text = (item.suggestedName || '').trim().toUpperCase();
    
    // Skip items that are too long (likely invoice headers/metadata)
    if (text.length > 100) return false;
    
    // Skip items with common invoice/document keywords
    const noisePatterns = [
      /GSTN|GST|INVOICE|CHALLAN|DATE|PO\s*-|BILL|ADDRESS|PHONE|EMAIL|TAX|SECTION|ACT/,
      /LIMITED|PVT|COMPANY|DELIVERY|TRANSPORT|SIGNATURE|AUTHORIZED|DUPLICATE|TRANSPORTER/i
    ];
    
    if (noisePatterns.some(pattern => pattern.test(text))) return false;
    
    // Skip if it's mostly numbers and special characters
    const alphanumericRatio = (text.match(/[A-Z0-9]/g) || []).length / text.length;
    if (alphanumericRatio < 0.5) return false;
    
    // Skip very short entries (likely noise)
    if (text.length < 3) return false;
    
    return true;
  });
};

export default function AddIncoming() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { companies } = useSelector(state => state.companies);
  const { items: bottlePerBoxes } = useSelector(state => state.bottlePerBox);
  const { bottleSpecs } = useSelector(state => state.bottleSpecs);
  const { loading: visionLoading } = useSelector(state => state.vision);

  const [formData, setFormData] = useState({
    documentDate: new Date().toISOString().split('T')[0],
    deliveryNumber: '',
    billToId: '',
    poDate: '',
    poNo: '',
    poOrderQty: ''
  });

  const [imageFiles, setImageFiles] = useState([]);
  const [scannedImageFiles, setScannedImageFiles] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [cameraSource, setCameraSource] = useState(null);
  const [mode, setMode] = useState('manual');

  const [items, setItems] = useState([{
    bottleId: '',
    box: '',
    qty: '',
    totalQty: 0
  }]);

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: "false" }));
    dispatch(fetchBottlePerBoxes({ pagination: "false" }));
    dispatch(fetchBottleSpecs({ pagination: "false", type: "all" }));
  }, [dispatch]);

  const isPoRequired = useMemo(() => {
    if (!formData.billToId || !companies) return false;
    // Primary ID check
    if (formData.billToId === PO_REQUIRED_COMPANY.id) return true;
    
    // Fallback name check (if ID somehow changed but name is same)
    const selectedCompany = companies.find(c => c._id === formData.billToId);
    if (selectedCompany && selectedCompany.name.trim().toLowerCase() === PO_REQUIRED_COMPANY.name.trim().toLowerCase()) {
      return true;
    }
    return false;
  }, [formData.billToId, companies]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addItemRow = () => {
    setItems([...items, { bottleId: '', box: '', qty: '', totalQty: 0 }]);
  };

  const removeItemRow = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    // Auto-populate qty when bottleId changes
    if (field === 'bottleId' && value) {
      const foundBox = bottlePerBoxes?.find(b => b._id === value);
      if (foundBox && foundBox.bottlePerBox != null && foundBox.bottlePerBox > 0) {
        newItems[index].qty = foundBox.bottlePerBox;
      } else {
        newItems[index].qty = '';
      }
    }
    
    if (field === 'box' || field === 'qty' || field === 'bottleId') {
      const boxes = newItems[index].box === '' ? 0 : Number(newItems[index].box);
      const qty = newItems[index].qty === '' ? 0 : Number(newItems[index].qty);
      if (boxes > 0 && qty > 0) {
        newItems[index].totalQty = parseFloat((boxes * qty).toFixed(2));
      } else {
        newItems[index].totalQty = '';
      }
    } else if (field === 'totalQty') {
      const total = Number(value) || 0;
      const qty = Number(newItems[index].qty) || 0;
      if (qty > 0 && total > 0) {
        newItems[index].box = parseFloat((total / qty).toFixed(2));
      } else if (total === 0) {
        newItems[index].box = '';
      }
    }

    setItems(newItems);
  };



  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.billToId || !formData.documentDate) {
      return Swal.fire('Error', 'Please fill required fields (Date, Bill To)', 'error');
    }

    if (isPoRequired) {
      if (!formData.poDate || !formData.poNo) {
        return Swal.fire('Error', 'PO Date and PO No are mandatory for the selected company.', 'error');
      }
    }
    
    const validItems = items.filter(i => i.bottleId && i.qty > 0);
    if (validItems.length === 0) {
      return Swal.fire('Error', 'Please add at least one valid item with quantity > 0', 'error');
    }
    
    const bottleNames = validItems.map(i => i.bottleId).filter(Boolean);
    const uniqueBottles = new Set(bottleNames);
    if (uniqueBottles.size !== bottleNames.length) {
      return Swal.fire('Error', 'Duplicate bottles found! You cannot add the same bottle multiple times in a single challan.', 'error');
    }

    const payload = new FormData();
    payload.append('date', formData.documentDate);
    payload.append('deliveryNumber', formData.deliveryNumber);
    payload.append('billToId', formData.billToId);
    
    // Conditionally append PO fields if required and present
    if (isPoRequired) {
      if (formData.poDate) payload.append('poDate', formData.poDate);
      if (formData.poNo) payload.append('poNo', formData.poNo);
      if (formData.poOrderQty) payload.append('poOrderQty', formData.poOrderQty);
    }

    payload.append('items', JSON.stringify(validItems));
    
    if (imageFiles && imageFiles.length > 0) {
      imageFiles.forEach(file => payload.append('images', file));
    }
    if (imageFile) {
      payload.append('images', imageFile);
    }

    dispatch(createIncoming(payload)).then(res => {
      if (!res.error) {
        Swal.fire('Success', 'Incoming recorded and stock updated successfully!', 'success');
        navigate(-1);
      } else {
        Swal.fire('Error', res.payload || 'Failed to save', 'error');
      }
    });
  };

  const handleUploadMoreParse = async (files) => {
    if (!files || files.length === 0) return;
    setImageFiles(prev => [...prev, ...files]);
    Swal.fire({
      title: 'Parsing document...',
      text: 'Extracting invoice data...',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });
    try {
      const res = await dispatch(parseChallan(files)).unwrap();
      const matchIsShreno = formData.billToId === PO_REQUIRED_COMPANY.id || companies?.find(c => c._id === formData.billToId)?.name?.toLowerCase().includes('shreno');

      const itemsToSet = (res.items || []).map(item => {
        let defaultQty = 1;
        const foundBox = bottlePerBoxes?.find(b => b._id === (item.bottleId?._id || item.bottleId));
        if (foundBox && foundBox.bottlePerBox != null && foundBox.bottlePerBox > 0) {
          defaultQty = foundBox.bottlePerBox;
        }
        
        let defaultBox = '';
        let defaultTotalQty = '';

        if (matchIsShreno) {
          defaultBox = item.totalQty || item.box || '';
          if (defaultBox && defaultQty > 0) {
            defaultTotalQty = parseFloat((Number(defaultBox) * Number(defaultQty)).toFixed(2));
          }
        } else {
          defaultTotalQty = item.totalQty || '';
          defaultBox = item.box || '';

          if (defaultTotalQty && defaultQty > 0 && !defaultBox) {
            defaultBox = parseFloat((Number(defaultTotalQty) / Number(defaultQty)).toFixed(2));
          } else if (defaultBox && defaultQty > 0 && !defaultTotalQty) {
            defaultTotalQty = parseFloat((Number(defaultBox) * Number(defaultQty)).toFixed(2));
          }
        }
        
        return { bottleId: item.bottleId?._id || item.bottleId || '', box: defaultBox, qty: defaultQty, totalQty: defaultTotalQty };
      });
      // DO NOT add unmatched items - only show warning, user must add manually
      setItems(prevItems => {
        const newItems = [...prevItems];
        if (newItems.length === 1 && !newItems[0].bottleId && !newItems[0].qty) {
          return itemsToSet.length > 0 ? itemsToSet : newItems;
        }
        return [...newItems, ...itemsToSet];
      });
      Swal.fire({ icon: 'success', title: 'Invoice Parsed', text: 'Appended ' + itemsToSet.length + ' items from new document.' });
    } catch (err) {
      Swal.fire('Error', 'Failed to parse invoice: ' + err, 'error');
    }
  };

  const handleMatch = async () => {
    if (!scannedImageFiles || scannedImageFiles.length === 0) {
      Swal.fire('Error', 'Please upload a delivery note/invoice first.', 'error');
      return;
    }
    setImageFiles(scannedImageFiles);
    try {
      const res = await dispatch(parseChallan(scannedImageFiles)).unwrap();
      setFormData(prev => ({ 
        ...prev, 
        deliveryNumber: res.deliveryNumber || '',
        documentDate: res.documentDate || prev.documentDate,
        billToId: res.billToId || '',
        poNo: res.poNo || '',
        poDate: res.poDate || ''
      }));

      const matchIsShreno = res.billToId === PO_REQUIRED_COMPANY.id || companies?.find(c => c._id === res.billToId)?.name?.toLowerCase().includes('shreno');

      const itemsToSet = (res.items || []).map(item => {
        let defaultQty = 1;
        const foundBox = bottlePerBoxes?.find(b => b._id === (item.bottleId?._id || item.bottleId));
        if (foundBox && foundBox.bottlePerBox != null && foundBox.bottlePerBox > 0) {
          defaultQty = foundBox.bottlePerBox;
        }

        let defaultBox = '';
        let defaultTotalQty = '';

        if (matchIsShreno) {
          defaultBox = item.totalQty || item.box || '';
          if (defaultBox && defaultQty > 0) {
            defaultTotalQty = parseFloat((Number(defaultBox) * Number(defaultQty)).toFixed(2));
          }
        } else {
          defaultTotalQty = item.totalQty || '';
          defaultBox = item.box || '';

          if (defaultTotalQty && defaultQty > 0 && !defaultBox) {
            defaultBox = parseFloat((Number(defaultTotalQty) / Number(defaultQty)).toFixed(2));
          } else if (defaultBox && defaultQty > 0 && !defaultTotalQty) {
            defaultTotalQty = parseFloat((Number(defaultBox) * Number(defaultQty)).toFixed(2));
          }
        }

        return {
          bottleId: item.bottleId?._id || item.bottleId || '',
          box: defaultBox,
          qty: defaultQty,
          totalQty: defaultTotalQty
        };
      });

      // Filter out obvious OCR noise and document metadata from unmatched items
      const filteredUnmatchedItems = filterNoiseItems(res.unmatchedItems);

      // DO NOT add unmatched items - only show warning for user reference
      // User must manually add missing bottles to the table

      let warningText = '';
      if (filteredUnmatchedItems && filteredUnmatchedItems.length > 0) {
        const unmatchedNames = filteredUnmatchedItems.map(i => i.suggestedName).join(', ');
        warningText = `<br/><br/><b style='color:#e63946;'>Warning:</b> Found ${filteredUnmatchedItems.length} item(s) on the invoice that do not match any bottle in the database: ${unmatchedNames}.`;
      }

      if (itemsToSet.length > 0) {
        setItems(itemsToSet);
        
        // Only set poOrderQty if it was explicitly found in the document, otherwise leave blank
        setFormData(prev => ({ ...prev, poOrderQty: res.poOrderQty != null ? String(res.poOrderQty) : '' }));

        let missingFields = [];
        if (!res.deliveryNumber) missingFields.push('Challan/Delivery No');
        if (!res.billToName && !res.billToId) missingFields.push('Bill To');
        const anyMissingBottle = itemsToSet.some(i => !i.bottleId);
        if (anyMissingBottle) missingFields.push('Bottle Name');
        const anyMissingTotalQty = itemsToSet.some(i => !i.totalQty);
        if (anyMissingTotalQty) missingFields.push('Total Qty');
        
        if (missingFields.length > 0) {
           warningText += `<br/><br/><b style='color:#e63946;'>Missing detected fields:</b> ${missingFields.join(', ')}. Please fill them manually.`;
        }

        Swal.fire({
          icon: (res.unmatchedItems && res.unmatchedItems.length > 0) || missingFields.length > 0 ? 'warning' : 'success',
          title: (res.unmatchedItems && res.unmatchedItems.length > 0) || missingFields.length > 0 ? 'Partial Match / Missing Fields' : 'Invoice Parsed',
          html: `Found Delivery No: <b>${res.deliveryNumber || 'N/A'}</b>, Bill To: <b>${res.billToName || 'N/A'}</b>.<br/>Matched ${res.items?.length || 0} items! ${warningText}`,
          showConfirmButton: true
        });
        setMode('manual');
      } else {
        Swal.fire('Warning', 'No matching bottle names could be detected from this invoice. Please enter them manually.', 'warning').then(() => setMode('manual'));
      }
    } catch (error) {
      Swal.fire('Error', error || 'Failed to parse invoice', 'error');
    }
  };

  const grandTotal = items.reduce((acc, curr) => acc + (Number(curr.totalQty) || 0), 0);

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between user-form-page-header">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left fs-5 text-secondary" />
          </button>
          <div>
            <h1 className="page-title">New Incoming Entry</h1>
            <p className="page-subtitle">Record bottles received against delivery note</p>
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
                        if ((scannedImageFiles?.length || 0) + files.length > 5) {
                          import('sweetalert2').then(Swal => Swal.default.fire('Error', 'You can only upload up to 5 files.', 'error'));
                          return;
                        }
                        if (files.length > 0) {
                          setScannedImageFiles(prev => [...(prev || []), ...files]);
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
                        <><i className="bi bi-magic" /> Scan Invoice</>
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
            <div className="dash-card border-0 shadow-sm p-4">
        <form onSubmit={handleSubmit}>
          {/* Header Details */}
          
          {isPoRequired && (
            <div className="row g-4 mb-4 pb-4 border-bottom border-warning border-opacity-50" style={{ backgroundColor: '#fffdf5', padding: '15px', borderRadius: '10px' }}>
              <div className="col-12 mb-2">
                <h6 className="fw-bold text-warning mb-0"><i className="bi bi-file-earmark-text me-2"></i>Purchase Order Details (Required for Shreno)</h6>
              </div>
              <div className="col-md-4">
                <label className="form-label fw-bold small text-muted">PO Date <span className="text-danger">*</span></label>
                <input type="date" className="form-control shadow-none" name="poDate" value={formData.poDate} onChange={handleInputChange} style={{ borderRadius: 10 }} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-bold small text-muted">PO No <span className="text-danger">*</span></label>
                <input type="text" className="form-control shadow-none" name="poNo" value={formData.poNo} onChange={handleInputChange} placeholder="Enter PO Number" style={{ borderRadius: 10 }} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-bold small text-muted">PO Order Qty</label>
                <input type="number" className="form-control shadow-none" name="poOrderQty" value={formData.poOrderQty} onChange={handleInputChange} placeholder="Enter Total Qty" style={{ borderRadius: 10 }} />
              </div>
            </div>
          )}

          <div className="row g-4 mb-4">
            <div className="col-md-3">
              <label className="form-label fw-bold small">Date *</label>
              <input type="date" className="form-control shadow-none" name="documentDate" value={formData.documentDate} onChange={handleInputChange} style={{ borderRadius: 10 }} />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold small">Challan / Delivery No</label>
              <input type="text" className="form-control shadow-none" name="deliveryNumber" value={formData.deliveryNumber} onChange={handleInputChange} placeholder="Enter delivery no." style={{ borderRadius: 10 }} />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold small">Bill To *</label>
              <Select 
                options={companies?.map(c => ({ value: c._id, label: c.name }))}
                value={companies?.map(c => ({ value: c._id, label: c.name })).find(opt => opt.value === formData.billToId) || null}
                onChange={(selected) => handleInputChange({ target: { name: 'billToId', value: selected?.value || '' } })}
                placeholder="Select Company"
                isClearable
                styles={{
                  control: (base) => ({ ...base, borderRadius: '8px', minHeight: '38px', borderColor: 'var(--bs-border-color)' })
                }}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold small">Upload Image</label>
              <div className="d-flex align-items-end gap-2">
                {imageFile && (
                  <div className="position-relative shadow-sm rounded-3 overflow-hidden border border-light-subtle" style={{ width: '60px', height: '60px', flexShrink: 0 }}>
                    {imageFile.type?.startsWith('image/') ? (
                      <img src={URL.createObjectURL(imageFile)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="d-flex flex-column align-items-center justify-content-center h-100 bg-light">
                        <i className="bi bi-file-earmark-pdf text-danger" style={{ fontSize: 24 }}></i>
                      </div>
                    )}
                    <button 
                      type="button" 
                      className="btn btn-sm btn-danger rounded-circle position-absolute p-0 d-flex align-items-center justify-content-center shadow" 
                      style={{ width: 18, height: 18, top: 4, right: 4 }}
                      onClick={() => {
                        setImageFile(null);
                        document.getElementById('manualImageInput').value = '';
                      }}
                    >
                      <i className="bi bi-x" style={{ fontSize: 14 }} />
                    </button>
                  </div>
                )}
                <div className="flex-grow-1">
                  <input 
                    id="manualImageInput"
                    type="file" 
                    className="form-control shadow-none" 
                    accept="image/*,application/pdf" 
                    onChange={(e) => setImageFile(e.target.files[0])} 
                    style={{ borderRadius: 10, padding: '0.375rem 0.75rem' }} 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2 mt-4">
            <h6 className="fw-bold text-primary mb-0">BOTTLE ENTRIES</h6>
          </div>

          <div className="table-responsive mb-3">
            <table className="table table-bordered align-middle">
              <thead className="table-light">
                <tr>
                  <th className="small text-muted text-center" style={{width: '5%', minWidth: '50px'}}>Sr.</th>
                  <th className="small text-muted" style={{ width: '40%' }}>Bottle Name <span className="text-danger">*</span></th>
                  <th className="small text-muted text-center" style={{ width: '15%' }}>No of boxes</th>
                  <th className="small text-muted text-center" style={{ width: '15%' }}>Qty/Box <span className="text-danger">*</span></th>
                  <th className="small text-muted text-end" style={{ width: '15%' }}>Total Qty</th>
                  <th className="small text-muted text-center" style={{ width: '10%' }}>Action</th>
                </tr>
              </thead>
              <tbody className="border-top-0">
                {items.map((item, index) => (
                  <tr key={index}>
                    <td className="text-center text-muted">{index + 1}</td>
                    <td>
                      <Select 
                        options={bottlePerBoxes?.filter(box => {
                          if (!formData.billToId) return true;
                          const isAssociatedWithCompany = bottleSpecs?.some(spec => 
                            spec.bottleName === box.bottleName && 
                            (spec.brandId?.companyId?._id === formData.billToId || spec.brandId?.companyId === formData.billToId)
                          );
                          const hasNoSpecs = !bottleSpecs?.some(spec => spec.bottleName === box.bottleName);
                          return isAssociatedWithCompany || hasNoSpecs;
                        }).map(b => ({ value: b._id, label: b.bottleName }))}
                        value={bottlePerBoxes?.map(b => ({ value: b._id, label: b.bottleName })).find(opt => opt.value === item.bottleId) || null}
                        onChange={(selected) => handleItemChange(index, 'bottleId', selected?.value || '')}
                        placeholder="Select Bottle"
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: base => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' })
                        }}
                      />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm shadow-none text-center" placeholder="1" value={item.box} onChange={(e) => handleItemChange(index, 'box', e.target.value)} min="1" />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm shadow-none text-center" placeholder="1" value={item.qty} onChange={(e) => handleItemChange(index, 'qty', e.target.value)} min="1" />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control text-end shadow-none"
                        value={item.totalQty === 0 ? '' : item.totalQty}
                        onChange={(e) => handleItemChange(index, 'totalQty', e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-sm btn-light text-danger rounded-circle shadow-sm"
                        onClick={() => removeItemRow(index)}
                        disabled={items.length === 1}
                        style={{ width: 32, height: 32 }}
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="d-flex justify-content-between mb-4">
            <div className="d-flex gap-3">
              <button type="button" className="btn btn-sm btn-outline-primary fw-600 rounded-pill px-3 mb-0" onClick={addItemRow}>
                <i className="bi bi-plus-lg me-1"></i> Add Row
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
          </div>
            
          <div className="card bg-light border-0 mb-4">
            <div className="card-body px-4 py-3">
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-1 pt-1">
                <span className="fw-bold fs-5 mb-1 mb-sm-0">Total Incoming Quantity:</span>
                <span className="fw-bold fs-4 text-primary">{grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

            <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
              <button type="submit" className="btn-accent px-5 py-3 flex-grow-1">
                <i className="bi bi-check2-circle me-2" /> Add Stock
              </button>
              <button type="button" onClick={() => navigate('/incoming')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
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
