const dotenv = require('dotenv')
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db/index.js')

dotenv.config()

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const BOT_ID = 7908962785

const syncUser = (user, groupId) => {
  if (!user || !groupId) return;

  db.prepare(`
    INSERT INTO users (id, username)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username
  `).run(
    user.id,
    user.username || null,
  );

  db.prepare(`
    INSERT OR IGNORE INTO group_users (user_id, group_id)
    VALUES (?, ?)
  `).run(user.id, groupId);
}

bot.setMyCommands([
  { command: '/start', description: 'Синхронизировать' },
  { command: '/all', description: 'Позвать всех' },
]);

bot.onText('/start', (msg) => {
  const chatId = msg.chat.id

  if (msg.from && msg.chat.type !== 'private') {
    syncUser(msg.from, chatId)
    bot.sendMessage(chatId, `Кожаный @${msg.from.username || msg.from.first_name} синхронизирован`);
  } else {
    bot.sendMessage(chatId, `Кожаный добавь меня в группу. Не пытайся писать в лс. Я тебе не дам!`);
  }
})


bot.onText('/all', (msg) => {
  const chatId = msg.chat.id

  const rows = db.prepare(`
    SELECT u.username
    FROM users u
    JOIN group_users gu ON gu.user_id = u.id
    WHERE gu.group_id = ? AND u.username IS NOT NULL
  `).all(chatId);

  if (rows.length === 0) {
    bot.sendMessage(chatId, '❌ Не найдено ни одного кожаного с username или участники не синхронизированы.');
    return;
  }

  const mentions = rows.map(row => `@${row.username}`).join(' ');
  bot.sendMessage(chatId, `📣 Собр:\n${mentions}`);
})

bot.on('new_chat_members', (msg) => {
  const chatId = msg.chat.id;
  const chatTitle = msg.chat.title

  msg.new_chat_members.forEach((user) => {
    if (user.id === BOT_ID) {
      db.prepare('INSERT OR IGNORE INTO groups (id, title) VALUES (?, ?)').run(chatId, chatTitle);

      bot.sendMessage(chatId, 'Я в деле, кожаные! Готов звать всех. Убедитесь что у всех есть username. Пропиши /start, чтобы я синхронизировал тебя.');
    } else {
      syncUser(user, chatId)
      bot.sendMessage(chatId, `Кожаный @${user.username || user.first_name} зашел в чат. Синхронизировал его.`);
    }
  })
})
