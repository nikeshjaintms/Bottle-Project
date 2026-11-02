import { createSlice, createAsyncThunk, } from "@reduxjs/toolkit";

import API from "../../services/api";

export const fetchUsers = createAsyncThunk(

  "users/fetchUsers",

  async (params, { rejectWithValue }) => {

    try {

      const response = await API.get(
        "/users",
        {
          params,
        }
      );

      return response.data;

    } catch (error) {

      return rejectWithValue(

        error.response?.data?.message ||
        "Failed to fetch users"

      );

    }

  }
);

export const fetchSingleUser =
  createAsyncThunk(

    "users/fetchSingleUser",

    async (id, { rejectWithValue }) => {

      try {

        const response = await API.get(
          `/users/${id}`
        );

        return response.data;

      } catch (error) {

        return rejectWithValue(

          error.response?.data?.message ||
          "Failed to fetch user"

        );

      }

    }

  );
export const deleteUser = createAsyncThunk(

  "users/deleteUser",

  async (id, { rejectWithValue }) => {

    try {

      await API.delete(
        `/users/${id}`
      );

      return id;

    } catch (error) {

      return rejectWithValue(

        error.response?.data?.message ||
        "Delete failed"

      );

    }

  }
);

export const updateUserStatus =
  createAsyncThunk(

    "users/updateUserStatus",

    async ({ id, status },
      { rejectWithValue }) => {

      try {

        const response = await API.put(

          `/users/${id}`,

          { status }

        );

        return response.data;

      } catch (error) {

        return rejectWithValue(

          error.response?.data?.message ||
          "Failed to update status"

        );

      }

    }

  );

export const addUser =
  createAsyncThunk(

    "users/addUser",

    async (formData,
      { rejectWithValue }) => {

      try {

        const response =
          await API.post(
            "/users",
            formData
          );

        return response.data;

      } catch (error) {

        return rejectWithValue(

          error.response?.data?.message ||
          "Failed to create user"

        );

      }

    }

  );

export const updateUser =
  createAsyncThunk(

    "users/updateUser",

    async (
      { id, formData },
      { rejectWithValue }
    ) => {

      try {

        const response =
          await API.put(

            `/users/${id}`,

            formData

          );

        return response.data;

      } catch (error) {

        return rejectWithValue(

          error.response?.data?.message ||
          "Failed to update user"

        );

      }

    }

  );

export const uploadUserImage =
  createAsyncThunk(

    "users/uploadUserImage",

    async (
      { id, imageFile },
      { rejectWithValue }
    ) => {

      try {

        const formData = new FormData();
        formData.append("image", imageFile);

        const response =
          await API.post(

            `/users/${id}/profile-image`,

            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data"
              }
            }

          );

        return response.data;

      } catch (error) {

        return rejectWithValue(

          error.response?.data?.message ||
          "Failed to upload image"

        );

      }

    }

  );

export const deleteUserImage =
  createAsyncThunk(

    "users/deleteUserImage",

    async (id, { rejectWithValue }) => {

      try {

        const response =
          await API.delete(

            `/users/${id}/profile-image`

          );

        return response.data;

      } catch (error) {

        return rejectWithValue(

          error.response?.data?.message ||
          "Failed to delete image"

        );

      }

    }

  );

const userSlice = createSlice({

  name: "users",

  initialState: {

    users: [],

    singleUser: null,

    loading: false,

    error: null,

    page: 1,

    totalPages: 1,

    total: 0,
    activeCount: 0,
    inactiveCount: 0,
    pendingCount: 0,
    searchTerm: ""

  },

  reducers: {
    setSearchTerm(state, action) {
      state.searchTerm = action.payload;
    }
  },

  extraReducers: (builder) => {

    builder

      // FETCH USERS
      .addCase(fetchUsers.pending, (state) => {

        state.loading = true;

      })

      .addCase(fetchUsers.fulfilled, (state, action) => {

  state.loading = false;

  state.users = action.payload.data || [];

  state.page = action.payload.page || 1;

  state.totalPages = action.payload.totalPages || 1;

  state.total = action.payload.total || 0;

  state.activeCount = action.payload.activeCount || 0;

  state.inactiveCount = action.payload.inactiveCount || 0;

  state.pendingCount = action.payload.pendingCount || 0;

})

      .addCase(fetchUsers.rejected, (state, action) => {

        state.loading = false;

        state.error = action.payload;

      })

      // DELETE USER
      .addCase(deleteUser.fulfilled, (state, action) => {

        state.users = state.users.filter(
          (user) => user._id !== action.payload
        );

      })

      // FETCH SINGLE USER
      .addCase(fetchSingleUser.pending, (state) => {

        state.loading = true;

      })

      .addCase(fetchSingleUser.fulfilled, (state, action) => {

        state.loading = false;

        state.singleUser = action.payload;

      })

      .addCase(fetchSingleUser.rejected, (state, action) => {

        state.loading = false;

        state.error = action.payload;

      })

      // UPDATE STATUS
      .addCase(updateUserStatus.pending, (state) => {

        state.loading = true;

      })

      .addCase(updateUserStatus.fulfilled, (state, action) => {

        state.loading = false;

        state.singleUser = action.payload;

      })

      .addCase(updateUserStatus.rejected, (state, action) => {

        state.loading = false;

        state.error = action.payload;

      })

      // ADD USER
      .addCase(addUser.pending,
        (state) => {

          state.loading = true;

        }
      )

      .addCase(addUser.fulfilled,
        (state, action) => {

          state.loading = false;

          state.users.push(
            action.payload
          );

        }
      )

      .addCase(addUser.rejected,
        (state, action) => {

          state.loading = false;

          state.error = action.payload;

        }
      )

      // UPDATE USER
      .addCase(updateUser.pending,
        (state) => {

          state.loading = true;

        }
      )

      .addCase(updateUser.fulfilled,
        (state, action) => {

          state.loading = false;

          state.singleUser =
            action.payload;

          state.users =
            state.users.map((user) =>

              user._id ===
                action.payload._id

                ? action.payload

                : user

            );

        }
      )

      .addCase(updateUser.rejected,
        (state, action) => {

          state.loading = false;

          state.error = action.payload;

        }
      )

      // UPLOAD USER IMAGE
      .addCase(uploadUserImage.pending, (state) => {
        state.loading = true;
      })

      .addCase(uploadUserImage.fulfilled, (state, action) => {
        state.loading = false;
        state.singleUser = action.payload;
        state.users = state.users.map((user) =>
          user._id === action.payload._id ? action.payload : user
        );
      })

      .addCase(uploadUserImage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // DELETE USER IMAGE
      .addCase(deleteUserImage.pending, (state) => {
        state.loading = true;
      })

      .addCase(deleteUserImage.fulfilled, (state, action) => {
        state.loading = false;
        state.singleUser = action.payload;
        state.users = state.users.map((user) =>
          user._id === action.payload._id ? action.payload : user
        );
      })

      .addCase(deleteUserImage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

  },

});

export const { setSearchTerm } = userSlice.actions;

export default userSlice.reducer;