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
        instagramLink: '',
        whatsappNumber: '5544997153209'
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
                console.log("%c[DB] Inicialização concluída (v4.1 - ID Fix Applied).", "color: #4ade80; font-weight: bold;");
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
        if (localStorage.getItem('ph_migration_v5_success')) return;

        if (this.data.products.length === 0) {
            try {
                const raw = localStorage.getItem(DB_KEY);
                if (raw) {
                    const localData = JSON.parse(raw);
                    if (localData && localData.products && localData.products.length > 0) {
                        console.log("[DB] Iniciando migração para Supabase...");

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
                            category_id: p.categoryId || p.categoryid || p.category_id,
                            payment_link: p.paymentLink || p.paymentlink || p.payment_link,
                            user_id: p.user_id || 'admin'
                        }));

                        await this.supabase.from('products').insert(prods);

                        // Configurações
                        if (localData.settings) {
                            const s = localData.settings;
                            const payload = {
                                id: 'global',
                                site_name: s.siteName,
                                hero_title: s.heroTitle,
                                hero_subtitle: s.heroSubtitle,
                                primary_color: s.primaryColor,
                                logo_url: s.logoUrl,
                                logo_size: s.logoSize,
                                instagram_link: s.instagramLink
                            };
                            await this.supabase.from('settings').upsert(payload);
                        }

                        localStorage.setItem('ph_migration_v5_success', 'true');
                        console.log("[DB] Migração concluída com sucesso.");
                        await this.fetchAll();
                    }
                }
            } catch (err) {
                console.error("[DB] Falha durante a migração/leitura local:", err);
            }
        }
    }

    // Normaliza nomes de campos (case-insensitive para PostgreSQL)
    normalize(item) {
        if (!item) return item;
        const normalized = {};
        const fieldMap = {
            category_id: 'categoryId',
            payment_link: 'paymentLink',
            promo_price: 'promoPrice',
            product_id: 'productId',
            site_name: 'siteName',
            hero_title: 'heroTitle',
            hero_subtitle: 'heroSubtitle',
            primary_color: 'primaryColor',
            logo_url: 'logoUrl',
            logo_size: 'logoSize',
            instagram_link: 'instagramLink',
            whatsapp_number: 'whatsappNumber'
        };

        for (const key in item) {
            const lowerKey = key.toLowerCase();
            const targetKey = fieldMap[lowerKey] || key;
            normalized[targetKey] = item[key];
        }
        return normalized;
    }

    // Tenta converter ID para número se for numérico, caso contrário mantém string
    parseId(id) {
        if (typeof id === 'number') return id;
        if (!id) return id;
        const n = Number(id);
        return isNaN(n) ? id : n;
    }

    async fetchAll() {
        try {
            const fetchTable = async (table) => {
                try {
                    const { data, error } = await this.supabase.from(table).select('*');
                    if (error) {
                        console.warn(`[DB] Erro na tabela '${table}':`, error.message);
                        return null;
                    }
                    return (data || []).map(item => this.normalize(item));
                } catch (e) {
                    console.error(`[DB] Erro inesperado ao buscar ${table}:`, e);
                    return null;
                }
            };

            const [products, categories, offers, settingsResult] = await Promise.all([
                fetchTable('products'),
                fetchTable('categories'),
                fetchTable('offers'),
                (async () => {
                    try {
                        return await this.supabase.from('settings').select('*').limit(1);
                    } catch (e) {
                        return { error: e, data: null };
                    }
                })()
            ]);

            if (products) {
                this.data.products = products;
                console.log(`[DB] ${products.length} produtos carregados.`);
            }
            if (categories) {
                this.data.categories = categories;
                console.log(`[DB] ${categories.length} categorias carregadas.`);
            }
            if (offers) {
                this.data.offers = offers;
            }

            if (settingsResult && settingsResult.data && settingsResult.data.length > 0) {
                const normalizedSettings = this.normalize(settingsResult.data[0]);
                if (!normalizedSettings.logoUrl) delete normalizedSettings.logoUrl;
                this.data.settings = { ...this.data.settings, ...normalizedSettings };
            }

            console.log(`[DB] Sincronização concluída: ${this.data.products.length} Produtos.`);
            this.dispatchUpdate();
        } catch (err) {
            console.error("[DB] Erro fatal no fetchAll:", err);
            throw err; // Repassa para o init lidar
        }
    }

    loadFromLocalStorageFallback() {
        try {
            const raw = localStorage.getItem(DB_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    this.data = parsed;
                    console.log("[DB] Cache local recuperado.");
                }
            }
        } catch (e) {
            console.error("[DB] Cache local corrompido, usando padrões.", e);
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

    // Força o salvamento local de segurança
    async save() {
        try {
            // Se os dados forem muito grandes (base64), tenta salvar sem o cache de imagens para não estourar o limite
            const dataToSave = JSON.parse(JSON.stringify(this.data));

            // Tenta salvar completo
            try {
                localStorage.setItem(DB_KEY, JSON.stringify(dataToSave));
            } catch (quotaErr) {
                console.warn("[DB] Limite de armazenamento local atingido. Removendo imagens do cache para salvar.");
                // Remove imagens base64 dos produtos no cache de backup para salvar espaço
                if (dataToSave.products) {
                    dataToSave.products.forEach(p => {
                        if (p.image && p.image.length > 5000) p.image = '';
                    });
                }
                localStorage.setItem(DB_KEY, JSON.stringify(dataToSave));
            }
            console.log("[DB] Cache local sincronizado.");
            return true;
        } catch (e) {
            console.error("[DB] Falha ao salvar cache:", e);
            return false;
        }
    }

    // Utilitário para limpar número de WhatsApp
    cleanWhatsApp(number) {
        if (!number) return '';
        // Se for um link completo, tenta extrair o número
        if (number.includes('wa.me/')) {
            const parts = number.split('wa.me/');
            number = parts[parts.length - 1].split('?')[0];
        } else if (number.includes('whatsapp.com/send')) {
            const urlParams = new URLSearchParams(number.split('?')[1]);
            number = urlParams.get('phone') || number;
        }
        return number.replace(/\D/g, '');
    }

    // --- Métodos Públicos ---

    getSettings() { return this.data.settings; }
    async updateSettings(newSettings) {
        this.data.settings = { ...this.data.settings, ...newSettings };
        if (this.supabase) {
            const s = this.data.settings;
            const payload = {
                id: 'global',
                site_name: s.siteName,
                hero_title: s.heroTitle,
                hero_subtitle: s.heroSubtitle,
                primary_color: s.primaryColor,
                logo_url: s.logoUrl,
                logo_size: s.logoSize,
                instagram_link: s.instagramLink,
                whatsapp_number: s.whatsappNumber
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
            try {
                // Removemos .select() para evitar bloqueios de RLS (Row Level Security) na leitura
                const { error } = await this.supabase.from('categories').insert([cat]);
                if (error) {
                    console.error("[DB] Erro CRUD (categories):", error);
                    throw new Error(`[Código DB: ${error.code}] ${error.message} - ${error.details || ''}`);
                }

                // Forçamos atualização geral para buscar os IDs gerados pelas tabelas
                await this.fetchAll();

                // Encontra a categoria pela ordenação ou nome/imagem
                const savedCats = this.data.categories;
                return savedCats.length > 0 ? savedCats[savedCats.length - 1] : { id: 'CAT-' + Date.now(), ...cat };
            } catch (err) {
                console.error("[DB] Falha crítica em addCategory:", err);
                throw err;
            }
        } else {
            const newCat = { id: 'CAT-' + Date.now(), name, image };
            this.data.categories.push(newCat);
            await this.save();
            this.dispatchUpdate();
            return newCat;
        }
    }

    async updateCategory(id, name, image = '') {
        const payload = {
            name,
            image
        };
        if (this.supabase) {
            const { error } = await this.supabase.from('categories').update(payload).eq('id', this.parseId(id));
            if (error) {
                console.error("[DB] Erro ao atualizar categoria:", error.message);
                throw new Error("Erro no Supabase: " + error.message);
            }
            await this.fetchAll();
        } else {
            const pid = this.parseId(id);
            const idx = this.data.categories.findIndex(c => this.parseId(c.id) === pid);
            if (idx !== -1) {
                this.data.categories[idx] = { ...this.data.categories[idx], name, image };
                await this.save();
                this.dispatchUpdate();
            }
        }
    }

    async deleteCategory(id) {
        if (this.supabase) {
            const pid = this.parseId(id);
            const { error } = await this.supabase.from('categories').delete().eq('id', pid);
            if (error) {
                console.error("[DB] Erro ao excluir categoria:", error);
                throw new Error("Erro no Supabase: " + (error.message || JSON.stringify(error)));
            }
            await this.fetchAll();
        } else {
            const pid = this.parseId(id);
            this.data.categories = this.data.categories.filter(c => this.parseId(c.id) !== pid);
            await this.save();
            this.dispatchUpdate();
        }
    }

    getProducts() { return this.data.products || []; }

    // --- Métodos de PRODUTOS ---
    async addProduct(product) {
        const user = this.getLoggedUser();
        const payload = {
            name: product.name,
            description: product.description,
            price: product.price,
            image: product.image,
            category_id: product.categoryId,
            payment_link: product.paymentLink,
            user_id: user ? String(user.id) : 'admin'
        };

        if (this.supabase) {
            try {
                // Removemos .select() para evitar bloqueios de RLS na leitura
                const { error } = await this.supabase.from('products').insert([payload]);
                if (error) {
                    console.error("[DB] Erro CRUD (products):", error);
                    throw new Error(`[Código DB: ${error.code}] ${error.message} - ${error.details || ''}`);
                }

                // Forçamos atualização geral
                await this.fetchAll();

                const savedProds = this.data.products;
                return savedProds.length > 0 ? savedProds[savedProds.length - 1] : { id: 'PROD-' + Date.now(), ...payload };
            } catch (err) {
                console.error("[DB] Falha crítica em addProduct:", err);
                throw err;
            }
        } else {
            const newProd = { ...product, id: 'PROD-' + Date.now() };
            this.data.products.push(newProd);
            await this.save();
            this.dispatchUpdate();
            return newProd;
        }
    }

    async updateProduct(id, product) {
        const user = this.getLoggedUser();
        if (this.supabase) {
            const payload = {
                name: product.name,
                description: product.description,
                price: product.price,
                image: product.image,
                category_id: product.categoryId,
                payment_link: product.paymentLink,
                user_id: user ? String(user.id) : 'admin'
            };
            const { error } = await this.supabase.from('products').update(payload).eq('id', this.parseId(id));
            if (error) {
                console.error("[DB] Erro ao atualizar produto:", error.message);
                throw new Error("Erro no Supabase: " + error.message);
            }
            await this.fetchAll();
        } else {
            const pid = this.parseId(id);
            const idx = this.data.products.findIndex(p => this.parseId(p.id) === pid);
            if (idx !== -1) {
                this.data.products[idx] = { ...this.data.products[idx], ...product };
                await this.save();
                this.dispatchUpdate();
            }
        }
    }

    async deleteProduct(id) {
        if (this.supabase) {
            const pid = this.parseId(id);
            const { error } = await this.supabase.from('products').delete().eq('id', pid);
            if (error) {
                console.error("[DB] Erro ao excluir produto:", error);
                throw new Error("Erro no Supabase: " + (error.message || JSON.stringify(error)));
            }
            await this.fetchAll();
        } else {
            const pid = this.parseId(id);
            this.data.products = this.data.products.filter(p => this.parseId(p.id) !== pid);
            await this.save();
            this.dispatchUpdate();
        }
    }

    getOffers() { return this.data.offers || []; }
    async addOffer(offer) {
        if (this.supabase) {
            const payload = {
                product_id: offer.productId || offer.productid || offer.product_id,
                promo_price: offer.promoPrice || offer.promoprice || offer.promo_price
            };
            const { error } = await this.supabase.from('offers').insert([payload]);
            if (error) throw error;
            await this.fetchAll();
        }
    }

    async deleteOffer(id) {
        if (this.supabase) {
            const { error } = await this.supabase.from('offers').delete().eq('id', this.parseId(id));
            if (error) {
                console.error("[DB] Erro ao excluir oferta:", error.message);
                throw new Error("Erro no Supabase: " + error.message);
            }
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
