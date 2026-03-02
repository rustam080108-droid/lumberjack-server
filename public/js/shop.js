// ========== МАГАЗИН ==========

const shopItems = [
    { id: 1, name: 'Тупой топор', icon: '🪓', price: 100 },
    { id: 2, name: 'Острый топор', icon: '🪵', price: 500 },
    { id: 3, name: 'Ножовка', icon: '🪚', price: 2000 },
    { id: 4, name: 'Бензопила', icon: '⛓️', price: 10000 },
    { id: 5, name: 'Проф. техника', icon: '🚜', price: 50000 }
];

let selectedItem = null;

function renderShop() {
    const container = document.getElementById('shop');
    if (!container) return;
    
    container.innerHTML = '';
    
    shopItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.onclick = () => openBuy(item.id);
        card.innerHTML = `
            <div class="item-icon">${item.icon}</div>
            <div class="item-name">${item.name}</div>
            <div class="item-price">${formatNumber(item.price)} ₽</div>
        `;
        container.appendChild(card);
    });
}

function openBuy(id) {
    if (!userId) {
        showAuthModal();
        showInfo('Для покупки необходимо войти');
        return;
    }
    
    selectedItem = shopItems.find(i => i.id === id);
    document.getElementById('buyContent').innerHTML = `
        <div style="text-align: center; font-size: 64px;">${selectedItem.icon}</div>
        <h3 style="text-align: center;">${selectedItem.name}</h3>
        <p style="text-align: center;">Цена: <strong style="color: gold;">${selectedItem.price} ₽</strong></p>
        <p style="text-align: center;">Доход: 2-3% в день</p>
    `;
    showModal('Buy');
}

async function confirmBuy() {
    if (!selectedItem || !userId) return;
    
    if (userData.balance < selectedItem.price) {
        showError('Недостаточно средств');
        hideModal('Buy');
        return;
    }
    
    const profit = (Math.random() * 1 + 2).toFixed(1);
    
    const response = await fetch('/api/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            itemId: selectedItem.id,
            itemName: selectedItem.name,
            itemIcon: selectedItem.icon,
            price: selectedItem.price,
            profit: parseFloat(profit)
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        userData.balance -= selectedItem.price;
        userData.totalFund += selectedItem.price;
        
        investments.push({
            itemName: selectedItem.name,
            itemIcon: selectedItem.icon,
            amount: selectedItem.price,
            profit,
            date: new Date().toISOString()
        });
        
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
        if (typeof renderInvestments === 'function') renderInvestments();
        hideModal('Buy');
        showSuccess('Покупка совершена!');
    }
}

// Экспорт
window.openBuy = openBuy;
window.confirmBuy = confirmBuy;