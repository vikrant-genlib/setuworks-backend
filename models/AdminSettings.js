const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
  // General Settings
  general: {
    siteName: {
      type: String,
      default: 'SetuWorks',
      required: true
    },
    siteEmail: {
      type: String,
      default: 'admin@setuworks.com',
      required: true
    },
    siteLogo: {
      type: String,
      default: ''
    },
    customerCareNumber: {
      type: String,
      default: '+1-800-123-4567'
    },
    customerCareEmail: {
      type: String,
      default: 'support@setuworks.com'
    },
    developerName: {
      type: String,
      default: 'SetuWorks Development Team'
    },
    developerContact: {
      type: String,
      default: 'dev@setuworks.com'
    },
    maintenanceMode: {
      type: Boolean,
      default: false
    },
    allowRegistration: {
      type: Boolean,
      default: true
    },
    requireEmailVerification: {
      type: Boolean,
      default: true
    },
    timezone: {
      type: String,
      default: 'UTC',
      enum: ['UTC', 'EST', 'PST', 'IST', 'GMT']
    },
    dateFormat: {
      type: String,
      default: 'MM/DD/YYYY',
      enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'INR', 'JPY']
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'zh', 'ja']
    }
  },

  // Payment Settings
  payment: {
    commissionRate: {
      type: Number,
      default: 10,
      min: 0,
      max: 100
    },
    minWithdrawalAmount: {
      type: Number,
      default: 100,
      min: 0
    },
    paymentGateway: {
      type: String,
      default: 'stripe',
      enum: ['stripe', 'paypal', 'razorpay']
    },
    autoPayoutEnabled: {
      type: Boolean,
      default: false
    },
    gatewayConfig: {
      stripe: {
        publicKey: {
          type: String,
          default: ''
        },
        secretKey: {
          type: String,
          default: ''
        },
        webhookSecret: {
          type: String,
          default: ''
        },
        enabled: {
          type: Boolean,
          default: true
        }
      },
      paypal: {
        clientId: {
          type: String,
          default: ''
        },
        clientSecret: {
          type: String,
          default: ''
        },
        sandbox: {
          type: Boolean,
          default: true
        },
        enabled: {
          type: Boolean,
          default: false
        }
      },
      razorpay: {
        keyId: {
          type: String,
          default: ''
        },
        keySecret: {
          type: String,
          default: ''
        },
        webhookSecret: {
          type: String,
          default: ''
        },
        enabled: {
          type: Boolean,
          default: false
        }
      }
    }
  },

  // Notification Settings
  notification: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    smsNotifications: {
      type: Boolean,
      default: false
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    bookingReminders: {
      type: Boolean,
      default: true
    },
    paymentAlerts: {
      type: Boolean,
      default: true
    }
  },

  // Security Settings
  security: {
    sessionTimeout: {
      type: Number,
      default: 30,
      min: 5
    },
    maxLoginAttempts: {
      type: Number,
      default: 5,
      min: 3
    },
    passwordMinLength: {
      type: Number,
      default: 8,
      min: 6
    },
    twoFactorAuth: {
      type: Boolean,
      default: false
    },
    ipWhitelist: {
      type: String,
      default: ''
    }
  },

  // System Settings
  system: {
    socialLinks: {
      facebook: {
        type: String,
        default: ''
      },
      twitter: {
        type: String,
        default: ''
      },
      instagram: {
        type: String,
        default: ''
      },
      linkedin: {
        type: String,
        default: ''
      },
      youtube: {
        type: String,
        default: ''
      }
    },
    legalInfo: {
      termsOfService: {
        type: String,
        default: ''
      },
      privacyPolicy: {
        type: String,
        default: ''
      },
      refundPolicy: {
        type: String,
        default: ''
      },
      cookiePolicy: {
        type: String,
        default: ''
      }
    },
    apiSettings: {
      enableApi: {
        type: Boolean,
        default: false
      },
      apiKey: {
        type: String,
        default: ''
      },
      rateLimit: {
        type: String,
        default: '1000/hour',
        enum: ['100/hour', '1000/hour', '5000/hour', '10000/hour']
      },
      corsOrigins: {
        type: String,
        default: '*'
      }
    },
    backupSettings: {
      autoBackup: {
        type: Boolean,
        default: true
      },
      backupFrequency: {
        type: String,
        default: 'daily',
        enum: ['hourly', 'daily', 'weekly', 'monthly']
      },
      retentionDays: {
        type: Number,
        default: 30,
        min: 1,
        max: 365
      },
      backupLocation: {
        type: String,
        default: 'cloud',
        enum: ['cloud', 'local', 'both']
      }
    }
  },

  // Metadata
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient queries
adminSettingsSchema.index({ lastUpdated: -1 });

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
