const express = require('express');
const router = express.Router();
const { authenticateToken, allowRoles } = require('../utils/auth');

router.get('/', authenticateToken, allowRoles('dentist'), (req, res) => {
  res.render('dentist/dentist');
});

module.exports = router;
