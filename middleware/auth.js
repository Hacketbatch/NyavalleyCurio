function requireLogin(req, res, next) {
	if (req.session && req.session.user) {
		return next();
	}
	return res.redirect("/login");
}


function requireAdmin(req, res, next) {
	if (req.session && req.session.user && (req.session.user.is_admin || req.session.user.role === 'admin')) {
		return next();
	}
	return res.status(403).render("errors/500", { error: "Forbidden" });
}

module.exports = { requireLogin, requireAdmin };


