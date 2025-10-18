
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

// GET route for listing all unpaid visits
router.get('/payments', allowRoles('staff'), (req, res, next) => {
  const query = `
    SELECT 
      v.id as visit_id,
      v.visit_date,
      v.procedures_list,
      p.id as patient_id,
      p.first_name,
      p.last_name,
      printf('HN%04d', p.id) as clinic_number
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    WHERE v.id NOT IN (SELECT visit_id FROM payments WHERE visit_id IS NOT NULL)
    ORDER BY v.visit_date DESC;
  `;

  db.all(query, [], (err, unpaidVisits) => {
    if (err) {
      console.error(err);
      return next(err);
    }

    const processedVisits = unpaidVisits.map(v => {
        let totalAmount = 0;
        try {
            const procedures = JSON.parse(v.procedures_list || '[]');
            totalAmount = procedures.reduce((sum, p) => sum + (p.price || 1000), 0); // Default price
        } catch(e) { console.error('Error processing procedures for visit:', v.visit_id); }
        
        return {
            ...v,
            total_amount: totalAmount,
        };
    });

    res.render('payments/index', { 
      visits: processedVisits,
      userRole: req.user.role, 
      layout: 'layouts/main' 
    });
  });
});


// GET route for displaying the specific payment form for a visit
router.get('/payment', allowRoles('staff'), (req, res, next) => {
  const { visit_id } = req.query;
  if (!visit_id) {
    return res.status(400).send("Missing Visit ID");
  }

  const query = `
    SELECT 
      v.id as visit_id, v.patient_id, v.procedures_list, 
      p.first_name, p.last_name, 
      printf('HN%04d', p.id) as clinic_number
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    WHERE v.id = ?
  `;

  db.get(query, [visit_id], (err, visit) => {
    if (err) {
      console.error(err);
      return next(err);
    }
    if (!visit) {
      return res.status(404).send("Visit not found");
    }

    let procedures = [];
    let totalAmount = 0;
    try {
        procedures = JSON.parse(visit.procedures_list || '[]');
        totalAmount = procedures.reduce((sum, p) => sum + (p.price || 1000), 0);
    } catch (e) {
        console.error("Error parsing procedures list for visit:", visit_id, e);
    }
    
    res.render('payment', { 
      visit, 
      procedures, 
      totalAmount, 
      today: new Date().toISOString().split('T')[0],
      nonce: res.locals.nonce 
    });
  });
});

// POST route for processing the payment
router.post('/payment', allowRoles('staff'), (req, res, next) => {
  const { visit_id, patient_id, amount, payment_date } = req.body;
  const staff_id = req.user.id; 

  if (!visit_id || !patient_id || !amount || !payment_date) {
      return res.status(400).send("Missing required payment information.");
  }

  const sql = 'INSERT INTO payments (visit_id, staff_id, amount, payment_date) VALUES (?, ?, ?, ?)';
  const params = [visit_id, staff_id, amount, payment_date];

  db.run(sql, params, function(err) {
    if (err) {
      console.error(err);
      return next(err);
    }
    const successMessage = encodeURIComponent("การชำระเงินสำเร็จเรียบร้อย");
    res.redirect(`/patients/${patient_id}/history?success_message=${successMessage}`);
  });
});

module.exports = router;
