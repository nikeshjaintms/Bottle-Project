import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { fetchPrintingPlanById, updatePrintingPlan, clearCurrentPlan, createPrintingPlan, deletePrintingPlan } from '../../redux/slices/printingPlanSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchPrintingTypes } from '../../redux/slices/printingTypeSlice';
import { fetchPrintingColors } from '../../redux/slices/printingColorSlice';
import { fetchItemTypes } from '../../redux/slices/itemTypeSlice';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import API from '../../services/api';
import Swal from 'sweetalert2';
import { usePrintingPlanLanguage } from '../../hooks/usePrintingPlanLanguage';
import { calculateBalanceAndStock, recalculateBalanceForBlock, calculateBalance } from '../../utils/printingPlanCalcs';

export const sortTypesList = (types = []) => {
  const getRank = (name) => {
    const s = (name || '').trim().toUpperCase();
    if (s.includes('GP')) return 1;
    if (s.includes('LID')) return 2;
    if (s.includes('BULK')) return 3;
    return 4;
  };
  return [...types].sort((a, b) => {
    const rankA = getRank(a.name);
    const rankB = getRank(b.name);
    if (rankA !== rankB) return rankA - rankB;
    return (a.name || '').localeCompare(b.name || '');
  });
};

export const getItemTypeSpecificOptions = (it) => {
  if (!it) return [];
  const optsSet = new Set();
  if (Array.isArray(it.options)) {
    it.options.forEach(opt => {
      const val = typeof opt === 'string' ? opt.trim() : (opt?.name || opt?.value || '').trim();
      if (val) optsSet.add(val);
    });
  }
  if (optsSet.size === 0 && it.name && it.name.trim()) {
    optsSet.add(it.name.trim());
  }
  return Array.from(optsSet).map(o => ({ value: o, label: o }));
};

export const getOrderedHeaders = (selectedItemTypeOptions = {}, sortedTypes = []) => {
  const ordered = [];
  sortedTypes.forEach(it => {
    const typeOptions = selectedItemTypeOptions[it.name] || [];
    typeOptions.forEach(opt => {
      if (!ordered.includes(opt)) ordered.push(opt);
    });
  });
  Object.keys(selectedItemTypeOptions).forEach(k => {
    if (!sortedTypes.some(it => it.name === k)) {
      (selectedItemTypeOptions[k] || []).forEach(opt => {
        if (!ordered.includes(opt)) ordered.push(opt);
      });
    }
  });
  return ordered;
};


