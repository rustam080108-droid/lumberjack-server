const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = 3000;

// ========== БАЗА ДАННЫХ ==========
const db = new sqlite3.Database('./database.sqlite');

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
        userId INTEGER,
        amount INTEGER,
        method TEXT,
        paymentDetails TEXT,
        status TEXT DEFAULT 'pending',
        date TEXT,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdraw_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        amount INTEGER,
        card TEXT,
        fullCard TEXT,
        status TEXT DEFAULT 'pending',
        date TEXT,
        FOREIGN KEY(userId) REFERENCES users(id)
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

// ========== НАСТРОЙКА ТРАНСПОРТА ==========
function createTransporter(email, password) {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: email,
            pass: password
        },
        tls: {
            rejectUnauthorized: false
        }
    });
}

// ========== МАССИВ АККАУНТОВ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ==========
const GMAIL_ACCOUNTS = [
    { email: "rustamvelihanov95@gmail.com", password: process.env.GMAIL_PASSWORD_1 },

].filter(acc => acc.password); // Убираем аккаунты без паролей

// Текущий индекс аккаунта для ротации
let currentAccountIndex = 0;

// Функция для отправки письма с ротацией аккаунтов
async function sendEmailWithRotation(to, subject, htmlContent) {
    if (GMAIL_ACCOUNTS.length === 0) {
        console.error('❌ Нет настроенных аккаунтов Gmail');
        return { success: false, error: 'Нет доступных аккаунтов для отправки' };
    }

    const maxAttempts = GMAIL_ACCOUNTS.length;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const account = GMAIL_ACCOUNTS[currentAccountIndex];
        
        console.log(`📧 Попытка ${attempt + 1}: Отправка через ${account.email}`);
        
        try {
            const transporter = createTransporter(account.email, account.password);
            
            const mailOptions = {
                from: `LumberJack 🌲 <${account.email}>`,
                to: to,
                subject: subject,
                html: htmlContent
            };
            
            await transporter.sendMail(mailOptions);
            console.log(`✅ Письмо успешно отправлено через ${account.email}`);
            
            // Ротация аккаунта для следующего раза
            currentAccountIndex = (currentAccountIndex + 1) % GMAIL_ACCOUNTS.length;
            
            return { success: true, usedAccount: account.email };
            
        } catch (error) {
            console.log(`❌ Ошибка с аккаунтом ${account.email}: ${error.message}`);
            
            // Переключаем на следующий аккаунт
            currentAccountIndex = (currentAccountIndex + 1) % GMAIL_ACCOUNTS.length;
            
            // Если это была последняя попытка - возвращаем ошибку
            if (attempt === maxAttempts - 1) {
                return { success: false, error: error.message };
            }
            
            // Ждем 1 секунду перед следующей попыткой
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'lumberjack-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ========== ШАГ 1: ОТПРАВКА КОДА ==========
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.json({ success: false, error: 'Неверный формат email' });
    }
    
    // Генерируем 6-значный код
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 минут
    
    // Сохраняем в сессии
    req.session.tempEmail = email;
    req.session.tempCode = verificationCode;
    req.session.codeExpiry = codeExpiry;
    
    // Создаем красивое HTML-письмо
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a3a1a; color: white; padding: 30px; border-radius: 20px; border: 2px solid #8bc34a;">
            <h1 style="color: #8bc34a; text-align: center; font-size: 36px;">🌲 LumberJack</h1>
            <h2 style="text-align: center; color: white;">Код подтверждения</h2>
            
            <div style="background: #2a5a2a; padding: 30px; border-radius: 15px; text-align: center; margin: 20px 0; border: 1px solid #8bc34a;">
                <div style="font-size: 48px; font-weight: bold; letter-spacing: 10px; color: #8bc34a; background: #1e3a1e; padding: 20px; border-radius: 10px; display: inline-block;">
                    ${verificationCode}
                </div>
            </div>
            
            <p style="text-align: center; font-size: 18px;">Введите этот код на сайте для подтверждения регистрации.</p>
            
            <div style="background: #2a5a2a; padding: 15px; border-radius: 10px; margin: 20px 0;">
                <p style="text-align: center; margin: 0; color: #aaa;">Код действителен 10 минут</p>
                <p style="text-align: center; margin: 5px 0 0; color: #aaa;">Если вы не запрашивали код, проигнорируйте это письмо</p>
            </div>
            
            <hr style="border: 1px solid #2a5a2a; margin: 20px 0;">
            
            <p style="text-align: center; color: #8bc34a; font-size: 14px;">🌲 LumberJack - инвестируй в лес будущего</p>
        </div>
    `;
    
    // Отправляем письмо с ротацией аккаунтов
    const result = await sendEmailWithRotation(
        email,
        'Код подтверждения LumberJack',
        htmlContent
    );
    
    if (result.success) {
        console.log(`✅ Код ${verificationCode} отправлен на ${email} через ${result.usedAccount}`);
        
        // Дополнительно выводим код в консоль для отладки
        console.log(`📝 Код подтверждения для ${email}: ${verificationCode}`);
        
        res.json({ 
            success: true, 
            message: 'Код отправлен на почту',
            debug: process.env.NODE_ENV !== 'production' ? verificationCode : undefined
        });
    } else {
        console.error('❌ Все аккаунты не смогли отправить письмо:', result.error);
        res.json({ success: false, error: 'Ошибка отправки кода. Попробуйте позже.' });
    }
});

// ========== ШАГ 2: ПРОВЕРКА КОДА ==========
app.post('/api/verify-code', (req, res) => {
    const { code, password } = req.body;
    
    const email = req.session.tempEmail;
    const savedCode = req.session.tempCode;
    const expiry = req.session.codeExpiry;
    
    if (!email || !savedCode) {
        return res.json({ success: false, error: 'Сессия истекла. Начните заново.' });
    }
    
    if (new Date() > new Date(expiry)) {
        return res.json({ success: false, error: 'Код истек. Запросите новый.' });
    }
    
    if (code !== savedCode) {
        return res.json({ success: false, error: 'Неверный код' });
    }
    
    if (password.length < 6) {
        return res.json({ success: false, error: 'Пароль должен быть минимум 6 символов' });
    }
    
    // Проверяем, не занят ли email
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, existingUser) => {
        if (existingUser) {
            return res.json({ success: false, error: 'Email уже зарегистрирован' });
        }
        
        // Создаем пользователя
        db.get(`SELECT COUNT(*) as count FROM users`, (err, result) => {
            const userNumber = (result.count + 1).toString().padStart(4, '0');
            const userId = `USR${userNumber}`;
            const hashedPassword = bcrypt.hashSync(password, 10);
            const refCode = 'REF' + Math.floor(Math.random() * 1000000);
            const now = new Date().toISOString();
            
            db.run(
                `INSERT INTO users (userId, email, password, balance, totalFund, referrals, referralEarn, lastProfit, refCode, emailConfirmed, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, email, hashedPassword, 0, 0, 0, 0, now, refCode, 1, now],
                function(err) {
                    if (err) {
                        return res.json({ success: false, error: err.message });
                    }
                    
                    // Очищаем сессию
                    delete req.session.tempEmail;
                    delete req.session.tempCode;
                    delete req.session.codeExpiry;
                    
                    // Обновляем статистику
                    db.get(`SELECT COUNT(*) as count FROM users WHERE emailConfirmed = 1`, (err, statsResult) => {
                        db.run(`UPDATE stats SET totalUsers = ?, updatedAt = ? WHERE id = 1`, [statsResult.count, new Date().toISOString()]);
                    });
                    
                    res.json({ 
                        success: true, 
                        message: 'Регистрация успешна!',
                        userId: userId
                    });
                }
            );
        });
    });
});

