import nodemailer from 'nodemailer';
import { getDb } from './database.js';

// In-memory store for dev mode emails
const devEmails = [];

// Email transporter
let transporter = null;

// Initialize email service
export async function initEmailService() {
  if (process.env.NODE_ENV === 'production') {
    // Production: use Postfix via sendmail
    const sendmailPath = process.env.SENDMAIL_PATH || '/usr/sbin/sendmail';
    transporter = nodemailer.createTransport({
      sendmail: true,
      sendmailPath: sendmailPath,
      defaults: {
        from: process.env.MAIL_FROM || 'noreply@localhost'
      }
    });
    console.log('📧 Email service initialized with Postfix (sendmail)');
  } else if (process.env.SMTP_HOST) {
    // Development with custom SMTP
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    console.log('📧 Email service initialized with SMTP');
  } else {
    // Development: use ethereal or console logging
    console.log('📧 Email service initialized in DEV mode (all emails → admin@localhost)');
  }
}

// Get all dev mode emails (for admin inbox)
export function getDevEmails() {
  return devEmails.slice().reverse();
}

// Clear dev mode emails
export function clearDevEmails() {
  devEmails.length = 0;
}

// Send email
export async function sendEmail(to, subject, html, text = null) {
  const isDev = process.env.NODE_ENV !== 'production';
  
  // In development, redirect all emails to admin@localhost
  let finalTo = to;
  let devEmailRecord = null;
  
  if (isDev) {
    finalTo = 'admin@localhost';
    devEmailRecord = {
      id: Date.now(),
      originalTo: to,
      to: finalTo,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
      sentAt: new Date().toISOString()
    };
    devEmails.push(devEmailRecord);
    
    console.log(`📧 [DEV] Email redirected: ${to} → ${finalTo}`);
    console.log(`   Subject: ${subject}`);
    
    // Also log to console in dev
    if (process.env.NODE_ENV === 'development') {
      console.log(`   Preview: ${text ? text.substring(0, 100) : html.substring(0, 100)}...`);
    }
    
    return { success: true, devMode: true, email: devEmailRecord };
  }
  
  // Production: send via Postfix/sendmail
  if (!transporter) {
    throw new Error('Email transporter not configured');
  }
  
  const fromAddress = process.env.MAIL_FROM || 'noreply@localhost';
  
  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: finalTo,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    });
    
    console.log(`📧 Email sent to ${finalTo}: ${subject}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

// Send verification email
export async function sendVerificationEmail(email, name, code) {
  const subject = 'Подтверждение email';
  const verificationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/verify/${code}?email=${encodeURIComponent(email)}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .container { background: #f9f9f9; border-radius: 10px; padding: 30px; }
        .code { background: #fff; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0; border: 2px solid #007bff; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: #fff; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Подтверждение email</h2>
        <p>Привет, ${name || 'пользователь'}!</p>
        <p>Для подтверждения вашего email используйте код:</p>
        <div class="code">${code}</div>
        <p>Или перейдите по ссылке:</p>
        <a href="${verificationUrl}" class="button">Подтвердить email</a>
        <p>Код действителен в течение 15 минут.</p>
        <div class="footer">
          <p>Если вы не регистрировались на нашем сервисе, просто игнорируйте это письмо.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail(email, subject, html);
}

// Send linking verification email
export async function sendLinkingEmail(email, name, code, provider) {
  const subject = 'Привязка аккаунта';
  const linkUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/link/confirm?email=${encodeURIComponent(email)}&code=${code}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .container { background: #f9f9f9; border-radius: 10px; padding: 30px; }
        .code { background: #fff; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0; border: 2px solid #28a745; }
        .button { display: inline-block; padding: 12px 24px; background: #28a745; color: #fff; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Привязка аккаунта</h2>
        <p>Привет, ${name || 'пользователь'}!</p>
        <p>Обнаружена попытка привязать аккаунт ${provider} к вашему профилю.</p>
        <p>Для подтверждения введите код:</p>
        <div class="code">${code}</div>
        <p>Или перейдите по ссылке:</p>
        <a href="${linkUrl}" class="button">Подтвердить привязку</a>
        <p>Код действителен в течение 15 минут.</p>
        <div class="footer">
          <p>Если это были не вы, просто игнорируйте это письмо.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail(email, subject, html);
}

// Send password reset email
export async function sendPasswordResetEmail(email, name, code) {
  const subject = 'Восстановление пароля';
  const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password?code=${code}&email=${encodeURIComponent(email)}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .container { background: #f9f9f9; border-radius: 10px; padding: 30px; }
        .code { background: #fff; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0; border: 2px solid #dc3545; }
        .button { display: inline-block; padding: 12px 24px; background: #dc3545; color: #fff; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Восстановление пароля</h2>
        <p>Привет, ${name || 'пользователь'}!</p>
        <p>Вы запросили восстановление пароля. Используйте код:</p>
        <div class="code">${code}</div>
        <p>Или перейдите по ссылке:</p>
        <a href="${resetUrl}" class="button">Сбросить пароль</a>
        <p>Ссылка и код действительны в течение 15 минут.</p>
        <div class="footer">
          <p>Если вы не запрашивали восстановление пароля, просто игнорируйте это письмо.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail(email, subject, html);
}

