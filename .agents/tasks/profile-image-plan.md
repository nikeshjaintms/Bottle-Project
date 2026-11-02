# Implementation Plan: User Profile Image Upload & Display

## Context & Architecture Findings

**Backend Stack:** Node.js/Express, MongoDB, Multer (already configured)
- Upload middleware exists at `Backend/src/middleware/upload.middleware.js`
- Uploads stored in `/uploads` directory, served via `express.static("/uploads")`
- Unique filenames generated using timestamp + random number
- Auth middleware: JWT in cookies, user populates role + permissions
- Password hashing: bcryptjs
- No password hashes in responses (already using `.select("-password")`)

**Frontend Stack:** React, Redux, Axios, Vite
- Redux slices: `loginSlice.js` (auth state), `userSlice.js` (users list)
- Topbar currently displays letter avatar (first letter of displayName)
- User pages (AddUser, EditUser, Users, UserDetail) use form controls
- API base URL from env var or production endpoint

**Key Observations:**
- Upload middleware already exists and works for variants/vision/shreno
- No file type validation in current middleware—will need custom validation
- User model lacks image field
- Login response doesn't include image field
- Topbar uses hardcoded letter avatar
- Frontend slices need image upload thunk

---

## Implementation Steps

- [ ] 1. **Add image field to User model**
      Add `image: { type: String, default: "" }` to store relative path like `/uploads/filename.ext`.
      
      Files: `Backend/src/models/user.js`
      
      Verify: Open MongoDB and confirm new schema allows empty image string on existing + new users

- [ ] 2. **Create uploadProfileImage controller method**
      Validates file type (JPG/JPEG/PNG/WEBP only), size (max 5MB), rejects non-images.
      Generates unique filename, saves to `/uploads/users/` subdirectory.
      Deletes old image if exists and is user-specific file.
      Returns saved image path relative to `/uploads`.
      
      Files: `Backend/src/controllers/user.controller.js` (add method)
      
      Verify: Unit test or manual POST to new endpoint with JPG—confirm file saved and path returned

- [ ] 3. **Create deleteProfileImage controller method**
      Sets user.image to empty string, deletes physical file if exists.
      Returns updated user.
      
      Files: `Backend/src/controllers/user.controller.js` (add method)
      
      Verify: Manual DELETE to new endpoint—confirm file deleted and user.image cleared

- [ ] 4. **Update createUser controller to accept image parameter**
      Pass image from req.body to User.create if provided.
      If image file uploaded via multipart, use Multer result; if image path string passed, use directly.
      
      Files: `Backend/src/controllers/user.controller.js` (modify createUser)
      
      Verify: Create user without image—confirm no error; POST /users with FormData including image file—confirm saved

- [ ] 5. **Update updateUser controller to handle image updates**
      If new image uploaded, delete old image, save new path.
      If image = empty string or null in request, clear image and delete file.
      Preserve other fields; do not hash password unless explicitly updated.
      
      Files: `Backend/src/controllers/user.controller.js` (modify updateUser)
      
      Verify: PUT /users/:id with new image FormData—confirm old deleted, new saved; PUT with image = "" —confirm image cleared

- [ ] 6. **Add profile image routes (POST and DELETE)**
      POST `/api/users/:id/profile-image`: Auth required, multipart upload, Multer single("image"), validate file type/size, call uploadProfileImage.
      DELETE `/api/users/:id/profile-image`: Auth required, call deleteProfileImage.
      Add checkAbility middleware to ensure users only upload own image unless admin.
      
      Files: `Backend/src/routes/user.routes.js` (add 2 routes)
      
      Verify: POST with JPG to `/api/users/:someId/profile-image`—confirm 200 + image path; DELETE same—confirm image cleared

- [ ] 7. **Update login controller to include image field**
      Add `image: user.image || ""` to login response user object.
      
      Files: `Backend/src/controllers/login.js` (modify login)
      
      Verify: POST /auth/login—confirm response includes image field (empty or path)

- [ ] 8. **Create profile image upload thunk in Redux userSlice**
      `uploadUserImage(id)`: Accepts FormData with "image" field, POSTs to `/api/users/:id/profile-image`.
      Returns updated user with image path.
      Handles error responses.
      
      Files: `admin panel/src/redux/slices/userSlice.js` (add async thunk + pending/fulfilled/rejected handlers)
      
      Verify: Manual dispatch + check Redux state includes new image; no console errors

