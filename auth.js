import { getDb } from './database.js';
import crypto from 'crypto';
import argon2 from 'argon2';

// Social provider configurations
const providers = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
  },
  facebook: {
    clientId: process.env.FACEBOOK_CLIENT_ID || '',
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/v18.0/me'
  },
  vk: {
    clientId: process.env.VK_CLIENT_ID || '',
    clientSecret: process.env.VK_CLIENT_SECRET || '',
    authUrl: 'https://oauth.vk.com/authorize',
    tokenUrl: 'https://oauth.vk.com/access_token',
    userInfoUrl: 'https://api.vk.com/method/users.get'
  }
};

// Generate random ID
export function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

// Hash password with Argon2
export async function hashPassword(password) {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  });
}

// Verify password
export async function verifyPassword(password, hash) {
  return await argon2.verify(hash, password);
}

// Check if user is admin (first email user)
export function isFirstUser() {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return userCount.count === 0;
}

// Create new user
export function createUser(email, name, image = null) {
  const db = getDb();
  const id = generateId();
  const role = isFirstUser() ? 'admin' : 'user';
  
  const stmt = db.prepare(`
    INSERT INTO users (id, email, name, image, role)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, email.toLowerCase(), name, image, role);
  
  return { id, email, name, image, role };
}

// Get user by ID
export function getUserById(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

// Get user by email
export function getUserByEmail(email) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

// Update user
export function updateUser(userId, data) {
  const db = getDb();
  const fields = [];
  const values = [];
  
  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.image !== undefined) {
    fields.push('image = ?');
    values.push(data.image);
  }
  if (data.email_verified !== undefined) {
    fields.push('email_verified = ?');
    values.push(data.email_verified ? 1 : 0);
  }
  
  fields.push("updated_at = datetime('now')");
  values.push(userId);
  
  const stmt = db.prepare(`
    UPDATE users SET ${fields.join(', ')} WHERE id = ?
  `);
  
  stmt.run(...values);
}

// Add authentication method to user
export function addAuthentication(userId, provider, providerId, email) {
  const db = getDb();
  const id = generateId();
  
  const stmt = db.prepare(`
    INSERT INTO authentications (id, user_id, provider, provider_id, email)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, userId, provider, providerId, email);
  
  return { id, userId, provider, providerId, email };
}

// Get user authentications
export function getUserAuthentications(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM authentications WHERE user_id = ?').all(userId);
}

// Get authentication by provider
export function getAuthentication(provider, providerId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM authentications WHERE provider = ? AND provider_id = ?'
  ).get(provider, providerId);
}

// Generate verification code
export function generateVerificationCode(userId, type = 'email') {
  const db = getDb();
  const id = generateId();
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
  
  const stmt = db.prepare(`
    INSERT INTO verification_codes (id, user_id, code, type, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, userId, code, type, expiresAt);
  
  return { id, code, expiresAt };
}

// Verify code
export function verifyCode(userId, code, type = 'email') {
  const db = getDb();
  const record = db.prepare(`
    SELECT * FROM verification_codes 
    WHERE user_id = ? AND code = ? AND type = ? AND used = 0 AND expires_at > datetime('now')
  `).get(userId, code, type);
  
  if (record) {
    // Mark code as used
    db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id);
    return true;
  }
  return false;
}

// Create linking request for account merge
export function createLinkingRequest(email, newProvider, newProviderId) {
  const db = getDb();
  const id = generateId();
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO linking_requests (id, email, new_provider, new_provider_id, code, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, email.toLowerCase(), newProvider, newProviderId, code, expiresAt);
  
  return { id, code, expiresAt };
}

// Verify linking request
export function verifyLinkingRequest(email, code) {
  const db = getDb();
  const record = db.prepare(`
    SELECT * FROM linking_requests 
    WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
  `).get(email.toLowerCase(), code);
  
  if (record) {
    // Mark as used
    db.prepare('UPDATE linking_requests SET used = 1 WHERE id = ?').run(record.id);
    return record;
  }
  return null;
}

// Create session
export function createSession(userId) {
  const db = getDb();
  const id = generateId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  
  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `);
  
  stmt.run(id, userId, expiresAt);
  
  return { id, userId, expiresAt };
}

// Get session
export function getSession(sessionId) {
  const db = getDb();
  return db.prepare(`
    SELECT s.*, u.email, u.name, u.image, u.role, u.email_verified
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).get(sessionId);
}

// Delete session
export function deleteSession(sessionId) {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// Delete all user sessions
export function deleteUserSessions(userId) {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Clean expired sessions
export function cleanExpiredSessions() {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE expires_at <= datetime("now")').run();
}

// Get OAuth URL for provider
export function getOAuthUrl(provider) {
  const config = providers[provider];
  if (!config) return null;
  
  const redirectUri = `${process.env.BASE_URL || 'http://localhost:3001'}/auth/${provider}/callback`;
  const state = generateId();
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: provider === 'google' ? 'openid email profile' : 
           provider === 'facebook' ? 'email,public_profile' : 
           'email',
    state
  });
  
  if (provider === 'vk') {
    params.set('v', '5.131');
  }
  
  return {
    url: `${config.authUrl}?${params.toString()}`,
    state
  };
}

// Exchange code for tokens (Google, Facebook, VK)
export async function exchangeCodeForToken(provider, code) {
  const config = providers[provider];
  const redirectUri = `${process.env.BASE_URL || 'http://localhost:3001'}/auth/${provider}/callback`;
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  
  return await response.json();
}

// Get user info from provider
export async function getProviderUserInfo(provider, accessToken) {
  const config = providers[provider];
  
  let url = config.userInfoUrl;
  if (provider === 'facebook') {
    url += `?fields=id,name,email,picture&access_token=${accessToken}`;
  } else if (provider === 'vk') {
    url += `?user_ids=${accessToken}&access_token=${accessToken}&v=5.131&fields=photo_200`;
  } else {
    url += `?access_token=${accessToken}`;
  }
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (provider === 'google') {
    return {
      id: data.sub,
      email: data.email,
      name: data.name,
      image: data.picture
    };
  } else if (provider === 'facebook') {
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      image: data.picture?.data?.url
    };
  } else if (provider === 'vk') {
    const user = data.response[0];
    return {
      id: String(user.id),
      email: null,
      name: `${user.first_name} ${user.last_name}`,
      image: user.photo_200
    };
  }
  
  return null;
}

// Verify Telegram data
export function verifyTelegramData(telegramData) {
  const { hash, ...data } = telegramData;
  
  // Sort keys alphabetically
  const sortedData = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('\n');
  
  // Create secret key from bot token
  const secretKey = crypto
    .createHash('sha256')
    .update(process.env.TELEGRAM_BOT_TOKEN || '')
    .digest();
  
  // Calculate expected hash
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(sortedData)
    .digest('hex');
  
  // Check if hash matches and auth_date is not too old (5 minutes)
  const isValid = hash === expectedHash;
  const isNotExpired = Date.now() / 1000 - data.auth_date < 300;
  
  return isValid && isNotExpired;
}

export { providers };

