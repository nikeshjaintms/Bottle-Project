import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { createLacquerPlan } from '../../redux/slices/lacquerPlanSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchPrintingTypes } from '../../redux/slices/printingTypeSlice';
import { fetchPrintingColors } from '../../redux/slices/printingColorSlice';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import API from '../../services/api';
import Swal from 'sweetalert2';
import { useLacquerPlanLanguage } from '../../hooks/useLacquerPlanLanguage';

export default function AddLacquerPlan() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);
  const { brands } = useSelector((state) => state.brands);
  const { variants } = useSelector((state) => state.variants);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);
  const { companies } = useSelector((state) => state.companies);
  const { items: printingTypes = [] } = useSelector((state) => state.printingType || {});
  const { items: printingColors = [] } = useSelector((state) => state.printingColor || {});
  const { loading, error } = useSelector((state) => state.lacquerPlans);
  const { labels, language, toggleLanguage } = useLacquerPlanLanguage();

  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState([
    {
      companyId: '',
      brandId: '',
      bottleName: '',
      variantId: [],
      colour: '',
      process: 'C',
      plainStock: 0,
      boxQty: '',
      orderQty: '',
      coatedQty: 0,
      balanceToMake: 0,
      dispatchBalance: 0,
      soldQty: 0,
      noOfBoxes: '',
      remarks: ''
    }
  ]);

  const [showMissingSpecModal, setShowMissingSpecModal] = useState(false);
  const [missingSpecData, setMissingSpecData] = useState({
     bottleName: '', brandId: '', companyName: '', brandName: '', bottlePerBox: '', code: '', printingTypeId: '', printingColorId: '', rowIndex: null
  });
  const [creatingSpec, setCreatingSpec] = useState(false);

  // Stock warning states
  const [stockWarnings, setStockWarnings] = useState({});
  const [acknowledgeStockWarning, setAcknowledgeStockWarning] = useState({});

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ limit: 1000, status: true }));
    dispatch(fetchBottleSpecs({ limit: 1000, status: true, type: 'all' }));
    dispatch(fetchBrands({ limit: 1000, status: true }));
    dispatch(fetchVariants({ limit: 1000, status: true }));
    dispatch(fetchCompanies({ limit: 1000, status: true }));
    dispatch(fetchPrintingTypes({ limit: 1000, status: true }));
    dispatch(fetchPrintingColors({ limit: 1000, status: true }));
  }, [dispatch]);

  useEffect(() => {
    if (location.state?.savedRows) {
      const { savedRows, rowIndex, companyId: sCompanyId, brandId: sBrandId, planDate: sPlanDate } = location.state;
      const { newVariantId, coatingShade } = location.state;
      
      if (savedRows && newVariantId && rowIndex !== undefined) {
         const updatedRows = [...savedRows];
         updatedRows[rowIndex].variantId = Array.isArray(updatedRows[rowIndex].variantId) 
             ? [...updatedRows[rowIndex].variantId, newVariantId] 
             : [newVariantId];
         if (coatingShade) {
             updatedRows[rowIndex].colour = coatingShade;
         }
         setRows(updatedRows);
         if (sCompanyId && typeof setCompanyId === 'function') {
           // No-op or handle appropriately if we need to set global. 
           // In this block-based design, companyId is handled per row.
         }
         if (sPlanDate) setPlanDate(sPlanDate);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const addEntryRow = (groupId) => {
    const groupRows = rows.filter(r => r.sharedGroupId === groupId || r.sharedGroupId === undefined);
    const lastRow = groupRows.length > 0 ? groupRows[groupRows.length - 1] : null;
    const lastIndex = rows.findLastIndex(r => r.sharedGroupId === groupId || r.sharedGroupId === undefined);
    
    const newRow = {
      sharedGroupId: groupId,
      companyId: lastRow ? lastRow.companyId : '',
      brandId: lastRow ? lastRow.brandId : '',
      bottleName: lastRow ? lastRow.bottleName : '',
      process: lastRow ? lastRow.process : 'C',
      plainStock: lastRow ? lastRow.plainStock : 0,
      boxQty: lastRow ? lastRow.boxQty : '',
      variantId: [], colour: '', orderQty: '', coatedQty: 0,
      balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', remarks: ''
    };
    
    const newRows = [...rows];
    newRows.splice(lastIndex !== -1 ? lastIndex + 1 : rows.length, 0, newRow);
    setRows(newRows);
  };

  const addNewSection = () => {
    setRows([...rows, {
      sharedGroupId: Date.now().toString(),
      companyId: '', brandId: '',
      bottleName: '', variantId: [], colour: '', process: 'C',
      plainStock: 0, boxQty: '', orderQty: '', coatedQty: 0,
      balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', remarks: ''
    }]);
  };

  const removeSection = (groupId) => {
    const newRows = rows.filter(r => r.sharedGroupId !== groupId && r.sharedGroupId !== undefined);
    if (newRows.length === 0) {
      setRows([{
        sharedGroupId: Date.now().toString(),
        bottleName: '', variantId: [], colour: '', process: 'C',
        plainStock: 0, boxQty: '', orderQty: '', coatedQty: 0,
        balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', remarks: ''
      }]);
    } else {
      setRows(newRows);
    }
  };

  const removeRow = (index) => {
    if (rows.length > 1) {
      setRows(rows.filter((_, i) => i !== index));
    }
  };

  const handleRowChange = async (index, field, value) => {
    const newRows = [...rows];
    const currentRow = newRows[index];

    if (field === 'companyId') {
      const groupId = currentRow.sharedGroupId;
      if (groupId) {
        newRows.forEach(r => { if (r.sharedGroupId === groupId) { r.companyId = value; r.brandId = ''; r.bottleName = ''; r.variantId = []; } });
      } else {
        currentRow.companyId = value; currentRow.brandId = ''; currentRow.bottleName = ''; currentRow.variantId = [];
      }
    }
    if (field === 'brandId') {
      const groupId = currentRow.sharedGroupId;
      if (groupId) {
        newRows.forEach(r => { if (r.sharedGroupId === groupId) { r.brandId = value; r.bottleName = ''; r.variantId = []; } });
      } else {
        currentRow.brandId = value; currentRow.bottleName = ''; currentRow.variantId = [];
      }
    }

    let prevValue = currentRow[field]; // Capture BEFORE updating
    currentRow[field] = value;

    const syncAndSetRows = (rowsArray) => {
       if (currentRow.sharedGroupId) {
          rowsArray.forEach(r => {
             if (r.sharedGroupId === currentRow.sharedGroupId && r !== currentRow) {
                r.bottleName = currentRow.bottleName;
                r.process = currentRow.process;
                r.plainStock = currentRow.plainStock;
                r.boxQty = currentRow.boxQty;
             }
          });
       }
       setRows(rowsArray);
    };

    if (field === 'bottleName' && value) {
       const isExisting = (bottleSpecs || []).some(s => 
          (s.brandId?._id || s.brandId)?.toString() === currentRow.brandId.toString() &&
          s.bottleName?.trim().toLowerCase() === value.trim().toLowerCase()
       );
       
       if (!isExisting) {
          let masterBottlePerBox = '';
          try {
              const bpbRes = await API.get('/bottle-per-box', { params: { search: value } });
              if (bpbRes.data?.success && bpbRes.data.data?.length > 0) {
                  const exactMatch = bpbRes.data.data.find(b => b.bottleName?.trim().toLowerCase() === value.trim().toLowerCase());
                  if (exactMatch && exactMatch.bottlePerBox) {
                      masterBottlePerBox = exactMatch.bottlePerBox;
                  }
              }
          } catch (e) {}

          if (!masterBottlePerBox) {
              const existingBPB = (bottlePerBoxes || []).find(b => b.bottleName?.trim().toLowerCase() === value.trim().toLowerCase());
              masterBottlePerBox = existingBPB?.bottlePerBox || '';
          }

          const companyName = (companies || []).find(o => o._id === rows[rowIndex]?.companyId)?.name || '';
          const brandName = (brands || []).find(o => o._id === rows[rowIndex]?.brandId)?.name || '';
          
          setMissingSpecData({
             bottleName: value.toUpperCase(),
             brandId: currentRow.brandId,
             companyName,
             brandName,
             bottlePerBox: masterBottlePerBox,
             code: '',
             printingTypeId: '',
             printingColorId: '',
             rowIndex: index
          });
          setShowMissingSpecModal(true);
          
          currentRow.bottleName = value.toUpperCase();
          syncAndSetRows(newRows);
          return;
       }

       // MERGE LOGIC: If another row in the SAME BLOCK has this bottle name, merge their sharedGroupIds
       const blockRows = newRows.filter(r => r.companyId === currentRow.companyId && r.brandId === currentRow.brandId);
       const existingRow = blockRows.find(r => r !== currentRow && r.bottleName === value.toUpperCase());
       
       if (existingRow && existingRow.sharedGroupId) {
           const oldGroupId = currentRow.sharedGroupId;
           currentRow.sharedGroupId = existingRow.sharedGroupId;
           currentRow.process = existingRow.process;
           currentRow.plainStock = existingRow.plainStock;
           currentRow.boxQty = existingRow.boxQty;

           if (oldGroupId) {
               newRows.forEach(r => {
                   if (r.sharedGroupId === oldGroupId) {
                       r.sharedGroupId = existingRow.sharedGroupId;
                       r.process = existingRow.process;
                       r.plainStock = existingRow.plainStock;
                       r.boxQty = existingRow.boxQty;
                       r.bottleName = value.toUpperCase();
                   }
               });
           }
       }

      currentRow.variantId = [];
      currentRow.colour = '';
      
      try {
        const res = await API.get('/lacquer-plan/stats/computed', {
          params: { bottleName: value }
        });
        const selectedBottle = (bottlePerBoxes || []).find(b => b.bottleName === value);
        currentRow.plainStock = res.data?.success ? res.data.data.plainStock : 0;
        currentRow.boxQty = selectedBottle && selectedBottle.bottlePerBox ? selectedBottle.bottlePerBox : '';
      } catch (err) {
        console.error("Failed to fetch plain stock", err);
      }
    }

    if (field === 'orderQty') {
      const orderQty = parseFloat(value) || 0;
      const boxQty = parseFloat(currentRow.boxQty);
      if (!isNaN(orderQty) && !isNaN(boxQty) && boxQty > 0) {
        currentRow.noOfBoxes = Math.ceil(orderQty / boxQty);
      }
      const coatedQty = parseFloat(currentRow.coatedQty);
      currentRow.balanceToMake = (coatedQty || 0) - (orderQty || 0);
      
      // Check insufficient stock for this group
      if (currentRow.sharedGroupId && currentRow.companyId && currentRow.bottleName) {
        let plainStock = parseFloat(currentRow.plainStock) || 0;
        let totalOrderQty = 0;
        
        newRows.forEach(r => {
          if (r.sharedGroupId === currentRow.sharedGroupId && 
              r.companyId === currentRow.companyId && 
              r.bottleName?.toUpperCase() === currentRow.bottleName?.toUpperCase()) {
            const rOrderQty = r === currentRow ? orderQty : (parseFloat(r.orderQty) || 0);
            totalOrderQty += rOrderQty;
            if (plainStock === 0 || !plainStock) {
              plainStock = parseFloat(r.plainStock) || 0;
            }
          }
        });
        
        if (plainStock > 0 && totalOrderQty > plainStock) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: labels.plainStockExceedWarning,
            showConfirmButton: false,
            timer: 3000
          });
          currentRow.isExceedingStock = true;
        } else {
          currentRow.isExceedingStock = false;
        }
      }
    }

    if (field === 'coatedQty') {
      const prevCoatedQty = parseFloat(prevValue) || 0;
      const newCoatedQty = parseFloat(value) || 0;
      const delta = newCoatedQty - prevCoatedQty;
      
      currentRow.coatedQty = newCoatedQty;
      const orderQty = parseFloat(currentRow.orderQty);
      currentRow.balanceToMake = (newCoatedQty || 0) - (orderQty || 0);
      
      // Apply delta sync to all rows in the same (company, bottle) pool
      if (currentRow.sharedGroupId && currentRow.companyId && currentRow.bottleName) {
        newRows.forEach(r => {
          if (r.sharedGroupId === currentRow.sharedGroupId && 
              r.companyId === currentRow.companyId && 
              r.bottleName?.toUpperCase() === currentRow.bottleName?.toUpperCase()) {
            r.plainStock = Math.max(0, (parseFloat(r.plainStock) || 0) - delta);
          }
        });
      }
    }

    syncAndSetRows(newRows);

    if (field === 'colour' && currentRow.bottleName && currentRow.brandId) {
       try {
         const res = await API.get('/lacquer-plan/stats/computed', {
           params: {
             bottleName: currentRow.bottleName,
             brandId: currentRow.brandId,
             colour: value
           }
         });
         if (res.data?.success) {
           const updatedRows = [...newRows];
           const r = updatedRows[index];
           r.coatedQty = res.data.data.coatedQty;
           const currentOrderQty = parseFloat(r.orderQty) || 0;
           r.balanceToMake = (res.data.data.coatedQty || 0) - currentOrderQty;
           syncAndSetRows(updatedRows);
         }
       } catch (err) {
         console.error("Failed to fetch coatedQty", err);
       }
    }

    if (field === 'variantId' && value && value.length > 0) {
      if (value.length > 1) {
         currentRow.variantId = [value[0]];
         
         if (!currentRow.sharedGroupId) {
             currentRow.sharedGroupId = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
         }
         
         let firstBottleName = currentRow.bottleName;
         const firstVariant = (variants || []).find(v => v._id === value[0]);
         if (firstVariant && !firstBottleName) {
            const spec = (bottleSpecs || []).find(bs => bs._id === (firstVariant.bottleSpecId?._id || firstVariant.bottleSpecId));
            if (spec && spec.bottleName) firstBottleName = spec.bottleName.toUpperCase();
         }

         const rowsToAdd = [];
         for (let i = 1; i < value.length; i++) {
            const vid = value[i];
            const selVar = (variants || []).find(v => v._id === vid);
            
            let varBottleName = firstBottleName;
            let varPlainStock = 0;
            let varBoxQty = '';
            
            if (selVar) {
               const spec = (bottleSpecs || []).find(bs => bs._id === (selVar.bottleSpecId?._id || selVar.bottleSpecId));
               if (spec && spec.bottleName) {
                   varBottleName = spec.bottleName.toUpperCase();
                   const selectedBottle = (bottlePerBoxes || []).find(b => b.bottleName === varBottleName);
                   if (selectedBottle && selectedBottle.bottlePerBox) varBoxQty = selectedBottle.bottlePerBox;
               }
            }

            const isSameBottle = (varBottleName === firstBottleName) && varBottleName;

            const clonedRow = {
               ...currentRow,
               sharedGroupId: isSameBottle ? currentRow.sharedGroupId : ('grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
               bottleName: varBottleName || '',
               variantId: [vid],
               boxQty: isSameBottle ? currentRow.boxQty : varBoxQty,
               plainStock: isSameBottle ? currentRow.plainStock : varPlainStock,
               orderQty: '',
               noOfBoxes: '',
               coatedQty: '',
               balanceToMake: '',
               dispatchBalance: '',
               soldQty: '',
               remarks: ''
            };
            if (selVar && selVar.coatingShade) {
                clonedRow.colour = selVar.coatingShade;
                if (clonedRow.bottleName && currentRow.brandId) {
                   API.get('/lacquer-plan/stats/computed', {
                     params: { bottleName: clonedRow.bottleName, brandId: currentRow.brandId, colour: selVar.coatingShade }
                   }).then(res => {
                     if (res.data?.success) {
                       setRows(currentRows => {
                         const rArray = [...currentRows];
                         const targetRow = rArray.find(r => r.variantId && r.variantId[0] === vid && r.bottleName === clonedRow.bottleName);
                         if (targetRow) {
                           targetRow.coatedQty = res.data.data.coatedQty;
                           targetRow.plainStock = res.data.data.plainStock || targetRow.plainStock;
                           targetRow.balanceToMake = (res.data.data.coatedQty || 0) - (parseFloat(targetRow.orderQty) || 0);
                         }
                         return rArray;
                       });
                     }
                   }).catch(console.error);
                }
            }
            rowsToAdd.push(clonedRow);
         }
         
         newRows.splice(index + 1, 0, ...rowsToAdd);
         value = [value[0]];
      }

      const firstVal = value[0];
      const selectedVariant = (variants || []).find(v => v._id === firstVal);
      if (selectedVariant && !currentRow.bottleName) {
         const spec = (bottleSpecs || []).find(bs => bs._id === (selectedVariant.bottleSpecId?._id || selectedVariant.bottleSpecId));
         if (spec && spec.bottleName) {
            currentRow.bottleName = spec.bottleName.toUpperCase();
            try {
              const res = await API.get('/lacquer-plan/stats/computed', {
                params: { bottleName: currentRow.bottleName }
              });
              const selectedBottle = (bottlePerBoxes || []).find(b => b.bottleName === currentRow.bottleName);
              currentRow.plainStock = res.data?.success ? res.data.data.plainStock : 0;
              currentRow.boxQty = selectedBottle && selectedBottle.bottlePerBox ? selectedBottle.bottlePerBox : '';
              
              const orderQty = parseFloat(currentRow.orderQty);
              const boxQty = parseFloat(currentRow.boxQty);
              if (!isNaN(orderQty) && !isNaN(boxQty) && boxQty > 0) {
                currentRow.noOfBoxes = Math.ceil(orderQty / boxQty);
              }
            } catch (err) {
              console.error("Failed to fetch plain stock", err);
            }
         }
      }
      if (selectedVariant && selectedVariant.coatingShade && !currentRow.colour) {
         currentRow.colour = selectedVariant.coatingShade;
         if (currentRow.bottleName && currentRow.brandId) {
             API.get('/lacquer-plan/stats/computed', {
               params: { bottleName: currentRow.bottleName, brandId: currentRow.brandId, colour: selectedVariant.coatingShade }
             }).then(res => {
               if (res.data?.success) {
                 setRows(currentRows => {
                   const rArray = [...currentRows];
                   const targetRow = rArray[index];
                   if (targetRow) {
                     targetRow.coatedQty = res.data.data.coatedQty;
                     targetRow.balanceToMake = (res.data.data.coatedQty || 0) - (parseFloat(targetRow.orderQty) || 0);
                   }
                   return rArray;
                 });
               }
             }).catch(console.error);
         }
      }
    }

  };

  const handleSaveMissingSpec = async () => {
     if (!missingSpecData.bottleName) return;
     setCreatingSpec(true);
     try {
        await API.post('/bottle-spec', {
           brandId: missingSpecData.brandId,
           bottleName: missingSpecData.bottleName,
           code: missingSpecData.code,
           printingTypeId: missingSpecData.printingTypeId,
           printingColorId: missingSpecData.printingColorId,
           isCoating: true,
           status: true
        });
        
        if (missingSpecData.bottlePerBox) {
           await API.post('/bottle-per-box', {
              bottleName: missingSpecData.bottleName,
              bottlePerBox: missingSpecData.bottlePerBox,
              status: true
           });
        }
        
        await dispatch(fetchBottleSpecs({ limit: 1000, status: true, type: 'all' })).unwrap();
        await dispatch(fetchBottlePerBoxes({ limit: 1000, status: true })).unwrap();
        
        Swal.fire({
           icon: 'success',
           title: 'Specs Created',
           text: `"${missingSpecData.bottleName}" spec created for ${missingSpecData.brandName}!`,
           toast: true,
           position: 'top-end',
           showConfirmButton: false,
           timer: 3000
        });
        
        setShowMissingSpecModal(false);
        
        if (missingSpecData.rowIndex !== null) {
            const newRows = [...rows];
            const currentRow = newRows[missingSpecData.rowIndex];
            currentRow.bottleName = missingSpecData.bottleName.toUpperCase();
            currentRow.variantId = [];
            currentRow.colour = '';
            currentRow.plainStock = 0;
            currentRow.boxQty = missingSpecData.bottlePerBox || '';
            setRows(newRows);
        }
        
     } catch (err) {
        Swal.fire('Error', err.response?.data?.message || err.message || 'Failed to create specs', 'error');
     } finally {
        setCreatingSpec(false);
     }
  };

  const handleAddVariantClick = (bottleName, brandId, rowIndex, colour) => {
      let existingSpec = companySpecs.find(bs => bs.bottleName === bottleName);
      
      let specId = existingSpec ? existingSpec._id : null;
      
      if (!existingSpec) {
          return Swal.fire('Error', 'Please save the bottle spec first.', 'error');
      }

      navigate('/variants/add', {
        state: {
          autoSelectSpecId: specId,
          autoSelectCoatingShade: colour || '',
          returnTo: `/lacquer-plan/add`,
          savedRows: rows,
          rowIndex: rowIndex,
          companyId: rows[rowIndex]?.companyId,
          brandId: rows[rowIndex]?.brandId,
          planDate
        }
      });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (rows.some(r => !r.companyId || !r.brandId)) {
      return Swal.fire('Error', 'Please select Company and Brand for all sections.', 'error');
    }

    const bpbPromises = [];
    rows.forEach(row => {
        if (row.bottleName && row.boxQty) {
          bpbPromises.push(API.post('/bottle-per-box', {
            bottleName: row.bottleName,
            bottlePerBox: row.boxQty,
            status: true
          }));
        }
    });
    if (bpbPromises.length > 0) {
      try {
        await Promise.all(bpbPromises);
      } catch (err) {
        console.error("Failed to update Bottle Per Box masters", err);
      }
    }

    const payload = [];
    let hasError = false;
    let hasDuplicate = false;
    const comboSet = new Set();

    rows.forEach((row) => {
      if (row.bottleName) {
         if (!row.variantId || row.variantId.length === 0 || !row.colour || !row.orderQty || !row.process) {
            hasError = true;
         }
         
         const groupId = row.sharedGroupId || null;

         row.variantId.forEach(vid => {
           const comboKey = `${row.companyId.toString()}-${row.brandId.toString()}-${row.bottleName.trim().toLowerCase()}-${vid.toString()}`;
           if (comboSet.has(comboKey)) {
             hasDuplicate = true;
           }
           comboSet.add(comboKey);

           payload.push({
             planDate: planDate,
             companyId: row.companyId,
             bottleName: row.bottleName,
             status: true,
             boxQty: row.boxQty || null,
             variantId: vid,
             colour: row.colour || '',
             coatingShade: row.colour || '',
             brandId: row.brandId,
             process: row.process,
             orderQty: row.orderQty,
             coatedQty: row.coatedQty || 0,
             coatingCompletedQty: row.coatedQty || 0,
             balanceToMake: row.balanceToMake || 0,
             dispatchBalance: row.dispatchBalance || 0,
             dispatchPendingQty: row.dispatchBalance || 0,
             soldQty: row.soldQty || 0,
             noOfBoxes: row.noOfBoxes || null,
             remarks: row.remarks || '',
             plainStock: row.plainStock || 0,
             importGroupId: groupId,
             stockWarningAcknowledged: acknowledgeStockWarning[rows.indexOf(row)] || false
           });
         });
      }
    });

    if (hasError) return Swal.fire('Error', 'Please fill in all required fields (Bottle Name, Variant, Coating Shade, Process, Order Qty) for each entered row.', 'error');
    if (hasDuplicate) return Swal.fire('Error', 'This Bottle Name and Variant combination is repeated.', 'error');
    if (payload.length === 0) return Swal.fire('Error', 'Please ensure at least one valid entry is provided.', 'error');

    // Check if there are unacknowledged stock warnings
    const unacknowledgedWarnings = Object.keys(stockWarnings).filter(idx => !acknowledgeStockWarning[idx]);
    if (unacknowledgedWarnings.length > 0) {
      return Swal.fire('Stock Warning', `Please acknowledge the stock warning(s) before submitting (${unacknowledgedWarnings.length} row(s) require acknowledgment).`, 'warning');
    }

    dispatch(createLacquerPlan(payload)).then((res) => {
      if (!res.error) {
        Swal.fire('Success', 'Lacquer Plan(s) added successfully', 'success');
        navigate('/lacquer-plan');
      } else {
        Swal.fire('Error', res.payload || 'Failed to add plan', 'error');
      }
    });
  };

  const companyOptions = useMemo(() => {
    return (companies || [])
      .filter(c => c && c.status !== false && !c.isDeleted)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
      .map(c => ({ value: c._id, label: c.name }));
  }, [companies]);

  const uniqueCoatingShades = Array.from(new Set([
    ...(variants || []).map(v => v.coatingShade),
    ...(bottleSpecs || []).map(s => s.coatingShade)
  ].filter(shade => shade && shade.trim() !== ''))).sort().map(shade => ({ value: shade, label: shade }));



  return (
    <div className="page-content">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">{labels.addPlan}</h1>
            <p className="page-subtitle mb-0">Record multiple lacquer plan entries</p>
          </div>
        </div>
        <div>
          <button onClick={toggleLanguage} className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold">
            {language === 'en' ? 'ગુજરાતી' : 'English'}
          </button>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-4">
            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="row g-3 mb-4 pb-4 border-bottom align-items-center">
                <div className="col-md-3">
                  <label className="form-label fw-bold small">Common Plan Date <span className="text-danger">*</span></label>
                  <input type="date" className="form-control shadow-none"
                    value={planDate} onChange={(e) => setPlanDate(e.target.value)} required />
                </div>
              </div>

              <div className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative">


                {(() => {
                  const groupedSections = [];
                  rows.forEach((row, idx) => {
                    const groupId = row.sharedGroupId || `standalone_${idx}`;
                    let group = groupedSections.find(g => g.id === groupId);
                    if (!group) {
                      group = { id: groupId, bottleName: row.bottleName, items: [] };
                      groupedSections.push(group);
                    }
                    group.items.push({ ...row, originalIndex: idx });
                  });

                  return groupedSections.map((group, groupIndex) => {
                    const gCompanyId = group.items[0]?.companyId;
                    const gBrandId = group.items[0]?.brandId;
                    const companyBrandIds = new Set(
                      (brands || [])
                        .filter(b => (b.companyId?._id || b.companyId)?.toString() === gCompanyId?.toString())
                        .map(b => b._id.toString())
                    );
                    const companySpecs = (bottleSpecs || []).filter(s => {
                      const bId = s.brandId?._id || s.brandId;
                      return bId && companyBrandIds.has(bId.toString());
                    });
                    const brandOptions = (brands || [])
                      .filter(b => b.status && companyBrandIds.has(b._id.toString()))
                      .map(b => ({ value: b._id, label: b.name }));
                    let filteredBottleOptions = [];
                    if (gBrandId) {
                      const matchingSpecs = companySpecs.filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === gBrandId.toString());
                      const matchingBottleNames = new Set(matchingSpecs.map(s => s.bottleName?.trim()).filter(Boolean));
                      const allSpecBottles = (bottleSpecs || []).map(s => s.bottleName?.trim()).filter(Boolean);
                      const allBPBBottles = (bottlePerBoxes || []).map(b => b.bottleName?.trim()).filter(Boolean);
                      const allBottles = Array.from(new Set([...allBPBBottles, ...allSpecBottles])).filter(Boolean);
                      filteredBottleOptions = allBottles.map(name => ({ value: name, label: name, isBrandSpecific: matchingBottleNames.has(name) }))
                        .sort((a, b) => {
                           if (a.isBrandSpecific && !b.isBrandSpecific) return -1;
                           if (!a.isBrandSpecific && b.isBrandSpecific) return 1;
                           return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
                        });
                    }

                    const visibleGroupSpans = {};
                    group.items.forEach(r => {
                      if (r.sharedGroupId) {
                        visibleGroupSpans[r.sharedGroupId] = (visibleGroupSpans[r.sharedGroupId] || 0) + 1;
                      }
                    });
                    const renderedGroups = new Set();

                    return (
                      <div key={group.id} className="mb-4 bg-white rounded-3 shadow-sm border p-4">
                        
                        <div className="row g-4 mb-4 bg-light p-3 rounded mx-0">
                          <div className="col-md-4">
                            <label className="form-label fw-bold small text-primary">{labels.company} <span className="text-danger">*</span></label>
                            <Select
                              options={companyOptions}
                              value={companyOptions.find(o => o.value === gCompanyId) || null}
                              onChange={(selected) => handleRowChange(group.items[0].originalIndex, 'companyId', selected ? selected.value : '')}
                              placeholder="Select company..."
                              isClearable
                              required
                            />
                          </div>
                          <div className="col-md-5">
                            <label className="form-label fw-bold small text-primary">{labels.brand} <span className="text-danger">*</span></label>
                            <Select
                              options={brandOptions}
                              value={brandOptions.find(o => o.value === gBrandId) || null}
                              onChange={(selected) => handleRowChange(group.items[0].originalIndex, 'brandId', selected ? selected.value : '')}
                              placeholder={gCompanyId ? "Select brand..." : "Select company first..."}
                              isDisabled={!gCompanyId}
                              isClearable
                              required
                            />
                          </div>
                        </div>

                        <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                          <h5 className="mb-0 text-primary fw-bold">
                            <i className="bi bi-box-seam me-2"></i>
                            {group.bottleName ? group.bottleName : `Plan Section ${groupIndex + 1}`}
                          </h5>
                          {groupedSections.length > 1 && (
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeSection(group.id)}>
                              <i className="bi bi-trash me-1"></i> Remove Section
                            </button>
                          )}
                        </div>

                        <div className="table-responsive mb-3">
                          <table className="table table-bordered align-middle table-sm" style={{ minWidth: '2400px' }}>
                            <thead className="table-light">
                              <tr>
                                <th className="small text-muted text-center align-middle" style={{width: '3%'}}>#</th>
                                <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.bottleName} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.variant} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.coatingShade} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.process} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.plainStock}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.bottlePerBox}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '7%'}}>{labels.orderQty} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.coatingCompletedQty}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.balanceToMake}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.dispatchPendingQty}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '5%'}}>{labels.soldQty}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.noOfOrderBoxes}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '15%', minWidth: '250px'}}>{labels.remarks}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '3%'}}></th>
                              </tr>
                            </thead>
                            <tbody className="border-top-0">
                              {group.items.map((rowItem, localIndex) => {
                                const index = rowItem.originalIndex;
                                const row = rowItem;

                                const isGrouped = !!row.sharedGroupId;
                                const isFirstInGroup = isGrouped && !renderedGroups.has(row.sharedGroupId);
                                if (isFirstInGroup) renderedGroups.add(row.sharedGroupId);
                                const rowSpan = isGrouped ? visibleGroupSpans[row.sharedGroupId] : 1;
                                const renderGroupCell = !isGrouped || isFirstInGroup;

                                let renderShadeGroupCell = true;
                                let shadeRowSpan = 1;
                                if (isGrouped) {
                                    const prevRow = localIndex > 0 ? group.items[localIndex - 1] : null;
                                    if (prevRow && prevRow.sharedGroupId === row.sharedGroupId && prevRow.colour === row.colour) {
                                        renderShadeGroupCell = false;
                                    } else {
                                        let count = 1;
                                        for (let i = localIndex + 1; i < group.items.length; i++) {
                                            if (group.items[i].sharedGroupId === row.sharedGroupId && group.items[i].colour === row.colour) {
                                                count++;
                                            } else {
                                                break;
                                            }
                                        }
                                        shadeRowSpan = count;
                                    }
                                }

                                const selectedBottles = new Set(group.items.filter((_, i) => i !== localIndex).map(r => r.bottleName).filter(Boolean));
                                const rowBottleOptions = filteredBottleOptions.filter(o => !selectedBottles.has(o.value));

                                const matchingSpecs = row.bottleName
                                  ? companySpecs.filter(bs => bs.bottleName === row.bottleName && (bs.brandId?._id || bs.brandId)?.toString() === gBrandId?.toString())
                                  : companySpecs.filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === gBrandId?.toString());
                                const matchingSpecIds = matchingSpecs.map(bs => bs._id);

                                const variantOptions = (variants || [])
                                  .filter(v => matchingSpecIds.includes(v.bottleSpecId?._id || v.bottleSpecId))
                                  .filter(v => v.variantName)
                                  .filter(v => !group.items.filter((r, i) => i !== localIndex && r.bottleName === row.bottleName).flatMap(r => r.variantId || []).includes(v._id.toString()))
                                  .map(v => ({ value: v._id, label: v.variantName }));

                                return (
                                  <tr key={index}>
                                    <td className="text-center text-muted">{localIndex + 1}</td>
                                    {renderGroupCell && (
                                    <td rowSpan={rowSpan} className="align-middle" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                      <CreatableSelect
                                        options={rowBottleOptions}
                                        value={rowBottleOptions.find(o => o.value === row.bottleName) || (row.bottleName ? { value: row.bottleName, label: row.bottleName } : null)}
                                        onChange={(selected) => handleRowChange(index, 'bottleName', selected ? selected.value.toUpperCase() : '')}
                                        placeholder={gBrandId ? "Select bottle..." : "Select brand first..."}
                                        isDisabled={!gBrandId}
                                        isClearable
                                        required
                                        filterOption={(option, inputValue) => {
                                           if (option.data.__isNew__) return true;
                                           if (!option.data.isBrandSpecific) return false;
                                           if (!inputValue) return true;
                                           return option.label.toLowerCase().includes(inputValue.toLowerCase());
                                        }}
                                        menuPortalTarget={document.body}
                                        styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                                      />
                                    </td>
                                    )}
                                    <td>
                                      <Select
                                        isMulti
                                        options={variantOptions}
                                        value={variantOptions.filter(o => row.variantId.includes(o.value))}
                                        onChange={(selected) => handleRowChange(index, 'variantId', selected ? selected.map(s => s.value) : [])}
                                        placeholder="Variant..."
                                        isClearable
                                        required
                                        menuPortalTarget={document.body}
                                        styles={{ 
                                          menuPortal: base => ({ ...base, zIndex: 9999 }),
                                          valueContainer: base => ({ ...base, flexWrap: 'nowrap' }),
                                          multiValue: base => ({ ...base, minWidth: 0 }),
                                          multiValueLabel: base => ({ ...base, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
                                        }}
                                      />
                                      {row.bottleName && variantOptions.length === 0 && (
                                        <div style={{ fontSize: '0.7rem' }} className="text-warning mt-1">
                                          <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                          No variants. <button type="button" onClick={() => handleAddVariantClick(row.bottleName, gBrandId, index, row.colour)} className="text-decoration-underline text-warning fw-bold btn btn-link p-0 border-0 align-baseline" style={{ fontSize: 'inherit' }}>Add Variant</button>
                                        </div>
                                      )}
                                    </td>
                                    {renderShadeGroupCell && (
                                    <td rowSpan={shadeRowSpan} className="align-middle" style={{ backgroundColor: (isGrouped && shadeRowSpan > 1) ? '#f8f9fa' : 'inherit' }}>
                                      <CreatableSelect
                                        options={uniqueCoatingShades}
                                        value={row.colour ? { value: row.colour, label: row.colour } : null}
                                        onChange={(selected) => {
                                           if (isGrouped && shadeRowSpan > 1) {
                                              const updatedRows = [...rows];
                                              for (let i = index; i < index + shadeRowSpan; i++) {
                                                 updatedRows[i].colour = selected ? selected.value : '';
                                              }
                                              handleRowChange(index, 'colour', selected ? selected.value : '');
                                              setTimeout(() => {
                                                  setRows(currentRows => {
                                                      const newR = [...currentRows];
                                                      for (let i = index; i < index + shadeRowSpan; i++) {
                                                          if (i !== index) newR[i].colour = selected ? selected.value : '';
                                                      }
                                                      return newR;
                                                  });
                                              }, 0);
                                           } else {
                                              handleRowChange(index, 'colour', selected ? selected.value : '');
                                           }
                                        }}
                                        placeholder="Shade..."
                                        isClearable
                                        required
                                        menuPortalTarget={document.body}
                                        styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                                        isValidNewOption={(inputValue, selectValue, selectOptions) => {
                                          if (!inputValue) return false;
                                          const lowerInput = inputValue.trim().toLowerCase();
                                          return !selectOptions.some(opt => opt.label.toLowerCase().includes(lowerInput));
                                        }}
                                        formatCreateLabel={(inputValue) => `Create "${inputValue.toUpperCase()}"`}
                                      />
                                    </td>
                                    )}
                                    {renderGroupCell && (
                                    <td rowSpan={rowSpan} className="align-middle" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                      <select className="form-select form-select-sm shadow-none" value={row.process} onChange={(e) => handleRowChange(index, 'process', e.target.value)} required>
                                        <option value="C">C</option>
                                        <option value="P">P</option>
                                        <option value="F">F</option>
                                        <option value="C+P">C+P</option>
                                        <option value="C+F">C+F</option>
                                        {!["C", "P", "F", "C+P", "C+F"].includes(row.process) && row.process && (
                                          <option value={row.process}>{row.process}</option>
                                        )}
                                      </select>
                                    </td>
                                    )}
                                    {renderGroupCell && (
                                    <td rowSpan={rowSpan} className="align-middle" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                      <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.plainStock} onChange={(e) => handleRowChange(index, 'plainStock', e.target.value)} min="0" />
                                    </td>
                                    )}
                                    {renderGroupCell && (
                                    <td rowSpan={rowSpan} className="align-middle" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                      <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.boxQty} onChange={(e) => handleRowChange(index, 'boxQty', e.target.value)} min="1" />
                                    </td>
                                    )}
                                    <td>
                                      <input 
                                        type="number" 
                                        className={`form-control form-control-sm shadow-none text-center ${row.isExceedingStock ? 'bg-warning' : ''}`} 
                                        value={row.orderQty} 
                                        onChange={(e) => handleRowChange(index, 'orderQty', e.target.value)}
                                        onBlur={async () => {
                                          // Check stock warning on blur
                                          if (row.bottleName && row.companyId && row.orderQty) {
                                            try {
                                              const res = await API.get('/lacquer-plan/validate-stock', {
                                                params: {
                                                  bottleName: row.bottleName,
                                                  companyId: row.companyId,
                                                  orderQty: parseFloat(row.orderQty)
                                                }
                                              });
                                              if (res.data.success) {
                                                if (res.data.data.hasWarning) {
                                                  setStockWarnings(prev => ({ ...prev, [index]: res.data.data }));
                                                } else {
                                                  setStockWarnings(prev => {
                                                    const updated = { ...prev };
                                                    delete updated[index];
                                                    return updated;
                                                  });
                                                }
                                              }
                                            } catch (err) {
                                              console.error('Stock validation error:', err);
                                            }
                                          }
                                        }}
                                        min="1" 
                                        required 
                                      />
                                    </td>
                                    <td>
                                      <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.coatedQty} onChange={(e) => handleRowChange(index, 'coatedQty', e.target.value)} min="0" />
                                    </td>
                                    <td>
                                      <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.balanceToMake} onChange={(e) => handleRowChange(index, 'balanceToMake', e.target.value)} />
                                    </td>
                                    <td>
                                      <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.dispatchBalance} onChange={(e) => handleRowChange(index, 'dispatchBalance', e.target.value)} min="0" />
                                    </td>
                                    <td>
                                      <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.soldQty} onChange={(e) => handleRowChange(index, 'soldQty', e.target.value)} min="0" />
                                    </td>
                                    <td>
                                      <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.noOfBoxes} onChange={(e) => handleRowChange(index, 'noOfBoxes', e.target.value)} min="0" />
                                    </td>
                                    <td>
                                      <input type="text" className="form-control form-control-sm shadow-none" value={row.remarks} onChange={(e) => handleRowChange(index, 'remarks', e.target.value)} />
                                    </td>
                                    {renderGroupCell && (
                                    <td rowSpan={rowSpan} className="text-center align-middle" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-light text-danger rounded-circle shadow-sm"
                                        onClick={() => removeRow(index)}
                                        disabled={rows.length === 1}
                                      >
                                        <i className="bi bi-trash"></i>
                                      </button>
                                    </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Stock Warning Display */}
                        {Object.keys(stockWarnings).some(idx => {
                          const groupItems = group.items.map(item => item.originalIndex);
                          return groupItems.includes(parseInt(idx));
                        }) && (
                          <div className="alert alert-warning border-warning p-3 mb-3 rounded-3" role="alert">
                            <h6 className="fw-bold mb-3 text-warning">
                              <i className="bi bi-exclamation-triangle-fill me-2"></i>⚠️ Stock Warning(s) Detected
                            </h6>
                            {group.items.map((rowItem) => {
                              const index = rowItem.originalIndex;
                              const warning = stockWarnings[index];
                              if (!warning) return null;
                              
                              return (
                                <div key={index} className="mb-3 p-3 bg-white rounded border-warning border-2">
                                  <div className="row mb-2">
                                    <div className="col-md-6">
                                      <small className="text-muted fw-bold">Row {rowItem.bottleName}</small>
                                      <div className="text-dark fw-bold">Order Qty: {warning.orderQty}</div>
                                    </div>
                                    <div className="col-md-6">
                                      <small className="text-muted fw-bold">Available Stock</small>
                                      <div className="text-danger fw-bold">Over by: {warning.overBy} units</div>
                                    </div>
                                  </div>
                                  <div className="row mb-3">
                                    <div className="col-12">
                                      <small className="text-muted">
                                        Current Stock: <strong>{warning.details?.totalStock || 0}</strong> | 
                                        Allocated: <strong>{warning.details?.allocated || 0}</strong> | 
                                        Available: <strong className="text-danger">{warning.availableStock}</strong>
                                      </small>
                                    </div>
                                  </div>
                                  <div className="form-check">
                                    <input 
                                      className="form-check-input" 
                                      type="checkbox" 
                                      id={`acknowledge-warning-${index}`}
                                      checked={acknowledgeStockWarning[index] || false}
                                      onChange={(e) => setAcknowledgeStockWarning(prev => ({ ...prev, [index]: e.target.checked }))}
                                    />
                                    <label className="form-check-label small text-muted" htmlFor={`acknowledge-warning-${index}`}>
                                      I understand the risk and want to import this quantity anyway
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="d-flex justify-content-between">
                          <button type="button" className="btn btn-sm btn-outline-primary shadow-sm" onClick={() => addEntryRow(group.id)}>
                            <i className="bi bi-plus-lg me-1"></i> Add Entry Row
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="d-flex justify-content-start mb-4">
                <button type="button" className="btn btn-dark shadow-sm px-4" onClick={addNewSection}>
                  <i className="bi bi-plus-circle-fill me-2"></i> Add New Bottle Plan Section
                </button>
              </div>

              <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
                <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                  <i className="bi bi-check2-circle me-2" /> {loading ? 'Saving...' : 'Save All Plans'}
                </button>
                <button type="button" onClick={() => navigate('/lacquer-plan')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {showMissingSpecModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1050, backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-white border-bottom p-4">
                <h5 className="modal-title fw-bold text-dark mb-0 d-flex align-items-center">
                  <div className="bg-primary bg-opacity-10 text-primary p-2 rounded-3 me-3 d-flex align-items-center justify-content-center">
                    <i className="bi bi-gear-fill"></i>
                  </div>
                  Add Bottle Specs
                </h5>
                <button type="button" className="btn-close shadow-none" onClick={() => setShowMissingSpecModal(false)}></button>
              </div>
              <div className="modal-body p-4 bg-light bg-opacity-50">
                <div className="alert alert-info py-3 small mb-4 rounded-3 border-0 bg-info bg-opacity-10 text-info-emphasis d-flex gap-2 align-items-start">
                   <i className="bi bi-info-circle-fill mt-1"></i>
                   <div>Bottle <strong>{missingSpecData.bottleName}</strong> is missing specifications for this Brand. Please add it to continue.</div>
                </div>
                <div className="row g-4 mb-4">
                   <div className="col-md-6">
                      <label className="form-label text-uppercase small fw-bold text-muted mb-1">Company</label>
                      <input type="text" className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2 fw-500" value={missingSpecData.companyName} disabled />
                   </div>
                   <div className="col-md-6">
                      <label className="form-label text-uppercase small fw-bold text-muted mb-1">Brand</label>
                      <input type="text" className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2 fw-500 text-accent" value={missingSpecData.brandName} disabled />
                   </div>
                </div>
                <div className="mb-4">
                  <label className="form-label text-uppercase small fw-bold text-muted mb-1">Bottle Name</label>
                  <input 
                    type="text" 
                    className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2 fw-bold text-dark" 
                    value={missingSpecData.bottleName} 
                    disabled
                  />
                </div>

                <div className="mb-4">
                  <label className="form-label text-uppercase small fw-bold text-muted mb-1">Bottle Code</label>
                  <input 
                    type="text" 
                    className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2" 
                    value={missingSpecData.code} 
                    onChange={(e) => setMissingSpecData({...missingSpecData, code: e.target.value})}
                    placeholder="Optional code"
                  />
                </div>

                <div className="row g-4 mb-4">
                   <div className="col-md-6">
                     <label className="form-label text-uppercase small fw-bold text-muted mb-1">Printing Type</label>
                     <select 
                        className="form-select shadow-none bg-white border-light-subtle rounded-3 py-2" 
                        value={missingSpecData.printingTypeId}
                        onChange={(e) => setMissingSpecData({...missingSpecData, printingTypeId: e.target.value})}
                     >
                        <option value="">None</option>
                        {printingTypes.map(pt => (
                           <option key={pt._id} value={pt._id}>{pt.name}</option>
                        ))}
                     </select>
                   </div>
                   <div className="col-md-6">
                     <label className="form-label text-uppercase small fw-bold text-muted mb-1">Printing Color</label>
                     <select 
                        className="form-select shadow-none bg-white border-light-subtle rounded-3 py-2" 
                        value={missingSpecData.printingColorId}
                        onChange={(e) => setMissingSpecData({...missingSpecData, printingColorId: e.target.value})}
                     >
                        <option value="">None</option>
                        {printingColors.map(pc => (
                           <option key={pc._id} value={pc._id}>{pc.name}</option>
                        ))}
                     </select>
                   </div>
                </div>

                <div>
                  <label className="form-label text-uppercase small fw-bold text-muted mb-1">Bottle Per Box</label>
                  <input 
                    type="number" 
                    className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2" 
                    value={missingSpecData.bottlePerBox} 
                    onChange={(e) => setMissingSpecData({...missingSpecData, bottlePerBox: e.target.value})}
                    placeholder="Enter quantity per box"
                    min="1"
                  />
                </div>
              </div>
              <div className="modal-footer bg-white border-top p-4 d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-light px-4 py-2 fw-500 rounded-3" onClick={() => setShowMissingSpecModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary px-4 py-2 fw-500 rounded-3 d-flex align-items-center" onClick={handleSaveMissingSpec} disabled={creatingSpec}>
                  {creatingSpec ? (
                     <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Saving...</>
                  ) : (
                     <><i className="bi bi-save me-2"></i> Save Spec</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
