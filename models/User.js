const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Basic info
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    sparse: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  
  // Role and status
  role: {
    type: String,
    enum: ['customer', 'worker', 'independent_worker', 'contractor', 'admin'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'blocked'],
    default: 'pending'
  },
  
  // Unique IDs (generated after approval)
  contractorId: {
    type: String,
    sparse: true
  },
  workerId: {
    type: String,
    sparse: true
  },
  independentWorkerId: {
    type: String,
    sparse: true
  },
  
  // Profile details
  address: {
    type: String,
    trim: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  dob: {
    type: Date
  },
  profilePicture: {
    type: String, // URL to uploaded image
    trim: true
  },
  
  // Worker specific
  skillType: {
    type: String,
    trim: true
  },
  contractor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Contractor specific
  shopName: {
    type: String,
    trim: true
  },
  servicesOffered: [{
    type: String,
    trim: true
  }],
  
  // Independent worker specific
  idProof: {
    type: String, // URL to uploaded document
    trim: true
  },
  
  // Financial
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    bankName: String,
    branchName: String,
    ifsc: String,
    accountType: {
      type: String,
      enum: ['savings', 'current', 'fixed_deposit', 'recurring_deposit'],
      default: 'savings'
    },
    upiId: String,
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    verifiedAt: Date,
    rejectionReason: String
  },
  wallet: {
    type: Number,
    default: 0
  },
  
  // Work assignment for workers
  currentWork: {
    location: String,
    workType: String,
    startDate: Date,
    endDate: Date,
    description: String,
    status: {
      type: String,
      enum: ['assigned', 'in_progress', 'completed', 'cancelled'],
      default: 'assigned'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    completedAt: Date
  },
  
  // Rating fields for workers
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRatings: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Bookings array for storing customer booking history
  bookings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  }],
  
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

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate unique ID based on role
userSchema.methods.generateUniqueId = async function() {
  const User = mongoose.model('User');
  const name = this.name.replace(/\s+/g, '').toUpperCase();
  const phone = this.phone.replace(/\D/g, '').slice(-4);
  
  try {
    let id;
    let sequence = 1;
    
    if (this.role === 'contractor') {
      // Find existing contractor IDs to get next sequence
      const lastContractor = await User.findOne({ role: 'contractor' })
        .sort({ createdAt: -1 })
        .select('contractorId');
      
      if (lastContractor && lastContractor.contractorId) {
        const parts = lastContractor.contractorId.split('-');
        sequence = parseInt(parts[parts.length - 1]) + 1;
      }
      
      id = `CTR-${name}-${phone}-${sequence.toString().padStart(3, '0')}`;
      this.contractorId = id;
      
    } else if (this.role === 'worker') {
      // Find existing worker IDs for this contractor
      const lastWorker = await User.findOne({ 
        role: 'worker',
        contractor: this.contractor 
      })
        .sort({ createdAt: -1 })
        .select('workerId');
      
      if (lastWorker && lastWorker.workerId) {
        const parts = lastWorker.workerId.split('-');
        sequence = parseInt(parts[parts.length - 1]) + 1;
      }
      
      const contractor = await User.findById(this.contractor).select('contractorId');
      id = `WRK-${contractor.contractorId}-${sequence.toString().padStart(3, '0')}`;
      this.workerId = id;
      
    } else if (this.role === 'independent_worker') {
      // Find existing independent worker IDs
      const lastIndependentWorker = await User.findOne({ role: 'independent_worker' })
        .sort({ createdAt: -1 })
        .select('independentWorkerId');
      
      if (lastIndependentWorker && lastIndependentWorker.independentWorkerId) {
        const parts = lastIndependentWorker.independentWorkerId.split('-');
        sequence = parseInt(parts[parts.length - 1]) + 1;
      }
      
      id = `IWRK-${name}-${phone}-${sequence.toString().padStart(3, '0')}`;
      this.independentWorkerId = id;
    }
    
    await this.save();
    return id;
  } catch (error) {
    console.error('Error generating unique ID:', error);
    throw error;
  }
};

module.exports = mongoose.model('User', userSchema);
