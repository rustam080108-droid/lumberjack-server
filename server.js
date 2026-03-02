const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const { v4: uuidv4 } = require('uuid');
const SQLiteStore = require('connect-sqlite3')(session);
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== ИНИЦИАЛИЗАЦИЯ RESEND ==========
const resend = new Resend(process.env.RESEND_API_KEY);

// ========== БАЗА ДАННЫХ ==========
const db = new sqlite3.Database('./data/database.sqlite');

// Создание таблиц
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        verificationCode TEXT,
        codeExpiry TEXT,
        balance INTEGER DEFAULT 0,
        totalFund INTEGER DEFAULT 0,
        referrals INTEGER DEFAULT 0,
        referralEarn INTEGER DEFAULT 0,
        lastProfit TEXT,
        refCode TEXT UNIQUE,
        emailConfirmed BOOLEAN DEFAULT 0,
        createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        totalUsers INTEGER DEFAULT 0,
        totalInvestments INTEGER DEFAULT 0,
        updatedAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        itemId INTEGER,
        purchaseDate TEXT,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS investments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        itemId INTEGER,
        itemName TEXT,
        itemIcon TEXT,
        amount INTEGER,
        profit REAL,
        date TEXT,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        type TEXT,
        amount INTEGER,
        desc TEXT,
        date TEXT,
        status TEXT DEFAULT 'completed',
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS deposit_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        amount INTEGER,
        method TEXT,
        paymentDetails TEXT,
        status TEXT DEFAULT 'pending',
        date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdraw_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        amount INTEGER,
        card TEXT,
        fullCard TEXT,
        status TEXT DEFAULT 'pending',
        date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    const adminPass = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO admin (username, password) VALUES (?, ?)`, ['admin', adminPass]);
    db.run(`INSERT OR IGNORE INTO stats (id, totalUsers, totalInvestments, updatedAt) VALUES (1, 0, 0, ?)`, [new Date().toISOString()]);
});

// ========== НАСТРОЙКА СЕССИЙ ==========
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite' }),
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
app.post('/api/verify-code', (req, res) => {
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
    
    db.run(
        `INSERT INTO users (userId, email, password, balance, totalFund, referrals, referralEarn, lastProfit, refCode, emailConfirmed, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, email, hashedPassword, 1000, 0, 0, 0, now, refCode, 1, now],
        function(err) {
            if (err) {
                res.json({ success: false, error: 'Email уже используется' });
            } else {
                delete req.session.tempEmail;
                delete req.session.tempCode;
                res.json({ success: true, userId });
            }
        }
    );
});

// ========== API: ВХОД ==========
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
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
    });
});

// ========== API: ПОЛУЧИТЬ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/api/user/:userId', (req, res) => {
    const userId = req.params.userId;
    
    db.get(`SELECT * FROM users WHERE userId = ?`, [userId], (err, user) => {
        if (!user) return res.json({ success: false });
        
        db.all(`SELECT * FROM investments WHERE userId = ?`, [user.id], (err, investments) => {
            db.all(`SELECT * FROM history WHERE userId = ? ORDER BY date DESC`, [user.id], (err, history) => {
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
                    investments: investments || [],
                    history: history || []
                });
            });
        });
    });
});

// ========== API: СТАТИСТИКА ==========
app.get('/api/stats', (req, res) => {
    db.get(`SELECT COUNT(*) as totalUsers FROM users WHERE emailConfirmed = 1`, (err, users) => {
        db.get(`SELECT SUM(totalFund) as totalInvest FROM users`, (err, invests) => {
            res.json({
                totalUsers: users?.totalUsers || 0,
                totalInvestments: invests?.totalInvest || 0,
                updatedAt: new Date().toISOString()
            });
        });
    });
});

