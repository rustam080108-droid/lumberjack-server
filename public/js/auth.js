// ========== АВТОРИЗАЦИЯ ==========

let currentEmail = '';

// Показать/скрыть модалку авторизации
function showAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
}

function hideAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

// Переключение между входом и регистрацией
function switchAuthForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const title = document.getElementById('authModalTitle');
    
    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        title.textContent = 'Вход';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        title.textContent = 'Регистрация';
    }
}

// Отправка кода подтверждения
async function sendVerificationCode() {
    const email = document.getElementById('regEmail').value;
    
    if (!email) {
        showError('Введите email');
        return;
    }
    
    const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (data.success) {
        hideAuthModal();
        document.getElementById('verificationEmail').textContent = email;
        currentEmail = email;
        showModal('Verification');
        showSuccess('Код отправлен на почту!');
    } else {
        showError(data.error);
    }
}

// Проверка кода
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
        body: JSON.stringify({ code, password, email: currentEmail })
    });
    
    const data = await response.json();
    
    if (data.success) {
        hideModal('Verification');
        showSuccess('Регистрация успешна! Теперь войдите.');
        switchAuthForm();
        showAuthModal();
    } else {
        showError(data.error);
    }
}

// Вход
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
        userId = data.user.id;
        userData.email = data.user.email;
        userData.balance = data.user.balance;
        localStorage.setItem('userId', userId);
        
        hideAuthModal();
        showAuthorizedMenu();
        document.getElementById('investmentsSection').style.display = 'block';
        document.getElementById('userEmail').textContent = userData.email;
        document.getElementById('userBalance').textContent = formatNumber(userData.balance);
        
        if (typeof loadUserData === 'function') loadUserData();
        showSuccess('Вход выполнен успешно!');
    } else {
        showError(data.error);
    }
}

// Выход
function logout() {
    localStorage.removeItem('userId');
    userId = null;
    showGuestMenu();
    document.getElementById('investmentsSection').style.display = 'none';
    showSuccess('Вы вышли из аккаунта');
}

// Меню для гостей и авторизованных
function showGuestMenu() {
    document.getElementById('guestMenu').style.display = 'flex';
    document.getElementById('authorizedMenu').style.display = 'none';
}

function showAuthorizedMenu() {
    document.getElementById('guestMenu').style.display = 'none';
    document.getElementById('authorizedMenu').style.display = 'block';
}

// Дропдаун профиля
function toggleProfileMenu() {
    const menu = document.getElementById('profileDropdown');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

// Закрытие дропдауна при клике вне
document.addEventListener('click', function(e) {
    if (!e.target.closest('.profile-btn') && !e.target.closest('.profile-dropdown')) {
        const menu = document.getElementById('profileDropdown');
        if (menu) menu.style.display = 'none';
    }
});

// Экспорт
window.showAuthModal = showAuthModal;
window.hideAuthModal = hideAuthModal;
window.switchAuthForm = switchAuthForm;
window.sendVerificationCode = sendVerificationCode;
window.verifyCode = verifyCode;
window.login = login;
window.logout = logout;
window.toggleProfileMenu = toggleProfileMenu;