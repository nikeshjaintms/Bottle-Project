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
import { isPlanRowCompleted, checkRowStockWarning } from '../../utils/lacquerPlanUtils';

// Pool key: (company, plain bottle id / canonical name), strictly NO brand and NO section in the key.
const getPoolKey = (companyId, bottleName, bottlePerBoxes = []) => {
  if (!companyId || !bottleName) return null;
  const bTrim = String(bottleName).trim().toUpperCase();
  const bp = (bottlePerBoxes || []).find(b => {
    if ((b.plainBottleName || b.bottleName || '').trim().toUpperCase() === bTrim) return true;
    const names = (Array.isArray(b.bottleNames) && b.bottleNames.length > 0)
      ? b.bottleNames
      : [b.bottleName || b.plainBottleName].filter(Boolean);
    return names.some(n => n.trim().toUpperCase() === bTrim);
  });
  const canonicalName = bp ? (bp.plainBottleName || bp.bottleName || bTrim).trim().toUpperCase() : bTrim;
  const cid = String(companyId?._id || companyId || '').trim();
  return `${cid}::${canonicalName}`;
};

const getCanonicalPlainBottleName = (bottleName, bottlePerBoxes = []) => {
  if (!bottleName) return '';
  const bTrim = String(bottleName).trim().toUpperCase();
  const bp = (bottlePerBoxes || []).find(b => {
    if ((b.plainBottleName || b.bottleName || '').trim().toUpperCase() === bTrim) return true;
    const names = (Array.isArray(b.bottleNames) && b.bottleNames.length > 0)
      ? b.bottleNames
      : [b.bottleName || b.plainBottleName].filter(Boolean);
    return names.some(n => n.trim().toUpperCase() === bTrim);
  });
  return bp ? (bp.plainBottleName || bp.bottleName || bTrim).trim().toUpperCase() : bTrim;
};

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
  const [openingStockMap, setOpeningStockMap] = useState({});
  const [rows, setRows] = useState([
    {
      sectionId: 'section_0',
      companyId: '',
      brandId: '',
      bottleName: '',
      variantId: [],
      colour: '',
      process: 'C',
      plainStock: 0,
      boxQty: '',
      orderQty: '',
      coatedQty: '',
      balanceToMake: '',
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

  const [showMissingPlainBottleModal, setShowMissingPlainBottleModal] = useState(false);
  const [missingPlainBottleData, setMissingPlainBottleData] = useState({
    bottleName: '', brandId: '', companyId: '', companyName: '', brandName: '', bottlePerBox: '', printingTypeId: '', printingColorId: '', status: true
  });
  const [creatingSpec, setCreatingSpec] = useState(false);

  // Compute shared plain stock pool stats across EVERY row in the entire form (all sections)
  // Pool key: (company, plain bottle id / canonical name), strictly NO brand and NO section in the key.
  const poolDerivedStats = useMemo(() => {
    const stats = {};

    rows.forEach(r => {
      const pk = getPoolKey(r.companyId, r.bottleName || r.plainBottle, bottlePerBoxes);
      if (!pk) return;
      if (!stats[pk]) {
        const poolData = openingStockMap[pk];
        const plainStk = poolData && typeof poolData === 'object' ? poolData.plainStock : poolData;
        const openStk = poolData && typeof poolData === 'object' ? poolData.openingStock : poolData;
        // Available stock for this plan begins at remaining plainStock (accounting for earlier plans today)
        const base = Number.isFinite(Number(plainStk)) ? Number(plainStk) : (Number.isFinite(Number(openStk)) ? Number(openStk) : 0);
        stats[pk] = {
          plainStock: plainStk,
          openingStock: Number.isFinite(Number(openStk)) ? Number(openStk) : base,
          baseStock: base,
          shownStock: base,
          totalCoated: 0,
          totalOrder: 0,
          plainBottleName: getCanonicalPlainBottleName(r.bottleName || r.plainBottle, bottlePerBoxes)
        };
      }
      const rowCoated = parseFloat(r.coatedQty !== undefined && r.coatedQty !== '' ? r.coatedQty : r.coatingCompletedQty) || 0;
      stats[pk].totalCoated += rowCoated;
      stats[pk].totalOrder += (parseFloat(r.orderQty) || 0);
    });

    Object.keys(stats).forEach(pk => {
      const pool = stats[pk];
      const base = Number.isFinite(Number(pool.baseStock)) ? Number(pool.baseStock) : (Number.isFinite(Number(pool.plainStock)) ? Number(pool.plainStock) : 0);
      pool.shownStock = base - pool.totalCoated;
      pool.isCoatedExceeded = Number.isFinite(base) && pool.totalCoated > base;
    });

    return stats;
  }, [rows, openingStockMap, bottlePerBoxes]);

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
    dispatch(fetchBottleSpecs({ pagination: 'false', type: 'all' }));
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchVariants({ pagination: 'false' }));
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchPrintingTypes({ pagination: 'false' }));
    dispatch(fetchPrintingColors({ pagination: 'false' }));
  }, [dispatch]);

  const poolsKeyString = rows
    .map(r => `${r.companyId || ''}::${r.bottleName || ''}`)
    .filter(Boolean)
    .join('|');

  // Keep opening stock map in sync when planDate, company, bottle, or bottlePerBoxes changes
  useEffect(() => {
    if (!planDate) return;
    const poolsToFetch = new Map();
    rows.forEach(r => {
      if (r.companyId && r.bottleName) {
        const pk = getPoolKey(r.companyId, r.bottleName, bottlePerBoxes);
        if (pk && !poolsToFetch.has(pk)) {
          poolsToFetch.set(pk, { companyId: r.companyId, bottleName: r.bottleName });
        }
      }
    });

    poolsToFetch.forEach(async ({ companyId, bottleName }, pk) => {
      try {
        const res = await API.get('/lacquer-plan/stats/computed', {
          params: { bottleName, companyId, planDate }
        });
        if (res.data?.success) {
          const plainStock = res.data.data.plainStock !== undefined ? res.data.data.plainStock : res.data.data.openingStock;
          const opStock = res.data.data.openingStock !== undefined ? res.data.data.openingStock : plainStock;
          setOpeningStockMap(prev => ({
            ...prev,
            [pk]: {
              plainStock: Number.isFinite(Number(plainStock)) ? Number(plainStock) : 0,
              openingStock: Number.isFinite(Number(opStock)) ? Number(opStock) : 0
            }
          }));
        }
      } catch (err) {
        console.error("Failed to fetch computed plain stock", err);
      }
    });
  }, [planDate, poolsKeyString, bottlePerBoxes]);

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
          // No-op or handle appropriately
        }
        if (sPlanDate) setPlanDate(sPlanDate);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const addEntryRow = (groupId) => {
    setRows(prevRows => {
      const secRow = prevRows.find(r => r.sectionId === groupId) || prevRows[0];
      const newRow = {
        sectionId: groupId || 'section_0',
        companyId: secRow?.companyId || '',
        brandId: secRow?.brandId || '',
        bottleName: secRow?.bottleName || '',
        plainBottle: secRow?.plainBottle || secRow?.bottleName || '',
        plainBottleId: secRow?.plainBottleId || '',
        printingTypeId: secRow?.printingTypeId || '',
        printingColorId: secRow?.printingColorId || '',
        variantId: [],
        colour: '',
        coatingShade: '',
        textColor: '',
        process: 'C',
        plainStock: secRow?.plainStock || 0,
        plainBottleStock: secRow?.plainStock || 0,
        boxQty: secRow?.boxQty || '',
        orderQty: '',
        coatedQty: '',
        producedQty: 0,
        balanceToMake: '',
        dispatchBalance: 0,
        soldQty: 0,
        noOfBoxes: '',
        readyBoxes: '',
        remarks: '',
        components: {}
      };
      const lastSecRowIndex = prevRows.map(r => r.sectionId).lastIndexOf(groupId);
      if (lastSecRowIndex !== -1) {
        const copy = [...prevRows];
        copy.splice(lastSecRowIndex + 1, 0, newRow);
        return copy;
      }
      return [...prevRows, newRow];
    });
  };

  const addNewSection = () => {
    const secId = 'section_' + Date.now();
    setRows(prevRows => [
      ...prevRows,
      {
        sectionId: secId,
        companyId: '', brandId: '',
        bottleName: '', variantId: [], colour: '', process: 'C',
        plainStock: 0, boxQty: '', orderQty: '', coatedQty: '',
        balanceToMake: '', dispatchBalance: 0, soldQty: 0, noOfBoxes: '', remarks: ''
      }
    ]);
  };

  const removeSection = (groupId) => {
    setRows(prevRows => {
      const newRows = prevRows.filter(r => (r.sectionId || 'section_0') !== groupId);
      if (newRows.length === 0) {
        const secId = 'section_' + Date.now();
        return [{
          sectionId: secId,
          companyId: '', brandId: '',
          bottleName: '', variantId: [], colour: '', process: 'C',
          plainStock: 0, boxQty: '', orderQty: '', coatedQty: '',
          balanceToMake: '', dispatchBalance: 0, soldQty: 0, noOfBoxes: '', remarks: ''
        }];
      }
      return newRows;
    });
  };

  const removeRow = (index) => {
    setRows(prevRows => {
      if (prevRows.length <= 1) return prevRows;
      return prevRows.filter((_, i) => i !== index);
    });
  };

  const handleRowChange = async (index, field, value) => {
    const currentRowTarget = rows[index];
    if (!currentRowTarget) return;

    if (field === 'companyId') {
      const secId = currentRowTarget.sectionId;
      setRows(prevRows => prevRows.map(r => {
        if (secId && r.sectionId === secId) {
          return { ...r, companyId: value, brandId: '', bottleName: '', plainBottle: '', plainBottleId: '', variantId: [] };
        }
        return r;
      }));
      return;
    }

    if (field === 'brandId') {
      const secId = currentRowTarget.sectionId;
      setRows(prevRows => prevRows.map(r => {
        if (secId && r.sectionId === secId) {
          return { ...r, brandId: value, bottleName: '', plainBottle: '', plainBottleId: '', variantId: [] };
        }
        return r;
      }));
      return;
    }

    const newRows = rows.map((r, i) => i === index ? { ...r } : r);
    const currentRow = newRows[index];

    let prevValue = currentRow[field]; // Capture BEFORE updating
    currentRow[field] = value;

    const syncAndSetRows = (rowsArray) => {
      setRows([...rowsArray]);
    };

    if (field === 'bottleName' || field === 'plainBottle' || field === 'plainBottleId') {
      // Handle both old string-based selection and new ID-based selection
      let valStr = '';
      let plainBottleId = '';

      if (field === 'plainBottleId') {
        // New flow: plainBottleId selected, get name from plainBottleOptions
        plainBottleId = value;
        const selectedOption = plainBottleOptions.find(opt => opt.value === value);
        if (selectedOption) {
          valStr = selectedOption.plainBottleName || selectedOption.label;
          currentRow.plainBottleId = plainBottleId;
          currentRow.bottleName = valStr;
          currentRow.plainBottle = valStr;

          // Fetch printing type and color from BottleSpec
          try {
            const bottleSpecRes = await API.get('/bottle-specs', {
              params: {
                bottleName: valStr,
                brandId: currentRow.brandId,
                fields: 'printingTypeId,printingColorId'
              }
            });
            if (bottleSpecRes.data?.success && bottleSpecRes.data.data && bottleSpecRes.data.data.length > 0) {
              const spec = bottleSpecRes.data.data[0];
              if (spec.printingTypeId) {
                currentRow.printingTypeId = spec.printingTypeId._id || spec.printingTypeId;
              }
              if (spec.printingColorId) {
                currentRow.printingColorId = spec.printingColorId._id || spec.printingColorId;
              }
            }
          } catch (err) {
            console.error('Failed to fetch printing info from BottleSpec', err);
          }
        } else {
          currentRow.plainBottleId = '';
          currentRow.bottleName = '';
          currentRow.plainBottle = '';
          currentRow.printingTypeId = '';
          currentRow.printingColorId = '';
          currentRow.boxQty = '';
          currentRow.plainStock = 0;
          currentRow.variantId = [];
          currentRow.colour = '';
          syncAndSetRows(newRows);
          return;
        }
      } else {
        // Old flow: bottleName/plainBottle string selected
        valStr = (value || '').trim();
        currentRow.bottleName = valStr;
        currentRow.plainBottle = valStr;
      }

      if (!valStr) {
        currentRow.boxQty = '';
        currentRow.plainStock = 0;
        currentRow.variantId = [];
        currentRow.colour = '';
        currentRow.printingTypeId = '';
        currentRow.printingColorId = '';
        syncAndSetRows(newRows);
        return;
      }

      const selectedBottle = (bottlePerBoxes || []).find(b =>
        (b.plainBottleName || b.bottleName || '').trim().toLowerCase() === valStr.toLowerCase()
      );
      const groupedNames = new Set([valStr.toUpperCase()]);
      if (selectedBottle) {
        const names = (Array.isArray(selectedBottle.bottleNames) && selectedBottle.bottleNames.length > 0)
          ? selectedBottle.bottleNames
          : [selectedBottle.bottleName || selectedBottle.plainBottleName].filter(Boolean);
        names.forEach(n => groupedNames.add(n.trim().toUpperCase()));
      }

      // Check if currently selected variant is still valid under the new bottleName
      let variantStillValid = false;
      let currentVariantName = '';
      if (currentRow.variantId && currentRow.variantId.length > 0) {
        const prevVar = (variants || []).find(v => (currentRow.variantId || []).includes(v._id) || v._id === currentRow.variantId[0]);
        if (prevVar) {
          currentVariantName = prevVar.variantName;
        }
      }

      if (currentVariantName) {
        const matchingVar = (variants || []).find(v => {
          if (!v.variantName || v.variantName.trim().toUpperCase() !== currentVariantName.trim().toUpperCase()) return false;
          const spec = (bottleSpecs || []).find(bs => bs._id?.toString() === (v.bottleSpecId?._id || v.bottleSpecId)?.toString());
          if (!spec) return false;
          const specBName = (spec.bottleName || '').trim().toUpperCase();
          return groupedNames.has(specBName);
        });

        if (matchingVar) {
          variantStillValid = true;
          currentRow.variantId = [matchingVar._id];
          if (matchingVar.coatingShade) {
            currentRow.colour = matchingVar.coatingShade;
          }
        }
      }

      if (!variantStillValid) {
        currentRow.variantId = [];
        currentRow.colour = '';
      }

      currentRow.boxQty = selectedBottle && selectedBottle.bottlePerBox ? selectedBottle.bottlePerBox : '';
      const bQty = parseFloat(currentRow.boxQty);
      if (!isNaN(bQty) && bQty > 0) {
        if (currentRow.orderQty !== '' && currentRow.orderQty !== null && currentRow.orderQty !== undefined) {
          currentRow.noOfBoxes = Math.ceil((parseFloat(currentRow.orderQty) || 0) / bQty);
        } else if (currentRow.noOfBoxes !== '' && currentRow.noOfBoxes !== null && currentRow.noOfBoxes !== undefined) {
          currentRow.orderQty = Math.round((parseFloat(currentRow.noOfBoxes) || 0) * bQty);
        }
      }

      if (valStr && currentRow.companyId) {
        try {
          const res = await API.get('/lacquer-plan/stats/computed', {
            params: { bottleName: valStr, companyId: currentRow.companyId, planDate }
          });
          const fetchedStock = res.data?.success ? res.data.data.plainStock : 0;
          const fetchedOpeningStock = res.data?.success && res.data.data.openingStock !== undefined ? res.data.data.openingStock : fetchedStock;
          const pk = getPoolKey(currentRow.companyId, valStr, bottlePerBoxes);
          if (pk) {
            setOpeningStockMap(prev => ({
              ...prev,
              [pk]: {
                plainStock: Number.isFinite(Number(fetchedStock)) ? Number(fetchedStock) : 0,
                openingStock: Number.isFinite(Number(fetchedOpeningStock)) ? Number(fetchedOpeningStock) : 0
              }
            }));
          }
          currentRow.plainStock = fetchedStock;

          // Insufficient-stock warning on bottle change: warn only when that row's own Order Qty > opening stock of the pool
          if (pk && checkRowStockWarning(currentRow.orderQty, fetchedOpeningStock)) {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'warning',
              title: labels.orderExceedsOpeningStock || 'Order Qty exceeds opening plain bottle stock',
              text: `Opening Stock: ${fetchedOpeningStock}`,
              showConfirmButton: false,
              timer: 3000
            });
          }
        } catch (err) {
          console.error("Failed to fetch plain stock", err);
        }
      } else {
        currentRow.plainStock = 0;
      }

      if (variantStillValid && currentRow.colour && currentRow.brandId) {
        try {
          // On Add form: only fetch plainStock, never coatedQty (that starts blank for a new plan)
          const cRes = await API.get('/lacquer-plan/stats/computed', {
            params: { bottleName: valStr, brandId: currentRow.brandId, colour: currentRow.colour }
          });
          if (cRes.data?.success) {
            // Do NOT write coatedQty — it's a historical total and must not pre-fill on Add
          }
        } catch (err) {
          console.error("Failed to fetch computed stats for retained variant", err);
        }
      }

      // Propagate bottle change to sibling rows in the same section bottle group
      const oldBottleUpper = (prevValue || '').trim().toUpperCase();
      newRows.forEach((r, rIdx) => {
        if (rIdx !== index && r.sectionId === currentRow.sectionId) {
          const rBottleUpper = (r.plainBottle || r.bottleName || '').trim().toUpperCase();
          if (!rBottleUpper || (oldBottleUpper && rBottleUpper === oldBottleUpper)) {
            r.plainBottleId = currentRow.plainBottleId;
            r.bottleName = currentRow.bottleName;
            r.plainBottle = currentRow.plainBottle;
            r.boxQty = currentRow.boxQty;
            r.plainStock = currentRow.plainStock;
            r.printingTypeId = currentRow.printingTypeId;
            r.printingColorId = currentRow.printingColorId;
          }
        }
      });
    }

    if (field === 'boxQty') {
      const boxQty = parseFloat(value);
      const curBottleUpper = (currentRow.plainBottle || currentRow.bottleName || '').trim().toUpperCase();
      newRows.forEach((r) => {
        if (r.sectionId === currentRow.sectionId) {
          const rBottleUpper = (r.plainBottle || r.bottleName || '').trim().toUpperCase();
          if (!curBottleUpper || rBottleUpper === curBottleUpper) {
            r.boxQty = value;
            if (!isNaN(boxQty) && boxQty > 0) {
              if (r.orderQty !== '' && r.orderQty !== null && r.orderQty !== undefined) {
                const orderQty = parseFloat(r.orderQty) || 0;
                r.noOfBoxes = Math.ceil(orderQty / boxQty);
              } else if (r.noOfBoxes !== '' && r.noOfBoxes !== null && r.noOfBoxes !== undefined) {
                const noOfBoxes = parseFloat(r.noOfBoxes) || 0;
                r.orderQty = Math.round(noOfBoxes * boxQty);
              }
            }
          }
        }
      });
    }

    if (field === 'noOfBoxes') {
      const valStr = String(value ?? '').trim();
      if (valStr === '') {
        currentRow.noOfBoxes = '';
        currentRow.orderQty = '';
      } else {
        const noOfBoxes = parseFloat(valStr) || 0;
        const boxQty = parseFloat(currentRow.boxQty);
        if (!isNaN(noOfBoxes) && !isNaN(boxQty) && boxQty > 0) {
          currentRow.orderQty = Math.round(noOfBoxes * boxQty);
        }
      }
    }

    if (field === 'orderQty') {
      const orderQty = parseFloat(value) || 0;
      const boxQty = parseFloat(currentRow.boxQty);
      if (!isNaN(orderQty) && !isNaN(boxQty) && boxQty > 0) {
        currentRow.noOfBoxes = Math.ceil(orderQty / boxQty);
      }
      const coatedQty = parseFloat(currentRow.coatedQty);
      currentRow.balanceToMake = (!isNaN(coatedQty) && String(currentRow.coatedQty).trim() !== '') ? (coatedQty - orderQty) : -orderQty;
    }

    if (field === 'coatedQty') {
      let newCoatedQty = parseFloat(value);
      if (isNaN(newCoatedQty)) newCoatedQty = 0;
      currentRow.coatedQty = value === '' ? '' : newCoatedQty;
      const orderQty = parseFloat(currentRow.orderQty);
      currentRow.balanceToMake = (!isNaN(orderQty) && String(currentRow.orderQty).trim() !== '') ? (newCoatedQty - orderQty) : 0;
    }

    if (field === 'colour' && currentRow.bottleName && currentRow.brandId) {
      try {
        // On Add form: fetch plainStock only — never pre-fill coatedQty from history
        await API.get('/lacquer-plan/stats/computed', {
          params: {
            bottleName: currentRow.bottleName,
            brandId: currentRow.brandId,
            colour: value
          }
        });
        // coatedQty intentionally NOT written — it would pre-fill historical totals
      } catch (err) {
        console.error("Failed to fetch stats on colour change", err);
      }
    }

    if (field === 'variantId') {
      const rowsToAdd = [];
      if (!value || value.length === 0) {
        currentRow.variantId = [];
        currentRow.colour = '';
        currentRow.coatedQty = '';
        currentRow.balanceToMake = '';
      } else if (value.length > 1) {
        currentRow.variantId = [value[0]];

        let firstBottleName = currentRow.bottleName;
        const firstVariant = (variants || []).find(v => v._id === value[0]);
        if (firstVariant) {
          if (firstVariant.coatingShade) {
            currentRow.colour = firstVariant.coatingShade;
          }
          if (!firstBottleName) {
            const spec = (bottleSpecs || []).find(bs => bs._id?.toString() === (firstVariant.bottleSpecId?._id || firstVariant.bottleSpecId)?.toString());
            if (spec && spec.bottleName) {
              let derivedPlain = spec.bottleName.toUpperCase();
              const foundBox = (bottlePerBoxes || []).find(b => {
                const names = (Array.isArray(b.bottleNames) && b.bottleNames.length > 0)
                  ? b.bottleNames
                  : [b.bottleName || b.plainBottleName].filter(Boolean);
                return names.map(n => n.trim().toUpperCase()).includes(derivedPlain);
              });
              if (foundBox) {
                derivedPlain = (foundBox.plainBottleName || foundBox.bottleName).trim().toUpperCase();
              }
              firstBottleName = derivedPlain;
              currentRow.bottleName = derivedPlain;
              currentRow.plainBottle = derivedPlain;
              if (foundBox && foundBox._id) {
                currentRow.plainBottleId = foundBox._id;
              }
              const selectedBottle = foundBox || (bottlePerBoxes || []).find(b =>
                (b.plainBottleName || b.bottleName || '').trim().toUpperCase() === derivedPlain
              );
              if (selectedBottle && selectedBottle.bottlePerBox) {
                currentRow.boxQty = selectedBottle.bottlePerBox;
              }
            }
          }
        }

        for (let i = 1; i < value.length; i++) {
          const vid = value[i];
          const selVar = (variants || []).find(v => v._id === vid);

          const clonedRow = {
            ...currentRow,
            sectionId: currentRow.sectionId,
            bottleName: firstBottleName || currentRow.bottleName || '',
            plainBottle: firstBottleName || currentRow.plainBottle || currentRow.bottleName || '',
            plainBottleId: currentRow.plainBottleId || '',
            variantId: [vid],
            colour: selVar?.coatingShade || '',
            boxQty: currentRow.boxQty,
            plainStock: currentRow.plainStock,
            orderQty: '',
            noOfBoxes: '',
            coatedQty: '',
            balanceToMake: '',
            dispatchBalance: 0,
            soldQty: 0,
            remarks: ''
          };
          delete clonedRow._id;
          rowsToAdd.push(clonedRow);
        }

        newRows.splice(index + 1, 0, ...rowsToAdd);
      } else {
        const firstVal = value[0];
        currentRow.variantId = [firstVal];
        const selectedVariant = (variants || []).find(v => v._id === firstVal);
        if (selectedVariant) {
          if (selectedVariant.coatingShade) {
            currentRow.colour = selectedVariant.coatingShade;
          }
          if (!currentRow.bottleName) {
            const spec = (bottleSpecs || []).find(bs => bs._id?.toString() === (selectedVariant.bottleSpecId?._id || selectedVariant.bottleSpecId)?.toString());
            if (spec && spec.bottleName) {
              let derivedPlain = spec.bottleName.toUpperCase();
              const foundBox = (bottlePerBoxes || []).find(b => {
                const names = (Array.isArray(b.bottleNames) && b.bottleNames.length > 0)
                  ? b.bottleNames
                  : [b.bottleName || b.plainBottleName].filter(Boolean);
                return names.map(n => n.trim().toUpperCase()).includes(derivedPlain);
              });
              if (foundBox) {
                derivedPlain = (foundBox.plainBottleName || foundBox.bottleName).trim().toUpperCase();
              }
              currentRow.bottleName = derivedPlain;
              currentRow.plainBottle = derivedPlain;
              if (foundBox && foundBox._id) {
                currentRow.plainBottleId = foundBox._id;
              }
              const selectedBottle = foundBox || (bottlePerBoxes || []).find(b =>
                (b.plainBottleName || b.bottleName || '').trim().toUpperCase() === derivedPlain
              );
              if (selectedBottle && selectedBottle.bottlePerBox) {
                currentRow.boxQty = selectedBottle.bottlePerBox;
              }
            }
          }
        }
      }

      // Immediately commit rows so UI updates without waiting for network
      syncAndSetRows(newRows);

      // Asynchronously fetch plainStock for currentRow if needed
      if (currentRow.bottleName && currentRow.companyId) {
        API.get('/lacquer-plan/stats/computed', {
          params: { bottleName: currentRow.bottleName, companyId: currentRow.companyId, planDate }
        }).then(res => {
          if (res.data?.success) {
            const fetchedStock = res.data.data.plainStock !== undefined ? res.data.data.plainStock : 0;
            const fetchedOpeningStock = res.data.data.openingStock !== undefined ? res.data.data.openingStock : fetchedStock;
            const pk = getPoolKey(currentRow.companyId, currentRow.bottleName, bottlePerBoxes);
            if (pk) {
              setOpeningStockMap(prev => ({ ...prev, [pk]: fetchedOpeningStock }));
            }
            setRows(currentRows => {
              const rArray = [...currentRows];
              if (rArray[index]) {
                rArray[index] = { ...rArray[index], plainStock: fetchedStock };
              }
              return rArray;
            });
          }
        }).catch(console.error);
      }

      // Asynchronously fetch plainStock for any cloned rows in rowsToAdd
      if (rowsToAdd.length > 0) {
        rowsToAdd.forEach(clonedRow => {
          const vid = clonedRow.variantId[0];
          if (clonedRow.bottleName && clonedRow.companyId) {
            API.get('/lacquer-plan/stats/computed', {
              params: { bottleName: clonedRow.bottleName, companyId: clonedRow.companyId, brandId: clonedRow.brandId, colour: clonedRow.colour, planDate }
            }).then(res => {
              if (res.data?.success) {
                setRows(currentRows => {
                  const rArray = [...currentRows];
                  const targetRow = rArray.find(r => r.variantId && r.variantId[0] === vid && r.bottleName === clonedRow.bottleName);
                  if (targetRow) {
                    targetRow.plainStock = res.data.data.plainStock !== undefined ? res.data.data.plainStock : targetRow.plainStock;
                  }
                  return rArray;
                });
              }
            }).catch(console.error);
          }
        });
      }
      return;
    }

    // Commit rows for all other fields
    syncAndSetRows(newRows);
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

      await dispatch(fetchBottleSpecs({ pagination: 'false', type: 'all' })).unwrap();
      await dispatch(fetchBottlePerBoxes({ pagination: 'false' })).unwrap();

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

  const handleSaveMissingPlainBottle = async () => {
    if (!missingPlainBottleData.bottleName) return;
    setCreatingSpec(true);
    try {
      // Create plain bottle entry
      await API.post('/plain-bottle', {
        bottleName: missingPlainBottleData.bottleName.toUpperCase(),
        companyId: missingPlainBottleData.companyId,
        status: true
      });

      // Create bottle-per-box entry if provided
      if (missingPlainBottleData.bottlePerBox) {
        await API.post('/bottle-per-box', {
          bottleName: missingPlainBottleData.bottleName.toUpperCase(),
          bottlePerBox: missingPlainBottleData.bottlePerBox,
          status: true
        });
      }

      // Refresh plain bottles list
      try {
        const res = await API.get('/plain-bottle');
        if (res.data?.success) {
          setPlainBottles(res.data.data);
        }
      } catch (err) {
        console.error('Error fetching plain bottles:', err);
      }

      Swal.fire({
        icon: 'success',
        title: 'Plain Bottle Created',
        text: `"${missingPlainBottleData.bottleName}" created for ${missingPlainBottleData.companyName}!`,
        showConfirmButton: false,
        timer: 3000,
        toast: true,
        position: 'top-end',
      });

      setShowMissingPlainBottleModal(false);

    } catch (error) {
      console.error('Error creating plain bottle:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.message || 'Failed to create plain bottle' });
    } finally {
      setCreatingSpec(false);
    }
  };

  const handleAddVariantClick = (bottleName, brandId, rowIndex, colour) => {
    let existingSpec = (bottleSpecs || []).find(bs => bs.bottleName === bottleName && (bs.brandId?._id || bs.brandId)?.toString() === brandId?.toString());

    if (!existingSpec && bottleName) {
      const selectedBottle = (bottlePerBoxes || []).find(b =>
        (b.plainBottleName || b.bottleName || '').trim().toLowerCase() === bottleName.toLowerCase()
      );
      const groupedNames = new Set([bottleName.toUpperCase()]);
      if (selectedBottle) {
        const names = (Array.isArray(selectedBottle.bottleNames) && selectedBottle.bottleNames.length > 0)
          ? selectedBottle.bottleNames
          : [selectedBottle.bottleName || selectedBottle.plainBottleName].filter(Boolean);
        names.forEach(n => groupedNames.add(n.trim().toUpperCase()));
      }
      existingSpec = (bottleSpecs || []).find(bs =>
        (bs.brandId?._id || bs.brandId)?.toString() === brandId?.toString() &&
        groupedNames.has((bs.bottleName || '').trim().toUpperCase())
      );
    }

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

    for (const pk of Object.keys(poolDerivedStats)) {
      const pool = poolDerivedStats[pk];
      if (pool && pool.isCoatedExceeded) {
        Swal.fire({
          icon: 'error',
          title: 'Coating Completed Qty Exceeds Available Stock',
          text: `Only ${pool.baseStock} bottles available for ${pool.plainBottleName} (this entry adds up to ${pool.totalCoated}).`,
          confirmButtonColor: '#d33'
        });
        return;
      }
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
        const companyName = companyOptions.find(o => o.value === row.companyId)?.label || (companies || []).find(c => c._id === row.companyId)?.name || '';
        const isShreno = companyName.toLowerCase().includes('shreno');

        if (!isShreno && (!row.variantId || row.variantId.length === 0)) {
          hasError = true;
        }
        if (!row.colour || !row.orderQty || !row.process) {
          hasError = true;
        }

        if (row.variantId && row.variantId.length > 0) {
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
              plainStock: (() => {
                const rPk = getPoolKey(row.companyId, row.bottleName, bottlePerBoxes);
                return rPk && poolDerivedStats[rPk] ? poolDerivedStats[rPk].shownStock : (row.plainStock || 0);
              })(),
              stockWarningAcknowledged: true
            });
          });
        } else if (isShreno) {
          const comboKey = `${row.companyId.toString()}-${row.brandId.toString()}-${row.bottleName.trim().toLowerCase()}-${(row.colour || '').trim().toLowerCase()}`;
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
            variantId: null,
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
            plainStock: (() => {
              const rPk = getPoolKey(row.companyId, row.bottleName, bottlePerBoxes);
              return rPk && poolDerivedStats[rPk] ? poolDerivedStats[rPk].shownStock : (row.plainStock || 0);
            })(),
            stockWarningAcknowledged: true
          });
        }
      }
    });

    if (hasError) return Swal.fire('Error', 'Please fill in all required fields (Bottle Name, Coating Shade, Process, Order Qty, and Variant where applicable) for each entered row.', 'error');
    if (hasDuplicate) return Swal.fire('Error', 'This Bottle Name and Variant/Shade combination is repeated.', 'error');
    if (payload.length === 0) return Swal.fire('Error', 'Please ensure at least one valid entry is provided.', 'error');

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

  const plainBottleOptions = useMemo(() => {
    if (!bottlePerBoxes || bottlePerBoxes.length === 0) return [];
    const unique = new Map();
    bottlePerBoxes.forEach(b => {
      const name = (b.plainBottleName || b.bottleName || '').trim();
      const id = b._id?.toString() || name;
      if (name && !unique.has(id)) {
        unique.set(id, {
          value: id,  // Store the BottlePerBox ID
          label: name,
          plainBottleName: name,
          bottlePerBoxData: b  // Store full object for reference
        });
      }
    });
    return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bottlePerBoxes]);



  return (
    <div className="page-content lacquer-plan-page lacquer-plan-form-page">
      <div className="d-flex justify-content-between align-items-end mb-4 lacquer-plan-form-header">
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
          <div className="dash-card border-0 shadow-sm p-4 lacquer-plan-form-card">
            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleSubmit} className="lacquer-plan-form">
              <div className="row g-3 mb-4 pb-4 border-bottom align-items-center">
                <div className="col-md-3">
                  <label className="form-label fw-bold small">Common Plan Date <span className="text-danger">*</span></label>
                  <input type="date" className="form-control shadow-none"
                    value={planDate} onChange={(e) => setPlanDate(e.target.value)} required />
                </div>
              </div>

              <div className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative lacquer-plan-section">


                {(() => {
                  const groupedSections = [];
                  rows.forEach((row, idx) => {
                    const secId = row.sectionId || row.sharedGroupId || 'section_0';
                    let group = groupedSections.find(g => g.id === secId);
                    if (!group) {
                      group = { id: secId, bottleName: row.bottleName, items: [] };
                      groupedSections.push(group);
                    }
                    group.items.push({ ...row, originalIndex: idx });
                  });

                  return groupedSections.map((group, groupIndex) => {
                    const gCompanyId = group.items[0]?.companyId;
                    const gBrandId = group.items[0]?.brandId;
                    const gCompanyName = companyOptions.find(o => o.value === gCompanyId)?.label || (companies || []).find(c => c._id === gCompanyId)?.name || '';
                    const isShrenoSection = gCompanyName.toLowerCase().includes('shreno');
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
                      const matchingSpecs = (bottleSpecs || []).filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === gBrandId.toString());
                      const matchingBottleNames = new Set(matchingSpecs.map(s => (s.bottleName || '').trim().toUpperCase()).filter(Boolean));

                      filteredBottleOptions = plainBottleOptions.filter(opt => {
                        // Now opt.value is an ID, opt.label is the name
                        const optName = (opt.label || opt.plainBottleName || '').trim().toUpperCase();
                        if (matchingBottleNames.has(optName)) return true;
                        const matchedBox = (bottlePerBoxes || []).find(b =>
                          (b.plainBottleName || b.bottleName || '').trim().toUpperCase() === optName
                        );
                        if (matchedBox) {
                          const names = (Array.isArray(matchedBox.bottleNames) && matchedBox.bottleNames.length > 0)
                            ? matchedBox.bottleNames
                            : [matchedBox.bottleName || matchedBox.plainBottleName].filter(Boolean);
                          return names.some(n => matchingBottleNames.has(n.trim().toUpperCase()));
                        }
                        return false;
                      });
                    }

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

                        <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom lacquer-plan-group-toolbar">
                          {(() => {
                            const companyName = gCompanyName || `Company ${groupIndex}`;
                            const brandName = (brandOptions.find(o => o.value === gBrandId)?.label) || `Brand ${groupIndex}`;
                            return (
                              <h5 className="mb-0 text-primary fw-bold">
                                <i className="bi bi-box-seam me-2"></i>
                                {`${companyName} - ${brandName}`}
                              </h5>
                            );
                          })()}
                          {groupedSections.length > 1 && (
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeSection(group.id)}>
                              <i className="bi bi-trash me-1"></i> Remove Section
                            </button>
                          )}
                        </div>

                        <div className="table-responsive mb-3 lacquer-plan-entry-table">
                          <table className="table table-bordered align-middle table-sm" style={{ minWidth: '2400px' }}>
                            <thead className="table-light">
                              <tr>
                                <th className="small text-muted text-center align-middle" style={{ width: '3%' }}>#</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '12%', minWidth: '200px' }}>Plain Bottle <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{ width: '12%', minWidth: '200px' }}>{labels.variant} {!isShrenoSection && <span className="text-danger">*</span>}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '12%', minWidth: '200px' }}>{labels.coatingShade} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.process} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.plainStock}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '7%' }}>{labels.orderQty} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.coatingCompletedQty}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.balanceToMake}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.bottlePerBox}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.noOfOrderBoxes}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.dispatchPendingQty}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '5%' }}>{labels.soldQty}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '15%', minWidth: '250px' }}>{labels.remarks}</th>
                                <th className="small text-muted text-center align-middle" style={{ width: '3%' }}></th>
                              </tr>
                            </thead>
                            <tbody className="border-top-0">
                              {(() => {
                                return group.items.map((rowItem, localIndex) => {
                                  const index = rowItem.originalIndex;
                                  const row = rowItem;

                                  const currentBottle = (row.plainBottle || row.bottleName || '').trim().toUpperCase();
                                  const prevRow = localIndex > 0 ? group.items[localIndex - 1] : null;
                                  const prevBottle = (prevRow?.plainBottle || prevRow?.bottleName || '').trim().toUpperCase();

                                  const isContinuation = !!currentBottle && !!prevRow && prevBottle === currentBottle;
                                  const renderGroupCell = !isContinuation;

                                  let rowSpan = 1;
                                  if (renderGroupCell && currentBottle) {
                                    let count = 1;
                                    for (let i = localIndex + 1; i < group.items.length; i++) {
                                      const nextBottle = (group.items[i]?.plainBottle || group.items[i]?.bottleName || '').trim().toUpperCase();
                                      if (nextBottle === currentBottle) {
                                        count++;
                                      } else {
                                        break;
                                      }
                                    }
                                    rowSpan = count;
                                  }
                                  const isGrouped = rowSpan > 1 || isContinuation;

                                  const rowPoolKey = getPoolKey(row.companyId, row.bottleName, bottlePerBoxes);
                                  const poolInfo = rowPoolKey ? poolDerivedStats[rowPoolKey] : null;
                                  const currentShownStock = poolInfo !== undefined && poolInfo !== null
                                    ? poolInfo.shownStock
                                    : (row.plainStock || 0);
                                  const rowIsExceeding = poolInfo ? checkRowStockWarning(row.orderQty, poolInfo.openingStock) : false;

                                  const renderShadeGroupCell = true;
                                  const renderProcessCell = true;

                                  // Determine available plain bottle options for this row/section
                                  const currentPlainVal = row.plainBottle || row.bottleName;

                                  // Start with brand-specific bottles
                                  let availablePlainBottleOptions = filteredBottleOptions;

                                  // Add ALL other plain bottles (from all brands) to the options
                                  const allOtherBottles = (plainBottleOptions || [])
                                    .filter(pb => !filteredBottleOptions.some(opt => opt.value === pb.value));

                                  // Combine: brand bottles + all other bottles
                                  availablePlainBottleOptions = [...filteredBottleOptions, ...allOtherBottles];

                                  // Build variant-related bottles set (for use in filterOption)
                                  let bottleNamesForCurrentVariant = null;
                                  const currentVarId = (row.variantId && row.variantId.length > 0) ? row.variantId[0] : null;
                                  if (currentVarId) {
                                    const currentVar = (variants || []).find(v => v._id === currentVarId);
                                    if (currentVar && currentVar.variantName) {
                                      const selectedVariantName = currentVar.variantName.trim().toUpperCase();

                                      // Find ALL variants with this same variantName across all specs
                                      const allVariantsWithSameName = (variants || []).filter(v =>
                                        v.variantName && v.variantName.trim().toUpperCase() === selectedVariantName
                                      );

                                      // Get all unique bottle spec IDs from all these variants
                                      const bottleSpecIds = new Set(allVariantsWithSameName.map(v => (v.bottleSpecId?._id || v.bottleSpecId)?.toString()).filter(Boolean));

                                      // Get all bottle names from these specs
                                      bottleNamesForCurrentVariant = new Set((bottleSpecs || [])
                                        .filter(bs => bottleSpecIds.has(bs._id?.toString()))
                                        .map(bs => bs.bottleName?.trim().toUpperCase())
                                        .filter(Boolean)
                                      );
                                    }
                                  }

                                  if (currentPlainVal && !availablePlainBottleOptions.some(o => o.value === currentPlainVal)) {
                                    availablePlainBottleOptions = [{ value: currentPlainVal, label: currentPlainVal }, ...availablePlainBottleOptions];
                                  }

                                  const selectedPlain = (currentPlainVal || '').trim();
                                  let groupedBottleNames = new Set();
                                  if (selectedPlain) {
                                    groupedBottleNames.add(selectedPlain.toUpperCase());
                                    const matchedBox = (bottlePerBoxes || []).find(b =>
                                      (b.plainBottleName || b.bottleName || '').trim().toLowerCase() === selectedPlain.toLowerCase()
                                    );
                                    if (matchedBox) {
                                      const names = (Array.isArray(matchedBox.bottleNames) && matchedBox.bottleNames.length > 0)
                                        ? matchedBox.bottleNames
                                        : [matchedBox.bottleName || matchedBox.plainBottleName].filter(Boolean);
                                      names.forEach(n => groupedBottleNames.add(n.trim().toUpperCase()));
                                    }
                                  }

                                  const matchingSpecs = (bottleSpecs || []).filter(bs => {
                                    const specBrandId = (bs.brandId?._id || bs.brandId)?.toString();
                                    if (gBrandId && specBrandId !== gBrandId.toString()) return false;
                                    if (!gBrandId && gCompanyId && (!specBrandId || !companyBrandIds.has(specBrandId))) return false;
                                    if (selectedPlain) {
                                      const specBName = (bs.bottleName || '').trim().toUpperCase();
                                      return groupedBottleNames.has(specBName);
                                    }
                                    return true;
                                  });
                                  const matchingSpecIdSet = new Set(
                                    matchingSpecs.map(bs => (bs._id?._id || bs._id)?.toString()).filter(Boolean)
                                  );

                                  const selectedSiblingVariantNames = new Set(
                                    group.items
                                      .filter((r, i) => i !== localIndex && (r.plainBottle || r.bottleName) && (r.plainBottle || r.bottleName).trim().toUpperCase() === (row.plainBottle || row.bottleName || '').trim().toUpperCase())
                                      .flatMap(r => r.variantId || [])
                                      .map(vid => (variants || []).find(v => v._id === vid)?.variantName?.trim().toUpperCase())
                                      .filter(Boolean)
                                  );

                                  const seenVariantNames = new Set();
                                  const variantOptions = [];
                                  (variants || [])
                                    .filter(v => {
                                      const vSpec = v.bottleSpecId;
                                      const vSpecId = (vSpec?._id || vSpec)?.toString();
                                      if (vSpecId && matchingSpecIdSet.has(vSpecId)) return true;
                                      if (vSpec && typeof vSpec === 'object' && vSpec.bottleName) {
                                        const vBrandId = (vSpec.brandId?._id || vSpec.brandId)?.toString();
                                        if (gBrandId && vBrandId && vBrandId !== gBrandId.toString()) return false;
                                        const vBName = (vSpec.bottleName || '').trim().toUpperCase();
                                        if (selectedPlain && !groupedBottleNames.has(vBName)) return false;
                                        return true;
                                      }
                                      return false;
                                    })
                                    .filter(v => v.variantName)
                                    .forEach(v => {
                                      const vNameUpper = v.variantName.trim().toUpperCase();
                                      if (!seenVariantNames.has(vNameUpper) && !selectedSiblingVariantNames.has(vNameUpper)) {
                                        seenVariantNames.add(vNameUpper);
                                        variantOptions.push({ value: v._id, label: v.variantName.trim() });
                                      }
                                    });
                                  variantOptions.sort((a, b) => a.label.localeCompare(b.label));

                                  const selectedVariantObjects = (row.variantId || []).map(vid => {
                                    const found = variantOptions.find(o => o.value === vid);
                                    if (found) return found;
                                    const vObj = (variants || []).find(v => v._id === vid);
                                    return vObj ? { value: vid, label: vObj.variantName } : null;
                                  }).filter(Boolean);

                                  return (
                                    <tr key={index}>
                                      <td className="text-center text-muted">{localIndex + 1}</td>
                                      {renderGroupCell && (
                                        <td rowSpan={rowSpan} className="align-middle" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                          <CreatableSelect
                                            options={availablePlainBottleOptions}
                                            value={availablePlainBottleOptions.find(opt => opt.value === (row.plainBottleId || currentPlainVal)) || (currentPlainVal ? { value: currentPlainVal, label: currentPlainVal } : null)}
                                            onChange={(selected) => {
                                              if (!selected) {
                                                handleRowChange(index, 'plainBottleId', '');
                                              } else {
                                                // Use the new plainBottleId flow
                                                handleRowChange(index, 'plainBottleId', selected.value);
                                              }
                                            }}
                                            onCreateOption={(inputValue) => {
                                              // Open modal to create new plain bottle
                                              setMissingPlainBottleData({
                                                bottleName: inputValue.trim(),
                                                companyId: gCompanyId || '',
                                                brandId: gBrandId || '',
                                                companyName: companies.find(c => c._id === gCompanyId)?.name || '',
                                                brandName: brands.find(b => b._id === gBrandId)?.name || '',
                                                bottlePerBox: '',
                                                status: true
                                              });
                                              setShowMissingPlainBottleModal(true);
                                            }}
                                            filterOption={(option, rawInput) => {
                                              if (!rawInput) {
                                                // No search input - show ONLY brand-specific bottles
                                                return filteredBottleOptions.some(opt => opt.value === option.value);
                                              }

                                              // User is searching
                                              const searchUpper = rawInput.trim().toUpperCase();
                                              const optionUpper = option.label.toUpperCase();

                                              // Must match the search text
                                              if (!optionUpper.includes(searchUpper)) {
                                                return false;
                                              }

                                              // If a variant is selected, only show bottles related to that variant
                                              if (bottleNamesForCurrentVariant && bottleNamesForCurrentVariant.size > 0) {
                                                return bottleNamesForCurrentVariant.has(optionUpper);
                                              }

                                              // Otherwise show all matching bottles
                                              return true;
                                            }}
                                            placeholder={gBrandId ? "Select or type new Plain Bottle..." : "Select brand first..."}
                                            isDisabled={!gBrandId}
                                            isClearable
                                            menuPortalTarget={document.body}
                                            styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                                            isSearchable
                                            allowCreateWhileLoading={true}
                                          />
                                        </td>
                                      )}

                                      <td>
                                        <Select
                                          isMulti
                                          options={variantOptions}
                                          value={selectedVariantObjects}
                                          onChange={(selected) => handleRowChange(index, 'variantId', selected ? selected.map(s => s.value) : [])}
                                          placeholder={isShrenoSection ? "Variant (optional)..." : "Variant..."}
                                          isClearable
                                          required={!isShrenoSection}
                                          menuPortalTarget={document.body}
                                          styles={{
                                            menuPortal: base => ({ ...base, zIndex: 9999 }),
                                            valueContainer: base => ({ ...base, flexWrap: 'nowrap' }),
                                            multiValue: base => ({ ...base, minWidth: 0 }),
                                            multiValueLabel: base => ({ ...base, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
                                          }}
                                        />
                                        {row.bottleName && variantOptions.length === 0 && !isShrenoSection && (
                                          <div style={{ fontSize: '0.7rem' }} className="text-warning mt-1">
                                            <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                            No variants. <button type="button" onClick={() => handleAddVariantClick(row.bottleName, gBrandId, index, row.colour)} className="text-decoration-underline text-warning fw-bold btn btn-link p-0 border-0 align-baseline" style={{ fontSize: 'inherit' }}>Add Variant</button>
                                          </div>
                                        )}
                                      </td>
                                      {renderShadeGroupCell && (
                                        <td className="align-middle">
                                          <CreatableSelect
                                            options={uniqueCoatingShades}
                                            value={row.colour ? { value: row.colour, label: row.colour } : null}
                                            onChange={(selected) => {
                                              handleRowChange(index, 'colour', selected ? selected.value : '');
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
                                      {renderProcessCell && (
                                        <td className="align-middle">
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
                                        <td rowSpan={rowSpan} className="align-middle text-center" style={{ backgroundColor: isGrouped ? '#f8f9fa' : (rowIsExceeding ? '#fff3cd' : 'inherit') }}>
                                          <input type="number" className={`form-control form-control-sm shadow-none text-center ${rowIsExceeding ? 'bg-warning' : ''}`} value={currentShownStock} readOnly />
                                        </td>
                                      )}
                                      <td>
                                        <input
                                          type="number"
                                          className={`form-control form-control-sm shadow-none text-center ${rowIsExceeding ? 'bg-warning' : ''}`}
                                          value={row.orderQty}
                                          onChange={(e) => handleRowChange(index, 'orderQty', e.target.value)}
                                          onBlur={() => {
                                            // Insufficient stock warning: popup must show the same number the form shows (opening stock = shown stock + Σ coated)
                                            if (rowIsExceeding && poolInfo) {
                                              Swal.fire({
                                                toast: true,
                                                position: 'top-end',
                                                icon: 'warning',
                                                title: labels.orderExceedsOpeningStock || 'Order Qty exceeds opening plain bottle stock',
                                                text: `Opening Stock: ${poolInfo.openingStock}`,
                                                showConfirmButton: false,
                                                timer: 3000
                                              });
                                            }
                                          }}
                                          min="1"
                                          required
                                        />
                                      </td>
                                      <td>
                                        <input
                                          type="number"
                                          className={`form-control form-control-sm shadow-none text-center ${poolInfo && poolInfo.isCoatedExceeded ? 'border-danger bg-danger bg-opacity-10 text-danger fw-bold' : ''}`}
                                          value={row.coatedQty}
                                          onChange={(e) => handleRowChange(index, 'coatedQty', e.target.value)}
                                          title={poolInfo && poolInfo.isCoatedExceeded ? `Only ${poolInfo.baseStock} bottles available for ${poolInfo.plainBottleName}` : ''}
                                        />
                                        {poolInfo && poolInfo.isCoatedExceeded && (
                                          <div className="text-danger fw-bold text-center mt-1" style={{ fontSize: '0.72rem', lineHeight: '1.2' }}>
                                            <i className="bi bi-exclamation-circle-fill me-1"></i>
                                            Only {poolInfo.baseStock} bottles available for {poolInfo.plainBottleName} (this entry adds up to {poolInfo.totalCoated}).
                                          </div>
                                        )}
                                      </td>
                                      <td>
                                        <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.balanceToMake} onChange={(e) => handleRowChange(index, 'balanceToMake', e.target.value)} />
                                        {isPlanRowCompleted(row) && (
                                          <span className="badge bg-success d-block mt-1" style={{ fontSize: 10 }}>COMPLETED</span>
                                        )}
                                      </td>
                                      {renderGroupCell && (
                                        <td rowSpan={rowSpan} className="align-middle text-center" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.boxQty} onChange={(e) => handleRowChange(index, 'boxQty', e.target.value)} min="1" />
                                        </td>
                                      )}
                                      <td>
                                        <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.noOfBoxes} onChange={(e) => handleRowChange(index, 'noOfBoxes', e.target.value)} min="0" />
                                      </td>
                                      <td>
                                        <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.dispatchBalance} onChange={(e) => handleRowChange(index, 'dispatchBalance', e.target.value)} min="0" />
                                      </td>
                                      <td>
                                        <input type="number" className="form-control form-control-sm shadow-none text-center" value={row.soldQty} onChange={(e) => handleRowChange(index, 'soldQty', e.target.value)} min="0" />
                                      </td>
                                      <td>
                                        <input type="text" className="form-control form-control-sm shadow-none" value={row.remarks} onChange={(e) => handleRowChange(index, 'remarks', e.target.value)} />
                                      </td>
                                      <td className="text-center align-middle">
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-light text-danger rounded-circle shadow-sm"
                                          onClick={() => removeRow(index)}
                                          disabled={rows.length === 1}
                                        >
                                          <i className="bi bi-trash"></i>
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>

                        {/* No acknowledgement banner — stock exceeded rows are highlighted yellow inline */}

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
                    onChange={(e) => setMissingSpecData({ ...missingSpecData, code: e.target.value })}
                    placeholder="Optional code"
                  />
                </div>

                <div className="row g-4 mb-4">
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold text-muted mb-1">Printing Type</label>
                    <select
                      className="form-select shadow-none bg-white border-light-subtle rounded-3 py-2"
                      value={missingSpecData.printingTypeId}
                      onChange={(e) => setMissingSpecData({ ...missingSpecData, printingTypeId: e.target.value })}
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
                      onChange={(e) => setMissingSpecData({ ...missingSpecData, printingColorId: e.target.value })}
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
                    onChange={(e) => setMissingSpecData({ ...missingSpecData, bottlePerBox: e.target.value })}
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

      {showMissingPlainBottleModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1050, backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-white border-bottom p-4">
                <h5 className="modal-title fw-bold text-dark mb-0 d-flex align-items-center">
                  <div className="bg-primary bg-opacity-10 text-primary p-2 rounded-3 me-3 d-flex align-items-center justify-content-center">
                    <i className="bi bi-plus-circle-fill"></i>
                  </div>
                  Add Plain Bottle
                </h5>
                <button type="button" className="btn-close shadow-none" onClick={() => setShowMissingPlainBottleModal(false)}></button>
              </div>
              <div className="modal-body p-4 bg-light bg-opacity-50">
                <div className="alert alert-info py-3 small mb-4 rounded-3 border-0 bg-info bg-opacity-10 text-info-emphasis d-flex gap-2 align-items-start">
                  <i className="bi bi-info-circle-fill mt-1"></i>
                  <div>Plain Bottle <strong>{missingPlainBottleData.bottleName}</strong> doesn't exist for <strong>{missingPlainBottleData.companyName}</strong>. Please create it to continue.</div>
                </div>
                <div className="row g-4 mb-4">
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold text-muted mb-1">Company</label>
                    <input type="text" className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2 fw-500" value={missingPlainBottleData.companyName} disabled />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold text-muted mb-1">Brand</label>
                    <input type="text" className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2 fw-500 text-accent" value={missingPlainBottleData.brandName} disabled />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="form-label text-uppercase small fw-bold text-muted mb-1">Plain Bottle Name</label>
                  <input
                    type="text"
                    className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2 fw-bold text-dark"
                    value={missingPlainBottleData.bottleName}
                    disabled
                  />
                </div>

                <div className="mb-4">
                  <label className="form-label text-uppercase small fw-bold text-muted mb-1">Bottle Per Box</label>
                  <input
                    type="number"
                    className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2"
                    value={missingPlainBottleData.bottlePerBox}
                    onChange={(e) => setMissingPlainBottleData({ ...missingPlainBottleData, bottlePerBox: e.target.value })}
                    placeholder="Enter quantity per box"
                    min="1"
                  />
                </div>

                <div className="row g-4">
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold text-muted mb-1">Printing Type</label>
                    <input
                      type="text"
                      className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2"
                      value={missingPlainBottleData.printingTypeId || ''}
                      onChange={(e) => setMissingPlainBottleData({ ...missingPlainBottleData, printingTypeId: e.target.value })}
                      placeholder="Enter printing type"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold text-muted mb-1">Printing Color</label>
                    <input
                      type="text"
                      className="form-control shadow-none bg-white border-light-subtle rounded-3 py-2"
                      value={missingPlainBottleData.printingColorId || ''}
                      onChange={(e) => setMissingPlainBottleData({ ...missingPlainBottleData, printingColorId: e.target.value })}
                      placeholder="Enter printing color"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer bg-white border-top p-4 d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-light px-4 py-2 fw-500 rounded-3" onClick={() => setShowMissingPlainBottleModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary px-4 py-2 fw-500 rounded-3 d-flex align-items-center" onClick={handleSaveMissingPlainBottle} disabled={creatingSpec}>
                  {creatingSpec ? (
                    <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Saving...</>
                  ) : (
                    <><i className="bi bi-save me-2"></i> Create Plain Bottle</>
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

