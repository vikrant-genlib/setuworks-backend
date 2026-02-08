const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Transaction details
  type: {
    type: String,
    enum: ['recharge', 'withdraw', 'payment', 'refund', 'earning'],
    required: true
  },
  
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  
  // Description/reference
  description: {
    type: String,
    trim: true
  },
  
  // Related entities (for payments/earnings)
  relatedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  
  // Payment method details
  paymentMethod: {
    type: String,
    enum: ['wallet', 'cash', 'upi', 'bank_transfer', 'card'],
    default: 'wallet'
  },
  
  // Payment gateway reference (if applicable)
  paymentReference: {
    type: String,
    trim: true
  },
  
  // Wallet balance before and after transaction
  balanceBefore: {
    type: Number,
    required: true
  },
  
  balanceAfter: {
    type: Number,
    required: true
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

// Index for efficient queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });

// Static method to create transaction
transactionSchema.statics.createTransaction = async function(transactionData) {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(transactionData.userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Calculate balance before
    const balanceBefore = user.wallet || 0;
    
    // Calculate balance after based on transaction type
    let balanceAfter = balanceBefore;
    
    switch (transactionData.type) {
      case 'recharge':
      case 'earning':
      case 'refund':
        balanceAfter = balanceBefore + transactionData.amount;
        break;
      case 'withdraw':
      case 'payment':
        balanceAfter = balanceBefore - transactionData.amount;
        if (balanceAfter < 0) {
          throw new Error('Insufficient wallet balance');
        }
        break;
      default:
        throw new Error('Invalid transaction type');
    }
    
    // Create transaction with balance info
    const transaction = new this({
      ...transactionData,
      balanceBefore,
      balanceAfter
    });
    
    // Update user wallet balance
    user.wallet = balanceAfter;
    await user.save();
    
    // Save transaction
    await transaction.save();
    
    return transaction;
  } catch (error) {
    console.error('Create transaction error:', error);
    throw error;
  }
};

// Static method to get user transactions
transactionSchema.statics.getUserTransactions = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 50,
    type,
    status,
    startDate,
    endDate
  } = options;
  
  const query = { userId };
  
  if (type) query.type = type;
  if (status) query.status = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const skip = (page - 1) * limit;
  
  const transactions = await this.find(query)
    .populate('relatedUserId', 'name phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await this.countDocuments(query);
  
  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static method to get wallet summary
transactionSchema.statics.getWalletSummary = async function(userId) {
  const summary = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  const result = {
    totalRecharged: 0,
    totalWithdrawn: 0,
    totalPaid: 0,
    totalEarned: 0,
    totalRefunded: 0
  };
  
  summary.forEach(item => {
    switch (item._id) {
      case 'recharge':
        result.totalRecharged = item.totalAmount;
        break;
      case 'withdraw':
        result.totalWithdrawn = item.totalAmount;
        break;
      case 'payment':
        result.totalPaid = item.totalAmount;
        break;
      case 'earning':
        result.totalEarned = item.totalAmount;
        break;
      case 'refund':
        result.totalRefunded = item.totalAmount;
        break;
    }
  });
  
  return result;
};

module.exports = mongoose.model('Transaction', transactionSchema);
