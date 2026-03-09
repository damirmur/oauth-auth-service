import express from 'express';
import { getDevEmails, clearDevEmails } from '../email.js';

const router = express.Router();

// Middleware: require admin
function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).render('error', { error: 'Доступ запрещен. Только для администраторов.' });
  }
  next();
}

// Middleware: require development mode
function requireDev(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).render('error', { error: 'Страница доступна только в режиме разработки' });
  }
  next();
}

// Mail Inbox Simulator - List all sent emails
router.get('/mail', requireDev, requireAdmin, (req, res) => {
  const emails = getDevEmails();
  
  res.render('admin-mail', {
    emails,
    count: emails.length
  });
});

// View single email
router.get('/mail/:id', requireDev, requireAdmin, (req, res) => {
  const { id } = req.params;
  const emails = getDevEmails();
  const email = emails.find(e => e.id === parseInt(id));
  
  if (!email) {
    return res.status(404).render('error', { error: 'Письмо не найдено' });
  }
  
  res.render('admin-mail-view', { email });
});

// Clear all emails
router.post('/mail/clear', requireDev, requireAdmin, (req, res) => {
  clearDevEmails();
  res.redirect('/admin/mail?success=Все письма удалены');
});

// Admin dashboard
router.get('/', requireAdmin, (req, res) => {
  res.render('admin-dashboard', {
    isDev: process.env.NODE_ENV !== 'production'
  });
});

// Users list (admin only)
router.get('/users', requireAdmin, async (req, res) => {
  const db = (await import('../database.js')).getDb();
  const users = db.prepare(`
    SELECT u.*, 
           (SELECT COUNT(*) FROM authentications WHERE user_id = u.id) as auth_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  
  res.render('admin-users', { users });
});

export default router;

