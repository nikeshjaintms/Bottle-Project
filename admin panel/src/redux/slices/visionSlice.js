import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../services/api';

export const matchBottle = createAsyncThunk(
  'vision/matchBottle',
  async (imageFile, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      const response = await API.post('/vision/match', formData);
      return response.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Vision API failed');
    }
  }
);

export const parseInvoice = createAsyncThunk(
  'vision/parseInvoice',
  async (imageFile, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      const response = await API.post('/invoice-vision/parse', formData);
      return response.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Invoice parsing failed');
    }
  }
);

export const parseChallan = createAsyncThunk(
  'vision/parseChallan',
  async (imageFiles, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      if (Array.isArray(imageFiles)) {
        imageFiles.forEach(file => formData.append('images', file));
      } else {
        formData.append('images', imageFiles);
      }
      const response = await API.post('/challan-vision/parse', formData);
      return response.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Challan parsing failed');
    }
  }
);

export const parseShrenoChallan = createAsyncThunk(
  'vision/parseShrenoChallan',
  async (imageFiles, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      if (Array.isArray(imageFiles)) {
        imageFiles.forEach(file => formData.append('images', file));
      } else {
        formData.append('images', imageFiles);
      }
      const response = await API.post('/shreno-vision/parse', formData);
      return response.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Shreno challan parsing failed');
    }
  }
);

const visionSlice = createSlice({
  name: 'vision',
  initialState: {
    matchResult: null,
    invoiceResult: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearMatchResult: (state) => {
      state.matchResult = null;
      state.invoiceResult = null;
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(matchBottle.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(matchBottle.fulfilled, (state, action) => {
        state.loading = false;
        state.matchResult = action.payload;
      })
      .addCase(matchBottle.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(parseInvoice.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(parseInvoice.fulfilled, (state, action) => {
        state.loading = false;
        state.invoiceResult = action.payload;
      })
      .addCase(parseInvoice.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(parseChallan.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(parseChallan.fulfilled, (state, action) => {
        state.loading = false;
        // reuse invoiceResult for challanResult since they serve the same UI purpose
        state.invoiceResult = action.payload;
      })
      .addCase(parseChallan.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(parseShrenoChallan.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(parseShrenoChallan.fulfilled, (state, action) => {
        state.loading = false;
        state.invoiceResult = action.payload;
      })
      .addCase(parseShrenoChallan.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearMatchResult } = visionSlice.actions;
export default visionSlice.reducer;
