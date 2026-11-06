import { V_URL } from '../../Baseurl.js';

/**
 * Constructs the full image URL from the relative path stored in database
 * Uses the same V_URL pattern as variant images
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

  // Use the same pattern as variant images with V_URL from Baseurl.js
  // Normalize path - ensure it starts with /
  let path = imagePath;
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  // Remove any double slashes
  path = path.replace(/\/+/g, '/');
  
  // Return full URL using V_URL (same as variant images)
  return `${V_URL}${path}`;
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
