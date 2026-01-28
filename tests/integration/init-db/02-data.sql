-- Test data initialization
-- This script populates tables with sample data for integration testing

USE test_db;

-- Insert test users
INSERT INTO users (username, email) VALUES
    ('alice', 'alice@example.com'),
    ('bob', 'bob@example.com'),
    ('charlie', 'charlie@example.com'),
    ('diana', 'diana@example.com'),
    ('eve', 'eve@example.com');

-- Insert test products
INSERT INTO products (name, description, price, stock, category) VALUES
    ('Laptop', 'High-performance laptop', 1299.99, 10, 'electronics'),
    ('Mouse', 'Wireless mouse', 29.99, 50, 'electronics'),
    ('Keyboard', 'Mechanical keyboard', 89.99, 30, 'electronics'),
    ('Monitor', '27-inch 4K monitor', 399.99, 15, 'electronics'),
    ('Desk Chair', 'Ergonomic office chair', 249.99, 20, 'furniture'),
    ('Desk', 'Standing desk', 499.99, 8, 'furniture'),
    ('Notebook', 'Spiral notebook', 4.99, 100, 'stationery'),
    ('Pen Set', 'Set of 10 pens', 9.99, 75, 'stationery'),
    ('Coffee Mug', 'Ceramic coffee mug', 12.99, 40, 'kitchenware'),
    ('Water Bottle', 'Insulated water bottle', 24.99, 35, 'kitchenware');

-- Insert test orders
INSERT INTO orders (user_id, total_amount, status) VALUES
    (1, 1329.98, 'completed'),
    (1, 89.99, 'processing'),
    (2, 649.98, 'completed'),
    (3, 14.98, 'pending'),
    (4, 499.99, 'processing'),
    (5, 37.98, 'completed');

-- Insert test order items
INSERT INTO order_items (order_id, product_id, quantity, price) VALUES
    -- Order 1 (alice): Laptop + Mouse
    (1, 1, 1, 1299.99),
    (1, 2, 1, 29.99),
    -- Order 2 (alice): Keyboard
    (2, 3, 1, 89.99),
    -- Order 3 (bob): Monitor + Desk Chair
    (3, 4, 1, 399.99),
    (3, 5, 1, 249.99),
    -- Order 4 (charlie): Notebook + Pen Set
    (4, 7, 1, 4.99),
    (4, 8, 1, 9.99),
    -- Order 5 (diana): Desk
    (5, 6, 1, 499.99),
    -- Order 6 (eve): Coffee Mug + Water Bottle
    (6, 9, 1, 12.99),
    (6, 10, 1, 24.99);

-- Insert some test data for query validation tests
INSERT INTO test_queries (data, number, flag) VALUES
    ('test1', 1, TRUE),
    ('test2', 2, FALSE),
    ('test3', 3, TRUE),
    ('test4', 4, FALSE),
    ('test5', 5, TRUE);
