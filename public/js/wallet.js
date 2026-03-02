// ========== КОШЕЛЕК (ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ВЕРСИЯ) ==========

let currentRequestId = null;
let checkInterval = null;

// Пополнение
async function createDeposit() {
    // БЕРЁМ userId ИЗ ГЛОБАЛЬНОЙ ПЕРЕМЕННОЙ (она должна быть определена в main.js)
    if (typeof userId === 'undefined' || !userId) {
        showAuthModal();
        showInfo('Для пополнения необходимо войти');
        return;
    }
    
    const amountInput = document.getElementById('depositSum');
    if (!amountInput) {
        showError('Поле суммы не найдено');
        return;
    }
    
    const amount = parseInt(amountInput.value);
    
    if (isNaN(amount) || amount < 100) {
        showError('Минимальная сумма 100 ₽');
        return;
    }
    
    console.log('📝 Создание заявки на пополнение:', { userId, amount });
    
    try {
        const response = await fetch('/api/deposit/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId: userId, 
                amount: amount, 
                method: 'card' 
            })
        });
        
        const data = await response.json();
        console.log('✅ Ответ сервера:', data);
        
        if (data.success) {
            hideModal('Deposit');
            currentRequestId = data.requestId;
            openChat();
            showSuccess('Заявка создана!');
            
            // ОЧИЩАЕМ поле ввода после успеха
            amountInput.value = 1000;
        } else {
            showError('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('❌ Ошибка при создании заявки:', error);
        showError('Ошибка соединения с сервером');
    }
}

// Вывод
async function createWithdraw() {
    if (!userId) {
        showAuthModal();
        showInfo('Для вывода необходимо войти');
        return;
    }
    
    const amount = parseInt(document.getElementById('withdrawSum')?.value);
    const card = document.getElementById('cardNumber')?.value.replace(/\s/g, '');
    
    if (isNaN(amount) || amount < 100 || amount > 50000) {
        showError('Сумма от 100 до 50000 ₽');
        return;
    }
    
    if (!card || card.length < 16) {
        showError('Введите номер карты');
        return;
    }
    
    if (amount > userData.balance) {
        showError('Недостаточно средств');
        return;
    }
    
    console.log('📝 Создание заявки на вывод:', { userId, amount, card });
    
    try {
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
        } else {
            showError('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('❌ Ошибка при создании заявки на вывод:', error);
        showError('Ошибка соединения с сервером');
    }
}

// Чат с админом
function openChat() {
    const chat = document.getElementById('chatMessages');
    if (!chat) return;
    
    chat.innerHTML = `<p>⏳ Заявка #${currentRequestId} создана. Ожидайте реквизиты...</p>`;
    showModal('Chat');
    
    if (checkInterval) clearInterval(checkInterval);
    
    checkInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/deposit/user/${userId}`);
            const data = await response.json();
            const request = data.requests?.find(r => r.id === currentRequestId);
            
            if (request?.paymentDetails) {
                chat.innerHTML += `<p>💬 Админ: ${request.paymentDetails}</p>`;
                document.getElementById('paymentInfo').innerHTML = request.paymentDetails;
                document.getElementById('payBtn').style.display = 'block';
                clearInterval(checkInterval);
            }
        } catch (error) {
            console.error('❌ Ошибка при проверке чата:', error);
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