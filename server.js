const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');

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

// Middlewares
app.use(layoutSupport);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use(helmet());
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
const { pool } = require('./config/db');
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ ok: false, error: e.message }); }
});

app.use((req, res) => res.status(404).send('Not found'));
app.use((err, req, res, next) => { console.error(err); res.status(500).send('Server error'); });

app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
