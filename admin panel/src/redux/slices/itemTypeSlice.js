import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../services/api';

export const fetchItemTypes = createAsyncThunk('itemTypes/fetchItemTypes', async ({ page = 1, limit = 10, search = '', status = '' }, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    
    const response = await API.get(`/item-type?${params.toString()}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch item types');
  }
});

export const fetchItemTypeById = createAsyncThunk('itemTypes/fetchItemTypeById', async (id, { rejectWithValue }) => {
  try {
    const response = await API.get(`/item-type/${id}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch item type');
  }
});

export const createItemType = createAsyncThunk('itemTypes/createItemType', async (data, { rejectWithValue }) => {
  try {
    const response = await API.post('/item-type', data);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to create item type');
  }
});

export const updateItemType = createAsyncThunk('itemTypes/updateItemType', async ({ id, data }, { rejectWithValue }) => {
  try {
    const response = await API.put(`/item-type/${id}`, data);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to update item type');
  }
});

export const deleteItemType = createAsyncThunk('itemTypes/deleteItemType', async (id, { rejectWithValue }) => {
  try {
    const response = await API.delete(`/item-type/${id}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to delete item type');
  }
});

const itemTypeSlice = createSlice({
  name: 'itemTypes',
  initialState: {
    itemTypes: [],
    loading: false,
    error: null,
    total: 0,
    page: 1,
    totalPages: 1,
    searchTerm: '',
    currentItemType: null,
  },
  reducers: {
    setSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
      state.page = 1;
    },
    clearItemTypes: (state) => {
      state.itemTypes = [];
      state.total = 0;
      state.page = 1;
      state.totalPages = 1;
    },
    clearCurrentItemType: (state) => {
      state.currentItemType = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchItemTypes.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchItemTypes.fulfilled, (state, action) => {
        state.loading = false;
        state.itemTypes = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.totalPages = action.payload.totalPages;
      })
      .addCase(fetchItemTypes.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchItemTypeById.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchItemTypeById.fulfilled, (state, action) => { state.loading = false; state.currentItemType = action.payload; })
      .addCase(fetchItemTypeById.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createItemType.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(createItemType.fulfilled, (state, action) => { state.loading = false; state.itemTypes.unshift(action.payload); })
      .addCase(createItemType.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(updateItemType.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(updateItemType.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.itemTypes.findIndex(it => it._id === action.payload._id);
        if (index !== -1) state.itemTypes[index] = action.payload;
        state.currentItemType = action.payload;
      })
      .addCase(updateItemType.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(deleteItemType.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(deleteItemType.fulfilled, (state, action) => {
        state.loading = false;
      })
      .addCase(deleteItemType.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { setSearchTerm, clearItemTypes, clearCurrentItemType } = itemTypeSlice.actions;
export default itemTypeSlice.reducer;
