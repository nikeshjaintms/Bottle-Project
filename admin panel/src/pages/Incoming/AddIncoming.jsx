import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { createIncoming, fetchIncomingPlainBottleOptions } from '../../redux/slices/incomingSlice';
import { parseChallan } from '../../redux/slices/visionSlice';
import API from '../../services/api';
import { PO_REQUIRED_COMPANY } from '../../config/incomingConfig';
import Swal from 'sweetalert2';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';

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

const getBottleLabel = (bottleRef, bottlePerBoxes = []) => {
  const bottleId = typeof bottleRef === 'object' ? bottleRef?._id : bottleRef;
  const bottle = bottlePerBoxes.find((entry) => String(entry._id) === String(bottleId));
  if (bottle) return bottle.plainBottleName || bottle.bottleName || '';
  if (typeof bottleRef === 'object') return bottleRef?.plainBottleName || bottleRef?.bottleName || '';
  return typeof bottleRef === 'string' && !/^[a-f\d]{24}$/i.test(bottleRef) ? bottleRef : '';
};

const matchBottleOption = (item, options, bottlePerBoxes = []) => {
  const bottleRef = item?.bottleId;
  const bottleId = typeof bottleRef === 'object' ? bottleRef?._id : bottleRef;
  const byId = options.find((option) => option.value === String(bottleId || ''));
  if (byId) return byId;
  const bottle = bottlePerBoxes.find((entry) => String(entry._id) === String(bottleId || ''));
  const names = [
    bottleRef?.plainBottleName,
    bottleRef?.bottleName,
    bottle?.plainBottleName,
    bottle?.bottleName,
    ...(bottle?.bottleNames || []),
    item?.bottleName,
    item?.suggestedName,
    typeof bottleRef === 'string' && !/^[a-f\d]{24}$/i.test(bottleRef) ? bottleRef : '',
  ].map(normalizeBottleName).filter(Boolean);
  return options.find((option) => names.includes(normalizeBottleName(option.label))) || null;
};

