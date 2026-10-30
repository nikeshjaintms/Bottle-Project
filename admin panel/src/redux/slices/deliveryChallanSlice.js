import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../../services/api";

// Fetch challans
export const fetchDeliveryChallans = createAsyncThunk(
  "deliveryChallans/fetchDeliveryChallans",
  async (params, { rejectWithValue }) => {
    try {
      const response = await API.get("/delivery-challan", { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch delivery challans"
      );
    }
  }
);

// Fetch single challan
export const fetchDeliveryChallanById = createAsyncThunk(
  "deliveryChallans/fetchDeliveryChallanById",
  async (id, { rejectWithValue }) => {
    try {
      const response = await API.get(`/delivery-challan/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch delivery challan"
      );
    }
  }
);

// Fetch next challan number
export const fetchNextChallanNo = createAsyncThunk(
  "deliveryChallans/fetchNextChallanNo",
  async (challanType = "shayoona", { rejectWithValue }) => {
    try {
      const response = await API.get("/delivery-challan/next-no", {
        params: { challanType },
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch next challan number"
      );
    }
  }
);

// Create challan
export const createDeliveryChallan = createAsyncThunk(
  "deliveryChallans/createDeliveryChallan",
  async (formData, { rejectWithValue }) => {
    try {
      const response = await API.post("/delivery-challan", formData);
      return response.data;
    } catch (error) {
      if (error.response?.data?.code === "VARIANT_MATERIAL_CODE_CONFLICT") {
        return rejectWithValue(error.response.data);
      }
      return rejectWithValue(
        error.response?.data?.message || "Failed to create delivery challan"
      );
    }
  }
);

// Update challan
export const updateDeliveryChallan = createAsyncThunk(
  "deliveryChallans/updateDeliveryChallan",
  async ({ id, formData }, { rejectWithValue }) => {
    try {
      const response = await API.put(`/delivery-challan/${id}`, formData);
      return response.data;
    } catch (error) {
      if (error.response?.data?.code === "VARIANT_MATERIAL_CODE_CONFLICT") {
        return rejectWithValue(error.response.data);
      }
      return rejectWithValue(
        error.response?.data?.message || "Failed to update delivery challan"
      );
    }
  }
);

// Delete challan
export const deleteDeliveryChallan = createAsyncThunk(
  "deliveryChallans/deleteDeliveryChallan",
  async (id, { rejectWithValue }) => {
    try {
      const response = await API.delete(`/delivery-challan/${id}`);
      return { id, message: response.data?.message };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to delete delivery challan"
      );
    }
  }
);

const initialState = {
  challans: [],
  currentChallan: null,
  nextNo: "806",
  loading: false,
  error: null,
  page: 1,
  totalPages: 1,
  total: 0,
  searchTerm: "",
};

const deliveryChallanSlice = createSlice({
  name: "deliveryChallans",
  initialState,
  reducers: {
    setSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
    },
    clearCurrentChallan: (state) => {
      state.currentChallan = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch List
      .addCase(fetchDeliveryChallans.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDeliveryChallans.fulfilled, (state, action) => {
        state.loading = false;
        state.challans = action.payload.data || [];
        state.page = action.payload.page || 1;
        state.totalPages = action.payload.totalPages || 1;
        state.total = action.payload.total || 0;
      })
      .addCase(fetchDeliveryChallans.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch Single
      .addCase(fetchDeliveryChallanById.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDeliveryChallanById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentChallan = action.payload.data;
      })
      .addCase(fetchDeliveryChallanById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch Next No
      .addCase(fetchNextChallanNo.fulfilled, (state, action) => {
        if (action.payload?.nextNo) {
          state.nextNo = action.payload.nextNo;
        }
      })

      // Create
      .addCase(createDeliveryChallan.pending, (state) => {
        state.loading = true;
      })
      .addCase(createDeliveryChallan.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload?.data) {
          state.challans.unshift(action.payload.data);
          state.total += 1;
        }
      })
      .addCase(createDeliveryChallan.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update
      .addCase(updateDeliveryChallan.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateDeliveryChallan.fulfilled, (state, action) => {
        state.loading = false;
        const updated = action.payload?.data;
        if (updated) {
          const idx = state.challans.findIndex((c) => c._id === updated._id);
          if (idx !== -1) {
            state.challans[idx] = updated;
          }
          state.currentChallan = updated;
        }
      })
      .addCase(updateDeliveryChallan.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Delete
      .addCase(deleteDeliveryChallan.fulfilled, (state, action) => {
        state.challans = state.challans.filter((c) => c._id !== action.payload.id);
        state.total = Math.max(0, state.total - 1);
      });
  },
});

export const { setSearchTerm, clearCurrentChallan } = deliveryChallanSlice.actions;
export default deliveryChallanSlice.reducer;
