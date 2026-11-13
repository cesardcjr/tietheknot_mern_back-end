function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret };
  try {
    const url = new URL(process.env.CLOUDINARY_URL?.trim());
    if (url.protocol === "cloudinary:" && url.hostname && url.username && url.password) {
      return { cloudName: url.hostname, apiKey: decodeURIComponent(url.username), apiSecret: decodeURIComponent(url.password) };
    }
  } catch { /* Invalid or unset connection URL. */ }
  return null;
}

module.exports = cloudinaryConfig;
