const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');                // вместо sqlite3
const PgSession = require('connect-pg-simple')(session);
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== ПОДКЛЮЧЕНИЕ К POSTGRESQL ==========
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Проверка подключения (можно убрать)
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Ошибка подключения к БД:', err.stack);
    }
    console.log('✅ Подключение к PostgreSQL установлено');
    release();
});

// ========== СОЗДАНИЕ ТАБЛИЦ (ОДИН РАЗ ПРИ ЗАПУСКЕ) ==========
(async () => {
    try {
        // Таблица пользователей
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                "userId" TEXT UNIQUE,
                email TEXT UNIQUE,
                password TEXT,
                "verificationCode" TEXT,
                "codeExpiry" TEXT,
                balance INTEGER DEFAULT 0,
                "totalFund" INTEGER DEFAULT 0,
                referrals INTEGER DEFAULT 0,
                "referralEarn" INTEGER DEFAULT 0,
                "lastProfit" TEXT,
                "refCode" TEXT UNIQUE,
                "emailConfirmed" BOOLEAN DEFAULT FALSE,
                "createdAt" TEXT
            )
        `);

        // Таблица статистики
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                "totalUsers" INTEGER DEFAULT 0,
                "totalInvestments" INTEGER DEFAULT 0,
                "updatedAt" TEXT
            )
        `);

        // Таблица предметов (items) – связь с users.id
        await pool.query(`
            CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
                "itemId" INTEGER,
                "purchaseDate" TEXT
            )
        `);

        // Таблица инвестиций
        await pool.query(`
            CREATE TABLE IF NOT EXISTS investments (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
                "itemId" INTEGER,
                "itemName" TEXT,
                "itemIcon" TEXT,
                amount INTEGER,
                profit REAL,
                date TEXT
            )
        `);

        // Таблица истории
        await pool.query(`
            CREATE TABLE IF NOT EXISTS history (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type TEXT,
                amount INTEGER,
                desc TEXT,
                date TEXT,
                status TEXT DEFAULT 'completed'
            )
        `);

        // Таблица заявок на пополнение
        await pool.query(`
            CREATE TABLE IF NOT EXISTS deposit_requests (
                id SERIAL PRIMARY KEY,
                "userId" TEXT,
                amount INTEGER,
                method TEXT,
                "paymentDetails" TEXT,
                status TEXT DEFAULT 'pending',
                date TEXT
            )
        `);

        // Таблица заявок на вывод
        await pool.query(`
            CREATE TABLE IF NOT EXISTS withdraw_requests (
                id SERIAL PRIMARY KEY,
                "userId" TEXT,
                amount INTEGER,
                card TEXT,
                "fullCard" TEXT,
                status TEXT DEFAULT 'pending',
                date TEXT
            )
        `);

        // Таблица администратора
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT
            )
        `);

        // Добавляем админа по умолчанию, если его нет
        const adminPass = bcrypt.hashSync('admin123', 10);
        await pool.query(
            `INSERT INTO admin (username, password) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING`,
            ['admin', adminPass]
        );

        // Инициализация статистики
        await pool.query(
            `INSERT INTO stats (id, "totalUsers", "totalInvestments", "updatedAt") 
             VALUES (1, 0, 0, $1) ON CONFLICT (id) DO NOTHING`,
            [new Date().toISOString()]
        );

        console.log('✅ Таблицы созданы/проверены');
    } catch (err) {
        console.error('❌ Ошибка создания таблиц:', err);
    }
})();

// ========== ИНИЦИАЛИЗАЦИЯ RESEND ==========
const resend = new Resend(process.env.RESEND_API_KEY);

// ========== НАСТРОЙКА СЕССИЙ (храним в PostgreSQL) ==========
app.use(express.json());
app.use(express.static('public'));

const sessionStore = new PgSession({
    pool,
    tableName: 'session'   // таблица создаётся автоматически
});

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'lumberjack-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    },
    proxy: process.env.NODE_ENV === 'production'
}));

// ========== ФУНКЦИЯ ОТПРАВКИ EMAIL ==========
async function sendVerificationEmail(toEmail, code) {
    try {
        const { data, error } = await resend.emails.send({
            from: 'LumberJack <onboarding@resend.dev>',
            to: [toEmail],
            subject: 'Код подтверждения LumberJack',
            html: `
                <div style="font-family: Arial; max-width: 600px; margin: 0 auto; background: #1a3a1a; color: white; padding: 30px; border-radius: 20px;">
                    <h1 style="color: #8bc34a; text-align: center;">🌲 LumberJack</h1>
                    <div style="font-size: 48px; text-align: center; padding: 30px; background: #2a5a2a; border-radius: 15px;">
                        ${code}
                    </div>
                    <p style="text-align: center;">Код действителен 10 минут</p>
                </div>
            `
        });
        return { success: true };
    } catch (error) {
        console.error('Ошибка отправки email:', error);
        return { success: false };
    }
}

// ========== API: ОТПРАВКА КОДА ==========
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.json({ success: false, error: 'Неверный email' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.tempEmail = email;
    req.session.tempCode = code;
    req.session.codeExpiry = Date.now() + 10 * 60 * 1000;

    const result = await sendVerificationEmail(email, code);

    if (result.success) {
        res.json({ success: true, message: 'Код отправлен' });
    } else {
        res.json({ success: false, error: 'Ошибка отправки' });
    }
});

// ========== API: ПРОВЕРКА КОДА ==========
app.post('/api/verify-code', async (req, res) => {
    const { code, password } = req.body;

    if (!req.session.tempEmail || !req.session.tempCode) {
        return res.json({ success: false, error: 'Сессия истекла' });
    }

    if (Date.now() > req.session.codeExpiry) {
        return res.json({ success: false, error: 'Код истек' });
    }

    if (code !== req.session.tempCode) {
        return res.json({ success: false, error: 'Неверный код' });
    }

    if (password.length < 6) {
        return res.json({ success: false, error: 'Пароль слишком короткий' });
    }

    const email = req.session.tempEmail;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = 'USR' + Math.floor(1000 + Math.random() * 9000);
    const refCode = 'REF' + Math.floor(100000 + Math.random() * 900000);
    const now = new Date().toISOString();

    try {
        await pool.query(
            `INSERT INTO users ("userId", email, password, balance, "totalFund", referrals, "referralEarn", "lastProfit", "refCode", "emailConfirmed", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [userId, email, hashedPassword, 1000, 0, 0, 0, now, refCode, true, now]
        );

        delete req.session.tempEmail;
        delete req.session.tempCode;

        // Обновим статистику
        const total = await pool.query(`SELECT COUNT(*) as count FROM users WHERE "emailConfirmed" = true`);
        await pool.query(`UPDATE stats SET "totalUsers" = $1, "updatedAt" = $2 WHERE id = 1`, [total.rows[0].count, now]);

        res.json({ success: true, userId });
    } catch (err) {
        if (err.constraint === 'users_email_key') {
            res.json({ success: false, error: 'Email уже используется' });
        } else {
            console.error(err);
            res.json({ success: false, error: 'Ошибка базы данных' });
        }
    }
});

