const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 80;

// โหลด connection pool (MySQL RDS)
const db = require('./db'); // <-- ใช้ mysql2/promise

// --- Setup --- 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middlewares ---

// Nonce for CSP
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'`,
        "https://code.jquery.com",
        "https://cdn.jsdelivr.net",
        "https://stackpath.bootstrapcdn.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "https://stackpath.bootstrapcdn.com",
        "https://cdnjs.cloudflare.com",
        "'unsafe-inline'"
      ],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "http://localhost:3000"],
      connectSrc: ["'self'", "https://stackpath.bootstrapcdn.com", "https://cdn.jsdelivr.net"]
    },
  },
}));
app.use(compression());

// Static assets (must be before authentication)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Core middlewares
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));

// --- Routes ---
const { authenticateToken } = require('./utils/auth');
const authRouter = require('./routes/auth');
const dentRouter = require('./routes/dentist');
const staffRouter = require('./routes/staff');
const pantRouter = require('./routes/patient');

// --- Public & Debug Routes ---

// Root route should always go to login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Terms of Service Page
app.get('/terms', (req, res) => {
  res.render('terms');
});

// Debug route to list all users (for development only)
app.get('/debug-users', async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, citizen_id, role, password FROM users");
    res.json(rows);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Authentication routes (login, register, logout)
app.use('/', authRouter);
app.use('/dentist', authenticateToken, dentRouter);
app.use('/staff', authenticateToken, staffRouter);
app.use('/patient', authenticateToken, pantRouter);

// 404 handler
app.use((req, res) => res.status(404).send('Not Found'));

// Error handler
app.use((err, req, res, next) => { 
  console.error(err.stack); 
  res.status(500).send('Server Error'); 
});

// Helper function for EJS templates
app.locals.getStatusText = function(status) {
  const statusMap = {
    'PENDING': 'รอการยืนยัน',
    'CONFIRMED': 'ยืนยันแล้ว',
    'COMPLETED': 'เสร็จสิ้น',
    'CANCELLED': 'ยกเลิก',
    'NEW': 'ใหม่'
  };
  return statusMap[status] || status;
};

// --- Server Start ---
app.listen(PORT, () => console.log(`✅ Server running: http://localhost:${PORT}`));
