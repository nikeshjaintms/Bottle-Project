/**
 * Constructs the full image URL from the relative path stored in database
 * @param {string} imagePath - Relative path from database (e.g., "uploads/1234567890.jpg" or "/uploads/1234567890.jpg")
 * @returns {string|null} - Full image URL or null if no path
 */
export const getFullImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (typeof imagePath !== 'string') return null;
  
  // If it's already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  // Get backend URL from environment or use default
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
  
  // Construct full URL
  // imagePath can be:
  //   - "uploads/filename.jpg" from database
  //   - "/uploads/filename.jpg" 
  // backendUrl is "http://localhost:5000"
  // Result should be "http://localhost:5000/uploads/filename.jpg"
  
  const baseUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
  
  // Normalize path - always ensure it starts with /
  let path = imagePath;
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  // Remove any double slashes
  path = path.replace(/\/+/g, '/');
  
  // Add cache busting to prevent browser cache issues
  const timestamp = Date.now();
  return `${baseUrl}${path}?t=${timestamp}`;
};

/**
 * Alternative: Get avatar letter from user name
 * @param {string} name - User name
 * @returns {string} - First letter uppercase
 */
export const getAvatarLetter = (name) => {
  if (!name) return 'U';
  return name.charAt(0).toUpperCase();
};

/**
 * Check if image URL is valid and accessible
 * @param {string} url - Image URL to check
 * @returns {Promise<boolean>} - True if image is accessible
 */
export const isImageUrlValid = async (url) => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
};
