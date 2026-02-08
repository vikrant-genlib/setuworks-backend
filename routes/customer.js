const express = require('express');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Rating = require('../models/Rating');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/customer/bookings
// @desc    Get all bookings for a customer with pagination and filtering
// @access  Private (Customer only)
router.get('/bookings', protect, authorize('customer'), async (req, res) => {
  try {
    console.log('=== FETCHING CUSTOMER BOOKINGS ===');
    console.log('Customer ID:', req.user.id);
    console.log('Query params:', req.query);

    const customerId = req.user.id;
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt'
    } = req.query;

    // Use the model's static method
    const result = await Booking.getCustomerBookings(customerId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      sortBy
    });

    console.log(`Found ${result.bookings.length} bookings for customer`);
    console.log(`Total bookings: ${result.pagination.total}, Pages: ${result.pagination.pages}`);

    // Populate additional fields that might be needed
    const populatedBookings = await Booking.populate(result.bookings, [
      { path: 'workerId', select: 'name phone email skillType profilePicture' },
      { path: 'contractorId', select: 'name email phone' }
    ]);

    res.json({
      success: true,
      bookings: populatedBookings,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Fetch customer bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bookings'
    });
  }
});

// @route   GET /api/customer/bookings/:id
// @desc    Get a specific booking by ID
// @access  Private (Customer only)
router.get('/bookings/:id', protect, authorize('customer'), async (req, res) => {
  try {
    console.log('=== FETCHING BOOKING DETAILS ===');
    console.log('Booking ID:', req.params.id);
    console.log('Customer ID:', req.user.id);

    const bookingId = req.params.id;
    const customerId = req.user.id;

    const booking = await Booking.findOne({
      _id: bookingId,
      customerId: customerId
    })
    .populate('workerId', 'name phone email skillType profilePicture')
    .populate('contractorId', 'name phone email')
    .exec();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log('Booking details fetched successfully');

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Fetch booking details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching booking details'
    });
  }
});

// @route   PUT /api/customer/bookings/:id/cancel
// @desc    Cancel a booking
// @access  Private (Customer only)
router.put('/bookings/:id/cancel', protect, authorize('customer'), async (req, res) => {
  try {
    console.log('=== CANCELLING BOOKING ===');
    console.log('Booking ID:', req.params.id);
    console.log('Customer ID:', req.user.id);

    const bookingId = req.params.id;
    const customerId = req.user.id;
    const { cancellationReason } = req.body;

    // Find booking
    const booking = await Booking.findOne({
      _id: bookingId,
      customerId: customerId
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking can be cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a completed booking'
      });
    }

    if (booking.status === 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a booking that is in progress'
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancellationReason = cancellationReason || 'No reason provided';
    await booking.save();

    console.log('Booking cancelled successfully');

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling booking'
    });
  }
});

// @route   GET /api/customer/dashboard-stats
// @desc    Get customer dashboard statistics
// @access  Private (Customer only)
router.get('/dashboard-stats', protect, authorize('customer'), async (req, res) => {
  try {
    console.log('=== FETCHING CUSTOMER DASHBOARD STATS ===');
    console.log('Customer ID:', req.user.id);

    const customerId = req.user.id;

    // Use the model's static method for stats
    const statsResult = await Booking.getBookingStats({ customerId });
    
    // Get detailed counts for this customer
    const [
      totalBookings,
      pendingBookings,
      acceptedBookings,
      confirmedBookings,
      inProgressBookings,
      completedBookings,
      cancelledBookings
    ] = await Promise.all([
      Booking.countDocuments({ customerId }),
      Booking.countDocuments({ customerId, status: 'pending' }),
      Booking.countDocuments({ customerId, status: 'accepted' }),
      Booking.countDocuments({ customerId, status: 'confirmed' }),
      Booking.countDocuments({ customerId, status: 'in_progress' }),
      Booking.countDocuments({ customerId, status: 'completed' }),
      Booking.countDocuments({ customerId, status: 'cancelled' })
    ]);

    // Get recent bookings with full population
    const recentBookings = await Booking.find({ customerId })
      .populate('workerId', 'name skillType profilePicture')
      .populate('contractorId', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('workType status createdAt workerId contractorId budget');

    // Calculate total spent (completed bookings)
    const completedBookingsWithBudget = await Booking.find({
      customerId,
      status: 'completed',
      budget: { $exists: true, $gt: 0 }
    }).select('budget');

    const totalSpent = completedBookingsWithBudget.reduce(
      (total, booking) => total + (booking.budget || 0),
      0
    );

    const stats = {
      totalBookings,
      pendingBookings,
      acceptedBookings,
      confirmedBookings,
      inProgressBookings,
      completedBookings,
      cancelledBookings,
      totalSpent
    };

    console.log('Customer dashboard stats calculated:', stats);

    res.json({
      success: true,
      data: {
        stats,
        recentBookings
      }
    });
  } catch (error) {
    console.error('Customer dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard stats'
    });
  }
});

