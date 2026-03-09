// utils/imageUtils.js
export const verifyImageUrl = async (url) => {
  if (!url) return false;
  
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.log("Image verification failed:", url, error.message);
    return false;
  }
};

export const getValidImageUrl = async (url, fallback = null) => {
  const isValid = await verifyImageUrl(url);
  return isValid ? url : fallback;
};