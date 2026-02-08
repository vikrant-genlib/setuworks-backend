const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  // Basic job info
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  serviceType: {
    type: String,
    required: true,
    trim: true
  },
  
  // Customer info
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerAddress: {
    type: String,
    required: true
  },
  
  // Service provider info
  contractor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  independentWorker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Job status
  status: {
    type: String,
    enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  
  // Pricing
  estimatedPrice: {
    type: Number,
    required: true
  },
  finalPrice: {
    type: Number
  },
  
  // Payment
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'cash'],
    default: 'cash'
  },
  
  // Commission
  commissionPercentage: {
    type: Number,
    default: 10 // 10% commission
  },
  commissionAmount: {
    type: Number,
    default: 0
  },
  
  // Dates
  scheduledDate: {
    type: Date,
    required: true
  },
  completedDate: {
    type: Date
  },
  
  // Customer feedback
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    trim: true
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

// Update timestamp on save
jobSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate commission if final price is set
  if (this.finalPrice && !this.commissionAmount) {
    this.commissionAmount = (this.finalPrice * this.commissionPercentage) / 100;
  }
  
  next();
});

module.exports = mongoose.model('Job', jobSchema);
