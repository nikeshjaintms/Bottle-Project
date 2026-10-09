import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../../services/api";

// ================= GET gst =================
export const fetchGst = createAsyncThunk(
  "gst/fetchGst",
  async (params, { rejectWithValue }) => {
    try {
      const response = await API.get("/gst", { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch GST entries"
      );
    }
  }
);

// ================= CREATE gst =================
export const createGst = createAsyncThunk(
  "gst/createGst",
  async (formData, { rejectWithValue }) => {
    try {
      const response = await API.post("/gst", formData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || typeof error.response?.data === 'string' ? error.response.data : "Failed to create GST entry"
      );
    }
  }
);

// ================= UPDATE gst =================
export const updateGst = createAsyncThunk(
  "gst/updateGst",
  async ({ id, formData }, { rejectWithValue }) => {
    try {
      const response = await API.put(`/gst/${id}`, formData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || typeof error.response?.data === 'string' ? error.response.data : "Failed to update GST entry"
      );
    }
  }
);

// ================= DELETE gst =================
export const deleteGst = createAsyncThunk(
  "gst/deleteGst",
  async (id, { rejectWithValue }) => {
    try {
      await API.delete(`/gst/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || typeof error.response?.data === 'string' ? error.response.data : "Failed to delete GST entry"
      );
    }
  }
);

const gstSlice = createSlice({
  name: "gst",
  initialState: {
    searchTerm: "",
    gstList: [],
    loading: false,
    error: null,
    page: 1,
    totalPages: 1,
    total: 0,
  },
  reducers: {
    setSearchTerm: (state, action) => { state.searchTerm = action.payload; },
  },
  extraReducers: (builder) => {
    builder
      // ================= FETCH =================
      .addCase(fetchGst.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchGst.fulfilled, (state, action) => {
        state.loading = false;
        state.gstList = action.payload.data || [];
        state.total = action.payload.total || 0;
        if (action.payload.page !== undefined) {
          state.page = action.payload.page;
        }
        if (action.payload.totalPages !== undefined) {
          state.totalPages = action.payload.totalPages;
        }
      })
      .addCase(fetchGst.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // ================= CREATE =================
      .addCase(createGst.pending, (state) => {
        state.loading = true;
      })
      .addCase(createGst.fulfilled, (state, action) => {
        state.loading = false;
        state.gstList.push(action.payload);
      })
      .addCase(createGst.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // ================= UPDATE =================
      .addCase(updateGst.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateGst.fulfilled, (state, action) => {
        state.loading = false;
        state.gstList = state.gstList.map((g) =>
          g._id === action.payload._id ? action.payload : g
        );
      })
      .addCase(updateGst.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // ================= DELETE =================
      .addCase(deleteGst.pending, (state) => {
        state.loading = true;
      })
      .addCase(deleteGst.fulfilled, (state, action) => {
        state.loading = false;
        state.gstList = state.gstList.filter((g) => g._id !== action.payload);
      })
      .addCase(deleteGst.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { setSearchTerm } = gstSlice.actions;
export default gstSlice.reducer;
