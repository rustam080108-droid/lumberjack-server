// ========== УТИЛИТЫ ==========

// Форматирование чисел
function formatNumber(num) {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Уведомления
function showSuccess(message) {
    showNotification('✅', message, 'success');
}

function showError(message) {
    showNotification('❌', message, 'error');
}

function showInfo(message) {
    showNotification('ℹ️', message, 'info');
}

function showNotification(icon, message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<strong>${icon}</strong> ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Форматирование карты
function formatCard(input) {
    if (!input) return;
    let v = input.value.replace(/\D/g, '').substring(0, 16);
    let parts = [];
    for (let i = 0; i < v.length; i += 4) {
        parts.push(v.substring(i, i + 4));
    }
    input.value = parts.join(' ');
}

// Экспорт в глобальную область
window.formatNumber = formatNumber;
window.showSuccess = showSuccess;
window.showError = showError;
window.showInfo = showInfo;
window.formatCard = formatCard;