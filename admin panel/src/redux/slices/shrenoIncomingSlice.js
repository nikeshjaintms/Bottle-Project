import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

export const fetchShrenoIncoming = createAsyncThunk(
  'shrenoIncoming/fetch',
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get('/shreno-incoming', { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch');
    }
  }
);

export const deleteShrenoIncoming = createAsyncThunk(
  'shrenoIncoming/delete',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/shreno-incoming/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete');
    }
  }
);

const shrenoIncomingSlice = createSlice({
  name: 'shrenoIncoming',
  initialState: {
    data: [],
    loading: false,
    error: null,
    total: 0,
    totalPages: 1,
    page: 1
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchShrenoIncoming.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchShrenoIncoming.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data;
        state.total = action.payload.total;
        state.totalPages = action.payload.totalPages;
        state.page = action.payload.page;
      })
      .addCase(fetchShrenoIncoming.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export default shrenoIncomingSlice.reducer;
