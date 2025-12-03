require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('@elastic/elasticsearch'); // Elastic Client

// Import Chatbot Logic
const { initChatbot, searchMenu } = require('./chatbot');

const app = express();
const PORT = process.env.PORT || 3000;

// --- ELASTICSEARCH CONNECTION ---
const esClient = new Client({ 
  node: process.env.ELASTIC_URL || 'http://elasticsearch:9200' 
});

app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'dumplingdb',
  port: process.env.DB_PORT || 5432,
});

// --- INITIALIZATION ---
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
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

// Start DB and Chatbot (Redis/AI)
initDb();
initChatbot();

// --- AUTHENTICATION ROUTES ---

// 1. Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const newUser = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hash]
    );
    res.json({ message: "User registered", user: newUser.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: "Username or Email already exists" });
    console.error(err);
    res.status(500).json({ error: "Server error during registration" });
  }
});

// 2. Login
app.post('/api/auth/login', async (req, res) => { 
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: "Invalid credentials" });
        
        const secret = process.env.JWT_SECRET || 'dev_secret_key_123';
        const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, secret, { expiresIn: '1h' });
        
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: "Server error" }); 
    }
});

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  const secret = process.env.JWT_SECRET || 'dev_secret_key_123';
  jwt.verify(token, secret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- ORDER ROUTE (WITH ELASTIC FIX) ---
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { items, total } = req.body;
    
    // 1. Save to PostgreSQL
    const newOrder = await pool.query(
      'INSERT INTO orders (user_id, items, total) VALUES ($1, $2, $3) RETURNING id, created_at',
      [req.user.id, JSON.stringify(items), total]
    );

    const orderId = newOrder.rows[0].id;
    const orderDate = newOrder.rows[0].created_at;

    // 2. Send to Elasticsearch
    // FIX: Using 'body' instead of 'document' for compatibility with Elastic Client v7
    esClient.index({
      index: 'orders', 
      body: { 
        orderId: orderId,
        userEmail: req.user.email,
        userName: req.user.username,
        totalAmount: parseFloat(total),
        items: items,
        timestamp: orderDate
      }
    }).then(() => console.log(`Order ${orderId} sent to Elastic.`))
      .catch(e => console.error("Elastic Index Error:", e));

    res.json({ orderId: orderId, message: "Order placed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to place order" });
  }
});

// --- CHATBOT ROUTE ---
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message required" });
        
        console.log(`Processing chat: "${message}"`);
        const results = await searchMenu(message);
        
        let reply = "";
        if (results.length > 0) {
            reply = "Here are some items you might like based on your request:";
            results.forEach(item => {
                reply += `\n- ${item.name} (₱${item.price}): ${item.description}`;
            });
        } else {
            reply = "I couldn't find any specific dumplings matching that description. Try asking for 'shrimp', 'pork', or 'steamed' items.";
        }
        res.json({ reply, results }); 
    } catch (err) {
        console.error("Chat Error:", err);
        res.status(500).json({ error: "Failed to process chat" });
    }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend API running on port ${PORT}`);
});