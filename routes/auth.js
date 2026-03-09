import express from 'express';
import crypto from 'crypto';
import {
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  addAuthentication,
  getUserAuthentications,
  getAuthentication,
  generateVerificationCode,
  verifyCode,
  createLinkingRequest,
  verifyLinkingRequest,
  createSession,
  deleteSession,
  getSession,
  getOAuthUrl,
  exchangeCodeForToken,
  getProviderUserInfo,
  verifyTelegramData,
  hashPassword,
  verifyPassword,
  generateId
} from '../auth.js';
import {
  sendVerificationEmail,
  sendLinkingEmail,
  sendPasswordResetEmail
} from '../email.js';

const router = express.Router();

// Middleware: require auth
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

// Middleware: require admin
function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).render('error', { error: 'Доступ запрещен' });
  }
  next();
}

// ============ PAGE ROUTES ============

// Login page
router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/profile');
  }
  res.render('login', {
    error: req.query.error,
    redirect: req.query.redirect || '/profile'
  });
});

// Register page
router.get('/register', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/profile');
  }
  res.render('register', {
    error: req.query.error,
    redirect: req.query.redirect || '/profile'
  });
});

// Profile page
router.get('/profile', requireAuth, (req, res) => {
  const user = getUserById(req.session.userId);
  const authentications = getUserAuthentications(req.session.userId);
  
  res.render('profile', {
    user,
    authentications,
    isAdmin: req.session.isAdmin,
    error: req.query.error,
    success: req.query.success
  });
});

// Logout
router.post('/logout', (req, res) => {
  if (req.session.sessionId) {
    deleteSession(req.session.sessionId);
  }
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Verify email page
router.get('/verify/:code', async (req, res) => {
  const { code } = req.params;
  const email = req.query.email;
  
  if (!email) {
    return res.render('verify', { success: false, error: 'Email не указан' });
  }
  
  const user = getUserByEmail(email);
  if (!user) {
    return res.render('verify', { success: false, error: 'Пользователь не найден' });
  }
  
  const isValid = verifyCode(user.id, code, 'email');
  if (isValid) {
    updateUser(user.id, { email_verified: 1 });
    
    // Auto-login after verification
    const session = createSession(user.id);
    req.session.userId = user.id;
    req.session.sessionId = session.id;
    req.session.isAdmin = user.role === 'admin';
    
    return res.render('verify', { 
      success: true, 
      message: 'Email подтвержден! Теперь вы можете использовать все функции.',
      redirect: '/profile'
    });
  }
  
  res.render('verify', { success: false, error: 'Неверный или истекший код' });
});

// ============ API ROUTES ============

// Register with email/password
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, redirect } = req.body;
    
    // Validation
    if (!email || !password || !name) {
      return res.redirect(`/register?error=${encodeURIComponent('Заполните все поля')}`);
    }
    
    if (password.length < 6) {
      return res.redirect(`/register?error=${encodeURIComponent('Пароль должен быть не менее 6 символов')}`);
    }
    
    // Check if user exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return res.redirect(`/register?error=${encodeURIComponent('Пользователь с таким email уже существует')}`);
    }
    
    // Create user
    const user = createUser(email, name);
    
    // Hash password and add authentication
    const hashedPassword = await hashPassword(password);
    addAuthentication(user.id, 'email', null, email);
    
    // Store password hash in a special way (for demo - in production use proper table)
    const db = (await import('../database.js')).getDb();
    db.prepare(`
      INSERT OR REPLACE INTO verification_codes (id, user_id, code, type, expires_at, used)
      VALUES (?, ?, ?, 'password', datetime('now', '+1 year'), 1)
    `).run(generateId(), user.id, hashedPassword);
    
    // Send verification email
    const verification = generateVerificationCode(user.id, 'email');
    await sendVerificationEmail(email, name, verification.code);
    
    // Show message - require verification
    res.render('register', {
      success: true,
      message: 'Регистрация успешна! Проверьте email для подтверждения.',
      email
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.redirect(`/register?error=${encodeURIComponent('Ошибка регистрации')}`);
  }
});