- [ ] 9. **Update AddUser.jsx to include profile image section**
      Add circular image preview above form.
      Upload button + file input (accept JPG/JPEG/PNG/WEBP, max 5MB).
      Remove button to clear preview.
      Display default avatar letter if no preview.
      Client-side file validation (type + size).
      On form submit, append image File to FormData.
      Pass image in addUser thunk call.
      
      Files: `admin panel/src/pages/Users/AddUser.jsx` (add image section + state + handlers)
      
      Verify: Manual test—select image, see preview, submit form, confirm user created with image

- [ ] 10. **Update EditUser.jsx to include profile image section**
       Display existing image if present, else default avatar.
       Upload button to replace image.
       Remove button to clear image.
       Preview selected image before save.
       On submit, only upload image if changed (compare preview vs singleUser.image).
       Preserve existing image if no upload selected.
       
       Files: `admin panel/src/pages/Users/EditUser.jsx` (add image section + state + preview logic)
       
       Verify: Load existing user with image, see image displayed, remove it, save—confirm image cleared; upload new—confirm saved

- [ ] 11. **Update Users.jsx to display circular avatars with images**
       Replace letter-only avatar with conditional image display.
       If user.image exists, render `<img src={user.image} />` with object-fit: cover, 36px circular.
       If no image or broken, fallback to letter avatar gradient.
       Add onError handler to fallback on broken URLs.
       Apply to both mobile and desktop tables.
       
       Files: `admin panel/src/pages/Users/Users.jsx` (modify avatar rendering in table + mobile cards)
       
       Verify: Users list shows real images where available, letter fallback where missing

- [ ] 12. **Update UserDetail.jsx to display circular profile image prominently**
        Replace current letter avatar (64px) with conditional image display.
        If user.image, render circular image with 64-80px size, object-fit: cover.
        If no image, fallback to letter avatar gradient.
        Add onError handler for broken URLs.
        
        Files: `admin panel/src/pages/Users/UserDetail.jsx` (modify avatar display)
        
        Verify: View user detail with image—see image; view user without—see letter avatar

- [ ] 13. **Update Topbar.jsx to display logged-in user's profile image (PRIORITY)**
        Replace hardcoded letter avatar with conditional image from Redux auth.user state.
        If auth.user.image exists, render circular image (~40px) with object-fit: cover.
        If no image or broken, fallback to letter avatar.
        Add onError handler for broken image URLs.
        Do NOT introduce polling—image updates via Redux state on login/upload.
        
        Files: `admin panel/src/components/Topbar.jsx` (modify avatar rendering)
        
        Verify: Login—navbar shows user's real image; upload new image in profile—navbar updates immediately (Redux state change); refresh page—image persists from localStorage

- [ ] 14. **Verify multipart/form-data configuration in API service**
        Axios already uses withCredentials: true and default headers for JSON.
        When posting FormData with file, axios auto-detects and sets Content-Type: multipart/form-data.
        No changes needed unless tests reveal issues.
        
        Files: `admin panel/src/services/api.js` (inspect only; no changes if working)
        
        Verify: Manual fetch POST with FormData—confirm backend receives file; no content-type errors in console

- [ ] 15. **Test security: Authorization & validation**
        Verify non-admin user cannot upload another user's image (checkAbility middleware).
        Verify admin can upload any user's image.
        Verify invalid file types (BMP, PDF, EXE, etc.) rejected by backend.
        Verify oversized files (>5MB) rejected by backend.
        Verify path traversal attempts (../../) blocked by unique filename generation.
        Verify password never included in user responses.
        
        Files: No changes; manual testing only
        
        Verify: Manual tests with Postman/curl—confirm authorization and validation rules enforced

- [ ] 16. **Test data persistence & fallbacks**
        Create user with image, refresh page—confirm image loads from localStorage + DB.
        Create user without image, add image later—confirm image appears everywhere.
        Remove image—confirm letter fallback appears everywhere.
        Broken image URL—confirm letter fallback appears.
        Change another user's image—confirm Topbar still shows logged-in user's image.
        
        Files: No changes; manual end-to-end testing
        
        Verify: Execute all scenarios above; screenshot Navbar, Users list, User detail showing correct images/fallbacks

---

## Digest: Files Modified & Verification

### Backend Files

**`Backend/src/models/user.js`** (User Schema)
- **Block to change:** Add field after `isDeleted`:
  ```
  image: {
    type: String,
    default: ""
  }
  ```
- **Test:** Create user without image, confirm it saves with empty string; add image path, confirm it saves

**`Backend/src/controllers/user.controller.js`** (User Controller)
- **Blocks to change:**
  1. Add method `uploadProfileImage(req, res)` — validates file type/size, saves to `/uploads/users/`, returns path
  2. Add method `deleteProfileImage(req, res)` — sets image to "", deletes file
  3. Modify `createUser` — accept image from req.body or Multer file
  4. Modify `updateUser` — handle image field, delete old file if replaced
