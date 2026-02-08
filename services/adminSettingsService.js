const AdminSettings = require('../models/AdminSettings');

class AdminSettingsService {
  // Get all admin settings
  static async getAllSettings() {
    try {
      let settings = await AdminSettings.findOne();
      
      if (!settings) {
        // Create default settings if none exist
        settings = new AdminSettings();
        await settings.save();
      }
      
      return {
        success: true,
        data: settings
      };
    } catch (error) {
      console.error('Error fetching admin settings:', error);
      return {
        success: false,
        message: 'Failed to fetch admin settings',
        error: error.message
      };
    }
  }

  // Get specific category of settings
  static async getSettingsByCategory(category) {
    try {
      let settings = await AdminSettings.findOne();
      
      if (!settings) {
        settings = new AdminSettings();
        await settings.save();
      }
      
      const categoryData = settings[category] || {};
      
      return {
        success: true,
        data: categoryData
      };
    } catch (error) {
      console.error(`Error fetching ${category} settings:`, error);
      return {
        success: false,
        message: `Failed to fetch ${category} settings`,
        error: error.message
      };
    }
  }

  // Update general settings
  static async updateGeneralSettings(updateData, userId) {
    try {
      let settings = await AdminSettings.findOne();
      if (!settings) {
        settings = new AdminSettings();
      }
      
      // Update only provided fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          settings.general[key] = updateData[key];
        }
      });
      
      settings.lastUpdated = new Date();
      settings.updatedBy = userId;
      
      await settings.save();
      
      return {
        success: true,
        message: 'General settings updated successfully',
        data: settings.general
      };
    } catch (error) {
      console.error('Error updating general settings:', error);
      return {
        success: false,
        message: 'Failed to update general settings',
        error: error.message
      };
    }
  }

  // Update payment settings
  static async updatePaymentSettings(updateData, userId) {
    try {
      let settings = await AdminSettings.findOne();
      if (!settings) {
        settings = new AdminSettings();
      }
      
      // Update basic payment settings
      ['commissionRate', 'minWithdrawalAmount', 'paymentGateway', 'autoPayoutEnabled'].forEach(field => {
        if (updateData[field] !== undefined) {
          settings.payment[field] = updateData[field];
        }
      });
      
      // Update gateway configuration
      if (updateData.gatewayConfig) {
        Object.keys(updateData.gatewayConfig).forEach(gateway => {
          if (settings.payment.gatewayConfig[gateway]) {
            Object.assign(settings.payment.gatewayConfig[gateway], updateData.gatewayConfig[gateway]);
          }
        });
      }
      
      settings.lastUpdated = new Date();
      settings.updatedBy = userId;
      
      await settings.save();
      
      return {
        success: true,
        message: 'Payment settings updated successfully',
        data: settings.payment
      };
    } catch (error) {
      console.error('Error updating payment settings:', error);
      return {
        success: false,
        message: 'Failed to update payment settings',
        error: error.message
      };
    }
  }

  // Update notification settings
  static async updateNotificationSettings(updateData, userId) {
    try {
      let settings = await AdminSettings.findOne();
      if (!settings) {
        settings = new AdminSettings();
      }
      
      // Update only provided fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          settings.notification[key] = updateData[key];
        }
      });
      
      settings.lastUpdated = new Date();
      settings.updatedBy = userId;
      
      await settings.save();
      
      return {
        success: true,
        message: 'Notification settings updated successfully',
        data: settings.notification
      };
    } catch (error) {
      console.error('Error updating notification settings:', error);
      return {
        success: false,
        message: 'Failed to update notification settings',
        error: error.message
      };
    }
  }

  // Update security settings
  static async updateSecuritySettings(updateData, userId) {
    try {
      let settings = await AdminSettings.findOne();
      if (!settings) {
        settings = new AdminSettings();
      }
      
      // Update only provided fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          settings.security[key] = updateData[key];
        }
      });
      
      settings.lastUpdated = new Date();
      settings.updatedBy = userId;
      
      await settings.save();
      
      return {
        success: true,
        message: 'Security settings updated successfully',
        data: settings.security
      };
    } catch (error) {
      console.error('Error updating security settings:', error);
      return {
        success: false,
        message: 'Failed to update security settings',
        error: error.message
      };
    }
  }

  // Update system settings
  static async updateSystemSettings(updateData, userId) {
    try {
      let settings = await AdminSettings.findOne();
      if (!settings) {
        settings = new AdminSettings();
      }
      
      // Update system settings
      if (updateData.socialLinks) {
        Object.assign(settings.system.socialLinks, updateData.socialLinks);
      }
      if (updateData.legalInfo) {
        Object.assign(settings.system.legalInfo, updateData.legalInfo);
      }
      if (updateData.apiSettings) {
        Object.assign(settings.system.apiSettings, updateData.apiSettings);
      }
      if (updateData.backupSettings) {
        Object.assign(settings.system.backupSettings, updateData.backupSettings);
      }
      
      settings.lastUpdated = new Date();
      settings.updatedBy = userId;
      
      await settings.save();
      
      return {
        success: true,
        message: 'System settings updated successfully',
        data: settings.system
      };
    } catch (error) {
      console.error('Error updating system settings:', error);
      return {
        success: false,
        message: 'Failed to update system settings',
        error: error.message
      };
    }
  }

  // Update site logo
  static async updateSiteLogo(logoUrl, userId) {
    try {
      let settings = await AdminSettings.findOne();
      if (!settings) {
        settings = new AdminSettings();
      }
      
      settings.general.siteLogo = logoUrl;
      settings.lastUpdated = new Date();
      settings.updatedBy = userId;
      
      await settings.save();
      
      return {
        success: true,
        message: 'Site logo updated successfully',
        data: { siteLogo: logoUrl }
      };
    } catch (error) {
      console.error('Error updating site logo:', error);
      return {
        success: false,
        message: 'Failed to update site logo',
        error: error.message
      };
    }
  }

  // Generate API key
  static async generateApiKey(userId) {
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
      settings.updatedBy = userId;
      
      await settings.save();
      
      return {
        success: true,
        message: 'API key generated successfully',
        data: { apiKey: newApiKey }
      };
    } catch (error) {
      console.error('Error generating API key:', error);
      return {
        success: false,
        message: 'Failed to generate API key',
        error: error.message
      };
    }
  }

  // Reset settings to defaults
  static async resetSettings(category = null) {
    try {
      // Delete existing settings
      await AdminSettings.deleteMany({});
      
      // Create new default settings
      const defaultSettings = new AdminSettings();
      await defaultSettings.save();
      
      return {
        success: true,
        message: `${category || 'All'} settings reset to defaults successfully`,
        data: defaultSettings
      };
    } catch (error) {
      console.error('Error resetting settings:', error);
      return {
        success: false,
        message: 'Failed to reset settings',
        error: error.message
      };
    }
  }

  // Export settings (excluding sensitive data)
  static async exportSettings() {
    try {
      const settings = await AdminSettings.findOne();
      
      if (!settings) {
        return {
          success: false,
          message: 'No settings found to export'
        };
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
        exportedAt: new Date().toISOString()
      };
      
      return {
        success: true,
        message: 'Settings exported successfully',
        data: exportData
      };
    } catch (error) {
      console.error('Error exporting settings:', error);
      return {
        success: false,
        message: 'Failed to export settings',
        error: error.message
      };
    }
  }

  // Validate settings before saving
  static validateSettings(category, data) {
    const errors = [];
    
    switch (category) {
      case 'general':
        if (data.siteName && data.siteName.length < 2) {
          errors.push('Site name must be at least 2 characters long');
        }
        if (data.siteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.siteEmail)) {
          errors.push('Please enter a valid email address');
        }
        if (data.customerCareNumber && !/^[\d\s\-\+\(\)]+$/.test(data.customerCareNumber.replace(/\s/g, ''))) {
          errors.push('Please enter a valid phone number');
        }
        break;
        
      case 'payment':
        if (data.commissionRate !== undefined && (data.commissionRate < 0 || data.commissionRate > 100)) {
          errors.push('Commission rate must be between 0 and 100');
        }
        if (data.minWithdrawalAmount !== undefined && data.minWithdrawalAmount < 0) {
          errors.push('Minimum withdrawal amount must be positive');
        }
        break;
        
      case 'security':
        if (data.sessionTimeout !== undefined && data.sessionTimeout < 5) {
          errors.push('Session timeout must be at least 5 minutes');
        }
        if (data.maxLoginAttempts !== undefined && data.maxLoginAttempts < 3) {
          errors.push('Max login attempts must be at least 3');
        }
        if (data.passwordMinLength !== undefined && data.passwordMinLength < 6) {
          errors.push('Password minimum length must be at least 6 characters');
        }
        break;
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = AdminSettingsService;