// Login with email/password
router.post('/login', async (req, res) => {
  try {
    const { email, password, redirect } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.redirect(`/login?error=${encodeURIComponent('Заполните все поля')}`);
    }
    
    const user = getUserByEmail(email);
    if (!user) {
      return res.redirect(`/login?error=${encodeURIComponent('Пользователь не найден')}`);
    }
    
    // Get password hash and verify
    const db = (await import('../database.js')).getDb();
    const passwordRecord = db.prepare(`
      SELECT code FROM verification_codes 
      WHERE user_id = ? AND type = 'password' AND used = 1
      ORDER BY created_at DESC LIMIT 1
    `).get(user.id);
    
    if (!passwordRecord) {
      return res.redirect(`/login?error=${encodeURIComponent('Аккаунт не настроен для входа по паролю')}`);
    }
    
    const isValid = await verifyPassword(password, passwordRecord.code);
    if (!isValid) {
      return res.redirect(`/login?error=${encodeURIComponent('Неверный пароль')}`);
    }
    
    // Create session
    const session = createSession(user.id);
    req.session.userId = user.id;
    req.session.sessionId = session.id;
    req.session.isAdmin = user.role === 'admin';
    
    res.redirect(redirect || '/profile');
    
  } catch (error) {
    console.error('Login error:', error);
    res.redirect(`/login?error=${encodeURIComponent('Ошибка входа')}`);
  }
});

// Update profile
router.post('/profile/update', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (name) {
      updateUser(req.session.userId, { name });
    }
    
    res.redirect('/profile?success=Данные обновлены');
  } catch (error) {
    console.error('Update error:', error);
    res.redirect('/profile?error=Ошибка обновления');
  }
});

// Request email verification
router.post('/verify/request', requireAuth, async (req, res) => {
  try {
    const user = getUserById(req.session.userId);
    
    if (user.email_verified) {
      return res.redirect('/profile?error=Email уже подтвержден');
    }
    
    const verification = generateVerificationCode(user.id, 'email');
    await sendVerificationEmail(user.email, user.name, verification.code);
    
    res.redirect('/profile?success=Код отправлен на ваш email');
  } catch (error) {
    console.error('Verification request error:', error);
    res.redirect('/profile?error=Ошибка отправки кода');
  }
});

// ============ OAUTH ROUTES ============

// Telegram login page (must be before /auth/:provider)
router.get('/auth/telegram', (req, res) => {
  res.render('telegram', { 
    botUsername: process.env.TELEGRAM_BOT_USERNAME,
    error: req.query.error 
  });
});

