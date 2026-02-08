const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload base64 image to Cloudinary
const uploadBase64Image = async (base64String, folder = 'setuworks/profile-pictures') => {
  try {
    const isImage = base64String.startsWith('data:image/');

    const options = {
      folder: folder,
      resource_type: 'auto'
    };

    if (isImage) {
      options.transformation = [
        { width: 500, height: 500, crop: 'limit' },
        { quality: 'auto:good' }
      ];
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(base64String, options);

    return {
      success: true,
      url: result.secure_url,
      public_id: result.public_id
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return {
      success: result.result === 'ok',
      result: result.result
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// List images from Cloudinary
const listImages = async (folder = 'setuworks/profile-pictures') => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: folder,
      max_results: 100
    });

    return {
      success: true,
      images: result.resources.map(resource => ({
        public_id: resource.public_id,
        url: resource.secure_url,
        format: resource.format,
        size: resource.bytes,
        created_at: resource.created_at,
        folder: resource.folder
      }))
    };
  } catch (error) {
    console.error('Cloudinary list error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  cloudinary,
  uploadBase64Image,
  deleteImage,
  listImages
};