- **Tests:** POST/DELETE image endpoints, verify files saved/deleted; create/update users with images

**`Backend/src/routes/user.routes.js`** (User Routes)
- **Blocks to change:**
  1. Add `POST /:id/profile-image` with auth, checkAbility, Multer upload, uploadProfileImage handler
  2. Add `DELETE /:id/profile-image` with auth, checkAbility, deleteProfileImage handler
- **Tests:** POST with JPG file—confirm 200, image path returned; DELETE—confirm image cleared

**`Backend/src/controllers/login.js`** (Login Controller)
- **Block to change:** Modify login response to include `image: user.image || ""`
- **Tests:** Login—confirm response has image field

### Frontend Files

**`admin panel/src/redux/slices/userSlice.js`** (Redux - User Slice)
- **Block to change:** Add async thunk `uploadUserImage(id, formData)` that POSTs to `/api/users/:id/profile-image`
- **Tests:** Dispatch thunk, check Redux state includes updated user with image

**`admin panel/src/redux/slices/loginSlice.js`** (Redux - Login Slice)
- **Block to change:** No changes if login response already includes image field; confirm on step 7 verification
- **Tests:** Already tested in backend login test

**`admin panel/src/pages/Users/AddUser.jsx`** (Add User Page)
- **Block to change:**
  1. Add state for `selectedImage` (File or null) + `imagePreview` (URL or null)
  2. Add image section with preview circle, upload button, remove button
  3. Add handlers: `handleImageSelect`, `handleImageRemove`
  4. On submit, append image to FormData before dispatch
- **Tests:** Select image—see preview; remove—clear preview; submit—user created with image

**`admin panel/src/pages/Users/EditUser.jsx`** (Edit User Page)
- **Block to change:**
  1. Add state for `selectedImage` (File or null), `imagePreview` (URL or null), `hasImageChanged` (bool)
  2. Add image section with current image display, upload button, remove button
  3. Add handlers: `handleImageSelect`, `handleImageRemove`
  4. Initialize imagePreview from `singleUser.image` on mount
  5. On submit, only upload image if `hasImageChanged`
- **Tests:** Load user with image—see it; change image—confirm old deleted, new saved; remove—confirm cleared

**`admin panel/src/pages/Users/Users.jsx`** (Users List Page)
- **Block to change:**
  1. Replace avatar rendering in desktop table (td with avatar div)
  2. Replace avatar rendering in mobile cards (companies-mobile-avatar div)
  3. Add conditional: if `u.image`, render `<img src={u.image} />` with onError fallback; else render letter
  4. Add styles: width: 36px, height: 36px, borderRadius: 18px (circular), objectFit: 'cover'
- **Tests:** Users list shows real images where present, letter fallback where missing

**`admin panel/src/pages/Users/UserDetail.jsx`** (User Detail Page)
- **Block to change:** Replace avatar div (64px) with conditional image rendering
- **Tests:** Detail page shows user's image if present, fallback if missing

**`admin panel/src/components/Topbar.jsx`** (Topbar - HIGHEST PRIORITY)
- **Block to change:** Replace `.topbar-avatar` div rendering
- **Original:** `<div className="topbar-avatar">{displayName.charAt(0).toUpperCase()}</div>`
- **New:** Conditional—if `user.image`, render `<img src={user.image} />` with onError fallback; else render letter
- **Styles:** width: 40px, height: 40px, borderRadius: 20px (circular), objectFit: 'cover'
- **Tests:** Login—navbar shows image; upload new image—navbar updates immediately; refresh—image persists

**`admin panel/src/services/api.js`** (API Service)
- **Block to change:** None if axios auto-detects FormData; verify on step 14
- **Tests:** Manual FormData POST—file received by backend

---

## Security Checks

1. ✅ File type validation: Backend checks MIME type + extension
2. ✅ File size validation: Max 5MB enforced
3. ✅ Unique filenames: Timestamp + random prevents collisions & path traversal
4. ✅ Authorization: checkAbility middleware ensures only own image or admin
5. ✅ No password hashes: Already excluded via `.select("-password")`
6. ✅ Auth required: All image endpoints use `auth` middleware
7. ✅ Error handling: Graceful fallback to letter avatar on broken URLs (frontend)

---

## Deployment Notes

- Upload directory `/uploads` must exist and be writable on deployment server
- `/uploads` served as static files—ensure web server allows access
- Max file size in body parser: 50MB (sufficient for images)
- CORS already configured for frontend origins
- No database migrations needed—image field defaults to empty string

