import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../../services/api";

// ================= GET COMPANY ADDRESSES =================
export const fetchCompanyAddresses = createAsyncThunk(
  "companyAddresses/fetchCompanyAddresses",
  async (params, { rejectWithValue }) => {
    try {
      const response = await API.get("/company-address", { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch company addresses"
      );
    }
  }
);

// ================= CREATE COMPANY ADDRESS =================
export const createCompanyAddress = createAsyncThunk(
  "companyAddresses/createCompanyAddress",
  async (formData, { rejectWithValue }) => {
    try {
      const response = await API.post("/company-address", formData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to create company address"
      );
    }
  }
);

// ================= UPDATE COMPANY ADDRESS =================
export const updateCompanyAddress = createAsyncThunk(
  "companyAddresses/updateCompanyAddress",
  async ({ id, formData }, { rejectWithValue }) => {
    try {
      const response = await API.put(`/company-address/${id}`, formData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update company address"
      );
    }
  }
);

// ================= DELETE COMPANY ADDRESS =================
export const deleteCompanyAddress = createAsyncThunk(
  "companyAddresses/deleteCompanyAddress",
  async (id, { rejectWithValue }) => {
    try {
      const response = await API.delete(`/company-address/${id}`);
      return { id, message: response.data?.message };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to delete company address"
      );
    }
  }
);

const initialState = {
  addresses: [],
  loading: false,
  error: null,
  page: 1,
  totalPages: 1,
  total: 0,
  searchTerm: "",
};

const companyAddressSlice = createSlice({
  name: "companyAddresses",
  initialState,
  reducers: {
    setSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch
      .addCase(fetchCompanyAddresses.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCompanyAddresses.fulfilled, (state, action) => {
        state.loading = false;
        state.addresses = action.payload.data || [];
        state.page = action.payload.page || 1;
        state.totalPages = action.payload.totalPages || 1;
        state.total = action.payload.total || (action.payload.data ? action.payload.data.length : 0);
      })
      .addCase(fetchCompanyAddresses.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Create
      .addCase(createCompanyAddress.pending, (state) => {
        state.loading = true;
      })
      .addCase(createCompanyAddress.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload?.data) {
          state.addresses.unshift(action.payload.data);
          state.total += 1;
        }
      })
      .addCase(createCompanyAddress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update
      .addCase(updateCompanyAddress.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateCompanyAddress.fulfilled, (state, action) => {
        state.loading = false;
        const updated = action.payload?.data;
        if (updated) {
          const idx = state.addresses.findIndex((a) => a._id === updated._id);
          if (idx !== -1) {
            state.addresses[idx] = updated;
          }
        }
      })
      .addCase(updateCompanyAddress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Delete
      .addCase(deleteCompanyAddress.pending, (state) => {
        state.loading = true;
      })
      .addCase(deleteCompanyAddress.fulfilled, (state, action) => {
        state.loading = false;
        if (state.addresses.length > 0 && Array.isArray(state.addresses[0]?.addresses)) {
          state.addresses = state.addresses.map((comp) => {
            const nextAddresses = (comp.addresses || []).filter((a) => a._id !== action.payload.id);
            return {
              ...comp,
              addresses: nextAddresses,
              addressCount: nextAddresses.length,
            };
          });
        } else {
          state.addresses = state.addresses.filter((a) => a._id !== action.payload.id);
          state.total = Math.max(0, state.total - 1);
        }
      })
      .addCase(deleteCompanyAddress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { setSearchTerm, clearError } = companyAddressSlice.actions;
export default companyAddressSlice.reducer;
