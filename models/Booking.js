const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Customer and Worker references
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contractorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  // Basic booking information
  workType: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    default: null
  },
  
  // Contact information
  contactPhone: {
    type: String,
    trim: true
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  
  // Scheduling preferences
  urgency: {
    type: String,
    enum: ['normal', 'urgent', 'emergency'],
    default: 'normal'
  },
  preferredTime: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'flexible'],
    default: 'flexible'
  },
  workerArrival: {
    type: String,
    enum: ['flexible', 'morning', 'afternoon', 'evening', 'night', 'asap'],
    default: 'flexible'
  },
  
  // Payment information
  paymentMethod: {
    type: String,
    enum: ['cash', 'online', 'upi', 'cheque', 'other'],
    default: 'cash'
  },
  budget: {
    type: Number,
    min: 0,
    default: null
  },
  useWallet: {
    type: Boolean,
    default: false
  },
  walletTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'accepted', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'],
    default: 'pending'
  },
  
  // Status timestamps
  acceptedAt: {
    type: Date,
    default: null
  },
  confirmedAt: {
    type: Date,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectedReason: {
    type: String,
    default: null
  },
  
  // Rating tracking
  hasRated: {
    type: Boolean,
    default: false
  },
  ratingSubmittedAt: {
    type: Date,
    default: null
  },
  
  // Notes and additional information
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  
  // System fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
bookingSchema.index({ customerId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ workerId: 1, status: 1 });
bookingSchema.index({ contractorId: 1, status: 1 });
bookingSchema.index({ createdAt: -1 });

// Pre-save validation to ensure contractorId is set for contractor workers
bookingSchema.pre('save', async function() {
  try {
    if (this.isNew && !this.contractorId) {
      const User = mongoose.model('User');
      const worker = await User.findById(this.workerId);
      
      if (worker && worker.contractor) {
        this.contractorId = worker.contractor;
        console.log('Auto-assigned contractorId:', this.contractorId);
      } else if (worker && worker.role === 'worker') {
        // Fallback: assign to first contractor if worker has none
        const contractor = await User.findOne({ role: 'contractor' });
        if (contractor) {
          this.contractorId = contractor._id;
          // Update worker to have this contractor
          await User.findByIdAndUpdate(worker._id, { contractor: contractor._id });
          console.log('Fallback: assigned worker to contractor and set contractorId');
        }
      }
      // Independent workers will have null contractorId (which is correct)
    }
  } catch (error) {
    console.error('Error in pre-save validation:', error);
    throw error;
  }
});

// Static methods for booking operations
bookingSchema.statics.getCustomerBookings = async function(customerId, options = {}) {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt'
    } = options;
    
    const query = { customerId };
    
    if (status) {
      query.status = status;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    const sortOptions = {};
    sortOptions[sortBy] = -1;
    
    const bookings = await this.find(query)
      .populate('workerId', 'name phone email skillType')
      .sort(sortOptions)
      .limit(limit * page)
      .skip((page - 1) * limit)
      .exec();
    
    const total = await this.countDocuments(query);
    
    return {
      bookings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Get customer bookings error:', error);
    throw error;
  }
};

bookingSchema.statics.getWorkerBookings = async function(workerId, options = {}) {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt'
    } = options;
    
    const query = { workerId };
    
    if (status) {
      query.status = status;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    const bookings = await this.find(query)
      .populate('customerId', 'name phone email')
      .sort({ [sortBy]: -1 })
      .limit(limit * page)
      .skip((page - 1) * limit)
      .exec();
    
    const total = await this.countDocuments(query);
    
    return {
      bookings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Get worker bookings error:', error);
    throw error;
  }
};

bookingSchema.statics.getBookingStats = async function(filters = {}) {
  try {
    const matchStage = {};
    
    if (filters.status) {
      matchStage.status = filters.status;
    }
    
    const stats = await this.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: { if: { $eq: ['$status', 'pending'] }, then: 1, else: 0 } } },
          confirmed: { $sum: { $cond: { if: { $eq: ['$status', 'confirmed'] }, then: 1, else: 0 } } },
          in_progress: { $sum: { $cond: { if: { $eq: ['$status', 'in_progress'] }, then: 1, else: 0 } } },
          completed: { $sum: { $cond: { if: { $eq: ['$status', 'completed'] }, then: 1, else: 0 } } },
          cancelled: { $sum: { $cond: { if: { $eq: ['$status', 'cancelled'] }, then: 1, else: 0 } } },
          rejected: { $sum: { $cond: { if: { $eq: ['$status', 'rejected'] }, then: 1, else: 0 } } }
        }
      }
    ]);
    
    return stats;
  } catch (error) {
    console.error('Get booking stats error:', error);
    throw error;
  }
};

module.exports = mongoose.model('Booking', bookingSchema);
