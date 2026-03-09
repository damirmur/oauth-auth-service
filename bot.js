import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Check if token is configured
if (!TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in .env file');
  console.log('Please add TELEGRAM_BOT_TOKEN to your .env file');
  process.exit(1);
}

// Check BASE_URL for production
if (NODE_ENV === 'production' && BASE_URL === 'http://localhost:3001') {
  console.warn('Warning: BASE_URL is still localhost! Set a public URL for production.');
}

// Helper function to run bot commands
function runBot(bot) {
  console.log('🤖 Telegram Bot started...');

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    const welcomeText = `Привет, ${firstName}! 👋

Добро пожаловать в astro3dAI_bot!

Для входа в систему нажмите кнопку "Войти" ниже.`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Войти',
              web_app: { url: `${BASE_URL}/auth/telegram` }
            }
          ]
        ]
      }
    };

    try {
      await bot.sendMessage(chatId, welcomeText, keyboard);
    } catch (error) {
      console.error('Error sending message:', error);
      await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  });

  // Handle /help command
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    const helpText = `📖 Справка

/	start - Начать работу с ботом
/help - Показать справку

Нажмите "Войти" для авторизации в системе.`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Войти',
              web_app: { url: `${BASE_URL}/auth/telegram` }
            }
          ]
        ]
      }
    };

    try {
      await bot.sendMessage(chatId, helpText, keyboard);
    } catch (error) {
      console.error('Error sending help:', error);
    }
  });

  // Handle web_app_data (responses from Web App)
  bot.on('web_app_data', async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.web_app_data.data) {
      try {
        const data = JSON.parse(msg.web_app_data.data);
        
        if (data.success) {
          await bot.sendMessage(
            chatId, 
            '✅ Успешная авторизация! Теперь вы можете использовать все функции системы.'
          );
        } else if (data.error) {
          await bot.sendMessage(
            chatId, 
            `❌ Ошибка: ${data.error}`
          );
        }
      } catch (error) {
        console.error('Error parsing web_app_data:', error);
      }
    }
  });

  // Handle errors
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, error.message);
  });

  console.log('✅ Bot is ready to receive messages');
  console.log(`🌐 Web App URL: ${BASE_URL}/auth/telegram`);
}

// Export setup function for production (integration with Express)
export function setupTelegramBot(expressApp) {
  const webhookPath = '/telegraf/' + TOKEN;
  
  const bot = new TelegramBot(TOKEN, { webHook: { port: process.env.PORT || 3000 } });
  
  bot.setWebHook(`${BASE_URL}${webhookPath}`).then(() => {
    console.log(`✅ Webhook set to: ${BASE_URL}${webhookPath}`);
  }).catch(err => {
    console.error('Failed to set webhook:', err);
  });
  
  // Add webhook route to existing Express app
  expressApp.use(express.json());
  expressApp.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.send('OK');
  });
  
  console.log(`✅ Bot webhook integrated with main server`);
  runBot(bot);
  
  return bot;
}

// Development mode: Run bot immediately with Long Polling
if (NODE_ENV !== 'production') {
  console.log('🔄 Using Polling mode (development)');
  const bot = new TelegramBot(TOKEN, { polling: true });
  runBot(bot);
} else {
  console.log('🔗 Production mode: Import and call setupTelegramBot(app) in index.js');
}