const computePrintingSplitSuggestion = (qty, sources, sourcesAvailMap, ownCompId) => {
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

export default function EditPrintingPlan() {
  const { id } = useParams();
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
  const { itemTypes = [] } = useSelector((state) => state.itemTypes || {});
  const { currentPlan, loading, error } = useSelector((state) => state.printingPlans);
  const { labels, language, toggleLanguage } = usePrintingPlanLanguage();

  const [showMissingPlainBottleModal, setShowMissingPlainBottleModal] = useState(false);
  const [missingPlainBottleData, setMissingPlainBottleData] = useState({
    bottleName: '', brandId: '', companyId: '', companyName: '', brandName: '', bottlePerBox: '', printingTypeId: '', printingColorId: '', itemIndex: null, status: true
  });
  const [creatingSpec, setCreatingSpec] = useState(false);
  const [directCompanies, setDirectCompanies] = useState([]);

  const [planDate, setPlanDate] = useState('');
  const [existingGroupPlans, setExistingGroupPlans] = useState([]);

  const [block, setBlock] = useState({
    companyId: '',
    brandId: '',
    selectedItemTypeOptions: {},
    items: []
  });

  // Compute stock summary per (companyId, bottleName) for PLAIN shade rows
  const blockStockSummary = useMemo(() => {
    const summary = new Map();
    if (block.items && block.items.length > 0) {
      block.items.forEach(item => {
        const shade = (item.coatingShade || '').trim().toUpperCase();
        if (shade === 'PLAIN') {
          const bottle = (item.plainBottle || item.bottleName || '').trim().toUpperCase();
          const compId = (block.companyId || '').toString();
          const key = `${compId}::${bottle}`;
          
          if (!summary.has(key)) {
            summary.set(key, {
              plainBottleStock: parseFloat(item.plainBottleStock || item.coatedStockAvailable) || 0,
              totalOrderQty: 0,
              rows: []
            });
          }
          const poolData = summary.get(key);
          poolData.totalOrderQty += parseFloat(item.orderQty) || 0;
          poolData.rows.push(item);
        }
      });
    }
    return summary;
  }, [block.items, block.companyId]);

  const [companyPlainBottles, setCompanyPlainBottles] = useState({});

  useEffect(() => {
    const compId = block.companyId?._id || block.companyId;
    if (compId) {
      const cidStr = compId.toString();
      if (!companyPlainBottles[cidStr]) {
        API.get('/bottle-per-box/plain-bottles', { params: { companyId: cidStr } })
          .then(res => {
            if (res.data?.success) {
              setCompanyPlainBottles(prev => ({
                ...prev,
                [cidStr]: {
                  companyBottles: res.data.data || [],
                  otherBottles: res.data.otherBottles || []
                }
              }));
            }
          })
          .catch(err => console.error("Failed to fetch plain bottles for company", cidStr, err));
      }
    }
  }, [block.companyId]);

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ pagination: "false", status: true }));
    dispatch(fetchBottleSpecs({ limit: 1000, status: true }));
    dispatch(fetchBrands({ limit: 1000, status: true }));
    dispatch(fetchVariants({ limit: 1000, status: true }));
    dispatch(fetchCompanies({ pagination: 'false', page: 1, limit: 1000 }));
    dispatch(fetchPrintingTypes({ limit: 1000, status: true }));
    dispatch(fetchPrintingColors({ limit: 1000, status: true }));
    dispatch(fetchItemTypes({ page: 1, limit: 1000, status: true }));

    API.get('/company', { params: { pagination: 'false' } })
      .then(res => {
        const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
        if (Array.isArray(list) && list.length > 0) setDirectCompanies(list);
      })
      .catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    const initializeData = async () => {
      let groupPlans = [];
      if (location.state?.savedBlock) {
        setBlock(location.state.savedBlock);
        setExistingGroupPlans(location.state.editGroup || []);

        const { itemIndex, newVariantName, newCoatingShade, sPlanDate } = location.state;
        if (itemIndex !== undefined && newVariantName) {
          const updatedBlock = { ...location.state.savedBlock };
          updatedBlock.items[itemIndex].printingToBeDone = newVariantName;
          if (newCoatingShade) {
            updatedBlock.items[itemIndex].coatingShade = newCoatingShade;
          }
          setBlock(updatedBlock);
        }
        if (sPlanDate) setPlanDate(sPlanDate);
        window.history.replaceState({}, document.title);
        return;
      }

      if (location.state?.editGroup) {
        groupPlans = location.state.editGroup;
      } else {
        // Fallback if accessed without state (e.g., direct URL)
        const idArray = id.split(',');
        try {
          const promises = idArray.map(singleId => API.get(`/printing-plan/${singleId}`));
          const results = await Promise.all(promises);
          groupPlans = results.map(r => r.data?.data).filter(Boolean);
        } catch (err) {
          console.error("Failed to fetch group plans", err);
        }
      }

      if (groupPlans.length > 0) {
        setExistingGroupPlans(groupPlans);
        setPlanDate(groupPlans[0].planDate ? new Date(groupPlans[0].planDate).toISOString().split('T')[0] : '');

        const companyId = groupPlans[0].companyId?._id || groupPlans[0].companyId || '';
        const brandId = groupPlans[0].brandId?._id || groupPlans[0].brandId || '';
        const bottleName = groupPlans[0].bottleName || '';

        const existingHeaders = groupPlans.find(p => p.componentHeadersList && p.componentHeadersList.length > 0)?.componentHeadersList || [];
        const initialItemTypeOptions = {};
        existingHeaders.forEach(header => {
          const hUpper = header.toUpperCase();
          const matchingType = (itemTypes || []).find(it => {
            const tUpper = it.name.toUpperCase();
            return hUpper.includes(tUpper) || (it.options || []).some(o => o.toUpperCase() === hUpper);
          });
          const typeKey = matchingType ? matchingType.name : (
            hUpper.includes('GP') ? 'GP' : (hUpper.includes('LID') ? 'LID' : (hUpper.includes('BULK') ? 'BULK' : 'Other'))
          );
          if (!initialItemTypeOptions[typeKey]) initialItemTypeOptions[typeKey] = [];
          if (!initialItemTypeOptions[typeKey].includes(header)) initialItemTypeOptions[typeKey].push(header);
        });

        const items = groupPlans.map(plan => {
          const compMap = {};
          if (Array.isArray(plan.components)) {
            plan.components.forEach(c => {
              const key = c.itemType || c.componentType;
              if (key) compMap[key] = c.quantity;
            });
          }

          const isPlain = (plan.coatingShade || '').trim().toUpperCase() === 'PLAIN';
          const initProduced = Number(plan.producedQty) || 0;
          const initStockDeduction = Number(plan.appliedStockDeduction !== undefined ? plan.appliedStockDeduction : (plan.producedQty || 0));

          const rawBottleName = plan.plainBottleName || plan.plainBottle || plan.bottleName || '';
          const bp = (bottlePerBoxes || []).find(b => {
            if ((b.plainBottleName || b.bottleName || '').trim().toUpperCase() === String(rawBottleName).trim().toUpperCase()) return true;
            const names = (Array.isArray(b.bottleNames) && b.bottleNames.length > 0)
              ? b.bottleNames
              : [b.bottleName || b.plainBottleName].filter(Boolean);
            return names.some(n => n.trim().toUpperCase() === String(rawBottleName).trim().toUpperCase());
          });
          const canonicalPlain = bp ? (bp.plainBottleName || bp.bottleName) : rawBottleName;

          return {
            plainBottle: canonicalPlain,
            bottleName: canonicalPlain,
            variantId: [], // will be populated dynamically if needed, or by user
            _id: plan._id,
            coatingShade: plan.coatingShade || '',
            brandId: plan.brandId?._id || plan.brandId || '',
            printingToBeDone: plan.printingToBeDone || '',
            textColor: plan.textColor || '',
            plainBottleStock: plan.plainBottleStock || 0,
            stockSources: Array.isArray(plan.stockSources) ? plan.stockSources.map(s => (s._id || s).toString()) : (plan.companyId ? [plan.companyId.toString()] : []),
            stockAllocation: Array.isArray(plan.stockAllocation) ? plan.stockAllocation : [],
            coatedStockAvailable: plan.plainBottleStock || 0,
            boxQty: plan.boxQty || '',
            orderQty: plan.orderQty || '',
            producedQty: plan.producedQty || 0,
            _prevProduced: initProduced,
            _initialProducedQty: initProduced,
            _initialStockDeduction: initStockDeduction,
            balanceToMake: (plan.coatingShade || '').trim().toUpperCase() === 'PLAIN'
              ? Math.max(0, (parseFloat(plan.orderQty) || 0) - (parseFloat(plan.producedQty) || 0))
              : (plan.balanceToMake || 0),
            dispatchBalance: plan.dispatchBalance || 0,
            soldQty: plan.soldQty || 0,
            noOfBoxes: plan.noOfBoxes || '',
            readyBoxes: plan.readyBoxes || '',
            remarks: plan.remarks || '',
            components: compMap,
            sharedGroupId: 'grp_initial' // since Edit form only loads one bottle group, they all share this ID
          };
        });

        setBlock({
          companyId,
          brandId,
          selectedItemTypeOptions: initialItemTypeOptions,
          items
        });

        // For PLAIN shade rows on load, fetch live plain stock & supplier sources info
        items.forEach(async (it, idx) => {
          const isPlain = (it.coatingShade || '').trim().toUpperCase() === 'PLAIN';
          if (isPlain && it.bottleName) {
            try {
              const pSources = it.stockSources || (companyId ? [companyId] : []);
              const lRes = await API.get('/lacquer-plan/stats/computed', {
                params: {
                  bottleName: it.bottleName,
                  companyId: companyId,
                  planDate: plan.planDate || undefined,
                  stockSources: pSources.join(','),
                  excludePlanIds: id
                }
              });
              if (lRes.data?.success) {
                setBlock(prev => {
                  const b = { ...prev };
                  if (b.items && b.items[idx]) {
                    b.items[idx].sources = lRes.data.data.sources || [];
                    b.items[idx].hasSuppliers = lRes.data.data.hasSuppliers || false;
                    b.items[idx].eligibleSuppliers = lRes.data.data.eligibleSuppliers || [];
                  }
                  return b;
                });
              }
            } catch (e) {}

            if (!it.plainBottleStock || it.plainBottleStock === 0) {
              try {
                const res = await API.get('/printing-plan/stats/computed', {
                  params: {
                    bottleName: it.bottleName,
                    brandId: it.brandId || brandId,
                    coatingShade: 'PLAIN',
                    companyId: companyId
                  }
                });
                if (res.data?.success) {
                  const stockVal = res.data.data.coatedStockAvailable;
                  const baseStock = stockVal + (it._initialStockDeduction || 0);
                  const curProd = parseFloat(it.producedQty) || 0;
                  const remStock = Math.max(0, baseStock - curProd);
                  setBlock(prev => {
                    const b = { ...prev };
                    if (b.items && b.items[idx]) {
                      b.items[idx].plainBottleStock = remStock;
                      b.items[idx].coatedStockAvailable = remStock;
                      b.items[idx].balanceToMake = isPlain
                        ? Math.max(0, (parseFloat(b.items[idx].orderQty) || 0) - curProd)
                        : (curProd > 0 ? (remStock - curProd) : remStock);
                    }
                    return b;
                  });
                }
              } catch (e) {}
            }
          }
        });
      }
    };

    initializeData();
  }, [id, location.state, itemTypes]);

  useEffect(() => {
    if (bottlePerBoxes?.length > 0 && block.items?.some(it => it.bottleName && !it.plainBottle)) {
      setBlock(prevBlock => ({
        ...prevBlock,
        items: prevBlock.items.map(it => {
          if (!it.plainBottle && it.bottleName) {
            const foundBox = bottlePerBoxes.find(b => {
              const names = (Array.isArray(b.bottleNames) && b.bottleNames.length > 0)
                ? b.bottleNames
                : [b.bottleName || b.plainBottleName].filter(Boolean);
              return names.map(n => n.trim().toUpperCase()).includes(it.bottleName.trim().toUpperCase());
            });
            if (foundBox) {
              return { ...it, plainBottle: foundBox.plainBottleName || foundBox.bottleName };
            }
          }
          return it;
        })
      }));
    }
  }, [bottlePerBoxes, block.items]);

  const handleItemTypeOptionsChange = (typeName, values) => {
    setBlock(prev => ({
      ...prev,
      selectedItemTypeOptions: {
        ...(prev.selectedItemTypeOptions || {}),
        [typeName]: values
      }
    }));
  };

  const handleAddVariantClick = (bottleName, brandId, itemIndex, colour, variantName = '') => {
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
        autoSelectVariantName: variantName || '',
        returnTo: `/printing-plan/edit/${id}`,
        savedBlock: block,
        editGroup: existingGroupPlans,
        itemIndex: itemIndex,
        companyId: block.companyId,
        brandId: brandId,
        sPlanDate: planDate
      }
    });
  };

  useEffect(() => {
    if (variants?.length > 0 && block.items.length > 0) {
      setBlock(prevBlock => {
        let changed = false;
        const newItems = prevBlock.items.map(item => {
          if (item.printingToBeDone && item.printingToBeDone.includes('-')) {
            const matchingOld = variants.find(v => `${v.variantName}-${v.detectedTextColor}` === item.printingToBeDone && v.bottleSpecId?.bottleName === item.bottleName);
            if (matchingOld) {
              changed = true;
              return { ...item, printingToBeDone: matchingOld.variantName };
            }
          }
          return item;
        });
        return changed ? { ...prevBlock, items: newItems } : prevBlock;
      });
    }
  }, [variants]);

  useEffect(() => {
    if (!block.companyId && block.brandId && brands?.length > 0) {
      const brand = brands.find(b => b._id === block.brandId);
      if (brand && brand.companyId) {
        setBlock(prev => ({ ...prev, companyId: brand.companyId._id || brand.companyId }));
      }
    }
  }, [brands, block.companyId, block.brandId]);

  // Initialize isExceedingStock for all PLAIN rows on page load and when block changes
  useEffect(() => {
    if (block.items && block.items.length > 0 && blockStockSummary.size > 0) {
      setBlock(prevBlock => ({
        ...prevBlock,
        items: prevBlock.items.map(item => {
          const shade = (item.coatingShade || '').trim().toUpperCase();
          if (shade === 'PLAIN') {
            const bottle = (item.plainBottle || item.bottleName || '').trim().toUpperCase();
            const compId = (prevBlock.companyId || '').toString();
            const key = `${compId}::${bottle}`;
            const summary = blockStockSummary.get(key);
            if (summary) {
              const isExceeding = summary.plainBottleStock > 0 && summary.totalOrderQty > summary.plainBottleStock;
              return { ...item, isExceedingStock: isExceeding };
            }
          }
          return { ...item, isExceedingStock: false };
        })
      }));
    }
  }, [blockStockSummary]);

  const handleBlockChange = async (field, value) => {
    const newBlock = { ...block, [field]: value };
    if (field === 'companyId') {
      newBlock.brandId = '';
    }
    setBlock(newBlock);
  };

  const addItemRow = () => {
    const newBlock = { ...block };
    newBlock.items.push({
      plainBottle: '',
      bottleName: '',
      sharedGroupId: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      variantId: [], coatingShade: '',
      printingToBeDone: '', textColor: '',
      plainBottleStock: 0, boxQty: '',
      orderQty: '', producedQty: 0, balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', readyBoxes: '', remarks: '',
      components: {}
    });
    setBlock(newBlock);
  };

  const removeItemRow = (itemIndex) => {
    const newBlock = { ...block };
    if (newBlock.items.length > 1) {
      const removedRow = newBlock.items[itemIndex];
      newBlock.items = newBlock.items.filter((_, i) => i !== itemIndex);
      const rProd = parseFloat(removedRow.producedQty) || 0;
      const rShade = (removedRow.coatingShade || '').trim().toUpperCase();
      const rBottle = (removedRow.plainBottle || removedRow.bottleName || '').trim().toUpperCase();
      if (rProd > 0 && rBottle && rShade === 'PLAIN') {
        newBlock.items.forEach(it => {
          const itBottle = (it.plainBottle || it.bottleName || '').trim().toUpperCase();
          const itShade = (it.coatingShade || '').trim().toUpperCase();
          if (itBottle === rBottle && itShade === 'PLAIN') {
            const s = (parseFloat(it.plainBottleStock || it.coatedStockAvailable) || 0) + rProd;
            it.plainBottleStock = s;
            it.coatedStockAvailable = s;
            const p = parseFloat(it.producedQty) || 0;
            const o = parseFloat(it.orderQty) || 0;
            it.balanceToMake = Math.max(0, o - p);
          }
        });
      }
      setBlock(newBlock);
    }
  };

  const handleItemChange = async (itemIndex, field, value) => {
    const newBlock = { ...block };
    const currentRow = newBlock.items[itemIndex];
    const prevProducedQty = parseFloat(block.items[itemIndex]?.producedQty) || 0;
    if (field !== 'producedQty') {
      currentRow[field] = value;
    }

    if (field === 'plainBottle' || field === 'bottleName') {
      const selectedPlain = (value || '').trim();
      currentRow.plainBottle = selectedPlain;
      currentRow.bottleName = selectedPlain;

      const selectedBottle = (bottlePerBoxes || []).find(b => 
        (b.plainBottleName || b.bottleName || '').trim().toLowerCase() === selectedPlain.toLowerCase()
      );
      if (selectedBottle && selectedBottle.bottlePerBox) {
        currentRow.boxQty = selectedBottle.bottlePerBox;
        const bQty = parseFloat(currentRow.boxQty);
        if (!isNaN(bQty) && bQty > 0) {
          if (currentRow.orderQty !== '' && currentRow.orderQty !== null && currentRow.orderQty !== undefined) {
            currentRow.noOfBoxes = Math.ceil((parseFloat(currentRow.orderQty) || 0) / bQty);
          } else if (currentRow.noOfBoxes !== '' && currentRow.noOfBoxes !== null && currentRow.noOfBoxes !== undefined) {
            currentRow.orderQty = Math.round((parseFloat(currentRow.noOfBoxes) || 0) * bQty);
          }
        }
      }

      let variantStillValid = false;
      if (currentRow.printingToBeDone && selectedPlain) {
        const groupedNames = new Set([selectedPlain.toUpperCase()]);
        if (selectedBottle) {
          const names = (Array.isArray(selectedBottle.bottleNames) && selectedBottle.bottleNames.length > 0)
            ? selectedBottle.bottleNames
            : [selectedBottle.bottleName || selectedBottle.plainBottleName].filter(Boolean);
          names.forEach(n => groupedNames.add(n.trim().toUpperCase()));
        }
        const matchingVariant = (variants || []).find(v => 
          v.variantName === currentRow.printingToBeDone && 
          groupedNames.has((v.bottleSpecId?.bottleName || '').trim().toUpperCase())
        );
        if (matchingVariant) {
          variantStillValid = true;
          currentRow.coatingShade = matchingVariant.coatingShade || '';
          currentRow.textColor = matchingVariant.detectedTextColor || '';
        }
      }

      if (!variantStillValid) {
        currentRow.printingToBeDone = '';
        currentRow.coatingShade = '';
        currentRow.textColor = '';
        currentRow.variantId = [];
      }

      if (currentRow.sharedGroupId) {
        newBlock.items.forEach(r => {
          if (r.sharedGroupId === currentRow.sharedGroupId) {
            r.plainBottle = selectedPlain;
            r.bottleName = selectedPlain;
            r.boxQty = currentRow.boxQty;
          }
        });
      }
    }

    if (field === 'printingToBeDone' && Array.isArray(value) && value.length > 0) {
      if (!currentRow.bottleName) {
        const brandIdStr = newBlock.brandId?.toString();
        const matchingSpecs = (bottleSpecs || []).filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === brandIdStr);
        const matchingSpecIds = matchingSpecs.map(bs => bs._id);
        const matchingVariant = (variants || []).find(v => v.variantName === value[0] && matchingSpecIds.includes(v.bottleSpecId?._id || v.bottleSpecId));
        if (matchingVariant) {
           const spec = (bottleSpecs || []).find(bs => bs._id === (matchingVariant.bottleSpecId?._id || matchingVariant.bottleSpecId));
           if (spec && spec.bottleName) {
               currentRow.bottleName = spec.bottleName.toUpperCase();
               const selectedBottle = (bottlePerBoxes || []).find(b => b.bottleName === currentRow.bottleName);
               if (selectedBottle && selectedBottle.bottlePerBox) {
                 currentRow.boxQty = selectedBottle.bottlePerBox;
                 const bQty = parseFloat(currentRow.boxQty);
                 if (!isNaN(bQty) && bQty > 0) {
                   if (currentRow.orderQty !== '' && currentRow.orderQty !== null && currentRow.orderQty !== undefined) {
                     currentRow.noOfBoxes = Math.ceil((parseFloat(currentRow.orderQty) || 0) / bQty);
                   } else if (currentRow.noOfBoxes !== '' && currentRow.noOfBoxes !== null && currentRow.noOfBoxes !== undefined) {
                     currentRow.orderQty = Math.round((parseFloat(currentRow.noOfBoxes) || 0) * bQty);
                   }
                 }
               }
               if (!currentRow.plainBottle) {
                 const foundBox = (bottlePerBoxes || []).find(b => {
                   const names = (Array.isArray(b.bottleNames) && b.bottleNames.length > 0)
                     ? b.bottleNames
                     : [b.bottleName || b.plainBottleName].filter(Boolean);
                   return names.map(n => n.trim().toUpperCase()).includes(currentRow.bottleName.toUpperCase());
                 });
                 if (foundBox) {
                   currentRow.plainBottle = foundBox.plainBottleName || foundBox.bottleName;
                 }
               }
           }
        }
      }

      if (value.length > 1) {
        currentRow.printingToBeDone = value[0];
        
        if (!currentRow.sharedGroupId) {
          currentRow.sharedGroupId = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        }
        
        const pBottle = (currentRow.plainBottle || currentRow.bottleName || '').trim().toUpperCase();
        const matchedBox = (bottlePerBoxes || []).find(b => 
          (b.plainBottleName || b.bottleName || '').trim().toLowerCase() === pBottle.toLowerCase()
        );
        const groupedNames = new Set([pBottle]);
        if (matchedBox) {
          const names = (Array.isArray(matchedBox.bottleNames) && matchedBox.bottleNames.length > 0)
            ? matchedBox.bottleNames
            : [matchedBox.bottleName || matchedBox.plainBottleName].filter(Boolean);
          names.forEach(n => groupedNames.add(n.trim().toUpperCase()));
        }

        const firstVariant = (variants || []).find(v => {
          const vBottle = (v.bottleSpecId?.bottleName || '').trim().toUpperCase();
          return v.variantName === value[0] && groupedNames.has(vBottle);
        });
        if (firstVariant) {
          if (firstVariant.coatingShade) currentRow.coatingShade = firstVariant.coatingShade;
          if (firstVariant.detectedTextColor) currentRow.textColor = firstVariant.detectedTextColor;
        }

        const rowsToAdd = [];
        for (let i = 1; i < value.length; i++) {
            const varName = value[i];
            const selVar = (variants || []).find(v =>
              v.variantName === varName &&
              groupedNames.has((v.bottleSpecId?.bottleName || '').trim().toUpperCase())
            );
            
            const clonedRow = {
                ...currentRow,
                _id: undefined, // ensure it's treated as new
                sharedGroupId: currentRow.sharedGroupId,
                printingToBeDone: varName,
                coatingShade: selVar?.coatingShade || '',
                textColor: selVar?.detectedTextColor || '',
                orderQty: '',
                producedQty: 0,
                balanceToMake: 0,
                dispatchBalance: 0,
                soldQty: 0,
                noOfBoxes: '',
                readyBoxes: '',
                remarks: ''
            };
            
            if (clonedRow.bottleName && (newBlock.brandId || newBlock.companyId)) {
                API.get('/printing-plan/stats/computed', {
                    params: {
                        bottleName: clonedRow.bottleName,
                        brandId: newBlock.brandId,
                        coatingShade: clonedRow.coatingShade || "",
                        companyId: newBlock.companyId
                    }
                }).then(res => {
                    if (res.data?.success) {
                        setBlock(currentBlock => {
                            const b = { ...currentBlock };
                            const targetItem = b.items.find(i => i.printingToBeDone === varName && i.bottleName === clonedRow.bottleName);
                            if (targetItem) {
                                const stockVal = res.data.data.coatedStockAvailable;
                                targetItem.coatedStockAvailable = stockVal;
                                targetItem.plainBottleStock = stockVal;
                                const isPlain = (targetItem.coatingShade || clonedRow.coatingShade || '').trim().toUpperCase() === 'PLAIN';
                                const p = parseFloat(targetItem.producedQty) || 0;
                                if (isPlain) {
                                  const o = parseFloat(targetItem.orderQty) || 0;
                                  targetItem.balanceToMake = Math.max(0, o - p);
                                } else {
                                  const o = parseFloat(targetItem.orderQty) || 0;
                                  targetItem.balanceToMake = Math.max(0, o - p);
                                }
                            }
                            return b;
                        });
                    }
                }).catch(console.error);
            }
            rowsToAdd.push(clonedRow);
        }
        newBlock.items.splice(itemIndex + 1, 0, ...rowsToAdd);
        value = [value[0]];
      }

      const firstVal = value[0];
      const selectedVariant = (variants || []).find(v =>
        v.variantName === firstVal &&
        v.bottleSpecId?.bottleName === currentRow.bottleName
      );

      if (selectedVariant) {
        if (selectedVariant.coatingShade) {
          currentRow.coatingShade = selectedVariant.coatingShade;
        }
        if (selectedVariant.detectedTextColor) {
          currentRow.textColor = selectedVariant.detectedTextColor;
        }
      }
      currentRow.printingToBeDone = firstVal;
    } else if (field === 'printingToBeDone') {
        currentRow.printingToBeDone = '';
    }

    if (field === 'boxQty') {
      const boxQty = parseFloat(value);
      if (!isNaN(boxQty) && boxQty > 0) {
        if (currentRow.orderQty !== '' && currentRow.orderQty !== null && currentRow.orderQty !== undefined) {
          const orderQty = parseFloat(currentRow.orderQty) || 0;
          currentRow.noOfBoxes = Math.ceil(orderQty / boxQty);
        } else if (currentRow.noOfBoxes !== '' && currentRow.noOfBoxes !== null && currentRow.noOfBoxes !== undefined) {
          const noOfBoxes = parseFloat(currentRow.noOfBoxes) || 0;
          currentRow.orderQty = Math.round(noOfBoxes * boxQty);
        }
      }
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
      const valStr = String(value ?? '').trim();
      if (valStr === '') {
        currentRow.orderQty = '';
        currentRow.noOfBoxes = '';
      } else {
        let orderQty = parseFloat(valStr) || 0;
        const boxQty = parseFloat(currentRow.boxQty);
        if (!isNaN(orderQty) && !isNaN(boxQty) && boxQty > 0) {
          currentRow.noOfBoxes = Math.ceil(orderQty / boxQty);
        }
      }
    }

    if (currentRow.sharedGroupId && (field === 'boxQty' || field === 'bottleName' || field === 'plainBottle' || field === 'plainBottleStock')) {
      newBlock.items.forEach((r) => {
        if (r.sharedGroupId === currentRow.sharedGroupId && r !== currentRow) {
          if (field === 'boxQty') r.boxQty = currentRow.boxQty;
          if (field === 'plainBottleStock') {
            const curShade = (currentRow.coatingShade || '').trim().toUpperCase();
            if ((r.coatingShade || '').trim().toUpperCase() === curShade) {
              r.plainBottleStock = currentRow.plainBottleStock;
              const rProd = parseFloat(r.producedQty) || 0;
              if (curShade === 'PLAIN') {
                const rOrder = parseFloat(r.orderQty) || 0;
                r.balanceToMake = Math.max(0, rOrder - rProd);
              } else {
                const rOrder = parseFloat(r.orderQty) || 0;
                r.balanceToMake = Math.max(0, rOrder - rProd);
              }
            }
          }
          if (field === 'bottleName' || field === 'plainBottle') {
            r.plainBottle = currentRow.plainBottle;
            r.bottleName = currentRow.bottleName;
            r.boxQty = currentRow.boxQty;
          }
          const bQty = parseFloat(r.boxQty);
          if (!isNaN(bQty) && bQty > 0) {
            if (r.orderQty !== '' && r.orderQty !== null && r.orderQty !== undefined) {
              r.noOfBoxes = Math.ceil((parseFloat(r.orderQty) || 0) / bQty);
            } else if (r.noOfBoxes !== '' && r.noOfBoxes !== null && r.noOfBoxes !== undefined) {
              r.orderQty = Math.round((parseFloat(r.noOfBoxes) || 0) * bQty);
            }
          }
        }
      });
    }

    if (field === 'producedQty') {
      const curShade = (currentRow.coatingShade || '').trim().toUpperCase();
      const newProduced = value === '' ? 0 : (parseFloat(value) || 0);
      currentRow.producedQty = value === '' ? '' : newProduced;

      const delta = newProduced - prevProducedQty;
      const currentStock = parseFloat(currentRow.plainBottleStock || currentRow.coatedStockAvailable) || 0;
      const newStock = Math.max(0, currentStock - delta);
      const curBottle = (currentRow.plainBottle || currentRow.bottleName || '').trim().toUpperCase();

      if (curShade === 'PLAIN') {
        let totalReadyInGroup = 0;
        const poolItems = [];
        newBlock.items.forEach((r) => {
          const rBottle = (r.plainBottle || r.bottleName || '').trim().toUpperCase();
          const rShade = (r.coatingShade || '').trim().toUpperCase();
          if (rBottle === curBottle && rShade === 'PLAIN') {
            poolItems.push(r);
            const rProd = parseFloat(r === currentRow ? newProduced : r.producedQty) || 0;
            totalReadyInGroup += rProd;
          }
        });

        const basePoolStock = currentStock + (poolItems.reduce((sum, it) => sum + (parseFloat(it === currentRow ? prevProducedQty : it.producedQty) || 0), 0));
        const isExceeding = basePoolStock > 0 && totalReadyInGroup > basePoolStock;

        if (isExceeding && newProduced > prevProducedQty) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'Total Ready (Printed) Qty exceeds Plain Stock',
            showConfirmButton: false,
            timer: 3000
          });
        }

        poolItems.forEach((r) => {
          r.plainBottleStock = newStock;
          r.coatedStockAvailable = newStock;
          r.isExceedingStock = isExceeding;
          const rProd = parseFloat(r === currentRow ? newProduced : r.producedQty) || 0;
          const rOrder = parseFloat(r.orderQty) || 0;
          r.balanceToMake = Math.max(0, rOrder - rProd);
        });

        if (Array.isArray(currentRow.stockSources) && currentRow.stockSources.length >= 2) {
          const sourcesAvailMap = new Map();
          (currentRow.sources || []).forEach(s => {
            sourcesAvailMap.set((s.companyId?._id || s.companyId)?.toString(), s.available ?? 0);
          });
          const currentSum = (currentRow.stockAllocation || []).reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
          if (currentSum !== newProduced) {
            currentRow.stockAllocation = computePrintingSplitSuggestion(newProduced, currentRow.stockSources, sourcesAvailMap, newBlock.companyId);
          }
        }
      } else if (currentRow.sharedGroupId) {
        newBlock.items.forEach((r) => {
          if (r.sharedGroupId === currentRow.sharedGroupId && (r.coatingShade || '').trim().toUpperCase() === curShade) {
            r.plainBottleStock = newStock;
            r.coatedStockAvailable = newStock;
            const rProd = parseFloat(r === currentRow ? newProduced : r.producedQty) || 0;
            const rOrder = parseFloat(r.orderQty) || 0;
            // Balance = orderQty - producedQty (not stock-based)
            r.balanceToMake = Math.max(0, rOrder - rProd);
          }
        });
      } else {
        currentRow.plainBottleStock = newStock;
        currentRow.coatedStockAvailable = newStock;
        const curOrder = parseFloat(currentRow.orderQty) || 0;
        // Balance = orderQty - producedQty (not stock-based)
        currentRow.balanceToMake = Math.max(0, curOrder - newProduced);
      }
    }

    if (field === 'orderQty' || field === 'noOfBoxes' || field === 'coatedStockAvailable' || field === 'plainBottleStock' || field === 'producedQty') {
      const isPlain = (currentRow.coatingShade || '').trim().toUpperCase() === 'PLAIN';
      if (isPlain) {
        const orderQty = parseFloat(currentRow.orderQty) || 0;
        const producedQty = parseFloat(currentRow.producedQty) || 0;
        currentRow.balanceToMake = Math.max(0, orderQty - producedQty);
        
        // Check for plain stock warning on orderQty/noOfBoxes change
        if (field === 'orderQty' || field === 'noOfBoxes') {
          const curBottle = (currentRow.plainBottle || currentRow.bottleName || '').trim().toUpperCase();
          const compId = (newBlock.companyId || '').toString();
          const key = `${compId}::${curBottle}`;
          
          // Use aggregated stock from blockStockSummary
          let plainBottleStock = parseFloat(currentRow.plainBottleStock || currentRow.coatedStockAvailable) || 0;
          let totalOrderForBottle = 0;
          
          // Recalculate pool totals for current state
          newBlock.items.forEach((r, rIdx) => {
            const rBottle = (r.plainBottle || r.bottleName || '').trim().toUpperCase();
            const rShade = (r.coatingShade || '').trim().toUpperCase();
            if (rBottle === curBottle && rShade === 'PLAIN') {
              totalOrderForBottle += (rIdx === itemIndex ? orderQty : (parseFloat(r.orderQty) || 0));
              // Use first row's stock as the pool stock (they should all be synced for the same PLAIN group)
              if (plainBottleStock === 0 || parseFloat(r.plainBottleStock || r.coatedStockAvailable) > 0) {
                plainBottleStock = parseFloat(r.plainBottleStock || r.coatedStockAvailable) || 0;
              }
            }
          });
          
          if (plainBottleStock > 0 && totalOrderForBottle > plainBottleStock) {
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
      } else {
        const stock = parseFloat(currentRow.plainBottleStock || currentRow.coatedStockAvailable);
        const producedQty = parseFloat(currentRow.producedQty);
        const orderQty = parseFloat(currentRow.orderQty) || 0;
        // Balance = orderQty - producedQty (never uses stock)
        currentRow.balanceToMake = Math.max(0, orderQty - (producedQty || 0));
        currentRow.isExceedingStock = false;
      }
    }

    setBlock(newBlock);

    // Fetch computed stats
    const rowBottle = (currentRow.plainBottle || currentRow.bottleName || '').trim();
    if ((field === 'coatingShade' || field === 'variantId' || field === 'brandId' || field === 'printingToBeDone' || field === 'bottleName') && rowBottle) {
      const curComp = newBlock.companyId;
      const curBrand = currentRow.brandId || newBlock.brandId;
      const targetShade = (currentRow.coatingShade || '').trim().toUpperCase();

      if (curBrand || (curComp && targetShade === 'PLAIN')) {
        try {
          const res = await API.get('/printing-plan/stats/computed', {
            params: {
              bottleName: rowBottle,
              brandId: curBrand || undefined,
              coatingShade: currentRow.coatingShade || "",
              companyId: curComp || undefined
            }
          });
          if (res.data?.success) {
            const updatedBlock = { ...newBlock };
            const stockVal = res.data.data.coatedStockAvailable;
            const targetBottle = rowBottle.toUpperCase();

            if (targetShade === 'PLAIN') {
              // Fetch supplier sources info from backend
              try {
                const sSources = currentRow.stockSources || (curComp ? [curComp] : []);
                const lRes = await API.get('/lacquer-plan/stats/computed', {
                  params: {
                    bottleName: rowBottle,
                    companyId: curComp,
                    planDate: newBlock.planDate,
                    stockSources: sSources.join(','),
                    excludePlanIds: id
                  }
                });
                if (lRes.data?.success) {
                  updatedBlock.items.forEach(it => {
                    const itBottle = (it.plainBottle || it.bottleName || '').trim().toUpperCase();
                    const itShade = (it.coatingShade || '').trim().toUpperCase();
                    if (itBottle === targetBottle && itShade === 'PLAIN') {
                      it.sources = lRes.data.data.sources || [];
                      it.hasSuppliers = lRes.data.data.hasSuppliers || false;
                      it.eligibleSuppliers = lRes.data.data.eligibleSuppliers || [];
                    }
                  });
                }
              } catch (e) {}

              // In edit mode: add back saved consumption of all rows in this pool so we don't double count
              let poolSavedConsumption = 0;
              let poolCurrentProduced = 0;
              updatedBlock.items.forEach(it => {
                const itBottle = (it.plainBottle || it.bottleName || '').trim().toUpperCase();
                const itShade = (it.coatingShade || '').trim().toUpperCase();
                if (itBottle === targetBottle && itShade === 'PLAIN') {
                  const saved = Number(it._initialStockDeduction !== undefined ? it._initialStockDeduction : (it._initialProducedQty || 0)) || 0;
                  poolSavedConsumption += saved;
                  poolCurrentProduced += (parseFloat(it.producedQty) || 0);
                }
              });

              // Base stock = live DB stock + saved consumption previously deducted by these rows
              const basePoolStock = stockVal + poolSavedConsumption;
              const remainingStock = Math.max(0, basePoolStock - poolCurrentProduced);

              updatedBlock.items.forEach(it => {
                const itBottle = (it.plainBottle || it.bottleName || '').trim().toUpperCase();
                const itShade = (it.coatingShade || '').trim().toUpperCase();
                if (itBottle === targetBottle && itShade === 'PLAIN') {
                  it.coatedStockAvailable = remainingStock;
                  it.plainBottleStock = remainingStock;
                  const p = parseFloat(it.producedQty) || 0;
                  const o = parseFloat(it.orderQty) || 0;
                  it.balanceToMake = Math.max(0, o - p);
                }
              });
            } else {
              const targetGroupId = currentRow.sharedGroupId;
              updatedBlock.items.forEach((it, idx) => {
                if (idx === itemIndex || (targetGroupId && it.sharedGroupId === targetGroupId && (it.coatingShade || '').trim().toUpperCase() === targetShade)) {
                  it.coatedStockAvailable = stockVal;
                  it.plainBottleStock = stockVal;
                  const p = parseFloat(it.producedQty) || 0;
                  const o = parseFloat(it.orderQty) || 0;
                  it.balanceToMake = Math.max(0, o - p);
                }
              });
            }
            setBlock(updatedBlock);
          }
        } catch (err) {
          console.error("Failed to fetch computed stats", err);
        }
      }
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
      await API.post('/bottle-per-box', {
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

      if (missingPlainBottleData.itemIndex !== null && missingPlainBottleData.itemIndex !== undefined) {
        handleItemChange(missingPlainBottleData.itemIndex, 'plainBottle', bottleNameVal);
        if (bpbValue) {
          handleItemChange(missingPlainBottleData.itemIndex, 'boxQty', bpbValue);
        }
      }
    } catch (err) {
      console.error('Error creating plain bottle:', err);
      Swal.fire('Error', err.response?.data?.message || err.message || 'Failed to create plain bottle', 'error');
    } finally {
      setCreatingSpec(false);
    }
  };

  

  const handlePrintingSplitChange = (itemIndex, sourceId, val) => {
    setBlock(prevBlock => {
      const curBlock = { ...prevBlock };
      const curItems = [...curBlock.items];
      const it = { ...curItems[itemIndex] };
      const sources = (it.stockSources || (curBlock.companyId ? [curBlock.companyId] : [])).map(id => (id?._id || id)?.toString());
      const Q = Number(it.producedQty) || 0;
      const parsedVal = val === '' ? '' : Math.max(0, parseInt(val, 10) || 0);

      let currentAlloc = Array.isArray(it.stockAllocation) ? [...it.stockAllocation] : [];
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
          if (aId === (sourceId?._id || sourceId)?.toString()) return { companyId: aId, qty: parsedVal };
          return a;
        });
      }
      it.stockAllocation = currentAlloc;
      curItems[itemIndex] = it;
      curBlock.items = curItems;
      return curBlock;
    });
  };

  const handleTogglePrintingSource = async (itemIndex, sourceId, checked) => {
    const currentItem = block?.items[itemIndex];
    if (!currentItem) return;

    const currentSources = (currentItem.stockSources || (block.companyId ? [block.companyId] : [])).map(id => (id?._id || id)?.toString());
    const targetIdStr = (sourceId?._id || sourceId)?.toString();
    if (!checked && currentSources.length <= 1) return; // At least one source must stay checked
    let updatedSources = [];
    if (checked) {
      updatedSources = Array.from(new Set([...currentSources, targetIdStr]));
    } else {
      updatedSources = currentSources.filter(id => id !== targetIdStr);
    }

    const immediateAvailMap = new Map();
    (currentItem.sources || []).forEach(s => {
      immediateAvailMap.set((s.companyId?._id || s.companyId)?.toString(), s.available ?? 0);
    });
    (currentItem.eligibleSuppliers || []).forEach(s => {
      const sId = (s.companyId?._id || s.companyId)?.toString();
      if (!immediateAvailMap.has(sId)) immediateAvailMap.set(sId, s.available ?? 0);
    });

    const updatedBlock = { ...block };
    const curBottle = currentItem.bottleName;
    for (let i = 0; i < updatedBlock.items.length; i++) {
      const it = updatedBlock.items[i];
      if (it.bottleName === curBottle && (it.coatingShade || '').trim().toUpperCase() === 'PLAIN') {
        it.stockSources = updatedSources;
        if (updatedSources.length >= 2) {
          it.stockAllocation = computePrintingSplitSuggestion(it.producedQty, updatedSources, immediateAvailMap, block.companyId);
        }
      }
    }
    setBlock(updatedBlock);

    try {
      const res = await API.get('/lacquer-plan/stats/computed', {
        params: {
          bottleName: curBottle,
          companyId: block.companyId,
          planDate: block.planDate,
          stockSources: updatedSources.join(','),
          excludePlanIds: id
        }
      });
      if (res.data?.success) {
        const plainStock = res.data.data.plainStock !== undefined ? res.data.data.plainStock : res.data.data.openingStock;
        const freshSources = res.data.data.sources || [];
        const freshEligible = res.data.data.eligibleSuppliers || [];
        const availMap = new Map();
        freshSources.forEach(s => availMap.set((s.companyId?._id || s.companyId)?.toString(), s.available ?? 0));
        freshEligible.forEach(s => {
          const sId = (s.companyId?._id || s.companyId)?.toString();
          if (!availMap.has(sId)) availMap.set(sId, s.available ?? 0);
        });

        const newBlock = { ...block };
        for (let i = 0; i < newBlock.items.length; i++) {
          const it = newBlock.items[i];
          if (it.bottleName === curBottle && (it.coatingShade || '').trim().toUpperCase() === 'PLAIN') {
            it.plainBottleStock = Number.isFinite(Number(plainStock)) ? Number(plainStock) : 0;
            it.sources = freshSources;
            it.hasSuppliers = res.data.data.hasSuppliers;
            it.eligibleSuppliers = freshEligible;
            if (updatedSources.length >= 2) {
              it.stockAllocation = computePrintingSplitSuggestion(it.producedQty, updatedSources, availMap, block.companyId);
            }
          }
        }
        setBlock(newBlock);
      }
    } catch (err) {
      console.error("Failed to fetch computed stock in EditPrintingPlan:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let hasError = false;

    if (!block.companyId || !block.brandId) {
      return Swal.fire('Error', 'Please select a Company and Brand.', 'error');
    }

    const payloadUpdates = [];
    const payloadCreates = [];

    const isShreno = (companyOptions.find(o => o.value === block.companyId)?.label || '').toLowerCase().includes('shreno');
    const compHeaders = isShreno ? getOrderedHeaders(block.selectedItemTypeOptions, sortedActiveItemTypes) : [];

    block.items.forEach(item => {
      if (item.printingToBeDone || item.orderQty) {
        if (!item.orderQty) {
          hasError = true;
        } else {
          const componentsArray = compHeaders.map(ch => ({
            itemType: ch,
            componentType: ch,
            quantity: (item.components && item.components[ch] !== undefined && item.components[ch] !== '') ? Number(item.components[ch]) : 0
          }));

          const planData = {
            planDate: planDate,
            companyId: block.companyId,
            bottleName: item.bottleName,
            status: true,
            boxQty: item.boxQty || null,
            coatingShade: item.coatingShade || '',
            brandId: block.brandId,
            printingToBeDone: item.printingToBeDone || '',
            textColor: item.textColor || '',
            plainBottleStock: item.plainBottleStock || 0,
            stockSources: item.stockSources || (block.companyId ? [block.companyId] : []),
            stockAllocation: item.stockAllocation || [], 
            orderQty: item.orderQty,
            producedQty: item.producedQty || 0,
            balanceToMake: item.balanceToMake || 0,
            dispatchBalance: item.dispatchBalance || 0,
            soldQty: item.soldQty || 0,
            noOfBoxes: item.noOfBoxes || null,
            readyBoxes: item.readyBoxes || null,
            remarks: item.remarks || '',
            componentHeadersList: compHeaders,
            components: componentsArray
          };

          if (item._id) {
            payloadUpdates.push({ id: item._id, data: planData });
          } else {
            payloadCreates.push(planData);
          }
        }
      }
    });

    if (hasError) {
      return Swal.fire('Error', 'Please fill in all required fields (Order Qty) for each entered row.', 'error');
    }

    if (payloadUpdates.length === 0 && payloadCreates.length === 0) {
      return Swal.fire('Error', 'Please ensure there is at least one valid entry.', 'error');
    }

    try {
      // Delete records that were removed from the UI
      const originalIds = existingGroupPlans.map(p => p._id);
      const currentIds = payloadUpdates.map(p => p.id);
      const toDelete = originalIds.filter(id => !currentIds.includes(id));

      for (const delId of toDelete) {
        await dispatch(deletePrintingPlan(delId)).unwrap();
      }

      // Create new records
      if (payloadCreates.length > 0) {
        await dispatch(createPrintingPlan(payloadCreates)).unwrap();
      }

      // Update existing records
      for (const update of payloadUpdates) {
        await dispatch(updatePrintingPlan({ id: update.id, data: update.data })).unwrap();
      }

      Swal.fire('Success', 'Printing Plan group updated successfully', 'success');
      navigate('/printing-plan');

    } catch (err) {
      Swal.fire('Error', err.message || 'Failed to update plan group', 'error');
    }
  };

  const uniqueBottleNames = Array.from(new Set(
    (bottleSpecs || []).map(b => b.bottleName).filter(name => name && name.trim() !== '')
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map(name => ({ value: name, label: name }));

  const globalAllBottles = useMemo(() => {
    const allSpecBottles = (bottleSpecs || []).map(s => s.bottleName?.trim()).filter(Boolean);
    const allBPBBottles = (bottlePerBoxes || []).map(b => b.bottleName?.trim().toUpperCase()).filter(Boolean);
    return Array.from(new Set([...allBPBBottles, ...allSpecBottles])).filter(Boolean);
  }, [bottleSpecs, bottlePerBoxes]);

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
      const normKey = normalizeRollOn(name);
      if (name && !unique.has(normKey)) {
        unique.set(normKey, {
          value: b.plainBottleName || name,
          label: b.plainBottleName || name,
          plainBottleName: b.plainBottleName || name,
          bottlePerBox: b.bottlePerBox !== undefined ? b.bottlePerBox : null,
          boxWeight: b.boxWeight !== undefined ? b.boxWeight : null,
          bottlePerBoxData: b
        });
      }
    });

    return Array.from(unique.values()).sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [bottlePerBoxes]);

  const uniqueCoatingShades = Array.from(new Set([
    ...(variants || []).map(v => v.coatingShade),
    ...(bottleSpecs || []).map(s => s.coatingShade)
  ].filter(shade => shade && shade.trim() !== '')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(shade => ({ value: shade, label: shade }));

  const printingTypeOptions = useMemo(() => {
    return (printingTypes || []).map(t => ({ value: t._id, label: t.name }));
  }, [printingTypes]);

  const printingColorOptions = useMemo(() => {
    return (printingColors || []).map(c => ({ value: c._id, label: c.name }));
  }, [printingColors]);

  const sortedPrintingColors = useMemo(() => {
    return [...(printingColors || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [printingColors]);

  const sortedPrintingTypes = useMemo(() => {
    return [...(printingTypes || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [printingTypes]);

  const sortedUniqueTextColors = useMemo(() => {
    const fromVariants = (variants || []).map(v => v.detectedTextColor).filter(Boolean);
    const fromPrintingColors = (printingColors || []).map(pc => pc.name).filter(Boolean);
    const fromSpecs = (bottleSpecs || []).map(bs => bs.printingColorId?.name).filter(Boolean);
    return Array.from(new Set([...fromPrintingColors, ...fromVariants, ...fromSpecs]))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [variants, printingColors, bottleSpecs]);

  const sortedActiveItemTypes = useMemo(() => {
    const active = (itemTypes || []).filter(it => !it.isDeleted && it.status !== false);
    return sortTypesList(active);
  }, [itemTypes]);

  const allCompanies = useMemo(() => {
    const fromRedux = Array.isArray(companies) ? companies : (companies?.data || companies?.companies || []);
    if (fromRedux.length > 0) return fromRedux;
    return directCompanies;
  }, [companies, directCompanies]);

  const companyOptions = useMemo(() => {
    return (allCompanies || [])
      .filter(c => c && c.status !== false && c.status !== 'inactive' && !c.isDeleted)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
      .map(c => ({ value: c._id, label: c.name }));
  }, [allCompanies]);

  const bCompanyId = block.companyId;
  const isShrenoCompany = companyOptions.find(o => o.value === bCompanyId)?.label?.toLowerCase().includes('shreno');
  const companyBrandIds = new Set(
    (brands || [])
      .filter(b => (b.companyId?._id || b.companyId)?.toString() === bCompanyId?.toString())
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

  let blockPlainBottleOptions = [];
  const blockCompIdStr = (block.companyId?._id || block.companyId || '').toString();
  const cBottleInfo = companyPlainBottles[blockCompIdStr];
  if (cBottleInfo && cBottleInfo.companyBottles && cBottleInfo.companyBottles.length > 0) {
    if (block.brandId) {
      const matchingSpecs = companySpecs.filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === block.brandId.toString());
      const matchingBottleNames = new Set(matchingSpecs.map(s => normalizeRollOn(s.bottleName)).filter(Boolean));
      blockPlainBottleOptions = cBottleInfo.companyBottles.filter(cb => {
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
        value: cb.plainBottleName || cb.name,
        label: cb.plainBottleName || cb.name,
        plainBottleName: cb.plainBottleName || cb.name,
        bottlePerBox: cb.bottlePerBox,
        boxWeight: cb.boxWeight,
        bottlePerBoxData: cb
      }));
    } else {
      blockPlainBottleOptions = cBottleInfo.companyBottles.map(cb => ({
        value: cb.plainBottleName || cb.name,
        label: cb.plainBottleName || cb.name,
        plainBottleName: cb.plainBottleName || cb.name,
        bottlePerBox: cb.bottlePerBox,
        boxWeight: cb.boxWeight,
        bottlePerBoxData: cb
      }));
    }
  } else if (block.brandId) {
    const matchingSpecs = companySpecs.filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === block.brandId.toString());
    const matchingBottleNames = new Set(matchingSpecs.map(s => normalizeRollOn(s.bottleName)).filter(Boolean));

    blockPlainBottleOptions = plainBottleOptions.filter(opt => {
      const optName = normalizeRollOn(opt.value);
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

  if (loading && existingGroupPlans.length === 0) {
    return <div className="text-center py-5">Loading...</div>;
  }

  return (
    <>
      <div className="page-content printing-plan-page printing-plan-form-page">
        <div className="d-flex justify-content-between align-items-end mb-4 printing-plan-form-header">
          <div className="d-flex align-items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="bi bi-arrow-left fs-5" />
            </button>
            <div>
              <h1 className="page-title mb-0">{labels.edit} Group</h1>
              <p className="page-subtitle mb-0">Update multiple printing plan entries at once</p>
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
            <div className="dash-card border-0 shadow-sm p-4 printing-plan-form-card">
              {error && <div className="alert alert-danger">{error}</div>}

              <form onSubmit={handleSubmit} className="printing-plan-form">
                <div className="mb-4 pb-4 border-bottom">
                  <label className="form-label fw-bold small">Common Plan Date <span className="text-danger">*</span></label>
                  <input type="date" className="form-control shadow-none w-auto"
                    value={planDate} onChange={(e) => setPlanDate(e.target.value)} required />
                </div>

                <div className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative printing-plan-section">

                  <div className="row g-4 mb-4 bg-light p-3 rounded mx-0 align-items-end">
                    <div className="col-md-4">
                      <label className="form-label fw-bold small text-primary">{labels.company} <span className="text-danger">*</span></label>
                      <Select
                        options={companyOptions}
                        value={companyOptions.find(o => o.value === block.companyId) || null}
                        onChange={(selected) => handleBlockChange('companyId', selected ? selected.value : '')}
                        placeholder="Select company..."
                        isClearable={false}
                        required
                      />
                    </div>
                    <div className="col-md-5">
                      <label className="form-label fw-bold small text-primary">{labels.brand} <span className="text-danger">*</span></label>
                      <Select
                        options={brandOptions}
                        value={brandOptions.find(o => o.value === block.brandId) || null}
                        onChange={(selected) => handleBlockChange('brandId', selected ? selected.value : '')}
                        placeholder="Select brand..."
                        isClearable={false}
                        required
                      />
                    </div>
                    {isShrenoCompany && (
                      <div className="col-12 mt-3 pt-3 border-top">
                        <label className="form-label fw-bold small text-primary mb-2">Item Type Master</label>
                        <div className="row g-3">
                          {sortedActiveItemTypes.map((it) => {
                            const typeName = it.name;
                            const currentVals = block.selectedItemTypeOptions?.[typeName] || [];
                            const optList = getItemTypeSpecificOptions(it);
                            return (
                              <div key={it._id || typeName} className="col-md-4 col-sm-6">
                                <label className="form-label fw-bold small text-secondary mb-1">
                                  {typeName}
                                </label>
                                <CreatableSelect
                                  isMulti
                                  options={optList}
                                  value={currentVals.map(v => ({ value: v, label: v }))}
                                  onChange={(selected) => {
                                    const vals = (selected || []).map(s => s.value);
                                    handleItemTypeOptionsChange(typeName, vals);
                                  }}
                                  placeholder={`Select ${typeName} options...`}
                                  isClearable
                                  menuPortalTarget={document.body}
                                  styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div><div className="d-flex align-items-center justify-content-between mb-3 mt-2">
                    <h6 className="fw-bold text-muted mb-0">PLAN ENTRIES</h6>
                  </div>

                  <div className="table-responsive mb-3 printing-plan-entry-table">
                    <table className="table table-bordered align-middle table-sm" style={{ minWidth: '2400px' }}>
                      <thead className="table-light">
                        <tr>
                          <th className="small text-muted text-center align-middle" style={{ width: '3%' }}>{labels.sr}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '15%', minWidth: '220px' }}>Plain Bottle <span className="text-danger">*</span></th>
                          <th className="small text-muted text-center align-middle" style={{ width: '14%', minWidth: '260px' }}>{labels.printingToBeDone}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '12%', minWidth: '200px' }}>{labels.coatingShade} <span className="text-danger">*</span></th>
                          <th className="small text-muted text-center align-middle" style={{ width: '8%', minWidth: '150px' }}>Text Color</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '8%', minWidth: '150px' }}>{labels.plainColouredBottleStock}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '7%' }}>{labels.orderQty} <span className="text-danger">*</span></th>
                          <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.readyPrintedQty}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.balanceToMake}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.bottlePerBox}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.noOfOrderBoxes}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.balanceToBeDispatched}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '5%' }}>{labels.soldQty}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.readyBoxes}</th>
                          {isShrenoCompany && getOrderedHeaders(block.selectedItemTypeOptions, sortedActiveItemTypes).map((headerName, hIdx) => (
                            <th key={`comp_th_${hIdx}`} className="small text-primary text-center align-middle bg-primary-subtle" style={{ width: '6%', minWidth: '95px' }}>
                              {headerName}
                            </th>
                          ))}
                          <th className="small text-muted text-center align-middle" style={{ width: '15%', minWidth: '250px' }}>{labels.remarks}</th>
                          <th className="small text-muted text-center align-middle" style={{ width: '3%' }}></th>
                        </tr>
                      </thead>
                      <tbody className="border-top-0">
                        {(() => {
                          const visibleGroupSpans = {};
                          block.items.forEach(r => {
                            if (r.sharedGroupId) {
                              visibleGroupSpans[r.sharedGroupId] = (visibleGroupSpans[r.sharedGroupId] || 0) + 1;
                            }
                          });
                          const renderedGroups = new Set();
                          
                          return block.items.map((item, itemIndex) => {
                            const isGrouped = !!item.sharedGroupId;
                            const isFirstInGroup = isGrouped && !renderedGroups.has(item.sharedGroupId);
                            if (isFirstInGroup) renderedGroups.add(item.sharedGroupId);
                            const rowSpan = isGrouped ? visibleGroupSpans[item.sharedGroupId] : 1;
                            const renderGroupCell = !isGrouped || isFirstInGroup;

                            let renderShadeGroupCell = true;
                            let shadeRowSpan = 1;
                            if (isGrouped && item.coatingShade) {
                              const currentShade = (item.coatingShade || '').trim().toUpperCase();
                              const prevRow = itemIndex > 0 ? block.items[itemIndex - 1] : null;
                              const prevShade = (prevRow?.coatingShade || '').trim().toUpperCase();
                              if (prevRow && prevRow.sharedGroupId === item.sharedGroupId && prevShade === currentShade) {
                                renderShadeGroupCell = false;
                              } else {
                                let count = 1;
                                for (let i = itemIndex + 1; i < block.items.length; i++) {
                                  const nextShade = (block.items[i].coatingShade || '').trim().toUpperCase();
                                  if (block.items[i].sharedGroupId === item.sharedGroupId && nextShade === currentShade) {
                                    count++;
                                  } else {
                                    break;
                                  }
                                }
                                shadeRowSpan = count;
                              }
                            }

                            let renderStockGroupCell = renderShadeGroupCell;
                            let stockRowSpan = shadeRowSpan;

                            const selectedPlain = (item.plainBottle || item.bottleName || '').trim();
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

                            const matchingSpecs = selectedPlain
                              ? companySpecs.filter(bs => groupedBottleNames.has((bs.bottleName || '').trim().toUpperCase()) && (bs.brandId?._id || bs.brandId)?.toString() === block.brandId?.toString())
                              : companySpecs.filter(bs => (bs.brandId?._id || bs.brandId)?.toString() === block.brandId?.toString());
                            const matchingSpecIds = matchingSpecs.map(bs => bs._id);

                          const selectedSiblingVariants = block.items
                            .filter((r, i) => i !== itemIndex && (r.plainBottle || r.bottleName) === (item.plainBottle || item.bottleName))
                            .map(r => r.printingToBeDone)
                            .filter(Boolean);

                          const rowVariantOptions = Array.from(new Set(
                            (variants || [])
                              .filter(v => matchingSpecIds.includes(v.bottleSpecId?._id || v.bottleSpecId))
                              .filter(v => v.variantName)
                              .filter(v => !selectedSiblingVariants.includes(v.variantName))
                              .map(v => v.variantName)
                          )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map(val => ({ value: val, label: val }));

                          return (
                            <tr key={itemIndex}>
                              <td className="text-center text-muted">{itemIndex + 1}</td>
                              {renderGroupCell && (
                              <td rowSpan={rowSpan} className="align-middle" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                {(() => {
                                  const currentPlainVal = item.plainBottle || item.bottleName;
                                  let availablePlainBottleOptions = blockPlainBottleOptions;

                                  // Start with brand-specific bottles
                                  const allOtherBottles = (plainBottleOptions || [])
                                    .filter(pb => !blockPlainBottleOptions.some(opt => normalizeRollOn(opt.value || opt.label) === normalizeRollOn(pb.value || pb.label)));

                                  // Combine: brand bottles + all other bottles so search works everywhere
                                  availablePlainBottleOptions = [...blockPlainBottleOptions, ...allOtherBottles].sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }));

                                  // Build variant-related bottles set (for use in filterOption)
                                  let bottleNamesForCurrentVariant = null;
                                  if (item.printingToBeDone) {
                                    const selectedVariantName = item.printingToBeDone;
                                    const allVariantsWithSameName = (variants || []).filter(v =>
                                      v.variantName && v.variantName.trim().toUpperCase() === selectedVariantName.trim().toUpperCase()
                                    );
                                    const bottleSpecIds = new Set(allVariantsWithSameName.map(v => (v.bottleSpecId?._id || v.bottleSpecId)?.toString()).filter(Boolean));
                                    bottleNamesForCurrentVariant = new Set((bottleSpecs || [])
                                      .filter(bs => bottleSpecIds.has(bs._id?.toString()))
                                      .map(bs => bs.bottleName?.trim().toUpperCase())
                                      .filter(Boolean)
                                    );
                                  }

                                  if (currentPlainVal && !availablePlainBottleOptions.some(o => o.value === currentPlainVal)) {
                                    availablePlainBottleOptions = [{ value: currentPlainVal, label: currentPlainVal }, ...availablePlainBottleOptions].sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }));
                                  }

                                  return (
                                    <CreatableSelect
                                      options={availablePlainBottleOptions}
                                      value={availablePlainBottleOptions.find(opt => opt.value === currentPlainVal) || (currentPlainVal ? { value: currentPlainVal, label: currentPlainVal } : null)}
                                      onChange={(selected) => handleItemChange(itemIndex, 'plainBottle', selected?.value || '')}
                                      onCreateOption={(inputValue) => {
                                        const compObj = companies.find(c => c._id === (block.companyId?._id || block.companyId));
                                        const brandObj = brands.find(b => b._id === (block.brandId?._id || block.brandId));
                                        setMissingPlainBottleData({
                                          bottleName: inputValue.trim(),
                                          companyId: compObj?._id || block.companyId || '',
                                          brandId: brandObj?._id || block.brandId || '',
                                          companyName: compObj?.name || '',
                                          brandName: brandObj?.name || '',
                                          bottlePerBox: '',
                                          printingTypeId: '',
                                          printingColorId: '',
                                          itemIndex: itemIndex,
                                          status: true
                                        });
                                        setShowMissingPlainBottleModal(true);
                                      }}
                                      placeholder={block.brandId ? "Select or type new Plain Bottle..." : "Select brand first..."}
                                      isDisabled={!block.brandId}
                                      isClearable
                                      isSearchable
                                      closeMenuOnScroll={(e) => true}
                                      menuPosition="fixed"
                                      menuPlacement="auto"
                                      menuPortalTarget={document.body}
                                      styles={{
                                        menuPortal: base => ({ ...base, zIndex: 9999 }),
                                        control: base => ({
                                          ...base,
                                          borderColor: 'var(--bs-border-color-subtle, #dee2e6)',
                                          borderRadius: '0.375rem',
                                          minHeight: '31px',
                                          fontSize: '0.875rem'
                                        })
                                      }}
                                      filterOption={(option, rawInput) => {
                                        if (!rawInput) {
                                          // No search input - show ONLY brand-specific bottles
                                          return blockPlainBottleOptions.some(opt => opt.value === option.value);
                                        }
                                        const searchUpper = rawInput.trim().toUpperCase();
                                        const optionUpper = (option.label || '').toUpperCase();
                                        if (!optionUpper.includes(searchUpper)) {
                                          return false;
                                        }
                                        if (bottleNamesForCurrentVariant && bottleNamesForCurrentVariant.size > 0) {
                                          return bottleNamesForCurrentVariant.has(optionUpper);
                                        }
                                        return true;
                                      }}
                                      formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                                    />
                                  );
                                })()}
                              </td>
                              )}
                              <td>
                                <div className="d-flex align-items-start gap-1">
                                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                    <Select
                                      isMulti
                                      options={rowVariantOptions}
                                      value={item.printingToBeDone ? [{ value: item.printingToBeDone, label: item.printingToBeDone }] : []}
                                      onChange={(selected) => handleItemChange(itemIndex, 'printingToBeDone', selected ? selected.map(s => s.value) : [])}
                                      placeholder="Printing..."
                                      isClearable
                                      required={false}
                                      menuPortalTarget={document.body}
                                      styles={{
                                        menuPortal: base => ({ ...base, zIndex: 9999 }),
                                        valueContainer: base => ({ ...base, flexWrap: 'wrap', padding: '2px 4px' }),
                                        multiValue: base => ({ ...base, maxWidth: '100%' }),
                                        multiValueLabel: base => ({
                                          ...base,
                                          whiteSpace: 'normal',
                                          wordBreak: 'break-word',
                                          fontSize: '0.8rem',
                                          lineHeight: '1.2'
                                        })
                                      }}
                                    />
                                  </div>
                                  {!item.printingToBeDone && (
                                    <button
                                      type="button"
                                      onClick={() => handleAddVariantClick(item.bottleName, block.brandId, itemIndex, item.coatingShade, item.printingToBeDone)}
                                      className="btn btn-outline-primary px-2 shadow-none d-flex align-items-center justify-content-center gap-1"
                                      style={{ height: '38px', fontSize: '0.875rem' }}
                                      title="Add New Variant"
                                      disabled={!item.bottleName || !block.brandId}
                                    >
                                      <i className="bi bi-plus-lg" style={{ fontSize: '0.8rem' }}></i> Add
                                    </button>
                                  )}
                                </div>
                                {item.bottleName && rowVariantOptions.length === 0 && (
                                  <div style={{ fontSize: '0.7rem' }} className="text-warning mt-1">
                                    <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                    No variants. <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddVariantClick(item.bottleName, block.brandId, itemIndex, item.coatingShade, item.printingToBeDone); }} className="text-decoration-underline text-warning fw-bold btn btn-link p-0 border-0 align-baseline" style={{ fontSize: 'inherit' }}>Add Variant</button>
                                  </div>
                                )}
                              </td>
                              {renderShadeGroupCell && (
                              <td rowSpan={shadeRowSpan} className="align-middle" style={{ backgroundColor: (isGrouped && shadeRowSpan > 1) ? '#f8f9fa' : 'inherit' }}>
                                <CreatableSelect
                                  options={uniqueCoatingShades}
                                  value={item.coatingShade ? { value: item.coatingShade, label: item.coatingShade } : null}
                                  onChange={(selected) => {
                                    if (isGrouped && shadeRowSpan > 1) {
                                      const updatedBlock = { ...block };
                                      for (let i = itemIndex; i < itemIndex + shadeRowSpan; i++) {
                                        updatedBlock.items[i].coatingShade = selected ? selected.value : '';
                                      }
                                      setBlock(updatedBlock);
                                    }
                                    handleItemChange(itemIndex, 'coatingShade', selected?.value || '');
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
                              <td className="align-middle">
                                <input
                                  type="text"
                                  className="form-control form-control-sm shadow-none text-center"
                                  value={item.textColor}
                                  onChange={(e) => handleItemChange(itemIndex, 'textColor', e.target.value)}
                                  placeholder="Text Color..."
                                   list="editPrintingPlanTextColorList"
                                 />
                              </td>
                              {renderStockGroupCell && (
                              <td rowSpan={stockRowSpan} className="align-middle" style={{ backgroundColor: stockRowSpan > 1 ? '#f8f9fa' : 'inherit' }}>
                                <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.plainBottleStock} onChange={(e) => {
                                  const val = e.target.value;
                                  const parsed = parseFloat(val) || 0;
                                  if (stockRowSpan > 1) {
                                    const updatedBlock = { ...block };
                                    for (let i = itemIndex; i < itemIndex + stockRowSpan; i++) {
                                      updatedBlock.items[i].plainBottleStock = val;
                                      const prod = parseFloat(updatedBlock.items[i].producedQty) || 0;
                                      const isP = (updatedBlock.items[i].coatingShade || '').trim().toUpperCase() === 'PLAIN';
                                      if (isP) {
                                        const o = parseFloat(updatedBlock.items[i].orderQty) || 0;
                                        updatedBlock.items[i].balanceToMake = Math.max(0, o - prod);
                                      } else {
                                        const o = parseFloat(updatedBlock.items[i].orderQty) || 0;
                                        updatedBlock.items[i].balanceToMake = Math.max(0, o - prod);
                                      }
                                    }
                                    setBlock(updatedBlock);
                                  } else {
                                    handleItemChange(itemIndex, 'plainBottleStock', e.target.value);
                                  }
                                }} min="0" />
                                {(item.coatingShade || '').trim().toUpperCase() === 'PLAIN' && (() => {
                                  const hasBottle = Boolean(item.bottleName);
                                  if (!hasBottle) return null;
                                  const stockSuppliers = (companies || []).filter(c => c.isStockSupplier);
                                  const hasSupplierWithBottle = (item.hasSuppliers === true) ||
                                    (Array.isArray(item.eligibleSuppliers) && item.eligibleSuppliers.length > 0) ||
                                    (item.stockSources && item.stockSources.some(sId => stockSuppliers.some(supp => (supp._id || supp).toString() === (sId?._id || sId)?.toString())));

                                  if (!hasSupplierWithBottle) return null;

                                  const selectedSources = item.stockSources || (block.companyId ? [block.companyId] : []);
                                  const ownComp = (companies || []).find(c => (c._id?.toString() || c.toString()) === (block.companyId?._id || block.companyId)?.toString());
                                  const availableSources = [ownComp, ...stockSuppliers].filter(Boolean);
                                  return (
                                    <div className="dropdown dropup mt-1 position-relative stock-from-dropdown">
                                      <button
                                        className="btn btn-sm btn-outline-secondary py-0 px-1 w-100 dropdown-toggle"
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const dId = String(itemIndex);
                                          setOpenDropdownId(prev => prev === dId ? null : dId);
                                        }}
                                        aria-expanded={openDropdownId === String(itemIndex)}
                                        style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
                                      >
                                        Stock from ({selectedSources.length})
                                      </button>
                                      {openDropdownId === String(itemIndex) && (
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
                                            const srcFound = (item.sources || []).find(src => (src.companyId?._id || src.companyId)?.toString() === sIdStr)
                                                        || (item.eligibleSuppliers || []).find(src => (src.companyId?._id || src.companyId)?.toString() === sIdStr);
                                            const sAvail = srcFound?.available !== undefined 
                                              ? srcFound.available 
                                              : (sIdStr === String(block.companyId?._id || block.companyId) ? (item.plainBottleStock || 0) : 0);
                                            return (
                                              <div className="form-check" key={sIdStr}>
                                                <input
                                                  className="form-check-input"
                                                  type="checkbox"
                                                  id={`edit_print_src_${itemIndex}_${sIdStr}`}
                                                  checked={isChecked}
                                                  onChange={(e) => handleTogglePrintingSource(itemIndex, sIdStr, e.target.checked)}
                                                />
                                                <label className="form-check-label small" htmlFor={`edit_print_src_${itemIndex}_${sIdStr}`}>
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
                                <input type="number" className={`form-control form-control-sm shadow-none text-center ${item.isExceedingStock && (item.coatingShade || '').trim().toUpperCase() === 'PLAIN' ? 'bg-warning' : ''}`} value={item.orderQty} onChange={(e) => handleItemChange(itemIndex, 'orderQty', e.target.value)} min="1" required />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className={`form-control form-control-sm shadow-none text-center ${item.isExceedingStock ? 'bg-warning bg-opacity-25 border-warning text-dark fw-bold' : ''}`}
                                  value={item.producedQty}
                                  onChange={(e) => handleItemChange(itemIndex, 'producedQty', e.target.value)}
                                  min="0"
                                  title={item.isExceedingStock ? 'Total Ready (Printed) Qty exceeds Plain Stock' : ''}
                                />
                                {(item.coatingShade || '').trim().toUpperCase() === 'PLAIN' && (() => {
                                  const selectedSources = item.stockSources || (block.companyId ? [block.companyId] : []);
                                  if (selectedSources.length < 2) return null;

                                  const reqQty = Number(item.producedQty) || 0;
                                  const alloc = item.stockAllocation || [];
                                  let allocSum = 0;
                                  let errorMsg = null;

                                  for (const sId of selectedSources) {
                                    const comp = (companies || []).find(c => (c._id || c)?.toString() === sId?.toString());
                                    const sName = comp?.name || 'Company';
                                    const sAvail = item.sources?.find(src => (src.companyId?._id || src.companyId)?.toString() === sId?.toString())?.available
                                      ?? item.eligibleSuppliers?.find(src => (src.companyId?._id || src.companyId)?.toString() === sId?.toString())?.available
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
                                                onChange={(e) => handlePrintingSplitChange(itemIndex, sId, e.target.value)}
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
                                {item.isExceedingStock && (
                                  <div className="text-warning fw-bold text-center" style={{ fontSize: '0.65rem' }}>
                                    <i className="bi bi-exclamation-triangle-fill me-1"></i>Exceeds Stock
                                  </div>
                                )}
                              </td>
                              <td>
                                <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.balanceToMake} onChange={(e) => handleItemChange(itemIndex, 'balanceToMake', e.target.value)} />
                              </td>
                              {renderGroupCell && (
                              <td rowSpan={rowSpan} className="align-middle" style={{ backgroundColor: isGrouped ? '#f8f9fa' : 'inherit' }}>
                                <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.boxQty} onChange={(e) => handleItemChange(itemIndex, 'boxQty', e.target.value)} min="1" />
                              </td>
                              )}
                              <td>
                                <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.noOfBoxes} onChange={(e) => handleItemChange(itemIndex, 'noOfBoxes', e.target.value)} min="0" />
                              </td>
                              <td>
                                <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.dispatchBalance} onChange={(e) => handleItemChange(itemIndex, 'dispatchBalance', e.target.value)} min="0" />
                              </td>
                              <td>
                                <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.soldQty} onChange={(e) => handleItemChange(itemIndex, 'soldQty', e.target.value)} min="0" />
                              </td>
                              <td>
                                <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.readyBoxes} onChange={(e) => handleItemChange(itemIndex, 'readyBoxes', e.target.value)} min="0" />
                              </td>
                              {isShrenoCompany && getOrderedHeaders(block.selectedItemTypeOptions, sortedActiveItemTypes).map((headerName, hIdx) => (
                                <td key={`comp_td_${hIdx}`} className="text-center align-middle">
                                  <input
                                    type="number"
                                    className="form-control form-control-sm shadow-none text-center"
                                    value={item.components?.[headerName] ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const newBlock = { ...block };
                                      const currentItem = newBlock.items[itemIndex];
                                      currentItem.components = {
                                        ...(currentItem.components || {}),
                                        [headerName]: val
                                      };
                                      setBlock(newBlock);
                                    }}
                                    min="0"
                                    placeholder="0"
                                  />
                                </td>
                              ))}
                              <td>
                                <input type="text" className="form-control form-control-sm shadow-none" value={item.remarks} onChange={(e) => handleItemChange(itemIndex, 'remarks', e.target.value)} />
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-light text-danger rounded-circle shadow-sm"
                                  onClick={() => removeItemRow(itemIndex)}
                                  disabled={block.items.length === 1}
                                >
                                  <i className="bi bi-trash"></i>
                                </button>
                              </td>
                            </tr>
                          );
                          });
                        })()}
                        </tbody>
                        <tfoot className="table-light fw-bold">
                          {(() => {
                            const seenPools = new Set();
                            const totalStock = block.items.reduce((sum, item) => {
                              const isPlain = (item.coatingShade || '').trim().toUpperCase() === 'PLAIN';
                              const bName = (item.plainBottle || item.bottleName || '').trim().toUpperCase();
                              const key = isPlain 
                                ? `PLAIN_${bName}`
                                : (item.sharedGroupId ? `${item.sharedGroupId}_${(item.coatingShade || '').trim().toUpperCase()}` : null);
                              if (key) {
                                if (seenPools.has(key)) return sum;
                                seenPools.add(key);
                              }
                              return sum + (parseFloat(item.plainBottleStock) || 0);
                            }, 0);
                            const totalOrderQty = block.items.reduce((sum, item) => sum + (parseFloat(item.orderQty) || 0), 0);
                            const totalNoOfBoxes = block.items.reduce((sum, item) => sum + (parseFloat(item.noOfBoxes) || 0), 0);

                            return (
                              <tr>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td className="text-center">{totalStock}</td>
                                <td className="text-center">{totalOrderQty}</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td className="text-center">{totalNoOfBoxes}</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                {isShrenoCompany && getOrderedHeaders(block.selectedItemTypeOptions, sortedActiveItemTypes).map((headerName, hIdx) => (
                                  <td key={`comp_foot_${hIdx}`}></td>
                                ))}
                                <td></td>
                                <td></td>
                              </tr>
                            );
                          })()}
                        </tfoot>
                      </table>
                  </div>

                  <div className="d-flex justify-content-between">
                    <button type="button" className="btn btn-sm btn-outline-primary shadow-sm" onClick={addItemRow}>
                      <i className="bi bi-plus-lg me-1"></i> Add Entry Row
                    </button>
                  </div>
                </div>

                <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    <i className="bi bi-check2-circle me-2" /> {loading ? 'Saving...' : 'Save All Plans'}
                  </button>
                  <button type="button" onClick={() => navigate('/printing-plan')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
                    Cancel
                  </button>
                </div>
                <datalist id="editPrintingPlanTextColorList">
                {sortedUniqueTextColors.map(color => (
                  <option key={color} value={color} />
                ))}
              </datalist>
            </form>
            </div>
          </div>
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
                        onChange={(e) => setMissingPlainBottleData({ ...missingPlainBottleData, bottlePerBox: e.target.value })}
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
    </div>
    </>
  );
}