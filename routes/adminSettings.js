const express = require('express');
const router = express.Router();
const AdminSettings = require('../models/AdminSettings');
const { protect } = require('../middleware/auth');
const multer = require('multer');

// Optional Cloudinary configuration
let cloudinary = null;
try {
  cloudinary = require('cloudinary').v2;
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }
} catch (error) {
  console.warn('Cloudinary not available, using local file storage');
}

// Configure Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'), false);
    }
  }
});

// Get all admin settings
router.get('/', protect, async (req, res) => {
  try {
    let settings = await AdminSettings.findOne();
    
    if (!settings) {
      // Create default settings if none exist
      settings = new AdminSettings();
      await settings.save();
    }
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin settings',
      error: error.message
    });
  }
});

// Get specific category of settings
router.get('/:category', protect, async (req, res) => {
  try {
    const { category } = req.params;
    let settings = await AdminSettings.findOne();
    
    if (!settings) {
      settings = new AdminSettings();
      await settings.save();
    }
    
    const categoryData = settings[category] || {};
    
    res.json({
      success: true,
      data: categoryData
    });
  } catch (error) {
    console.error(`Error fetching ${category} settings:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to fetch ${category} settings`,
      error: error.message
    });
  }
});

// Update general settings
router.put('/general', protect, async (req, res) => {
  try {
    const { siteName, siteEmail, customerCareNumber, customerCareEmail, developerName, developerContact, maintenanceMode, allowRegistration, requireEmailVerification, timezone, dateFormat, currency, language, siteLogo } = req.body;
    
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = new AdminSettings();
    }
    
    // Update general settings
    if (siteName !== undefined) settings.general.siteName = siteName;
    if (siteEmail !== undefined) settings.general.siteEmail = siteEmail;
    if (customerCareNumber !== undefined) settings.general.customerCareNumber = customerCareNumber;
    if (customerCareEmail !== undefined) settings.general.customerCareEmail = customerCareEmail;
    if (developerName !== undefined) settings.general.developerName = developerName;
    if (developerContact !== undefined) settings.general.developerContact = developerContact;
    if (maintenanceMode !== undefined) settings.general.maintenanceMode = maintenanceMode;
    if (allowRegistration !== undefined) settings.general.allowRegistration = allowRegistration;
    if (requireEmailVerification !== undefined) settings.general.requireEmailVerification = requireEmailVerification;
    if (timezone !== undefined) settings.general.timezone = timezone;
    if (dateFormat !== undefined) settings.general.dateFormat = dateFormat;
    if (currency !== undefined) settings.general.currency = currency;
    if (language !== undefined) settings.general.language = language;
    if (siteLogo !== undefined) settings.general.siteLogo = siteLogo;
    
    settings.lastUpdated = new Date();
    settings.updatedBy = req.user.id;
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'General settings updated successfully',
      data: settings.general
    });
  } catch (error) {
    console.error('Error updating general settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update general settings',
      error: error.message
    });
  }
});

// Update payment settings
router.put('/payment', protect, async (req, res) => {
  try {
    const { commissionRate, minWithdrawalAmount, paymentGateway, autoPayoutEnabled, gatewayConfig } = req.body;
    
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = new AdminSettings();
    }
    
    // Update payment settings
    if (commissionRate !== undefined) settings.payment.commissionRate = commissionRate;
    if (minWithdrawalAmount !== undefined) settings.payment.minWithdrawalAmount = minWithdrawalAmount;
    if (paymentGateway !== undefined) settings.payment.paymentGateway = paymentGateway;
    if (autoPayoutEnabled !== undefined) settings.payment.autoPayoutEnabled = autoPayoutEnabled;
    
    // Update gateway configuration
    if (gatewayConfig) {
      if (gatewayConfig.stripe) {
        Object.assign(settings.payment.gatewayConfig.stripe, gatewayConfig.stripe);
      }
      if (gatewayConfig.paypal) {
        Object.assign(settings.payment.gatewayConfig.paypal, gatewayConfig.paypal);
      }
      if (gatewayConfig.razorpay) {
        Object.assign(settings.payment.gatewayConfig.razorpay, gatewayConfig.razorpay);
      }
    }
    
    settings.lastUpdated = new Date();
    settings.updatedBy = req.user.id;
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'Payment settings updated successfully',
      data: settings.payment
    });
  } catch (error) {
    console.error('Error updating payment settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment settings',
      error: error.message
    });
  }
});

// Update notification settings
router.put('/notification', protect, async (req, res) => {
  try {
    const { emailNotifications, smsNotifications, pushNotifications, bookingReminders, paymentAlerts } = req.body;
    
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = new AdminSettings();
    }
    
    // Update notification settings
    if (emailNotifications !== undefined) settings.notification.emailNotifications = emailNotifications;
    if (smsNotifications !== undefined) settings.notification.smsNotifications = smsNotifications;
    if (pushNotifications !== undefined) settings.notification.pushNotifications = pushNotifications;
    if (bookingReminders !== undefined) settings.notification.bookingReminders = bookingReminders;
    if (paymentAlerts !== undefined) settings.notification.paymentAlerts = paymentAlerts;
    
    settings.lastUpdated = new Date();
    settings.updatedBy = req.user.id;
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: settings.notification
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification settings',
      error: error.message
    });
  }
});

