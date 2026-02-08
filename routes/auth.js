const express = require('express');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const { protect, generateToken, authorize } = require('../middleware/auth');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { uploadBase64Image, listImages } = require('../utils/cloudinary');
const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    console.log('Received registration data:', req.body);
    
    const {
      name,
      phone,
      email,
      password,
      role,
      address,
      gender,
      dob,
      skillType,
      shopName,
      servicesOffered,
      profilePicture,
      idProof,
      contractor
    } = req.body;

    console.log('Destructured values:', {
      name,
      phone,
      email,
      password,
      role,
      address,
      gender,
      dob,
      skillType,
      shopName,
      servicesOffered,
      profilePicture: profilePicture ? 'Present' : 'Missing',
      idProof: idProof ? 'Present' : 'Missing'
    });

    // Validate required fields
    if (!name || !phone || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, phone, password, and role'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists'
      });
    }

    // Validate role-specific fields
    if (role === 'worker' && !skillType) {
      return res.status(400).json({
        success: false,
        message: 'Workers must provide skill type'
      });
    }

    if (role === 'independent_worker' && (!skillType || !idProof)) {
      return res.status(400).json({
        success: false,
        message: 'Independent workers must provide skill type and ID proof'
      });
    }

    if (role === 'contractor' && (!shopName || !servicesOffered)) {
      return res.status(400).json({
        success: false,
        message: 'Contractors must provide shop name and services offered'
      });
    }

    // Create user
    const userData = {
      name,
      phone,
      email,
      password,
      role,
      address,
      gender,
      dob,
      skillType,
      shopName,
      servicesOffered: servicesOffered ? servicesOffered.split(',').map(s => s.trim()) : [],
      profilePicture: profilePicture || null,
      idProof: idProof || null
    };

    // Only add contractor field if it's a valid ObjectId
    if (contractor && mongoose.Types.ObjectId.isValid(contractor)) {
      userData.contractor = contractor;
    }

    // Upload profile picture to Cloudinary if provided
    if (profilePicture && profilePicture.startsWith('data:image/')) {
      console.log('Uploading profile picture to Cloudinary...');
      const uploadResult = await uploadBase64Image(profilePicture, 'setuworks/profile-pictures');
      
      if (uploadResult.success) {
        userData.profilePicture = uploadResult.url;
        console.log('Profile picture uploaded successfully:', uploadResult.url);
      } else {
        console.error('Failed to upload profile picture:', uploadResult.error);
        // Continue without profile picture if upload fails
        userData.profilePicture = null;
      }
    } else {
      userData.profilePicture = profilePicture || null;
    }

    // Upload ID proof to Cloudinary if provided
    if (idProof && idProof.startsWith('data:image/')) {
      console.log('Uploading ID proof to Cloudinary...');
      const uploadResult = await uploadBase64Image(idProof, 'setuworks/id-proofs');
      
      if (uploadResult.success) {
        userData.idProof = uploadResult.url;
        console.log('ID proof uploaded successfully:', uploadResult.url);
      } else {
        console.error('Failed to upload ID proof:', uploadResult.error);
        // Continue without ID proof if upload fails
        userData.idProof = null;
      }
    } else {
      userData.idProof = idProof || null;
    }

    // Hash password before creating user
    const salt = bcrypt.genSaltSync(10);
    userData.password = bcrypt.hashSync(userData.password, salt);

    // Set status based on role
    if (role === 'customer') {
      userData.status = 'approved'; // Auto-approve customers
    } else {
      userData.status = 'pending'; // Others need admin approval
    }

    const user = new User(userData);
    await user.save();

    // Generate token for customers (they can login immediately)
    let token = null;
    if (role === 'customer') {
      token = generateToken(user._id);
    }

    res.status(201).json({
      success: true,
      message: role === 'customer' 
        ? 'Registration successful! You can now login.' 
        : 'Registration successful! Please wait for admin approval.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          status: user.status,
          profilePicture: user.profilePicture,
          contractor: user.contractor
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error details:', error);
    console.error('Error stack:', error.stack);
    
    // Handle specific validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + errors.join(', ')
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/auth/contractors
// @desc    Get all approved contractors for dropdown
// @access  Public
router.get('/contractors', async (req, res) => {
  try {
    const contractors = await User.find({ 
      role: 'contractor', 
      status: 'approved' 
    })
    .select('name shopName contractorId')
    .sort({ name: 1 });
    
    res.json({
      success: true,
      data: { contractors }
    });
  } catch (error) {
    console.error('Get contractors error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});


// @route   GET /api/auth/status/:phone
// @desc    Get user status by phone number
// @access  Public
router.get('/status/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const user = await User.findOne({ phone }).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this phone number'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          status: user.status,
          shopName: user.shopName,
          contractorId: user.contractorId,
          workerId: user.workerId,
          independentWorkerId: user.independentWorkerId,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    console.log('Login request received:');
    console.log('Phone:', phone);
    console.log('Password length:', password ? password.length : 'undefined');
    console.log('Password (first 3 chars):', password ? password.substring(0, 3) + '***' : 'undefined');

    // Validate input
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide phone and password'
      });
    }

    // Find user by phone
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is approved
    if (user.status !== 'approved') {
      return res.status(401).json({
        success: false,
        message: 'Account not approved. Please contact admin.'
      });
    }

    let isMatch = false;
    
    // Special handling for admin user with plain text password
    if (user.role === 'admin') {
      console.log('Admin login detected - checking password format');
      console.log('Stored password format:', user.password.startsWith('$2b$') ? 'Hashed' : 'Plain text');
      
      if (!user.password.startsWith('$2b$')) {
        // Admin password is plain text - compare directly
        console.log('Input password:', JSON.stringify(password));
        console.log('Stored password:', JSON.stringify(user.password));
        console.log('Input password length:', password.length);
        console.log('Stored password length:', user.password.length);
        isMatch = (user.password === password);
        console.log('Plain text password comparison:', isMatch);
      } else {
        // Admin password is hashed - use bcrypt compare
        isMatch = await user.comparePassword(password);
        console.log('Hashed password comparison:', isMatch);
      }
    } else {
      // Non-admin users - use normal bcrypt comparison
      isMatch = await user.comparePassword(password);
    }
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          status: user.status,
          profilePicture: user.profilePicture,
          address: user.address,
          gender: user.gender,
          skillType: user.skillType,
          shopName: user.shopName,
          servicesOffered: user.servicesOffered,
          contractor: user.contractor,
          workerId: user.workerId,
          contractorId: user.contractorId
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   GET /api/auth/workers
// @desc    Get all approved workers for customers to browse
// @access  Public
router.get('/workers', async (req, res) => {
  try {
    console.log('=== FETCHING WORKERS FOR BROWSING ===');
    
    const workers = await User.find({ 
      role: { $in: ['worker', 'independent_worker'] },
      status: 'approved'
    })
    .select('-password')
    .populate('contractor', 'name shopName address profilePicture phone email servicesOffered contractorId')
    .sort({ createdAt: -1 });

    console.log(`Found ${workers.length} approved workers`);

    res.json({
      success: true,
      data: { workers }
    });
  } catch (error) {
    console.error('Fetch workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching workers'
    });
  }
});

// @route   POST /api/auth/bookings
// @desc    Create a new booking request
// @access  Private (Customer only)
router.post('/bookings', protect, async (req, res) => {
  try {
    console.log('=== CREATING BOOKING REQUEST ===');
    console.log('Request body:', req.body);
    console.log('Requesting user:', req.user);

    const { 
      workerId, customerId, workType, location, description, startDate, endDate, 
      contactPhone, contactEmail, urgency, paymentMethod, preferredTime, workerArrival,
      useWallet, budget
    } = req.body;

    // Validate required fields
    if (!workerId || !customerId || !workType || !location || !startDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Validate wallet payment only if budget is provided
    if (useWallet && (!budget || parseFloat(budget) <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Budget is required when using wallet payment'
      });
    }

    // Validate wallet balance only if using wallet and budget is provided
    if (useWallet && budget && parseFloat(budget) > 0) {
      const customer = await User.findById(req.user.id).select('wallet');
      const currentBalance = customer.wallet || 0;
      
      if (parseFloat(budget) > currentBalance) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance for this payment'
        });
      }
    }

    // Verify that the requesting user is a customer
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can create booking requests'
      });
    }

    // Verify that the customerId matches the authenticated user
    if (customerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only create bookings for yourself'
      });
    }

    // Check if worker exists and is approved
    let worker;
    try {
      worker = await User.findById(workerId);
    } catch (error) {
      console.error('Worker lookup error:', error);
      // Try to handle if workerId is a string
      if (error.name === 'CastError') {
        // If it's a cast error, the workerId might be a string
        // Try to convert it to ObjectId
        try {
          const mongoose = require('mongoose');
          worker = await User.findById(mongoose.Types.ObjectId(workerId));
        } catch (castError) {
          console.error('ObjectId cast error:', castError);
          return res.status(400).json({
            success: false,
            message: 'Invalid worker ID format'
          });
        }
      }
    }
    
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    if (worker.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Worker is not available for booking'
      });
    }

    // Handle wallet payment
    let walletTransaction = null;
    if (useWallet && budget && parseFloat(budget) > 0) {
      try {
        // Create wallet transaction for booking payment
        walletTransaction = await Transaction.createTransaction({
          userId: req.user.id,
          type: 'payment',
          amount: parseFloat(budget),
          description: `Advance payment for ${worker.name} - ${workType}`,
          relatedUserId: workerId,
          paymentMethod: 'wallet',
          status: 'completed'
        });
        console.log('Wallet transaction created:', walletTransaction);
      } catch (walletError) {
        console.error('Wallet payment error:', walletError);
        return res.status(400).json({
          success: false,
          message: walletError.message || 'Wallet payment failed'
        });
      }
    }

    // Create booking record
    console.log('=== CREATING BOOKING ===');
    console.log('Worker ID:', workerId);
    console.log('Worker data:', {
      name: worker.name,
      role: worker.role,
      contractor: worker.contractor ? worker.contractor._id : null
    });
    
    const booking = new Booking({
      workerId,
      customerId,
      // Only set contractorId if worker has one (for contractor workers)
      // Independent workers will have null contractorId
      contractorId: worker.contractor ? worker.contractor._id : null,
      workType,
      location,
      description: description || '',
      startDate,
      endDate: endDate || null,
      contactPhone: contactPhone || '',
      contactEmail: contactEmail || '',
      urgency: urgency || 'normal',
      paymentMethod: paymentMethod || 'cash',
      preferredTime: preferredTime || '',
      workerArrival: workerArrival || 'flexible',
      budget: budget ? parseFloat(budget) : null,
      useWallet: useWallet || false,
      walletTransactionId: walletTransaction?._id || null,
      status: 'pending',
      createdAt: new Date()
    });

    // Save booking to database
    const savedBooking = await booking.save();
    console.log('Booking created and saved:', savedBooking);

    // Update user with new booking
    await User.findByIdAndUpdate(req.user.id, {
      $push: { bookings: savedBooking._id }
    }, { new: true });

    // For now, return success with booking data
    // In a real implementation, you'd return the populated booking
    res.json({
      success: true,
      message: useWallet 
        ? 'Booking request sent successfully! Advance payment processed from wallet.'
        : 'Booking request sent successfully!',
      data: { 
        booking: savedBooking,
        walletTransaction: walletTransaction ? {
          id: walletTransaction._id,
          amount: walletTransaction.amount,
          balanceAfter: walletTransaction.balanceAfter
        } : null
      }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating booking'
    });
  }
});

