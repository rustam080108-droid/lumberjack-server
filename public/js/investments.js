// ========== ИНВЕСТИЦИИ ==========

function renderInvestments() {
    const container = document.getElementById('investments');
    if (!container) return;
    
    if (!investments || investments.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Нет активных инвестиций</p>';
        return;
    }
    
    container.innerHTML = '';
    investments.forEach(inv => {
        const daily = Math.round(inv.amount * inv.profit / 100);
        container.innerHTML += `
            <div class="invest-item">
                <span>${inv.itemIcon} ${inv.itemName}</span>
                <span>${formatNumber(inv.amount)} ₽</span>
                <span style="color: #4caf50;">+${formatNumber(daily)} ₽/день</span>
            </div>
        `;
    });
}

function updateProfitToday() {
    let total = 0;
    if (investments && investments.length > 0) {
        investments.forEach(inv => total += inv.amount * inv.profit / 100);
    }
    document.getElementById('profitToday').textContent = formatNumber(Math.round(total));
}

async function collectProfit() {
    if (!userId) {
        showError('Сначала войдите в систему');
        return;
    }
    
    const last = new Date(userData.lastProfit);
    const now = new Date();
    const hours = (now - last) / (1000 * 60 * 60);
    
    if (hours >= 24 || investments.length === 0) {
        let total = 0;
        investments.forEach(inv => total += inv.amount * inv.profit / 100);
        total = Math.round(total);
        
        if (total > 0) {
            userData.balance += total;
            userData.lastProfit = now.toISOString();
            
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
            showSuccess(`Получено ${total} ₽ прибыли!`);
        } else {
            showInfo('Нет прибыли для сбора');
        }
    } else {
        showInfo(`До сбора: ${Math.ceil(24 - hours)} ч.`);
    }
}

function renderHistory() {
    const container = document.getElementById('history');
    if (!container) return;
    
    if (!history || history.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">История пуста</p>';
        return;
    }
    
    container.innerHTML = '';
    history.slice(0, 10).forEach(h => {
        container.innerHTML += `
            <div class="history-item">
                <span>${h.desc}</span>
                <span style="color: ${h.type === 'withdraw' ? '#f44336' : '#4caf50'}">
                    ${h.type === 'withdraw' ? '-' : '+'}${formatNumber(h.amount)} ₽
                </span>
                <span style="font-size: 12px;">${new Date(h.date).toLocaleDateString()}</span>
            </div>
        `;
    });
}

function updateUI() {
    document.getElementById('userBalance').textContent = formatNumber(userData.balance);
    document.getElementById('totalFund').textContent = formatNumber(userData.totalFund);
    document.getElementById('userReferrals').textContent = userData.referrals || '0';
    
    const percent = Math.min(100, Math.floor((userData.totalFund / 2500000) * 100));
    document.getElementById('progressFill').style.width = percent + '%';
    
    updateProfitToday();
}

// Экспорт
window.collectProfit = collectProfit;