const mongoose = require('mongoose');
const Rating = require('./models/Rating');

mongoose.connect('mongodb://localhost:27017/setuworks', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  try {
    const ratings = await Rating.find({});
    console.log('=== ALL RATINGS IN DATABASE ===');
    ratings.forEach((rating, index) => {
      console.log(`Rating ${index + 1}:`, {
        id: rating._id,
        rating: rating.rating,
        review: rating.review.substring(0, 50) + '...',
        workerId: rating.workerId,
        bookingId: rating.bookingId,
        createdAt: rating.createdAt
      });
    });
    
    console.log('\n=== RATING DISTRIBUTION ===');
    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    ratings.forEach(rating => {
      distribution[rating.rating.toString()]++;
    });
    console.log('Distribution:', distribution);
    
    mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    mongoose.disconnect();
  }
});