// ========== ВХОД ==========
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (!user) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }
        
        if (!user.emailConfirmed) {
            return res.json({ success: false, error: 'Email не подтвержден' });
        }
        
        if (!bcrypt.compareSync(password, user.password)) {
            return res.json({ success: false, error: 'Неверный пароль' });
        }
        
        req.session.userId = user.id;
        req.session.user = {
            id: user.userId,
            email: user.email,
            balance: user.balance
        };
        
        res.json({ success: true, user: req.session.user });
    });
});

// ========== СТАТИСТИКА ==========
app.get('/api/stats', (req, res) => {
    db.get(`SELECT * FROM stats WHERE id = 1`, (err, stats) => {
        db.get(`SELECT SUM(balance) as totalBalance FROM users WHERE emailConfirmed = 1`, (err, balances) => {
            db.get(`SELECT SUM(totalFund) as totalInvest FROM users WHERE emailConfirmed = 1`, (err, invests) => {
                res.json({
                    totalUsers: stats ? stats.totalUsers : 0,
                    totalInvestments: invests ? invests.totalInvest || 0 : 0,
                    totalBalance: balances ? balances.totalBalance || 0 : 0,
                    updatedAt: stats ? stats.updatedAt : new Date().toISOString()
                });
            });
        });
    });
});