// @route   GET /api/auth/bookings
// @desc    Get all bookings for the current customer
// @access  Private (Customer only)
router.get('/bookings', protect, async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can view their bookings'
      });
    }

    const result = await Booking.getCustomerBookings(req.user.id);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get customer bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bookings'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    console.log('Profile update request received');
    console.log('Request body:', req.body);
    
    const {
      name,
      email,
      address,
      gender,
      dob,
      skillType,
      shopName,
      servicesOffered,
      profilePicture,
      idProof,
      bankDetails
    } = req.body;

    console.log('Destructured bankDetails:', bankDetails);

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('Found user:', user._id);
    console.log('Current bankDetails:', user.bankDetails);

    // Update allowed fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (address) user.address = address;
    if (gender) user.gender = gender;
    if (dob) user.dob = dob;

    // Handle profile picture upload
    if (profilePicture && profilePicture.startsWith('data:image/')) {
      console.log('New profile picture detected. Uploading to Cloudinary...');
      const uploadResult = await uploadBase64Image(profilePicture, 'setuworks/profile-pictures');
      if (uploadResult.success) {
        user.profilePicture = uploadResult.url;
        console.log('Profile picture updated to:', uploadResult.url);
      } else {
        console.error('Profile picture upload failed:', uploadResult.error);
      }
    } else if (profilePicture === '') {
      // Handle picture removal
      user.profilePicture = null;
    }

    // Handle ID proof upload
    if (idProof && (idProof.startsWith('data:image/') || idProof.startsWith('data:application/pdf'))) {
      console.log('New ID proof detected. Uploading to Cloudinary...');
      const uploadResult = await uploadBase64Image(idProof, 'setuworks/id-proofs');
      if (uploadResult.success) {
        user.idProof = uploadResult.url;
        console.log('ID proof updated to:', uploadResult.url);
      } else {
        console.error('ID proof upload failed:', uploadResult.error);
      }
    }

    // Update bank details if provided
    if (bankDetails) {
      console.log('Updating bank details...');
      
      // Initialize bankDetails object if it doesn't exist
      if (!user.bankDetails) {
        console.log('Initializing bankDetails object');
        user.bankDetails = {};
      }
      
      if (bankDetails.accountHolderName !== undefined) user.bankDetails.accountHolderName = bankDetails.accountHolderName;
      if (bankDetails.accountNumber !== undefined) user.bankDetails.accountNumber = bankDetails.accountNumber;
      if (bankDetails.bankName !== undefined) user.bankDetails.bankName = bankDetails.bankName;
      if (bankDetails.branchName !== undefined) user.bankDetails.branchName = bankDetails.branchName;
      if (bankDetails.ifsc !== undefined) user.bankDetails.ifsc = bankDetails.ifsc;
      if (bankDetails.accountType !== undefined) user.bankDetails.accountType = bankDetails.accountType;
      if (bankDetails.upiId !== undefined) user.bankDetails.upiId = bankDetails.upiId;
      
      // Reset verification status if bank details are updated
      if (bankDetails.accountNumber || bankDetails.ifsc || bankDetails.bankName) {
        user.bankDetails.verificationStatus = 'pending';
        user.bankDetails.verifiedAt = null;
        user.bankDetails.rejectionReason = null;
      }
      
      console.log('Updated bankDetails:', user.bankDetails);
    }

    // Role-specific updates
    if (user.role === 'worker' || user.role === 'independent_worker') {
      if (skillType) user.skillType = skillType;
    }
    
    if (user.role === 'contractor') {
      if (shopName) user.shopName = shopName;
      if (servicesOffered) {
        // Handle both string and array inputs for servicesOffered
        if (typeof servicesOffered === 'string') {
          user.servicesOffered = servicesOffered.split(',').map(s => s.trim());
        } else if (Array.isArray(servicesOffered)) {
          user.servicesOffered = servicesOffered;
        }
      }
    }

    user.updatedAt = Date.now();
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          status: user.status,
          profilePicture: user.profilePicture,
          address: user.address,
          gender: user.gender,
          dob: user.dob,
          skillType: user.skillType,
          shopName: user.shopName,
          servicesOffered: user.servicesOffered,
          idProof: user.idProof,
          bankDetails: user.bankDetails,
          contractorId: user.contractorId,
          workerId: user.workerId,
          independentWorkerId: user.independentWorkerId,
          contractor: user.contractor,
          currentWork: user.currentWork,
          wallet: user.wallet
        }
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during profile update'
    });
  }
});

