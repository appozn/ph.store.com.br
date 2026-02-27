let selectedProductImageData = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await db.init();

        if (!db.isAdmin()) {
            window.location.href = 'login.html';
            return;
        }

        if (!window.location.hash) {
            window.location.hash = '#products';
        }

        initNavigation();
        initFormListeners();
        initModalClickEvents();

        // Check initial hash route and setup listener
        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
    } catch (err) {
        console.error("Error during admin initialization:", err);
        showToast('Erro ao carregar dados do sistema.', 'error');
    }

    // Set initial logo and site name
    const s = db.getSettings();
    const logoEl = document.getElementById('adminLogoDisplay');
    if (logoEl) {
        if (s.logoUrl) {
            const finalUrl = s.logoUrl.startsWith('data:image') || s.logoUrl.startsWith('blob:') ? s.logoUrl : s.logoUrl + '?t=' + new Date().getTime();
            logoEl.innerHTML = `<img src="${finalUrl}" alt="${s.siteName || ''}" style="max-height: 50px; width: auto; object-fit: contain;" onerror="this.style.display='none'; this.parentNode.textContent='${s.siteName || ''}';">`;
        } else {
            logoEl.textContent = s.siteName || '';
        }
    }

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        db.logout();
        window.location.href = 'login.html';
    });

    // Salvar Alterações Button
    const saveGlobalBtn = document.getElementById('saveGlobalBtn');
    if (saveGlobalBtn) {
        saveGlobalBtn.addEventListener('click', async () => {
            try {
                saveGlobalBtn.disabled = true;
                saveGlobalBtn.textContent = 'Salvando...';

                // Force a full save of current data
                await db.save();

                showToast('Alterações salvas e aplicadas globalmente!');

                // Refresh to ensure everything is synced
                setTimeout(() => {
                    saveGlobalBtn.disabled = false;
                    saveGlobalBtn.textContent = 'Salvar alterações';
                    window.location.reload();
                }, 800);
            } catch (err) {
                console.error("Save Error:", err);
                showToast('Erro ao salvar alterações.', 'error');
                saveGlobalBtn.disabled = false;
                saveGlobalBtn.textContent = 'Salvar alterações';
            }
        });
    }

    // Theme Toggle
    document.getElementById('toggleThemeBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('admin_theme', 'light');
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('admin_theme', 'dark');
        }
    });

    // Load saved theme
    if (localStorage.getItem('admin_theme') === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
    }

    document.body.classList.add('admin-ready');

    // Refresh current view when database updates - Throttled
    let updateTimeout;
    window.addEventListener('db_updated', () => {
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            if (document.hidden) return; // Don't render if tab is hidden
            requestAnimationFrame(() => handleHashChange());
        }, 200);
    });

    // Image processing listener for Categories
    const catImgFileInput = document.getElementById('catImageFile');
    if (catImgFileInput) {
        catImgFileInput.addEventListener('change', (e) => handleImageUpload(e, 'category'));
    }

    // Image processing listener for Products
    const imgFileInput = document.getElementById('prodImageFile');
    if (imgFileInput) {
        imgFileInput.addEventListener('change', (e) => handleImageUpload(e, 'product'));
    }
});

let selectedCategoryImageData = null;

