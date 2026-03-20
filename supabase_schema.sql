-- SQL para criação das tabelas no Supabase (PH STORE)

-- 1. Tabela de Categorias
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Produtos
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image TEXT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    payment_link TEXT,
    user_id TEXT DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Ofertas (Promocionais)
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    promo_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Configurações Gerais
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    site_name TEXT,
    hero_title TEXT,
    hero_subtitle TEXT,
    primary_color TEXT DEFAULT '#e7229b',
    logo_url TEXT,
    logo_size INTEGER DEFAULT 100,
    instagram_link TEXT,
    whatsapp_number TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir configuração inicial se não existir
INSERT INTO settings (id, site_name, hero_title, primary_color)
VALUES ('global', 'PH STORE', 'PH STORE', '#e7229b')
ON CONFLICT (id) DO NOTHING;
