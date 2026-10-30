import { useEffect, useState } from 'react';
import Select from 'react-select';
import SearchableSelect from '../../components/SearchableSelect';
import API from '../../services/api';

const optionsCache = new Map();
ChallanProductSelector.clearOptionCache = () => optionsCache.clear();

ChallanProductSelector.clearSelections = (groups) =>
  groups.map((group) => ({
    ...group,
    plainBottle: '',
    plainBottleId: '',
    bottleSpecId: '',
    title: '',
    variantLines: (group.variantLines || []).map((line) => ({
      ...line,
      variantId: '',
      materialCode: '',
      materialCodeDirty: true,
      description: '',
    })),
  }));

const loadOptions = async (cacheKey, url, params) => {
  if (!optionsCache.has(cacheKey)) {
    const request = API.get(url, { params }).then((response) => response.data?.data || []);
    optionsCache.set(cacheKey, request);
    request.catch(() => optionsCache.delete(cacheKey));
  }
  return optionsCache.get(cacheKey);
};

const loadPlainBottles = (companyId) => {
  if (!companyId) return Promise.resolve([]);
  return loadOptions(
    `plain-bottles:${companyId}`,
    '/ready-to-dispatch/options/plain-bottles',
    { companyId }
  ).then((bottles) => {
    const uniqueBottles = new Map();
    bottles.forEach((bottle) => {
      const name = String(bottle.name || '').trim().replace(/\s+/g, ' ');
      if (!bottle.id || !name || name.toLocaleLowerCase() === 'unknown') return;

      const normalizedName = name.normalize('NFKC').toLocaleLowerCase();
      if (!uniqueBottles.has(normalizedName)) {
        uniqueBottles.set(normalizedName, {
          ...bottle,
          id: String(bottle.id),
          value: String(bottle.id),
          name,
          label: name,
        });
      }
    });
    return Array.from(uniqueBottles.values());
  });
};

const loadVariants = (companyId, plainBottleId) => {
  if (!companyId || !plainBottleId) return Promise.resolve([]);
  return loadOptions(
    `variants:${companyId}:${plainBottleId}`,
    '/ready-to-dispatch/options/variants',
    { companyId, plainBottleId, forChallan: 'true' }
  ).then((variants) =>
    variants
      .filter((variant) => variant.variantId && variant.variantName && variant.label)
      .map((variant) => ({
        ...variant,
        value: String(variant.variantId),
        name: variant.variantName,
      }))
  );
};

export default function ChallanProductSelector({
  level,
  companies = [],
  companyId = '',
  plainBottleId = '',
  value = '',
  legacyLabel = '',
  onChange,
  placeholder,
}) {
  const [result, setResult] = useState({ key: '', options: [], error: '' });
  const requestKey = level === 'plainBottle'
    ? (companyId ? `plain-bottles:${companyId}` : '')
    : level === 'variant' && companyId && plainBottleId
      ? `variants:${companyId}:${plainBottleId}`
      : '';

  useEffect(() => {
    if (level !== 'plainBottle' && level !== 'variant') return undefined;
    if (!requestKey) return undefined;

    let active = true;
    const request = level === 'plainBottle'
      ? loadPlainBottles(companyId)
      : loadVariants(companyId, plainBottleId);

    request.then((options) => {
      if (active) setResult({ key: requestKey, options, error: '' });
    }).catch(() => {
      if (active) {
        setResult({
          key: requestKey,
          options: [],
          error: `Unable to load ${level === 'plainBottle' ? 'plain bottles' : 'variants'}.`,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [level, requestKey, companyId, plainBottleId]);

  if (level === 'company') {
    const companyOptions = companies
      .filter((company) => company && company._id && company.name)
      .map((company) => ({ value: String(company._id), label: company.name }));
    return (
      <SearchableSelect
        options={companyOptions}
        value={companyId}
        onChange={onChange}
        placeholder={placeholder || '-- Select Company --'}
        disabled={!companyOptions.length}
      />
    );
  }

  const loaded = result.key === requestKey;
  const options = loaded ? result.options : [];
  const selectedValue = String(value || '');
  const fallbackLabel = String(legacyLabel || '').trim();
  const normalize = (text) => String(text || '').trim().replace(/\s+/g, ' ').normalize('NFKC').toLocaleLowerCase();
  const selectedOption = options.find((option) => option.value === selectedValue) ||
    (fallbackLabel
      ? [...options]
        .sort((a, b) => String(b.variantName || '').length - String(a.variantName || '').length)
        .find((option) =>
          normalize(fallbackLabel) === normalize(option.label) ||
          (option.variantName && normalize(fallbackLabel).includes(normalize(option.variantName)))
        )
      : null);
  const fallbackOption = fallbackLabel
    ? { value: selectedValue || fallbackLabel, label: fallbackLabel }
    : null;
  const isDisabled = !companyId || (level === 'variant' && !plainBottleId) || !loaded;
  const selectPlaceholder = !companyId
    ? 'Select company first'
    : level === 'variant' && !plainBottleId
      ? 'Select plain bottle first'
      : !loaded
        ? 'Loading options...'
        : result.error || (level === 'plainBottle' ? 'No plain bottles available' : 'No variants available');

  return (
    <div>
      <Select
        options={options}
        value={selectedOption || fallbackOption}
        onChange={onChange}
        placeholder={placeholder || selectPlaceholder}
        isClearable
        isDisabled={isDisabled}
        isLoading={!loaded && Boolean(requestKey)}
        menuPortalTarget={document.body}
        menuPosition="fixed"
        menuPlacement="auto"
        styles={{
          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
          control: (base) => ({ ...base, minWidth: 0, minHeight: 40, height: 'auto', alignItems: 'center' }),
          valueContainer: (base) => ({ ...base, minWidth: 0, flexWrap: 'wrap' }),
          singleValue: (base) => ({
            ...base,
            position: 'relative',
            top: 'auto',
            transform: 'none',
            maxWidth: '100%',
            margin: 0,
            whiteSpace: 'normal',
            overflow: 'visible',
            textOverflow: 'clip',
            overflowWrap: 'anywhere',
          }),
          indicatorsContainer: (base) => ({ ...base, flexShrink: 0 }),
          option: (base) => ({ ...base, whiteSpace: 'normal', overflowWrap: 'anywhere' }),
        }}
      />
      {loaded && result.error && <div className="text-danger small mt-1">{result.error}</div>}
    </div>
  );
}
