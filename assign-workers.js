const mongoose = require('mongoose');
require('dotenv').config();

async function assignWorkersToContractors() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    const User = require('./models/User');

    // Find all contractors
    const contractors = await User.find({ role: 'contractor' });
    console.log(`Found ${contractors.length} contractors`);

    if (contractors.length === 0) {
      console.log('No contractors found. Please create a contractor first.');
      return;
    }

    // Find all workers without contractors
    const workersWithoutContractor = await User.find({ 
      role: 'worker', 
      contractor: null 
    });

    console.log(`Found ${workersWithoutContractor.length} workers without contractors`);

    if (workersWithoutContractor.length === 0) {
      console.log('All workers already have contractors assigned.');
      return;
    }

    // Assign workers to the first contractor (you can modify this logic)
    const firstContractor = contractors[0];
    console.log(`Assigning workers to contractor: ${firstContractor.name}`);

    // Update all workers without contractors
    const result = await User.updateMany(
      { role: 'worker', contractor: null },
      { $set: { contractor: firstContractor._id } }
    );

    console.log(`Successfully assigned ${result.modifiedCount} workers to ${firstContractor.name}`);

    // Verify the assignment
    const updatedWorkers = await User.find({ 
      role: 'worker', 
      contractor: firstContractor._id 
    }).populate('contractor', 'name');

    console.log('\nVerification - Assigned workers:');
    updatedWorkers.forEach(worker => {
      console.log(`- ${worker.name} -> ${worker.contractor.name}`);
    });

    console.log('\nAssignment completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

assignWorkersToContractors();
