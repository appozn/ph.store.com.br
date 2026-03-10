/*
 * =========================================================================
 *  BANCO DE DADOS (SUPABASE) - PERSISTÊNCIA REAL COM DIAGNÓSTICO
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

        if (typeof supabase !== 'undefined') {
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log("%c[DB] Cliente Supabase pronto.", "color: #4ade80; font-weight: bold;");
        } else {
            console.error("%c[DB] SDK do Supabase não encontrado! Verifique o script no HTML.", "color: #f87171; font-weight: bold;");
        }
    }

    dispatchUpdate() {
        window.dispatchEvent(new Event('db_updated'));
    }

    async init() {
        console.group("Iniciando PH STORE DB");
        if (this.supabase) {
            try {
                await this.fetchAll();
                console.log("[DB] Inicialização concluída com sucesso.");
                // Tenta migrar se o Supabase estiver vazio após o fetch
                await this.migrateLocalToSupabase();
            } catch (err) {
                console.error("[DB] Falha crítica no fetch:", err);
                this.loadFromLocalStorageFallback();
            }
        } else {
            this.loadFromLocalStorageFallback();
        }
        console.groupEnd();
        return Promise.resolve();
    }

    async migrateLocalToSupabase() {
        if (localStorage.getItem('ph_migration_v4_success')) return;

        // Se o Supabase estiver vazio, mas o localStorage tiver produtos, migra.
        if (this.data.products.length === 0) {
            const raw = localStorage.getItem(DB_KEY);
            if (raw) {
                const localData = JSON.parse(raw);
                if (localData.products && localData.products.length > 0) {
                    console.log("[DB] Iniciando migração para Supabase...");

                    try {
                        // Categorias
                        if (localData.categories && localData.categories.length > 0) {
                            const cats = localData.categories.map(c => ({ name: c.name, image: c.image }));
                            await this.supabase.from('categories').insert(cats);
                        }

                        // Produtos
                        const prods = localData.products.map(p => ({
                            name: p.name,
                            description: p.description,
                            price: p.price,
                            image: p.image,
                            categoryid: p.categoryId || p.categoryid,
                            paymentlink: p.paymentLink || p.paymentlink,
                            user_id: p.user_id || 'admin'
                        }));

                        const { error } = await this.supabase.from('products').insert(prods);
                        // Configurações
                        if (localData.settings) {
                            const s = localData.settings;
                            const payload = {
                                id: 'global',
                                sitename: s.siteName,
                                herotitle: s.heroTitle,
                                herosubtitle: s.heroSubtitle,
                                primarycolor: s.primaryColor,
                                logourl: s.logoUrl,
                                logosize: s.logoSize,
                                instagramlink: s.instagramLink
                            };
                            await this.supabase.from('settings').upsert(payload);
                        }

                        localStorage.setItem('ph_migration_v4_success', 'true');
                        console.log("[DB] Migração concluída com sucesso.");
                        await this.fetchAll();
                    } catch (err) {
                        console.error("[DB] Falha crítica na migração:", err);
                    }
                }
            }
        }
    }

    // Normaliza nomes de campos (case-insensitive para PostgreSQL)
    normalize(item) {
        if (!item) return item;
        const normalized = {};
        for (const key in item) {
            const lowerKey = key.toLowerCase();
            // Mapeia nomes conhecidos para o camelCase esperado pelo JS do site
            if (lowerKey === 'categoryid') normalized.categoryId = item[key];
            else if (lowerKey === 'paymentlink') normalized.paymentLink = item[key];
            else if (lowerKey === 'promoprice') normalized.promoPrice = item[key];
            else if (lowerKey === 'productid') normalized.productId = item[key];
            else if (lowerKey === 'sitename') normalized.siteName = item[key];
            else if (lowerKey === 'herotitle') normalized.heroTitle = item[key];
            else if (lowerKey === 'herosubtitle') normalized.heroSubtitle = item[key];
            else if (lowerKey === 'primarycolor') normalized.primaryColor = item[key];
            else if (lowerKey === 'logourl') normalized.logoUrl = item[key];
            else if (lowerKey === 'logosize') normalized.logoSize = item[key];
            else if (lowerKey === 'instagramlink') normalized.instagramLink = item[key];
            else normalized[key] = item[key];
        }
        return normalized;
    }

    async fetchAll() {
        const fetch = async (table) => {
            const { data, error } = await this.supabase.from(table).select('*');
            if (error) {
                console.warn(`[DB] Erro na tabela '${table}':`, error.message);
                return null; // Retorna null para indicar falha de rede/tabela
            }
            return (data || []).map(item => this.normalize(item));
        };

        const [products, categories, offers, settings] = await Promise.all([
            fetch('products'),
            fetch('categories'),
            fetch('offers'),
            this.supabase.from('settings').select('*').limit(1)
        ]);

        // PROTEÇÃO: Só substitui se o fetch funcionou (evita limpar o site por erro de conexão)
        if (products !== null) this.data.products = products;
        if (categories !== null) this.data.categories = categories;
        if (offers !== null) this.data.offers = offers;

        if (settings.data && settings.data.length > 0) {
            const normalizedSettings = this.normalize(settings.data[0]);
            // Só sobrescreve o logo se ele tiver um valor real
            if (!normalizedSettings.logoUrl) {
                delete normalizedSettings.logoUrl;
            }
            this.data.settings = { ...this.data.settings, ...normalizedSettings };
        }

        console.log(`[DB] Dados carregados: ${this.data.products.length} Produtos, ${this.data.categories.length} Categorias.`);
        this.dispatchUpdate();
    }

    loadFromLocalStorageFallback() {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) {
            this.data = JSON.parse(raw);
            console.log("[DB] Carregado do cache local (Offline Mode).");
        } else {
            console.log("[DB] Iniciando com dados padrão.");
        }
        this.ensureDataIntegrity();
    }

    ensureDataIntegrity() {
        if (!this.data) this.data = JSON.parse(JSON.stringify(defaultData));
        if (!this.data.categories) this.data.categories = [];
        if (!this.data.products) this.data.products = [];
        if (!this.data.offers) this.data.offers = [];
        if (!this.data.users) this.data.users = [];
        if (!this.data.settings) this.data.settings = JSON.parse(JSON.stringify(defaultData.settings));

        const hasAdmin = this.data.users.find(u => u.email === 'admin@ph.store');
        if (!hasAdmin) this.data.users.push(defaultData.users[0]);
    }

    // No modo Supabase, as mudanças são salvas imediatamente por ação.
    // Esse método permanece para compatibilidade.
    async save() { return true; }

    // --- Métodos Públicos ---

    getSettings() { return this.data.settings; }
    async updateSettings(newSettings) {
        this.data.settings = { ...this.data.settings, ...newSettings };
        if (this.supabase) {
            const s = this.data.settings;
            const payload = {
                id: 'global',
                sitename: s.siteName,
                herotitle: s.heroTitle,
                herosubtitle: s.heroSubtitle,
                primarycolor: s.primaryColor,
                logourl: s.logoUrl,
                logosize: s.logoSize,
                instagramlink: s.instagramLink
            };
            await this.supabase.from('settings').upsert(payload);
        }
        this.dispatchUpdate();
        return true;
    }

    getCategories() { return this.data.categories || []; }
    async addCategory(name, image = '') {
        const cat = { name, image };
        if (this.supabase) {
            const { data, error } = await this.supabase.from('categories').insert([cat]).select();
            if (error) {
                alert("Erro ao salvar categoria no Supabase: " + error.message);
                throw error;
            }
            const newCat = this.normalize(data[0]);
            this.data.categories.push(newCat);
            this.dispatchUpdate();
            return newCat;
        }
        return null;
    }

    async updateCategory(id, name, image = '') {
        if (this.supabase) {
            const { error } = await this.supabase.from('categories').update({ name, image }).eq('id', id);
            if (error) throw error;
            await this.fetchAll(); // Recarregar para garantir sincronia
        }
    }

    async deleteCategory(id) {
        if (this.supabase) {
            const { error } = await this.supabase.from('categories').delete().eq('id', id);
            if (error) throw error;
            await this.fetchAll();
        }
    }

    // --- Métodos de PRODUTOS ---
    async addProduct(product) {
        const user = this.getLoggedUser();
        const payload = {
            name: product.name,
            description: product.description,
            price: product.price,
            image: product.image,
            categoryid: product.categoryId,
            paymentlink: product.paymentLink,
            user_id: user ? user.id : 'admin'
        };

        if (this.supabase) {
            const { data, error } = await this.supabase.from('products').insert([payload]).select();
            if (error) {
                console.error("[DB] Erro no INSERT:", error);
                alert("Erro ao salvar produto: " + error.message);
                throw error;
            }
            const newProd = this.normalize(data[0]);
            this.data.products.push(newProd);
            this.dispatchUpdate();
            return newProd;
        }
        throw new Error("Supabase não inicializado.");
    }

    async updateProduct(id, product) {
        if (this.supabase) {
            const payload = {
                name: product.name,
                description: product.description,
                price: product.price,
                image: product.image,
                categoryid: product.categoryId || product.categoryid,
                paymentlink: product.paymentLink || product.paymentlink
            };
            const { error } = await this.supabase.from('products').update(payload).eq('id', id);
            if (error) throw error;
            await this.fetchAll();
        }
    }

    async deleteProduct(id) {
        if (this.supabase) {
            const { error } = await this.supabase.from('products').delete().eq('id', id);
            if (error) throw error;
            await this.fetchAll();
        }
    }

    getOffers() { return this.data.offers || []; }
    async addOffer(offer) {
        if (this.supabase) {
            const payload = {
                productid: offer.productId || offer.productid,
                promoprice: offer.promoPrice || offer.promoprice
            };
            const { error } = await this.supabase.from('offers').insert([payload]);
            if (error) throw error;
            await this.fetchAll();
        }
    }

    async deleteOffer(id) {
        if (this.supabase) {
            const { error } = await this.supabase.from('offers').delete().eq('id', id);
            if (error) throw error;
            await this.fetchAll();
        }
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