// @route   PUT /api/auth/password
// @desc    Change password
// @access  Private
router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current password and new password'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    user.updatedAt = Date.now();
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password change'
    });
  }
});

// @route   GET /api/auth/users
// @desc    Get all users (admin only)
// @access  Private, Admin
router.get('/users', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    
    console.log('Backend sending users data:');
    users.forEach((user, index) => {
      console.log(`User ${index + 1}:`, {
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        status: user.status,
        contractorId: user.contractorId,
        workerId: user.workerId,
        independentWorkerId: user.independentWorkerId,
        createdAt: user.createdAt
      });
    });
    
    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/auth/users/:id/status
// @desc    Update user status (admin only)
// @access  Private, Admin
router.put('/users/:id/status', protect, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'approved', 'blocked'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const previousStatus = user.status;
    user.status = status;
    user.updatedAt = Date.now();
    
    // Generate unique ID when approving
    if (status === 'approved' && previousStatus === 'pending') {
      try {
        const uniqueId = await user.generateUniqueId();
        console.log(`Generated unique ID for ${user.role}: ${uniqueId}`);
      } catch (error) {
        console.error('Error generating unique ID:', error);
        return res.status(500).json({
          success: false,
          message: 'Error generating unique ID'
        });
      }
    }

    await user.save();

    res.json({
      success: true,
      message: `User status updated to ${status}${status === 'approved' ? ' and unique ID generated' : ''}`,
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          status: user.status,
          contractorId: user.contractorId,
          workerId: user.workerId,
          independentWorkerId: user.independentWorkerId
        }
      }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during status update'
    });
  }
});

