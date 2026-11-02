import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { fetchLacquerPlans } from '../../redux/slices/lacquerPlanSlice';
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


const computeSplitSuggestion = (qty, sources, sourcesAvailMap, ownCompId) => {
  const reqQty = Number(qty) || 0;
  const ownCompStr = (ownCompId?._id || ownCompId)?.toString();
  if (reqQty <= 0) {
    return sources.map(s => ({ companyId: (s?._id || s)?.toString(), qty: 0 }));
  }
  const sorted = [...sources].sort((a, b) => {
    const aStr = (a?._id || a)?.toString();
    const bStr = (b?._id || b)?.toString();
    if (aStr === ownCompStr) return -1;
    if (bStr === ownCompStr) return 1;
    return 0;
  });
  let remaining = reqQty;
  const result = [];
  for (const s of sorted) {
    const sId = (s?._id || s)?.toString();
    const avail = sourcesAvailMap.get(sId) ?? 0;
    const part = Math.min(remaining, Math.max(0, avail));
    result.push({ companyId: sId, qty: part });
    remaining -= part;
  }
  if (remaining > 0 && result.length > 0) {
    result[result.length - 1].qty += remaining;
  }
  return result;
};

export default function EditLacquerPlan() {
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

  const { id } = useParams();
  const { plans } = useSelector((state) => state.lacquerPlans || { plans: [] });
  const [deletedIds, setDeletedIds] = useState([]);
  const [groupPlanIds, setGroupPlanIds] = useState([]);

  const [planDate, setPlanDate] = useState('');
  const [openingStockMap, setOpeningStockMap] = useState({});
  const [poolSourcesMap, setPoolSourcesMap] = useState({});
  const [openDropdownPk, setOpenDropdownPk] = useState(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.stock-from-dropdown')) {
        setOpenDropdownPk(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleToggleSource = (pk, sourceId, checked) => {
    if (!pk) return;
    const [cid, bName] = pk.split('::');
    const ownCompId = cid;
    const currentSources = (poolSourcesMap[pk] || [ownCompId])
      .map(id => (id?._id || id)?.toString())
      .filter(id => (companies || []).some(c => (c._id || c)?.toString() === id));
    const targetIdStr = (sourceId?._id || sourceId)?.toString();
    if (!checked && currentSources.length <= 1) return; // At least one source must stay checked

    let updatedSources = [];
    if (checked) {
      updatedSources = Array.from(new Set([...currentSources, targetIdStr]));
    } else {
      updatedSources = currentSources.filter(id => id !== targetIdStr);
    }
    setPoolSourcesMap(prev => ({ ...prev, [pk]: updatedSources }));

    // Prepare immediate availability map from current poolData
    const poolData = openingStockMap[pk] || {};
    const immediateAvailMap = new Map();
    (poolData.sources || []).forEach(s => {
      immediateAvailMap.set((s.companyId?._id || s.companyId)?.toString(), s.available ?? 0);
    });
    (poolData.eligibleSuppliers || []).forEach(s => {
      const sId = (s.companyId?._id || s.companyId)?.toString();
      if (!immediateAvailMap.has(sId)) {
        immediateAvailMap.set(sId, s.available ?? 0);
      }
    });

    setRows(prevRows => prevRows.map(r => {
      const rPk = getPoolKey(r.companyId, r.bottleName || r.plainBottle, bottlePerBoxes);
      if (rPk === pk) {
        const rowAlloc = updatedSources.length >= 2
          ? computeSplitSuggestion(r.coatedQty, updatedSources, immediateAvailMap, r.companyId)
          : (r.stockAllocation || []);
        return {
          ...r,
          stockSources: updatedSources,
          stockAllocation: rowAlloc
        };
      }
      return r;
    }));

    // Trigger immediate fetch with new sources
    const excludeIdsStr = groupPlanIds.length > 0 ? groupPlanIds.join(',') : id;
    API.get('/lacquer-plan/stats/computed', {
      params: { bottleName: bName, companyId: cid, planDate, stockSources: updatedSources.join(','), excludePlanIds: excludeIdsStr }
    }).then(res => {
      if (res.data?.success) {
        const plainStock = res.data.data.plainStock !== undefined ? res.data.data.plainStock : res.data.data.openingStock;
        const opStock = res.data.data.openingStock !== undefined ? res.data.data.openingStock : plainStock;
        const freshSources = res.data.data.sources || [];
        const freshEligible = res.data.data.eligibleSuppliers || [];
        setOpeningStockMap(prev => ({
          ...prev,
          [pk]: {
            plainStock: Number.isFinite(Number(plainStock)) ? Number(plainStock) : 0,
            openingStock: Number.isFinite(Number(opStock)) ? Number(opStock) : 0,
            sources: freshSources,
            hasSuppliers: res.data.data.hasSuppliers || false,
            eligibleSuppliers: freshEligible
          }
        }));

        if (updatedSources.length >= 2) {
          const availMap = new Map();
          freshSources.forEach(s => availMap.set((s.companyId?._id || s.companyId)?.toString(), s.available ?? 0));
          freshEligible.forEach(s => {
            const sId = (s.companyId?._id || s.companyId)?.toString();
            if (!availMap.has(sId)) availMap.set(sId, s.available ?? 0);
          });
          setRows(prevRows => prevRows.map(r => {
            const rPk = getPoolKey(r.companyId, r.bottleName || r.plainBottle, bottlePerBoxes);
            if (rPk === pk) {
              return {
                ...r,
                stockAllocation: computeSplitSuggestion(r.coatedQty, updatedSources, availMap, r.companyId)
              };
            }
            return r;
          }));
        }
      }
    }).catch(err => console.error("Error fetching updated sources stock on Edit:", err));
  };

  const handleSplitChange = (index, sourceId, val) => {
    setRows(prevRows => {
      const updated = [...prevRows];
      const r = { ...updated[index] };
      const pk = getPoolKey(r.companyId, r.bottleName || r.plainBottle, bottlePerBoxes);
      const sources = (poolSourcesMap[pk] || r.stockSources || [r.companyId]).map(id => (id?._id || id)?.toString());
      const Q = Number(r.coatedQty) || 0;
      const parsedVal = val === '' ? '' : Math.max(0, parseInt(val, 10) || 0);

      let currentAlloc = Array.isArray(r.stockAllocation) ? [...r.stockAllocation] : [];
      sources.forEach(sId => {
        if (!currentAlloc.some(a => (a.companyId?._id || a.companyId)?.toString() === sId)) {
          currentAlloc.push({ companyId: sId, qty: 0 });
        }
      });

      if (sources.length === 2) {
        const targetIdStr = (sourceId?._id || sourceId)?.toString();
        const otherSourceId = sources.find(id => id !== targetIdStr);
        const thisQty = typeof parsedVal === 'number' ? parsedVal : 0;
        const otherQty = Math.max(0, Q - thisQty);
        currentAlloc = [
          { companyId: targetIdStr, qty: parsedVal },
          { companyId: otherSourceId, qty: otherQty }
        ];
      } else {
        currentAlloc = currentAlloc.map(a => {
          const aId = (a.companyId?._id || a.companyId)?.toString();
          if (aId === (sourceId?._id || sourceId)?.toString()) {
            return { companyId: aId, qty: parsedVal };
          }
          return a;
        });
      }
      r.stockAllocation = currentAlloc;
      updated[index] = r;
      return updated;
    });
  };

  const [rows, setRows] = useState([
    {
      sectionId: 'edit_sec_0',
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

  const [companyPlainBottles, setCompanyPlainBottles] = useState({});

  useEffect(() => {
    const companyIds = Array.from(new Set(rows.map(r => r.companyId).filter(Boolean)));
    companyIds.forEach(async (cid) => {
      if (!companyPlainBottles[cid]) {
        try {
          const res = await API.get('/bottle-per-box/plain-bottles', { params: { companyId: cid } });
          if (res.data?.success) {
            setCompanyPlainBottles(prev => ({
              ...prev,
              [cid]: {
                companyBottles: res.data.data || [],
                otherBottles: res.data.otherBottles || []
              }
            }));
          }
        } catch (err) {
          console.error("Failed to fetch plain bottles for company", cid, err);
        }
      }
    });
  }, [rows]);

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

  // Keep opening stock map in sync when planDate, company, bottle, or bottlePerBoxes changes on Edit
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

    const excludeIdsStr = groupPlanIds.length > 0 ? groupPlanIds.join(',') : id;
    poolsToFetch.forEach(async ({ companyId, bottleName }, pk) => {
      try {
        const pkSources = poolSourcesMap[pk] || [companyId];
        const res = await API.get('/lacquer-plan/stats/computed', {
          params: { bottleName, companyId, planDate, stockSources: pkSources.join(','), excludePlanIds: excludeIdsStr }
        });
        if (res.data?.success) {
          const plainStock = res.data.data.plainStock !== undefined ? res.data.data.plainStock : res.data.data.openingStock;
          const opStock = res.data.data.openingStock !== undefined ? res.data.data.openingStock : plainStock;
          setOpeningStockMap(prev => ({
            ...prev,
            [pk]: {
              plainStock: Number.isFinite(Number(plainStock)) ? Number(plainStock) : 0,
              openingStock: Number.isFinite(Number(opStock)) ? Number(opStock) : 0,
              sources: res.data.data.sources || [],
              hasSuppliers: res.data.data.hasSuppliers || false,
              eligibleSuppliers: res.data.data.eligibleSuppliers || []
            }
          }));
        }
      } catch (err) {
        console.error("Failed to fetch computed plain stock on Edit", err);
      }
    });
  }, [planDate, poolsKeyString, bottlePerBoxes, id, groupPlanIds]);

  // Load the whole group from backend API
  useEffect(() => {
    if (!id) return;
    const firstId = id.split(',')[0].trim();
    if (!firstId) return;

    const loadPlanGroup = async () => {
      try {
        const res = await API.get(`/lacquer-plan/${firstId}`);
        if (res.data?.success && res.data.data) {
          const mainPlan = res.data.data;
          const initialPlanDate = mainPlan.planDate ? new Date(mainPlan.planDate).toISOString().split('T')[0] : '';
          setPlanDate(initialPlanDate);

          const plansToLoad = (res.data.groupPlans && res.data.groupPlans.length > 0)
            ? res.data.groupPlans
            : [mainPlan];

          const loadedGroupIds = res.data.groupPlanIds || plansToLoad.map(p => p._id);
          setGroupPlanIds(loadedGroupIds);

          // Stable sort so rows of the same brand are contiguous
          const sortedPlans = [...plansToLoad].sort((a, b) => {
            const brandA = (a.brandId?._id || a.brandId || '').toString();
            const brandB = (b.brandId?._id || b.brandId || '').toString();
            if (brandA !== brandB) return brandA.localeCompare(brandB);
            return (a.rowSeq || 0) - (b.rowSeq || 0);
          });

          const brandSectionMap = new Map();
          let secCounter = 0;

          const initialRows = sortedPlans.map((plan, pIdx) => {
            const brandKey = (plan.brandId?._id || plan.brandId || `brand_${pIdx}`).toString();
            if (!brandSectionMap.has(brandKey)) {
              brandSectionMap.set(brandKey, `section_${secCounter++}`);
            }
            const sectionId = brandSectionMap.get(brandKey);
            const cleanProcess = (plan.process === 'C' || plan.process === 'C+P' || plan.process === 'C+F') ? plan.process : 'C';

            const rawBottleName = plan.bottleName || '';
            const bp = (bottlePerBoxes || []).find(b => {
              if ((b.plainBottleName || b.bottleName || '').trim().toUpperCase() === String(rawBottleName).trim().toUpperCase()) return true;
              const names = (Array.isArray(b.bottleNames) && b.bottleNames.length > 0)
                ? b.bottleNames
                : [b.bottleName || b.plainBottleName].filter(Boolean);
              return names.some(n => n.trim().toUpperCase() === String(rawBottleName).trim().toUpperCase());
            });
            const canonicalPlain = bp ? (bp.plainBottleName || bp.bottleName) : rawBottleName;
            const plainBottleId = plan.plainBottleId || (bp ? bp._id.toString() : '');

            return {
              _id: plan._id,
              sectionId: sectionId,
              groupKey: plan.groupKey,
              rowSeq: plan.rowSeq || (pIdx + 1),
              companyId: plan.canonicalCompanyId || plan.companyId?._id || plan.companyId || '',
              brandId: plan.brandId?._id || plan.brandId || '',
              bottleName: canonicalPlain,
              plainBottle: canonicalPlain,
              plainBottleId: plainBottleId,
              variantId: plan.variantId?._id ? [plan.variantId._id] : (plan.variantId ? [plan.variantId] : []),
              colour: plan.coatingShade || plan.colour || '',
              process: cleanProcess,
              plainStock: res.data.plainStock !== undefined ? res.data.plainStock : (plan.plainStock !== undefined ? plan.plainStock : 0),
              stockSources: Array.isArray(plan.stockSources) && plan.stockSources.length > 0 ? plan.stockSources.map(s => (s._id || s).toString()) : [plan.canonicalCompanyId || plan.companyId?._id || plan.companyId || ''],
              stockAllocation: Array.isArray(plan.stockAllocation) ? plan.stockAllocation : [],
              boxQty: plan.boxQty || '',
              orderQty: plan.orderQty || '',
              coatedQty: plan.coatingCompletedQty !== undefined ? plan.coatingCompletedQty : (plan.coatedQty || 0),
              balanceToMake: plan.balanceToMake || 0,
              dispatchBalance: plan.dispatchPendingQty !== undefined ? plan.dispatchPendingQty : (plan.dispatchBalance || 0),
              soldQty: plan.soldQty || 0,
              noOfBoxes: plan.noOfBoxes || '',
              remarks: plan.remarks || ''
            };
          });

          setRows(initialRows);
          const initialSourcesMap = {};
          initialRows.forEach(row => {
            const pk = getPoolKey(row.companyId, row.bottleName || row.plainBottle, bottlePerBoxes);
            if (pk && row.stockSources) {
              initialSourcesMap[pk] = row.stockSources;
            }
          });
          setPoolSourcesMap(initialSourcesMap);

          const newStockMap = {};
          initialRows.forEach(row => {
            if (row.companyId && row.bottleName) {
              const pk = getPoolKey(row.companyId, row.bottleName || row.plainBottle, bottlePerBoxes);
              if (pk) {
                const plainStock = res.data.plainStock !== undefined ? res.data.plainStock : res.data.openingStock;
                const opStock = res.data.openingStock !== undefined ? res.data.openingStock : plainStock;
                newStockMap[pk] = {
                  plainStock: Number.isFinite(Number(plainStock)) ? Number(plainStock) : 0,
                  openingStock: Number.isFinite(Number(opStock)) ? Number(opStock) : 0,
                  sources: res.data.sources || [],
                  hasSuppliers: res.data.hasSuppliers || false,
                  eligibleSuppliers: res.data.eligibleSuppliers || []
                };
              }
            }
          });
          setOpeningStockMap(prev => ({ ...prev, ...newStockMap }));
        }
      } catch (err) {
        console.error("Failed to load plan group in EditLacquerPlan", err);
      }
    };

    loadPlanGroup();
  }, [id, bottlePerBoxes]);

  useEffect(() => {
    if (location.state?.savedRows) {
      const { savedRows, rowIndex, companyId: sCompanyId, brandId: sBrandId, planDate: sPlanDate } = location.state;
      const newVariantId = location.state.newVariantId;
      const shade = location.state.coatingShade || location.state.restoredFormData?.coatingShade || '';

      if (savedRows && newVariantId && rowIndex !== undefined && savedRows[rowIndex]) {
        dispatch(fetchVariants({ pagination: 'false' }));
        const updatedRows = [...savedRows];
        updatedRows[rowIndex].variantId = [newVariantId];
        if (shade) {
          updatedRows[rowIndex].colour = shade;
        } else {
          const foundVar = (variants || []).find(v => v._id === newVariantId);
          if (foundVar?.coatingShade) {
            updatedRows[rowIndex].colour = foundVar.coatingShade;
          }
        }
        setRows(updatedRows);
        if (sPlanDate) setPlanDate(sPlanDate);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const addEntryRow = (groupId) => {
    setRows(prevRows => {
      const secRow = prevRows.find(r => (r.sectionId || r.groupKey) === groupId) || prevRows[0];
      const newRow = {
        sectionId: groupId || 'edit_sec_0',
        groupKey: secRow?.groupKey || '',
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
      const lastSecRowIndex = prevRows.map(r => (r.sectionId || r.groupKey)).lastIndexOf(groupId);
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
    const baseRow = rows[0];
    setRows(prevRows => [
      ...prevRows,
      {
        sectionId: secId,
        groupKey: baseRow?.groupKey || '',
        companyId: baseRow?.companyId || '',
        brandId: '',
        bottleName: baseRow?.bottleName || '',
        plainBottle: baseRow?.plainBottle || baseRow?.bottleName || '',
        plainBottleId: baseRow?.plainBottleId || '',
        variantId: [],
        colour: '',
        process: 'C',
        plainStock: baseRow?.plainStock || 0,
        boxQty: baseRow?.boxQty || '',
        orderQty: '',
        coatedQty: '',
        balanceToMake: '',
        dispatchBalance: 0,
        soldQty: 0,
        noOfBoxes: '',
        remarks: ''
      }
    ]);
  };

  const removeSection = (groupId) => {
    const sectionRows = rows.filter(r => (r.sectionId || 'edit_sec_0') === groupId);
    const sectionIdsToDelete = sectionRows.map(r => r._id).filter(id => id);
    if (sectionIdsToDelete.length > 0) {
      setDeletedIds(prev => [...prev, ...sectionIdsToDelete]);
    }
    
    setRows(prevRows => {
      const newRows = prevRows.filter(r => (r.sectionId || 'edit_sec_0') !== groupId);
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
      const row = prevRows[index];
      if (row && row._id) {
        setDeletedIds(prev => [...prev, row._id]);
      }
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
          return { ...r, brandId: value, variantId: [] };
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
         if (!value) {
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

         plainBottleId = value;
         let selectedOption = plainBottleOptions.find(opt => opt.value === value);
         if (!selectedOption && typeof value === 'string' && value) {
           selectedOption = plainBottleOptions.find(opt =>
             (opt.label || '').trim().toLowerCase() === value.trim().toLowerCase() ||
             (opt.plainBottleName || '').trim().toLowerCase() === value.trim().toLowerCase()
           );
         }

         if (selectedOption) {
           valStr = selectedOption.plainBottleName || selectedOption.label;
           plainBottleId = selectedOption.value;
           currentRow.plainBottleId = plainBottleId;
           currentRow.bottleName = valStr;
           currentRow.plainBottle = valStr;
         } else {
           valStr = (currentRow.bottleName || value).trim();
           currentRow.plainBottleId = value;
           currentRow.bottleName = valStr;
           currentRow.plainBottle = valStr;
         }

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
         (b.plainBottleName || b.bottleName || '').trim().toLowerCase() === valStr.toLowerCase() ||
         String(b._id) === String(plainBottleId)
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
            params: { bottleName: valStr, companyId: currentRow.companyId, planDate, excludePlanIds: id }
          });
          const fetchedStock = res.data?.success ? (res.data.data.plainStock || 0) : 0;
          const fetchedOpeningStock = res.data?.success && res.data.data.openingStock !== undefined ? res.data.data.openingStock : fetchedStock;
          const pk = getPoolKey(currentRow.companyId, valStr, bottlePerBoxes);
          if (pk) {
            setOpeningStockMap(prev => ({
              ...prev,
              [pk]: {
                plainStock: Number.isFinite(Number(fetchedStock)) ? Number(fetchedStock) : 0,
                openingStock: Number.isFinite(Number(fetchedOpeningStock)) ? Number(fetchedOpeningStock) : 0,
                sources: res.data?.data?.sources || [],
                hasSuppliers: res.data?.data?.hasSuppliers || false,
                eligibleSuppliers: res.data?.data?.eligibleSuppliers || []
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
          const cRes = await API.get('/lacquer-plan/stats/computed', {
            params: { bottleName: valStr, brandId: currentRow.brandId, colour: currentRow.colour }
          });
          if (cRes.data?.success) {
            currentRow.coatedQty = cRes.data.data.coatedQty;
            currentRow.balanceToMake = (cRes.data.data.coatedQty || 0) - (parseFloat(currentRow.orderQty) || 0);
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

      const pk = getPoolKey(currentRow.companyId, currentRow.bottleName || currentRow.plainBottle, bottlePerBoxes);
      const sources = poolSourcesMap[pk] || currentRow.stockSources || [currentRow.companyId];
      if (sources.length >= 2) {
        const poolData = openingStockMap[pk] || {};
        const sourcesAvailMap = new Map();
        (poolData.sources || []).forEach(s => {
          sourcesAvailMap.set((s.companyId?._id || s.companyId)?.toString(), s.available ?? 0);
        });
        (poolData.eligibleSuppliers || []).forEach(s => {
          const sId = (s.companyId?._id || s.companyId)?.toString();
          if (!sourcesAvailMap.has(sId)) {
            sourcesAvailMap.set(sId, s.available ?? 0);
          }
        });
        const currentSum = (currentRow.stockAllocation || []).reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
        if (currentSum !== newCoatedQty) {
          currentRow.stockAllocation = computeSplitSuggestion(newCoatedQty, sources, sourcesAvailMap, currentRow.companyId);
        }
      }
    }

    if (field === 'colour') {
      const shadeVal = (value || '').trim().toLowerCase();
      if (shadeVal && (currentRow.bottleName || currentRow.plainBottle)) {
        const curBottleUpper = (currentRow.plainBottle || currentRow.bottleName || '').trim().toUpperCase();
        const selectedBottle = (bottlePerBoxes || []).find(b =>
          (b.plainBottleName || b.bottleName || '').trim().toLowerCase() === curBottleUpper.toLowerCase()
        );
        const groupedNames = new Set([curBottleUpper]);
        if (selectedBottle) {
          const names = (Array.isArray(selectedBottle.bottleNames) && selectedBottle.bottleNames.length > 0)
            ? selectedBottle.bottleNames
            : [selectedBottle.bottleName || selectedBottle.plainBottleName].filter(Boolean);
          names.forEach(n => groupedNames.add(n.trim().toUpperCase()));
        }

        const matchingVar = (variants || []).find(v => {
          if (!v.variantName) return false;
          if ((v.coatingShade || '').trim().toLowerCase() !== shadeVal) return false;
          const spec = (bottleSpecs || []).find(bs => bs._id?.toString() === (v.bottleSpecId?._id || v.bottleSpecId)?.toString());
          if (!spec) return false;
          if (currentRow.brandId) {
            const vBrandId = (spec.brandId?._id || spec.brandId)?.toString();
            if (vBrandId && vBrandId !== currentRow.brandId.toString()) return false;
          }
          const specBName = (spec.bottleName || '').trim().toUpperCase();
          return groupedNames.has(specBName);
        });

        if (matchingVar) {
          currentRow.variantId = [matchingVar._id];
        }
      }

      if (currentRow.bottleName && currentRow.brandId) {
        try {
          const res = await API.get('/lacquer-plan/stats/computed', {
            params: {
              bottleName: currentRow.bottleName,
              brandId: currentRow.brandId,
              colour: value
            }
          });
          if (res.data?.success) {
            setRows(currentRows => {
              const updatedRows = [...currentRows];
              const r = updatedRows[index];
              if (r) {
                r.coatedQty = res.data.data.coatedQty;
                const oQty = parseFloat(r.orderQty);
                r.balanceToMake = (!isNaN(oQty) && String(r.orderQty).trim() !== '') ? ((res.data.data.coatedQty || 0) - oQty) : 0;
              }
              return updatedRows;
            });
          }
        } catch (err) {
          console.error("Failed to fetch coatedQty", err);
        }
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
            groupKey: currentRow.groupKey,
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
        const excludeIdsStr = groupPlanIds.length > 0 ? groupPlanIds.join(',') : id;
        API.get('/lacquer-plan/stats/computed', {
          params: { bottleName: currentRow.bottleName, companyId: currentRow.companyId, planDate, excludePlanIds: excludeIdsStr }
        }).then(res => {
          if (res.data?.success) {
            const fetchedStock = res.data.data.plainStock !== undefined ? res.data.data.plainStock : 0;
            const fetchedOpeningStock = res.data.data.openingStock !== undefined ? res.data.data.openingStock : fetchedStock;
            const pk = getPoolKey(currentRow.companyId, currentRow.bottleName || currentRow.plainBottle, bottlePerBoxes);
            if (pk) {
              setOpeningStockMap(prev => ({
                ...prev,
                [pk]: {
                  plainStock: Number.isFinite(Number(fetchedStock)) ? Number(fetchedStock) : 0,
                  openingStock: Number.isFinite(Number(fetchedOpeningStock)) ? Number(fetchedOpeningStock) : 0,
                  sources: res.data?.data?.sources || [],
                  hasSuppliers: res.data?.data?.hasSuppliers || false,
                  eligibleSuppliers: res.data?.data?.eligibleSuppliers || []
                }
              }));
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
        const excludeIdsStr = groupPlanIds.length > 0 ? groupPlanIds.join(',') : id;
        rowsToAdd.forEach(clonedRow => {
          const vid = clonedRow.variantId[0];
          if (clonedRow.bottleName && clonedRow.companyId) {
            API.get('/lacquer-plan/stats/computed', {
              params: { bottleName: clonedRow.bottleName, companyId: clonedRow.companyId, brandId: clonedRow.brandId, colour: clonedRow.colour, planDate, excludePlanIds: excludeIdsStr }
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
    if (!missingPlainBottleData.bottleName || !missingPlainBottleData.bottleName.trim()) {
      Swal.fire('Error', 'Please enter a Plain Bottle name', 'error');
      return;
    }
    setCreatingSpec(true);
    try {
      const bottleNameVal = missingPlainBottleData.bottleName.trim();
      const bpbValue = missingPlainBottleData.bottlePerBox !== '' && missingPlainBottleData.bottlePerBox !== null && missingPlainBottleData.bottlePerBox !== undefined
        ? Number(missingPlainBottleData.bottlePerBox)
        : null;

      // 1. Create / upsert bottle-per-box with brand & printing info
      const bpbRes = await API.post('/bottle-per-box', {
        bottleName: bottleNameVal,
        plainBottleName: bottleNameVal,
        bottleNames: [bottleNameVal],
        bottlePerBox: bpbValue,
        brandId: missingPlainBottleData.brandId || undefined,
        printingTypeId: missingPlainBottleData.printingTypeId || undefined,
        printingColorId: missingPlainBottleData.printingColorId || undefined,
        status: true
      });

      // 2. Also ensure BottleSpec is explicitly created or upserted if brandId is available
      if (missingPlainBottleData.brandId) {
        try {
          await API.post('/bottle-spec', {
            brandId: missingPlainBottleData.brandId,
            bottleName: bottleNameVal,
            printingTypeId: missingPlainBottleData.printingTypeId || null,
            printingColorId: missingPlainBottleData.printingColorId || null,
            bottlePerBox: bpbValue,
            isCoating: true,
            isPrinting: true,
            status: true,
            upsert: true
          });
        } catch (specErr) {
          console.warn('Could not create/update bottle spec from plain bottle modal:', specErr);
        }
      }

      // 3. Refresh both bottlePerBoxes and bottleSpecs
      await Promise.all([
        dispatch(fetchBottlePerBoxes({ pagination: 'false' })).unwrap(),
        dispatch(fetchBottleSpecs({ pagination: 'false', type: 'all' })).unwrap()
      ]);

      Swal.fire({
        icon: 'success',
        title: 'Plain Bottle Created',
        text: `"${bottleNameVal}" created successfully for ${missingPlainBottleData.companyName || 'plan'}!`,
        showConfirmButton: false,
        timer: 2500,
        toast: true,
        position: 'top-end',
      });

      setShowMissingPlainBottleModal(false);

      if (missingPlainBottleData.rowIndex !== undefined && missingPlainBottleData.rowIndex !== null) {
        const targetBottleId = bpbRes.data?.data?._id || bottleNameVal;
        const targetRowIndex = missingPlainBottleData.rowIndex;
        const targetRow = rows[targetRowIndex];
        const sectionId = targetRow?.sectionId || targetRow?.groupKey;
        const compId = targetRow?.companyId || missingPlainBottleData.companyId;

        let fetchedStock = 0;
        let fetchedOpeningStock = 0;
        if (bottleNameVal && compId) {
          try {
            const res = await API.get('/lacquer-plan/stats/computed', {
              params: { bottleName: bottleNameVal, companyId: compId, planDate }
            });
            if (res.data?.success) {
              fetchedStock = res.data.data.plainStock || 0;
              fetchedOpeningStock = res.data.data.openingStock !== undefined ? res.data.data.openingStock : fetchedStock;
              const pk = getPoolKey(compId, bottleNameVal, [{ plainBottleName: bottleNameVal, bottleName: bottleNameVal, _id: targetBottleId }]);
              if (pk) {
                setOpeningStockMap(prev => ({
                  ...prev,
                  [pk]: {
                    plainStock: Number.isFinite(Number(fetchedStock)) ? Number(fetchedStock) : 0,
                    openingStock: Number.isFinite(Number(fetchedOpeningStock)) ? Number(fetchedOpeningStock) : 0
                  }
                }));
              }
            }
          } catch (stkErr) {
            console.error('Failed to fetch stock for new plain bottle', stkErr);
          }
        }

        setRows(prevRows => {
          return prevRows.map((r, rIdx) => {
            const isTargetRow = rIdx === targetRowIndex;
            const isSibling = sectionId && (r.sectionId === sectionId || r.groupKey === sectionId);
            if (isTargetRow || isSibling) {
              const updated = {
                ...r,
                plainBottleId: targetBottleId,
                bottleName: bottleNameVal,
                plainBottle: bottleNameVal,
                boxQty: bpbValue !== null ? bpbValue : r.boxQty,
                printingTypeId: missingPlainBottleData.printingTypeId || r.printingTypeId,
                printingColorId: missingPlainBottleData.printingColorId || r.printingColorId,
                plainStock: fetchedStock
              };
              if (isTargetRow) {
                updated.variantId = [];
                updated.colour = '';
              }
              return updated;
            }
            return r;
          });
        });
      }

    } catch (error) {
      console.error('Error creating plain bottle:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.message || 'Failed to create plain bottle' });
    } finally {
      setCreatingSpec(false);
    }
  };

  const handleCreatePrintingTypeForPlainBottle = async (inputValue) => {
    if (!inputValue || !inputValue.trim()) return;
    const name = inputValue.trim();
    const existing = (printingTypes || []).find(t => t.name?.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setMissingPlainBottleData(prev => ({ ...prev, printingTypeId: existing._id }));
      return;
    }
    try {
      const res = await API.post('/printing-type', { name, status: true });
      if (res.data?._id) {
        setMissingPlainBottleData(prev => ({ ...prev, printingTypeId: res.data._id }));
        dispatch(fetchPrintingTypes({ pagination: 'false' }));
        Swal.fire({ icon: 'success', title: 'Printing Type Created', text: `Created "${name}"`, timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
      }
    } catch (err) {
      console.error('Error creating printing type:', err);
      Swal.fire('Error', err.response?.data?.message || err.response?.data || err.message || 'Failed to create printing type', 'error');
    }
  };

  const handleCreatePrintingColorForPlainBottle = async (inputValue) => {
    if (!inputValue || !inputValue.trim()) return;
    const name = inputValue.trim();
    const existing = (printingColors || []).find(c => c.name?.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setMissingPlainBottleData(prev => ({ ...prev, printingColorId: existing._id }));
      return;
    }
    const pTypeId = missingPlainBottleData.printingTypeId || (printingTypes && printingTypes[0]?._id);
    if (!pTypeId) {
      return Swal.fire('Notice', 'Please select or create a Printing Type first.', 'info');
    }
    try {
      const res = await API.post('/printing-color', { printingTypeId: pTypeId, name, status: true });
      if (res.data?._id) {
        setMissingPlainBottleData(prev => ({ ...prev, printingColorId: res.data._id }));
        dispatch(fetchPrintingColors({ pagination: 'false' }));
        Swal.fire({ icon: 'success', title: 'Printing Color Created', text: `Created "${name}"`, timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
      }
    } catch (err) {
      console.error('Error creating printing color:', err);
      Swal.fire('Error', err.response?.data?.message || err.response?.data || err.message || 'Failed to create printing color', 'error');
    }
  };

  const handleCreatePrintingTypeForSpec = async (inputValue) => {
    if (!inputValue || !inputValue.trim()) return;
    const name = inputValue.trim();
    const existing = (printingTypes || []).find(t => t.name?.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setMissingSpecData(prev => ({ ...prev, printingTypeId: existing._id }));
      return;
    }
    try {
      const res = await API.post('/printing-type', { name, status: true });
      if (res.data?._id) {
        setMissingSpecData(prev => ({ ...prev, printingTypeId: res.data._id }));
        dispatch(fetchPrintingTypes({ pagination: 'false' }));
        Swal.fire({ icon: 'success', title: 'Printing Type Created', text: `Created "${name}"`, timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
      }
    } catch (err) {
      console.error('Error creating printing type:', err);
      Swal.fire('Error', err.response?.data?.message || err.response?.data || err.message || 'Failed to create printing type', 'error');
    }
  };

  const handleCreatePrintingColorForSpec = async (inputValue) => {
    if (!inputValue || !inputValue.trim()) return;
    const name = inputValue.trim();
    const existing = (printingColors || []).find(c => c.name?.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setMissingSpecData(prev => ({ ...prev, printingColorId: existing._id }));
      return;
    }
    const pTypeId = missingSpecData.printingTypeId || (printingTypes && printingTypes[0]?._id);
    if (!pTypeId) {
      return Swal.fire('Notice', 'Please select or create a Printing Type first.', 'info');
    }
    try {
      const res = await API.post('/printing-color', { printingTypeId: pTypeId, name, status: true });
      if (res.data?._id) {
        setMissingSpecData(prev => ({ ...prev, printingColorId: res.data._id }));
        dispatch(fetchPrintingColors({ pagination: 'false' }));
        Swal.fire({ icon: 'success', title: 'Printing Color Created', text: `Created "${name}"`, timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
      }
    } catch (err) {
      console.error('Error creating printing color:', err);
      Swal.fire('Error', err.response?.data?.message || err.response?.data || err.message || 'Failed to create printing color', 'error');
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
          returnTo: `/lacquer-plan/edit/${id}`,
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

    // Validate per-row stock splits for multiple sources
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx];
      if (!r.bottleName) continue;
      const rPk = getPoolKey(r.companyId, r.bottleName, bottlePerBoxes);
      const sources = poolSourcesMap[rPk] || r.stockSources || [r.companyId];
      if (sources.length >= 2) {
        const pData = openingStockMap[rPk] || {};
        const q = Number(r.coatedQty) || 0;
        const alloc = r.stockAllocation || [];
        let sum = 0;
        for (const sId of sources) {
          const sAvail = pData?.sources?.find(src => src.companyId === sId)?.available ?? 0;
          const comp = (companies || []).find(c => c._id === sId);
          const sName = comp?.name || 'Company';
          const partObj = alloc.find(a => (a.companyId?._id || a.companyId)?.toString() === sId);
          const partQty = partObj ? Number(partObj.qty) : 0;
          if (partQty > sAvail) {
            Swal.fire('Error', `Row ${rIdx + 1}: Only ${sAvail} bottles available for ${sName}`, 'error');
            return;
          }
          sum += partQty;
        }
        if (sum !== q) {
          Swal.fire('Error', `Row ${rIdx + 1}: Split must add up to ${q} (now ${sum})`, 'error');
          return;
        }
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

    const newPayloads = [];
    const promises = [];
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
         
         const effectiveExclude = groupPlanIds.length > 0 ? groupPlanIds.join(',') : id;

         if (row.variantId && row.variantId.length > 0) {
           row.variantId.forEach(vid => {
             const comboKey = `${row.companyId.toString()}-${row.brandId.toString()}-${row.bottleName.trim().toLowerCase()}-${vid.toString()}`;
             if (comboSet.has(comboKey)) {
               hasDuplicate = true;
             }
             comboSet.add(comboKey);

             const rowPoolKey = getPoolKey(row.companyId, row.bottleName, bottlePerBoxes);
             const rowShownStock = rowPoolKey && poolDerivedStats[rowPoolKey]
               ? poolDerivedStats[rowPoolKey].shownStock
               : (parseFloat(row.plainStock) || 0);

             const payloadData = {
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
               plainStock: rowShownStock,
               stockSources: row.stockSources || (poolSourcesMap[rowPoolKey] || [row.companyId]),
               stockAllocation: row.stockAllocation || [],
               stockWarningAcknowledged: true,
               excludePlanIds: effectiveExclude,
               allFormRows: rows
             };
             
             if (row._id) {
                 promises.push(API.put(`/lacquer-plan/${row._id}`, payloadData));
             } else {
                 newPayloads.push(payloadData);
             }
           });
         } else if (isShreno) {
           const comboKey = `${row.companyId.toString()}-${row.brandId.toString()}-${row.bottleName.trim().toLowerCase()}-${(row.colour || '').trim().toLowerCase()}`;
           if (comboSet.has(comboKey)) {
             hasDuplicate = true;
           }
           comboSet.add(comboKey);

           const rowPoolKey = getPoolKey(row.companyId, row.bottleName, bottlePerBoxes);
           const rowShownStock = rowPoolKey && poolDerivedStats[rowPoolKey]
             ? poolDerivedStats[rowPoolKey].shownStock
             : (parseFloat(row.plainStock) || 0);

           const payloadData = {
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
             plainStock: rowShownStock,
             stockWarningAcknowledged: true,
             excludePlanIds: effectiveExclude,
             allFormRows: rows
           };
           
           if (row._id) {
               promises.push(API.put(`/lacquer-plan/${row._id}`, payloadData));
           } else {
               newPayloads.push(payloadData);
           }
         }
      }
    });

    if (newPayloads.length > 0) {
        promises.push(API.post('/lacquer-plan', newPayloads));
    }
    
    deletedIds.forEach(delId => {
        promises.push(API.delete(`/lacquer-plan/${delId}`));
    });

    if (hasError) return Swal.fire('Error', 'Please fill in all required fields (Bottle Name, Coating Shade, Process, Order Qty, and Variant where applicable) for each entered row.', 'error');
    if (hasDuplicate) return Swal.fire('Error', 'This Bottle Name and Variant/Shade combination is repeated.', 'error');
    if (promises.length === 0) return Swal.fire('Error', 'Please ensure at least one valid entry is provided.', 'error');

    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    Promise.all(promises).then(() => {
        Swal.fire('Success', 'Plan group updated successfully', 'success');
        navigate('/lacquer-plan');
    }).catch(err => {
        Swal.fire('Error', err.response?.data?.message || 'Failed to update plan group', 'error');
    });
  };

  const companyOptions = useMemo(() => {
    return (companies || [])
      .filter(c => c && c.status !== false && !c.isDeleted && !c.isStockSupplier)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
      .map(c => ({ value: c._id, label: c.name }));
  }, [companies]);

  const uniqueCoatingShades = Array.from(new Set([
    ...(variants || []).map(v => v.coatingShade),
    ...(bottleSpecs || []).map(s => s.coatingShade)
  ].filter(shade => shade && shade.trim() !== '')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(shade => ({ value: shade, label: shade }));

  const sortedPrintingColors = useMemo(() => {
    return [...(printingColors || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [printingColors]);

  const sortedPrintingTypes = useMemo(() => {
    return [...(printingTypes || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [printingTypes]);

  const printingTypeOptions = useMemo(() => {
    return (sortedPrintingTypes || []).map(pt => ({ value: pt._id, label: pt.name }));
  }, [sortedPrintingTypes]);

  const printingColorOptions = useMemo(() => {
    return (sortedPrintingColors || []).map(pc => ({ value: pc._id, label: pc.name }));
  }, [sortedPrintingColors]);

  const normalizeRollOn = (str) => {
    if (!str) return '';
    return String(str)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/ROLL\s*ON/g, 'ROLLON')
      .replace(/ROLL-ON/g, 'ROLLON');
  };

  const plainBottleOptions = useMemo(() => {
    const unique = new Map();
    (bottlePerBoxes || []).forEach(b => {
      const name = (b.plainBottleName || b.bottleName || '').trim();
      const id = b._id?.toString() || name;
      const normKey = normalizeRollOn(name);
      if (name && !unique.has(normKey)) {
        unique.set(normKey, { 
          value: id,  // Store the BottlePerBox ID
          label: b.plainBottleName || name,
          plainBottleName: b.plainBottleName || name,
          bottlePerBox: b.bottlePerBox !== undefined ? b.bottlePerBox : null,
          boxWeight: b.boxWeight !== undefined ? b.boxWeight : null,
          bottlePerBoxData: b  // Store full object for reference
        });
      }
    });

    return Array.from(unique.values()).sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [bottlePerBoxes]);



  return (
    <div className="page-content lacquer-plan-page lacquer-plan-form-page">
      <div className="d-flex justify-content-between align-items-end mb-4 lacquer-plan-form-header">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">Edit Plan</h1>
            <p className="page-subtitle mb-0">Update multiple lacquer plan entries</p>
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
                    const groupId = row.sectionId || 'edit_sec_0';
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
                      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
                      .map(b => ({ value: b._id, label: b.name }));
                    let filteredBottleOptions = [];
                    const cBottleInfo = companyPlainBottles[gCompanyId];
                    if (cBottleInfo && cBottleInfo.companyBottles && cBottleInfo.companyBottles.length > 0) {
                      if (gBrandId) {
                        const matchingSpecs = (bottleSpecs || []).filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === gBrandId.toString());
                        const matchingBottleNames = new Set(matchingSpecs.map(s => normalizeRollOn(s.bottleName)).filter(Boolean));
                        filteredBottleOptions = cBottleInfo.companyBottles.filter(cb => {
                          const norm = normalizeRollOn(cb.plainBottleName || cb.name);
                          if (matchingBottleNames.has(norm)) return true;
                          const matchedBox = (bottlePerBoxes || []).find(b => normalizeRollOn(b.plainBottleName || b.bottleName) === norm);
                          if (matchedBox) {
                            const names = (Array.isArray(matchedBox.bottleNames) && matchedBox.bottleNames.length > 0)
                              ? matchedBox.bottleNames
                              : [matchedBox.bottleName || matchedBox.plainBottleName].filter(Boolean);
                            return names.some(n => matchingBottleNames.has(normalizeRollOn(n)));
                          }
                          return false;
                        }).map(cb => ({
                          value: cb.id,
                          label: cb.plainBottleName || cb.name,
                          plainBottleName: cb.plainBottleName || cb.name,
                          bottlePerBox: cb.bottlePerBox,
                          boxWeight: cb.boxWeight,
                          bottlePerBoxData: cb
                        }));
                      } else {
                        filteredBottleOptions = cBottleInfo.companyBottles.map(cb => ({
                          value: cb.id,
                          label: cb.plainBottleName || cb.name,
                          plainBottleName: cb.plainBottleName || cb.name,
                          bottlePerBox: cb.bottlePerBox,
                          boxWeight: cb.boxWeight,
                          bottlePerBoxData: cb
                        }));
                      }
                    } else if (gBrandId) {
                      const matchingSpecs = (bottleSpecs || []).filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === gBrandId.toString());
                      const matchingBottleNames = new Set(matchingSpecs.map(s => normalizeRollOn(s.bottleName)).filter(Boolean));

                      filteredBottleOptions = plainBottleOptions.filter(opt => {
                        const optName = normalizeRollOn(opt.label || opt.plainBottleName);
                        if (matchingBottleNames.has(optName)) return true;
                        const matchedBox = (bottlePerBoxes || []).find(b => 
                          normalizeRollOn(b.plainBottleName || b.bottleName) === optName
                        );
                        if (matchedBox) {
                          const names = (Array.isArray(matchedBox.bottleNames) && matchedBox.bottleNames.length > 0)
                            ? matchedBox.bottleNames
                            : [matchedBox.bottleName || matchedBox.plainBottleName].filter(Boolean);
                          return names.some(n => matchingBottleNames.has(normalizeRollOn(n)));
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
                                <th className="small text-muted text-center align-middle" style={{width: '3%'}}>#</th>
                                <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>Plain Bottle <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.variant} {!isShrenoSection && <span className="text-danger">*</span>}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.coatingShade} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.process} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.plainStock}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '7%'}}>{labels.orderQty} <span className="text-danger">*</span></th>
                                <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.coatingCompletedQty}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.balanceToMake}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.bottlePerBox}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.noOfOrderBoxes}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.dispatchPendingQty}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '5%'}}>{labels.soldQty}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '15%', minWidth: '250px'}}>{labels.remarks}</th>
                                <th className="small text-muted text-center align-middle" style={{width: '3%'}}></th>
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
                                  const poolInfo = (rowPoolKey && poolDerivedStats[rowPoolKey]) || { openingStock: 0, totalCoated: 0, totalOrder: 0, shownStock: 0 };
                                  const currentShownStock = rowPoolKey ? poolInfo.shownStock : (parseFloat(row.plainStock) || 0);
                                  const rowIsExceeding = checkRowStockWarning(row.orderQty, poolInfo.openingStock);

                                  const renderShadeGroupCell = true;
                                  const renderProcessCell = true;

                                // Determine available plain bottle options for this row/section
                                const currentPlainVal = row.plainBottle || row.bottleName;
                                let availablePlainBottleOptions = filteredBottleOptions;
                                
                                // Add ALL plain bottles as options (not just brand-specific ones)
                                const allPlainBottleOptions = (plainBottleOptions || [])
                                  .filter(pb => !filteredBottleOptions.some(opt => opt.value === pb.value || normalizeRollOn(opt.label || opt.plainBottleName) === normalizeRollOn(pb.label || pb.plainBottleName)))
                                  .map(pb => ({ value: pb.value, label: pb.label, plainBottleName: pb.plainBottleName }));
                                
                                // Combine: brand bottles first, then all other bottles
                                availablePlainBottleOptions = [...filteredBottleOptions, ...allPlainBottleOptions].sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }));
                                
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
                                  availablePlainBottleOptions = [{ value: currentPlainVal, label: currentPlainVal }, ...availablePlainBottleOptions].sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }));
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

                                const uniqueVariantIds = Array.from(new Set(row.variantId || []));
                                const selectedVariantObjects = uniqueVariantIds.map(vid => {
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
                                               printingTypeId: '',
                                               printingColorId: '',
                                               rowIndex: index,
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
                                       <div className="d-flex align-items-start gap-1">
                                         <div className="flex-grow-1" style={{ minWidth: 0 }}>
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
                                         </div>
                                         {(!row.variantId || row.variantId.length === 0) && (
                                           <button
                                             type="button"
                                             onClick={() => handleAddVariantClick(row.bottleName || row.plainBottle, gBrandId, index, row.colour)}
                                             className="btn btn-outline-primary px-2 shadow-none d-flex align-items-center justify-content-center gap-1"
                                             style={{ height: '38px', fontSize: '0.875rem' }}
                                             title="Add New Variant"
                                             disabled={!(row.bottleName || row.plainBottle) || !gBrandId}
                                           >
                                             <i className="bi bi-plus-lg" style={{ fontSize: '0.8rem' }}></i> Add
                                           </button>
                                         )}
                                       </div>
                                       {(row.bottleName || row.plainBottle) && variantOptions.length === 0 && !isShrenoSection && (
                                         <div style={{ fontSize: '0.7rem' }} className="text-warning mt-1">
                                           <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                           No variants. <button type="button" onClick={() => handleAddVariantClick(row.bottleName || row.plainBottle, gBrandId, index, row.colour)} className="text-decoration-underline text-warning fw-bold btn btn-link p-0 border-0 align-baseline" style={{ fontSize: 'inherit' }}>Add Variant</button>
                                         </div>
                                       )}
                                     </td>
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
                                        formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                                      />
                                    </td>
                                    <td className="align-middle">
                                      <select className="form-select form-select-sm shadow-none" value={row.process} onChange={(e) => handleRowChange(index, 'process', e.target.value)} required>
                                        <option value="C">C</option>
                                        <option value="C+P">C+P</option>
                                        <option value="C+F">C+F</option>
                                        {!["C", "C+P", "C+F"].includes(row.process) && row.process && (
                                          <option value={row.process}>{row.process}</option>
                                        )}
                                      </select>
                                    </td>
                                    {renderGroupCell && (
                                      <td rowSpan={rowSpan} className="align-middle text-center" style={{ backgroundColor: isGrouped ? '#f8f9fa' : (rowIsExceeding ? '#fff3cd' : 'inherit') }}>
                                        <input type="number" className={`form-control form-control-sm shadow-none text-center ${rowIsExceeding ? 'bg-warning' : ''}`} value={currentShownStock} readOnly />
                                        {(() => {
                                          const hasBottle = Boolean(row.bottleName || row.plainBottle);
                                          if (!hasBottle) return null;
                                          const pk = getPoolKey(row.companyId, row.bottleName || row.plainBottle, bottlePerBoxes);
                                          const selectedSources = (poolSourcesMap[pk] || row.stockSources || [row.companyId]).map(id => (id?._id || id)?.toString()).filter(id => (companies || []).some(c => (c._id || c)?.toString() === id));
                                          const ownComp = (companies || []).find(c => (c._id?.toString() || c.toString()) === (row.companyId?._id || row.companyId)?.toString());
                                          const stockSuppliers = (companies || []).filter(c => c.isStockSupplier);
                                          const poolData = openingStockMap[pk] || {};
                                          const hasSupplierWithBottle = (poolData?.hasSuppliers === true) ||
                                            (Array.isArray(poolData?.eligibleSuppliers) && poolData.eligibleSuppliers.length > 0) ||
                                            (row.stockSources && row.stockSources.some(sId => stockSuppliers.some(supp => (supp._id || supp).toString() === (sId?._id || sId)?.toString())));

                                          if (!hasSupplierWithBottle) return null;

                                          const availableSources = [ownComp, ...stockSuppliers].filter(Boolean);
                                          return (
                                            <div className="dropdown dropup mt-1 position-relative stock-from-dropdown">
                                              <button
                                                className="btn btn-sm btn-outline-secondary py-0 px-1 w-100 dropdown-toggle"
                                                type="button"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setOpenDropdownPk(prev => prev === pk ? null : pk);
                                                }}
                                                aria-expanded={openDropdownPk === pk}
                                                style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
                                              >
                                                Stock from ({selectedSources.length})
                                              </button>
                                              {openDropdownPk === pk && (
                                                <div
                                                  className="dropdown-menu show p-2 shadow"
                                                  style={{
                                                    minWidth: '220px',
                                                    zIndex: 1060,
                                                    display: 'block',
                                                    position: 'absolute',
                                                    top: 'auto', bottom: '100%', marginBottom: '4px',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    backgroundColor: '#fff',
                                                    border: '1px solid rgba(0,0,0,0.15)',
                                                    borderRadius: '6px',
                                                    boxShadow: '0 -0.5rem 1rem rgba(0,0,0,0.175)'
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <div className="small fw-bold text-muted mb-1 text-uppercase" style={{ fontSize: '11px' }}>Available Plain Stock:</div>
                                                  {availableSources.map(s => {
                                                    const sIdStr = (s._id || s).toString();
                                                    const isChecked = selectedSources.some(id => (id?._id || id)?.toString() === sIdStr);
                                                    const srcFound = (poolData?.sources || []).find(src => (src.companyId?._id || src.companyId)?.toString() === sIdStr)
                                                        || (poolData?.eligibleSuppliers || []).find(src => (src.companyId?._id || src.companyId)?.toString() === sIdStr);
                                                    const sAvail = srcFound?.available !== undefined 
                                                      ? srcFound.available 
                                                      : (sIdStr === String(row.companyId?._id || row.companyId) ? currentShownStock : 0);
                                                    return (
                                                      <div className="form-check" key={sIdStr}>
                                                        <input
                                                          className="form-check-input"
                                                          type="checkbox"
                                                          id={`edit_src_${index}_${sIdStr}`}
                                                          checked={isChecked}
                                                          onChange={(e) => handleToggleSource(pk, sIdStr, e.target.checked)}
                                                        />
                                                        <label className="form-check-label small" htmlFor={`edit_src_${index}_${sIdStr}`}>
                                                          {s.name}: <b>{sAvail}</b>
                                                        </label>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </td>
                                    )}
                                    <td>
                                      <input 
                                        type="number" 
                                        className={`form-control form-control-sm shadow-none text-center ${rowIsExceeding ? 'bg-warning' : ''}`} 
                                        value={row.orderQty} 
                                        onChange={(e) => handleRowChange(index, 'orderQty', e.target.value)}
                                        onBlur={() => {
                                          // Show popup once on blur if this pool is exceeding opening stock
                                          if (rowIsExceeding) {
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
                                      {(() => {
                                        const pk = getPoolKey(row.companyId, row.bottleName || row.plainBottle, bottlePerBoxes);
                                        const selectedSources = (poolSourcesMap[pk] || row.stockSources || [row.companyId]).map(id => (id?._id || id)?.toString()).filter(id => (companies || []).some(c => (c._id || c)?.toString() === id));
                                        if (selectedSources.length < 2) return null;

                                        const poolData = openingStockMap[pk] || {};
                                        const reqQty = Number(row.coatedQty) || 0;
                                        const alloc = row.stockAllocation || [];
                                        let allocSum = 0;
                                        let errorMsg = null;

                                        for (const sId of selectedSources) {
                                          const comp = (companies || []).find(c => (c._id || c)?.toString() === sId?.toString());
                                          const sName = comp?.name || 'Company';
                                          const sAvail = poolData?.sources?.find(src => (src.companyId?._id || src.companyId)?.toString() === sId?.toString())?.available
                                            ?? poolData?.eligibleSuppliers?.find(src => (src.companyId?._id || src.companyId)?.toString() === sId?.toString())?.available
                                            ?? 0;
                                          const partObj = alloc.find(a => (a.companyId?._id || a.companyId)?.toString() === sId?.toString());
                                          const partQty = partObj ? Number(partObj.qty) : 0;
                                          allocSum += partQty;
                                          if (partQty > sAvail && !errorMsg) {
                                            errorMsg = `Only ${sAvail} bottles available for ${sName}`;
                                          }
                                        }
                                        if (!errorMsg && allocSum !== reqQty) {
                                          errorMsg = `Split must add up to ${reqQty} (now ${allocSum})`;
                                        }

                                        return (
                                          <div className="mt-1">
                                            <div className="d-flex flex-wrap gap-1 align-items-center justify-content-center" style={{ fontSize: '11px' }}>
                                              {selectedSources.map(sId => {
                                                const comp = (companies || []).find(c => (c._id || c)?.toString() === sId?.toString());
                                                const sName = comp?.name || 'Company';
                                                const partObj = alloc.find(a => (a.companyId?._id || a.companyId)?.toString() === sId?.toString());
                                                const partQty = (partObj !== undefined && partObj.qty !== null && partObj.qty !== '') ? partObj.qty : 0;
                                                return (
                                                  <div key={sId} className="d-flex align-items-center gap-1">
                                                    <span className="badge bg-secondary" style={{ fontSize: '10px' }}>{sName}</span>
                                                    <input
                                                      type="number"
                                                      className="form-control form-control-sm text-center p-0"
                                                      style={{ width: '60px', height: '24px', fontSize: '11px' }}
                                                      value={partQty}
                                                      onChange={(e) => handleSplitChange(index, sId, e.target.value)}
                                                      min="0"
                                                    />
                                                  </div>
                                                );
                                              })}
                                            </div>
                                            {errorMsg && (
                                              <div className="text-danger fw-bold text-center mt-1" style={{ fontSize: '0.72rem', lineHeight: '1.2' }}>
                                                <i className="bi bi-exclamation-circle-fill me-1"></i>
                                                {errorMsg}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
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
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', zIndex: 1050, backdropFilter: 'blur(6px)' }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '540px' }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <div className="modal-header border-bottom-0 py-3 px-4 d-flex align-items-center justify-content-between" style={{ background: 'linear-gradient(135deg, var(--accent, #00aeef), #8b5cf6)', color: '#ffffff' }}>
                <h5 className="modal-title fw-bold text-white mb-0 d-flex align-items-center gap-2" style={{ fontSize: '1.15rem' }}>
                  <i className="bi bi-gear-fill fs-5"></i>
                  Add Bottle Specs
                </h5>
                <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setShowMissingSpecModal(false)}></button>
              </div>
              <div className="modal-body p-4 bg-white">
                <div className="alert py-3 px-3 small mb-4 rounded-3 border-0 d-flex gap-2 align-items-start" style={{ background: 'rgba(0, 174, 239, 0.08)', border: '1px solid rgba(0, 174, 239, 0.25)', color: 'var(--text-primary, #1e293b)' }}>
                   <i className="bi bi-info-circle-fill mt-1 flex-shrink-0" style={{ color: 'var(--accent, #00aeef)', fontSize: '1.1rem' }}></i>
                   <div>Bottle <strong style={{ color: 'var(--accent, #00aeef)' }}>{missingSpecData.bottleName}</strong> is missing specifications for this Brand. Please add it to continue.</div>
                </div>
                <div className="row g-3 mb-3">
                   <div className="col-md-6">
                      <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Company</label>
                      <input type="text" className="form-control shadow-none rounded-3 py-2 fw-semibold" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: 'var(--text-primary, #1e293b)' }} value={missingSpecData.companyName} disabled />
                   </div>
                   <div className="col-md-6">
                      <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Brand</label>
                      <input type="text" className="form-control shadow-none rounded-3 py-2 fw-semibold" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: 'var(--accent, #00aeef)' }} value={missingSpecData.brandName} disabled />
                   </div>
                </div>
                <div className="mb-3">
                  <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Bottle Name</label>
                  <input 
                    type="text" 
                    className="form-control shadow-none rounded-3 py-2 fw-bold" 
                    style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: 'var(--text-primary, #1e293b)' }}
                    value={missingSpecData.bottleName} 
                    disabled
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Bottle Code</label>
                  <input 
                    type="text" 
                    className="form-control shadow-none bg-white rounded-3 py-2" 
                    style={{ borderColor: '#e2e8f0' }}
                    value={missingSpecData.code} 
                    onChange={(e) => setMissingSpecData({...missingSpecData, code: e.target.value})}
                    placeholder="Optional code"
                  />
                </div>

                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Printing Type</label>
                    <CreatableSelect
                      options={printingTypeOptions}
                      value={printingTypeOptions.find(o => o.value === missingSpecData.printingTypeId) || (missingSpecData.printingTypeId ? { value: missingSpecData.printingTypeId, label: missingSpecData.printingTypeId } : null)}
                      onChange={(selected) => setMissingSpecData({ ...missingSpecData, printingTypeId: selected ? selected.value : '' })}
                      onCreateOption={handleCreatePrintingTypeForSpec}
                      placeholder="Select or type new..."
                      isClearable
                      isSearchable
                      closeMenuOnScroll={(e) => true}
                      menuPosition="fixed"
                      menuPlacement="auto"
                      menuPortalTarget={document.body}
                      styles={{
                        menuPortal: base => ({ ...base, zIndex: 9999 }),
                        control: (base, state) => ({
                          ...base,
                          borderColor: state.isFocused ? 'var(--accent, #00aeef)' : '#e2e8f0',
                          borderRadius: '0.5rem',
                          minHeight: '38px',
                          boxShadow: state.isFocused ? '0 0 0 3px rgba(0, 174, 239, 0.15)' : 'none',
                          '&:hover': {
                            borderColor: 'var(--accent, #00aeef)'
                          }
                        })
                      }}
                      formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Printing Color</label>
                    <CreatableSelect
                      options={printingColorOptions}
                      value={printingColorOptions.find(o => o.value === missingSpecData.printingColorId) || (missingSpecData.printingColorId ? { value: missingSpecData.printingColorId, label: missingSpecData.printingColorId } : null)}
                      onChange={(selected) => setMissingSpecData({ ...missingSpecData, printingColorId: selected ? selected.value : '' })}
                      onCreateOption={handleCreatePrintingColorForSpec}
                      placeholder="Select or type new..."
                      isClearable
                      isSearchable
                      closeMenuOnScroll={(e) => true}
                      menuPosition="fixed"
                      menuPlacement="auto"
                      menuPortalTarget={document.body}
                      styles={{
                        menuPortal: base => ({ ...base, zIndex: 9999 }),
                        control: (base, state) => ({
                          ...base,
                          borderColor: state.isFocused ? 'var(--accent, #00aeef)' : '#e2e8f0',
                          borderRadius: '0.5rem',
                          minHeight: '38px',
                          boxShadow: state.isFocused ? '0 0 0 3px rgba(0, 174, 239, 0.15)' : 'none',
                          '&:hover': {
                            borderColor: 'var(--accent, #00aeef)'
                          }
                        })
                      }}
                      formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Bottle Per Box</label>
                  <input 
                    type="number" 
                    className="form-control shadow-none bg-white rounded-3 py-2" 
                    style={{ borderColor: '#e2e8f0' }}
                    value={missingSpecData.bottlePerBox} 
                    onChange={(e) => setMissingSpecData({...missingSpecData, bottlePerBox: e.target.value})}
                    placeholder="Enter quantity per box"
                    min="1"
                  />
                </div>
              </div>
              <div className="modal-footer bg-light bg-opacity-50 border-top px-4 py-3 d-flex justify-content-end gap-2" style={{ borderColor: 'var(--card-border, #e2e8f0)' }}>
                <button type="button" className="btn-ghost px-4 py-2" onClick={() => setShowMissingSpecModal(false)}>Cancel</button>
                <button type="button" className="btn-accent px-4 py-2 d-flex align-items-center gap-2" onClick={handleSaveMissingSpec} disabled={creatingSpec}>
                  {creatingSpec ? (
                     <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...</>
                  ) : (
                     <><i className="bi bi-check2-circle"></i> Save Spec</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMissingPlainBottleModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', zIndex: 1050, backdropFilter: 'blur(6px)' }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '540px' }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <div className="modal-header border-bottom-0 py-3 px-4 d-flex align-items-center justify-content-between" style={{ background: 'linear-gradient(135deg, var(--accent, #00aeef), #8b5cf6)', color: '#ffffff' }}>
                <h5 className="modal-title fw-bold text-white mb-0 d-flex align-items-center gap-2" style={{ fontSize: '1.15rem' }}>
                  <i className="bi bi-plus-circle-fill fs-5"></i>
                  Add Plain Bottle
                </h5>
                <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setShowMissingPlainBottleModal(false)}></button>
              </div>
              <div className="modal-body p-4 bg-white">
                <div className="alert py-3 px-3 small mb-4 rounded-3 border-0 d-flex gap-2 align-items-start" style={{ background: 'rgba(0, 174, 239, 0.08)', border: '1px solid rgba(0, 174, 239, 0.25)', color: 'var(--text-primary, #1e293b)' }}>
                   <i className="bi bi-info-circle-fill mt-1 flex-shrink-0" style={{ color: 'var(--accent, #00aeef)', fontSize: '1.1rem' }}></i>
                   <div>Plain Bottle <strong style={{ color: 'var(--accent, #00aeef)' }}>{missingPlainBottleData.bottleName}</strong> doesn't exist for <strong>{missingPlainBottleData.companyName}</strong>. Please create it to continue.</div>
                </div>
                <div className="row g-3 mb-3">
                   <div className="col-md-6">
                      <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Company</label>
                      <input type="text" className="form-control shadow-none rounded-3 py-2 fw-semibold" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: 'var(--text-primary, #1e293b)' }} value={missingPlainBottleData.companyName} disabled />
                   </div>
                   <div className="col-md-6">
                      <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Brand</label>
                      <input type="text" className="form-control shadow-none rounded-3 py-2 fw-semibold" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: 'var(--accent, #00aeef)' }} value={missingPlainBottleData.brandName} disabled />
                   </div>
                </div>
                <div className="mb-3">
                  <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Plain Bottle Name</label>
                  <input 
                    type="text" 
                    className="form-control shadow-none bg-white rounded-3 py-2 fw-bold" 
                    style={{ borderColor: 'var(--accent, #00aeef)', borderWidth: '1.5px', color: 'var(--text-primary, #1e293b)' }}
                    value={missingPlainBottleData.bottleName} 
                    onChange={(e) => setMissingPlainBottleData({ ...missingPlainBottleData, bottleName: e.target.value })}
                    placeholder="Enter Plain Bottle Name"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Bottle Per Box</label>
                  <input 
                    type="number" 
                    className="form-control shadow-none bg-white rounded-3 py-2" 
                    style={{ borderColor: '#e2e8f0' }}
                    value={missingPlainBottleData.bottlePerBox} 
                    onChange={(e) => setMissingPlainBottleData({...missingPlainBottleData, bottlePerBox: e.target.value})}
                    placeholder="Enter quantity per box"
                    min="1"
                  />
                </div>

                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Printing Type</label>
                    <CreatableSelect
                      options={printingTypeOptions}
                      value={printingTypeOptions.find(o => o.value === missingPlainBottleData.printingTypeId) || (missingPlainBottleData.printingTypeId ? { value: missingPlainBottleData.printingTypeId, label: missingPlainBottleData.printingTypeId } : null)}
                      onChange={(selected) => setMissingPlainBottleData({ ...missingPlainBottleData, printingTypeId: selected ? selected.value : '' })}
                      onCreateOption={handleCreatePrintingTypeForPlainBottle}
                      placeholder="Select or type new..."
                      isClearable
                      isSearchable
                      closeMenuOnScroll={(e) => true}
                      menuPosition="fixed"
                      menuPlacement="auto"
                      menuPortalTarget={document.body}
                      styles={{
                        menuPortal: base => ({ ...base, zIndex: 9999 }),
                        control: (base, state) => ({
                          ...base,
                          borderColor: state.isFocused ? 'var(--accent, #00aeef)' : '#e2e8f0',
                          borderRadius: '0.5rem',
                          minHeight: '38px',
                          boxShadow: state.isFocused ? '0 0 0 3px rgba(0, 174, 239, 0.15)' : 'none',
                          '&:hover': {
                            borderColor: 'var(--accent, #00aeef)'
                          }
                        })
                      }}
                      formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-uppercase small fw-bold mb-1" style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Printing Color</label>
                    <CreatableSelect
                      options={printingColorOptions}
                      value={printingColorOptions.find(o => o.value === missingPlainBottleData.printingColorId) || (missingPlainBottleData.printingColorId ? { value: missingPlainBottleData.printingColorId, label: missingPlainBottleData.printingColorId } : null)}
                      onChange={(selected) => setMissingPlainBottleData({ ...missingPlainBottleData, printingColorId: selected ? selected.value : '' })}
                      onCreateOption={handleCreatePrintingColorForPlainBottle}
                      placeholder="Select or type new..."
                      isClearable
                      isSearchable
                      closeMenuOnScroll={(e) => true}
                      menuPosition="fixed"
                      menuPlacement="auto"
                      menuPortalTarget={document.body}
                      styles={{
                        menuPortal: base => ({ ...base, zIndex: 9999 }),
                        control: (base, state) => ({
                          ...base,
                          borderColor: state.isFocused ? 'var(--accent, #00aeef)' : '#e2e8f0',
                          borderRadius: '0.5rem',
                          minHeight: '38px',
                          boxShadow: state.isFocused ? '0 0 0 3px rgba(0, 174, 239, 0.15)' : 'none',
                          '&:hover': {
                            borderColor: 'var(--accent, #00aeef)'
                          }
                        })
                      }}
                      formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer bg-light bg-opacity-50 border-top px-4 py-3 d-flex justify-content-end gap-2" style={{ borderColor: 'var(--card-border, #e2e8f0)' }}>
                <button type="button" className="btn-ghost px-4 py-2" onClick={() => setShowMissingPlainBottleModal(false)}>Cancel</button>
                <button type="button" className="btn-accent px-4 py-2 d-flex align-items-center gap-2" onClick={handleSaveMissingPlainBottle} disabled={creatingSpec}>
                  {creatingSpec ? (
                     <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...</>
                  ) : (
                     <><i className="bi bi-plus-circle"></i> Create Plain Bottle</>
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