function handleImageUpload(e, type = 'product') {
    const file = e.target.files[0];
    if (file) {
        const formId = type === 'product' ? '#productForm' : '#categoryForm';
        const buttonText = type === 'product' ? 'Salvar Produto' : 'Salvar Categoria';
        const btnSubmit = document.querySelector(`${formId} button[type="submit"]`);

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Processando Foto...';
        }

        const reader = new FileReader();
        reader.onload = function (evt) {
            const img = new Image();
            img.onload = function () {
                try {
                    const canvas = document.createElement('canvas');

                    // Specific sizes for PH STORE
                    const targetWidth = type === 'product' ? 800 : 1080;
                    const targetHeight = type === 'product' ? 800 : 1350;

                    canvas.width = targetWidth;
                    canvas.height = targetHeight;
                    const ctx = canvas.getContext('2d');

                    // Calculate crop to maintain aspect ratio and fill the canvas
                    const imgRatio = img.width / img.height;
                    const targetRatio = targetWidth / targetHeight;

                    let drawWidth = img.width;
                    let drawHeight = img.height;
                    let offsetX = 0;
                    let offsetY = 0;

                    if (imgRatio > targetRatio) {
                        // Image is wider than target
                        drawWidth = img.height * targetRatio;
                        offsetX = (img.width - drawWidth) / 2;
                    } else {
                        // Image is taller than target
                        drawHeight = img.width / targetRatio;
                        offsetY = (img.height - drawHeight) / 2;
                    }

                    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight, 0, 0, targetWidth, targetHeight);

                    const base64Str = canvas.toDataURL('image/webp', 0.8);

                    if (type === 'product') {
                        selectedProductImageData = base64Str;
                        document.getElementById('prodImage').value = 'Imagem anexada (pronta para salvar)';
                        const previewDiv = document.getElementById('productImagePreview');
                        previewDiv.style.display = 'block';
                        previewDiv.querySelector('img').src = base64Str;
                    } else {
                        selectedCategoryImageData = base64Str;
                        document.getElementById('catImage').value = 'Imagem anexada (pronta para salvar)';
                        const previewDiv = document.getElementById('categoryImagePreview');
                        previewDiv.style.display = 'block';
                        previewDiv.querySelector('img').src = base64Str;
                    }
                } catch (err) {
                    console.error("Erro ao processar imagem", err);
                    showToast('Erro ao processar imagem. Tente outra.', 'error');
                } finally {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = buttonText;
                }
            };
            img.onerror = () => {
                showToast('Erro ao carregar arquivo de imagem.', 'error');
                btnSubmit.disabled = false;
                btnSubmit.textContent = buttonText;
            };
            img.src = evt.target.result;
        };
        reader.onerror = () => {
            showToast('Erro ao ler arquivo.', 'error');
            btnSubmit.disabled = false;
            btnSubmit.textContent = buttonText;
        };
        reader.readAsDataURL(file);
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.style.color = 'white';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '9999';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.animation = 'slideIn 0.3s forwards';
    toast.style.backgroundColor = type === 'success' ? '#4ade80' : '#f87171';
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Navigation Logic
function initNavigation() {
    const collapseBtn = document.getElementById('collapseMenuBtn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            document.getElementById('adminSidebar').classList.toggle('collapsed');
            document.querySelector('.admin-content').classList.toggle('collapsed');
        });
    }
}

function handleHashChange() {
    let hash = window.location.hash.replace('#', '');
    const validViews = ['dashboard', 'products', 'categories', 'offers', 'users'];
    if (!hash || !validViews.includes(hash)) hash = 'products';

    const links = document.querySelectorAll('.admin-menu a[data-view]');
    const sections = document.querySelectorAll('.view-section');

    // Update active link
    links.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-view') === hash) {
            link.classList.add('active');
        }
    });

    // Show target section
    sections.forEach(section => {
        if (section.id === `view-${hash}`) {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    });

    // Reload data if specific view is opened
    if (hash === 'categories') loadCategories();
    if (hash === 'products') loadProducts();
    if (hash === 'offers') loadOffers();
    if (hash === 'dashboard') loadDashboard();

    // Fechar menu no mobile após clicar para facilitar a navegação
    if (window.innerWidth <= 992) {
        document.getElementById('adminSidebar').classList.add('collapsed');
        document.querySelector('.admin-content').classList.add('collapsed');
    }
}

// Format Currency
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Format Date
function formatDate(dateStr) {
    if (!dateStr) return '---';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Data Inválida';
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
    } catch (e) {
        return 'Erro Data';
    }
}

function updateBrowserTitle(siteName) {
    document.title = siteName + ' - Painel Administrativo';
}

// DASHBOARD REMOVED AS PER USER REQUEST

// CATEGORIES
function loadCategories() {
    const categories = db.getCategories();
    const tbody = document.getElementById('categoriesTableBody');
    tbody.innerHTML = '';

    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Nenhuma categoria cadastrada.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    categories.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="width: 60px; height: 75px; border-radius: 4px; background: #eee; overflow: hidden;">
                    <img src="${c.image || ''}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
                </div>
            </td>
            <td><strong>${c.name}</strong></td>
            <td>
                <button class="btn btn-outline" style="padding: 6px 12px; font-size: 14px; margin-right: 8px;" onclick="editCategory('${c.id}')">Editar</button>
                <button class="btn btn-outline" style="padding: 6px 12px; font-size: 14px; color: red; border-color: red;" onclick="deleteCategory('${c.id}')">Excluir</button>
            </td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
}

