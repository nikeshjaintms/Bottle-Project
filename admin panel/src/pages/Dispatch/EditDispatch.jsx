import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDispatchById, updateDispatch, clearCurrentDispatch } from '../../redux/slices/dispatchSlice';
import Swal from 'sweetalert2';

export default function EditDispatch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { currentDispatch, loading } = useSelector(state => state.dispatch);

  const [formData, setFormData] = useState({
    dispatchDate: '',
    gatePassNo: '',
    remarks: ''
  });

  const [items, setItems] = useState([]);

  useEffect(() => {
    if (id) {
      dispatch(fetchDispatchById(id));
    }
    return () => dispatch(clearCurrentDispatch());
  }, [dispatch, id]);

  useEffect(() => {
    if (currentDispatch?.dispatch) {
      setFormData({
        dispatchDate: currentDispatch.dispatch.dispatchDate ? currentDispatch.dispatch.dispatchDate.split('T')[0] : '',
        gatePassNo: currentDispatch.dispatch.gatePassNo || '',
        remarks: currentDispatch.dispatch.remarks || ''
      });
    }
    
    if (currentDispatch?.items) {
      setItems(currentDispatch.items.map(item => ({
        productName: item.productName || '',
        printing: item.printing || '',
        foil: item.foil || '',
        organic: item.organic || '',
        box: item.box || 0,
        additionalBox: item.additionalBox || 0,
        qty: item.qty || 0,
        total: item.total || 0,
        remarks: item.remarks || ''
      })));
    }
  }, [currentDispatch]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addItemRow = () => {
    setItems([...items, {
      productName: '',
      printing: '',
      foil: '',
      organic: '',
      box: '',
      additionalBox: '',
      qty: '',
      total: 0,
      remarks: ''
    }]);
  };

  const removeItemRow = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    
    if (field === 'box' || field === 'qty' || field === 'additionalBox') {
      const box = Number(newItems[index].box) || 0;
      const qty = Number(newItems[index].qty) || 0;
      newItems[index].total = box * qty;
    }

    setItems(newItems);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.dispatchDate || !formData.gatePassNo) {
      return Swal.fire('Error', 'Please fill required fields (Dispatch Date, G. Pass No.)', 'error');
    }
    
    const validItems = items.filter(i => i.productName && i.box && i.qty);
    if (validItems.length === 0) {
      return Swal.fire('Error', 'Please add at least one complete item (Product Name, Box, Qty)', 'error');
    }

    const payload = {
      dispatchDate: formData.dispatchDate,
      gatePassNo: formData.gatePassNo,
      remarks: formData.remarks,
      items: validItems.map(item => ({
        ...item,
        box: Number(item.box),
        additionalBox: Number(item.additionalBox) || 0,
        qty: Number(item.qty),
        total: Number(item.box) * Number(item.qty)
      }))
    };

    dispatch(updateDispatch({ id, data: payload })).then(res => {
      if (!res.error) {
        Swal.fire('Success', 'Dispatch updated successfully!', 'success');
        navigate('/dispatch');
      } else {
        Swal.fire('Error', res.payload || 'Failed to update', 'error');
      }
    });
  };

  if (loading) {
    return (
      <div className="p-5 text-center text-muted">
        <div className="spinner-border text-primary mb-3" />
        <div>Loading Dispatch...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header mb-4">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost border-0" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
          </button>
          <div>
            <h1 className="page-title mb-0">Edit Dispatch</h1>
            <p className="page-subtitle mb-0">Update dispatch transaction</p>
          </div>
        </div>
      </div>

      <div className="dash-card border-0 shadow-sm p-4">
        <form onSubmit={handleSubmit}>
          <div className="row g-4 mb-4">
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">Dispatch Date <span className="text-danger">*</span></label>
              <input
                type="date"
                name="dispatchDate"
                value={formData.dispatchDate}
                onChange={handleInputChange}
                className="form-control shadow-none border-light-subtle bg-light"
                required
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">G. Pass No. <span className="text-danger">*</span></label>
              <input
                type="text"
                name="gatePassNo"
                value={formData.gatePassNo}
                onChange={handleInputChange}
                className="form-control shadow-none border-light-subtle bg-light"
                required
                placeholder="Enter G. Pass No"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">Remarks</label>
              <input
                type="text"
                name="remarks"
                value={formData.remarks}
                onChange={handleInputChange}
                className="form-control shadow-none border-light-subtle bg-light"
                placeholder="Optional remarks"
              />
            </div>
          </div>

          <div className="table-responsive border rounded-3 mb-4">
            <table className="table table-borderless table-hover mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="py-3 px-4 text-muted small fw-bold">Product Name <span className="text-danger">*</span></th>
                  <th className="py-3 px-3 text-muted small fw-bold">Printing</th>
                  <th className="py-3 px-3 text-muted small fw-bold">Foil</th>
                  <th className="py-3 px-3 text-muted small fw-bold">Organic</th>
                  <th className="py-3 px-3 text-muted small fw-bold">Box <span className="text-danger">*</span></th>
                  <th className="py-3 px-3 text-muted small fw-bold" style={{ width: 100 }}>Extra Box</th>
                  <th className="py-3 px-3 text-muted small fw-bold" style={{ width: 100 }}>Qty <span className="text-danger">*</span></th>
                  <th className="py-3 px-3 text-muted small fw-bold" style={{ width: 100 }}>Total</th>
                  <th className="py-3 px-3 text-muted small fw-bold">Remarks</th>
                  <th className="py-3 px-4 text-end"></th>
                </tr>
              </thead>
              <tbody className="border-top-0">
                {items.map((item, index) => (
                  <tr key={index} className="align-middle">
                    <td className="ps-4">
                      <input
                        type="text"
                        value={item.productName}
                        onChange={(e) => handleItemChange(index, 'productName', e.target.value)}
                        className="form-control form-control-sm shadow-none"
                        required
                        placeholder="Product name"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={item.printing}
                        onChange={(e) => handleItemChange(index, 'printing', e.target.value)}
                        className="form-control form-control-sm shadow-none"
                        placeholder="Printing"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={item.foil}
                        onChange={(e) => handleItemChange(index, 'foil', e.target.value)}
                        className="form-control form-control-sm shadow-none"
                        placeholder="Foil"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={item.organic}
                        onChange={(e) => handleItemChange(index, 'organic', e.target.value)}
                        className="form-control form-control-sm shadow-none"
                        placeholder="Organic"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={item.box}
                        onChange={(e) => handleItemChange(index, 'box', e.target.value)}
                        className="form-control form-control-sm shadow-none text-end"
                        required
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={item.additionalBox}
                        onChange={(e) => handleItemChange(index, 'additionalBox', e.target.value)}
                        className="form-control form-control-sm shadow-none text-end"
                        placeholder="(+X)"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                        className="form-control form-control-sm shadow-none text-end"
                        required
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={item.total}
                        readOnly
                        className="form-control form-control-sm shadow-none text-end bg-light"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={item.remarks}
                        onChange={(e) => handleItemChange(index, 'remarks', e.target.value)}
                        className="form-control form-control-sm shadow-none"
                        placeholder="Remarks"
                      />
                    </td>
                    <td className="pe-4 text-end">
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-light text-danger shadow-none"
                          onClick={() => removeItemRow(index)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="p-3 border-top bg-light text-center">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={addItemRow}
              >
                <i className="bi bi-plus-circle me-1" /> Add Item
              </button>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => navigate('/dispatch')}
              className="btn btn-light"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary px-4"
            >
              Update Dispatch
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