// ========== API: ВХОД ==========
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
        const user = result.rows[0];
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.json({ success: false, error: 'Неверный email или пароль' });
        }

        res.json({
            success: true,
            user: {
                id: user.userId,
                email: user.email,
                balance: user.balance
            }
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: 'Ошибка сервера' });
    }
});

// ========== API: ПОЛУЧИТЬ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/api/user/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const userRes = await pool.query(`SELECT * FROM users WHERE "userId" = $1`, [userId]);
        const user = userRes.rows[0];
        if (!user) return res.json({ success: false });

        const investRes = await pool.query(`SELECT * FROM investments WHERE "userId" = $1`, [user.id]);
        const historyRes = await pool.query(`SELECT * FROM history WHERE "userId" = $1 ORDER BY date DESC`, [user.id]);

        res.json({
            success: true,
            user: {
                id: user.userId,
                email: user.email,
                balance: user.balance,
                totalFund: user.totalFund,
                referrals: user.referrals,
                referralEarn: user.referralEarn,
                lastProfit: user.lastProfit,
                refCode: user.refCode
            },
            investments: investRes.rows,
            history: historyRes.rows
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: 'Ошибка сервера' });
    }
});

// ========== API: СТАТИСТИКА ==========
app.get('/api/stats', async (req, res) => {
    try {
        const users = await pool.query(`SELECT COUNT(*) as "totalUsers" FROM users WHERE "emailConfirmed" = true`);
        const invests = await pool.query(`SELECT SUM("totalFund") as "totalInvest" FROM users`);
        res.json({
            totalUsers: users.rows[0]?.totalUsers || 0,
            totalInvestments: invests.rows[0]?.totalInvest || 0,
            updatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error(err);
        res.json({ totalUsers: 0, totalInvestments: 0, updatedAt: new Date().toISOString() });
    }
});

// ========== API: ПОКУПКА ==========
app.post('/api/buy', async (req, res) => {
    const { userId, itemId, itemName, itemIcon, price, profit } = req.body;
    const now = new Date().toISOString();

    try {
        const userRes = await pool.query(`SELECT id FROM users WHERE "userId" = $1`, [userId]);
        if (!userRes.rows[0]) return res.json({ success: false, error: 'User not found' });

        const userIdNum = userRes.rows[0].id;

        await pool.query('BEGIN');

        await pool.query(
            `INSERT INTO investments ("userId", "itemId", "itemName", "itemIcon", amount, profit, date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userIdNum, itemId, itemName, itemIcon, price, profit, now]
        );

        await pool.query(
            `INSERT INTO history ("userId", type, amount, desc, date) VALUES ($1, $2, $3, $4, $5)`,
            [userIdNum, 'purchase', price, `Куплен ${itemName}`, now]
        );

        await pool.query(
            `UPDATE users SET balance = balance - $1, "totalFund" = "totalFund" + $1 WHERE "userId" = $2`,
            [price, userId]
        );

        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

// ========== API: ОБНОВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ==========
app.post('/api/user/update', async (req, res) => {
    const { userId, balance, totalFund, lastProfit } = req.body;

    try {
        await pool.query(
            `UPDATE users SET balance = $1, "totalFund" = $2, "lastProfit" = $3 WHERE "userId" = $4`,
            [balance, totalFund, lastProfit, userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

// ========== API: СОЗДАТЬ ЗАЯВКУ НА ПОПОЛНЕНИЕ ==========
app.post('/api/deposit/create', async (req, res) => {
    const { userId, amount, method } = req.body;

    console.log('📝 Получен запрос на пополнение:', { userId, amount, method });

    if (!userId || !amount) {
        return res.json({ success: false, error: 'Не все данные переданы' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO deposit_requests ("userId", amount, method, status, date) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [userId, amount, method || 'card', 'pending', new Date().toISOString()]
        );
        const requestId = result.rows[0].id;
        console.log('✅ Заявка создана с ID:', requestId);
        res.json({ success: true, requestId });
    } catch (err) {
        console.error('❌ Ошибка при создании заявки:', err);
        res.json({ success: false, error: err.message });
    }
});

// ========== API: ПОЛУЧИТЬ ЗАЯВКИ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/api/deposit/user/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const result = await pool.query(
            `SELECT * FROM deposit_requests WHERE "userId" = $1 ORDER BY date DESC`,
            [userId]
        );
        res.json({ requests: result.rows });
    } catch (err) {
        console.error('Ошибка при получении заявок:', err);
        res.json({ requests: [] });
    }
});

// ========== API: ОБНОВИТЬ ЗАЯВКУ (ДОБАВИТЬ РЕКВИЗИТЫ) ==========
app.post('/api/deposit/update', async (req, res) => {
    const { requestId, paymentDetails, status } = req.body;

    try {
        await pool.query(
            `UPDATE deposit_requests SET "paymentDetails" = $1, status = $2 WHERE id = $3`,
            [paymentDetails, status || 'pending', requestId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка при обновлении заявки:', err);
        res.json({ success: false, error: err.message });
    }
});

// ========== API: СОЗДАТЬ ЗАЯВКУ НА ВЫВОД ==========
app.post('/api/withdraw/create', async (req, res) => {
    const { userId, amount, card } = req.body;

    if (!userId || !amount || !card) {
        return res.json({ success: false, error: 'Не все данные переданы' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO withdraw_requests ("userId", amount, card, status, date) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [userId, amount, card, 'pending', new Date().toISOString()]
        );
        res.json({ success: true, requestId: result.rows[0].id });
    } catch (err) {
        console.error('Ошибка при создании заявки на вывод:', err);
        res.json({ success: false, error: err.message });
    }
});

// ========== API: АДМИН - ВХОД ==========
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query(`SELECT * FROM admin WHERE username = $1`, [username]);
        const admin = result.rows[0];
        if (admin && bcrypt.compareSync(password, admin.password)) {
            req.session.admin = true;
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Неверный логин или пароль' });
        }
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: 'Ошибка сервера' });
    }
});

// ========== API: АДМИН - ПРОВЕРКА ==========
app.get('/api/admin/check', (req, res) => {
    res.json({ success: !!req.session.admin });
});

// ========== API: АДМИН - ВЫХОД ==========
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ========== API: АДМИН - ПОЛУЧИТЬ ЗАЯВКИ ==========
app.get('/api/admin/requests', async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, error: 'Не авторизован' });

    try {
        const deposits = await pool.query(`SELECT * FROM deposit_requests ORDER BY date DESC`);
        const withdraws = await pool.query(`SELECT * FROM withdraw_requests ORDER BY date DESC`);
        console.log(`📊 Найдено заявок: ${deposits.rows.length}, выводов: ${withdraws.rows.length}`);
        res.json({ deposits: deposits.rows, withdraws: withdraws.rows });
    } catch (err) {
        console.error('Ошибка получения заявок:', err);
        res.json({ deposits: [], withdraws: [] });
    }
});

// ========== API: АДМИН - ЗАВЕРШИТЬ ЗАЯВКУ ==========
app.post('/api/admin/complete', async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, error: 'Не авторизован' });

    const { type, requestId, userId, amount } = req.body;

    try {
        await pool.query('BEGIN');

        if (type === 'deposit') {
            await pool.query(`UPDATE deposit_requests SET status = 'completed' WHERE id = $1`, [requestId]);
            await pool.query(`UPDATE users SET balance = balance + $1, "totalFund" = "totalFund" + $1 WHERE "userId" = $2`, [amount, userId]);
        } else {
            await pool.query(`UPDATE withdraw_requests SET status = 'completed' WHERE id = $1`, [requestId]);
            await pool.query(`UPDATE users SET balance = balance - $1 WHERE "userId" = $2`, [amount, userId]);
        }

        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

// ========== API: АДМИН - ОТКЛОНИТЬ ЗАЯВКУ ==========
app.post('/api/admin/reject', async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, error: 'Не авторизован' });

    const { type, requestId } = req.body;

    try {
        if (type === 'deposit') {
            await pool.query(`UPDATE deposit_requests SET status = 'rejected' WHERE id = $1`, [requestId]);
        } else {
            await pool.query(`UPDATE withdraw_requests SET status = 'rejected' WHERE id = $1`, [requestId]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

// ========== API: АДМИН - СТАТИСТИКА ==========
app.get('/api/admin/stats', async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, error: 'Не авторизован' });

    try {
        const users = await pool.query(`SELECT COUNT(*) as "totalUsers" FROM users`);
        const deposits = await pool.query(`SELECT COUNT(*) as "pendingDeposits" FROM deposit_requests WHERE status = 'pending'`);
        const withdraws = await pool.query(`SELECT COUNT(*) as "pendingWithdraws" FROM withdraw_requests WHERE status = 'pending'`);
        const balances = await pool.query(`SELECT SUM(balance) as "totalBalance" FROM users`);

        res.json({
            totalUsers: users.rows[0]?.totalUsers || 0,
            pendingDeposits: deposits.rows[0]?.pendingDeposits || 0,
            pendingWithdraws: withdraws.rows[0]?.pendingWithdraws || 0,
            totalBalance: balances.rows[0]?.totalBalance || 0
        });
    } catch (err) {
        console.error(err);
        res.json({ totalUsers: 0, pendingDeposits: 0, pendingWithdraws: 0, totalBalance: 0 });
    }
});

// ========== ЗАПУСК ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});