// @route   PUT /api/auth/users/:id/bank-verification
// @desc    Verify or reject user's bank details (admin only)
// @access  Private, Admin
router.put('/users/:id/bank-verification', protect, authorize('admin'), async (req, res) => {
  console.log('=== BANK VERIFICATION ROUTE HIT ===');
  console.log('User ID:', req.params.id);
  console.log('Request body:', req.body);
  console.log('Authenticated user:', req.user);
  
  try {
    const { status, rejectionReason } = req.body;
    
    if (!['verified', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status. Must be verified, rejected, or pending'
      });
    }

    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when rejecting bank details'
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.bankDetails || !user.bankDetails.accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'User has no bank details to verify'
      });
    }

    // Update bank verification status
    user.bankDetails.verificationStatus = status;
    
    if (status === 'verified') {
      user.bankDetails.verifiedAt = new Date();
      user.bankDetails.rejectionReason = null;
    } else if (status === 'rejected') {
      user.bankDetails.rejectionReason = rejectionReason;
      user.bankDetails.verifiedAt = null;
    } else {
      user.bankDetails.verifiedAt = null;
      user.bankDetails.rejectionReason = null;
    }

    user.updatedAt = Date.now();
    await user.save();

    res.json({
      success: true,
      message: `Bank details ${status === 'verified' ? 'verified' : status === 'rejected' ? 'rejected' : 'reset to pending'} successfully`,
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          bankDetails: user.bankDetails
        }
      }
    });
  } catch (error) {
    console.error('Bank verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bank verification'
    });
  }
});