const getScannedBottleHint = (item, bottlePerBoxes = []) =>
  getBottleLabel(item?.bottleId, bottlePerBoxes) ||
  item?.bottleName ||
  item?.suggestedName ||
  item?.textLine ||
  '';

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
  const { plainBottleOptionsByCompany } = useSelector(state => state.incoming);
  const { items: bottlePerBoxes } = useSelector(state => state.bottlePerBox);
  const { loading: visionLoading } = useSelector(state => state.vision);
  const companyOptions = useMemo(() => (companies || [])
    .filter((company) => company?._id && company?.name)
    .slice()
    .sort((a, b) => a.name.trim().localeCompare(b.name.trim(), undefined, { numeric: true, sensitivity: 'base' }))
    .map((company) => ({ value: company._id, label: company.name })), [companies]);

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
  const itemsRef = useRef(items);
  const nextScanRowId = useRef(0);
  const shownWarningKeys = useRef(new Set());
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [clearedBottleCount, setClearedBottleCount] = useState(0);
  const [otherBottles, setOtherBottles] = useState([]); // Results from /bottle-per-box/search
  const [searchLoading, setSearchLoading] = useState(false); // Loading indicator for debounced search
  const [creatingBottle, setCreatingBottle] = useState(false); // Pending flag to prevent double-submission
  const [createErrors, setCreateErrors] = useState({}); // Map of index -> error message
  const [plainBottleDialog, setPlainBottleDialog] = useState(null);
  const [plainBottleDialogTab, setPlainBottleDialogTab] = useState('create');
  const [plainBottleName, setPlainBottleName] = useState('');
  const [plainBottlePerBox, setPlainBottlePerBox] = useState('');
  const [plainBottleSelection, setPlainBottleSelection] = useState(null);
  const [plainBottleDialogError, setPlainBottleDialogError] = useState('');
  const [savingPlainBottle, setSavingPlainBottle] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem('incomingLanguage') === 'gu' ? 'gu' : 'en');
  const previousCompanyId = useRef('');
  const companyBottleResult = plainBottleOptionsByCompany[formData.billToId] || {};
  const companyBottleOptions = companyBottleResult.options || [];
  const companyBottleError = companyBottleResult.error || '';
  const loadingCompanyBottles = Boolean(formData.billToId && (companyBottleResult.loading || !companyBottleResult.loaded));
  const labels = useMemo(() => language === 'gu' ? {
    toggle: 'English',
    warningTitle: 'પ્લેઈન બોટલ ઉપલબ્ધ નથી',
    warningText: (company) => `${company} માટે આ બોટલો ઉપલબ્ધ નથી:`,
    okay: 'બરાબર',
    add: 'ઉમેરો',
    andMore: (count) => `અને ${count} વધુ`,
    dialogTitle: 'સ્કેન કરેલી પ્લેઈન બોટલ ઉકેલો',
    original: 'સ્કેન કરેલું નામ:',
    createTab: 'નવી પ્લેઈન બોટલ બનાવો',
    selectTab: 'બીજી બોટલ પસંદ કરો',
    plainName: 'પ્લેઈન બોટલનું નામ',
    bottlePerBox: 'બોક્સ દીઠ બોટલ',
    cancel: 'રદ કરો',
    close: 'બંધ કરો',
    skip: 'છોડી દો',
    createSelect: 'બનાવો અને પસંદ કરો',
    selectBottle: 'બોટલ પસંદ કરો',
    saving: 'સાચવી રહ્યા છીએ…',
    searchPlaceholder: 'કંપનીની અથવા અન્ય બોટલ શોધો...',
    noBottles: 'કોઈ પ્લેઈન બોટલ મળી નથી',
    searching: 'બોટલ શોધી રહ્યા છીએ…',
    rowOf: (row, total) => `રો ${row} / ${total}`,
    rowLabel: 'રો',
    companyBottles: (company) => `${company} ની બોટલો`,
    otherBottles: 'અન્ય બોટલો',
    requiredName: 'પ્લેઈન બોટલનું નામ જરૂરી છે.',
    requiredCount: 'બોક્સ દીઠ બોટલની સંખ્યા 0 કરતાં મોટી પૂર્ણાંક હોવી જોઈએ.',
  } : {
    toggle: 'ગુજરાતી',
    warningTitle: 'Plain bottle not available',
    warningText: (company) => `These bottles are not available for ${company}:`,
    okay: 'Okay',
    add: 'Add',
    andMore: (count) => `and ${count} more`,
    dialogTitle: 'Resolve scanned plain bottle',
    original: 'Original scanned text:',
    createTab: 'Create new plain bottle',
    selectTab: 'Select a different bottle',
    plainName: 'Plain Bottle name',
    bottlePerBox: 'Bottle per Box',
    cancel: 'Cancel',
    close: 'Close',
    skip: 'Skip',
    createSelect: 'Create and select',
    selectBottle: 'Select bottle',
    saving: 'Saving…',
    searchPlaceholder: 'Search company bottles or other bottles...',
    noBottles: 'No plain bottles found',
    searching: 'Searching bottles…',
    rowOf: (row, total) => `Row ${row} of ${total}`,
    rowLabel: 'Row',
    companyBottles: (company) => `${company} bottles`,
    otherBottles: 'Other bottles',
    requiredName: 'Plain Bottle name is required.',
    requiredCount: 'Bottle per Box must be a whole number greater than 0.',
  }, [language]);

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: "false" }));
    dispatch(fetchBottlePerBoxes({ pagination: "false" }));
  }, [dispatch]);

  useEffect(() => {
    localStorage.setItem('incomingLanguage', language);
  }, [language]);

  // Cleanup state on company change (prevent stale search results from showing in wrong company)
  useEffect(() => {
    setOtherBottles([]);
    setSearchLoading(false);
    setCreateErrors({});
  }, [formData.billToId]);

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
    if (name === 'billToId') {
      if (value !== formData.billToId) shownWarningKeys.current.clear();
      setClearedBottleCount(0);
      if (!value) {
        const cleared = items.filter((item) => item.bottleId).length;
        const nextItems = items.map((item) => ({
          ...item,
          bottleId: '',
          bottleLabel: '',
          bottleHint: item.scanModeRow ? item.scanBottleText || item.bottleHint || '' : '',
        }));
        itemsRef.current = nextItems;
        setItems(nextItems);
        setClearedBottleCount(cleared);
        previousCompanyId.current = '';
      }
    }
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

    if (field === 'bottleId') {
      newItems[index].bottleLabel = companyBottleOptions.find((option) => option.value === String(value))?.label || '';
      newItems[index].bottleHint = '';
      if (newItems[index].scanModeRow) {
        newItems[index].scanUserResolved = Boolean(value);
      }

      // Auto-populate qty when bottleId changes
      if (value) {
        // value could be a plainBottleName (string) or an ObjectId
        let foundBox = bottlePerBoxes?.find(b => b._id === value);
        if (!foundBox && typeof value === 'string') {
          // Try matching by plainBottleName (global search result or newly created)
          foundBox = bottlePerBoxes?.find(b => 
            (b.plainBottleName || b.bottleName || '').toLowerCase() === value.toLowerCase()
          );
        }
        if (foundBox && foundBox.bottlePerBox != null && foundBox.bottlePerBox > 0) {
          // Auto-fill only if Qty/Box is empty
          if (!newItems[index].qty) {
            newItems[index].qty = foundBox.bottlePerBox;
          }
        }
      }
    }

    // Show toast notification when box value is entered (for newly created bottles)
    if (field === 'box' && value && newItems[index].bottleId && newBottlesToCreate[index]) {
      Swal.fire({
        position: 'top-right',
        icon: 'info',
        title: 'BottlePerBox Entry',
        text: 'Bottle per box recorded',
        timer: 1500,
        timerProgressBar: true,
        showConfirmButton: false,
        toast: true
      });
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

  // Debounced global bottle search (called by CreatableSelect onInputChange)
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
        
        // Handle actual API response format: { success, data: [...] }
        const items = data.data || data.items || (Array.isArray(data) ? data : []);
        if (!Array.isArray(items)) {
          setOtherBottles([]);
          return;
        }
        
        // Filter out company bottles to show only "Other Bottles"
        const companyBottleValues = new Set(companyBottleOptions.map(b => (b.plainBottleName || b.value || '').toLowerCase()));
        const otherBottlesList = (items || []).filter(item => {
          const itemName = (item.plainBottleName || item.bottleName || item.name || '').toLowerCase();
          return !companyBottleValues.has(itemName);
        }).map(item => ({
          value: item.plainBottleName || item.bottleName || item.name,
          label: item.plainBottleName || item.bottleName || item.name,
          plainBottleName: item.plainBottleName || item.bottleName || item.name,
          bottlePerBox: item.bottlePerBox || 0,
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
  }, [companyBottleOptions]);

  const handleInputChangeBottle = (inputValue) => {
    // If input becomes too short, immediately clear results
    if (!inputValue || inputValue.trim().length < 2) {
      setOtherBottles([]);
      if (debouncedSearch.cancel) {
        debouncedSearch.cancel(); // Cancel pending debounce if supported
      }
    } else {
      // Check if there are matches in company bottles first
      const companyMatches = companyBottleOptions.filter(opt => 
        (opt.label || '').toLowerCase().includes(inputValue.toLowerCase())
      );
      
      // If company matches exist, don't search globally
      if (companyMatches.length > 0) {
        setOtherBottles([]);
        if (debouncedSearch.cancel) {
          debouncedSearch.cancel();
        }
      } else {
        // No company matches, search globally
        debouncedSearch(inputValue);
      }
    }
  };

  // Memoize combined + deduplicated bottle options
  const optionsList = useMemo(() => {
    const combined = [...companyBottleOptions, ...otherBottles];
    const seen = new Set();
    return combined
      .filter(opt => {
        if (seen.has(opt.value)) return false;
        seen.add(opt.value);
        return true;
      })
      .sort((a, b) => {
        // Company bottles first, then other bottles
        if (a.isOtherBottle !== b.isOtherBottle) {
          return a.isOtherBottle ? 1 : -1;
        }
        return (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [companyBottleOptions, otherBottles]);
  const optionsListRef = useRef(optionsList);
  const labelsRef = useRef(labels);
  const companiesRef = useRef(companies);
  useEffect(() => {
    optionsListRef.current = optionsList;
    labelsRef.current = labels;
    companiesRef.current = companies;
  }, [optionsList, labels, companies]);

  const openPlainBottleQueue = useCallback((rows) => {
    const rowIds = rows.map(({ item }) => item.scanRowId).filter(Boolean);
    const firstItem = rows[0]?.item;
    if (!rowIds.length || !firstItem) return;
    const index = itemsRef.current.findIndex((item) => item.scanRowId === rowIds[0]);
    if (index < 0) return;
    const scannedText = firstItem.scanBottleText || '';
    const cleanedName = getCleanScannedBottleName(scannedText);
    const matchingOption = optionsListRef.current.find(
      (option) => normalizeBottleName(option.label) === normalizeBottleName(cleanedName)
    );
    setPlainBottleDialog({ rowIds, position: 0, index, scannedText });
    setPlainBottleDialogTab('create');
    setPlainBottleName(cleanedName);
    setPlainBottlePerBox(Number.isInteger(Number(firstItem.qty)) && Number(firstItem.qty) > 0 ? String(firstItem.qty) : '');
    setPlainBottleSelection(matchingOption || null);
    setPlainBottleDialogError('');
  }, []);

  const showPlainBottleWarning = useCallback((rows, companyId, companyNameOverride) => {
    if (!companyId || rows.length === 0) return;
    const rowIds = rows.map(({ item }) => item.scanRowId).filter(Boolean).sort();
    const warningKey = `${companyId}:${rowIds.join(',')}`;
    if (!rowIds.length || shownWarningKeys.current.has(warningKey)) return;
    shownWarningKeys.current.add(warningKey);

    const currentLabels = labelsRef.current;
    const companyName = companyNameOverride ||
      companiesRef.current?.find((company) => company._id === companyId)?.name ||
      'selected company';
    const visibleRows = rows.slice(0, 5)
      .map(({ item, index }) => `${currentLabels.rowLabel} ${index + 1}: ${escapeHtml(item.scanBottleText)}`)
      .join('<br/>');
    const moreRows = rows.length > 5
      ? `<br/>${escapeHtml(currentLabels.andMore(rows.length - 5))}`
      : '';

    Swal.fire({
      icon: 'warning',
      title: currentLabels.warningTitle,
      html: `${escapeHtml(currentLabels.warningText(companyName))}<br/>${visibleRows}${moreRows}`,
      showConfirmButton: true,
      confirmButtonText: currentLabels.okay,
      showDenyButton: true,
      denyButtonText: currentLabels.add,
      focusDeny: true,
      allowEscapeKey: true,
      allowOutsideClick: true,
      reverseButtons: true,
      customClass: { popup: 'incoming-bottle-warning-popup' },
    }).then((result) => {
      if (result.isDenied) openPlainBottleQueue(rows);
    });
  }, [openPlainBottleQueue]);

  useEffect(() => {
    let active = true;
    const companyId = formData.billToId;
    const companyChanged = previousCompanyId.current !== companyId;

    if (!companyId) return () => { active = false; };

    dispatch(fetchIncomingPlainBottleOptions(companyId)).unwrap()
      .then(({ options }) => {
        if (!active) return;
        previousCompanyId.current = companyId;
        if (companyChanged) {
          const optionsByName = new Map(options.map((option) => [normalizeBottleName(option.label), option]));
          const cleared = itemsRef.current.filter((item) => {
            const scannedMatch = item.scanModeRow
              ? matchBottleOption({ bottleName: item.scanBottleText }, options, bottlePerBoxes)
              : null;
            const bottleId = typeof item.bottleId === 'object' ? item.bottleId?._id : item.bottleId;
            const bottleName = item.bottleLabel || getBottleLabel(item.bottleId);
            return item.bottleId && !options.some((option) => option.value === String(bottleId)) &&
              !optionsByName.has(normalizeBottleName(bottleName)) && !scannedMatch;
          }).length;
          const nextItems = itemsRef.current.map((item) => {
            if (item.scanModeRow) {
              const bottleId = typeof item.bottleId === 'object' ? item.bottleId?._id : item.bottleId;
              if (item.scanUserResolved && item.bottleId &&
                options.some((option) => option.value === String(bottleId))) return item;
              const matchingOption = matchBottleOption({ bottleName: item.scanBottleText }, options, bottlePerBoxes);
              if (matchingOption) {
                return { ...item, bottleId: matchingOption.value, bottleLabel: matchingOption.label, bottleHint: '' };
              }
              return {
                ...item,
                bottleId: '',
                bottleLabel: '',
                bottleHint: item.scanBottleText || item.bottleHint || '',
              };
            }
            if (!item.bottleId) return item;
            const bottleId = typeof item.bottleId === 'object' ? item.bottleId?._id : item.bottleId;
            const bottleName = item.bottleLabel || getBottleLabel(item.bottleId);
            if (options.some((option) => option.value === String(bottleId))) return item;
            const matchingOption = optionsByName.get(normalizeBottleName(bottleName));
            if (matchingOption) return { ...item, bottleId: matchingOption.value, bottleLabel: matchingOption.label, bottleHint: '' };
            return { ...item, bottleId: '', bottleLabel: '', bottleHint: '' };
          });
          itemsRef.current = nextItems;
          setItems(nextItems);
          setClearedBottleCount(cleared);
          const unresolvedRows = nextItems
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.scanModeRow && !item.bottleId && item.scanBottleText);
          showPlainBottleWarning(unresolvedRows, companyId);
        }
      })
      .catch(() => {
        if (!active) return;
        if (companyChanged) {
          setClearedBottleCount(itemsRef.current.filter((item) => item.bottleId).length);
          setItems((currentItems) => currentItems.map((item) => ({
            ...item,
            bottleId: '',
            bottleLabel: '',
            bottleHint: item.scanModeRow ? item.scanBottleText || item.bottleHint || '' : '',
          })));
        }
        previousCompanyId.current = companyId;
      });
    return () => { active = false; };
  }, [dispatch, formData.billToId, showPlainBottleWarning, bottlePerBoxes]);

  // Store newly created bottle names to create when saving
  const [newBottlesToCreate, setNewBottlesToCreate] = useState({});

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

    // Set bottleId to the bottle name (temporary, will be replaced with ID after creation)
    handleItemChange(index, 'bottleId', bottleName);
    
    // Clear any previous error for this item
    setCreateErrors(prev => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const setPlainBottleQueueStep = (rowIds, position, availableOptions = optionsList) => {
    let nextPosition = position;
    let nextRowIndex = -1;
    let nextItem;
    while (nextPosition < rowIds.length) {
      nextRowIndex = itemsRef.current.findIndex((item) => item.scanRowId === rowIds[nextPosition]);
      nextItem = nextRowIndex >= 0 ? itemsRef.current[nextRowIndex] : null;
      if (nextItem?.scanModeRow && !nextItem.bottleId) break;
      nextPosition += 1;
    }
    if (nextPosition >= rowIds.length || !nextItem) {
      setPlainBottleDialog(null);
      return;
    }

    const scannedText = nextItem.scanBottleText || '';
    const cleanedName = getCleanScannedBottleName(scannedText);
    const matchingOption = availableOptions.find(
      (option) => normalizeBottleName(option.label) === normalizeBottleName(cleanedName)
    );
    setPlainBottleDialog({ rowIds, position: nextPosition, index: nextRowIndex, scannedText });
    setPlainBottleDialogTab('create');
    setPlainBottleName(cleanedName);
    setPlainBottlePerBox(Number.isInteger(Number(nextItem.qty)) && Number(nextItem.qty) > 0 ? String(nextItem.qty) : '');
    setPlainBottleSelection(matchingOption || null);
    setPlainBottleDialogError('');
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

  const applyBottleToScannedRow = (bottle, fallbackBottlePerBox, rowIndex, fallbackName) => {
    const bottleId = String(bottle._id || bottle.id || '');
    const bottleLabel = bottle.plainBottleName || bottle.bottleName || bottle.name || fallbackName || '';
    const bottlePerBox = Number(bottle.bottlePerBox) > 0
      ? Number(bottle.bottlePerBox)
      : Number(fallbackBottlePerBox) > 0 ? Number(fallbackBottlePerBox) : '';

    const nextItems = itemsRef.current.map((item, index) => {
      if (index !== rowIndex) return item;
      const nextItem = {
        ...item,
        bottleId,
        bottleLabel,
        bottleHint: '',
        scanUserResolved: true,
      };
      if (bottlePerBox) nextItem.qty = bottlePerBox;
      const totalQty = Number(nextItem.totalQty) || 0;
      const boxes = Number(nextItem.box) || 0;
      const qty = Number(nextItem.qty) || 0;
      if (totalQty > 0 && qty > 0) {
        nextItem.box = parseFloat((totalQty / qty).toFixed(2));
      } else if (boxes > 0 && qty > 0) {
        nextItem.totalQty = parseFloat((boxes * qty).toFixed(2));
      }
      return nextItem;
    });
    itemsRef.current = nextItems;
    setItems(nextItems);
  };

  const handleCreateScannedBottle = async (event) => {
    event?.preventDefault();
    if (!plainBottleDialog || savingPlainBottle) return;

    const name = plainBottleName.trim().replace(/\s+/g, ' ');
    const bottlePerBox = Number(plainBottlePerBox);
    if (!name) {
      setPlainBottleDialogError(labels.requiredName);
      return;
    }
    if (!Number.isInteger(bottlePerBox) || bottlePerBox <= 0) {
      setPlainBottleDialogError(labels.requiredCount);
      return;
    }

    setSavingPlainBottle(true);
    setPlainBottleDialogError('');
    try {
      const response = await API.post('/incoming/create-bottle', {
        companyId: formData.billToId,
        plainBottleName: name,
        bottlePerBox,
      });
      const bottle = response.data?.data;
      if (!bottle?._id) {
        throw new Error('Bottle creation did not return a plain bottle record.');
      }

      applyBottleToScannedRow(bottle, bottlePerBox, plainBottleDialog.index, name);
      const { options } = await dispatch(fetchIncomingPlainBottleOptions(formData.billToId)).unwrap();
      dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
      advancePlainBottleQueue(plainBottleDialog.position + 1, options);
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
      const masterBottle = bottlePerBoxes.find((entry) =>
        String(entry._id) === String(plainBottleSelection.value) ||
        normalizeBottleName(entry.plainBottleName || entry.bottleName) === normalizeBottleName(plainBottleSelection.label)
      );
      let bottle = plainBottleSelection.bottlePerBoxData || masterBottle || {
        _id: plainBottleSelection.value,
        plainBottleName: plainBottleSelection.label,
        bottlePerBox: plainBottleSelection.bottlePerBox,
      };
      if (plainBottleSelection.isOtherBottle) {
        const response = await API.post('/incoming/create-bottle', {
          companyId: formData.billToId,
          plainBottleName: plainBottleSelection.label,
          associateWithBrands: true,
          ...(Number(plainBottleSelection.bottlePerBox) > 0
            ? { bottlePerBox: Number(plainBottleSelection.bottlePerBox) }
            : {}),
        });
        bottle = response.data?.data;
        if (!bottle?._id) {
          throw new Error('Bottle linking did not return a plain bottle record.');
        }
        const { options } = await dispatch(fetchIncomingPlainBottleOptions(formData.billToId)).unwrap();
        dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
        applyBottleToScannedRow(
          bottle,
          plainBottleSelection.bottlePerBox,
          plainBottleDialog.index,
          plainBottleSelection.label
        );
        advancePlainBottleQueue(plainBottleDialog.position + 1, options);
        return;
      }

      applyBottleToScannedRow(
        bottle,
        plainBottleSelection.bottlePerBox,
        plainBottleDialog.index,
        plainBottleSelection.label
      );
      advancePlainBottleQueue(plainBottleDialog.position + 1);
    } catch (error) {
      setPlainBottleDialogError(
        error.response?.data?.message || error.message || 'Could not select this plain bottle.'
      );
    } finally {
      setSavingPlainBottle(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.billToId || !formData.documentDate) {
      return Swal.fire('Error', 'Please fill required fields (Date, Bill To)', 'error');
    }

    if (isPoRequired) {
      if (!formData.poDate || !formData.poNo) {
        return Swal.fire('Error', 'PO Date and PO No are mandatory for the selected company.', 'error');
      }
    }
    
    const validItems = items
      .filter(i => i.bottleId && i.qty > 0)
      .map((item) => {
        const savedItem = { ...item };
        delete savedItem.bottleLabel;
        delete savedItem.bottleHint;
        delete savedItem.scanModeRow;
        delete savedItem.scanBottleText;
        delete savedItem.scanUserResolved;
        delete savedItem.scanRowId;
        return savedItem;
      });
    if (validItems.length === 0) {
      return Swal.fire('Error', 'Please add at least one valid item with quantity > 0', 'error');
    }
    
    const bottleNames = validItems.map(i => i.bottleId).filter(Boolean);
    const uniqueBottles = new Set(bottleNames);
    if (uniqueBottles.size !== bottleNames.length) {
      return Swal.fire('Error', 'Duplicate bottles found! You cannot add the same bottle multiple times in a single challan.', 'error');
    }

    // Note: validItems now contains either:
    // - ObjectIds (if selected from company/global bottles)
    // - String names (if created new via CreatableSelect)
    // The backend will auto-create bottles from string names

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
        // Show success SweetAlert modal (centered, not toast)
        Swal.fire({
          position: 'center',
          icon: 'success',
          title: 'Success!',
          text: 'Incoming recorded and stock updated successfully',
          confirmButtonText: 'OK'
        }).then(() => {
          navigate(-1);
        });
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
        const option = matchBottleOption(item, companyBottleOptions, bottlePerBoxes);
        let defaultQty = 1;
        const foundBox = option && bottlePerBoxes?.find(b => String(b._id) === option.value);
        if (foundBox && foundBox.bottlePerBox != null && foundBox.bottlePerBox > 0) {
          defaultQty = foundBox.bottlePerBox;
        }
        
        let defaultBox;
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
          bottleId: option?.value || '',
          bottleLabel: option?.label || '',
          bottleHint: option ? '' : getScannedBottleHint(item, bottlePerBoxes),
          scanModeRow: true,
          scanBottleText: getScannedBottleHint(item, bottlePerBoxes),
          scanUserResolved: false,
          scanRowId: `scan-${++nextScanRowId.current}`,
          box: defaultBox,
          qty: defaultQty,
          totalQty: defaultTotalQty,
        };
      });
      (res.unmatchedItems || []).forEach((item) => {
        itemsToSet.push({
          bottleId: '',
          bottleHint: getScannedBottleHint(item, bottlePerBoxes),
          scanModeRow: true,
          scanBottleText: getScannedBottleHint(item, bottlePerBoxes),
          scanUserResolved: false,
          scanRowId: `scan-${++nextScanRowId.current}`,
          box: item.box || '',
          qty: item.qty || 1,
          totalQty: item.totalQty || '',
        });
      });
      const replaceEmptyRow = items.length === 1 && !items[0].bottleId && !items[0].qty;
      const nextItems = replaceEmptyRow && itemsToSet.length > 0 ? itemsToSet : [...items, ...itemsToSet];
      itemsRef.current = nextItems;
      setItems(nextItems);
      const firstAddedIndex = replaceEmptyRow ? 0 : items.length;
      const unmatchedRows = itemsToSet
        .map((item, index) => ({ item, index: firstAddedIndex + index }))
        .filter(({ item }) => item.scanModeRow && !item.bottleId && item.scanBottleText);
      if (unmatchedRows.length) {
        if (formData.billToId) showPlainBottleWarning(unmatchedRows, formData.billToId);
      } else {
        Swal.fire({ icon: 'success', title: 'Invoice Parsed', text: 'Appended ' + itemsToSet.length + ' items from new document.' });
      }
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
      const scannedCompanyId = res.billToId || '';
      const { options: scannedBottleOptions } = scannedCompanyId
        ? await dispatch(fetchIncomingPlainBottleOptions(scannedCompanyId)).unwrap()
        : { options: [] };
      previousCompanyId.current = scannedCompanyId;
      setFormData(prev => ({ 
        ...prev, 
        deliveryNumber: res.deliveryNumber || '',
        documentDate: res.documentDate || prev.documentDate,
        billToId: scannedCompanyId,
        poNo: res.poNo || '',
        poDate: res.poDate || ''
      }));

      const matchIsShreno = res.billToId === PO_REQUIRED_COMPANY.id || companies?.find(c => c._id === res.billToId)?.name?.toLowerCase().includes('shreno');

      const itemsToSet = (res.items || []).map(item => {
        const option = matchBottleOption(item, scannedBottleOptions, bottlePerBoxes);
        let defaultQty = 1;
        const foundBox = option && bottlePerBoxes?.find(b => String(b._id) === option.value);
        if (foundBox && foundBox.bottlePerBox != null && foundBox.bottlePerBox > 0) {
          defaultQty = foundBox.bottlePerBox;
        }

        let defaultBox;
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
          bottleId: option?.value || '',
          bottleLabel: option?.label || '',
          bottleHint: option ? '' : getScannedBottleHint(item, bottlePerBoxes),
          scanModeRow: true,
          scanBottleText: getScannedBottleHint(item, bottlePerBoxes),
          scanUserResolved: false,
          scanRowId: `scan-${++nextScanRowId.current}`,
          box: defaultBox,
          qty: defaultQty,
          totalQty: defaultTotalQty
        };
      });

      // Filter out obvious OCR noise and document metadata from unmatched items
      const filteredUnmatchedItems = filterNoiseItems(res.unmatchedItems);

      let warningText = '';
      if (filteredUnmatchedItems && filteredUnmatchedItems.length > 0) {
        const unmatchedNames = filteredUnmatchedItems.map(i => i.suggestedName).join(', ');
        warningText = `<br/><br/><b style='color:#e63946;'>Warning:</b> Found ${filteredUnmatchedItems.length} item(s) on the invoice that do not match any bottle in the database: ${unmatchedNames}.`;
        filteredUnmatchedItems.forEach((item) => {
          itemsToSet.push({
            bottleId: '',
            bottleHint: getScannedBottleHint(item, bottlePerBoxes),
            scanModeRow: true,
            scanBottleText: getScannedBottleHint(item, bottlePerBoxes),
            scanUserResolved: false,
            scanRowId: `scan-${++nextScanRowId.current}`,
            box: item.box || '',
            qty: item.qty || 1,
            totalQty: item.totalQty || '',
          });
        });
      }

      if (itemsToSet.length > 0) {
        itemsRef.current = itemsToSet;
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

        const unresolvedRows = itemsToSet
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.scanModeRow && !item.bottleId && item.scanBottleText);
        if (unresolvedRows.length && scannedCompanyId) {
          showPlainBottleWarning(unresolvedRows, scannedCompanyId, res.billToName);
        } else if (unresolvedRows.length === 0) {
          Swal.fire({
            icon: missingFields.length > 0 ? 'warning' : 'success',
            title: missingFields.length > 0 ? 'Partial Match / Missing Fields' : 'Invoice Parsed',
            html: `Found Delivery No: <b>${res.deliveryNumber || 'N/A'}</b>, Bill To: <b>${res.billToName || 'N/A'}</b>.<br/>Matched ${res.items?.length || 0} items! ${warningText}`,
            showConfirmButton: true
          });
        }
        setMode('manual');
      } else {
        Swal.fire('Warning', 'No matching bottle names could be detected from this invoice. Please enter them manually.', 'warning').then(() => setMode('manual'));
      }
    } catch (error) {
      Swal.fire('Error', error || 'Failed to parse invoice', 'error');
    }
  };

  const grandTotal = items.reduce((acc, curr) => acc + (Number(curr.totalQty) || 0), 0);
  const selectedCompanyName = companies?.find((company) => company._id === formData.billToId)?.name || 'selected company';

  return (
    <>
    <div className="page-content incoming-module-page incoming-module-form">
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
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary rounded-pill"
            onClick={() => setLanguage(language === 'en' ? 'gu' : 'en')}
          >
            {labels.toggle}
          </button>
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
        <form onSubmit={handleSubmit} className="incoming-entry-form">
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
                options={companyOptions}
                value={companyOptions.find(opt => opt.value === formData.billToId) || null}
                onChange={(selected) => handleInputChange({ target: { name: 'billToId', value: selected?.value || '' } })}
                placeholder="Select Company"
                isClearable
                styles={{
                  control: (base) => ({ ...base, borderRadius: '8px', minHeight: '38px', borderColor: 'var(--bs-border-color)' })
                }}
              />
              {clearedBottleCount > 0 && (
                <small className="text-muted d-block mt-1">
                  {clearedBottleCount} bottle selection(s) cleared because they are not available for this company.
                </small>
              )}
              {companyBottleError && <small className="text-danger d-block mt-1">{companyBottleError}</small>}
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

          <div className="table-responsive mb-3 incoming-entry-table">
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
                      <div className="d-flex gap-2 align-items-stretch">
                        <div style={{flex: 1}}>
                          <CreatableSelect 
                            options={optionsList}
                            value={(() => {
                              const currentVal = item.bottleId;
                              if (!currentVal) return null;
                              // Try to find by ID first (company bottle)
                              const byId = companyBottleOptions.find(o => o.value === String(currentVal));
                              if (byId) return byId;
                              // Try by name (global bottle or manually entered string)
                              const byName = [...companyBottleOptions, ...otherBottles].find(o =>
                                o.value === currentVal || o.label === currentVal
                              );
                              return byName || (currentVal ? { value: currentVal, label: item.bottleLabel || currentVal } : null);
                            })()}
                            onChange={(selected) => handleItemChange(index, 'bottleId', selected?.value || '')}
                            onCreateOption={(inputValue) => handleCreateBottle(inputValue, index)}
                            onInputChange={handleInputChangeBottle}
                            isDisabled={!formData.billToId || creatingBottle} // Disable during bottle creation
                            placeholder={formData.billToId ? "Select or type new bottle..." : "Select company first..."}
                            isClearable
                            isSearchable
                            closeMenuOnScroll={true}
                            menuPosition="fixed"
                            menuPlacement="auto"
                            menuPortalTarget={document.body}
                            formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                            styles={{
                              menuPortal: base => ({ ...base, zIndex: 9999 }),
                              control: base => ({
                                ...base,
                                borderColor: item.scanModeRow && !item.bottleId && formData.billToId
                                  ? '#dc3545'
                                  : 'var(--bs-border-color-subtle, #dee2e6)',
                                boxShadow: item.scanModeRow && !item.bottleId && formData.billToId
                                  ? '0 0 0 1px #dc3545'
                                  : 'none',
                                borderRadius: '0.375rem',
                                minHeight: '31px',
                                fontSize: '0.875rem'
                              })
                            }}
                            classNamePrefix="bottle-select"
                          />
                          {createErrors[index] && (
                            <small className="d-block text-danger mt-1">{createErrors[index]}</small>
                          )}
                          {item.bottleHint && !item.scanModeRow && (
                            <small className="text-warning-emphasis d-block mt-1">
                              Scanned bottle: {item.bottleHint}. Choose a plain bottle for the selected company.
                            </small>
                          )}
                        </div>
                      </div>
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
          aria-labelledby="plain-bottle-dialog-title"
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
              <h5 id="plain-bottle-dialog-title" className="fw-bold mb-1">{labels.dialogTitle}</h5>
              <div className="text-primary small fw-semibold mb-2">
                {labels.rowOf(plainBottleDialog.position + 1, plainBottleDialog.rowIds.length)}
              </div>
              <div className="text-muted small">
                {labels.original} <span className="fw-semibold">{plainBottleDialog.scannedText}</span>
              </div>
            </div>
            <button
              type="button"
              className="incoming-scan-bottle-close"
              aria-label={labels.cancel}
              onClick={() => advancePlainBottleQueue()}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>

          <div className="btn-group w-100 mb-3" role="tablist"           aria-label={labels.dialogTitle}>
            <button
              type="button"
              role="tab"
              aria-selected={plainBottleDialogTab === 'create'}
              className={`btn incoming-scan-bottle-tab ${plainBottleDialogTab === 'create' ? 'active' : ''}`}
              onClick={() => { setPlainBottleDialogTab('create'); setPlainBottleDialogError(''); }}
            >
              {labels.createTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={plainBottleDialogTab === 'select'}
              className={`btn incoming-scan-bottle-tab ${plainBottleDialogTab === 'select' ? 'active' : ''}`}
              onClick={() => { setPlainBottleDialogTab('select'); setPlainBottleDialogError(''); }}
            >
              {labels.selectTab}
            </button>
          </div>

          {plainBottleDialogTab === 'create' ? (
            <form onSubmit={handleCreateScannedBottle}>
              <div className="mb-3">
                <label htmlFor="plain-bottle-name" className="form-label fw-semibold">
                  {labels.plainName} <span className="text-danger">*</span>
                </label>
                <input
                  autoFocus
                  id="plain-bottle-name"
                  className="form-control incoming-scan-bottle-input"
                  value={plainBottleName}
                  onChange={(event) => { setPlainBottleName(event.target.value); setPlainBottleDialogError(''); }}
                  required
                />
              </div>
              <div className="mb-3">
                <label htmlFor="plain-bottle-per-box" className="form-label fw-semibold">
                  {labels.bottlePerBox} <span className="text-danger">*</span>
                </label>
                <input
                  id="plain-bottle-per-box"
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
                  {labels.skip}
                </button>
                <button type="button" className="btn incoming-scan-bottle-secondary" onClick={closePlainBottleDialog} disabled={savingPlainBottle}>
                  {labels.close}
                </button>
                <button type="submit" className="btn incoming-scan-bottle-primary" disabled={savingPlainBottle}>
                  {savingPlainBottle ? labels.saving : labels.createSelect}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <label className="form-label fw-semibold">{labels.plainName}</label>
              <Select
                autoFocus
                options={[
                  { label: labels.companyBottles(selectedCompanyName), options: companyBottleOptions },
                  ...(otherBottles.length ? [{ label: labels.otherBottles, options: otherBottles }] : []),
                ]}
                value={plainBottleSelection}
                onChange={(selection) => { setPlainBottleSelection(selection); setPlainBottleDialogError(''); }}
                onInputChange={handleInputChangeBottle}
                isLoading={searchLoading || loadingCompanyBottles}
                isSearchable
                placeholder={labels.searchPlaceholder}
                noOptionsMessage={() => searchLoading ? labels.searching : labels.noBottles}
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
                    color: 'var(--text-primary)',
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
                  dropdownIndicator: (base) => ({ ...base, color: 'var(--text-muted)' }),
                  clearIndicator: (base) => ({ ...base, color: 'var(--text-muted)' }),
                }}
              />
              {plainBottleDialogError && <div className="alert alert-danger py-2 mt-3" role="alert">{plainBottleDialogError}</div>}
              <div className="d-flex flex-wrap justify-content-end gap-2 mt-4">
                <button type="button" className="btn incoming-scan-bottle-secondary" onClick={() => advancePlainBottleQueue()} disabled={savingPlainBottle}>
                  {labels.skip}
                </button>
                <button type="button" className="btn incoming-scan-bottle-secondary" onClick={closePlainBottleDialog} disabled={savingPlainBottle}>
                  {labels.close}
                </button>
                <button
                  type="button"
                  className="btn incoming-scan-bottle-primary"
                  onClick={handleSelectScannedBottle}
                  disabled={!plainBottleSelection || savingPlainBottle}
                >
                  {savingPlainBottle ? labels.saving : labels.selectBottle}
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