// Update security settings
router.put('/security', protect, async (req, res) => {
  try {
    const { sessionTimeout, maxLoginAttempts, passwordMinLength, twoFactorAuth, ipWhitelist } = req.body;
    
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = new AdminSettings();
    }
    
    // Update security settings
    if (sessionTimeout !== undefined) settings.security.sessionTimeout = sessionTimeout;
    if (maxLoginAttempts !== undefined) settings.security.maxLoginAttempts = maxLoginAttempts;
    if (passwordMinLength !== undefined) settings.security.passwordMinLength = passwordMinLength;
    if (twoFactorAuth !== undefined) settings.security.twoFactorAuth = twoFactorAuth;
    if (ipWhitelist !== undefined) settings.security.ipWhitelist = ipWhitelist;
    
    settings.lastUpdated = new Date();
    settings.updatedBy = req.user.id;
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'Security settings updated successfully',
      data: settings.security
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update security settings',
      error: error.message
    });
  }
});

// Update system settings
router.put('/system', protect, async (req, res) => {
  try {
    const { socialLinks, legalInfo, apiSettings, backupSettings } = req.body;
    
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = new AdminSettings();
    }
    
    // Update system settings
    if (socialLinks) {
      Object.assign(settings.system.socialLinks, socialLinks);
    }
    if (legalInfo) {
      Object.assign(settings.system.legalInfo, legalInfo);
    }
    if (apiSettings) {
      Object.assign(settings.system.apiSettings, apiSettings);
    }
    if (backupSettings) {
      Object.assign(settings.system.backupSettings, backupSettings);
    }
    
    settings.lastUpdated = new Date();
    settings.updatedBy = req.user.id;
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'System settings updated successfully',
      data: settings.system
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system settings',
      error: error.message
    });
  }
});

// Upload site logo
router.post('/upload-logo', protect, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    if (!cloudinary) {
      return res.status(500).json({
        success: false,
        message: 'Cloud storage not configured'
      });
    }
    
    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'site-logos',
          public_id: `site-logo-${Date.now()}`
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      ).end(req.file.buffer);
    });
    
    const logoUrl = result.secure_url;
    
    // Update settings with new logo URL
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = new AdminSettings();
    }
    
    settings.general.siteLogo = logoUrl;
    settings.lastUpdated = new Date();
    settings.updatedBy = req.user.id;
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        url: logoUrl,
        publicId: result.public_id,
        storage: 'cloudinary'
      }
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload logo',
      error: error.message
    });
  }
});

// Generate API key
router.post('/generate-api-key', protect, async (req, res) => {
  try {
    const generateApiKey = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = new AdminSettings();
    }
    
    const newApiKey = generateApiKey();
    settings.system.apiSettings.apiKey = newApiKey;
    settings.lastUpdated = new Date();
    settings.updatedBy = req.user.id;
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'API key generated successfully',
      data: { apiKey: newApiKey }
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate API key',
      error: error.message
    });
  }
});

// Reset settings to defaults
router.post('/reset', protect, async (req, res) => {
  try {
    const { category } = req.body;
    
    // Delete existing settings
    await AdminSettings.deleteMany({});
    
    // Create new default settings
    const defaultSettings = new AdminSettings();
    await defaultSettings.save();
    
    res.json({
      success: true,
      message: `${category || 'All'} settings reset to defaults successfully`,
      data: defaultSettings
    });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings',
      error: error.message
    });
  }
});

// Export settings
router.get('/export', protect, async (req, res) => {
  try {
    const settings = await AdminSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'No settings found to export'
      });
    }
    
    // Create export data (excluding sensitive information)
    const exportData = {
      general: {
        siteName: settings.general.siteName,
        siteEmail: settings.general.siteEmail,
        customerCareNumber: settings.general.customerCareNumber,
        customerCareEmail: settings.general.customerCareEmail,
        developerName: settings.general.developerName,
        developerContact: settings.general.developerContact,
        maintenanceMode: settings.general.maintenanceMode,
        allowRegistration: settings.general.allowRegistration,
        requireEmailVerification: settings.general.requireEmailVerification,
        timezone: settings.general.timezone,
        dateFormat: settings.general.dateFormat,
        currency: settings.general.currency,
        language: settings.general.language
      },
      payment: {
        commissionRate: settings.payment.commissionRate,
        minWithdrawalAmount: settings.payment.minWithdrawalAmount,
        paymentGateway: settings.payment.paymentGateway,
        autoPayoutEnabled: settings.payment.autoPayoutEnabled
      },
      notification: settings.notification,
      security: {
        sessionTimeout: settings.security.sessionTimeout,
        maxLoginAttempts: settings.security.maxLoginAttempts,
        passwordMinLength: settings.security.passwordMinLength,
        twoFactorAuth: settings.security.twoFactorAuth
      },
      system: {
        socialLinks: settings.system.socialLinks,
        legalInfo: settings.system.legalInfo,
        apiSettings: {
          enableApi: settings.system.apiSettings.enableApi,
          rateLimit: settings.system.apiSettings.rateLimit,
          corsOrigins: settings.system.apiSettings.corsOrigins
        },
        backupSettings: settings.system.backupSettings
      },
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.id
    };
    
    res.json({
      success: true,
      message: 'Settings exported successfully',
      data: exportData
    });
  } catch (error) {
    console.error('Error exporting settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export settings',
      error: error.message
    });
  }
});

module.exports = router;