// Telegram login callback (from bot)
router.post('/auth/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'No init data' });
    }
    
    // Parse initData
    const params = new URLSearchParams(initData);
    const telegramData = {};
    for (const [key, value] of params) {
      telegramData[key] = value;
    }
    
    // Verify hash
    if (!verifyTelegramData(telegramData)) {
      return res.status(400).json({ error: 'Invalid hash' });
    }
    
    const telegramId = telegramData.user_id;
    const telegramUser = JSON.parse(telegramData.user);
    
    // Check if telegram is linked
    const existingAuth = getAuthentication('telegram', telegramId);
    
    if (existingAuth) {
      // Login
      const user = getUserById(existingAuth.user_id);
      const session = createSession(user.id);
      req.session.userId = user.id;
      req.session.sessionId = session.id;
      req.session.isAdmin = user.role === 'admin';
      
      return res.json({ success: true, redirect: '/profile' });
    }
    
    // Create new user or require linking
    const user = createUser(
      `telegram_${telegramId}@telegram.local`,
      `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim(),
      telegramUser.photo_url
    );
    
    addAuthentication(user.id, 'telegram', telegramId, null);
    
    const session = createSession(user.id);
    req.session.userId = user.id;
    req.session.sessionId = session.id;
    req.session.isAdmin = user.role === 'admin';
    
    res.json({ success: true, redirect: '/profile' });
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Start OAuth flow
router.get('/auth/:provider', (req, res) => {
  const { provider } = req.params;
  const validProviders = ['google', 'facebook', 'vk'];
  
  if (!validProviders.includes(provider)) {
    return res.redirect('/login?error=Неподдерживаемый провайдер');
  }
  
  const oauthUrl = getOAuthUrl(provider);
  if (!oauthUrl) {
    return res.redirect('/login?error=OAuth не настроен');
  }
  
  // Store state in session for validation
  req.session.oauthState = oauthUrl.state;
  req.session.oauthProvider = provider;
  req.session.oauthRedirect = req.query.redirect || '/profile';
  
  res.redirect(oauthUrl.url);
});

// OAuth callback
router.get('/auth/:provider/callback', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error: oauthError } = req.query;
    
    // Validate state
    if (state !== req.session.oauthState) {
      return res.redirect(`/login?error=Неверный state параметр`);
    }
    
    if (oauthError) {
      return res.redirect(`/login?error=${encodeURIComponent(oauthError)}`);
    }
    
    if (!code) {
      return res.redirect('/login?error=Код не получен');
    }
    
    // Exchange code for tokens
    const tokens = await exchangeCodeForToken(provider, code);
    if (tokens.error) {
      return res.redirect(`/login?error=${encodeURIComponent(tokens.error.message)}`);
    }
    
    // Get user info from provider
    const providerUser = await getProviderUserInfo(provider, provider === 'vk' ? tokens.access_token : tokens.access_token);
    if (!providerUser) {
      return res.redirect('/login?error=Не удалось получить данные пользователя');
    }
    
    // Check if this provider is already linked
    const existingAuth = getAuthentication(provider, providerUser.id);
    
    if (existingAuth) {
      // Existing user - login
      const user = getUserById(existingAuth.user_id);
      const session = createSession(user.id);
      req.session.userId = user.id;
      req.session.sessionId = session.id;
      req.session.isAdmin = user.role === 'admin';
      
      return res.redirect(req.session.oauthRedirect || '/profile');
    }
    
    // New user or account linking needed
    if (providerUser.email) {
      const existingUserByEmail = getUserByEmail(providerUser.email);
      
      if (existingUserByEmail) {
        // Email exists - need linking verification
        const linkingRequest = createLinkingRequest(
          providerUser.email,
          provider,
          providerUser.id
        );
        
        // Store pending linking in session
        req.session.pendingLinking = {
          email: providerUser.email,
          provider,
          providerId: providerUser.id,
          name: providerUser.name,
          image: providerUser.image,
          code: linkingRequest.code
        };
        
        // Send linking verification email
        await sendLinkingEmail(
          providerUser.email,
          existingUserByEmail.name,
          linkingRequest.code,
          provider
        );
        
        return res.render('link-verify', {
          email: providerUser.email,
          message: `Для привязки аккаунта ${provider} к существующему профилю, введите код, отправленный на ваш email`
        });
      }
    }
    
    // Create new user
    const user = createUser(
      providerUser.email || `${provider}_${providerUser.id}@social.local`,
      providerUser.name,
      providerUser.image
    );
    
    // Add authentication
    addAuthentication(user.id, provider, providerUser.id, providerUser.email);
    
    // Auto-login
    const session = createSession(user.id);
    req.session.userId = user.id;
    req.session.sessionId = session.id;
    req.session.isAdmin = user.role === 'admin';
    
    res.redirect(req.session.oauthRedirect || '/profile');
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`/login?error=${encodeURIComponent('Ошибка OAuth')}`);
  }
});

// Confirm account linking
router.post('/link/confirm', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.redirect('/login?error=Заполните все поля');
    }
    
    const linkingRequest = verifyLinkingRequest(email, code);
    if (!linkingRequest) {
      return res.redirect('/login?error=Неверный или истекший код');
    }
    
    // Get existing user
    const user = getUserByEmail(email);
    if (!user) {
      return res.redirect('/login?error=Пользователь не найден');
    }
    
    // Add new authentication
    addAuthentication(
      user.id,
      linkingRequest.new_provider,
      linkingRequest.new_provider_id,
      email
    );
    
    // Auto-login
    const session = createSession(user.id);
    req.session.userId = user.id;
    req.session.sessionId = session.id;
    req.session.isAdmin = user.role === 'admin';
    
    res.redirect('/profile?success=Аккаунт успешно привязан');
  } catch (error) {
    console.error('Link confirm error:', error);
    res.redirect('/login?error=Ошибка привязки аккаунта');
  }
});

// ============ TELEGRAM AUTH ============

// Telegram login page
router.get('/auth/telegram', (req, res) => {
  res.render('telegram', { 
    botUsername: process.env.TELEGRAM_BOT_USERNAME,
    error: req.query.error 
  });
});

// Telegram login callback (from bot)
router.post('/auth/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'No init data' });
    }
    
    // Parse initData
    const params = new URLSearchParams(initData);
    const telegramData = {};
    for (const [key, value] of params) {
      telegramData[key] = value;
    }
    
    // Verify hash
    if (!verifyTelegramData(telegramData)) {
      return res.status(400).json({ error: 'Invalid hash' });
    }
    
    const telegramId = telegramData.user_id;
    const telegramUser = JSON.parse(telegramData.user);
    
    // Check if telegram is linked
    const existingAuth = getAuthentication('telegram', telegramId);
    
    if (existingAuth) {
      // Login
      const user = getUserById(existingAuth.user_id);
      const session = createSession(user.id);
      req.session.userId = user.id;
      req.session.sessionId = session.id;
      req.session.isAdmin = user.role === 'admin';
      
      return res.json({ success: true, redirect: '/profile' });
    }
    
    // Create new user or require linking
    const user = createUser(
      `telegram_${telegramId}@telegram.local`,
      `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim(),
      telegramUser.photo_url
    );
    
    addAuthentication(user.id, 'telegram', telegramId, null);
    
    const session = createSession(user.id);
    req.session.userId = user.id;
    req.session.sessionId = session.id;
    req.session.isAdmin = user.role === 'admin';
    
    res.json({ success: true, redirect: '/profile' });
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ============ PASSWORD RESET ============

