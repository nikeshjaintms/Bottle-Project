import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../../services/api";

export const fetchBottlePerBoxes = createAsyncThunk(
  "bottlePerBox/fetchBottlePerBoxes",
  async (params, { rejectWithValue }) => {
    try {
      const queryParams = new URLSearchParams(params || {});
      const url = `/bottle-per-box?${queryParams.toString()}`;
      const response = await API.get(url);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch Bottle Per Box configs"
      );
    }
  }
);

export const createBottlePerBox = createAsyncThunk(
  "bottlePerBox/createBottlePerBox",
  async (formData, { rejectWithValue }) => {
    try {
      const response = await API.post("/bottle-per-box", formData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to create Bottle Per Box config"
      );
    }
  }
);

export const updateBottlePerBox = createAsyncThunk(
  "bottlePerBox/updateBottlePerBox",
  async ({ id, formData }, { rejectWithValue }) => {
    try {
      const response = await API.put(`/bottle-per-box/${id}`, formData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update Bottle Per Box config"
      );
    }
  }
);

export const deleteBottlePerBox = createAsyncThunk(
  "bottlePerBox/deleteBottlePerBox",
  async (id, { rejectWithValue }) => {
    try {
      await API.delete(`/bottle-per-box/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to delete Bottle Per Box config"
      );
    }
  }
);

const bottlePerBoxSlice = createSlice({
  name: "bottlePerBox",
  initialState: {
    searchTerm: "",
    items: [],
    loading: false,
    error: null,
    page: 1,
    totalPages: 1,
    total: 0,
  },
  reducers: {
    setSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBottlePerBoxes.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchBottlePerBoxes.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.items = action.payload.data || [];
          state.total = action.payload.total || 0;
          if (action.payload.page !== undefined) state.page = action.payload.page;
          if (action.payload.totalPages !== undefined) state.totalPages = action.payload.totalPages;
        } else {
          state.items = Array.isArray(action.payload) ? action.payload : [];
        }
      })
      .addCase(fetchBottlePerBoxes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createBottlePerBox.pending, (state) => {
        state.loading = true;
      })
      .addCase(createBottlePerBox.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
           state.items.unshift(action.payload.data);
        }
      })
      .addCase(createBottlePerBox.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateBottlePerBox.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateBottlePerBox.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
           state.items = state.items.map((item) =>
              item._id === action.payload.data._id ? action.payload.data : item
           );
        }
      })
      .addCase(updateBottlePerBox.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(deleteBottlePerBox.pending, (state) => {
        state.loading = true;
      })
      .addCase(deleteBottlePerBox.fulfilled, (state, action) => {
        state.loading = false;
        state.items = state.items.filter((item) => item._id !== action.payload);
      })
      .addCase(deleteBottlePerBox.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { setSearchTerm } = bottlePerBoxSlice.actions;
export default bottlePerBoxSlice.reducer;
