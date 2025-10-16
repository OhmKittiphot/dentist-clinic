const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// View engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use('/public', express.static(path.join(__dirname, 'public')));

// Layout helper
const layoutSupport = require('./layout-support');

// Nonce middleware
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Middlewares
app.use(layoutSupport);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));

// Configure Helmet with CSP
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

// Routes
const patientsRouter = require('./routes/patients');
const visitsRouter = require('./routes/visits');
const uploadRouter = require('./routes/upload');
const historyRouter = require('./routes/history');

app.get('/', (req, res) => res.redirect('/patients'));
app.use('/patients', patientsRouter);
app.use('/visits', visitsRouter);
app.use('/upload', uploadRouter);
app.use('/', historyRouter);

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
