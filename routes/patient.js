// Patient
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

router.get('/dashboard', allowRoles('patient'), (req, res, next) => {
    res.render('patient/dashboard', {
        user: req.user,
        userRole: req.user.role
    });
});

module.exports = router;