// ========== ПОЛУЧИТЬ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/api/user/:userId', (req, res) => {
    const userId = req.params.userId;
    
    db.get(`SELECT * FROM users WHERE userId = ?`, [userId], (err, user) => {
        if (err || !user) {
            return res.json({ success: false, error: 'User not found' });
        }

        db.all(`SELECT * FROM items WHERE userId = ?`, [user.id], (err, items) => {
            db.all(`SELECT * FROM investments WHERE userId = ?`, [user.id], (err, investments) => {
                db.all(`SELECT * FROM history WHERE userId = ? ORDER BY date DESC LIMIT 30`, [user.id], (err, history) => {
                    
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
                        items: items,
                        investments: investments,
                        history: history
                    });
                });
            });
        });
    });
});

// ========== ОБНОВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ==========
app.post('/api/user/update', (req, res) => {
    const { userId, balance, totalFund, referrals, referralEarn, lastProfit } = req.body;

    db.run(
        `UPDATE users SET balance = ?, totalFund = ?, referrals = ?, referralEarn = ?, lastProfit = ? WHERE userId = ?`,
        [balance, totalFund, referrals, referralEarn, lastProfit, userId],
        function(err) {
            res.json({ success: !err, error: err ? err.message : null });
        }
    );
});

// ========== ПОКУПКА ==========
app.post('/api/buy', (req, res) => {
    const { userId, itemId, itemName, itemIcon, price, profit } = req.body;
    const now = new Date().toISOString();

    db.get(`SELECT id FROM users WHERE userId = ?`, [userId], (err, user) => {
        if (!user) return res.json({ success: false, error: 'User not found' });

        db.run(`BEGIN TRANSACTION`);

        db.run(`INSERT INTO items (userId, itemId, purchaseDate) VALUES (?, ?, ?)`,
            [user.id, itemId, now]);

        db.run(`INSERT INTO investments (userId, itemId, itemName, itemIcon, amount, profit, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user.id, itemId, itemName, itemIcon, price, profit, now]);

        db.run(`INSERT INTO history (userId, type, amount, desc, date) VALUES (?, ?, ?, ?, ?)`,
            [user.id, 'purchase', price, `Куплен ${itemName}`, now]);

        db.run(`COMMIT`, (err) => {
            res.json({ success: !err, error: err ? err.message : null });
        });
    });
});

// ========== ЗАЯВКИ ==========
app.post('/api/deposit/create', (req, res) => {
    const { userId, amount, method } = req.body;
    const now = new Date().toISOString();

    db.run(`INSERT INTO deposit_requests (userId, amount, method, status, date) VALUES (?, ?, ?, ?, ?)`,
        [userId, amount, method, 'pending', now],
        function(err) {
            res.json({ 
                success: !err, 
                error: err ? err.message : null,
                requestId: this.lastID 
            });
        }
    );
});

app.get('/api/deposit/user/:userId', (req, res) => {
    const userId = req.params.userId;

    db.all(`SELECT * FROM deposit_requests WHERE userId = ? ORDER BY date DESC`, [userId], (err, requests) => {
        res.json({ success: true, requests: requests || [] });
    });
});

app.post('/api/deposit/update', (req, res) => {
    const { requestId, paymentDetails, status } = req.body;

    db.run(`UPDATE deposit_requests SET paymentDetails = ?, status = ? WHERE id = ?`,
        [paymentDetails, status, requestId],
        function(err) {
            res.json({ success: !err, error: err ? err.message : null });
        }
    );
});

app.post('/api/withdraw/create', (req, res) => {
    const { userId, amount, card, fullCard } = req.body;
    const now = new Date().toISOString();

    db.run(`INSERT INTO withdraw_requests (userId, amount, card, fullCard, status, date) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, amount, card, fullCard, 'pending', now],
        function(err) {
            res.json({ 
                success: !err, 
                error: err ? err.message : null,
                requestId: this.lastID 
            });
        }
    );
});

// ========== АДМИН ==========
app.get('/api/admin/requests', (req, res) => {
    db.all(`SELECT * FROM deposit_requests WHERE status IN ('pending', 'paid') ORDER BY date DESC`, (err, deposits) => {
        db.all(`SELECT * FROM withdraw_requests WHERE status = 'pending' ORDER BY date DESC`, (err, withdraws) => {
            res.json({
                deposits: deposits || [],
                withdraws: withdraws || []
            });
        });
    });
});

app.post('/api/admin/complete', (req, res) => {
    const { type, requestId, userId, amount } = req.body;

    db.run(`BEGIN TRANSACTION`);

    if (type === 'deposit') {
        db.run(`UPDATE deposit_requests SET status = 'completed' WHERE id = ?`, [requestId]);
        db.run(`UPDATE users SET balance = balance + ?, totalFund = totalFund + ? WHERE userId = ?`,
            [amount, amount, userId]);
        db.run(`INSERT INTO history (userId, type, amount, desc, date) VALUES (?, ?, ?, ?, ?)`,
            [userId, 'deposit', amount, 'Пополнение баланса', new Date().toISOString()]);
    } else if (type === 'withdraw') {
        db.run(`UPDATE withdraw_requests SET status = 'completed' WHERE id = ?`, [requestId]);
        db.run(`INSERT INTO history (userId, type, amount, desc, date) VALUES (?, ?, ?, ?, ?)`,
            [userId, 'withdraw', amount, 'Вывод средств', new Date().toISOString()]);
    }

    db.run(`COMMIT`, (err) => {
        res.json({ success: !err, error: err ? err.message : null });
    });
});

app.post('/api/admin/reject', (req, res) => {
    const { type, requestId } = req.body;

    if (type === 'deposit') {
        db.run(`UPDATE deposit_requests SET status = 'rejected' WHERE id = ?`, [requestId]);
    } else {
        db.run(`UPDATE withdraw_requests SET status = 'rejected' WHERE id = ?`, [requestId]);
    }

    res.json({ success: true });
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    db.get(`SELECT * FROM admin WHERE username = ?`, [username], (err, admin) => {
        if (!admin || !bcrypt.compareSync(password, admin.password)) {
            res.json({ success: false, error: 'Неверный логин или пароль' });
        } else {
            req.session.admin = true;
            res.json({ success: true });
        }
    });
});

app.get('/api/admin/check', (req, res) => {
    res.json({ success: !!req.session.admin });
});

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/admin/stats', (req, res) => {
    if (!req.session.admin) {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    db.get(`SELECT COUNT(*) as totalUsers FROM users`, (err, users) => {
        db.get(`SELECT COUNT(*) as pendingDeposits FROM deposit_requests WHERE status = 'pending'`, (err, pendingDeposits) => {
            db.get(`SELECT COUNT(*) as pendingWithdraws FROM withdraw_requests WHERE status = 'pending'`, (err, pendingWithdraws) => {
                db.get(`SELECT SUM(balance) as totalBalance FROM users`, (err, totalBalance) => {
                    
                    res.json({
                        success: true,
                        stats: {
                            totalUsers: users ? users.totalUsers : 0,
                            pendingDeposits: pendingDeposits ? pendingDeposits.pendingDeposits : 0,
                            pendingWithdraws: pendingWithdraws ? pendingWithdraws.pendingWithdraws : 0,
                            totalBalance: totalBalance ? totalBalance.totalBalance || 0 : 0
                        }
                    });
                });
            });
        });
    });
});

// ========== ЗАПУСК СЕРВЕРА ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
    console.log(`📧 Загружено ${GMAIL_ACCOUNTS.length} аккаунтов Gmail`);
    if (GMAIL_ACCOUNTS.length > 0) {
        GMAIL_ACCOUNTS.forEach((acc, i) => {
            console.log(`   ${i+1}. ${acc.email} (пароль скрыт)`);
        });
    } else {
        console.log(`⚠️ Аккаунты Gmail не настроены! Добавьте их в .env файл.`);
    }
});