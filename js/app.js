// Format helpers
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

let currentCategoryFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await db.init();
        loadGlobalSettings();
        renderCategories(); // NEW
        renderProducts();
        renderUserMenu();
        initCart();
    } catch (err) {
        console.error("Error during store initialization:", err);
        document.getElementById('heroTitle').innerHTML = "Ocorreu um problema";
        document.getElementById('heroSubtitle').innerHTML = "Não foi possível carregar os produtos. Tente recarregar a página.";
    }
    window.addEventListener('db_updated', () => {
        loadGlobalSettings();
        renderCategories(); // NEW
        renderProducts();
    });

    window.addEventListener('auth_changed', () => {
        renderUserMenu();
    });
});

function loadGlobalSettings() {
    const s = db.getSettings();
    const safeName = s.siteName || 'PH STORE';
    const logoHeight = s.logoSize || 80;

    const siteLogo = document.getElementById('siteLogo');
    if (siteLogo) {
        if (s.logoUrl) {
            const finalUrl = s.logoUrl.startsWith('data:image') || s.logoUrl.startsWith('blob:') ? s.logoUrl : s.logoUrl + '?t=' + new Date().getTime();
            siteLogo.innerHTML = `<img src="${finalUrl}" alt="${s.siteName || ''}" class="glow-pink" style="max-height: ${logoHeight}px; width: auto; object-fit: contain;" onerror="this.onerror=null; this.style.display='none'; this.parentNode.innerHTML='${s.siteName || ''}';">`;
        } else {
            siteLogo.innerHTML = s.siteName || '';
        }
    }

    document.title = safeName;

    const hTitle = document.getElementById('heroTitle');
    const hSub = document.getElementById('heroSubtitle');
    if (hTitle) hTitle.innerHTML = s.heroTitle || 'PH STORE';
    if (hSub) {
        hSub.innerHTML = s.heroSubtitle || '';
        hSub.style.display = (s.heroSubtitle && s.heroSubtitle.trim()) ? 'block' : 'none';
    }

    const instaBtn = document.getElementById('footerInstaBtn');
    if (instaBtn) {
        if (s.instagramLink) {
            instaBtn.href = s.instagramLink;
            instaBtn.style.display = 'inline-flex';
        } else {
            instaBtn.style.display = 'none';
        }
    }
}

function renderUserMenu() {
    const userMenu = document.getElementById('userMenu');
    const user = db.getLoggedUser();

    userMenu.innerHTML = '';

    if (user) {
        // User is logged in
        let firstName = user.name.split(' ')[0];
        // If admin, show small badge
        const adminBadge = user.role === 'ADMIN' ? `<span style="background:var(--primary);color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:5px;">ADMIN</span>` : '';

        userMenu.innerHTML = `
            ${adminBadge}
            <a href="#" id="logoutAction" style="font-size: 14px; color: var(--text-muted); text-decoration: underline;">Sair</a>
        `;

        document.getElementById('logoutAction').addEventListener('click', (e) => {
            e.preventDefault();
            db.logout();
            window.location.reload();
        });
    } else {
        // User not logged in
        userMenu.innerHTML = `
            <a href="login.html" class="btn btn-outline" style="padding: 8px 20px; font-size: 14px;">Entrar</a>
        `;
    }
}

