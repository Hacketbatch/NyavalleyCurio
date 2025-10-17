const bcrypt = require("bcrypt");

function getLogin(req, res) {
  if (req.session.user) return res.redirect("/account");
  return res.render("pages/login", { error: null });
}

function postLogin(req, res) {
  const { email, password } = req.body;
  const query = "SELECT * FROM users WHERE email = ?";
  req.db.query(query, [email], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).render("pages/login", { error: "Server error" });
    }
    if (results.length === 0) {
      return res.render("pages/login", { error: "Invalid email or password" });
    }
    const user = results[0];
    if (user.role === 'blocked') {
      return res.status(403).render("pages/login", { error: "Your account has been blocked. Please contact support." });
    }
    try {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.render("pages/login", {
          error: "Invalid email or password",
        });
      }
      const isAdmin = (user && (user.is_admin === 1 || user.is_admin === true)) || (user && user.role === 'admin');
      req.session.user = {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        is_admin: !!isAdmin,
        role: user.role || (isAdmin ? 'admin' : 'customer'),
      };
      return res.redirect("/account");
    } catch (error) {
      console.error(error);
      return res.status(500).render("pages/login", { error: "Server error" });
    }
  });
}

function getRegister(req, res) {
  if (req.session.user) return res.redirect("/account");
  return res.render("pages/register", { user: req.session.user, error: null });
}

function postRegister(req, res) {
  const { name, email, password, confirm_password } = req.body;
  if (password !== confirm_password) {
    return res.render("pages/register", {
      user: req.session.user,
      error: "Passwords do not match",
    });
  }
  if (password.length < 6) {
    return res.render("pages/register", {
      user: req.session.user,
      error: "Password must be at least 6 characters",
    });
  }
  const checkQuery = "SELECT * FROM users WHERE email = ?";
  req.db.query(checkQuery, [email], async (err, results) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .render("pages/register", {
          user: req.session.user,
          error: "Server error",
        });
    }
    if (results.length > 0) {
      return res.render("pages/register", {
        user: req.session.user,
        error: "User with this email already exists",
      });
    }
    try {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const insertQuery =
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)";
      req.db.query(
        insertQuery,
        [name, email, hashedPassword],
        (err, result) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .render("pages/register", {
                user: req.session.user,
                error: "Server error",
              });
          }
          req.session.user = { user_id: result.insertId, name, email };
          return res.redirect("/account");
        }
      );
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .render("pages/register", {
          user: req.session.user,
          error: "Server error",
        });
    }
  });
}

function logout(req, res) {
  req.session.destroy((err) => {
    if (err) console.error(err);
    return res.redirect("/");
  });
}

module.exports = { getLogin, postLogin, getRegister, postRegister, logout };
