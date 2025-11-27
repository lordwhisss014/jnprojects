require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allows Nginx to proxy requests without issues
app.use(express.json()); // Allows parsing JSON bodies from frontend

// --- DATABASE CONNECTION ---
// OpenShift injects these variables automatically when you link the DB
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'dumplingdb',
  port: process.env.DB_PORT || 5432,
});

// --- INITIALIZATION ---
// Create tables automatically if they don't exist
const initDb = async () => {
  try {
    // 1. Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 2. Orders Table (Stores items as JSON for flexibility)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        items JSONB NOT NULL,
        total DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Error initializing database:", err);
  }
};

// Run init on startup
initDb();

// --- AUTHENTICATION ROUTES ---

// 1. Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Security: Hash the password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Save to Postgres
    const newUser = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hash]
    );

    res.json({ message: "User registered", user: newUser.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // Postgres error code for Unique Violation
      return res.status(400).json({ error: "Username or Email already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error during registration" });
  }
});

// 2. Login User
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    // Compare password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT Token
    // In OpenShift, set the JWT_SECRET env variable for better security
    const secret = process.env.JWT_SECRET || 'dev_secret_key_123';
    const token = jwt.sign({ id: user.id, username: user.username }, secret, { expiresIn: '1h' });

    res.json({ 
      token, 
      user: { id: user.id, username: user.username, email: user.email } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// --- ORDER ROUTES ---

// Middleware: Check if user is logged in
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <TOKEN>"

  if (!token) return res.sendStatus(401);

  const secret = process.env.JWT_SECRET || 'dev_secret_key_123';
  
  jwt.verify(token, secret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// 3. Place Order
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { items, total } = req.body;
    
    // Save order to Postgres
    const newOrder = await pool.query(
      'INSERT INTO orders (user_id, items, total) VALUES ($1, $2, $3) RETURNING id',
      [req.user.id, JSON.stringify(items), total]
    );

    res.json({ orderId: newOrder.rows[0].id, message: "Order placed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to place order" });
  }
});

// Start Server
// CRITICAL FIX: Added '0.0.0.0' to ensure IPv4 binding
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend API running on port ${PORT}`);
});