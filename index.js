import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import { initDatabase } from './database.js';
import { initEmailService } from './email.js';
import { setupTelegramBot } from './bot.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy for production (required for secure cookies behind reverse proxy)
app.set('trust proxy', 1);

// Generate CSRF token
function csrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

// CSRF validation middleware
function validateCsrf(req, res, next) {
  // Skip CSRF for GET requests, POST with form submission will validate
  if (req.method === 'GET') {
    return next();
  }
  
  const submittedToken = req.body._csrf || req.headers['x-csrf-token'];
  
  if (!submittedToken || submittedToken !== req.session.csrfToken) {
    return res.status(403).render('error', { 
      error: 'Ошибка безопасности: неверный токен CSRF' 
    });
  }
  
  next();
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, 'public')));

// Session configuration
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// CSRF middleware
app.use(csrfToken);
app.use(validateCsrf);

// View engine
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

// Initialize services
await initDatabase();
await initEmailService();

// Routes
app.use('/', authRouter);
app.use('/admin', adminRouter);

// Home page
app.get('/', (req, res) => {
  res.render('index', { 
    user: req.session.user || null,
    isAdmin: req.session.isAdmin || false
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).render('error', { 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Mode: ${NODE_ENV}`);
  
  // Setup Telegram Bot in production mode (webhooks)
/*   if (NODE_ENV === 'production') {
    try {
      setupTelegramBot(app);
    } catch (error) {
      console.error('Failed to setup Telegram bot:', error);
    }
  }
 */});

export default app;