// @route   GET /api/customer/workers
// @desc    Get available workers for booking
// @access  Private (Customer only)
router.get('/workers', protect, authorize('customer'), async (req, res) => {
  try {
    console.log('=== FETCHING AVAILABLE WORKERS ===');

    const { skillType, location } = req.query;
    const query = { 
      role: { $in: ['worker', 'independent_worker'] },
      isActive: true
    };

    if (skillType) {
      query.skillType = skillType;
    }

    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }

    const workers = await User.find(query)
      .select('name email phone skillType location profilePicture contractor')
      .populate('contractor', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    console.log(`Found ${workers.length} workers`);

    res.json({
      success: true,
      workers
    });
  } catch (error) {
    console.error('Fetch workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching workers'
    });
  }
});

// @route   POST /api/customer/bookings
// @desc    Create a new booking
// @access  Private (Customer only)
router.post('/bookings', protect, authorize('customer'), async (req, res) => {
  try {
    console.log('=== CREATING NEW BOOKING ===');
    console.log('Customer ID:', req.user.id);

    const customerId = req.user.id;
    const bookingData = req.body;

    // Create new booking
    const newBooking = new Booking({
      ...bookingData,
      customerId
    });

    // If worker is specified, check if they exist
    if (bookingData.workerId) {
      const worker = await User.findById(bookingData.workerId);
      if (!worker || !['worker', 'independent_worker'].includes(worker.role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid worker selected'
        });
      }
    }

    await newBooking.save();

    // Populate the booking with worker and contractor details
    const populatedBooking = await Booking.findById(newBooking._id)
      .populate('workerId', 'name phone email skillType')
      .populate('contractorId', 'name');

    console.log('New booking created successfully');

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking: populatedBooking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating booking'
    });
  }
});

// @route   PUT /api/customer/bookings/:id
// @desc    Update booking details
// @access  Private (Customer only)
router.put('/bookings/:id', protect, authorize('customer'), async (req, res) => {
  try {
    console.log('=== UPDATING BOOKING ===');
    console.log('Booking ID:', req.params.id);
    console.log('Customer ID:', req.user.id);

    const bookingId = req.params.id;
    const customerId = req.user.id;
    const updateData = req.body;

    // Find booking
    const booking = await Booking.findOne({
      _id: bookingId,
      customerId: customerId
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking can be updated
    if (['completed', 'cancelled', 'in_progress'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update a booking that is completed, cancelled, or in progress'
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'workType', 'location', 'description', 'startDate', 'endDate',
      'preferredTime', 'urgency', 'budget', 'paymentMethod',
      'contactPhone', 'contactEmail', 'notes'
    ];

    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        booking[field] = updateData[field];
      }
    });

    booking.updatedAt = new Date();
    await booking.save();

    // Populate updated booking
    const updatedBooking = await Booking.findById(booking._id)
      .populate('workerId', 'name phone email skillType')
      .populate('contractorId', 'name');

    console.log('Booking updated successfully');

    res.json({
      success: true,
      message: 'Booking updated successfully',
      booking: updatedBooking
    });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating booking'
    });
  }
});

// @route   POST /api/customer/ratings
// @desc    Submit a rating for a completed booking
// @access  Private (Customer only)
router.post('/ratings', protect, authorize('customer'), async (req, res) => {
  try {
    console.log('=== SUBMITTING RATING ===');
    console.log('Customer ID:', req.user.id);
    console.log('Rating data:', req.body);

    const { bookingId, workerId, rating, review } = req.body;

    // Validate required fields
    if (!bookingId || !workerId || !rating || !review) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: bookingId, workerId, rating, review'
      });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Validate review length
    if (review.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Review must be at least 10 characters long'
      });
    }

    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify booking belongs to the customer
    if (booking.customerId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only rate your own bookings'
      });
    }

    // Verify booking is completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'You can only rate completed bookings'
      });
    }

    // Check if rating already exists for this booking
    const existingRating = await Rating.hasCustomerRatedBooking(bookingId, req.user.id);
    if (existingRating) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this booking'
      });
    }

    // Create the rating
    const newRating = new Rating({
      bookingId,
      customerId: req.user.id,
      workerId,
      rating: parseInt(rating),
      review: review.trim()
    });

    await newRating.save();

    console.log('Rating submitted successfully');

    res.status(201).json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        ratingId: newRating._id,
        rating: newRating.rating,
        review: newRating.review,
        createdAt: newRating.createdAt
      }
    });
  } catch (error) {
    console.error('Submit rating error:', error);
    
    // Handle duplicate key error (unique constraint on bookingId)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this booking'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while submitting rating'
    });
  }
});

module.exports = router;
