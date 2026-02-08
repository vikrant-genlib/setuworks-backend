const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Rating = require('../models/Rating');
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

// Add middleware to log all requests to workers routes (MUST be first)
router.use((req, res, next) => {
  next();
});

// Test endpoint to verify routes are loading
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Workers routes are working!'
  });
});

// Test database connection endpoint
router.get('/test-db', async (req, res) => {
  try {
    // Test database connection
    const dbState = mongoose.connection.readyState;
    
    // Test basic query
    const userCount = await User.countDocuments();
    const contractorCount = await User.countDocuments({ role: 'contractor' });
    const workerCount = await User.countDocuments({ role: { $in: ['worker', 'independent_worker'] } });
    
    res.json({
      success: true,
      message: 'Database connection test successful',
      stats: {
        connectionState: dbState,
        totalUsers: userCount,
        contractors: contractorCount,
        workers: workerCount
      }
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message
    });
  }
});

// @route   GET /api/workers/contractor-details/:contractorId
// @desc    Get contractor details for a worker
// @access  Private (Worker only)
router.get('/contractor-details/:contractorId', protect, async (req, res) => {
  try {
    const { contractorId } = req.params;
    console.log(`=== CONTRACTOR DETAILS ENDPOINT CALLED ===`);
    console.log(`Contractor ID: ${contractorId}`);
    console.log(`Requesting user: ${req.user.id} (${req.user.role})`);
    console.log(`Request headers:`, req.headers.authorization ? 'Present' : 'Missing');

    // Validate contractorId format
    if (!mongoose.Types.ObjectId.isValid(contractorId)) {
      console.log(`Invalid contractor ID format: ${contractorId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid contractor ID format'
      });
    }

    // Verify the requesting user is a worker or independent_worker
    if (!['worker', 'independent_worker'].includes(req.user.role)) {
      console.log(`Access denied for user role: ${req.user.role}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only workers can view contractor details.'
      });
    }

    // Verify that the worker is actually assigned to this contractor
    if (req.user.contractor && req.user.contractor.toString() !== contractorId) {
      console.log(`Worker ${req.user.id} is not assigned to contractor ${contractorId}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your assigned contractor.'
      });
    }

    const contractor = await User.findById(contractorId)
      .select('name email phone shopName address profilePicture role status contractorId servicesOffered');

    console.log(`Database query result for contractor ${contractorId}:`, contractor ? 'Found' : 'Not found');

    if (!contractor) {
      console.log(`Contractor not found with ID: ${contractorId}`);
      return res.status(404).json({
        success: false,
        message: 'Contractor not found. The contractor reference may be invalid.'
      });
    }

    // Verify found user is actually a contractor
    if (contractor.role !== 'contractor') {
      console.log(`User ${contractorId} is not a contractor, role is: ${contractor.role}`);
      return res.status(400).json({
        success: false,
        message: 'Referenced user is not a contractor'
      });
    }

    console.log(`Successfully found contractor: ${contractor.name} (${contractor.role})`);

    res.json({
      success: true,
      data: { contractor }
    });
  } catch (error) {
    console.error('Get contractor details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching contractor details'
    });
  }
});

// @route   GET /api/workers/contractor/:contractorId
// @desc    Get all workers for a specific contractor
// @access  Private (Contractor only)
router.get('/contractor/:contractorId', protect, async (req, res) => {
  try {
    const { contractorId } = req.params;
    
    // Validate contractor ID format first
    if (!mongoose.Types.ObjectId.isValid(contractorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contractor ID format'
      });
    }
    
    // Verify that requesting user is contractor or admin
    if (req.user.role !== 'admin' && req.user._id.toString() !== contractorId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own workers.'
      });
    }

    // Find workers for this contractor
    const workers = await User.find({ 
      contractor: contractorId,
      role: { $in: ['worker', 'independent_worker'] }
    })
    .select('-password -averageRating -totalRatings')
    .sort({ createdAt: -1 })
    .lean();

    res.json({
      success: true,
      data: { workers }
    });
  } catch (error) {
    console.error('Get contractor workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching workers'
    });
  }
});

// @route   PUT /api/workers/:workerId/status
// @desc    Update worker status (approve/reject)
// @access  Private (Contractor only)
router.put('/:workerId/status', protect, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['pending', 'approved', 'blocked'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const worker = await User.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Verify that the worker belongs to the requesting contractor
    if (req.user.role !== 'admin' && worker.contractor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own workers.'
      });
    }

    // Only allow contractors to update status from pending to approved/blocked
    if (req.user.role === 'contractor' && worker.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Contractors can only update pending worker applications'
      });
    }

    const previousStatus = worker.status;
    worker.status = status;
    worker.updatedAt = Date.now();

    // Generate worker ID if approving and worker doesn't have one
    if (status === 'approved' && previousStatus === 'pending' && !worker.workerId) {
      try {
        const uniqueId = await worker.generateUniqueId();
        console.log(`Generated worker ID: ${uniqueId}`);
      } catch (error) {
        console.error('Error generating worker ID:', error);
        return res.status(500).json({
          success: false,
          message: 'Error generating worker ID'
        });
      }
    }

    await worker.save();

    res.json({
      success: true,
      message: `Worker status updated to ${status}`,
      data: {
        worker: {
          id: worker._id,
          name: worker.name,
          phone: worker.phone,
          email: worker.email,
          role: worker.role,
          status: worker.status,
          workerId: worker.workerId,
          contractor: worker.contractor,
          skillType: worker.skillType,
          createdAt: worker.createdAt,
          updatedAt: worker.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Update worker status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating worker status'
    });
  }
});

// @route   PUT /api/workers/:workerId/assign-work
// @desc    Assign work to a worker
// @access  Private (Contractor only)
router.put('/:workerId/assign-work', protect, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { location, workType, startDate, endDate, description, status } = req.body;

    // Validate required fields
    if (!location || !workType || !startDate) {
      return res.status(400).json({
        success: false,
        message: 'Location, work type, and start date are required'
      });
    }

    const worker = await User.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Verify that the worker belongs to the requesting contractor
    if (req.user.role !== 'admin' && worker.contractor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only assign work to your own workers.'
      });
    }

    // Verify worker is approved
    if (worker.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Can only assign work to approved workers'
      });
    }

    // Update worker with work assignment
    worker.currentWork = {
      location,
      workType,
      startDate,
      endDate: endDate || null,
      description: description || '',
      status: status || 'assigned',
      assignedAt: new Date(),
      assignedBy: req.user._id
    };

    worker.updatedAt = Date.now();
    await worker.save();

    res.json({
      success: true,
      message: 'Work assigned successfully',
      data: {
        worker: {
          id: worker._id,
          name: worker.name,
          phone: worker.phone,
          email: worker.email,
          role: worker.role,
          status: worker.status,
          workerId: worker.workerId,
          skillType: worker.skillType,
          currentWork: worker.currentWork,
          updatedAt: worker.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Assign work error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while assigning work'
    });
  }
});

// @route   GET /api/workers/:workerId/work-history
// @desc    Get work history for a specific worker
// @access  Private (Contractor only)
router.get('/:workerId/work-history', protect, async (req, res) => {
  try {
    const { workerId } = req.params;

    const worker = await User.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Verify that the worker belongs to the requesting contractor
    if (req.user.role !== 'admin' && worker.contractor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own workers.'
      });
    }

    // For now, return current work. In the future, this could be expanded to include completed work history
    const workHistory = worker.currentWork ? [worker.currentWork] : [];

    res.json({
      success: true,
      data: { workHistory }
    });
  } catch (error) {
    console.error('Get work history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching work history'
    });
  }
});

// @route   PUT /api/workers/:workerId/update-work-status
// @desc    Update work status (in_progress, completed)
// @access  Private (Contractor only)
router.put('/:workerId/update-work-status', protect, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['assigned', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid work status'
      });
    }

    const worker = await User.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Verify that the worker belongs to the requesting contractor
    if (req.user.role !== 'admin' && worker.contractor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own workers.'
      });
    }

    // Check if worker has current work
    if (!worker.currentWork) {
      return res.status(400).json({
        success: false,
        message: 'No active work found for this worker'
      });
    }

    // Update work status
    worker.currentWork.status = status;
    
    // Add completion timestamp if work is completed
    if (status === 'completed') {
      worker.currentWork.completedAt = new Date();
    }

    worker.updatedAt = Date.now();
    await worker.save();

    res.json({
      success: true,
      message: `Work status updated to ${status}`,
      data: {
        worker: {
          id: worker._id,
          name: worker.name,
          currentWork: worker.currentWork,
          updatedAt: worker.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Update work status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating work status'
    });
  }
});

// @route   PUT /api/workers/:workerId/bank-verification
// @desc    Verify or reject worker's bank details (contractor only)
// @access  Private (Contractor only)
router.put('/:workerId/bank-verification', protect, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { status, rejectionReason } = req.body;

    console.log('=== WORKER BANK VERIFICATION ROUTE HIT ===');
    console.log('Worker ID:', workerId);
    console.log('Request body:', req.body);
    console.log('Authenticated user:', req.user);

    // Validate status
    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status'
      });
    }

    // If rejecting, require rejection reason
    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when rejecting bank details'
      });
    }

    const worker = await User.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Verify that the worker belongs to the requesting contractor
    if (req.user.role !== 'admin' && worker.contractor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only verify bank details of your own workers.'
      });
    }

    // Check if worker has bank details
    if (!worker.bankDetails || !worker.bankDetails.accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Worker has not provided bank details'
      });
    }

    // Update bank verification status
    if (!worker.bankDetails) {
      worker.bankDetails = {};
    }

    const previousStatus = worker.bankDetails.verificationStatus || 'pending';
    worker.bankDetails.verificationStatus = status;
    
    if (status === 'verified') {
      worker.bankDetails.verifiedAt = new Date();
      worker.bankDetails.verifiedBy = req.user._id;
      worker.bankDetails.rejectionReason = undefined; // Clear rejection reason if verifying
    } else if (status === 'rejected') {
      worker.bankDetails.rejectionReason = rejectionReason;
      worker.bankDetails.rejectedAt = new Date();
      worker.bankDetails.rejectedBy = req.user._id;
    }

    worker.updatedAt = Date.now();
    await worker.save();

    console.log(`Worker ${workerId} bank verification updated to ${status} by ${req.user.role} ${req.user._id}`);

    res.json({
      success: true,
      message: `Worker bank verification status updated to ${status}`,
      data: {
        bankDetails: {
          verificationStatus: worker.bankDetails.verificationStatus,
          verifiedAt: worker.bankDetails.verifiedAt,
          rejectionReason: worker.bankDetails.rejectionReason,
          rejectedAt: worker.bankDetails.rejectedAt
        }
      }
    });
  } catch (error) {
    console.error('Worker bank verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating bank verification'
    });
  }
});

// @route   GET /api/workers/dashboard-stats
// @desc    Get dashboard statistics for worker
// @access  Private (Worker only)
router.get('/dashboard-stats', protect, async (req, res) => {
  try {
    console.log('=== WORKER DASHBOARD STATS ENDPOINT CALLED ===');
    console.log('Requesting user:', req.user.id, req.user.role);
    
    const workerId = req.user.id;
    const Booking = require('../models/Booking');
    
    // Get all bookings for this worker
    const allBookings = await Booking.find({ workerId });
    
    // Calculate statistics
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Filter bookings for current month
    const monthlyBookings = allBookings.filter(booking => {
      const bookingDate = new Date(booking.createdAt);
      return booking.status === 'completed' && 
             bookingDate.getMonth() === currentMonth && 
             bookingDate.getFullYear() === currentYear;
    });
    
    const stats = {
      totalJobs: allBookings.length,
      activeJobs: allBookings.filter(booking => ['accepted', 'confirmed', 'assigned', 'in_progress'].includes(booking.status)).length,
      completedJobs: allBookings.filter(booking => booking.status === 'completed').length,
      cancelledJobs: allBookings.filter(booking => booking.status === 'cancelled').length,
      pendingJobs: allBookings.filter(booking => booking.status === 'accepted').length,
      inProgressJobs: allBookings.filter(booking => booking.status === 'in_progress').length,
      monthlyEarnings: monthlyBookings.reduce((total, booking) => total + (booking.budget || 0), 0),
      totalEarnings: allBookings
        .filter(booking => booking.status === 'completed' && booking.budget)
        .reduce((total, booking) => total + (booking.budget || 0), 0),
      performance: allBookings.length > 0 ? 
        Math.round((allBookings.filter(booking => booking.status === 'completed').length / allBookings.length) * 100) : 85
    };
    
    // Get recent jobs (last 5)
    const recentJobs = await Booking.find({ workerId })
      .populate('customerId', 'name phone profilePicture')
      .populate('contractorId', 'name shopName phone')
      .sort({ createdAt: -1 })
      .limit(5);
    
    console.log(`Dashboard stats for worker ${workerId}:`, stats);
    
    res.json({
      success: true,
      stats,
      recentJobs
    });
  } catch (error) {
    console.error('Get worker dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics'
    });
  }
});

// @route   GET /api/workers/jobs
// @desc    Get all jobs assigned to the worker
// @access  Private (Worker only)
router.get('/jobs', protect, async (req, res) => {
  try {
    console.log('=== WORKER JOBS ENDPOINT CALLED ===');
    console.log('Requesting user:', req.user.id, req.user.role);
    
    const { status, page = 1, limit = 20 } = req.query;
    
    // Build query
    const query = { workerId: req.user._id };
    
    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const Booking = require('../models/Booking');
    
    // Get bookings for this worker
    const bookings = await Booking.find(query)
      .populate('customerId', 'name phone email profilePicture')
      .populate('contractorId', 'name shopName phone')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    const total = await Booking.countDocuments(query);
    
    console.log(`Found ${bookings.length} bookings for worker ${req.user._id}`);
    
    res.json({
      success: true,
      jobs: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get worker jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching jobs'
    });
  }
});

// @route   PUT /api/workers/jobs/:jobId/status
// @desc    Update job status (worker only)
// @access  Private (Worker only)
router.put('/jobs/:jobId/status', protect, async (req, res) => {
  try {
    console.log('=== UPDATE JOB STATUS ENDPOINT CALLED ===');
    console.log('Job ID:', req.params.jobId);
    console.log('Requesting user:', req.user.id, req.user.role);
    console.log('Request body:', req.body);
    
    const { status, notes } = req.body;
    const { jobId } = req.params;
    
    // Validate status
    const validStatuses = ['accepted', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value. Valid statuses are: ' + validStatuses.join(', ')
      });
    }
    
    const Booking = require('../models/Booking');
    
    // Find the booking
    const booking = await Booking.findById(jobId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    // Verify this job belongs to the requesting worker
    if (booking.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own jobs.'
      });
    }
    
    // Update booking status and timestamps
    const previousStatus = booking.status;
    booking.status = status;
    booking.notes = notes || booking.notes;
    booking.updatedAt = new Date();
    
    // Set appropriate timestamps based on status
    if (status === 'accepted' && previousStatus !== 'accepted') {
      booking.acceptedAt = new Date();
    } else if (status === 'confirmed' && previousStatus !== 'confirmed') {
      booking.confirmedAt = new Date();
    } else if (status === 'in_progress' && previousStatus !== 'in_progress') {
      booking.startedAt = new Date();
    } else if (status === 'completed' && previousStatus !== 'completed') {
      booking.completedAt = new Date();
    } else if (status === 'cancelled' && previousStatus !== 'cancelled') {
      booking.cancelledAt = new Date();
    }
    
    await booking.save();
    
    console.log(`Job ${jobId} status updated from ${previousStatus} to ${status} by worker ${req.user._id}`);
    
    // Return updated booking with populated data
    const updatedBooking = await Booking.findById(jobId)
      .populate('customerId', 'name phone email profilePicture')
      .populate('contractorId', 'name shopName phone');
    
    res.json({
      success: true,
      message: `Job status updated to ${status}`,
      job: updatedBooking
    });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating job status'
    });
  }
});

// @route   GET /api/workers/work-history
// @desc    Get worker's work history (completed, cancelled, rejected jobs)
// @access  Private (Worker only)
router.get('/work-history', protect, async (req, res) => {
  try {
    console.log('=== FETCHING WORKER WORK HISTORY ===');
    console.log('Worker ID:', req.user.id);
    
    const workerId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    
    // Build query for worker's work history (exclude pending and in_progress)
    const query = { workerId };
    
    // Filter by status if provided, otherwise show completed, cancelled, and rejected jobs
    if (status && status !== 'all') {
      query.status = status;
    } else {
      query.status = { $in: ['completed', 'cancelled', 'rejected'] };
    }
    
    // Get work history with pagination
    const jobs = await Booking.find(query)
      .populate('customerId', 'name phone email profilePicture')
      .populate('contractorId', 'name shopName phone profilePicture')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    const total = await Booking.countDocuments(query);
    
    console.log(`Found ${jobs.length} work history items for worker ${workerId}`);
    
    res.json({
      success: true,
      jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get work history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching work history'
    });
  }
});

// @route   DELETE /api/workers/:workerId
// @desc    Delete a worker (contractor only)
// @access  Private (Contractor only)
router.delete('/:workerId', protect, async (req, res) => {
  try {
    console.log('=== DELETE WORKER ROUTE HIT ===');
    console.log('Worker ID:', req.params.workerId);
    console.log('Requesting user:', req.user.id, req.user.role);

    const { workerId } = req.params;

    // Validate workerId format
    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      console.log(`Invalid worker ID format: ${workerId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid worker ID format'
      });
    }

    const worker = await User.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Verify that the worker belongs to the requesting contractor
    if (req.user.role !== 'admin' && worker.contractor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete your own workers.'
      });
    }

    // Only allow deletion of workers with pending status or those without active work
    if (worker.status === 'approved' && worker.currentWork && worker.currentWork.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete worker with active work assignments. Please complete or cancel their work first.'
      });
    }

    // Delete the worker
    await User.findByIdAndDelete(workerId);

    console.log(`Worker ${workerId} deleted successfully by contractor ${req.user._id}`);

    res.json({
      success: true,
      message: 'Worker deleted successfully'
    });
  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting worker'
    });
  }
});

// @route   GET /api/workers/:id/ratings
// @desc    Get ratings for a specific worker
// @access  Public
router.get('/:id/ratings', async (req, res) => {
  try {
    console.log('=== FETCHING WORKER RATINGS ===');
    console.log('Worker ID:', req.params.id);

    const workerId = req.params.id;
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt'
    } = req.query;

    // Check if worker exists
    const worker = await User.findById(workerId).select('name averageRating totalRatings');
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Get ratings with pagination
    const result = await Rating.getWorkerRatings(workerId, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy
    });

    // Get rating summary
    const summary = await Rating.getWorkerRatingSummary(workerId);

    // Calculate worker stats from ratings data instead of worker document
    const calculatedAverageRating = summary.averageRating || 0;
    const calculatedTotalRatings = summary.totalRatings || 0;

    console.log(`Found ${result.ratings.length} ratings for worker`);
    console.log('Rating summary:', summary);

    res.json({
      success: true,
      worker: {
        id: worker._id,
        name: worker.name,
        averageRating: calculatedAverageRating,
        totalRatings: calculatedTotalRatings
      },
      ratings: result.ratings,
      summary,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Fetch worker ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching worker ratings'
    });
  }
});

module.exports = router;
