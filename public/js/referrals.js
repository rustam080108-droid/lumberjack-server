// ========== РЕФЕРАЛЫ ==========

function showReferralsModal() {
    document.getElementById('refCount').textContent = userData.referrals || '0';
    document.getElementById('refEarned').textContent = formatNumber(userData.referralEarn) + ' ₽';
    document.getElementById('refLinkProfile').value = `${window.location.origin}/?ref=${userData.refCode || ''}`;
    showModal('Referrals');
}

function copyRef() {
    const input = document.getElementById('refLinkProfile');
    input.select();
    navigator.clipboard.writeText(input.value);
    showSuccess('Ссылка скопирована!');
}

// Экспорт
window.showReferralsModal = showReferralsModal;
window.copyRef = copyRef;