const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Job = require('../models/Job');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/contractor/dashboard-stats
// @desc    Get contractor dashboard statistics and recent activities
// @access  Private (Contractor only)
router.get('/dashboard-stats', protect, authorize('contractor'), async (req, res) => {
  try {
    console.log('=== FETCHING CONTRACTOR DASHBOARD STATS ===');
    console.log('Contractor ID:', req.user.id);

    const contractorId = req.user.id;

    // Get contractor's workers
    const totalWorkers = await User.countDocuments({ 
      contractor: contractorId,
      role: { $in: ['worker', 'independent_worker'] }
    });

    // Get active jobs (accepted bookings)
    const activeJobs = await Booking.countDocuments({
      contractorId: contractorId,
      status: 'accepted'
    });

    // Get pending job requests
    const pendingRequests = await Booking.countDocuments({
      contractorId: contractorId,
      status: 'pending'
    });

    // Calculate monthly earnings (completed jobs this month)
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const completedJobs = await Booking.find({
      contractorId: contractorId,
      status: 'completed',
      completedAt: { $gte: currentMonth }
    });

    const monthlyEarnings = completedJobs.reduce((total, job) => {
      return total + (job.budget || 0);
    }, 0);

    // Get recent activities
    const recentActivities = [];
    
    // Recent worker additions
    const recentWorkers = await User.find({
      contractor: contractorId,
      role: { $in: ['worker', 'independent_worker'] }
    })
    .sort({ createdAt: -1 })
    .limit(3)
    .select('name role createdAt');

    recentWorkers.forEach(worker => {
      recentActivities.push({
        type: 'worker_added',
        description: `New ${worker.role.replace('_', ' ')} "${worker.name}" joined your team`,
        timestamp: worker.createdAt
      });
    });

    // Recent job requests
    const recentBookings = await Booking.find({
      contractorId: contractorId
    })
    .sort({ createdAt: -1 })
    .limit(3)
    .populate('customerId', 'name')
    .select('status workType createdAt');

    recentBookings.forEach(booking => {
      if (booking.status === 'pending') {
        recentActivities.push({
          type: 'job_request',
          description: `New job request for ${booking.workType} from ${booking.customerId?.name || 'Customer'}`,
          timestamp: booking.createdAt
        });
      } else if (booking.status === 'completed') {
        recentActivities.push({
          type: 'job_completed',
          description: `Job "${booking.workType}" completed successfully`,
          timestamp: booking.completedAt || booking.createdAt
        });
      }
    });

    // Sort activities by timestamp (most recent first)
    recentActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const stats = {
      totalWorkers,
      activeJobs,
      pendingRequests,
      monthlyEarnings
    };

    console.log('Dashboard stats calculated:', stats);
    console.log('Recent activities count:', recentActivities.length);

    res.json({
      success: true,
      data: {
        stats,
        recentActivities: recentActivities.slice(0, 5) // Return only 5 most recent
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard stats'
    });
  }
});

// @route   GET /api/jobs/contractor-requests
// @desc    Get all job requests for a contractor
// @access  Private (Contractor only)
router.get('/contractor-requests', protect, authorize('contractor'), async (req, res) => {
  try {
    console.log('=== FETCHING CONTRACTOR JOB REQUESTS ===');
    console.log('Contractor ID:', req.user.id);
    console.log('Contractor Name:', req.user.name);

    const contractorId = req.user.id;

    // First, let's check all bookings in the system
    const allBookings = await Booking.find({});
    console.log(`Total bookings in system: ${allBookings.length}`);
    
    // Check bookings with contractorId
    const bookingsWithContractor = await Booking.find({ contractorId: { $exists: true, $ne: null } });
    console.log(`Bookings with contractorId: ${bookingsWithContractor.length}`);
    
    // Check bookings for this specific contractor
    const contractorBookings = await Booking.find({ contractorId: contractorId });
    console.log(`Bookings for this contractor: ${contractorBookings.length}`);

    // Find all bookings for this contractor
    const jobRequests = await Booking.find({
      contractorId: contractorId
    })
    .populate('customerId', 'name phone email profilePicture')
    .populate('workerId', 'name skillType averageRating totalRatings')
    .sort({ createdAt: -1 });

    console.log(`Found ${jobRequests.length} job requests for contractor`);
    
    if (jobRequests.length > 0) {
      console.log('Job requests details:');
      jobRequests.forEach((req, index) => {
        console.log(`${index + 1}. ${req.workType} - ${req.customerId?.name} - Status: ${req.status}`);
      });
      
      // Count by status
      const statusCounts = {
        all: jobRequests.length,
        pending: jobRequests.filter(req => req.status === 'pending').length,
        accepted: jobRequests.filter(req => req.status === 'accepted').length,
        confirmed: jobRequests.filter(req => req.status === 'confirmed').length,
        rejected: jobRequests.filter(req => req.status === 'rejected').length,
        cancelled: jobRequests.filter(req => req.status === 'cancelled').length
      };
      
      console.log('Status counts from backend:', statusCounts);
      
      // Check if any cancelled jobs exist in the database for this contractor
      const cancelledJobs = await Booking.find({
        contractorId: contractorId,
        status: 'cancelled'
      });
      
      console.log(`Direct cancelled jobs query found: ${cancelledJobs.length} cancelled jobs`);
      if (cancelledJobs.length > 0) {
        cancelledJobs.forEach((job, index) => {
          console.log(`Cancelled job ${index + 1}: ${job.workType} - ${job.customerId?.name} - Status: ${job.status}`);
        });
      }
    }

    res.json({
      success: true,
      data: { jobRequests }
    });
  } catch (error) {
    console.error('Fetch contractor requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching job requests'
    });
  }
});

