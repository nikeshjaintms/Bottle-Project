import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../services/api';

const normalizeBottleName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const getDispatchVariantOptionsKey = (companyId, plainBottleId) => `${companyId}:${plainBottleId}`;

export const fetchDispatchPlainBottleOptions = createAsyncThunk(
  'dispatch/fetchPlainBottleOptions',
  async (companyId, { rejectWithValue }) => {
    try {
      const response = await API.get('/ready-to-dispatch/options/plain-bottles', {
        params: { companyId },
      });
      const optionsByName = new Map();
      (response.data?.data || []).forEach((bottle) => {
        const name = String(bottle.name || '').trim().replace(/\s+/g, ' ');
        const normalizedName = normalizeBottleName(name);
        if (!bottle.id || !name || !normalizedName || normalizedName === 'unknown' || optionsByName.has(normalizedName)) return;
        optionsByName.set(normalizedName, { value: String(bottle.id), label: name });
      });

      const options = Array.from(optionsByName.values()).sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
      );
      return { companyId: String(companyId), options };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Could not load plain bottles for this company.'
      );
    }
  },
  {
    condition: (companyId, { getState }) => {
      const options = getState().dispatch.plainBottleOptionsByCompany[String(companyId)];
      return (!options?.loaded || Boolean(options?.error)) && !options?.loading;
    },
  }
);

export const fetchDispatchVariantOptions = createAsyncThunk(
  'dispatch/fetchVariantOptions',
  async ({ companyId, plainBottleId }, { rejectWithValue }) => {
    try {
      const response = await API.get('/ready-to-dispatch/options/variants', {
        params: { companyId, plainBottleId },
      });
      const optionsById = new Map();
      (response.data?.data || []).forEach((variant) => {
        if (!variant.variantId || !variant.variantName) return;
        const value = String(variant.variantId);
        if (!optionsById.has(value)) {
          optionsById.set(value, {
            value,
            label: String(variant.variantName).trim(),
            variantName: String(variant.variantName).trim(),
            brandName: String(variant.brandName || '').trim(),
            coatingShade: String(variant.coatingShade || '').trim(),
            textColor: String(variant.textColor || '').trim(),
            bottleSpecId: String(variant.bottleSpecId || ''),
          });
        }
      });
      const options = Array.from(optionsById.values());
      const nameCounts = new Map();
      options.forEach((option) => {
        const normalizedName = normalizeBottleName(option.variantName);
        nameCounts.set(normalizedName, (nameCounts.get(normalizedName) || 0) + 1);
      });
      options.forEach((option) => {
        if (nameCounts.get(normalizeBottleName(option.variantName)) > 1 && option.brandName) {
          option.label = `${option.variantName} (${option.brandName})`;
        }
      });
      options.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
      );
      return {
        key: getDispatchVariantOptionsKey(companyId, plainBottleId),
        options,
      };
    } catch (error) {
      return rejectWithValue({
        key: getDispatchVariantOptionsKey(companyId, plainBottleId),
        message: error.response?.data?.message || 'Could not load variants for this plain bottle.',
      });
    }
  },
  {
    condition: ({ companyId, plainBottleId }, { getState }) => {
      if (!companyId || !plainBottleId) return false;
      const key = getDispatchVariantOptionsKey(companyId, plainBottleId);
      const options = getState().dispatch.variantOptionsByCompanyBottle[key];
      return (!options?.loaded || Boolean(options?.error)) && !options?.loading;
    },
  }
);

export const fetchDispatch = createAsyncThunk('dispatch/fetchDispatch', async ({ page = 1, limit = 10, search = '', searchPrinting = '', dateFrom = '', dateTo = '', pagination, companyId, plainBottleName = '' }, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (search) params.append('search', search);
    if (searchPrinting) params.append('searchPrinting', searchPrinting);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (pagination !== undefined) params.append('pagination', pagination);
    if (companyId) params.append('companyId', companyId);
    if (plainBottleName) params.append('plainBottleName', plainBottleName);
    
    const res = await API.get(`/dispatch?${params.toString()}`);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch dispatch documents');
  }
});

export const fetchDispatchById = createAsyncThunk('dispatch/fetchDispatchById', async (id, { rejectWithValue }) => {
  try {
    const res = await API.get(`/dispatch/${id}`);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch dispatch document');
  }
});

export const createDispatch = createAsyncThunk('dispatch/createDispatch', async (data, { rejectWithValue }) => {
  try {
    const res = await API.post(`/dispatch`, data);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to create dispatch document');
  }
});

export const updateDispatch = createAsyncThunk('dispatch/updateDispatch', async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await API.put(`/dispatch/${id}`, data);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to update dispatch document');
  }
});

export const deleteDispatch = createAsyncThunk('dispatch/deleteDispatch', async (id, { rejectWithValue }) => {
  try {
    const res = await API.delete(`/dispatch/${id}`);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to delete dispatch document');
  }
});

const dispatchSlice = createSlice({
  name: 'dispatch',
  initialState: {
    data: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    currentDispatch: null,
    loading: false,
    error: null,
    plainBottleOptionsByCompany: {},
    variantOptionsByCompanyBottle: {},
  },
  reducers: {
    clearCurrentDispatch: (state) => { state.currentDispatch = null; }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDispatch.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchDispatch.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.limit = action.payload.limit || 10;
        state.totalPages = action.payload.totalPages;
      })
      .addCase(fetchDispatch.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchDispatchById.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchDispatchById.fulfilled, (state, action) => { state.loading = false; state.currentDispatch = action.payload; })
      .addCase(fetchDispatchById.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchDispatchPlainBottleOptions.pending, (state, action) => {
        const companyId = String(action.meta.arg);
        state.plainBottleOptionsByCompany[companyId] = {
          ...(state.plainBottleOptionsByCompany[companyId] || {}),
          loading: true,
          error: '',
        };
      })
      .addCase(fetchDispatchPlainBottleOptions.fulfilled, (state, action) => {
        const { companyId, options } = action.payload;
        state.plainBottleOptionsByCompany[companyId] = {
          options,
          loading: false,
          loaded: true,
          error: '',
        };
      })
      .addCase(fetchDispatchPlainBottleOptions.rejected, (state, action) => {
        const companyId = String(action.meta.arg);
        state.plainBottleOptionsByCompany[companyId] = {
          options: [],
          loading: false,
          loaded: false,
          error: action.payload || 'Could not load plain bottles for this company.',
        };
      })
      .addCase(fetchDispatchVariantOptions.pending, (state, action) => {
        const { companyId, plainBottleId } = action.meta.arg;
        const key = getDispatchVariantOptionsKey(companyId, plainBottleId);
        state.variantOptionsByCompanyBottle[key] = {
          ...(state.variantOptionsByCompanyBottle[key] || {}),
          loading: true,
          error: '',
        };
      })
      .addCase(fetchDispatchVariantOptions.fulfilled, (state, action) => {
        const { key, options } = action.payload;
        state.variantOptionsByCompanyBottle[key] = {
          options,
          loading: false,
          loaded: true,
          error: '',
        };
      })
      .addCase(fetchDispatchVariantOptions.rejected, (state, action) => {
        const { key, message } = action.payload || {};
        if (!key) return;
        state.variantOptionsByCompanyBottle[key] = {
          options: [],
          loading: false,
          loaded: false,
          error: message || 'Could not load variants for this plain bottle.',
        };
      });
  },
});

export const { clearCurrentDispatch } = dispatchSlice.actions;
export default dispatchSlice.reducer;
