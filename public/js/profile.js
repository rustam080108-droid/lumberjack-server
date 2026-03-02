// ========== ПРОФИЛЬ ==========

function showProfileModal() {
    document.getElementById('profileUserId').textContent = userId || 'USR0000';
    document.getElementById('profileEmail').textContent = userData.email || 'не указан';
    document.getElementById('profileBalance').textContent = formatNumber(userData.balance) + ' ₽';
    document.getElementById('profileInvested').textContent = formatNumber(userData.totalFund) + ' ₽';
    document.getElementById('profileReferrals').textContent = userData.referrals || '0';
    showModal('Profile');
}

// Экспорт
window.showProfileModal = showProfileModal;