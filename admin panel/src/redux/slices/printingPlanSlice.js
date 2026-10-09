import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../services/api';

export const fetchPrintingPlans = createAsyncThunk('printingPlans/fetchPrintingPlans', async ({ date = '', month = '', fromDate = '', toDate = '', search = '', companyId = '' } = {}, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (month) params.append('month', month);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);
    if (search) params.append('search', search);
    if (companyId) params.append('companyId', companyId);
    
    const response = await API.get(`/printing-plan?${params.toString()}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch printing plans');
  }
});

export const fetchPrintingPlanById = createAsyncThunk('printingPlans/fetchPrintingPlanById', async (id, { rejectWithValue }) => {
  try {
    const response = await API.get(`/printing-plan/${id}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch printing plan');
  }
});

export const createPrintingPlan = createAsyncThunk('printingPlans/createPrintingPlan', async (data, { rejectWithValue }) => {
  try {
    const response = await API.post('/printing-plan', data);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to create printing plan');
  }
});

export const updatePrintingPlan = createAsyncThunk('printingPlans/updatePrintingPlan', async ({ id, data }, { rejectWithValue }) => {
  try {
    const response = await API.put(`/printing-plan/${id}`, data);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to update printing plan');
  }
});

export const deletePrintingPlan = createAsyncThunk('printingPlans/deletePrintingPlan', async (id, { rejectWithValue }) => {
  try {
    const response = await API.delete(`/printing-plan/${id}`);
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to delete printing plan');
  }
});

const printingPlanSlice = createSlice({
  name: 'printingPlans',
  initialState: {
    plans: [],
    loading: false,
    error: null,
    currentPlan: null,
  },
  reducers: {
    clearCurrentPlan: (state) => {
      state.currentPlan = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPrintingPlans.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchPrintingPlans.fulfilled, (state, action) => {
        state.loading = false;
        state.plans = action.payload.data;
      })
      .addCase(fetchPrintingPlans.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchPrintingPlanById.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchPrintingPlanById.fulfilled, (state, action) => { state.loading = false; state.currentPlan = action.payload.data; })
      .addCase(fetchPrintingPlanById.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createPrintingPlan.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(createPrintingPlan.fulfilled, (state, action) => { state.loading = false; })
      .addCase(createPrintingPlan.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(updatePrintingPlan.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(updatePrintingPlan.fulfilled, (state, action) => {
        state.loading = false;
        state.currentPlan = action.payload.data;
      })
      .addCase(updatePrintingPlan.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(deletePrintingPlan.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(deletePrintingPlan.fulfilled, (state, action) => {
        state.loading = false;
      })
      .addCase(deletePrintingPlan.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { clearCurrentPlan } = printingPlanSlice.actions;
export default printingPlanSlice.reducer;
