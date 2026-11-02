import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../../services/api";

// ================= LOGIN API =================
export const loginUser = createAsyncThunk(
  "auth/loginUser",

  async (formData, { rejectWithValue }) => {

    try {

      const response = await API.post(
        "/auth/login",
        formData
      );

      // Save user
      localStorage.setItem(
        "user",
        JSON.stringify(response.data.user)
      );

      return response.data;

    } catch (error) {

      return rejectWithValue(
        error.response?.data?.message ||
        error.response?.data?.msg ||
        "Login Failed"
      );

    }

  }
);

// ================= LOGOUT API =================
export const logoutUser = createAsyncThunk(
  "auth/logoutUser",
  async (_, { dispatch }) => {
    try {
      await API.post("/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    }
    dispatch(logout());
  }
);

// ================= CHANGE PASSWORD API =================
export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async (passwordData, { rejectWithValue }) => {
    try {
      const response = await API.put("/auth/change-password", passwordData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.msg || error.response?.data?.message || "Operation failed"
      );
    }
  }
);

const authSlice = createSlice({

  name: "auth",

  initialState: {

    user: JSON.parse(localStorage.getItem("user")) || null,

    loading: false,

    error: null,

  },

  reducers: {

    logout: (state) => {

      state.user = null;

      localStorage.removeItem("user");

    },

    updateUserImage: (state, action) => {
      if (state.user) {
        state.user.image = action.payload;
        localStorage.setItem("user", JSON.stringify(state.user));
      }
    },

  },

  extraReducers: (builder) => {

    builder

      // PENDING
      .addCase(loginUser.pending, (state) => {

        state.loading = true;

        state.error = null;

      })

      // SUCCESS
      .addCase(loginUser.fulfilled, (state, action) => {

        state.loading = false;

        state.user = action.payload.user;

      })

      // ERROR
      .addCase(loginUser.rejected, (state, action) => {

        state.loading = false;

        state.error = action.payload;

      });

  },

});

export const { logout, updateUserImage } = authSlice.actions;

export default authSlice.reducer;