// Request password reset
router.post('/reset/request', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.redirect('/login?error=Введите email');
    }
    
    const user = getUserByEmail(email);
    if (user) {
      const verification = generateVerificationCode(user.id, 'reset');
      await sendPasswordResetEmail(email, user.name, verification.code);
    }
    
    // Always show success to prevent email enumeration
    res.render('reset-sent', { email });
  } catch (error) {
    console.error('Reset request error:', error);
    res.redirect('/login?error=Ошибка запроса');
  }
});

// Reset password page
router.get('/reset-password', (req, res) => {
  const { code, email } = req.query;
  
  if (!code || !email) {
    return res.redirect('/login');
  }
  
  res.render('reset-password', { code, email });
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { code, email, password } = req.body;
    
    if (!code || !email || !password) {
      return res.redirect('/login?error=Заполните все поля');
    }
    
    if (password.length < 6) {
      return res.redirect('/login?error=Пароль слишком короткий');
    }
    
    const user = getUserByEmail(email);
    if (!user) {
      return res.redirect('/login?error=Пользователь не найден');
    }
    
    const isValid = verifyCode(user.id, code, 'reset');
    if (!isValid) {
      return res.redirect('/login?error=Неверный или истекший код');
    }
    
    // Update password
    const hashedPassword = await hashPassword(password);
    const db = (await import('../database.js')).getDb();
    db.prepare(`
      INSERT OR REPLACE INTO verification_codes (id, user_id, code, type, expires_at, used)
      VALUES (?, ?, ?, 'password', datetime('now', '+1 year'), 1)
    `).run(generateId(), user.id, hashedPassword);
    
    // Delete all other sessions (security)
    const { deleteUserSessions } = await import('../auth.js');
    deleteUserSessions(user.id);
    
    res.render('login', { 
      success: true, 
      message: 'Пароль изменен. Войдите с новым паролем.' 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.redirect('/login?error=Ошибка сброса пароля');
  }
});

export default router;

