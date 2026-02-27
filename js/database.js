/*
 * =========================================================================
 *  BANCO DE DADOS (LOCALSTORAGE) - MODO OFFLINE / SEM SERVIDOR
 * =========================================================================
 * Para rodar o sistema sem ferramentas externas (Firebase/APIs),
 * os dados são salvos no armazenamento interno do navegador (LocalStorage).
 */

const DB_KEY = 'ph_store_global_db_v3';

const defaultData = {
    settings: {
        siteName: '',
        heroTitle: 'PH STORE',
        heroSubtitle: '',
        primaryColor: '#e7229b',
        logoUrl: 'img/logo.png',
        logoSize: 100,
        instagramLink: ''
    },
    users: [
        {
            id: 'admin_1',
            name: 'Administrador',
            email: 'admin@ph.store',
            password: 'phstore.adm',
            role: 'ADMIN'
        }
    ],
    categories: [],
    products: [],
    offers: [],
    orders: [],
    stats: { visits: 0, sales: 0, revenue: 0 },
    pixKey: { type: 'CPF', key: '' }
};

class Database {
    constructor() {
        this.data = null;

        // Listen for changes from other tabs to emulate real-time sync
        window.addEventListener('storage', (e) => {
            if (e.key === DB_KEY) {
                this.loadFromDB();
                this.dispatchUpdate();
            }
        });
    }

    dispatchUpdate() {
        window.dispatchEvent(new Event('db_updated'));
    }

    async init() {
        this.loadFromDB();
        return Promise.resolve();
    }

    loadFromDB() {
        try {
            const raw = localStorage.getItem(DB_KEY);
            if (raw) {
                this.data = JSON.parse(raw);
            } else {
                this.data = JSON.parse(JSON.stringify(defaultData));
                this.saveSync();
            }
            this.ensureDataIntegrity();
        } catch (err) {
            console.error("Erro ao carregar do LocalStorage:", err);
            this.data = JSON.parse(JSON.stringify(defaultData));
        }
    }

    saveSync() {
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(this.data));
            this.dispatchUpdate();
            return true;
        } catch (err) {
            console.error('Erro ao salvar no LocalStorage (Limite Excedido?):', err);
            alert("Aviso: Falha ao salvar no navegador. Pode ser que as imagens enviadas sejam grandes demais para o armazenamento local.");
            return false;
        }
    }

    async save() {
        // Função async mantida para compatibilidade com botões que usam await
        return new Promise((resolve) => {
            resolve(this.saveSync());
        });
    }

    ensureDataIntegrity() {
        if (!this.data) this.data = JSON.parse(JSON.stringify(defaultData));
        if (!this.data.categories) this.data.categories = [];
        if (!this.data.products) this.data.products = [];
        if (!this.data.offers) this.data.offers = [];
        if (!this.data.users) this.data.users = [];
        if (!this.data.settings) this.data.settings = JSON.parse(JSON.stringify(defaultData.settings));

        const hasAdmin = this.data.users.find(u => u.email === 'admin@ph.store');
        if (!hasAdmin) {
            this.data.users.push(defaultData.users[0]);
            this.saveSync();
        }
    }

    // --- Métodos Públicos ---

    getSettings() { return this.data?.settings || defaultData.settings; }
    async updateSettings(newSettings) {
        this.data.settings = { ...this.data.settings, ...newSettings };
        return this.saveSync();
    }

    getCategories() { return this.data?.categories || []; }
    async addCategory(name, image = '') {
        const cat = { id: 'CAT-' + Date.now(), name, image };
        this.data.categories.push(cat);
        this.saveSync();
        return cat;
    }
    async updateCategory(id, name, image = '') {
        const index = this.data.categories.findIndex(c => c.id === id);
        if (index !== -1) {
            this.data.categories[index] = { ...this.data.categories[index], name, image };
            this.saveSync();
        }
    }
    async deleteCategory(id) {
        this.data.categories = this.data.categories.filter(c => c.id !== id);
        this.saveSync();
    }

    getProducts() { return this.data?.products || []; }
    async addProduct(product) {
        product.id = 'PROD-' + Date.now();
        this.data.products.push(product);
        this.saveSync();
        return product;
    }
    async updateProduct(id, updatedData) {
        const index = this.data.products.findIndex(p => p.id === id);
        if (index !== -1) {
            this.data.products[index] = { ...this.data.products[index], ...updatedData };
            this.saveSync();
        }
    }
    async deleteProduct(id) {
        this.data.products = this.data.products.filter(p => p.id !== id);
        this.saveSync();
    }

    getOffers() { return this.data?.offers || []; }
    async addOffer(offer) {
        offer.id = 'OFFER-' + Date.now();
        this.data.offers.push(offer);
        this.saveSync();
    }
    async deleteOffer(id) {
        this.data.offers = this.data.offers.filter(o => o.id !== id);
        this.saveSync();
    }

    // Auth
    getUsers() { return this.data?.users || []; }
    login(email, password) {
        const user = this.data.users.find(u => u.email === email && u.password === password);
        if (user) {
            localStorage.setItem('loggedUser', JSON.stringify({
                id: user.id, name: user.name, email: user.email, role: user.role
            }));
            window.dispatchEvent(new Event('auth_changed'));
            return user;
        }
        return null;
    }
    logout() {
        localStorage.removeItem('loggedUser');
        window.dispatchEvent(new Event('auth_changed'));
    }
    getLoggedUser() {
        const u = localStorage.getItem('loggedUser');
        return u ? JSON.parse(u) : null;
    }
    isAdmin() {
        const user = this.getLoggedUser();
        return user && user.role === 'ADMIN';
    }
}

const db = new Database();
