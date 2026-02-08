const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  // References
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
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
  
  // Rating details
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
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
ratingSchema.index({ bookingId: 1 }, { unique: true }); // One rating per booking
ratingSchema.index({ workerId: 1, rating: -1 });
ratingSchema.index({ customerId: 1 });
ratingSchema.index({ createdAt: -1 });

// Pre-save middleware to update worker's average rating and booking status
ratingSchema.pre('save', async function() {
  if (this.isNew) {
    try {
      const User = mongoose.model('User');
      const Booking = mongoose.model('Booking');
      const workerId = this.workerId;
      const bookingId = this.bookingId;
      
      // Calculate new average rating for the worker
      const Rating = mongoose.model('Rating');
      const ratingStats = await Rating.aggregate([
        { $match: { workerId: workerId } },
        {
          $group: {
            _id: '$workerId',
            averageRating: { $avg: '$rating' },
            totalRatings: { $sum: 1 }
          }
        }
      ]);
      
      if (ratingStats.length > 0) {
        const stats = ratingStats[0];
        await User.findByIdAndUpdate(workerId, {
          averageRating: Math.round(stats.averageRating * 10) / 10, // Round to 1 decimal place
          totalRatings: stats.totalRatings
        });
        
        console.log(`Updated worker ${workerId} rating: ${stats.averageRating} (${stats.totalRatings} ratings)`);
      }
      
      // Update booking to mark as rated
      await Booking.findByIdAndUpdate(bookingId, {
        hasRated: true,
        ratingSubmittedAt: new Date()
      });
      
      console.log(`Marked booking ${bookingId} as rated`);
    } catch (error) {
      console.error('Error updating worker rating and booking:', error);
    }
  }
});

// Static method to get worker ratings
ratingSchema.statics.getWorkerRatings = async function(workerId, options = {}) {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt'
    } = options;
    
    const { ObjectId } = mongoose.Types;
    const query = { workerId: new ObjectId(workerId) };
    
    const ratings = await this.find(query)
      .populate('customerId', 'name profilePicture')
      .populate('bookingId', 'workType createdAt')
      .sort({ [sortBy]: -1 })
      .limit(limit * page)
      .skip((page - 1) * limit)
      .exec();
    
    const total = await this.countDocuments(query);
    
    return {
      ratings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Get worker ratings error:', error);
    throw error;
  }
};

// Static method to get rating summary for a worker
ratingSchema.statics.getWorkerRatingSummary = async function(workerId) {
  try {
    const { ObjectId } = mongoose.Types;
    const summary = await this.aggregate([
      { $match: { workerId: new ObjectId(workerId) } },
      {
        $group: {
          _id: '$workerId',
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 },
          ratingDistribution: {
            $push: '$rating'
          }
        }
      }
    ]);
    
    if (summary.length === 0) {
      return {
        averageRating: 0,
        totalRatings: 0,
        ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
      };
    }
    
    // Calculate rating counts
    const ratingCounts = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    summary[0].ratingDistribution.forEach(rating => {
      ratingCounts[rating.toString()]++;
    });
    
    return {
      averageRating: Math.round(summary[0].averageRating * 10) / 10,
      totalRatings: summary[0].totalRatings,
      ratingCounts
    };
  } catch (error) {
    console.error('Get worker rating summary error:', error);
    throw error;
  }
};

// Static method to check if customer has already rated a booking
ratingSchema.statics.hasCustomerRatedBooking = async function(bookingId, customerId) {
  try {
    const existingRating = await this.findOne({ bookingId, customerId });
    return !!existingRating;
  } catch (error) {
    console.error('Check booking rating error:', error);
    throw error;
  }
};

module.exports = mongoose.model('Rating', ratingSchema);