// ========== API: ПОКУПКА ==========
app.post('/api/buy', (req, res) => {
    const { userId, itemId, itemName, itemIcon, price, profit } = req.body;
    const now = new Date().toISOString();

    db.get(`SELECT id FROM users WHERE userId = ?`, [userId], (err, user) => {
        if (!user) return res.json({ success: false, error: 'User not found' });

        db.run(`INSERT INTO investments (userId, itemId, itemName, itemIcon, amount, profit, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user.id, itemId, itemName, itemIcon, price, profit, now]);
        
        db.run(`INSERT INTO history (userId, type, amount, desc, date) VALUES (?, ?, ?, ?, ?)`,
            [user.id, 'purchase', price, `Куплен ${itemName}`, now]);
        
        db.run(`UPDATE users SET balance = balance - ?, totalFund = totalFund + ? WHERE userId = ?`,
            [price, price, userId], (err) => {
                res.json({ success: !err });
            });
    });
});

// ========== API: ОБНОВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ==========
app.post('/api/user/update', (req, res) => {
    const { userId, balance, totalFund, lastProfit } = req.body;
    
    db.run(
        `UPDATE users SET balance = ?, totalFund = ?, lastProfit = ? WHERE userId = ?`,
        [balance, totalFund, lastProfit, userId],
        (err) => res.json({ success: !err })
    );
});

// ========== API: СОЗДАТЬ ЗАЯВКУ НА ПОПОЛНЕНИЕ ==========
app.post('/api/deposit/create', (req, res) => {
    const { userId, amount, method } = req.body;
    
    console.log('📝 Получен запрос на пополнение:', { userId, amount, method });
    
    if (!userId || !amount) {
        return res.json({ success: false, error: 'Не все данные переданы' });
    }
    
    db.run(
        `INSERT INTO deposit_requests (userId, amount, method, status, date) VALUES (?, ?, ?, ?, ?)`,
        [userId, amount, method || 'card', 'pending', new Date().toISOString()],
        function(err) {
            if (err) {
                console.error('❌ Ошибка при создании заявки:', err);
                res.json({ success: false, error: err.message });
            } else {
                console.log('✅ Заявка создана с ID:', this.lastID);
                res.json({ success: true, requestId: this.lastID });
            }
        }
    );
});

// ========== API: ПОЛУЧИТЬ ЗАЯВКИ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/api/deposit/user/:userId', (req, res) => {
    const userId = req.params.userId;
    
    db.all(`SELECT * FROM deposit_requests WHERE userId = ? ORDER BY date DESC`, [userId], (err, requests) => {
        if (err) {
            console.error('Ошибка при получении заявок:', err);
            res.json({ requests: [] });
        } else {
            res.json({ requests: requests || [] });
        }
    });
});

// ========== API: ОБНОВИТЬ ЗАЯВКУ (ДОБАВИТЬ РЕКВИЗИТЫ) ==========
app.post('/api/deposit/update', (req, res) => {
    const { requestId, paymentDetails, status } = req.body;
    
    db.run(
        `UPDATE deposit_requests SET paymentDetails = ?, status = ? WHERE id = ?`,
        [paymentDetails, status || 'pending', requestId],
        function(err) {
            if (err) {
                console.error('Ошибка при обновлении заявки:', err);
                res.json({ success: false, error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

// ========== API: СОЗДАТЬ ЗАЯВКУ НА ВЫВОД ==========
app.post('/api/withdraw/create', (req, res) => {
    const { userId, amount, card } = req.body;
    
    if (!userId || !amount || !card) {
        return res.json({ success: false, error: 'Не все данные переданы' });
    }
    
    db.run(
        `INSERT INTO withdraw_requests (userId, amount, card, status, date) VALUES (?, ?, ?, ?, ?)`,
        [userId, amount, card, 'pending', new Date().toISOString()],
        function(err) {
            if (err) {
                console.error('Ошибка при создании заявки на вывод:', err);
                res.json({ success: false, error: err.message });
            } else {
                res.json({ success: true, requestId: this.lastID });
            }
        }
    );
});

// ========== API: АДМИН - ВХОД ==========
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get(`SELECT * FROM admin WHERE username = ?`, [username], (err, admin) => {
        if (admin && bcrypt.compareSync(password, admin.password)) {
            req.session.admin = true;
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Неверный логин или пароль' });
        }
    });
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
app.get('/api/admin/requests', (req, res) => {
    if (!req.session.admin) return res.json({ success: false, error: 'Не авторизован' });
    
    db.all(`SELECT * FROM deposit_requests WHERE status IN ('pending', 'paid') ORDER BY date DESC`, (err, deposits) => {
        db.all(`SELECT * FROM withdraw_requests WHERE status = 'pending' ORDER BY date DESC`, (err, withdraws) => {
            res.json({ 
                deposits: deposits || [], 
                withdraws: withdraws || [] 
            });
        });
    });
});

// ========== API: АДМИН - ЗАВЕРШИТЬ ЗАЯВКУ ==========
app.post('/api/admin/complete', (req, res) => {
    if (!req.session.admin) return res.json({ success: false, error: 'Не авторизован' });
    
    const { type, requestId, userId, amount } = req.body;
    
    if (type === 'deposit') {
        db.run(`UPDATE deposit_requests SET status = 'completed' WHERE id = ?`, [requestId]);
        db.run(`UPDATE users SET balance = balance + ?, totalFund = totalFund + ? WHERE userId = ?`,
            [amount, amount, userId]);
    } else {
        db.run(`UPDATE withdraw_requests SET status = 'completed' WHERE id = ?`, [requestId]);
        db.run(`UPDATE users SET balance = balance - ? WHERE userId = ?`,
            [amount, userId]);
    }
    
    res.json({ success: true });
});

// ========== API: АДМИН - ОТКЛОНИТЬ ЗАЯВКУ ==========
app.post('/api/admin/reject', (req, res) => {
    if (!req.session.admin) return res.json({ success: false, error: 'Не авторизован' });
    
    const { type, requestId } = req.body;
    
    if (type === 'deposit') {
        db.run(`UPDATE deposit_requests SET status = 'rejected' WHERE id = ?`, [requestId]);
    } else {
        db.run(`UPDATE withdraw_requests SET status = 'rejected' WHERE id = ?`, [requestId]);
    }
    
    res.json({ success: true });
});

// ========== API: АДМИН - СТАТИСТИКА ==========
app.get('/api/admin/stats', (req, res) => {
    if (!req.session.admin) return res.json({ success: false, error: 'Не авторизован' });
    
    db.get(`SELECT COUNT(*) as totalUsers FROM users`, (err, users) => {
        db.get(`SELECT COUNT(*) as pendingDeposits FROM deposit_requests WHERE status = 'pending'`, (err, deposits) => {
            db.get(`SELECT COUNT(*) as pendingWithdraws FROM withdraw_requests WHERE status = 'pending'`, (err, withdraws) => {
                db.get(`SELECT SUM(balance) as totalBalance FROM users`, (err, balances) => {
                    res.json({
                        totalUsers: users?.totalUsers || 0,
                        pendingDeposits: deposits?.pendingDeposits || 0,
                        pendingWithdraws: withdraws?.pendingWithdraws || 0,
                        totalBalance: balances?.totalBalance || 0
                    });
                });
            });
        });
    });
});

// ========== ЗАПУСК ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});