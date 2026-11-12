
import { useState, useEffect } from "react";
import "./App.css";

const API = "http://localhost:5000/api";
const TOKEN_KEY = "stockflow_token";

function App() {
  const [token, setToken] = useState(
    localStorage.getItem(TOKEN_KEY) || ""
  );
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    organizationName: ""
  });

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [threshold, setThreshold] = useState(5);

  const emptyForm = {
    name: "",
    sku: "",
    quantity: "",
    price: "",
    threshold: 5
  };

  const [form, setForm] = useState(emptyForm);

  async function request(url, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    };

    const response = await fetch(`${API}${url}`, {
      ...options,
      headers
    });

    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Invalid server response. Check your backend.");
    }

    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  }

  async function handleAuth(e) {
    e.preventDefault();

    try {
      const endpoint =
        authMode === "login" ? "/auth/login" : "/auth/register";

      const body =
        authMode === "login"
          ? {
              email: authForm.email,
              password: authForm.password
            }
          : authForm;

      const response = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Authentication failed");
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);

      setAuthForm({
        name: "",
        email: "",
        password: "",
        organizationName: ""
      });

      alert(
        authMode === "login"
          ? "Login successful!"
          : "Account created successfully!"
      );
    } catch (error) {
      alert(error.message);
    }
  }

  async function loadDashboard() {
    try {
      setLoading(true);

      const [productData, profileData, settingsData] =
        await Promise.all([
          request("/products"),
          request("/auth/profile"),
          request("/settings")
        ]);

      setProducts(Array.isArray(productData) ? productData : []);
      setUser(profileData.user);
      setThreshold(settingsData.defaultLowStockThreshold);
    } catch (error) {
      alert(error.message);

      if (
        error.message.toLowerCase().includes("login") ||
        error.message.toLowerCase().includes("session") ||
        error.message.toLowerCase().includes("token")
      ) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadDashboard();
    }
  }, [token]);

  async function logout() {
    try {
      if (token) {
        await request("/auth/logout", { method: "POST" });
      }
    } catch (error) {
      console.error(error);
    }

    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setProducts([]);
    setPage("dashboard");
    setSearch("");
    resetForm();
  }

  function resetForm() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  }

  async function addProduct(e) {
    e.preventDefault();

    try {
      const data = await request("/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          sku: form.sku.trim(),
          quantity: Number(form.quantity),
          price: Number(form.price),
          threshold: Number(form.threshold)
        })
      });

      setProducts(prev => [...prev, data.product]);
      resetForm();
      alert("Product added successfully!");
    } catch (error) {
      alert(error.message);
    }
  }

  function editProduct(product) {
    setEditId(product.id);

    setForm({
      name: product.name,
      sku: product.sku,
      quantity: String(product.quantity),
      price: String(product.price),
      threshold: String(product.threshold)
    });

    setShowForm(true);
    setPage("products");
  }

  async function updateProduct(e) {
    e.preventDefault();

    try {
      const data = await request(`/products/${editId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.trim(),
          sku: form.sku.trim(),
          quantity: Number(form.quantity),
          price: Number(form.price),
          threshold: Number(form.threshold)
        })
      });

      setProducts(prev =>
        prev.map(p =>
          String(p.id) === String(editId) ? data.product : p
        )
      );

      resetForm();
      alert("Product updated successfully!");
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm("Are you sure you want to delete this product?")) {
      return;
    }

    try {
      const data = await request(`/products/${id}`, {
        method: "DELETE"
      });

      setProducts(prev =>
        prev.filter(p => String(p.id) !== String(id))
      );

      alert(data.message || "Product deleted successfully!");
    } catch (error) {
      alert(error.message);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();

    try {
      const data = await request("/settings", {
        method: "PUT",
        body: JSON.stringify({
          defaultLowStockThreshold: Number(threshold)
        })
      });

      setThreshold(data.defaultLowStockThreshold);
      alert("Settings saved successfully!");
    } catch (error) {
      alert(error.message);
    }
  }

  const totalStock = products.reduce(
    (sum, p) => sum + Number(p.quantity),
    0
  );

  const lowStock = products.filter(
    p => Number(p.quantity) <= Number(p.threshold)
  );

  const filteredProducts = products.filter(p =>
    `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase())
  );

  // LOGIN AND SIGNUP
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-layout">
          <section className="auth-welcome">
            <h1>
              Welcome to <span>StockFlow</span>
            </h1>

            <p className="auth-description">
              Manage your inventory, track stock levels, and
              <br className="desktop-break" />
              keep your business organized.
            </p>

            <img
              src="/logo.png"
              alt="StockFlow inventory illustration"
              className="auth-logo"
            />

            <div className="auth-community">
              <div className="community-icon">◇</div>
              <div>
                <strong>Join StockFlow Community ↗</strong>
                <p>
                  Get updates, inventory tips, and grow
                  <br className="desktop-break" />
                  your business efficiently.
                </p>
              </div>
            </div>
          </section>

          <form className="auth-card" onSubmit={handleAuth}>
            <div className="auth-brand">
              <span className="auth-brand-icon">📦</span>
              <span>StockFlow</span>
            </div>

            <h2>
              {authMode === "login"
                ? "Login to Your Account"
                : "Create Your Account"}
            </h2>

            <p className="auth-signup-prompt">
              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}

              <button
                type="button"
                className="auth-switch"
                onClick={() =>
                  setAuthMode(
                    authMode === "login" ? "register" : "login"
                  )
                }
              >
                {authMode === "login" ? "Sign Up" : "Login"}
              </button>
            </p>

            {authMode === "register" && (
              <>
                <input
                  type="text"
                  placeholder="Your Name"
                  required
                  value={authForm.name}
                  onChange={e =>
                    setAuthForm({
                      ...authForm,
                      name: e.target.value
                    })
                  }
                />

                <input
                  type="text"
                  placeholder="Organization Name"
                  required
                  value={authForm.organizationName}
                  onChange={e =>
                    setAuthForm({
                      ...authForm,
                      organizationName: e.target.value
                    })
                  }
                />
              </>
            )}

            <label className="auth-input-wrap">
              <span>✉</span>
              <input
                type="email"
                placeholder="Email Address"
                required
                value={authForm.email}
                onChange={e =>
                  setAuthForm({
                    ...authForm,
                    email: e.target.value
                  })
                }
              />
            </label>

            <label className="auth-input-wrap">
              <span>♙</span>
              <input
                type="password"
                placeholder="Password (minimum 8 characters)"
                minLength={8}
                required
                value={authForm.password}
                onChange={e =>
                  setAuthForm({
                    ...authForm,
                    password: e.target.value
                  })
                }
              />
            </label>

            {authMode === "login" && (
              <div className="auth-forgot">
                Forgot Password?
              </div>
            )}

            <button className="auth-submit" type="submit">
              {authMode === "login" ? "Login" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // MAIN APPLICATION
  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="logo">📦 StockFlow</h2>

        <p className="menu-heading">MENU</p>

        <button
          className={`menu ${page === "dashboard" ? "active" : ""}`}
          onClick={() => setPage("dashboard")}
        >
          ▦ Dashboard
        </button>

        <button
          className={`menu ${page === "products" ? "active" : ""}`}
          onClick={() => setPage("products")}
        >
          ▤ Products
        </button>

        <button
          className={`menu ${page === "settings" ? "active" : ""}`}
          onClick={() => setPage("settings")}
        >
          ⚙ Settings
        </button>

        <div className="sidebar-bottom">
          Inventory Management
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {page === "dashboard"
                ? "Dashboard"
                : page === "products"
                ? "Products"
                : page === "settings"
                ? "Settings"
                : "Admin Profile"}
            </h1>

            <p>
              Welcome back, {user?.name || "Admin"}!
            </p>
          </div>

          <div className="profile">
            <button
              type="button"
              className="profile-button"
              onClick={() => setPage("profile")}
            >
              {user?.name || "Admin"}
            </button>

            <button
              type="button"
              className="avatar"
              onClick={() => setPage("profile")}
            >
              {(user?.name || "A").charAt(0).toUpperCase()}
            </button>

            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </header>

        {/* DASHBOARD */}
        {page === "dashboard" && (
          <>
            <section className="cards">
              <div className="card">
                <div className="card-icon blue">▤</div>
                <p>Total Products</p>
                <h2>{products.length}</h2>
                <small>Products in inventory</small>
              </div>

              <div className="card">
                <div className="card-icon green">▣</div>
                <p>Total Stock</p>
                <h2>{totalStock}</h2>
                <small>Total units available</small>
              </div>

              <div className="card">
                <div className="card-icon orange">⚠</div>
                <p>Low Stock Items</p>
                <h2>{lowStock.length}</h2>
                <small>Products need attention</small>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Product Inventory</h2>
                  <p>Manage and monitor your products</p>
                </div>

                <button
                  className="add-button"
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                    setPage("products");
                  }}
                >
                  + Add Product
                </button>
              </div>

              <ProductTable
                loading={loading}
                products={products}
                onEdit={editProduct}
                onDelete={deleteProduct}
              />
            </section>

            <section className="low-stock-panel">
              <h2>⚠ Low Stock Alerts</h2>

              {lowStock.length === 0 ? (
                <p>All products have sufficient stock.</p>
              ) : (
                lowStock.map(p => (
                  <p key={p.id}>
                    <strong>{p.name}</strong> — {p.quantity} units remaining
                  </p>
                ))
              )}
            </section>
          </>
        )}

        {/* PRODUCTS */}
        {page === "products" && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Product Inventory</h2>
                <p>Manage your organization's products</p>
              </div>

              <button
                className="add-button"
                onClick={() => {
                  resetForm();
                  setShowForm(!showForm);
                }}
              >
                + Add Product
              </button>
            </div>

            {showForm && (
              <form
                className="product-form"
                onSubmit={editId ? updateProduct : addProduct}
              >
                <h3>
                  {editId ? "Edit Product" : "Add New Product"}
                </h3>

                <input
                  placeholder="Product Name"
                  required
                  value={form.name}
                  onChange={e =>
                    setForm({ ...form, name: e.target.value })
                  }
                />

                <input
                  placeholder="SKU"
                  required
                  value={form.sku}
                  onChange={e =>
                    setForm({ ...form, sku: e.target.value })
                  }
                />

                <input
                  type="number"
                  min="0"
                  placeholder="Quantity"
                  required
                  value={form.quantity}
                  onChange={e =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                />

                <input
                  type="number"
                  min="0"
                  placeholder="Selling Price (₹)"
                  required
                  value={form.price}
                  onChange={e =>
                    setForm({ ...form, price: e.target.value })
                  }
                />

                <input
                  type="number"
                  min="0"
                  placeholder="Low Stock Threshold"
                  required
                  value={form.threshold}
                  onChange={e =>
                    setForm({ ...form, threshold: e.target.value })
                  }
                />

                <button className="add-button" type="submit">
                  {editId ? "Update Product" : "Save Product"}
                </button>

                <button
                  className="cancel-button"
                  type="button"
                  onClick={resetForm}
                >
                  Cancel
                </button>
              </form>
            )}

            <input
              className="search"
              placeholder="Search by product name or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <ProductTable
              loading={loading}
              products={filteredProducts}
              onEdit={editProduct}
              onDelete={deleteProduct}
            />
          </section>
        )}

        {/* SETTINGS */}
        {page === "settings" && (
          <section className="panel">
            <h2>Organization Settings</h2>
            <p>Configure your default low-stock threshold.</p>

            <form className="product-form" onSubmit={saveSettings}>
              <label>Default Low-Stock Threshold</label>

              <input
                type="number"
                min="0"
                required
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
              />

              <button className="add-button" type="submit">
                Save Settings
              </button>
            </form>
          </section>
        )}

        {/* ADMIN PROFILE */}
        {page === "profile" && (
          <section className="panel">
            <h2>Admin Profile</h2>

            <p>
              <strong>Name:</strong> {user?.name}
            </p>

            <p>
              <strong>Email:</strong> {user?.email}
            </p>

            <p>
              <strong>Role:</strong> {user?.role}
            </p>

            <p>
              <strong>Organization:</strong> {user?.organization_name}
            </p>

            <button className="add-button" onClick={logout}>
              Logout
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

// REUSABLE PRODUCT TABLE
function ProductTable({ loading, products, onEdit, onDelete }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>PRODUCT NAME</th>
            <th>SKU</th>
            <th>QUANTITY</th>
            <th>SELLING PRICE</th>
            <th>STATUS</th>
            <th>ACTION</th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan="6">Loading products...</td>
            </tr>
          ) : products.length === 0 ? (
            <tr>
              <td colSpan="6">No products found.</td>
            </tr>
          ) : (
            products.map(product => (
              <tr key={product.id}>
                <td>
                  <strong>{product.name}</strong>
                </td>

                <td>{product.sku}</td>
                <td>{product.quantity}</td>

                <td>
                  ₹{Number(product.price).toLocaleString("en-IN")}
                </td>

                <td>
                  <span
                    className={
                      Number(product.quantity) <= Number(product.threshold)
                        ? "status low"
                        : "status good"
                    }
                  >
                    {Number(product.quantity) <= Number(product.threshold)
                      ? "Low Stock"
                      : "In Stock"}
                  </span>
                </td>

                <td>
                  <button
                    className="edit-button"
                    onClick={() => onEdit(product)}
                  >
                    Edit
                  </button>

                  <button
                    className="delete-button"
                    onClick={() => onDelete(product.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default App;
