const bcrypt = require("bcrypt");

function initializeDatabase(db) {
	console.log("Initializing database tables...");

	const createTables = [
		`CREATE TABLE IF NOT EXISTS users (
				user_id INT AUTO_INCREMENT PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				email VARCHAR(255) NOT NULL UNIQUE,
				password_hash VARCHAR(255) NOT NULL,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)` ,
		`CREATE TABLE IF NOT EXISTS categories (
				category_id INT AUTO_INCREMENT PRIMARY KEY,
				name VARCHAR(255) NOT NULL UNIQUE,
				description TEXT,
				parent_category_id INT NULL,
				FOREIGN KEY (parent_category_id) REFERENCES categories(category_id) ON DELETE SET NULL
			)` ,
		`CREATE TABLE IF NOT EXISTS products (
				product_id INT AUTO_INCREMENT PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				description TEXT,
				price DECIMAL(10, 2) NOT NULL,
				image_url VARCHAR(500),
				category_id INT NOT NULL,
				is_active BOOLEAN DEFAULT TRUE,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE
			)` ,
		`CREATE TABLE IF NOT EXISTS addresses (
				address_id INT AUTO_INCREMENT PRIMARY KEY,
				user_id INT NOT NULL,
				country VARCHAR(100) NOT NULL,
				state VARCHAR(100) NOT NULL,
				city VARCHAR(100) NOT NULL,
				street_address VARCHAR(255) NOT NULL,
				zip_code VARCHAR(20) NOT NULL,
				address_type ENUM('shipping', 'billing') NOT NULL,
				FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
			)` ,
		`CREATE TABLE IF NOT EXISTS cart_items (
				cart_item_id INT AUTO_INCREMENT PRIMARY KEY,
				user_id INT NOT NULL,
				product_id INT NOT NULL,
				quantity INT NOT NULL DEFAULT 1,
				added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
				FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
				UNIQUE KEY unique_user_product (user_id, product_id)
			)` ,
		`CREATE TABLE IF NOT EXISTS orders (
				order_id INT AUTO_INCREMENT PRIMARY KEY,
				user_id INT NOT NULL,
				total_amount DECIMAL(10, 2) NOT NULL,
				order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				status ENUM('processing', 'shipped', 'delivered', 'cancelled', 'refunded') DEFAULT 'processing',
				shipping_address_id INT NOT NULL,
				FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
				FOREIGN KEY (shipping_address_id) REFERENCES addresses(address_id)
			)` ,
		`CREATE TABLE IF NOT EXISTS order_items (
				order_item_id INT AUTO_INCREMENT PRIMARY KEY,
				order_id INT NOT NULL,
				product_id INT NOT NULL,
				quantity INT NOT NULL,
				price_at_time_of_sale DECIMAL(10, 2) NOT NULL,
				FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
				FOREIGN KEY (product_id) REFERENCES products(product_id)
			)` ,
		`CREATE TABLE IF NOT EXISTS payments (
				payment_id INT AUTO_INCREMENT PRIMARY KEY,
				order_id INT NOT NULL,
				amount DECIMAL(10, 2) NOT NULL,
				payment_method ENUM('credit_card', 'paypal', 'upi', 'bank_transfer') NOT NULL,
				payment_status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
				transaction_id VARCHAR(255),
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
			)` ,
	];

	const executeQueries = (queries, index = 0) => {
		if (index >= queries.length) {
			console.log("All tables created successfully");
			checkAndInsertSampleData(db);
			return;
		}
		db.query(queries[index], (err) => {
			if (err) {
				console.error(`Error creating table ${index + 1}:`, err);
			} else {
				console.log(`Table ${index + 1} created/verified`);
			}
			executeQueries(queries, index + 1);
		});
	};

	executeQueries(createTables);
}

function checkAndInsertSampleData(db) {
	db.query("SELECT COUNT(*) as count FROM categories", (err, results) => {
		if (err) {
			console.error("Error checking categories:", err);
			return;
		}
		if (results[0].count === 0) {
			console.log("No categories found, inserting sample data...");
			insertSampleData(db);
		} else {
			console.log("Database already contains data, skipping sample data insertion");
			db.query("SELECT COUNT(*) as count FROM products", (err, productResults) => {
				if (err) {
					console.error("Error checking products:", err);
					return;
				}
				console.log(`Found ${productResults[0].count} products in database`);
			});
		}
	});
}