// @route   GET /api/auth/users/bank-pending
// @desc    Get all users with pending bank verification (admin only)
// @access  Private, Admin
router.get('/users/bank-pending', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find({
      'bankDetails.accountNumber': { $exists: true, $ne: null },
      'bankDetails.verificationStatus': 'pending'
    }).select('-password').sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: { 
        users,
        count: users.length
      }
    });
  } catch (error) {
    console.error('Get pending bank verifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/auth/images
// @desc    List all images from Cloudinary
// @access  Private (Admin only)
router.get('/images', protect, authorize('admin'), async (req, res) => {
  try {
    const { folder } = req.query;
    const result = await listImages(folder || 'setuworks/profile-pictures');
    
    if (result.success) {
      res.json({
        success: true,
        data: {
          images: result.images,
          count: result.images.length
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error fetching images from Cloudinary',
        error: result.error
      });
    }
  } catch (error) {
    console.error('List images error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching images'
    });
  }
});

// @route   GET /api/auth/wallet
// @desc    Get customer wallet data
// @access  Private (Customer only)
router.get('/wallet', protect, async (req, res) => {
  try {
    console.log('=== FETCHING WALLET DATA ===');
    console.log('Requesting user:', req.user);

    // Verify that the requesting user is a customer
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can access wallet'
      });
    }

    const user = await User.findById(req.user.id).select('wallet');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get recent transactions
    const transactionData = await Transaction.getUserTransactions(req.user.id, {
      page: 1,
      limit: 20
    });

    res.json({
      success: true,
      data: {
        balance: user.wallet || 0,
        transactions: transactionData.transactions,
        pagination: transactionData.pagination
      }
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching wallet data'
    });
  }
});

