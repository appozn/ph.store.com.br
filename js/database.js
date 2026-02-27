/*
 * =========================================================================
 *  BANCO DE DADOS GLOBAL COM FIREBASE
 * =========================================================================
 * Para que os dados sejam salvos e sincronizados para TODOS os clientes em
 * tempo real, você precisa colocar as chaves do seu projeto Firebase abaixo.
 * 
 * 1. Acesse https://console.firebase.google.com/ e crie um projeto.
 * 2. Adicione um App Web (</>) e copie as chaves geradas.
 * 3. No menu à esquerda, vá em "Firestore Database" e crie um banco de dados
 *    (inicie as regras em modo de teste para facilitar).
 * 4. Cole as chaves abaixo e salve este arquivo.
 */

const firebaseConfig = {
    // 🔥 COLOQUE SUAS CHAVES AQUI 🔥
    apiKey: "SUA_API_KEY",
    authDomain: "seu-projeto.firebaseapp.com",
    projectId: "seu-projeto",
    storageBucket: "seu-projeto.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

const DB_NAME = 'PHStoreRealDB_v2';
const STORE_NAME = 'ph_store_data';

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

        // Verifica se o Firebase foi preenchido pelo usuário
        this.isFirebaseConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "SUA_API_KEY" && firebaseConfig.apiKey !== "";

        // Opcional pra manter os tabs sincronizados caso seja local
        this.channel = new BroadcastChannel('ph_store_sync');
        this.channel.onmessage = (e) => {
            if (e.data === 'sync' && !this.isFirebaseConfigured) {
                this.loadFromLocalMock().then(() => this.dispatchUpdate());
            }
        };
    }

    dispatchUpdate() {
        const event = new Event('db_updated');
        window.dispatchEvent(event);
    }

    async init() {
        return new Promise((resolve) => {
            if (this.isFirebaseConfigured) {
                // INICIALIZANDO FIREBASE
                try {
                    if (!firebase.apps.length) {
                        firebase.initializeApp(firebaseConfig);
                    }
                    this.dbFirestore = firebase.firestore();
                    this.docRef = this.dbFirestore.collection('store_data').doc('main_data');

                    let isFirstLoad = true;

                    // Listener em tempo real (Sincronização imediata para todos os clientes)
                    this.unsubscribe = this.docRef.onSnapshot((docSnap) => {
                        if (docSnap.exists) {
                            this.data = docSnap.data();
                            this.ensureDataIntegrity();

                            if (isFirstLoad) {
                                isFirstLoad = false;
                                console.log("✅ Dados carregados da Nuvem (Firebase).");
                                resolve();
                            } else {
                                this.dispatchUpdate(); // Atualiza a tela em tempo real
                            }
                        } else {
                            // Documento não existe ainda. Cria baseado no IndexedDB antigo ou defaultData
                            console.log("⚠️ Criando banco de dados inicial na nuvem...");

                            this.loadFromIDB_Legacy().then(legacyData => {
                                if (legacyData) {
                                    console.log("✅ Migrando dados do banco local antigo para a nuvem...");
                                    this.data = legacyData;
                                } else {
                                    this.data = JSON.parse(JSON.stringify(defaultData));
                                }
                                this.ensureDataIntegrity();
                                this.saveToFirebase().then(() => {
                                    if (isFirstLoad) {
                                        isFirstLoad = false;
                                        resolve();
                                    }
                                });
                            });
                        }
                    }, (error) => {
                        console.error("❌ Erro de permissão no Firebase. Você definiu as regras de segurança?", error);
                        console.warn("Dica: Vá no Firestore Database -> Regras (Rules) e coloque: allow read, write: if true;");
                        this.loadFallbackLocal(resolve);
                    });

                } catch (err) {
                    console.error("❌ Erro ao inicializar Firebase:", err);
                    this.loadFallbackLocal(resolve);
                }
            } else {
                // MODO LOCAL (APENAS PARA NÃO QUEBRAR O SITE, MAS NÃO FICA GLOBAL)
                console.warn("⚠️ ALERTA: Firebase não detectado. O site funcionará localmente (dados não aparecerão para clientes). Para arrumar, configure as chaves no database.js!");
                if (window.location.pathname.includes('admin.html')) {
                    const notice = document.createElement('div');
                    notice.innerHTML = `<div style="background: #ef4444; color: white; padding: 15px; text-align: center; margin-bottom: 20px; border-radius: 8px; font-weight: bold; font-size: 14px;">⚠️ INTEGRAÇÃO DO BANCO GLOBAL OBRIGATÓRIA:<br>Para que os produtos apareçam para os seus clientes, edite o arquivo <code style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px;">js/database.js</code> e insira as chaves (apiKey) do seu projeto Firebase!</div>`;
                    document.body.prepend(notice);
                }
                this.loadFromIDB_Legacy().then(legacyData => {
                    if (legacyData) {
                        this.data = legacyData;
                        this.ensureDataIntegrity();
                        resolve();
                    } else {
                        this.loadFallbackLocal(resolve);
                    }
                });
            }
        });
    }

    // ========== INTEGRAÇÃO NUVEM ==========
    async saveToFirebase() {
        if (!this.dbFirestore || !this.docRef || !this.data) return;
        try {
            await this.docRef.set(this.data);
            console.log("Sincronizado na nuvem.");
        } catch (err) {
            console.error("Erro ao salvar no Firebase:", err);
        }
    }


    // ========== BACKUP LOCAL / LEGACY MIGRATION ==========
    loadFallbackLocal(resolve) {
        this.loadFromLocalMock().then(() => resolve());
    }

    async loadFromLocalMock() {
        return new Promise((resolve) => {
            const backup = localStorage.getItem('ph_store_data_local');
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
        });
    }

    async saveToLocalMock() {
        if (!this.data) return;
        localStorage.setItem('ph_store_data_local', JSON.stringify(this.data));
    }

    async loadFromIDB_Legacy() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(DB_NAME, 1);
                request.onsuccess = (e) => {
                    const localDB = e.target.result;
                    if (!localDB.objectStoreNames.contains(STORE_NAME)) {
                        localDB.close();
                        return resolve(null);
                    }
                    const tx = localDB.transaction(STORE_NAME, 'readonly');
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.get('main_data');
                    req.onsuccess = (ev) => {
                        localDB.close();
                        resolve(ev.target.result || null);
                    };
                    req.onerror = () => {
                        localDB.close();
                        resolve(null);
                    }
                };
                request.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    // ========== CORE LOGIC ==========
    save() {
        if (this.isFirebaseConfigured) {
            this.saveToFirebase();
        } else {
            this.saveToLocalMock().then(() => {
                try { if (this.channel) this.channel.postMessage('sync'); } catch (e) { }
                this.dispatchUpdate();
            });
        }
        return true;
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
