const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const workerRoutes = require('./routes/workers');
const contractorRoutes = require('./routes/contractor');
const customerRoutes = require('./routes/customer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Add logging middleware to see all requests
app.use((req, res, next) => {
  console.log(`=== MAIN APP MIDDLEWARE ===`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.originalUrl}`);
  console.log(`Path: ${req.path}`);
  next();
});

// Basic route (must be before 404 handler)
app.get('/', (req, res) => {
  res.json({ message: 'SetuWorks API is running!' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/contractor', contractorRoutes);
app.use('/api/customer', customerRoutes);

// Database connection
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Add 404 handler to see what's not being caught (must be last)
app.use((req, res, next) => {
  console.log(`=== 404 HANDLER ===`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.originalUrl}`);
  console.log(`Path: ${req.path}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
