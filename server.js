
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
const PORT = process.env.PORT || 3000;
const db = require('./db');

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
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, "https://code.jquery.com", "https://cdn.jsdelivr.net", "https://stackpath.bootstrapcdn.com"],
      scriptSrcAttr: ["'unsafe-inline'"], 
      styleSrc: ["'self'", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "http://localhost:3000"], 
      connectSrc: ["'self'", "https://stackpath.bootstrapcdn.com", "https://cdn.jsdelivr.net"],
    },
  },
}));
app.use(compression());

// Static assets (must be before authentication)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Core
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));

// --- Routes ---
const { authenticateToken } = require('./utils/auth');
const authRouter = require('./routes/auth');
const patientsRouter = require('./routes/patients');
const visitsRouter = require('./routes/visits');
const uploadRouter = require('./routes/upload');
const historyRouter = require('./routes/history');
const patientRouter = require('./routes/patient'); // Added this line

// --- Public & Debug Routes ---

// Root route should always go to login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Terms of Service Page
app.get('/terms', (req, res) => {
    res.render('terms');
});

// DEBUG ROUTE to view all users
app.get('/debug-users', (req, res) => {
  db.all("SELECT id, citizen_id, role, password FROM users", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Authentication routes (login, register, logout)
app.use('/', authRouter);

// --- Protected Routes ---

// Handle redirects from old role-specific pages
app.get('/dentist', authenticateToken, (req, res) => res.redirect('/patients'));
app.get('/staff', authenticateToken, (req, res) => res.redirect('/patients'));

// Protected application routes that require authentication
app.use('/patients', authenticateToken, patientsRouter);
app.use('/visits', authenticateToken, visitsRouter);
app.use('/upload', authenticateToken, uploadRouter);
app.use('/', authenticateToken, historyRouter);
app.use('/', authenticateToken, patientRouter); // Added this line


// --- System & Error Handling ---
app.get('/health', (req, res) => {
  db.get('SELECT 1', (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: err.message });
    }
    res.json({ ok: true });
  });
});

app.use((req, res) => res.status(404).send('Not Found'));
app.use((err, req, res, next) => { 
  console.error(err.stack); 
  res.status(500).send('Server Error'); 
});

// --- Server Start ---
app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
