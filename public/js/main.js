// ========== ГЛАВНЫЙ ФАЙЛ ==========
// Этот файл подключается в index.html и загружает все остальные

// Глобальные переменные
let userId = null;
let userData = {
    balance: 0,
    totalFund: 0,
    referrals: 0,
    referralEarn: 0,
    lastProfit: new Date().toISOString(),
    email: '',
    refCode: ''
};
let investments = [];
let history = [];

// ========== ИНИЦИАЛИЗАЦИЯ ==========
window.onload = function() {
    console.log('🚀 Запуск LumberJack');
    
    // Загружаем статистику
    if (typeof loadStats === 'function') loadStats();
    
    // Проверяем авторизацию
    const savedUserId = localStorage.getItem('userId');
    if (savedUserId) {
        userId = savedUserId;
        if (typeof loadUserData === 'function') loadUserData();
        if (typeof showAuthorizedMenu === 'function') showAuthorizedMenu();
    } else {
        if (typeof showGuestMenu === 'function') showGuestMenu();
    }
    
    // Отрисовываем магазин
    if (typeof renderShop === 'function') renderShop();
    
    // Запускаем обновление статистики
    setInterval(() => {
        if (typeof loadStats === 'function') loadStats();
    }, 30000);
};

// Глобальные функции для доступа из HTML
window.showModal = function(type) {
    document.getElementById(`modal${type}`).style.display = 'flex';
};

window.hideModal = function(type) {
    document.getElementById(`modal${type}`).style.display = 'none';
    if (type === 'Chat' && window.checkInterval) {
        clearInterval(window.checkInterval);
        window.checkInterval = null;
    }
};