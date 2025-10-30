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
const db = require('./db'); // mysql2/promise

/* =========================
 * 0) ตัวช่วย/ค่า ENV ที่ใช้กับ S3/CloudFront
 * ========================= */
const S3_ALLOWED_IMG = [
  "https://*.amazonaws.com",    // S3 URL ทั่วไป เช่น s3.amazonaws.com หรือ <bucket>.s3.<region>.amazonaws.com
  "https://*.cloudfront.net"    // ถ้ามี CloudFront หน้า S3
];
// ถ้ามีโดเมน custom CDN อนุญาตเพิ่มด้วยคอมม่าใน ENV: CDN_IMG_HOSTS="https://img.example.com,https://cdn.example.com"
if (process.env.CDN_IMG_HOSTS) {
  S3_ALLOWED_IMG.push(...process.env.CDN_IMG_HOSTS.split(',').map(s => s.trim()).filter(Boolean));
}

/* =========================
 * 1) View Engine
 * ========================= */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* =========================
 * 2) Middlewares
 * ========================= */

// สร้าง nonce สำหรับ CSP ใช้กับ <script nonce=...>
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Helmet + CSP (อนุญาตโหลดรูปจาก S3/CloudFront)
app.use(helmet({
  // บางหน้าเรามี <img> โหลดข้ามโดเมน ให้เปิด CORP เป็น cross-origin
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // ถ้าเว็บคุณใช้ COEP/COOP ที่เข้มงวด ให้ปิดฝั่ง embedder เพื่อหลีกเลี่ยงปัญหาภาพ/ฟอนต์
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'`,
        "https://code.jquery.com",
        "https://cdn.jsdelivr.net",
        "https://stackpath.bootstrapcdn.com"
      ],
      // สำหรับ attr inline จากไลบรารีบางตัว
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "https://stackpath.bootstrapcdn.com",
        "https://cdnjs.cloudflare.com",
        "'unsafe-inline'"
      ],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      // 👉 เพิ่ม S3/CloudFront/CDN เข้ามาที่ imgSrc
      imgSrc: [
        "'self'",
        "data:",
        "http://localhost:3000",
        ...S3_ALLOWED_IMG
      ],
      connectSrc: [
        "'self'",
        "https://stackpath.bootstrapcdn.com",
        "https://cdn.jsdelivr.net"
      ],
      // บางกรณีต้องให้ media/workers โหลดข้ามโดเมน—เติมตามที่คุณใช้จริงได้
    },
  },
}));
app.use(compression());

// Static assets (ต้องมาก่อน auth)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Core middlewares
app.use(cookieParser());
// หมายเหตุ: body ขนาดใหญ่มากไม่จำเป็น เพราะ multer รับไฟล์แทน; แต่ถ้าต้องใช้ เพิ่ม limit ได้
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

/* =========================
 * 3) Routes
 * ========================= */
const { authenticateToken } = require('./utils/auth');
const authRouter   = require('./routes/auth');
const dentRouter   = require('./routes/dentist');
const staffRouter  = require('./routes/staff');
const pantRouter   = require('./routes/patient');

// Root → login
app.get('/', (req, res) => { res.redirect('/login'); });

// Terms of Service
app.get('/terms', (req, res) => { res.render('terms'); });

// Debug users (dev only)
app.get('/debug-users', async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, citizen_id, role, password FROM users");
    res.json(rows);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Healthcheck (ใช้กับ ALB/EC2)
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// Auth + Protected
app.use('/', authRouter);
app.use('/dentist', authenticateToken, dentRouter);
app.use('/staff',   authenticateToken, staffRouter);
app.use('/patient', authenticateToken, pantRouter);

/* =========================
 * 4) Handlers
 * ========================= */
app.use((req, res) => res.status(404).send('Not Found'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  // อยากเห็น error detail ใน dev เท่านั้น
  res.status(500).send(process.env.NODE_ENV === 'production' ? 'Server Error' : (err.message || 'Server Error'));
});

/* =========================
 * 5) Helpers for EJS
 * ========================= */
app.locals.getStatusText = function(status) {
  const statusMap = {
    'PENDING':   'รอการยืนยัน',
    'CONFIRMED': 'ยืนยันแล้ว',
    'COMPLETED': 'เสร็จสิ้น',
    'CANCELLED': 'ยกเลิก',
    'NEW':       'ใหม่',
    'paid':      'ชำระแล้ว',
    'pending':   'รอชำระ'
  };
  return statusMap[status] || status;
};

/* =========================
 * 6) Server Start
 * ========================= */
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
  if (!process.env.AWS_REGION || !process.env.S3_BUCKET) {
    console.warn('⚠️  AWS_REGION/S3_BUCKET ไม่ถูกตั้งค่า: รูปจาก S3 อาจอัปโหลด/แสดงไม่ได้จนกว่าจะตั้ง ENV ให้ครบ');
  }
});
