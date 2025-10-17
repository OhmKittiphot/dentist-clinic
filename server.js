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

// View engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Nonce middleware (should be before helmet for CSP)
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Configure Helmet with CSP (should be early)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, "https://code.jquery.com", "https://cdn.jsdelivr.net", "https://stackpath.bootstrapcdn.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // Added to allow inline event handlers like onclick
      styleSrc: ["'self'", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", ], 
      connectSrc: ["'self'", "https://stackpath.bootstrapcdn.com", "https://cdn.jsdelivr.net"],
    },
  },
}));

app.use(compression());

// Static assets - MUST be before any authentication middleware
app.use('/public', express.static(path.join(__dirname, 'public')));

// Middlewares
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));


// Layout helper
const layoutSupport = require('./layout-support');
app.use(layoutSupport);

// Routes
const authRouter = require('./routes/auth');
const patientsRouter = require('./routes/patients');
const visitsRouter = require('./routes/visits');
const uploadRouter = require('./routes/upload');
const historyRouter = require('./routes/history');
const { authenticateToken, allowRoles } = require('./utils/auth');

// Public routes (login and register)
app.use('/', authRouter);

// Redirect root to login if not authenticated
app.get('/', (req, res) => {
  if (!req.cookies.token) {
    return res.redirect('/login');
  }
  res.redirect('/patients'); 
});

// Specific role redirects after login
app.get('/dentist', authenticateToken, (req, res) => res.redirect('/patients'));
app.get('/staff', authenticateToken, (req, res) => res.redirect('/patients'));

// Apply authentication middleware to all routes that require it.
// Order matters: specific routes first, then more general ones.
app.use('/patients', authenticateToken, patientsRouter);
app.use('/visits', authenticateToken, visitsRouter);
app.use('/upload', authenticateToken, uploadRouter);
app.use('/', authenticateToken, historyRouter);


// Healthcheck
const db = require('./db');
app.get('/health', (req, res) => {
  db.get('SELECT 1', (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: err.message });
    }
    res.json({ ok: true });
  });
});

app.use((req, res) => res.status(404).send('Not found'));
app.use((err, req, res, next) => { console.error(err); res.status(500).send('Server error'); });

app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
