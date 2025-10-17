const { SQL } = require("../utils/constants");

function getHome(req, res) {
	req.db.query(
		`SELECT p.*, c.name as category_name 
		 FROM products p 
		 JOIN categories c ON p.category_id = c.category_id 
		 WHERE p.is_active = true 
		 ORDER BY RAND() 
		 LIMIT 8`,
		(err, products) => {
			if (err) {
				console.error(err);
				return res.status(500).send("Server Error");
			}
			res.render("pages/home", { products });
		}
	);
}

function getProducts(req, res) {
	const page = parseInt(req.query.page) || 1;
	const limit = parseInt(req.query.limit) || 12;
	const offset = (page - 1) * limit;
	const category = req.query.category;
	const search = req.query.search;

	let query = `
		SELECT p.*, c.name as category_name 
		FROM products p 
		JOIN categories c ON p.category_id = c.category_id 
		WHERE p.is_active = true
	`;
	let countQuery = `SELECT COUNT(*) as total FROM products p WHERE p.is_active = true`;
	let queryParams = [];
	let countParams = [];

	const continueProcessing = () => {
		if (search) {
			query += ` AND p.name LIKE ?`;
			countQuery += ` AND p.name LIKE ?`;
			const searchTerm = `%${search}%`;
			queryParams.push(searchTerm);
			countParams.push(searchTerm);
		}

		query += ` LIMIT ? OFFSET ?`;
		queryParams.push(limit, offset);

		req.db.query(countQuery, countParams, (err, countResult) => {
			if (err) {
				console.error(err);
				return res.status(500).send("Server Error");
			}

			const totalProducts = countResult[0].total;
			const totalPages = Math.ceil(totalProducts / limit);

			req.db.query(query, queryParams, (err, products) => {
				if (err) {
					console.error(err);
					return res.status(500).send("Server Error");
				}

				const categoriesQuery = `
					SELECT c1.*, c2.name as parent_name 
					FROM categories c1 
					LEFT JOIN categories c2 ON c1.parent_category_id = c2.category_id 
					ORDER BY COALESCE(c2.name, c1.name), c1.name
				`;

				req.db.query(categoriesQuery, (err, categories) => {
					if (err) {
						console.error(err);
						return res.status(500).send("Server Error");
					}

					const categoryMap = {};
					const topLevelCategories = [];
					categories.forEach((cat) => {
						categoryMap[cat.category_id] = cat;
						if (!cat.parent_category_id) topLevelCategories.push(cat);
					});
					categories.forEach((cat) => {
						if (cat.parent_category_id) {
							const parent = categoryMap[cat.parent_category_id];
							if (parent) {
								if (!parent.children) parent.children = [];
								parent.children.push(cat);
							}
						}
					});

					res.render("pages/products", {
						products,
						categories: topLevelCategories,
						allCategories: categories,
						currentPage: page,
						totalPages,
						currentCategory: category,
						currentSearch: search,
					});
				});
			});
		});
	};

	if (category) {
		const checkSubcategoriesQuery =
			"SELECT COUNT(*) as count FROM categories WHERE parent_category_id = ?";
		req.db.query(checkSubcategoriesQuery, [category], (err, subcatResults) => {
			if (err) {
				console.error(err);
				return res.status(500).send("Server Error");
			}
			if (subcatResults[0].count > 0) {
				const getSubcategoriesQuery =
					"SELECT category_id FROM categories WHERE parent_category_id = ?";
				req.db.query(getSubcategoriesQuery, [category], (err, subcatIds) => {
					if (err) {
						console.error(err);
						return res.status(500).send("Server Error");
					}
					const subcategoryIds = subcatIds.map((i) => i.category_id);
					subcategoryIds.push(parseInt(category));
					query += ` AND (p.category_id IN (${subcategoryIds.map(() => "?").join(",")}))`;
					countQuery += ` AND (p.category_id IN (${subcategoryIds.map(() => "?").join(",")}))`;
					queryParams.push(...subcategoryIds);
					countParams.push(...subcategoryIds);
					continueProcessing();
				});
			} else {
				query += ` AND p.category_id = ?`;
				countQuery += ` AND p.category_id = ?`;
				queryParams.push(category);
				countParams.push(category);
				continueProcessing();
			}
		});
	} else {
		continueProcessing();
	}
}

function getProductDetail(req, res) {
	const productId = req.params.id;
	const query = `
		SELECT p.*, c.name as category_name 
		FROM products p 
		JOIN categories c ON p.category_id = c.category_id 
		WHERE p.product_id = ? AND p.is_active = true
	`;
	req.db.query(query, [productId], (err, results) => {
		if (err) {
			console.error(err);
			return res.status(500).send("Server Error");
		}
		if (results.length === 0) return res.status(404).send("Product not found");
		const product = results[0];
		res.render("pages/product-detail", { user: req.session.user, product });
	});
}

module.exports = { getHome, getProducts, getProductDetail };


