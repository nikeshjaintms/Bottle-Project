import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../services/api';

export const fetchLacquerPlans = createAsyncThunk('lacquerPlans/fetchLacquerPlans', async ({ date = '', month = '', fromDate = '', toDate = '', search = '', companyId = '', brandId = '' } = {}, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (month) params.append('month', month);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);
    if (search) params.append('search', search);
    if (companyId) params.append('companyId', companyId);
    if (brandId) params.append('brandId', brandId);
    
    const response = await API.get(`/lacquer-plan?${params.toString()}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch lacquer plans');
  }
});

export const fetchLacquerPlanById = createAsyncThunk('lacquerPlans/fetchLacquerPlanById', async (id, { rejectWithValue }) => {
  try {
    const response = await API.get(`/lacquer-plan/${id}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch lacquer plan');
  }
});

export const createLacquerPlan = createAsyncThunk('lacquerPlans/createLacquerPlan', async (data, { rejectWithValue }) => {
  try {
    const response = await API.post('/lacquer-plan', data);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to create lacquer plan');
  }
});

export const updateLacquerPlan = createAsyncThunk('lacquerPlans/updateLacquerPlan', async ({ id, data }, { rejectWithValue }) => {
  try {
    const response = await API.put(`/lacquer-plan/${id}`, data);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to update lacquer plan');
  }
});

export const deleteLacquerPlan = createAsyncThunk('lacquerPlans/deleteLacquerPlan', async (id, { rejectWithValue }) => {
  try {
    const response = await API.delete(`/lacquer-plan/${id}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to delete lacquer plan');
  }
});

const lacquerPlanSlice = createSlice({
  name: 'lacquerPlans',
  initialState: {
    plans: [],
    loading: false,
    error: null,
    currentPlan: null,
  },
  reducers: {
    clearCurrentPlan: (state) => {
      state.currentPlan = null;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLacquerPlans.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchLacquerPlans.fulfilled, (state, action) => {
        state.loading = false;
        state.plans = action.payload.data;
      })
      .addCase(fetchLacquerPlans.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchLacquerPlanById.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchLacquerPlanById.fulfilled, (state, action) => { state.loading = false; state.currentPlan = action.payload.data; })
      .addCase(fetchLacquerPlanById.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createLacquerPlan.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(createLacquerPlan.fulfilled, (state, action) => { state.loading = false; })
      .addCase(createLacquerPlan.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(updateLacquerPlan.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(updateLacquerPlan.fulfilled, (state, action) => {
        state.loading = false;
        state.currentPlan = action.payload.data;
      })
      .addCase(updateLacquerPlan.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(deleteLacquerPlan.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(deleteLacquerPlan.fulfilled, (state, action) => {
        state.loading = false;
      })
      .addCase(deleteLacquerPlan.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { clearCurrentPlan, clearError } = lacquerPlanSlice.actions;
export default lacquerPlanSlice.reducer;
