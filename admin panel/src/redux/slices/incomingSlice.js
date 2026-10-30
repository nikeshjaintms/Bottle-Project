import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../services/api';

const normalizeBottleName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const fetchIncomingPlainBottleOptions = createAsyncThunk(
  'incoming/fetchPlainBottleOptions',
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
  }
);

export const fetchIncoming = createAsyncThunk('incoming/fetchIncoming', async ({ page = 1, limit = 10, search = '', status = '', companyId = '', fromDate = '', toDate = '', bottleName = '', pagination }, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (companyId) params.append('companyId', companyId);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);
    if (bottleName) params.append('bottleName', bottleName);
    if (pagination !== undefined) params.append('pagination', pagination);
    
    const res = await API.get(`/incoming?${params.toString()}`);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch incoming documents');
  }
});

export const fetchIncomingById = createAsyncThunk('incoming/fetchIncomingById', async (id, { rejectWithValue }) => {
  try {
    const res = await API.get(`/incoming/${id}`);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch incoming document');
  }
});

export const createIncoming = createAsyncThunk('incoming/createIncoming', async (data, { rejectWithValue }) => {
  try {
    const res = await API.post(`/incoming`, data);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to create incoming document');
  }
});

export const updateIncoming = createAsyncThunk('incoming/updateIncoming', async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await API.put(`/incoming/${id}`, data);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to update incoming document');
  }
});

export const deleteIncoming = createAsyncThunk('incoming/deleteIncoming', async (id, { rejectWithValue }) => {
  try {
    const res = await API.delete(`/incoming/${id}`);
    return res.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to delete incoming document');
  }
});

const incomingSlice = createSlice({
  name: 'incoming',
  initialState: {
    data: [],
    total: 0,
    page: 1,
    totalPages: 1,
    currentIncoming: null,
    loading: false,
    error: null,
    plainBottleOptionsByCompany: {},
  },
  reducers: {
    clearCurrentIncoming: (state) => { state.currentIncoming = null; }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIncoming.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchIncoming.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.totalPages = action.payload.totalPages;
      })
      .addCase(fetchIncoming.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchIncomingById.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchIncomingById.fulfilled, (state, action) => { state.loading = false; state.currentIncoming = action.payload; })
      .addCase(fetchIncomingById.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchIncomingPlainBottleOptions.pending, (state, action) => {
        const companyId = String(action.meta.arg);
        state.plainBottleOptionsByCompany[companyId] = {
          ...(state.plainBottleOptionsByCompany[companyId] || {}),
          loading: true,
          error: '',
        };
      })
      .addCase(fetchIncomingPlainBottleOptions.fulfilled, (state, action) => {
        const { companyId, options } = action.payload;
        state.plainBottleOptionsByCompany[companyId] = {
          options,
          loading: false,
          loaded: true,
          error: '',
        };
      })
      .addCase(fetchIncomingPlainBottleOptions.rejected, (state, action) => {
        const companyId = String(action.meta.arg);
        state.plainBottleOptionsByCompany[companyId] = {
          options: [],
          loading: false,
          loaded: true,
          error: action.payload || 'Could not load plain bottles for this company.',
        };
      });
  },
});

export const { clearCurrentIncoming } = incomingSlice.actions;
export default incomingSlice.reducer;