function insertSampleData(db) {
	console.log("Inserting Nyavalley Curio sample data...");
	const categories = [
		["Carvings", "Soap stone and wooden carvings", null],
		["Jewelry", "Traditional African jewelry", null],
		["Bags", "African bags and baskets", null],
		["African Attires", "Traditional African clothing", null],
		["Paintings", "African art paintings", null],
		["Soap Stone", "Beautiful soap stone carvings", 1],
		["Wooden", "Handcrafted wooden carvings", 1],
		["Necklaces", "Beautiful African necklaces", 2],
		["Bangles", "Handcrafted bangles and bracelets", 2],
		["Earrings", "Traditional African earrings", 2],
		["Fruit Baskets", "Handwoven fruit baskets", 3],
		["Kiondoo", "Traditional Kiondoo bags", 3],
		["Maasai Shoes", "Authentic Maasai footwear", 4],
		["Kitenge", "Colorful Kitenge fabrics", 4],
		["Shirts", "African print shirts", 4],
		["Tshirts", "African design t-shirts", 4],
		["Lesso", "Traditional Lesso wraps", 4],
	];

	db.query(
		"INSERT INTO categories (name, description, parent_category_id) VALUES ?",
		[categories],
		(err) => {
			if (err) {
				console.error("Error inserting categories:", err);
				return;
			}
			console.log("Categories inserted successfully");
			const products = [
				["Soap Stone Elephant", "Beautiful hand-carved soap stone elephant figurine", 45.99, "/images/soapstone-elephant.jpg", 6],
				["Soap Stone Giraffe", "Elegant soap stone giraffe sculpture", 39.99, "/images/soapstone-giraffe.jpg", 6],
				["Soap Stone Lion", "Majestic soap stone lion carving", 52.99, "/images/soapstone-lion.jpg", 6],
				["Soap Stone Bowl", "Handcrafted soap stone decorative bowl", 35.5, "/images/soapstone-bowl.jpg", 6],
				["Wooden Mask", "Traditional African wooden mask", 42.99, "/images/wooden-mask.jpg", 7],
				["Wooden Statue", "Hand-carved wooden statue of tribal warrior", 55.0, "/images/wooden-statue.jpg", 7],
				["Wooden Bowl", "Beautiful handcrafted wooden bowl", 28.75, "/images/wooden-bowl.jpg", 7],
				["Wooden Giraffe", "Elegant wooden giraffe carving", 38.99, "/images/wooden-giraffe.jpg", 7],
				["Beaded Necklace", "Colorful beaded African necklace", 22.99, "/images/beaded-necklace.jpg", 8],
				["Maasai Necklace", "Traditional Maasai bead necklace", 29.99, "/images/maasai-necklace.jpg", 8],
				["Turquoise Necklace", "Beautiful turquoise stone necklace", 35.0, "/images/turquoise-necklace.jpg", 8],
				["Wooden Bangles", "Set of 3 handcrafted wooden bangles", 18.99, "/images/wooden-bangles.jpg", 9],
				["Beaded Bangles", "Colorful beaded bangle set", 15.5, "/images/beaded-bangles.jpg", 9],
				["Brass Bangles", "Traditional African brass bangles", 24.99, "/images/brass-bangles.jpg", 9],
				["Beaded Earrings", "Colorful African beaded earrings", 12.99, "/images/beaded-earrings.jpg", 10],
				["Wooden Earrings", "Lightweight wooden earrings", 14.99, "/images/wooden-earrings.jpg", 10],
				["Gold Hoop Earrings", "Traditional gold hoop earrings", 19.99, "/images/gold-hoops.jpg", 10],
				["Large Fruit Basket", "Handwoven large fruit basket", 45.99, "/images/large-basket.jpg", 11],
				["Medium Fruit Basket", "Medium sized woven basket", 35.99, "/images/medium-basket.jpg", 11],
				["Small Fruit Basket", "Small decorative fruit basket", 25.99, "/images/small-basket.jpg", 11],
				["Traditional Kiondoo", "Handwoven traditional Kiondoo bag", 52.99, "/images/traditional-kiondoo.jpg", 12],
				["Colorful Kiondoo", "Colorful patterned Kiondoo bag", 48.99, "/images/colorful-kiondoo.jpg", 12],
				["Modern Kiondoo", "Contemporary style Kiondoo bag", 55.99, "/images/modern-kiondoo.jpg", 12],
				["Red Maasai Shoes", "Authentic red Maasai sandals", 39.99, "/images/red-maasai-shoes.jpg", 13],
				["Blue Maasai Shoes", "Traditional blue Maasai footwear", 39.99, "/images/blue-maasai-shoes.jpg", 13],
				["Multicolor Maasai Shoes", "Colorful Maasai sandals", 42.99, "/images/multicolor-maasai-shoes.jpg", 13],
				["Blue Kitenge", "Beautiful blue African Kitenge fabric", 29.99, "/images/blue-kitenge.jpg", 14],
				["Red Kitenge", "Vibrant red Kitenge material", 29.99, "/images/red-kitenge.jpg", 14],
				["Green Kitenge", "Elegant green African print fabric", 29.99, "/images/green-kitenge.jpg", 14],
				["African Print Shirt", "Colorful African print button-up shirt", 45.99, "/images/african-shirt.jpg", 15],
				["Traditional Dashiki", "Authentic African Dashiki shirt", 49.99, "/images/dashiki-shirt.jpg", 15],
				["Casual African Shirt", "Comfortable African print casual shirt", 42.99, "/images/casual-african-shirt.jpg", 15],
				["African Design Tshirt", "Cotton t-shirt with African design", 24.99, "/images/african-tshirt.jpg", 16],
				["Tribal Print Tshirt", "T-shirt with traditional tribal patterns", 22.99, "/images/tribal-tshirt.jpg", 16],
				["Maasai Tshirt", "T-shirt featuring Maasai-inspired designs", 26.99, "/images/maasai-tshirt.jpg", 16],
				["Colorful Lesso", "Traditional colorful Lesso wrap", 32.99, "/images/colorful-lesso.jpg", 17],
				["Patterned Lesso", "Beautiful patterned Lesso fabric", 34.99, "/images/patterned-lesso.jpg", 17],
				["Premium Lesso", "High-quality premium Lesso wrap", 39.99, "/images/premium-lesso.jpg", 17],
				["Savannah Sunset", "Oil painting of African savannah at sunset", 89.99, "/images/savannah-painting.jpg", 5],
				["Maasai Warriors", "Acrylic painting of Maasai warriors", 95.99, "/images/maasai-painting.jpg", 5],
				["African Wildlife", "Beautiful wildlife painting featuring African animals", 102.99, "/images/wildlife-painting.jpg", 5],
			];

		db.query(
			"INSERT INTO products (name, description, price, image_url, category_id) VALUES ?",
			[products],
			(err) => {
				if (err) {
					console.error("Error inserting products:", err);
					return;
				}
				console.log("Products inserted successfully");
				const hashedPassword = bcrypt.hashSync("password", 10);
				db.query(
					"INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
					["John Doe", "john@example.com", hashedPassword],
					(err) => {
						if (err) {
							console.error("Error inserting user:", err);
							return;
						}
						console.log("Sample user inserted successfully");
						db.query(
							`INSERT INTO addresses (user_id, country, state, city, street_address, zip_code, address_type) VALUES 
							(1, 'Kenya', 'Nairobi', 'Nairobi', '123 Main Street', '00100', 'shipping'),
							(1, 'Kenya', 'Nairobi', 'Nairobi', '123 Main Street', '00100', 'billing')`,
							(err) => {
								if (err) {
									console.error("Error inserting addresses:", err);
									return;
								}
								console.log("Sample addresses inserted successfully");
								console.log("Nyavalley Curio sample data insertion completed!");
							}
						);
					}
				);
			}
		);
		}
	);
}

module.exports = { initializeDatabase };


