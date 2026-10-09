import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';
import Select from 'react-select';
import { useSelector, useDispatch } from 'react-redux';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchItemTypes } from '../../redux/slices/itemTypeSlice';
import { parseShrenoChallan } from '../../redux/slices/visionSlice';

export default function EditShrenoIncoming() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { bottleSpecs } = useSelector(state => state.bottleSpecs);
  const { itemTypes } = useSelector(state => state.itemTypes);
  const { companies } = useSelector(state => state.companies);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    challanNo: '',
    poNo: '',
    poDate: '',
    vehicleNo: '',
  });

  const [items, setItems] = useState([
    { bottleName: '', itemType: '', configuration: '', uom: 'NO', quantity: '' }
  ]);
  const [imageFiles, setImageFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: "false" }));
    dispatch(fetchBottleSpecs({ pagination: "false", type: "all" }));
    dispatch(fetchItemTypes({ page: 1, limit: 1000 }));
    
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
            setItems(record.items.map(item => ({
              bottleName: item.bottleName?._id || item.bottleName || '',
              itemType: item.itemType?._id || item.itemType || '',
              configuration: item.configuration || '',
              quantity: item.quantity || ''
            })));
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    
    fetchRecord();
  }, [dispatch, id]);

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
        
        let bestMatch = null;
        if (parsedName) {
          const lowerParsed = parsedName.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const spec of uniqueShrenoBottles) {
            const lowerSpec = spec.bottleName.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (lowerSpec === lowerParsed || lowerSpec.includes(lowerParsed) || lowerParsed.includes(lowerSpec)) {
              bestMatch = spec._id;
              break;
            }
          }
        }

        return {
          bottleName: bestMatch || '',
          itemType: '',
          configuration: '',
          uom: 'NO',
          quantity: item.qty || item.totalQty || ''
        };
      });

      if (res.unmatchedItems && res.unmatchedItems.length > 0) {
        res.unmatchedItems.forEach(u => {
          newItemsToAppend.push({
            bottleName: '',
            itemType: '',
            configuration: '',
            uom: 'NO',
            quantity: u.qty || u.totalQty || ''
          });
        });
      }

      setItems(prev => {
        const newItems = [...prev];
        if (newItems.length === 1 && !newItems[0].bottleName && !newItems[0].quantity) {
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
      if (imageFiles && imageFiles.length > 0) {
        imageFiles.forEach(file => data.append('images', file));
      }

      const res = await api.put(`/shreno-incoming/${id}`, data);
      if (res.data.success) {
        Swal.fire('Success', 'Shreno incoming updated successfully', 'success');
        navigate('/shreno-incoming');
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Server error', 'error');
    } finally {
      setLoading(false);
    }
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
