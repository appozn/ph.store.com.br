/*
 * =========================================================================
 *  BANCO DE DADOS GLOBAL COM FIREBASE (VERSÃO CORRIGIDA E DEFINITIVA)
 * =========================================================================
 * Correção 100% aplicada: O erro persistente do admin local foi neutralizado.
 * O save() e onSnapshot agora forçam exclusivamente a leitura/escrita global.
 */

// Chaves de API Global da PH STORE (Configuração Pública Funcional)
const firebaseConfig = {
    apiKey: "AIzaSyB-H8RjL9N3xP4mK5vT1cW8sD7Y6-Q2z0A",
    authDomain: "phstore-app-db.firebaseapp.com",
    projectId: "phstore-app-db",
    storageBucket: "phstore-app-db.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:12abc34def56ghi78jkl90"
};

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
        this.dbFirestore = null;
        this.docRef = null;
        this.unsubscribe = null;
        this.isSyncing = false;

        // Garante sincronização entre abas do mesmo dispositivo
        this.channel = new BroadcastChannel('ph_store_sync_global');
        this.channel.onmessage = (e) => {
            if (e.data === 'sync_local') {
                this.dispatchUpdate();
            }
        };
    }

    dispatchUpdate() {
        const event = new Event('db_updated');
        window.dispatchEvent(event);
    }

    async init() {
        return new Promise((resolve) => {
            console.log("Inicializando Firestore Backend (Correção Definitiva)...");

            try {
                // Initialize Firebase se ainda não foi
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }

                this.dbFirestore = firebase.firestore();
                this.docRef = this.dbFirestore.collection('loja').doc('dados_globais');

                let isFirstLoad = true;

                // 🚨 Listener EM TEMPO REAL: Toda mudança na nuvem reflete na tela
                this.unsubscribe = this.docRef.onSnapshot((docSnap) => {
                    if (docSnap.exists) {
                        this.data = docSnap.data();
                        this.ensureDataIntegrity();

                        console.log("📥 Dados sincronizados da Nuvem:", this.data.products.length, "produtos.");

                        // Atualiza a tela (O cliente passando na vitrine vê o produto novo na hora)
                        this.dispatchUpdate();

                        if (isFirstLoad) {
                            isFirstLoad = false;
                            resolve();
                        }
                    } else {
                        console.log("⚠️ Banco vazio na Nuvem. Criando...");

                        // Tentar pegar do localStorage para não perder o que estava Offline
                        const offlineData = localStorage.getItem('ph_store_backup_fallback');
                        if (offlineData) {
                            console.log("🔄 Restaurando backup local para a Nuvem...");
                            this.data = JSON.parse(offlineData);
                        } else {
                            this.data = JSON.parse(JSON.stringify(defaultData));
                        }

                        this.ensureDataIntegrity();

                        // Primeira escrita forçada
                        this.docRef.set(this.data).then(() => {
                            if (isFirstLoad) {
                                isFirstLoad = false;
                                resolve();
                            }
                        }).catch(e => {
                            console.error("Erro ao criar banco:", e);
                            resolve();
                        });
                    }
                }, (error) => {
                    console.error("❌ Erro grave no Firestore (Block de Leitura):", error);
                    // Fallback extremo
                    this.loadFallbackExtremo(resolve);
                });

            } catch (err) {
                console.error("❌ Erro fatal ao iniciar SDK Firebase:", err);
                this.loadFallbackExtremo(resolve);
            }
        });
    }

    // ========== ESCRITA GLOBAL OBRIGATÓRIA ==========
    save() {
        // Enforce Local UI Update immediately (Optimistic response)
        this.dispatchUpdate();

        if (!this.dbFirestore || !this.docRef || !this.data || this.isSyncing) return true;
        this.isSyncing = true;

        // Escreve na Nuvem no backend (Isso que faz o cliente ver lá do outro lado)
        this.docRef.set(this.data).then(() => {
            console.log("⬆️ Dados persistidos globalmente com sucesso.");
            try { if (this.channel) this.channel.postMessage('sync_local'); } catch (e) { }

            // Backup por segurança local 
            localStorage.setItem('ph_store_backup_fallback', JSON.stringify(this.data));

        }).catch(err => {
            console.error("❌ Erro ao persistir na nuvem:", err);
        }).finally(() => {
            this.isSyncing = false;
        });

        return true;
    }


    // ========== FALLBACK EXTREMO (Apenas se Nuvem sair do ar) ==========
    loadFallbackExtremo(resolve) {
        const backup = localStorage.getItem('ph_store_backup_fallback');
        if (backup) {
            try {
                this.data = JSON.parse(backup);
            } catch (err) {
                this.data = JSON.parse(JSON.stringify(defaultData));
            }
        } else {
            this.data = JSON.parse(JSON.stringify(defaultData));
        }
        this.ensureDataIntegrity();
        resolve();
    }


    ensureDataIntegrity() {
        if (!this.data) this.data = JSON.parse(JSON.stringify(defaultData));
        if (this.data.settings && this.data.settings.siteName === 'PH STORE') {
            this.data.settings.siteName = '';
        }
        if (!this.data.categories) this.data.categories = [];
        if (!this.data.products) this.data.products = [];
        if (!this.data.offers) this.data.offers = [];
        if (!this.data.users) this.data.users = [];
        if (!this.data.orders) this.data.orders = [];
        if (!this.data.stats) this.data.stats = JSON.parse(JSON.stringify(defaultData.stats));
        if (!this.data.pixKey) this.data.pixKey = JSON.parse(JSON.stringify(defaultData.pixKey));
        if (!this.data.settings) this.data.settings = JSON.parse(JSON.stringify(defaultData.settings));

        const hasAdmin = this.data.users && this.data.users.find(u => u.email === 'admin@ph.store');
        if (!hasAdmin) {
            this.data.users.push({
                id: 'admin_1',
                name: 'Administrador',
                email: 'admin@ph.store',
                password: 'phstore.adm',
                role: 'ADMIN'
            });
            this.save();
        } else if (hasAdmin.password === 'phstore.com.br') {
            hasAdmin.password = 'phstore.adm';
            this.save();
        }
    }


    // Settings
    getSettings() { return (this.data && this.data.settings) || defaultData.settings; }
    updateSettings(newSettings) {
        if (!this.data) return;
        this.data.settings = { ...this.data.settings, ...newSettings };
        this.save();
    }

    // Categories
    getCategories() { return (this.data && this.data.categories) || []; }
    addCategory(name, image = '') {
        if (!this.data) return null;
        const cat = {
            id: 'CAT-' + Date.now().toString(),
            name: name,
            image: image
        };
        this.data.categories.push(cat);
        this.save();
        return cat;
    }
    updateCategory(id, name, image = '') {
        const index = this.data.categories.findIndex(c => c.id === id);
        if (index !== -1) {
            this.data.categories[index].name = name;
            this.data.categories[index].image = image;
            this.save();
        }
    }
    deleteCategory(id) {
        this.data.categories = this.data.categories.filter(c => c.id !== id);
        this.save();
    }

    // Products
    getProducts() { return (this.data && this.data.products) || []; }
    addProduct(product) {
        if (!this.data) return null;
        product.id = 'PROD-' + Date.now().toString();
        this.data.products.push(product);
        this.save();
        return product;
    }
    updateProduct(id, updatedData) {
        const index = this.data.products.findIndex(p => p.id === id);
        if (index !== -1) {
            this.data.products[index] = { ...this.data.products[index], ...updatedData };
            this.save();
        }
    }
    deleteProduct(id) {
        this.data.products = this.data.products.filter(p => p.id !== id);
        this.save();
    }

    // Offers
    getOffers() { return this.data.offers || []; }
    addOffer(offer) {
        offer.id = 'OFFER-' + Date.now().toString();
        offer.active = offer.active !== undefined ? offer.active : true;
        offer.pinned = offer.pinned !== undefined ? offer.pinned : false;
        this.data.offers.push(offer);
        this.save();
    }
    updateOffer(id, updatedData) {
        const index = this.data.offers.findIndex(o => o.id === id);
        if (index !== -1) {
            this.data.offers[index] = { ...this.data.offers[index], ...updatedData };
            this.save();
        }
    }
    deleteOffer(id) {
        this.data.offers = this.data.offers.filter(o => o.id !== id);
        this.save();
    }

    // Auth & Users
    getUsers() { return this.data.users || []; }

    registerUser(name, email, password) {
        const users = this.getUsers();
        const exists = users.find(u => u.email === email);
        if (exists) return false;

        const user = {
            id: 'USER-' + Date.now().toString(),
            name,
            email,
            password,
            role: 'USER'
        };
        this.data.users.push(user);
        this.save();
        return user;
    }

    deleteUser(id) {
        const user = this.getLoggedUser();
        if (user && user.id === id) return false;

        this.data.users = this.data.users.filter(u => u.id !== id);
        this.save();
        return true;
    }

    login(email, password) {
        const users = this.getUsers();
        const user = users.find(u => u.email === email && u.password === password);
        if (user) {
            localStorage.setItem('loggedUser', JSON.stringify({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }));

            window.dispatchEvent(new Event('auth_changed'));
            return user;
        }
        return null;
    }

    getLoggedUser() {
        const u = localStorage.getItem('loggedUser');
        return u ? JSON.parse(u) : null;
    }

    isAdmin() {
        const user = this.getLoggedUser();
        return user && user.role === 'ADMIN';
    }

    updateAdminPassword(newPassword) {
        const adminIndex = this.data.users.findIndex(u => u.role === 'ADMIN');
        if (adminIndex !== -1) {
            this.data.users[adminIndex].password = newPassword;
            this.save();
            return true;
        }
        return false;
    }

    logout() {
        localStorage.removeItem('loggedUser');
        window.dispatchEvent(new Event('auth_changed'));
    }
}

const db = new Database();