// @route   POST /api/auth/wallet/recharge
// @desc    Recharge customer wallet
// @access  Private (Customer only)
router.post('/wallet/recharge', protect, async (req, res) => {
  try {
    console.log('=== WALLET RECHARGE ===');
    console.log('Request body:', req.body);
    console.log('Requesting user:', req.user);

    const { amount, paymentMethod = 'upi', paymentReference } = req.body;

    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid amount'
      });
    }

    if (parseFloat(amount) > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum recharge amount is ₹10,000'
      });
    }

    // Verify that the requesting user is a customer
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can recharge wallet'
      });
    }

    // Create recharge transaction
    const transaction = await Transaction.createTransaction({
      userId: req.user.id,
      type: 'recharge',
      amount: parseFloat(amount),
      description: `Wallet recharge of ₹${amount}`,
      paymentMethod,
      paymentReference,
      status: 'completed'
    });

    // Get updated user data
    const user = await User.findById(req.user.id).select('wallet');

    res.json({
      success: true,
      message: 'Wallet recharged successfully',
      data: {
        balance: user.wallet,
        transaction: {
          id: transaction._id,
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          status: transaction.status,
          createdAt: transaction.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Wallet recharge error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during wallet recharge'
    });
  }
});

// @route   POST /api/auth/wallet/withdraw
// @desc    Withdraw from customer wallet
// @access  Private (Customer only)
router.post('/wallet/withdraw', protect, async (req, res) => {
  try {
    console.log('=== WALLET WITHDRAWAL ===');
    console.log('Request body:', req.body);
    console.log('Requesting user:', req.user);

    const { amount, paymentMethod = 'bank_transfer', paymentReference } = req.body;

    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid amount'
      });
    }

    // Verify that the requesting user is a customer
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can withdraw from wallet'
      });
    }

    // Check current balance
    const user = await User.findById(req.user.id).select('wallet');
    const currentBalance = user.wallet || 0;
    
    if (parseFloat(amount) > currentBalance) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Create withdrawal transaction
    const transaction = await Transaction.createTransaction({
      userId: req.user.id,
      type: 'withdraw',
      amount: parseFloat(amount),
      description: `Wallet withdrawal of ₹${amount}`,
      paymentMethod,
      paymentReference,
      status: 'completed'
    });

    // Get updated user data
    const updatedUser = await User.findById(req.user.id).select('wallet');

    res.json({
      success: true,
      message: 'Withdrawal successful',
      data: {
        balance: updatedUser.wallet,
        transaction: {
          id: transaction._id,
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          status: transaction.status,
          createdAt: transaction.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Wallet withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during wallet withdrawal'
    });
  }
});

// @route   GET /api/auth/wallet/transactions
// @desc    Get customer wallet transactions
// @access  Private (Customer only)
router.get('/wallet/transactions', protect, async (req, res) => {
  try {
    console.log('=== FETCHING WALLET TRANSACTIONS ===');
    console.log('Query params:', req.query);

    // Verify that the requesting user is a customer
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can access wallet transactions'
      });
    }

    const {
      page = 1,
      limit = 20,
      type,
      status,
      startDate,
      endDate
    } = req.query;

    const transactionData = await Transaction.getUserTransactions(req.user.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      status,
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: transactionData
    });
  } catch (error) {
    console.error('Get wallet transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching wallet transactions'
    });
  }
});

// @route   GET /api/auth/wallet/summary
// @desc    Get customer wallet summary
// @access  Private (Customer only)
router.get('/wallet/summary', protect, async (req, res) => {
  try {
    console.log('=== FETCHING WALLET SUMMARY ===');

    // Verify that the requesting user is a customer
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can access wallet summary'
      });
    }

    const user = await User.findById(req.user.id).select('wallet');
    const summary = await Transaction.getWalletSummary(req.user.id);

    res.json({
      success: true,
      data: {
        currentBalance: user.wallet || 0,
        ...summary
      }
    });
  } catch (error) {
    console.error('Get wallet summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching wallet summary'
    });
  }
});

// @route   GET /api/auth/admin-exists
// @desc    Check if any admin user exists in the system
// @access  Public
router.get('/admin-exists', async (req, res) => {
  try {
    console.log('=== CHECKING IF ADMIN EXISTS ===');
    
    // Check if any user with role 'admin' exists
    const adminCount = await User.countDocuments({ role: 'admin' });
    const adminExists = adminCount > 0;
    
    console.log(`Admin count: ${adminCount}, Admin exists: ${adminExists}`);
    
    res.json({
      success: true,
      data: {
        adminExists: adminExists,
        adminCount: adminCount
      }
    });
  } catch (error) {
    console.error('Check admin exists error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking admin existence'
    });
  }
});

