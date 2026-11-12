
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "./db.js";

const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      organizationId: user.organization_id,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Please log in"
    });
  }

  try {
    req.user = jwt.verify(header.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired login session"
    });
  }
}

function formatProduct(row) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    quantity: Number(row.quantity),
    price: Number(row.selling_price),
    threshold: Number(row.low_stock_threshold)
  };
}

function validateProduct({ name, sku, quantity, price, threshold }) {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    typeof sku === "string" &&
    sku.trim().length > 0 &&
    quantity !== "" &&
    quantity !== null &&
    quantity !== undefined &&
    Number.isInteger(Number(quantity)) &&
    Number(quantity) >= 0 &&
    price !== "" &&
    price !== null &&
    price !== undefined &&
    Number.isFinite(Number(price)) &&
    Number(price) >= 0 &&
    (
      threshold === undefined ||
      threshold === null ||
      (
        threshold !== "" &&
        Number.isInteger(Number(threshold)) &&
        Number(threshold) >= 0
      )
    )
  );
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to StockFlow API"
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      success: true,
      message: "StockFlow backend and MySQL are connected"
    });
  } catch (error) {
    console.error("Health check error:", error.message);

    res.status(500).json({
      success: false,
      message: "Database connection failed"
    });
  }
});

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const { name, email, password, organizationName } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 8 ||
      typeof organizationName !== "string" ||
      !organizationName.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter your name, email, organization and a password of at least 8 characters"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [existing] = await connection.query(
      "SELECT id FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (existing.length > 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "Email is already registered"
      });
    }

    const [organization] = await connection.query(
      "INSERT INTO organizations (name) VALUES (?)",
      [organizationName.trim()]
    );

    const organizationId = organization.insertId;

    const hashedPassword = await bcrypt.hash(password, 12);

    const [userResult] = await connection.query(
      `INSERT INTO users
       (organization_id, name, email, password, role)
       VALUES (?, ?, ?, ?, ?)`,
      [
        organizationId,
        name.trim(),
        normalizedEmail,
        hashedPassword,
        "admin"
      ]
    );

    await connection.query(
      `INSERT INTO settings
       (organization_id, default_low_stock_threshold)
       VALUES (?, ?)`,
      [organizationId, 5]
    );

    await connection.commit();
    transactionStarted = false;

    const user = {
      id: userResult.insertId,
      organization_id: organizationId,
      name: name.trim(),
      email: normalizedEmail,
      role: "admin"
    };

    return res.status(201).json({
      success: true,
      message: "Account registered successfully",
      token: createToken(user),
      user
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
    }

    console.error("Registration error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email or another unique value already exists"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  } finally {
    connection?.release();
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const [rows] = await db.query(
      "SELECT * FROM users WHERE email = ?",
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const user = rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    return res.json({
      success: true,
      message: "Login successful",
      token: createToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization_id: user.organization_id
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
});

// LOGOUT
app.post("/api/auth/logout", authenticate, (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully"
  });
});

// ADMIN PROFILE
app.get("/api/auth/profile", authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT users.id, users.name, users.email, users.role,
              users.organization_id,
              organizations.name AS organization_name
       FROM users
       JOIN organizations
       ON organizations.id = users.organization_id
       WHERE users.id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      user: rows[0]
    });
  } catch (error) {
    console.error("Profile error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load profile"
    });
  }
});

// GET ALL PRODUCTS
app.get("/api/products", authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM products
       WHERE organization_id = ?
       ORDER BY id DESC`,
      [req.user.organizationId]
    );

    res.json(rows.map(formatProduct));
  } catch (error) {
    console.error("Get products error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load products"
    });
  }
});

// GET SINGLE PRODUCT
app.get("/api/products/:id", authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM products
       WHERE id = ? AND organization_id = ?`,
      [req.params.id, req.user.organizationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.json(formatProduct(rows[0]));
  } catch (error) {
    console.error("Get product error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load product"
    });
  }
});

