const DB_NAME = 'PHStoreRealDB_v2';
const STORE_NAME = 'ph_store_data';
const IMG_STORE = 'ph_store_images';

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
        this.idb = null;
        this.channel = new BroadcastChannel('ph_store_sync');

        this.channel.onmessage = (e) => {
            if (e.data === 'sync' && this.idb) {
                this.loadFromIDB().then(() => {
                    this.dispatchUpdate();
                });
            }
        };
        this.saveTimeout = null;
    }

    dispatchUpdate() {
        const event = new Event('db_updated');
        window.dispatchEvent(event);
    }

    async init() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.warn("Database init timeout. Falling back to default data.");
                this.data = JSON.parse(JSON.stringify(defaultData));
                resolve();
            }, 5000);

            try {
                const request = indexedDB.open(DB_NAME, 1);

                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                    if (!db.objectStoreNames.contains(IMG_STORE)) {
                        db.createObjectStore(IMG_STORE);
                    }
                };

                request.onsuccess = (e) => {
                    clearTimeout(timeout);
                    this.idb = e.target.result;
                    this.loadFromIDB().then(resolve).catch(err => {
                        console.error("Error loading data after init:", err);
                        resolve();
                    });
                };

                request.onerror = (e) => {
                    clearTimeout(timeout);
                    console.error("IndexedDB open error:", e);
                    this.data = JSON.parse(JSON.stringify(defaultData));
                    resolve();
                };

                request.onblocked = () => {
                    clearTimeout(timeout);
                    console.warn("IndexedDB blocked. Please close other tabs.");
                    this.data = JSON.parse(JSON.stringify(defaultData));
                    resolve();
                };
            } catch (err) {
                clearTimeout(timeout);
                console.error("Database init exception:", err);
                this.data = JSON.parse(JSON.stringify(defaultData));
                resolve();
            }
        });
    }

    async loadFromIDB() {
        return new Promise((resolve) => {
            if (!this.idb) {
                this.data = JSON.parse(JSON.stringify(defaultData));
                return resolve();
            }

            try {
                const tx = this.idb.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get('main_data');

                req.onsuccess = async (e) => {
                    if (e.target.result) {
                        this.data = e.target.result;
                        console.log("Data loaded from IDB v2.");
                    } else {
                        console.log("IDB v2 empty. Attempting migration...");
                        // 1. Try migration from v1 (PHStoreRealDB)
                        const migratedData = await this.tryMigrationFromV1();
                        if (migratedData) {
                            this.data = migratedData;
                            console.log("Data migrated from v1.");
                        } else {
                            // 2. Try fallback from localStorage
                            const backup = localStorage.getItem('ph_store_backup');
                            if (backup) {
                                try {
                                    this.data = JSON.parse(backup);
                                    console.log("Data recovered from backup.");
                                } catch (err) {
                                    this.data = JSON.parse(JSON.stringify(defaultData));
                                }
                            } else {
                                this.data = JSON.parse(JSON.stringify(defaultData));
                            }
                        }
                        await this.saveToIDB();
                    }

                    this.ensureDataIntegrity();
                    resolve();
                };

                req.onerror = (e) => {
                    console.error("Error getting main_data:", e);
                    this.data = JSON.parse(JSON.stringify(defaultData));
                    resolve();
                };
            } catch (err) {
                console.error("Transaction error in loadFromIDB:", err);
                this.data = JSON.parse(JSON.stringify(defaultData));
                resolve();
            }
        });
    }

    async tryMigrationFromV1() {
        return new Promise((resolve) => {
            const req = indexedDB.open('PHStoreRealDB', 1);
            req.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('ph_store_data')) {
                    db.close();
                    return resolve(null);
                }
                const tx = db.transaction('ph_store_data', 'readonly');
                const store = tx.objectStore('ph_store_data');
                const getReq = store.get('main_data');
                getReq.onsuccess = (ge) => {
                    db.close();
                    resolve(ge.target.result || null);
                };
                getReq.onerror = () => {
                    db.close();
                    resolve(null);
                };
            };
            req.onerror = () => resolve(null);
        });
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
            this.saveToIDB();
        } else if (hasAdmin.password === 'phstore.com.br') {
            hasAdmin.password = 'phstore.adm';
            this.saveToIDB();
        }
    }

    async saveToIDB() {
        if (!this.idb || !this.data) return;
        if (this.saveTimeout) clearTimeout(this.saveTimeout);

        return new Promise((resolve) => {
            this.saveTimeout = setTimeout(async () => {
                try {
                    const tx = this.idb.transaction([STORE_NAME, IMG_STORE], 'readwrite');

                    // Handle Images separately if they are too large
                    // For now, we keep the structure but optimize the persistence
                    const store = tx.objectStore(STORE_NAME);
                    store.put(this.data, 'main_data');

                    tx.oncomplete = () => {
                        try {
                            // Backup only metadata to localStorage
                            const minimal = JSON.parse(JSON.stringify(this.data));
                            if (minimal.products) minimal.products.forEach(p => p.image = p.image?.length > 500 ? 'IMG' : p.image);
                            if (minimal.categories) minimal.categories.forEach(c => c.image = c.image?.length > 500 ? 'IMG' : c.image);
                            localStorage.setItem('ph_store_backup', JSON.stringify(minimal));
                        } catch (e) { }
                        resolve();
                    };
                    tx.onerror = () => resolve();
                } catch (err) {
                    console.error("Save error:", err);
                    resolve();
                }
            }, 50);
        });
    }

    save() {
        this.saveToIDB().then(() => {
            try {
                if (this.channel) this.channel.postMessage('sync');
            } catch (e) { }
            this.dispatchUpdate();
        });
        return true;
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
        product.id = Date.now().toString();
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
        offer.id = Date.now().toString();
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
            id: Date.now().toString(),
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
        // Prevent deleting yourself
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

            // Broadcast login so other scripts know (not strictly db cross-tab but good)
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
