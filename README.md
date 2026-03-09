# OAuth Authentication Service

Fullstack-сервис аутентификации на Node.js 24 с поддержкой мульти-аккаунтинга, социальных сетей и email верификации.

## 🚀 Возможности

- **Мульти-аккаунтинг**: Привязка нескольких социальных сетей к одному профилю
- **Email аутентификация**: Регистрация с подтверждением email (Argon2)
- **Социальные сети**: Google, Facebook, VK
- **Telegram**: Вход через Telegram бот с проверкой hash
- **Роли**: Первый пользователь — admin, остальные — user
- **Merge Logic**: Привязка социального аккаунта к существующему профилю
- **Dev Mode Mail Inbox**: Просмотр всех отправленных писем в режиме разработки

## 📋 Требования

- Node.js 24+ (ESM, Native Fetch, top-level await)
- npm

## 🛠️ Установка

```bash
# Клонирование репозитория
cd oauth

# Установка зависимостей
npm install

# Настройка переменных окружения
cp .env.example .env
# Отредактируйте .env файл при необходимости
```

## ▶️ Запуск

```bash
# Режим разработки
npm run dev

# Продакшн режим
npm start
```

Сервер запустится на http://localhost:3000

## 🔧 Конфигурация OAuth

Для работы социальной авторизации добавьте credentials в `.env`:

### Google OAuth
1. Перейдите в Google Cloud Console
2. Создайте OAuth 2.0 credentials
3. Добавьте `http://localhost:3000/auth/google/callback` в Redirect URIs

### Facebook OAuth
1. Перейдите в Facebook Developers
2. Создайте App и добавьте OAuth
3. Добавьте `http://localhost:3000/auth/facebook/callback` в Valid OAuth Redirect URIs

### VK OAuth
1. Перейдите в VK My Apps
2. Создайте приложение
3. Добавьте `http://localhost:3000/auth/vk/callback` в Open API → Адреса сайта

### Telegram
1. Создайте бота через @BotFather
2. Получите токен бота
3. Добавьте токен в `TELEGRAM_BOT_TOKEN`

## 📧 Режим разработки

В режиме разработки (`NODE_ENV=development`):
- Все письма перенаправляются на admin@localhost
- Доступна страница просмотра писем: `/admin/mail`
- Страница доступна только для администратора

## 📁 Структура проекта

```
oauth/
├── index.js              # Главный файл приложения
├── database.js           # Настройка SQLite базы данных
├── auth.js               # Логика аутентификации
├── email.js              # Сервис отправки писем
├── routes/
│   ├── auth.js          # Маршруты аутентификации
│   └── admin.js         # Админ-маршруты
├── views/                # EJS шаблоны
├── public/
│   └── style.css        # Единый CSS файл
└── data/                 # SQLite база данных
```

## 🔐 Безопасность

- Пароли хэшируются с использованием Argon2
- CSRF защита реализована через сессии
- Сессии с HttpOnly cookies
- Строгая валидация данных на бэкенде
- Проверка hash для Telegram данных

## 📝 API Endpoints

### Аутентификация
- `GET /login` - Страница входа
- `GET /register` - Страница регистрации
- `POST /login` - Вход по email/password
- `POST /register` - Регистрация
- `POST /logout` - Выход
- `GET /profile` - Профиль пользователя

### OAuth
- `GET /auth/google` - Google OAuth
- `GET /auth/facebook` - Facebook OAuth
- `GET /auth/vk` - VK OAuth
- `GET /auth/telegram` - Telegram страница входа

### Email
- `POST /verify/request` - Запрос кода подтверждения
- `GET /verify/:code` - Подтверждение email
- `POST /reset/request` - Запрос сброса пароля
- `GET /reset-password` - Страница сброса пароля

### Админка (только для admin)
- `GET /admin` - Панель администратора
- `GET /admin/mail` - Почтовый ящик (dev)
- `GET /admin/users` - Список пользователей

## 📜 License

MIT

