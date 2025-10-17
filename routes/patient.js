const express = require('express');
const router = express.Router();

// Middleware to check if the user is a patient
const isPatient = (req, res, next) => {
    // This is a placeholder for actual authentication logic
    // In a real app, you'd verify a JWT or session
    // For now, we'll assume if they reach this, they are a patient
    // You should replace this with proper authentication
    next();
};

router.get('/patient-dashboard', isPatient, (req, res) => {
    res.render('patient-dashboard', { title: 'หน้าของฉัน', user: req.user }); // Assuming user info is available
});

module.exports = router;