function renderCategories() {
    const categories = db.getCategories();
    const container = document.getElementById('productsSection');
    if (!container) return;

    // Check if we already have the containers
    let catGrid = document.getElementById('categoriesGrid');
    let filterBar = document.getElementById('filterBar');

    if (!catGrid) {
        const catHeader = document.createElement('h2');
        catHeader.className = 'text-center';
        catHeader.style.fontSize = '32px';
        catHeader.style.marginBottom = '20px';
        catHeader.textContent = 'Categorias';

        catGrid = document.createElement('div');
        catGrid.id = 'categoriesGrid';
        catGrid.className = 'categories-grid';

        filterBar = document.createElement('div');
        filterBar.id = 'filterBar';
        filterBar.className = 'filter-bar';

        // Remove "Nossos Produtos" static title if it exists to replace it
        container.innerHTML = '';
        container.appendChild(catHeader);
        container.appendChild(catGrid);

        const prodHeader = document.createElement('h2');
        prodHeader.id = 'productsHeading';
        prodHeader.className = 'text-center';
        prodHeader.style.fontSize = '32px';
        prodHeader.style.marginTop = '60px';
        prodHeader.style.marginBottom = '30px';
        prodHeader.textContent = 'Nossos Produtos';

        container.appendChild(prodHeader);
        container.appendChild(filterBar);

        const pGrid = document.createElement('div');
        pGrid.id = 'productsGrid';
        pGrid.className = 'products-grid';
        container.appendChild(pGrid);
    }

    // Render Cards
    catGrid.innerHTML = '';
    categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.onclick = () => filterByCategory(cat.id);
        card.innerHTML = `
            <img src="${cat.image || ''}" alt="${cat.name}" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
            <div class="category-info">
                <h3>${cat.name}</h3>
            </div>
        `;
        catGrid.appendChild(card);
    });

    // Render Filter Buttons
    filterBar.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = `filter-btn ${currentCategoryFilter === 'all' ? 'active' : ''}`;
    allBtn.textContent = 'Tudo';
    allBtn.onclick = () => filterByCategory('all');
    filterBar.appendChild(allBtn);

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${currentCategoryFilter === cat.id ? 'active' : ''}`;
        btn.textContent = cat.name;
        btn.onclick = () => filterByCategory(cat.id);
        filterBar.appendChild(btn);
    });
}

function filterByCategory(catId) {
    currentCategoryFilter = catId;
    renderCategories();
    renderProducts();

    // Smooth scroll to products area
    const heading = document.getElementById('productsHeading');
    if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function renderProducts() {
    const products = db.getProducts();
    const offers = db.getOffers();
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const filtered = currentCategoryFilter === 'all'
        ? products
        : products.filter(p => p.categoryId === currentCategoryFilter);

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1/-1; padding: 40px;">Nenhum produto encontrado.</p>';
        return;
    }

    filtered.forEach(p => {
        const offer = offers.find(o => o.productId === p.id);
        const displayPrice = offer ? `<div class="product-price"><span style="text-decoration: line-through; color: #999; font-size: 0.8em; margin-right: 8px;">${formatCurrency(p.price)}</span> ${formatCurrency(offer.promoPrice)}</div>` : `<div class="product-price">${formatCurrency(p.price)}</div>`;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="img-wrapper">
                ${offer ? '<span style="position: absolute; top: 10px; right: 10px; background: var(--primary); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; z-index: 1;">OFERTA</span>' : ''}
                <img src="${p.image || ''}" class="product-img" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
            </div>
            <div class="product-info">
                <h3 class="product-title">${p.name}</h3>
                ${p.description ? `<p style="font-size:14px; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">${p.description}</p>` : ''}
                ${displayPrice}
                <div style="display: flex; gap: 8px; margin-top: auto;">
                    <button onclick="buySingleOnWhatsApp('${p.id}')" class="btn btn-primary" style="flex: 1; padding: 12px 10px; font-size: 13px; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 5px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.284l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.587-5.768-5.764-5.768zm3.393 8.225c-.149.423-.748.766-1.127.817-.4.055-.907.085-2.222-.449-1.742-.705-2.859-2.486-2.946-2.603-.087-.117-.714-.949-.714-1.812 0-.862.453-1.286.613-1.46.16-.174.349-.218.465-.218.116 0 .232.001.334.005.11.004.258-.041.405.313.149.362.51.1.51.1s.612 1.48.666 1.59c.054.11.09.238.018.381-.072.143-.108.232-.215.358-.108.126-.226.281-.323.376-.108.105-.221.22-.095.434.126.214.559.905 1.196 1.48.818.738 1.503.967 1.717 1.074.214.107.34.089.467-.058.127-.147.545-.634.69-.851.144-.216.29-.18.49-.107.2.074 1.264.597 1.483.705.219.108.364.161.417.254.053.093.053.538-.096.961zM12 1c-6.075 0-11 4.925-11 11s4.925 11 11 11 11-4.925 11-11-4.925-11-11-11zm0 20c-4.963 0-9-4.037-9-9s4.037-9 9-9 9 4.037 9 9-4.037 9-9 9z"/>
                        </svg>
                        Comprar
                    </button>
                    <button onclick="addToCart('${p.id}')" class="btn btn-outline" style="padding: 12px; min-width: 48px; flex: 0 0 auto;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- CART & WHATSAPP INTEGRATION ---
let cart = [];
const WHATSAPP_NUMBER = '5544997153209';

function initCart() {
    // Load cart from localStorage
    const savedCart = localStorage.getItem('ph_store_cart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
        } catch (e) {
            cart = [];
        }
    }

    // Modal Events
    const openBtn = document.getElementById('openCartBtn');
    const closeBtn = document.getElementById('closeCartBtn');
    const overlay = document.getElementById('cartOverlay');
    const sidebar = document.getElementById('cartSidebar');

    if (openBtn) openBtn.addEventListener('click', () => toggleCart(true));
    if (closeBtn) closeBtn.addEventListener('click', () => toggleCart(false));
    if (overlay) overlay.addEventListener('click', () => toggleCart(false));

    // Checkout Button
    const checkoutBtn = document.getElementById('checkoutWhatsAppBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', checkoutToWhatsApp);
    }

    updateCartUI();
}

function toggleCart(open) {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    if (open) {
        sidebar.classList.add('open');
        overlay.classList.add('show');
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    }
}

function addToCart(productId) {
    const products = db.getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: getActualPrice(product),
            image: product.image,
            quantity: 1
        });
    }

    saveCart();
    updateCartUI();
    toggleCart(true);
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartUI();
}

function updateQuantity(productId, delta) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            saveCart();
            updateCartUI();
        }
    }
}

function saveCart() {
    localStorage.setItem('ph_store_cart', JSON.stringify(cart));
}

function getActualPrice(product) {
    const offer = db.getOffers().find(o => o.productId === product.id);
    return offer ? offer.promoPrice : product.price;
}

function updateCartUI() {
    const list = document.getElementById('cartItemsList');
    const totalEl = document.getElementById('cartTotalValue');
    const badge = document.getElementById('cartCountBadge');

    if (!list) return;

    if (cart.length === 0) {
        list.innerHTML = '<p class="text-center text-muted" style="margin-top: 40px;">Seu carrinho está vazio.</p>';
        if (totalEl) totalEl.textContent = formatCurrency(0);
        if (badge) badge.style.display = 'none';
        return;
    }

    let total = 0;
    let count = 0;
    list.innerHTML = '';

    cart.forEach(item => {
        total += item.price * item.quantity;
        count += item.quantity;

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <img src="${item.image || ''}" class="cart-item-img" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
            <div style="flex-grow: 1;">
                <h4 style="font-size: 15px; margin-bottom: 4px;">${item.name}</h4>
                <div style="color: var(--primary); font-weight: 700; font-size: 14px;">${formatCurrency(item.price)}</div>
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
                    <button class="btn-outline" style="padding: 2px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;" onclick="updateQuantity('${item.id}', -1)">-</button>
                    <span style="font-weight: 600;">${item.quantity}</span>
                    <button class="btn-outline" style="padding: 2px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;" onclick="updateQuantity('${item.id}', 1)">+</button>
                    <button style="margin-left: auto; background: none; border: none; color: #f87171; font-size: 12px; cursor: pointer; text-decoration: underline;" onclick="removeFromCart('${item.id}')">Remover</button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });

    if (totalEl) totalEl.textContent = formatCurrency(total);
    if (badge) {
        badge.textContent = count;
        badge.style.display = 'block';
    }
}

function buySingleOnWhatsApp(productId) {
    const products = db.getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const price = getActualPrice(product);
    let message = `*Novo Pedido - PH STORE*\n\n`;
    message += `Produto: ${product.name}\n`;
    message += `Quantidade: 1\n`;
    message += `Valor unitário: ${formatCurrency(price)}\n`;
    message += `Total: ${formatCurrency(price)}`;

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

function checkoutToWhatsApp() {
    if (cart.length === 0) return;

    let message = "*Novo Pedido - PH STORE*\n\n";
    let total = 0;

    cart.forEach(item => {
        message += `• ${item.name} (${item.quantity}x)\n`;
        message += `  Valor unitário: ${formatCurrency(item.price)}\n`;
        total += item.price * item.quantity;
    });

    message += `\n*Total do Pedido:* ${formatCurrency(total)}`;

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// Global exposure for onclick handlers
window.addToCart = addToCart;
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
window.buySingleOnWhatsApp = buySingleOnWhatsApp;

