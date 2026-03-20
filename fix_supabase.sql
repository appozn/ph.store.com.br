-- SCRIPT PARA CORRIGIR O BANCO DE DADOS NO SUPABASE
-- Copie e cole no "SQL Editor" do Supabase e clique em "Run"

-- 1. Tabela de Categorias (caso não exista)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Corrigindo a Tabela de Produtos
-- Adiciona a coluna category_id se ela não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='category_id') THEN
        ALTER TABLE products ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
    END IF;

    -- Adiciona payment_link se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='payment_link') THEN
        ALTER TABLE products ADD COLUMN payment_link TEXT;
    END IF;

    -- Adiciona user_id se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='user_id') THEN
        ALTER TABLE products ADD COLUMN user_id TEXT DEFAULT 'admin';
    END IF;
END $$;

-- 3. Tabela de Ofertas (caso não exista)
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    promo_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Configurações (caso não exista ou esteja com nomes antigos)
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

-- Garante que as colunas de settings usem snake_case
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='site_name') THEN
        ALTER TABLE settings ADD COLUMN site_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='hero_title') THEN
        ALTER TABLE settings ADD COLUMN hero_title TEXT;
    END IF;
END $$;