function showCategoryModal() {
    if (!db.data) {
        showToast('Aguarde o carregamento dos dados...', 'error');
        return;
    }
    const form = document.getElementById('categoryForm');
    if (form) form.reset();
    document.getElementById('catId').value = '';
    document.getElementById('categoryImagePreview').style.display = 'none';
    document.getElementById('categoryImagePreview').querySelector('img').src = '';
    selectedCategoryImageData = null;
    requestAnimationFrame(() => {
        document.getElementById('categoryModal').classList.add('show');
    });
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('show');
}

function editCategory(id) {
    const category = db.getCategories().find(c => c.id === id);
    if (category) {
        document.getElementById('catId').value = category.id;
        document.getElementById('catName').value = category.name;

        const imgInput = document.getElementById('catImage');
        if (category.image && category.image.startsWith('data:image')) {
            imgInput.value = 'Imagem anexada (pronta para salvar)';
            selectedCategoryImageData = category.image;
            const previewDiv = document.getElementById('categoryImagePreview');
            previewDiv.style.display = 'block';
            previewDiv.querySelector('img').src = category.image;
        } else {
            imgInput.value = category.image || '';
            selectedCategoryImageData = null;
            document.getElementById('categoryImagePreview').style.display = 'none';
        }

        document.getElementById('categoryModal').classList.add('show');
    }
}

function deleteCategory(id) {
    // Check if any product is using this category
    const productsUsing = db.getProducts().filter(p => p.categoryId === id);
    if (productsUsing.length > 0) {
        alert('Não é possível excluir esta categoria porque há produtos vinculados a ela.');
        return;
    }

    if (confirm('Tem certeza que deseja excluir esta categoria?')) {
        db.deleteCategory(id).then(() => {
            showToast('Categoria excluída com sucesso!');
        });
    }
}

function initFormListeners() {
    // CATEGORY FORM
    const categoryForm = document.getElementById('categoryForm');
    if (categoryForm) {
        categoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.textContent;

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Salvando...';
                }

                const id = document.getElementById('catId').value;
                const name = document.getElementById('catName').value.trim();

                if (!name) {
                    showToast('Nome da categoria é obrigatório.', 'error');
                    if (btn) { btn.disabled = false; btn.textContent = originalText; }
                    return;
                }

                let finalImageUrl = document.getElementById('catImage').value.trim();
                if (finalImageUrl === 'Imagem anexada (pronta para salvar)') {
                    finalImageUrl = selectedCategoryImageData || '';
                }

                if (!finalImageUrl) {
                    showToast('Imagem de capa é necessária.', 'error');
                    if (btn) { btn.disabled = false; btn.textContent = originalText; }
                    return;
                }

                if (id) {
                    await db.updateCategory(id, name, finalImageUrl);
                    showToast('Categoria atualizada!');
                } else {
                    await db.addCategory(name, finalImageUrl);
                    showToast('Categoria criada!');
                }

                setTimeout(() => {
                    closeCategoryModal();
                    if (btn) { btn.disabled = false; btn.textContent = originalText; }
                }, 100);

            } catch (err) {
                console.error("Save Category Error:", err);
                showToast('Erro ao salvar categoria.', 'error');
                if (btn) { btn.disabled = false; btn.textContent = originalText; }
            }
        });
    }

    // PRODUCT FORM
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.textContent;

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Gravando...';
                }

                const id = document.getElementById('prodId').value;
                const catId = document.getElementById('prodCategory').value;

                if (!catId) {
                    showToast('Por favor, selecione uma categoria.', 'error');
                    if (btn) { btn.disabled = false; btn.textContent = originalText; }
                    return;
                }

                const priceInput = document.getElementById('prodPrice').value.replace(',', '.');
                const price = parseFloat(priceInput);
                const name = document.getElementById('prodName').value.trim();

                if (!name || isNaN(price)) {
                    showToast('Nome e preço são obrigatórios.', 'error');
                    if (btn) { btn.disabled = false; btn.textContent = originalText; }
                    return;
                }

                let finalImageUrl = document.getElementById('prodImage').value.trim();
                if (finalImageUrl === 'Imagem anexada (pronta para salvar)') {
                    finalImageUrl = selectedProductImageData || '';
                }

                const paymentLink = document.getElementById('prodPaymentLink').value.trim();

                const productData = {
                    name,
                    categoryId: catId,
                    description: document.getElementById('prodDesc').value.trim(),
                    price,
                    image: finalImageUrl,
                    paymentLink
                };

                if (id) {
                    await db.updateProduct(id, productData);
                    showToast('Produto atualizado!');
                } else {
                    await db.addProduct(productData);
                    showToast('Produto criado com sucesso!');
                }

                // Small delay to ensure DB sync starts before closing
                setTimeout(() => {
                    closeProductModal();
                    if (btn) { btn.disabled = false; btn.textContent = originalText; }
                }, 100);

            } catch (err) {
                console.error("Save Product Error:", err);
                showToast('Erro ao salvar: ' + err.message, 'error');
                if (btn) { btn.disabled = false; btn.textContent = originalText; }
            }
        });
    }

    // OFFER FORM
    const offerForm = document.getElementById('offerForm');
    if (offerForm) {
        offerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.textContent;

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Ativando...';
                }

                const prodId = document.getElementById('offerProduct').value;
                const promoPriceInput = document.getElementById('offerPromoPrice').value.replace(',', '.');
                const promoPrice = parseFloat(promoPriceInput);

                if (!prodId || isNaN(promoPrice)) {
                    showToast('Selecione o produto e o preço promocional.', 'error');
                    if (btn) { btn.disabled = false; btn.textContent = originalText; }
                    return;
                }

                await db.addOffer({ productId: prodId, promoPrice });
                showToast('Oferta ativada!');

                setTimeout(() => {
                    closeOfferModal();
                    if (btn) { btn.disabled = false; btn.textContent = originalText; }
                }, 100);

            } catch (err) {
                console.error("Save Offer Error:", err);
                showToast('Erro ao salvar oferta.', 'error');
                if (btn) { btn.disabled = false; btn.textContent = originalText; }
            }
        });
    }

    // PIX AND SETTINGS FORMS REMOVED
}

