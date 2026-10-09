import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../services/api';

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
      .addCase(fetchIncomingById.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { clearCurrentIncoming } = incomingSlice.actions;
export default incomingSlice.reducer;
