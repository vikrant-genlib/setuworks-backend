const express = require('express');
const Job = require('../models/Job');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/jobs
// @desc    Create a new job
// @access  Private, Customer
router.post('/', protect, authorize('customer'), async (req, res) => {
  try {
    const {
      title,
      description,
      serviceType,
      customerAddress,
      estimatedPrice,
      scheduledDate
    } = req.body;

    // Validate required fields
    if (!title || !description || !serviceType || !customerAddress || !estimatedPrice || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    const job = new Job({
      title,
      description,
      serviceType,
      customer: req.user.id,
      customerAddress,
      estimatedPrice,
      scheduledDate: new Date(scheduledDate)
    });

    await job.save();

    // Populate customer info
    await job.populate('customer', 'name phone email');

    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: { job }
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during job creation'
    });
  }
});

// @route   GET /api/jobs
// @desc    Get all jobs (with filters)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { status, serviceType, customer, worker } = req.query;
    let query = {};

    // Build query based on user role and filters
    if (req.user.role === 'customer') {
      query.customer = req.user.id;
    } else if (req.user.role === 'worker' || req.user.role === 'independent_worker') {
      query.$or = [
        { worker: req.user.id },
        { independentWorker: req.user.id },
        { status: 'pending' }
      ];
    } else if (req.user.role === 'contractor') {
      query.$or = [
        { contractor: req.user.id },
        { status: 'pending' }
      ];
    }

    // Apply filters
    if (status) query.status = status;
    if (serviceType) query.serviceType = serviceType;
    if (customer) query.customer = customer;
    if (worker) query.worker = worker;

    const jobs = await Job.find(query)
      .populate('customer', 'name phone email')
      .populate('contractor', 'name phone')
      .populate('worker', 'name phone')
      .populate('independentWorker', 'name phone')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { jobs }
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/jobs/:id
// @desc    Get single job by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('customer', 'name phone email address')
      .populate('contractor', 'name phone shopName servicesOffered')
      .populate('worker', 'name phone skillType')
      .populate('independentWorker', 'name phone skillType');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user has access to this job
    const hasAccess = 
      job.customer._id.toString() === req.user.id ||
      job.contractor?._id?.toString() === req.user.id ||
      job.worker?._id?.toString() === req.user.id ||
      job.independentWorker?._id?.toString() === req.user.id ||
      req.user.role === 'admin';

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: { job }
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/jobs/:id/assign
// @desc    Assign job to worker/contractor
// @access  Private, Contractor/Worker/Admin
router.put('/:id/assign', protect, authorize('contractor', 'worker', 'independent_worker', 'admin'), async (req, res) => {
  try {
    const { assignedTo, assignedType } = req.body; // assignedTo: user ID, assignedType: 'contractor', 'worker', 'independent_worker'

    if (!assignedTo || !assignedType) {
      return res.status(400).json({
        success: false,
        message: 'Please provide assignedTo and assignedType'
      });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Job can only be assigned when status is pending'
      });
    }

    // Verify the assigned user exists and has correct role
    const assignedUser = await User.findById(assignedTo);
    if (!assignedUser) {
      return res.status(404).json({
        success: false,
        message: 'Assigned user not found'
      });
    }

    if (assignedUser.role !== assignedType && 
        !(assignedType === 'independent_worker' && assignedUser.role === 'independent_worker')) {
      return res.status(400).json({
        success: false,
        message: 'User role does not match assignment type'
      });
    }

    // Assign job
    if (assignedType === 'contractor') {
      job.contractor = assignedTo;
    } else if (assignedType === 'worker') {
      job.worker = assignedTo;
    } else if (assignedType === 'independent_worker') {
      job.independentWorker = assignedTo;
    }

    job.status = 'assigned';
    await job.save();

    // Populate assigned user info
    await job.populate(assignedType, 'name phone');

    res.json({
      success: true,
      message: 'Job assigned successfully',
      data: { job }
    });
  } catch (error) {
    console.error('Assign job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during job assignment'
    });
  }
});

// @route   PUT /api/jobs/:id/status
// @desc    Update job status
// @access  Private
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['pending', 'assigned', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user has permission to update status
    const canUpdate = 
      job.customer.toString() === req.user.id ||
      job.contractor?.toString() === req.user.id ||
      job.worker?.toString() === req.user.id ||
      job.independentWorker?.toString() === req.user.id ||
      req.user.role === 'admin';

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Validate status transitions
    if (job.status === 'completed' && status !== 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Completed job can only be cancelled'
      });
    }

    if (job.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cancelled job cannot be updated'
      });
    }

    job.status = status;
    
    if (status === 'completed') {
      job.completedDate = new Date();
    }

    await job.save();

    res.json({
      success: true,
      message: `Job status updated to ${status}`,
      data: { job }
    });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during status update'
    });
  }
});

// @route   PUT /api/jobs/:id/complete
// @desc    Complete job with final price and rating
// @access  Private, Customer
router.put('/:id/complete', protect, authorize('customer'), async (req, res) => {
  try {
    const { finalPrice, rating, review } = req.body;

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.customer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (job.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Job must be in progress to be completed'
      });
    }

    if (finalPrice && finalPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Final price must be greater than 0'
      });
    }

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    job.status = 'completed';
    job.completedDate = new Date();
    job.finalPrice = finalPrice || job.estimatedPrice;
    job.rating = rating;
    job.review = review;
    job.paymentStatus = 'pending';

    await job.save();

    res.json({
      success: true,
      message: 'Job completed successfully',
      data: { job }
    });
  } catch (error) {
    console.error('Complete job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during job completion'
    });
  }
});

module.exports = router;
