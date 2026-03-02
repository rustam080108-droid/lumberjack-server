// ========== КОШЕЛЕК (РАБОЧАЯ ВЕРСИЯ С LOCALSTORAGE) ==========

console.log('✅ wallet.js загружен (исправленная версия)');

let currentRequestId = null;
let checkInterval = null;

// Функция получения userId из localStorage
function getUserId() {
    return localStorage.getItem('userId');
}

// Пополнение
window.createDeposit = async function() {
    console.log('▶️ createDeposit вызвана');
    
    const userId = getUserId();
    console.log('userId из localStorage:', userId);
    
    if (!userId) {
        alert('Вы не авторизованы. Войдите в систему.');
        showAuthModal();
        return;
    }
    
    const amountInput = document.getElementById('depositSum');
    if (!amountInput) {
        alert('Поле суммы не найдено!');
        return;
    }
    
    const amount = parseInt(amountInput.value);
    console.log('Сумма:', amount);
    
    if (isNaN(amount) || amount < 100) {
        alert('Минимальная сумма 100 ₽');
        return;
    }
    
    const body = JSON.stringify({
        userId: userId,
        amount: amount,
        method: 'card'
    });
    console.log('Тело запроса:', body);
    
    try {
        const response = await fetch('/api/deposit/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        
        console.log('Ответ статус:', response.status);
        const data = await response.json();
        console.log('Ответ данные:', data);
        
        if (data.success) {
            alert(`Заявка создана! ID: ${data.requestId}`);
            hideModal('Deposit');
            currentRequestId = data.requestId;
            openChat();
        } else {
            alert('Ошибка: ' + (data.error || 'неизвестная'));
        }
    } catch (e) {
        console.error('Ошибка fetch:', e);
        alert('Ошибка соединения с сервером');
    }
};

// Вывод
window.createWithdraw = async function() {
    alert('Функция вывода временно отключена для диагностики');
};

// Чат
function openChat() {
    console.log('openChat, requestId =', currentRequestId);
    const chat = document.getElementById('chatMessages');
    if (!chat) return;
    
    chat.innerHTML = `<p>⏳ Заявка #${currentRequestId} создана. Ожидайте реквизиты...</p>`;
    showModal('Chat');
    
    if (checkInterval) clearInterval(checkInterval);
    
    checkInterval = setInterval(async () => {
        try {
            const userId = getUserId();
            if (!userId) return;
            
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
            console.error('Ошибка чата:', error);
        }
    }, 3000);
}

window.confirmPayment = function() {
    alert('Ожидайте зачисления');
    document.getElementById('payBtn').style.display = 'none';
};