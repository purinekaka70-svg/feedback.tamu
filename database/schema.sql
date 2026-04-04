CREATE DATABASE IF NOT EXISTS tamu_express_market
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tamu_express_market;

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(120) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY admins_username_unique (username)
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY categories_name_unique (name)
);

CREATE TABLE IF NOT EXISTS seller_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(64) NOT NULL,
  store_name VARCHAR(160) NOT NULL,
  business_type ENUM('supermarket', 'retail', 'wholesale') NOT NULL,
  owner_name VARCHAR(160) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  location_name VARCHAR(180) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  category_focus TEXT NOT NULL,
  minimum_order DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  prep_time VARCHAR(80) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY seller_applications_public_id_unique (public_id)
);

CREATE TABLE IF NOT EXISTS seller_application_payment_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  payment_method VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY seller_application_payment_unique (application_id, payment_method),
  CONSTRAINT seller_application_payment_methods_application_fk
    FOREIGN KEY (application_id) REFERENCES seller_applications (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(64) NOT NULL,
  seller_application_id BIGINT UNSIGNED NULL,
  seller_public_id VARCHAR(64) NOT NULL,
  store_name VARCHAR(160) NOT NULL,
  product_name VARCHAR(160) NOT NULL,
  product_category VARCHAR(120) NOT NULL,
  product_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  product_stock VARCHAR(120) NOT NULL,
  product_deal VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY product_drafts_public_id_unique (public_id),
  KEY product_drafts_seller_public_id_index (seller_public_id),
  CONSTRAINT product_drafts_application_fk
    FOREIGN KEY (seller_application_id) REFERENCES seller_applications (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(160) NOT NULL,
  customer_phone VARCHAR(40) NOT NULL,
  buyer_location VARCHAR(255) NOT NULL,
  buyer_latitude DECIMAL(10,7) NOT NULL DEFAULT 0.0000000,
  buyer_longitude DECIMAL(10,7) NOT NULL DEFAULT 0.0000000,
  payment_method VARCHAR(80) NOT NULL,
  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  store_summary VARCHAR(255) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending', 'sourcing', 'dispatch', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY orders_public_id_unique (public_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_public_id VARCHAR(64) NOT NULL,
  product_name VARCHAR(160) NOT NULL,
  store_public_id VARCHAR(64) NOT NULL,
  store_name VARCHAR(160) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  CONSTRAINT order_items_order_fk
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_route_breakdown (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  store_public_id VARCHAR(64) NOT NULL,
  store_name VARCHAR(160) NOT NULL,
  distance_km DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  route_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  CONSTRAINT order_route_breakdown_order_fk
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seller_offers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(64) NOT NULL,
  seller_public_id VARCHAR(64) NOT NULL,
  store_name VARCHAR(160) NOT NULL,
  offer_title VARCHAR(180) NOT NULL,
  offer_note TEXT NOT NULL,
  offer_expiry VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY seller_offers_public_id_unique (public_id),
  KEY seller_offers_seller_public_id_index (seller_public_id)
);

INSERT INTO categories (name) VALUES
  ('Beverages'),
  ('Drinks'),
  ('Groceries'),
  ('Fresh Foods'),
  ('Household'),
  ('Snacks'),
  ('Dairy'),
  ('Wholesale Packs')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Add your real admin user after generating a PHP password hash.
-- Example:
-- INSERT INTO admins (username, display_name, password_hash)
-- VALUES ('TamuAdmin@2025', 'Tamu Express Admin', '$2y$10$replace_with_real_hash');
