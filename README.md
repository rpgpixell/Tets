# Pixel RPG Backend

Полностью переработанный TypeScript backend для браузерной RPG игры на базе Telegram Web App.

## 🚀 Быстрый старт

### Prerequisites
- Node.js 18+
- MongoDB (Atlas или локально)
- Telegram Bot Token

### Installation

```bash
# Clone repository
git clone https://github.com/rpgpixell/Tets.git
cd Tets

# Install dependencies
npm install

# Copy .env
cp .env.example .env

# Edit .env with your credentials
nano .env

# Build TypeScript
npm run build

# Start server
npm start
```

### Development

```bash
# Watch mode with auto-reload
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Format code
npm run format

# Run tests
npm test
```

## 📁 Project Structure

```
src/
├── config/          # Configuration files
│   ├── index.ts    # Main config (env vars)
│   └── constants.ts # Game constants
├── db/              # Database
│   ├── index.ts    # Connection
│   └── schemas/    # MongoDB schemas
├── middleware/      # Express middleware
│   ├── auth.ts     # Telegram authentication
│   ├── validation.ts  # Request validation
│   ├── security.ts  # Security headers, rate limiting
│   └── errorHandler.ts  # Error handling
├── routes/          # API routes
│   ├── save.ts     # Save/Load game data
│   ├── leaderboard.ts
│   ├── wallet.ts   # Wallet/Transactions
│   └── system.ts   # System info
├── services/        # Business logic
│   ├── UserService.ts
│   ├── TransactionService.ts
│   └── GameService.ts
├── types/           # TypeScript types
│   ├── index.ts    # Main types
│   └── express.d.ts  # Express augmentation
├── utils/           # Utilities
│   ├── logger.ts   # Logging
│   ├── validation.ts  # Validators
│   └── antiCheat.ts  # Anti-cheat system
└── server.ts        # Main server file
```

## 🔐 Security Features

✅ **Телеграм аутентификация** - Верификация подписи initData
✅ **Валидация данных** - Все входные данные проверяются
✅ **Античит система** - Проверка реалистичности данных
✅ **Rate Limiting** - Защита от DDoS/brute-force
✅ **Helmet.js** - Защита HTTP заголовков
✅ **CORS** - Правильная конфигурация
✅ **JWT готово** - Места для JWT токенов
✅ **Try-Catch везде** - Нет необработанных исключений

## 🎮 Game Constants

Все игровые константы в `src/config/constants.ts`:
- Персонажи и статы
- Редкости предметов
- Тип предметов
- Обменные курсы
- Конфиг боссов
- Daily tasks
- И много другое

## 📊 API Routes

### Game Data
- `POST /api/save/load` - Загрузить сохранение
- `POST /api/save/save` - Сохранить полные данные
- `POST /api/save/delta` - Сохранить частичные изменения

### Leaderboard
- `GET /api/leaderboard/` - Топ 50 игроков
- `GET /api/leaderboard/my-rank` - Мой рейтинг

### Wallet
- `POST /api/wallet/deposit` - Пополнить
- `POST /api/wallet/withdraw` - Вывести
- `GET /api/wallet/transactions` - История

### System
- `GET /health` - Health check
- `GET /api/stats` - Статистика сервера
- `GET /api/version` - Версия API

## 🛡️ Anti-Cheat System

Автоматическая проверка на читы:
- ❌ HP > maxHP
- ❌ Отрицательные значения
- ❌ Подозрительный рост валюты
- ❌ Нереалистичный прыжок уровня
- ❌ Неправильный размер инвентаря
- ❌ Некорректные ID предметов

## 🚀 Deployment на Railway

```bash
# 1. Create Railway project
# 2. Add MongoDB plugin
# 3. Set environment variables:
NODE_ENV=production
BOT_TOKEN=your_token
MONGODB_URI=your_mongo_uri
PORT=3000

# 4. Deploy
railway up
```

## 📝 Environment Variables

См. `.env.example` для всех переменных

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

## 📚 Documentation

- [API Documentation](./docs/API.md) - скоро
- [Database Schema](./docs/SCHEMA.md) - скоро
- [Configuration Guide](./docs/CONFIG.md) - скоро

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/new-feature`
2. Commit: `git commit -m 'Add new feature'`
3. Push: `git push origin feature/new-feature`
4. Open PR

## 📄 License

MIT

## ☎️ Support

Телеграм: [@rpgpixell](https://t.me/rpgpixell)
