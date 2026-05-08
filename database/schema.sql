DROP DATABASE IF EXISTS tamu_express_market;
CREATE DATABASE tamu_express_market
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE tamu_express_market;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(150) UNIQUE,
    password VARCHAR(255),
    role ENUM('admin','seller','customer','employee') DEFAULT 'customer',
    status ENUM('pending','approved','rejected','blocked','active') DEFAULT 'active',
    firebase_uid VARCHAR(160) UNIQUE NULL,
    phone VARCHAR(40) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    image LONGTEXT,
    description TEXT
);

CREATE TABLE businesses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    location_id INT,
    name VARCHAR(150),
    location_name VARCHAR(180) NULL,
    owner_name VARCHAR(150) NULL,
    email VARCHAR(150) UNIQUE NULL,
    phone VARCHAR(40) NULL,
    type VARCHAR(50),
    logo LONGTEXT,
    logo_image LONGTEXT,
    rating DECIMAL(2,1) DEFAULT 0,
    latitude DECIMAL(10,7) DEFAULT 0.0000000,
    longitude DECIMAL(10,7) DEFAULT 0.0000000,
    payment_methods TEXT NULL,
    till_number VARCHAR(40) NULL,
    pochi_number VARCHAR(40) NULL,
    bank_account VARCHAR(120) NULL,
    delivery_availability VARCHAR(80) NULL,
    delivery_notes TEXT NULL,
    status ENUM('pending','approved','rejected','blocked') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    business_id INT NULL,
    name VARCHAR(100),
    image LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY categories_business_name_unique (business_id, name),
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    business_id INT,
    category_id INT,
    name VARCHAR(150),
    price DECIMAL(10,2),
    image LONGTEXT,
    offer_flag BOOLEAN DEFAULT FALSE,
    stock INT DEFAULT 0,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE cart (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    session_id VARCHAR(120) NULL,
    product_id INT,
    business_id INT NULL,
    quantity INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY cart_session_product_unique (session_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    public_id VARCHAR(64) UNIQUE NULL,
    customer_name VARCHAR(160) NULL,
    customer_phone VARCHAR(40) NULL,
    buyer_location VARCHAR(255) NULL,
    buyer_latitude DECIMAL(10,7) DEFAULT 0.0000000,
    buyer_longitude DECIMAL(10,7) DEFAULT 0.0000000,
    payment_method VARCHAR(80) NULL,
    payment_status VARCHAR(30) DEFAULT 'pending',
    mpesa_name VARCHAR(160) NULL,
    mpesa_number VARCHAR(40) NULL,
    mpesa_ref VARCHAR(100),
    mpesa_reference VARCHAR(100) NULL,
    notes TEXT NULL,
    store_summary VARCHAR(255) NULL,
    items JSON,
    subtotal DECIMAL(10,2) DEFAULT 0.00,
    total DECIMAL(10,2),
    delivery_fee DECIMAL(10,2),
    status ENUM('pending','pending_payment','paid','processing','delivered','cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NULL,
    product_public_id VARCHAR(64) NULL,
    product_name VARCHAR(160),
    business_id INT NULL,
    store_public_id VARCHAR(64) NULL,
    store_name VARCHAR(160) NULL,
    business_name VARCHAR(160),
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10,2) DEFAULT 0.00,
    line_total DECIMAL(10,2) DEFAULT 0.00,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL
);

CREATE TABLE order_route_breakdown (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    store_public_id VARCHAR(64) NULL,
    store_name VARCHAR(160) NULL,
    distance_km DECIMAL(8,2) DEFAULT 0.00,
    route_fee DECIMAL(10,2) DEFAULT 0.00,
    quantity INT DEFAULT 0,
    subtotal DECIMAL(10,2) DEFAULT 0.00,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NULL,
    order_public_id VARCHAR(64) NULL,
    business_id INT NULL,
    method VARCHAR(80),
    reference VARCHAR(120),
    amount DECIMAL(10,2) DEFAULT 0.00,
    status ENUM('pending','submitted','paid','failed') DEFAULT 'submitted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL
);

CREATE TABLE deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NULL,
    order_public_id VARCHAR(64) NULL,
    employee_id INT NULL,
    status ENUM('pending','assigned','processing','delivered','cancelled') DEFAULT 'pending',
    distance_km DECIMAL(8,2) DEFAULT 0.00,
    delivery_fee DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE SET NULL
);
