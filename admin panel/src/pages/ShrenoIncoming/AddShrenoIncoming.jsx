import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { useSelector, useDispatch } from 'react-redux';
import { fetchItemTypes, updateItemType } from '../../redux/slices/itemTypeSlice';
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

const getCleanScannedBottleName = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/^of\b\s*/i, '')
  .replace(/\bPkgs\s+Glass\s+Bottles\b/gi, '')
  .replace(/\bGlass\s+Bottles\b/gi, '')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/(\d)([a-z])/gi, '$1 $2')
  .toUpperCase();

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export default function AddShrenoIncoming() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { itemTypes } = useSelector(state => state.itemTypes);
  const { loading: visionLoading } = useSelector(state => state.vision);
  const { plainBottleOptionsByCompany } = useSelector(state => state.incoming);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    challanNo: '',
    poNo: '',
    poDate: '',
  });

  const [items, setItems] = useState([
    { 
      plainBottle: '', 
      itemType: '', 
      configuration: '', 
      quantity: ''
    }
  ]);
  const itemsRef = useRef(items);
  const nextScanRowId = useRef(0);
  const shownWarningKeys = useRef(new Set());
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  
  const [otherBottles, setOtherBottles] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createErrors, setCreateErrors] = useState({});
  const [newBottlesToCreate, setNewBottlesToCreate] = useState({});
  const [imageFiles, setImageFiles] = useState([]);
  const [scannedImageFiles, setScannedImageFiles] = useState([]);
  const [cameraSource, setCameraSource] = useState(null);
  const [mode, setMode] = useState('manual');
  const [loading, setLoading] = useState(false);
  const [plainBottleDialog, setPlainBottleDialog] = useState(null);
  const [plainBottleDialogTab, setPlainBottleDialogTab] = useState('create');
  const [plainBottleName, setPlainBottleName] = useState('');
  const [plainBottlePerBox, setPlainBottlePerBox] = useState('');
  const [plainBottleSelection, setPlainBottleSelection] = useState(null);
  const [plainBottleDialogError, setPlainBottleDialogError] = useState('');
  const [savingPlainBottle, setSavingPlainBottle] = useState(false);

  useEffect(() => {
    dispatch(fetchItemTypes({ page: 1, limit: 1000 }));
    dispatch(fetchIncomingPlainBottleOptions(PO_REQUIRED_COMPANY.id));
  }, [dispatch]);

  // Cleanup state on mount (reset search results)
  useEffect(() => {
    setOtherBottles([]);
    setSearchLoading(false);
    setCreateErrors({});
    setNewBottlesToCreate({});
  }, []);

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
  const optionsListRef = useRef(optionsList);
  useEffect(() => {
    optionsListRef.current = optionsList;
  }, [optionsList]);

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

  const setPlainBottleQueueStep = (rowIds, position, availableOptions = optionsListRef.current) => {
    let nextPosition = position;
    let nextItem;
    while (nextPosition < rowIds.length) {
      nextItem = itemsRef.current.find((item) => item.scanRowId === rowIds[nextPosition]);
      if (nextItem && !nextItem.plainBottle) break;
      nextPosition += 1;
    }

    if (nextPosition >= rowIds.length || !nextItem) {
      setPlainBottleDialog(null);
      setPlainBottleDialogError('');
      return;
    }

    const index = itemsRef.current.findIndex((item) => item.scanRowId === rowIds[nextPosition]);
    const scannedText = nextItem.scanBottleText || nextItem.bottleHint || '';
    const cleanedName = getCleanScannedBottleName(scannedText);
    const matchingOption = availableOptions.find(
      (option) => normalizeBottleName(option.label) === normalizeBottleName(cleanedName)
    );
    setPlainBottleDialog({ rowIds, position: nextPosition, index, scannedText });
    setPlainBottleDialogTab('create');
    setPlainBottleName(cleanedName);
    setPlainBottlePerBox(
      Number.isInteger(Number(nextItem.scanBottlePerBox)) && Number(nextItem.scanBottlePerBox) > 0
        ? String(nextItem.scanBottlePerBox)
        : ''
    );
    setPlainBottleSelection(matchingOption || null);
    setPlainBottleDialogError('');
  };

  const openPlainBottleQueue = (rows, availableOptions = optionsListRef.current) => {
    const rowIds = rows.map(({ item }) => item.scanRowId).filter(Boolean);
    if (!rowIds.length) return;
    setPlainBottleQueueStep(rowIds, 0, availableOptions);
  };

  const showPlainBottleWarning = (rows, deliveryNumberMissing = false) => {
    const rowIds = rows.map(({ item }) => item.scanRowId).filter(Boolean).sort();
    const warningKey = `${PO_REQUIRED_COMPANY.id}:${rowIds.join(',')}`;
    if (!rowIds.length || shownWarningKeys.current.has(warningKey)) return;
    shownWarningKeys.current.add(warningKey);

    const visibleRows = rows.slice(0, 5);
    const rowList = visibleRows.map(({ item, index }) =>
      `<li>Row ${index + 1}: ${escapeHtml(item.scanBottleText || item.bottleHint)}</li>`
    ).join('');
    const remaining = rows.length > 5
      ? `<li>and ${rows.length - 5} more</li>`
      : '';
    const deliveryWarning = deliveryNumberMissing
      ? '<p class="text-danger small mt-3 mb-0">Could not detect a valid Challan or Delivery Number.</p>'
      : '';

    Swal.fire({
      icon: 'warning',
      title: 'Plain bottle not available',
      html: `<div class="text-start"><p>These bottles are not available for ${escapeHtml(PO_REQUIRED_COMPANY.name)}:</p><ul class="mb-0">${rowList}${remaining}</ul>${deliveryWarning}</div>`,
      showDenyButton: true,
      confirmButtonText: 'Okay',
      denyButtonText: 'Add',
      allowEscapeKey: true,
      allowOutsideClick: true,
      reverseButtons: true,
      customClass: { popup: 'incoming-bottle-warning-popup' },
    }).then((result) => {
      if (result.isDenied) openPlainBottleQueue(rows);
    });
  };

  const advancePlainBottleQueue = (position = (plainBottleDialog?.position || 0) + 1, availableOptions) => {
    if (!plainBottleDialog) return;
    setPlainBottleQueueStep(plainBottleDialog.rowIds, position, availableOptions);
  };

  const closePlainBottleDialog = () => {
    if (savingPlainBottle) return;
    setPlainBottleDialog(null);
    setPlainBottleDialogError('');
  };

  const applyBottleToScannedRow = (bottle, rowIndex, fallbackName) => {
    const bottleId = String(bottle._id || bottle.id || '');
    const bottleLabel = bottle.plainBottleName || bottle.bottleName || bottle.name || fallbackName || '';
    const bottleOption = {
      value: bottleId,
      label: bottleLabel,
      plainBottleName: bottleLabel,
      bottlePerBoxData: bottle,
      isOtherBottle: true,
    };
    const availableOptions = [
      ...optionsListRef.current.filter((option) => option.value !== bottleId),
      bottleOption,
    ];
    optionsListRef.current = availableOptions;
    setOtherBottles((current) => [
      ...current.filter((option) => option.value !== bottleId),
      bottleOption,
    ]);

    const nextItems = itemsRef.current.map((item, index) => index === rowIndex
      ? {
          ...item,
          plainBottle: bottleId,
          bottleLabel,
          bottleHint: '',
          scanUserResolved: true,
        }
      : item);
    itemsRef.current = nextItems;
    setItems(nextItems);
    return availableOptions;
  };

  const handleCreateScannedBottle = async (event) => {
    event?.preventDefault();
    if (!plainBottleDialog || savingPlainBottle) return;

    const name = plainBottleName.trim().replace(/\s+/g, ' ');
    const bottlePerBox = Number(plainBottlePerBox);
    if (!name) {
      setPlainBottleDialogError('Plain bottle name is required.');
      return;
    }
    if (!Number.isInteger(bottlePerBox) || bottlePerBox <= 0) {
      setPlainBottleDialogError('Bottle per box must be a positive whole number.');
      return;
    }

    setSavingPlainBottle(true);
    setPlainBottleDialogError('');
    try {
      const response = await api.post('/incoming/create-bottle', {
        companyId: PO_REQUIRED_COMPANY.id,
        plainBottleName: name,
        bottlePerBox,
      });
      const bottle = response.data?.data;
      if (!bottle?._id) throw new Error('Bottle creation did not return a plain bottle record.');

      const availableOptions = applyBottleToScannedRow(
        bottle,
        plainBottleDialog.index,
        name
      );
      advancePlainBottleQueue(plainBottleDialog.position + 1, availableOptions);
    } catch (error) {
      setPlainBottleDialogError(
        error.response?.data?.message || error.message || 'Could not create the plain bottle.'
      );
    } finally {
      setSavingPlainBottle(false);
    }
  };

  const handleSelectScannedBottle = async () => {
    if (!plainBottleDialog || !plainBottleSelection || savingPlainBottle) return;
    setSavingPlainBottle(true);
    setPlainBottleDialogError('');

    try {
      let bottle = plainBottleSelection.bottlePerBoxData;
      if (plainBottleSelection.isOtherBottle || !/^[a-f\d]{24}$/i.test(String(plainBottleSelection.value))) {
        const response = await api.post('/incoming/create-bottle', {
          companyId: PO_REQUIRED_COMPANY.id,
          plainBottleName: plainBottleSelection.label,
        });
        bottle = response.data?.data;
        if (!bottle?._id) throw new Error('Bottle selection did not return a plain bottle record.');
      } else if (!bottle?._id) {
        bottle = {
          _id: plainBottleSelection.value,
          plainBottleName: plainBottleSelection.label,
        };
      }

      const availableOptions = applyBottleToScannedRow(
        bottle,
        plainBottleDialog.index,
        plainBottleSelection.label
      );
      advancePlainBottleQueue(plainBottleDialog.position + 1, availableOptions);
    } catch (error) {
      setPlainBottleDialogError(
        error.response?.data?.message || error.message || 'Could not select this plain bottle.'
      );
    } finally {
      setSavingPlainBottle(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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

  const addItem = () => {
    setItems([...items, { 
      plainBottle: '', 
      itemType: '', 
      configuration: '', 
      quantity: ''
    }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date) {
      return Swal.fire('Error', 'Date is required.', 'error');
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
        delete savedItem.bottleLabel;
        delete savedItem.scanModeRow;
        delete savedItem.scanBottleText;
        delete savedItem.scanBottlePerBox;
        delete savedItem.scanUserResolved;
        delete savedItem.scanRowId;
        return savedItem;
      })));
      imageFiles.forEach(file => {
        data.append('images', file);
      });

      const res = await api.post('/shreno-incoming', data);
      if (res.data.success) {
        // Show success SweetAlert modal (centered, not toast)
        Swal.fire({
          position: 'center',
          icon: 'success',
          title: 'Success!',
          text: 'Shreno incoming added successfully',
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

      const { options: allowedBottleOptions } = await dispatch(
        fetchIncomingPlainBottleOptions(PO_REQUIRED_COMPANY.id)
      ).unwrap();
      const allowedBottleIds = new Set(allowedBottleOptions.map(option => option.value));
      const itemsToSet = (res.items || []).map(item => {
        const bottlePerBoxId = item.bottleId?._id || item.bottleId;
        const bottleId = allowedBottleIds.has(String(bottlePerBoxId || '')) ? String(bottlePerBoxId) : '';
        const bottleOption = allowedBottleOptions.find((option) => option.value === bottleId);
        const scannedText = item.bottleName ||
          item.suggestedName ||
          item.bottleId?.plainBottleName ||
          item.bottleId?.bottleName ||
          '';
        
        return {
          plainBottle: bottleId,
          bottleLabel: bottleOption?.label || '',
          bottleHint: bottleId ? '' : scannedText,
          scanModeRow: true,
          scanBottleText: scannedText,
          scanBottlePerBox: item.qty || item.bottlePerBox || '',
          scanUserResolved: false,
          scanRowId: `shreno-scan-${++nextScanRowId.current}`,
          itemType: item.itemType || '',
          configuration: item.configuration || '',
          quantity: item.totalQty || item.qty || '',
          sharedGroupId: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
        };
      });

      if (res.unmatchedItems && res.unmatchedItems.length > 0) {
        res.unmatchedItems.forEach(uItem => {
          const scannedText = uItem.suggestedName || uItem.bottleName || '';
          itemsToSet.push({
            plainBottle: '',
            bottleHint: scannedText,
            scanModeRow: true,
            scanBottleText: scannedText,
            scanBottlePerBox: uItem.qty || '',
            scanUserResolved: false,
            scanRowId: `shreno-scan-${++nextScanRowId.current}`,
            itemType: uItem.itemType || '',
            configuration: uItem.configuration || '',
            quantity: uItem.totalQty || uItem.qty || '',
            sharedGroupId: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
          });
        });
      }

      if (itemsToSet.length > 0) {
        itemsRef.current = itemsToSet;
        setItems(itemsToSet);
        setMode('manual');
        const unmatchedRows = itemsToSet
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.scanModeRow && !item.plainBottle && item.scanBottleText);
        if (unmatchedRows.length) {
          showPlainBottleWarning(unmatchedRows, !res.deliveryNumber);
        } else {
          Swal.fire({
            icon: res.deliveryNumber ? 'success' : 'warning',
            title: 'Challan Parsed',
            html: `Found Challan No: <b>${escapeHtml(res.deliveryNumber || 'N/A')}</b>.<br/>Matched ${res.items?.length || 0} items!${res.deliveryNumber ? '' : '<br/><br/><b style="color:#e63946;">Warning:</b> Could not detect a valid Challan or Delivery Number.'}`,
          });
        }
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
      
      const { options: allowedBottleOptions } = await dispatch(
        fetchIncomingPlainBottleOptions(PO_REQUIRED_COMPANY.id)
      ).unwrap();
      const allowedBottleIds = new Set(allowedBottleOptions.map(option => option.value));
      const newItemsToAppend = (res.items || []).map(item => {
        const bottlePerBoxId = item.bottleId?._id || item.bottleId;
        const bottleId = allowedBottleIds.has(String(bottlePerBoxId || '')) ? String(bottlePerBoxId) : '';
        const bottleOption = allowedBottleOptions.find((option) => option.value === bottleId);
        const scannedText = item.bottleName ||
          item.suggestedName ||
          item.bottleId?.plainBottleName ||
          item.bottleId?.bottleName ||
          '';
        
        return {
          plainBottle: bottleId,
          bottleLabel: bottleOption?.label || '',
          bottleHint: bottleId ? '' : scannedText,
          scanModeRow: true,
          scanBottleText: scannedText,
          scanBottlePerBox: item.qty || item.bottlePerBox || '',
          scanUserResolved: false,
          scanRowId: `shreno-scan-${++nextScanRowId.current}`,
          itemType: item.itemType || '',
          configuration: item.configuration || '',
          quantity: item.totalQty || item.qty || '',
          sharedGroupId: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
        };
      });

      if (res.unmatchedItems && res.unmatchedItems.length > 0) {
        res.unmatchedItems.forEach(uItem => {
          const scannedText = uItem.suggestedName || uItem.bottleName || '';
          newItemsToAppend.push({
            plainBottle: '',
            bottleHint: scannedText,
            scanModeRow: true,
            scanBottleText: scannedText,
            scanBottlePerBox: uItem.qty || '',
            scanUserResolved: false,
            scanRowId: `shreno-scan-${++nextScanRowId.current}`,
            itemType: '',
            configuration: '',
            quantity: uItem.totalQty || uItem.qty || '',
            sharedGroupId: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
          });
        });
      }

      if (newItemsToAppend.length > 0) {
        const existingItems = itemsRef.current;
        const replaceEmptyRow = existingItems.length === 1 &&
          !existingItems[0].plainBottle &&
          !existingItems[0].itemType &&
          !existingItems[0].configuration &&
          !existingItems[0].quantity;
        const nextItems = replaceEmptyRow
          ? newItemsToAppend
          : [...existingItems, ...newItemsToAppend];
        const firstNewIndex = replaceEmptyRow ? 0 : existingItems.length;
        itemsRef.current = nextItems;
        setItems(nextItems);
        Swal.close();
        const unmatchedRows = newItemsToAppend
          .map((item, index) => ({ item, index: firstNewIndex + index }))
          .filter(({ item }) => item.scanModeRow && !item.plainBottle && item.scanBottleText);
        if (unmatchedRows.length) {
          showPlainBottleWarning(unmatchedRows);
        } else {
          Swal.fire({
            icon: 'success',
            title: 'Document Parsed',
            text: `Added ${newItemsToAppend.length} new items from the document.`
          });
        }
      } else {
        Swal.close();
        Swal.fire('Warning', 'No new items could be detected from this document.', 'warning');
      }
    } catch (error) {
      Swal.fire('Error', error || 'Failed to parse additional document', 'error');
    }
  };

  return (
    <>
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
              <label className="form-label fw-bold small">Challan / Delivery No</label>
              <input type="text" className="form-control shadow-none" style={{ borderRadius: 8 }} name="challanNo" value={formData.challanNo} onChange={handleChange} placeholder="e.g. DOM/..." />
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
                  <th className="small text-muted" style={{width: '28%'}}>Plain Bottle <span className="text-danger">*</span></th>
                  <th className="small text-muted" style={{width: '20%'}}>Item Type(s) <span className="text-danger">*</span></th>
                  <th className="small text-muted" style={{width: '20%'}}>Configuration (e.g. 2PC, 64x1)</th>
                  <th className="small text-muted text-end" style={{width: '15%'}}>Quantity <span className="text-danger">*</span></th>
                  <th className="small text-muted text-center" style={{width: '12%'}}>Action</th>
                </tr>
              </thead>
              <tbody className="border-top-0">
                {items.map((item, index) => {
                  const plainBottleOption = optionsList.find(opt => opt.value === item.plainBottle) ||
                    (item.plainBottle && item.bottleLabel
                      ? { value: item.plainBottle, label: item.bottleLabel }
                      : null);
                  const bottleGroupKey = item.plainBottle || (item.scanModeRow ? item.scanRowId : '');
                  const itemTypeGroupKey = `${bottleGroupKey}:${item.itemType || ''}`;
                  
                  // Check if this is the first item in its bottle group (for rowSpan)
                  const isFirstInBottleGroup = !items.slice(0, index).some(
                    (previous) => (previous.plainBottle || (previous.scanModeRow ? previous.scanRowId : '')) === bottleGroupKey
                  );
                  
                  // Check if this is the first item in its itemType group (for rowSpan)
                  const isFirstInItemTypeGroup = !items.slice(0, index).some((previous) => {
                    const previousBottleKey = previous.plainBottle || (previous.scanModeRow ? previous.scanRowId : '');
                    return `${previousBottleKey}:${previous.itemType || ''}` === itemTypeGroupKey;
                  });
                  
                  // Count total items in this bottle group
                  const itemsInBottleGroup = items.filter(
                    (other) => (other.plainBottle || (other.scanModeRow ? other.scanRowId : '')) === bottleGroupKey
                  ).length;
                  
                  // Count total items in this itemType group (same bottle AND same itemType)
                  const itemsInItemTypeGroup = items.filter((other) => {
                    const otherBottleKey = other.plainBottle || (other.scanModeRow ? other.scanRowId : '');
                    return `${otherBottleKey}:${other.itemType || ''}` === itemTypeGroupKey;
                  }).length;
                  
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
                            control: (base) => ({
                              ...base,
                              borderRadius: '8px',
                              backgroundColor: 'var(--bs-light)',
                              borderColor: item.scanModeRow && !item.plainBottle
                                ? '#dc3545'
                                : 'var(--bs-border-color-translucent)',
                              boxShadow: item.scanModeRow && !item.plainBottle
                                ? '0 0 0 1px #dc3545'
                                : 'none',
                              minHeight: '38px',
                            })
                          }}
                        />
                        {createErrors[index] && (
                          <small className="text-danger d-block mt-1">{createErrors[index]}</small>
                        )}
                        {item.bottleHint && !item.scanModeRow && (
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
                        <select 
                          className="form-select shadow-none" 
                          style={{ borderRadius: 8, backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' }} 
                          value={item.itemType} 
                          onChange={(e) => handleItemChange(index, 'itemType', e.target.value)}
                        >
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
                      <input 
                        type="number" 
                        min="0" 
                        step="0.01" 
                        className="form-control text-end shadow-none" 
                        style={{ borderRadius: 8 }} 
                        value={item.quantity} 
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} 
                        required 
                      />
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
                          title="Remove this item"
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
    {plainBottleDialog && (
      <div
        className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
        style={{ zIndex: 1060, background: 'rgba(15, 23, 42, 0.55)' }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) advancePlainBottleQueue();
        }}
      >
        <div
          className="incoming-scan-bottle-dialog rounded-4 shadow-lg p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shreno-plain-bottle-dialog-title"
          onKeyDownCapture={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              advancePlainBottleQueue();
            }
          }}
          style={{ width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' }}
        >
          <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
            <div>
              <h5 id="shreno-plain-bottle-dialog-title" className="fw-bold mb-1">Resolve scanned plain bottle</h5>
              <div className="text-primary small fw-semibold mb-2">
                Row {plainBottleDialog.position + 1} of {plainBottleDialog.rowIds.length}
              </div>
              <div className="text-muted small">
                Original scanned text: <span className="fw-semibold">{plainBottleDialog.scannedText}</span>
              </div>
            </div>
            <button
              type="button"
              className="incoming-scan-bottle-close"
              aria-label="Close"
              onClick={closePlainBottleDialog}
              disabled={savingPlainBottle}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>

          <div className="btn-group w-100 mb-3" role="tablist" aria-label="Resolve scanned plain bottle">
            <button
              type="button"
              role="tab"
              aria-selected={plainBottleDialogTab === 'create'}
              className={`btn incoming-scan-bottle-tab ${plainBottleDialogTab === 'create' ? 'active' : ''}`}
              onClick={() => { setPlainBottleDialogTab('create'); setPlainBottleDialogError(''); }}
            >
              Create new plain bottle
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={plainBottleDialogTab === 'select'}
              className={`btn incoming-scan-bottle-tab ${plainBottleDialogTab === 'select' ? 'active' : ''}`}
              onClick={() => { setPlainBottleDialogTab('select'); setPlainBottleDialogError(''); }}
            >
              Select a different bottle
            </button>
          </div>

          {plainBottleDialogTab === 'create' ? (
            <form onSubmit={handleCreateScannedBottle}>
              <div className="mb-3">
                <label htmlFor="shreno-plain-bottle-name" className="form-label fw-semibold">
                  Plain Bottle name <span className="text-danger">*</span>
                </label>
                <input
                  autoFocus
                  id="shreno-plain-bottle-name"
                  className="form-control incoming-scan-bottle-input"
                  value={plainBottleName}
                  onChange={(event) => { setPlainBottleName(event.target.value); setPlainBottleDialogError(''); }}
                  required
                />
              </div>
              <div className="mb-3">
                <label htmlFor="shreno-plain-bottle-per-box" className="form-label fw-semibold">
                  Bottle per Box <span className="text-danger">*</span>
                </label>
                <input
                  id="shreno-plain-bottle-per-box"
                  type="number"
                  className="form-control incoming-scan-bottle-input"
                  value={plainBottlePerBox}
                  onChange={(event) => { setPlainBottlePerBox(event.target.value); setPlainBottleDialogError(''); }}
                  min="1"
                  step="1"
                  required
                />
              </div>
              {plainBottleDialogError && <div className="alert alert-danger py-2" role="alert">{plainBottleDialogError}</div>}
              <div className="d-flex flex-wrap justify-content-end gap-2">
                <button type="button" className="btn incoming-scan-bottle-secondary" onClick={() => advancePlainBottleQueue()} disabled={savingPlainBottle}>
                  Skip
                </button>
                <button type="button" className="btn incoming-scan-bottle-secondary" onClick={closePlainBottleDialog} disabled={savingPlainBottle}>
                  Close
                </button>
                <button type="submit" className="btn incoming-scan-bottle-primary" disabled={savingPlainBottle}>
                  {savingPlainBottle ? 'Saving...' : 'Create and select'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <label className="form-label fw-semibold">Plain Bottle name</label>
              <Select
                autoFocus
                options={[
                  { label: `SHRENO bottles`, options: plainBottleOptions },
                  ...(otherBottles.length ? [{ label: 'Other bottles', options: otherBottles }] : []),
                ]}
                value={plainBottleSelection}
                onChange={(selection) => { setPlainBottleSelection(selection); setPlainBottleDialogError(''); }}
                onInputChange={handleInputChangeBottle}
                isLoading={searchLoading || companyBottleOptions.loading}
                isSearchable
                placeholder="Search company bottles or other bottles..."
                noOptionsMessage={() => searchLoading ? 'Searching...' : 'No bottles found'}
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 1080 }),
                  menu: (base) => ({ ...base, zIndex: 1080, backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }),
                  control: (base, state) => ({
                    ...base,
                    backgroundColor: 'var(--card-bg)',
                    borderColor: state.isFocused ? 'var(--accent)' : 'var(--card-border)',
                    boxShadow: state.isFocused ? '0 0 0 0.2rem var(--accent-glow)' : 'none',
                  }),
                  input: (base) => ({ ...base, color: 'var(--text-primary)' }),
                  singleValue: (base) => ({ ...base, color: 'var(--text-primary)' }),
                  placeholder: (base) => ({ ...base, color: 'var(--text-muted)' }),
                  groupHeading: (base) => ({ ...base, color: 'var(--text-muted)' }),
                  option: (base, state) => ({
                    ...base,
                    backgroundColor: state.isSelected ? 'var(--accent)' : state.isFocused ? 'var(--body-bg)' : 'var(--card-bg)',
                    color: state.isSelected ? '#ffffff' : 'var(--text-primary)',
                  }),
                }}
              />
              {plainBottleDialogError && <div className="alert alert-danger py-2 mt-3" role="alert">{plainBottleDialogError}</div>}
              <div className="d-flex flex-wrap justify-content-end gap-2 mt-4">
                <button type="button" className="btn incoming-scan-bottle-secondary" onClick={() => advancePlainBottleQueue()} disabled={savingPlainBottle}>
                  Skip
                </button>
                <button type="button" className="btn incoming-scan-bottle-secondary" onClick={closePlainBottleDialog} disabled={savingPlainBottle}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn incoming-scan-bottle-primary"
                  onClick={handleSelectScannedBottle}
                  disabled={!plainBottleSelection || savingPlainBottle}
                >
                  {savingPlainBottle ? 'Saving...' : 'Select bottle'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}
