// ========== КОШЕЛЕК ==========

let currentRequestId = null;
let checkInterval = null;

// Пополнение
async function createDeposit() {
    if (!userId) {
        showAuthModal();
        showInfo('Для пополнения необходимо войти');
        return;
    }
    
    const amount = parseInt(document.getElementById('depositSum').value);
    
    if (amount < 100) {
        showError('Минимальная сумма 100 ₽');
        return;
    }
    
    const response = await fetch('/api/deposit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount, method: 'card' })
    });
    
    const data = await response.json();
    
    if (data.success) {
        hideModal('Deposit');
        currentRequestId = data.requestId;
        openChat();
        showSuccess('Заявка создана!');
    }
}

// Вывод
async function createWithdraw() {
    if (!userId) {
        showAuthModal();
        showInfo('Для вывода необходимо войти');
        return;
    }
    
    const amount = parseInt(document.getElementById('withdrawSum').value);
    const card = document.getElementById('cardNumber').value.replace(/\s/g, '');
    
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
        body: JSON.stringify({ userId, amount, card })
    });
    
    const data = await response.json();
    
    if (data.success) {
        userData.balance -= amount;
        
        await fetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                balance: userData.balance,
                totalFund: userData.totalFund,
                lastProfit: userData.lastProfit
            })
        });
        
        updateUI();
        hideModal('Withdraw');
        showSuccess('Заявка создана! Ожидайте обработки.');
    }
}

// Чат с админом
function openChat() {
    const chat = document.getElementById('chatMessages');
    chat.innerHTML = `<p>⏳ Заявка #${currentRequestId} создана. Ожидайте реквизиты...</p>`;
    showModal('Chat');
    
    if (checkInterval) clearInterval(checkInterval);
    
    checkInterval = setInterval(async () => {
        const response = await fetch(`/api/deposit/user/${userId}`);
        const data = await response.json();
        const request = data.requests?.find(r => r.id === currentRequestId);
        
        if (request?.paymentDetails) {
            chat.innerHTML += `<p>💬 Админ: ${request.paymentDetails}</p>`;
            document.getElementById('paymentInfo').innerHTML = request.paymentDetails;
            document.getElementById('payBtn').style.display = 'block';
            clearInterval(checkInterval);
        }
    }, 3000);
}

function confirmPayment() {
    showSuccess('Ожидайте зачисления средств');
    document.getElementById('payBtn').style.display = 'none';
}

// Экспорт
window.createDeposit = createDeposit;
window.createWithdraw = createWithdraw;
window.confirmPayment = confirmPayment;