// @route   POST /api/auth/setup-admin
// @desc    Setup the first admin user (only if no admin exists)
// @access  Public
router.post('/setup-admin', async (req, res) => {
  try {
    console.log('=== ADMIN SETUP REQUEST ===');
    
    const { name, email, password, phone } = req.body;
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin user already exists'
      });
    }
    
    // Check if user with this email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Create admin user
    const adminUser = new User({
      name,
      email,
      password, // Will be hashed by pre-save hook
      phone,
      role: 'admin',
      status: 'approved'
    });
    
    await adminUser.save();
    
    // Generate token
    const token = generateToken(adminUser._id);
    
    console.log('Admin user created successfully:', {
      id: adminUser._id,
      email: adminUser.email,
      role: adminUser.role
    });
    
    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        user: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          status: adminUser.status
        },
        token
      }
    });
  } catch (error) {
    console.error('Admin setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin setup'
    });
  }
});

// @route   POST /api/auth/recalculate-ratings
// @desc    Manually recalculate all worker ratings (for fixing data)
// @access  Private, Admin
router.post('/recalculate-ratings', protect, authorize('admin'), async (req, res) => {
  try {
    console.log('=== RECALCULATING ALL WORKER RATINGS ===');
    
    const User = require('../models/User');
    const Rating = require('../models/Rating');
    
    // Get all workers
    const workers = await User.find({ 
      role: { $in: ['worker', 'independent_worker'] }
    }).select('_id name');
    
    console.log(`Found ${workers.length} workers to update`);
    
    let updatedCount = 0;
    
    for (const worker of workers) {
      // Calculate ratings for this worker
      const ratingStats = await Rating.aggregate([
        { $match: { workerId: worker._id } },
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
        await User.findByIdAndUpdate(worker._id, {
          averageRating: Math.round(stats.averageRating * 10) / 10,
          totalRatings: stats.totalRatings
        });
        
        console.log(`Updated ${worker.name}: Rating=${stats.averageRating} (${stats.totalRatings} ratings)`);
        updatedCount++;
      } else {
        // Reset to 0 if no ratings
        await User.findByIdAndUpdate(worker._id, {
          averageRating: 0,
          totalRatings: 0
        });
        
        console.log(`Reset ${worker.name}: No ratings found`);
      }
    }
    
    res.json({
      success: true,
      message: `Recalculated ratings for ${updatedCount} workers`
    });
  } catch (error) {
    console.error('Recalculate ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while recalculating ratings'
    });
  }
});

