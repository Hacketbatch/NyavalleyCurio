function getAccount(req, res) {
	const userId = req.session.user.user_id;
	const ordersQuery = `
		SELECT o.*, a.country, a.state, a.city, a.street_address 
		FROM orders o 
		JOIN addresses a ON o.shipping_address_id = a.address_id 
		WHERE o.user_id = ? 
		ORDER BY o.order_date DESC
	`;
	req.db.query(ordersQuery, [userId], (err, orders) => {
		if (err) {
			console.error(err);
			return res.status(500).send("Server Error");
		}
		const addressQuery = "SELECT * FROM addresses WHERE user_id = ?";
		req.db.query(addressQuery, [userId], (err, addresses) => {
			if (err) {
				console.error(err);
				return res.status(500).send("Server Error");
			}
			return res.render("pages/account", { user: req.session.user, orders, addresses });
		});
	});
}

function addAddress(req, res) {
	const userId = req.session.user.user_id;
	const { country, state, city, street_address, zip_code, address_type } = req.body;
	const query = `
		INSERT INTO addresses (user_id, country, state, city, street_address, zip_code, address_type) 
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`;
	req.db.query(query, [userId, country, state, city, street_address, zip_code, address_type], (err) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ success: false, message: "Server Error" });
		}
		return res.json({ success: true, message: "Address added successfully" });
	});
}

module.exports = { getAccount, addAddress };


