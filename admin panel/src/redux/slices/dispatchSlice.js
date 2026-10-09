import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../services/api';

export const fetchDispatch = createAsyncThunk('dispatch/fetchDispatch', async ({ page = 1, limit = 10, search = '', searchPrinting = '', dateFrom = '', dateTo = '', pagination }, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (search) params.append('search', search);
    if (searchPrinting) params.append('searchPrinting', searchPrinting);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (pagination !== undefined) params.append('pagination', pagination);
    
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
    totalPages: 1,
    currentDispatch: null,
    loading: false,
    error: null,
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
        state.totalPages = action.payload.totalPages;
      })
      .addCase(fetchDispatch.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchDispatchById.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchDispatchById.fulfilled, (state, action) => { state.loading = false; state.currentDispatch = action.payload; })
      .addCase(fetchDispatchById.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { clearCurrentDispatch } = dispatchSlice.actions;
export default dispatchSlice.reducer;
