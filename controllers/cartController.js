function getCart(req, res) {
	const userId = req.session.user.user_id;
	const cartQuery = `
		SELECT ci.*, p.name, p.price, p.image_url 
		FROM cart_items ci 
		JOIN products p ON ci.product_id = p.product_id 
		WHERE ci.user_id = ?
	`;
	req.db.query(cartQuery, [userId], (err, cartItems) => {
		if (err) {
			console.error(err);
			return res.status(500).send("Server Error");
		}
		let total = 0;
		cartItems.forEach((item) => {
			total += item.price * item.quantity;
		});
		res.render("pages/cart", { user: req.session.user, cartItems, total });
	});
}

function addToCart(req, res) {
	const userId = req.session.user.user_id;
	const productId = req.body.product_id;
	const quantity = req.body.quantity || 1;
	const checkQuery = "SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?";
	req.db.query(checkQuery, [userId, productId], (err, results) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ success: false, message: "Server Error" });
		}
		if (results.length > 0) {
			const updateQuery =
				"UPDATE cart_items SET quantity = quantity + ? WHERE user_id = ? AND product_id = ?";
			req.db.query(updateQuery, [quantity, userId, productId], (err) => {
				if (err) {
					console.error(err);
					return res.status(500).json({ success: false, message: "Server Error" });
				}
				res.json({ success: true, message: "Product added to cart" });
			});
		} else {
			const insertQuery =
				"INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)";
			req.db.query(insertQuery, [userId, productId, quantity], (err) => {
				if (err) {
					console.error(err);
					return res.status(500).json({ success: false, message: "Server Error" });
				}
				res.json({ success: true, message: "Product added to cart" });
			});
		}
	});
}

function updateCart(req, res) {
	const userId = req.session.user.user_id;
	const productId = req.body.product_id;
	const quantity = req.body.quantity;
	if (quantity <= 0) {
		const deleteQuery = "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?";
		req.db.query(deleteQuery, [userId, productId], (err) => {
			if (err) {
				console.error(err);
				return res.status(500).json({ success: false, message: "Server Error" });
			}
			res.json({ success: true, message: "Product removed from cart" });
		});
	} else {
		const updateQuery =
			"UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?";
		req.db.query(updateQuery, [quantity, userId, productId], (err) => {
			if (err) {
				console.error(err);
				return res.status(500).json({ success: false, message: "Server Error" });
			}
			res.json({ success: true, message: "Cart updated" });
		});
	}
}

module.exports = { getCart, addToCart, updateCart };