function showCategoryQuickModal() {
    if (!db.data) return;
    const form = document.getElementById('categoryForm');
    if (form) form.reset();
    document.getElementById('catId').value = '';
    const modal = document.getElementById('categoryModal');
    modal.style.zIndex = '2200';
    modal.classList.add('show');
}

// PRODUCTS
function loadProducts() {
    const products = db.getProducts();
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum produto cadastrado.</td></tr>';
        return;
    }

    const categories = db.getCategories();
    const fragment = document.createDocumentFragment();

    products.forEach(p => {
        const cat = categories.find(c => c.id === p.categoryId);
        const catName = cat ? cat.name : '<span style="color:red">Sem Categoria (Inválido)</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 40px; height: 40px; border-radius: 4px; background: #eee; overflow: hidden;">
                        <img src="${p.image || ''}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
                    </div>
                    <strong>${p.name}</strong>
                </div>
            </td>
            <td>${catName}</td>
            <td style="color: var(--primary); font-weight: 600;">${formatCurrency(p.price)}</td>
            <td>
                <button class="btn btn-outline" style="padding: 6px 12px; font-size: 14px; margin-right: 8px;" onclick="editProduct('${p.id}')">Editar</button>
                <button class="btn btn-outline" style="padding: 6px 12px; font-size: 14px; color: red; border-color: red;" onclick="deleteProduct('${p.id}')">Excluir</button>
            </td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
}

function populateCategorySelect(selectedId = '') {
    const categories = db.getCategories();
    const select = document.getElementById('prodCategory');
    if (!select) return;

    select.innerHTML = '';

    // Default option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.disabled = true;
    defaultOpt.textContent = 'Selecione uma categoria...';
    if (!selectedId) defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    categories.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        if (c.id === selectedId) option.selected = true;
        select.appendChild(option);
    });

    if (selectedId) select.value = selectedId;
}

function showProductModal() {
    console.log("Opening product modal...");
    try {
        if (!db.data) {
            showToast('Banco de dados ainda não carregado.', 'error');
            return;
        }

        const modal = document.getElementById('productModal');
        if (!modal) {
            console.error("Modal not found: productModal");
            return;
        }

        // Reset form safely
        const form = document.getElementById('productForm');
        if (form) form.reset();

        const idField = document.getElementById('prodId');
        if (idField) idField.value = '';

        const previewDiv = document.getElementById('productImagePreview');
        if (previewDiv) {
            previewDiv.style.display = 'none';
            const img = previewDiv.querySelector('img');
            if (img) img.src = '';
        }

        selectedProductImageData = null;

        // Execute heavy DOM work inside a safer try-catch
        try {
            populateCategorySelect();
        } catch (catErr) {
            console.error("Error populating categories:", catErr);
        }

        closeAllModals();

        // Ensure modal is on top
        modal.style.zIndex = '3000';

        // Use requestAnimationFrame for smoother and more reliable display
        requestAnimationFrame(() => {
            modal.classList.add('show');
            console.log("Modal show class added.");
        });
    } catch (err) {
        console.error("Critical error in showProductModal:", err);
        showToast('Erro ao abrir formulário de produto.', 'error');
    }
}

