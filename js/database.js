/*
 * =========================================================================
 *  BANCO DE DADOS (SUPABASE) - PERSISTÊNCIA REAL
 * =========================================================================
 */

const SUPABASE_URL = 'https://igxpvovlxixfcwyfxhyd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlneHB2b3ZseGl4ZmN3eWZ4aHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTc5MDksImV4cCI6MjA4ODczMzkwOX0.cwRQw38iMrzUMtKzRMVcFbSGGRpfKMn__EbVucT0JxQ';

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
        this.data = JSON.parse(JSON.stringify(defaultData));
        this.supabase = null;

        // Somente inicializa se o script do Supabase estiver carregado
        if (typeof supabase !== 'undefined') {
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    }

    dispatchUpdate() {
        window.dispatchEvent(new Event('db_updated'));
    }

    async init() {
        console.log("Iniciando Banco de Dados...");
        if (!this.supabase && typeof supabase !== 'undefined') {
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log("Cliente Supabase criado.");
        }

        if (this.supabase) {
            try {
                console.log("Buscando dados do Supabase...");
                await this.fetchAll();
                console.log("Dados carregados com sucesso.");
            } catch (err) {
                console.error("Erro crítico na busca do Supabase:", err);
                this.loadFromLocalStorageFallback();
            }
        } else {
            console.warn("Supabase não disponível. Usando LocalStorage.");
            this.loadFromLocalStorageFallback();
        }
        return Promise.resolve();
    }

    async fetchAll() {
        try {
            const [products, categories, offers, settings] = await Promise.all([
                this.supabase.from('products').select('*'),
                this.supabase.from('categories').select('*'),
                this.supabase.from('offers').select('*'),
                this.supabase.from('settings').select('*')
            ]);

            if (products.error) console.error("Erro ao buscar produtos:", products.error);
            else this.data.products = products.data;

            if (categories.error) console.error("Erro ao buscar categorias:", categories.error);
            else this.data.categories = categories.data;

            if (offers.error) console.error("Erro ao buscar ofertas:", offers.error);
            else this.data.offers = offers.data;

            if (settings.error) console.error("Erro ao buscar configurações:", settings.error);
            else if (settings.data && settings.data.length > 0) this.data.settings = settings.data[0];

            this.dispatchUpdate();
        } catch (e) {
            console.error("Exceção em fetchAll:", e);
            throw e;
        }
    }

    loadFromLocalStorageFallback() {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) {
            this.data = JSON.parse(raw);
        }
        this.ensureDataIntegrity();
    }

    // No modo Supabase, as mudanças são salvas imediatamente por ação.
    // Esse método permanece para compatibilidade.
    async save() {
        return true;
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
        }
    }

    // --- Métodos Públicos ---

    getSettings() { return this.data.settings; }
    async updateSettings(newSettings) {
        this.data.settings = { ...this.data.settings, ...newSettings };
        if (this.supabase) {
            await this.supabase.from('settings').upsert({ id: 'global', ...this.data.settings });
        }
        this.dispatchUpdate();
        return true;
    }

    getCategories() { return this.data.categories || []; }
    async addCategory(name, image = '') {
        const cat = { name, image };
        if (this.supabase) {
            const { data, error } = await this.supabase.from('categories').insert([cat]).select();
            if (!error && data) {
                this.data.categories.push(data[0]);
                this.dispatchUpdate();
                return data[0];
            }
        }
        // Fallback or if no supabase
        const localCat = { id: 'CAT-' + Date.now(), ...cat };
        this.data.categories.push(localCat);
        this.dispatchUpdate();
        return localCat;
    }

    async updateCategory(id, name, image = '') {
        const index = this.data.categories.findIndex(c => c.id === id);
        if (index !== -1) {
            this.data.categories[index] = { ...this.data.categories[index], name, image };
            if (this.supabase) {
                await this.supabase.from('categories').update({ name, image }).eq('id', id);
            }
            this.dispatchUpdate();
        }
    }

    async deleteCategory(id) {
        this.data.categories = this.data.categories.filter(c => c.id !== id);
        if (this.supabase) {
            await this.supabase.from('categories').delete().eq('id', id);
        }
        this.dispatchUpdate();
    }

    getProducts() { return this.data.products || []; }
    async addProduct(product) {
        const user = this.getLoggedUser();
        if (user) product.user_id = user.id; // Associar ao admin logado

        if (this.supabase) {
            const { data, error } = await this.supabase.from('products').insert([product]).select();
            if (!error && data) {
                this.data.products.push(data[0]);
                this.dispatchUpdate();
                return data[0];
            } else if (error) {
                console.error("Erro Supabase addProduct:", error);
                throw error;
            }
        }

        product.id = 'PROD-' + Date.now();
        this.data.products.push(product);
        this.dispatchUpdate();
        return product;
    }

    async updateProduct(id, updatedData) {
        const index = this.data.products.findIndex(p => p.id === id);
        if (index !== -1) {
            this.data.products[index] = { ...this.data.products[index], ...updatedData };
            if (this.supabase) {
                const { error } = await this.supabase.from('products').update(updatedData).eq('id', id);
                if (error) throw error;
            }
            this.dispatchUpdate();
        }
    }

    async deleteProduct(id) {
        this.data.products = this.data.products.filter(p => p.id !== id);
        if (this.supabase) {
            await this.supabase.from('products').delete().eq('id', id);
        }
        this.dispatchUpdate();
    }

    getOffers() { return this.data.offers || []; }
    async addOffer(offer) {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('offers').insert([offer]).select();
            if (!error && data) {
                this.data.offers.push(data[0]);
                this.dispatchUpdate();
                return;
            }
        }
        offer.id = 'OFFER-' + Date.now();
        this.data.offers.push(offer);
        this.dispatchUpdate();
    }

    async deleteOffer(id) {
        this.data.offers = this.data.offers.filter(o => o.id !== id);
        if (this.supabase) {
            await this.supabase.from('offers').delete().eq('id', id);
        }
        this.dispatchUpdate();
    }

    // Auth
    getUsers() { return this.data.users || []; }

    registerUser(name, email, password) {
        const newUser = {
            id: 'USER-' + Date.now(),
            name,
            email,
            password,
            role: 'USER'
        };
        this.data.users.push(newUser);
        // Por enquanto salvamos localmente, mas poderíamos persistir no Supabase se houver tabela 'users'
        localStorage.setItem(DB_KEY, JSON.stringify(this.data));
        return newUser;
    }

    login(email, password) {
        // No momento usamos login local com admin padrão
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