// @route   GET /api/auth/dashboard-stats
// @desc    Get comprehensive dashboard statistics for admin
// @access  Private, Admin
router.get('/dashboard-stats', protect, authorize('admin'), async (req, res) => {
  try {
    console.log('=== FETCHING DASHBOARD STATS ===');
    const { timeRange = '7d' } = req.query;
    
    // Calculate date range based on timeRange
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }
    
    // Get user statistics
    const userStats = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          customers: {
            $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] }
          },
          workers: {
            $sum: { $cond: [{ $eq: ['$role', 'worker'] }, 1, 0] }
          },
          contractors: {
            $sum: { $cond: [{ $eq: ['$role', 'contractor'] }, 1, 0] }
          },
          independentWorkers: {
            $sum: { $cond: [{ $eq: ['$role', 'independent_worker'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Get job statistics
    const Job = require('../models/Job');
    const jobStats = await Job.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          assigned: {
            $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Get booking statistics
    const bookingStats = await Booking.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          confirmed: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
          },
          in_progress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Get transaction statistics
    const transactionStats = await Transaction.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          recharge: {
            $sum: { $cond: [{ $eq: ['$type', 'recharge'] }, '$amount', 0] }
          },
          payments: {
            $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] }
          },
          earnings: {
            $sum: { $cond: [{ $eq: ['$type', 'earning'] }, '$amount', 0] }
          }
        }
      }
    ]);
    
    // Get revenue statistics (commission from completed jobs)
    const revenueStats = await Job.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$commissionAmount' },
          thisMonth: {
            $sum: {
              $cond: [
                {
                  $gte: ['$completedDate', new Date(now.getFullYear(), now.getMonth(), 1)]
                },
                '$commissionAmount',
                0
              ]
            }
          },
          lastMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$completedDate', new Date(now.getFullYear(), now.getMonth() - 1, 1) ] },
                    { $lt: ['$completedDate', new Date(now.getFullYear(), now.getMonth(), 1) ] }
                  ]
                },
                '$commissionAmount',
                0
              ]
            }
          }
        }
      }
    ]);
    
    // Get rating statistics
    const Rating = require('../models/Rating');
    const ratingStats = await Rating.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          total: { $sum: 1 },
          distribution: {
            $push: '$rating'
          }
        }
      }
    ]);
    
    // Format rating distribution
    let ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (ratingStats.length > 0 && ratingStats[0].distribution) {
      ratingStats[0].distribution.forEach(rating => {
        ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
      });
    }
    
    const dashboardData = {
      users: userStats[0] || {
        total: 0,
        customers: 0,
        workers: 0,
        contractors: 0,
        independentWorkers: 0
      },
      jobs: jobStats[0] || {
        total: 0,
        pending: 0,
        assigned: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0
      },
      bookings: bookingStats[0] || {
        total: 0,
        pending: 0,
        confirmed: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        rejected: 0
      },
      transactions: transactionStats[0] || {
        total: 0,
        totalAmount: 0,
        recharge: 0,
        payments: 0,
        earnings: 0
      },
      revenue: revenueStats[0] || {
        total: 0,
        thisMonth: 0,
        lastMonth: 0,
        commission: 0
      },
      ratings: {
        average: ratingStats[0] ? Math.round(ratingStats[0].average * 10) / 10 : 0,
        total: ratingStats[0] ? ratingStats[0].total : 0,
        distribution: ratingDistribution
      }
    };
    
    // Set commission to match total revenue
    dashboardData.revenue.commission = dashboardData.revenue.total;
    
    console.log('Dashboard stats calculated:', dashboardData);
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics'
    });
  }
});

// @route   GET /api/auth/user-stats
// @desc    Get user statistics by role
// @access  Private, Admin
router.get('/user-stats', protect, authorize('admin'), async (req, res) => {
  try {
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const formattedStats = {};
    userStats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });
    
    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user statistics'
    });
  }
});

// @route   GET /api/auth/job-stats
// @desc    Get job statistics by status
// @access  Private, Admin
router.get('/job-stats', protect, authorize('admin'), async (req, res) => {
  try {
    const Job = require('../models/Job');
    const jobStats = await Job.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const formattedStats = {};
    jobStats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });
    
    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Get job stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching job statistics'
    });
  }
});

// @route   GET /api/auth/booking-stats
// @desc    Get booking statistics by status
// @access  Private, Admin
router.get('/booking-stats', protect, authorize('admin'), async (req, res) => {
  try {
    const bookingStats = await Booking.getBookingStats();
    const formattedStats = bookingStats[0] || {};
    
    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Get booking stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching booking statistics'
    });
  }
});

// @route   GET /api/auth/transaction-stats
// @desc    Get transaction statistics by type
// @access  Private, Admin
router.get('/transaction-stats', protect, authorize('admin'), async (req, res) => {
  try {
    const transactionStats = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    const formattedStats = {};
    transactionStats.forEach(stat => {
      formattedStats[stat._id] = {
        count: stat.count,
        totalAmount: stat.totalAmount
      };
    });
    
    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Get transaction stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching transaction statistics'
    });
  }
});

// @route   GET /api/auth/rating-stats
// @desc    Get rating statistics
// @access  Private, Admin
router.get('/rating-stats', protect, authorize('admin'), async (req, res) => {
  try {
    const Rating = require('../models/Rating');
    const ratingStats = await Rating.aggregate([
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          total: { $sum: 1 },
          distribution: {
            $push: '$rating'
          }
        }
      }
    ]);
    
    // Format rating distribution
    let ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (ratingStats.length > 0 && ratingStats[0].distribution) {
      ratingStats[0].distribution.forEach(rating => {
        ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
      });
    }
    
    const formattedStats = {
      average: ratingStats[0] ? Math.round(ratingStats[0].average * 10) / 10 : 0,
      total: ratingStats[0] ? ratingStats[0].total : 0,
      distribution: ratingDistribution
    };
    
    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Get rating stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching rating statistics'
    });
  }
});

module.exports = router;