// ADD PRODUCT
app.post("/api/products", authenticate, async (req, res) => {
  try {
    const { name, sku, quantity, price, threshold } = req.body;

    if (!validateProduct({ name, sku, quantity, price, threshold })) {
      return res.status(400).json({
        success: false,
        message: "Enter valid product details"
      });
    }

    const [result] = await db.query(
      `INSERT INTO products
       (organization_id, name, sku, quantity, cost_price,
        selling_price, low_stock_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.organizationId,
        name.trim(),
        sku.trim(),
        Number(quantity),
        0,
        Number(price),
        Number(threshold ?? 5)
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM products
       WHERE id = ? AND organization_id = ?`,
      [result.insertId, req.user.organizationId]
    );

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      product: formatProduct(rows[0])
    });
  } catch (error) {
    console.error("Add product error:", error.message);

    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      success: false,
      message:
        error.code === "ER_DUP_ENTRY"
          ? "SKU already exists"
          : "Could not add product"
    });
  }
});

// UPDATE PRODUCT
app.put("/api/products/:id", authenticate, async (req, res) => {
  try {
    const { name, sku, quantity, price, threshold } = req.body;

    if (!validateProduct({ name, sku, quantity, price, threshold })) {
      return res.status(400).json({
        success: false,
        message: "Enter valid product details"
      });
    }

    const [existing] = await db.query(
      `SELECT id FROM products
       WHERE id = ? AND organization_id = ?`,
      [req.params.id, req.user.organizationId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    await db.query(
      `UPDATE products
       SET name = ?, sku = ?, quantity = ?,
           selling_price = ?, low_stock_threshold = ?
       WHERE id = ? AND organization_id = ?`,
      [
        name.trim(),
        sku.trim(),
        Number(quantity),
        Number(price),
        Number(threshold ?? 5),
        req.params.id,
        req.user.organizationId
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM products
       WHERE id = ? AND organization_id = ?`,
      [req.params.id, req.user.organizationId]
    );

    res.json({
      success: true,
      message: "Product updated successfully",
      product: formatProduct(rows[0])
    });
  } catch (error) {
    console.error("Update product error:", error.message);

    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      success: false,
      message:
        error.code === "ER_DUP_ENTRY"
          ? "SKU already exists"
          : "Could not update product"
    });
  }
});

// DELETE PRODUCT
app.delete("/api/products/:id", authenticate, async (req, res) => {
  try {
    const [result] = await db.query(
      `DELETE FROM products
       WHERE id = ? AND organization_id = ?`,
      [req.params.id, req.user.organizationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully"
    });
  } catch (error) {
    console.error("Delete product error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not delete product"
    });
  }
});

// GET SETTINGS
app.get("/api/settings", authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT default_low_stock_threshold
       FROM settings
       WHERE organization_id = ?`,
      [req.user.organizationId]
    );

    res.json({
      success: true,
      defaultLowStockThreshold:
        Number(rows[0]?.default_low_stock_threshold ?? 5)
    });
  } catch (error) {
    console.error("Get settings error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load settings"
    });
  }
});

// UPDATE SETTINGS
app.put("/api/settings", authenticate, async (req, res) => {
  try {
    const threshold = Number(req.body.defaultLowStockThreshold);

    if (!Number.isInteger(threshold) || threshold < 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid stock threshold"
      });
    }

    await db.query(
      `INSERT INTO settings
       (organization_id, default_low_stock_threshold)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
       default_low_stock_threshold = VALUES(default_low_stock_threshold)`,
      [req.user.organizationId, threshold]
    );

    res.json({
      success: true,
      message: "Settings updated successfully",
      defaultLowStockThreshold: threshold
    });
  } catch (error) {
    console.error("Update settings error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not update settings"
    });
  }
});

// START SERVER
async function startServer() {
  try {
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    await db.query("SELECT 1");

    app.listen(PORT, () => {
      console.log(
        `StockFlow backend running at http://localhost:${PORT}`
      );
      console.log("MySQL database connected successfully");
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

startServer();