function closeAllModals() {
    const modals = ['productModal', 'categoryModal', 'offerModal'];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('show');
}

function editProduct(id) {
    const product = db.getProducts().find(p => p.id === id);
    if (product) {
        document.getElementById('prodId').value = product.id;
        document.getElementById('prodName').value = product.name;
        document.getElementById('prodPrice').value = product.price;
        document.getElementById('prodDesc').value = product.description || '';
        document.getElementById('prodPaymentLink').value = product.paymentLink || '';

        const imgInput = document.getElementById('prodImage');
        if (product.image && product.image.startsWith('data:image')) {
            imgInput.value = 'Imagem anexada (pronta para salvar)';
            selectedProductImageData = product.image;
            const previewDiv = document.getElementById('productImagePreview');
            previewDiv.style.display = 'block';
            previewDiv.querySelector('img').src = product.image;
        } else {
            imgInput.value = product.image || '';
            selectedProductImageData = null;
            document.getElementById('productImagePreview').style.display = 'none';
        }

        populateCategorySelect(product.categoryId);

        document.getElementById('productModal').classList.add('show');
    }
}

function deleteProduct(id) {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
        db.deleteProduct(id).then(() => {
            showToast('Produto excluído com sucesso!');
        });
    }
}

// Product form listener moved to initFormListeners


// ORDERS & PAYMENTS REMOVED

// OFFERS
function loadOffers() {
    try {
        const offers = db.getOffers();
        const products = db.getProducts();
        const tbody = document.getElementById('offersTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (offers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhuma oferta ativa.</td></tr>';
            return;
        }

        offers.forEach(o => {
            const prod = products.find(p => p.id === o.productId);
            const prodName = prod ? prod.name : 'Produto Removido';
            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td><strong>${prodName}</strong></td>
                <td><span style="color: var(--primary); font-weight: 600;">${formatCurrency(o.promoPrice)}</span></td>
                <td>
                    <button class="btn btn-outline" style="padding: 6px 12px; font-size: 14px; color: red; border-color: red;" onclick="deleteOffer('${o.id}')">Remover</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Erro ao carregar ofertas:', err);
    }
}

function showOfferModal() {
    if (!db.data) {
        showToast('Aguarde o carregamento...', 'error');
        return;
    }
    const form = document.getElementById('offerForm');
    if (form) form.reset();
    const products = db.getProducts();
    const select = document.getElementById('offerProduct');
    select.innerHTML = '<option value="" disabled selected>Selecione um produto</option>';
    products.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name + ' - ' + formatCurrency(p.price);
        select.appendChild(option);
    });
    const modal = document.getElementById('offerModal');
    modal.style.zIndex = '2100';
    modal.classList.add('show');
}

function closeOfferModal() {
    document.getElementById('offerModal').classList.remove('show');
}

function deleteOffer(id) {
    if (confirm('Deseja remover esta oferta?')) {
        db.deleteOffer(id).then(() => {
            showToast('Oferta removida com sucesso!');
        });
    }
}

function initModalClickEvents() {
    const modals = ['productModal', 'categoryModal', 'offerModal'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.addEventListener('click', (e) => {
                // If the click is directly on the overlay (not on its children)
                if (e.target === modal) {
                    if (id === 'productModal') closeProductModal();
                    else if (id === 'categoryModal') closeCategoryModal();
                    else if (id === 'offerModal') closeOfferModal();
                }
            });
        }
    });
}

// MOCK FUNCTIONS FOR NEW VIEWS TO PREVENT ERRORS
function loadDashboard() { console.log("Dashboard view loaded"); }

// PIX & SETTINGS FUNCTIONS REMOVED (Previous logic was obsolete for this simplified WhatsApp version)

// Image listeners are now consolidated or correctly placed

// Image processing logic moved to DOMContentLoaded listener


// SITE PREVIEW LOGIC REMOVED