// @route   PUT /api/jobs/:id/accept
// @desc    Accept a job request
// @access  Private (Contractor only)
router.put('/:id/accept', protect, authorize('contractor'), async (req, res) => {
  try {
    console.log('=== ACCEPTING JOB REQUEST ===');
    console.log('Job ID:', req.params.id);
    console.log('Contractor ID:', req.user.id);

    const jobId = req.params.id;
    const contractorId = req.user.id;
    const { notes } = req.body; // Get notes from request body

    // Find job request
    const job = await Booking.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job request not found'
      });
    }

    // Verify this job belongs to contractor
    if (job.contractorId && job.contractorId.toString() !== contractorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only accept your own job requests'
      });
    }

    // Update job status
    job.status = 'accepted';
    job.acceptedAt = new Date();
    if (notes) {
      job.notes = notes; // Add notes to booking
    }
    await job.save();

    console.log('Job request accepted successfully with notes:', notes);

    res.json({
      success: true,
      message: 'Job request accepted successfully',
      data: { job }
    });
  } catch (error) {
    console.error('Accept job request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while accepting job request'
    });
  }
});

// @route   PUT /api/jobs/:id/reject
// @desc    Reject a job request
// @access  Private (Contractor only)
router.put('/:id/reject', protect, authorize('contractor'), async (req, res) => {
  try {
    console.log('=== REJECTING JOB REQUEST ===');
    console.log('Job ID:', req.params.id);
    console.log('Contractor ID:', req.user.id);

    const jobId = req.params.id;
    const contractorId = req.user.id;
    const { rejectionReason } = req.body;

    // Find the job request
    const job = await Booking.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job request not found'
      });
    }

    // Verify this job belongs to the contractor
    if (job.contractorId && job.contractorId.toString() !== contractorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only reject your own job requests'
      });
    }

    // Update job status
    job.status = 'rejected';
    job.rejectedAt = new Date();
    job.rejectedReason = rejectionReason || 'No reason provided';
    await job.save();

    console.log('Job request rejected successfully');

    res.json({
      success: true,
      message: 'Job request rejected successfully',
      data: { job }
    });
  } catch (error) {
    console.error('Reject job request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting job request'
    });
  }
});

// @route   GET /api/contractor/active-jobs
// @desc    Get all active jobs for the contractor
// @access  Private (Contractor only)
router.get('/active-jobs', protect, authorize('contractor'), async (req, res) => {
  try {
    console.log('=== FETCHING CONTRACTOR ACTIVE JOBS ===');
    console.log('Contractor ID:', req.user.id);
    
    const contractorId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    
    // Build query for contractor's active jobs
    const query = { contractorId };
    
    // Filter by status if provided (exclude pending requests)
    if (status && status !== 'all') {
      query.status = status;
    } else {
      // By default, exclude pending requests, show all other statuses including cancelled
      query.status = { $in: ['accepted', 'confirmed', 'in_progress', 'completed', 'cancelled'] };
    }
    
    // Get active jobs with pagination
    const jobs = await Booking.find(query)
      .populate('customerId', 'name phone email profilePicture')
      .populate('workerId', 'name phone email profilePicture skillType averageRating totalRatings')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    const total = await Booking.countDocuments(query);
    
    console.log(`Found ${jobs.length} active jobs for contractor ${contractorId}`);
    
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
    console.error('Get active jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching active jobs'
    });
  }
});

// @route   DELETE /api/contractor/job-requests/:requestId
// @desc    Delete a job request (contractor only)
// @access  Private (Contractor only)
router.delete('/job-requests/:requestId', protect, authorize('contractor'), async (req, res) => {
  try {
    console.log('=== DELETE CONTRACTOR JOB REQUEST ===');
    console.log('Request ID:', req.params.requestId);
    console.log('Contractor ID:', req.user.id);
    
    const { requestId } = req.params;
    const contractorId = req.user.id;
    
    // Validate requestId format
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      console.log(`Invalid request ID format: ${requestId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID format'
      });
    }
    
    const Booking = require('../models/Booking');
    
    // Find the job request
    const jobRequest = await Booking.findById(requestId);
    
    if (!jobRequest) {
      return res.status(404).json({
        success: false,
        message: 'Job request not found'
      });
    }
    
    // Verify this job request belongs to the contractor
    if (jobRequest.contractorId && jobRequest.contractorId.toString() !== contractorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own job requests'
      });
    }
    
    // Check if job can be deleted (only allow deletion of pending, rejected, or cancelled requests)
    const deletableStatuses = ['pending', 'rejected', 'cancelled'];
    if (!deletableStatuses.includes(jobRequest.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete job request with status: ${jobRequest.status}. Only pending, rejected, or cancelled requests can be deleted.`
      });
    }
    
    // Delete the job request
    await Booking.findByIdAndDelete(requestId);
    
    console.log(`Job request ${requestId} deleted successfully by contractor ${contractorId}`);
    
    res.json({
      success: true,
      message: 'Job request deleted successfully'
    });
  } catch (error) {
    console.error('Delete job request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting job request'
    });
  }
});

module.exports = router;
