const mysql = require("mysql");
const { initializeDatabase } = require("../models/database");

function createDatabaseConnection() {
	const db = mysql.createConnection({
		host: process.env.DB_HOST || "localhost",
		user: process.env.DB_USER || "root",
		password: process.env.DB_PASSWORD || "Tivax5050##",
		database: process.env.DB_NAME || "eccomercecurio",
	});

	db.connect((err) => {
		if (err) {
			console.error("Database connection failed: " + err.stack);
			return;
		}
		console.log("Connected to database as id " + db.threadId);
		initializeDatabase(db);
	});

	return db;
}

module.exports = { createDatabaseConnection };


