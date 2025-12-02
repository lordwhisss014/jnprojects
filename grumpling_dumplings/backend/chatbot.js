const { createClient, SchemaFieldTypes, VectorAlgorithms } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis-stack:6379';
const INDEX_NAME = 'menu-index';

let redisClient;
let embedder;

async function initChatbot() {
    // 1. Connect to Redis
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();

    // 2. Load AI Library (Dynamic Import for ESM compatibility)
    console.log("Loading AI library...");
    const { pipeline, env } = await import('@xenova/transformers');
    
    // FIX: Force cache to /tmp to avoid OpenShift permission errors
    env.cacheDir = '/tmp/transformers_cache';
    env.allowLocalModels = false;
    
    console.log("Loading AI model...");
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log("AI Model loaded.");

    // --- NUCLEAR FIX: WIPE DATABASE ---
    // This deletes old broken indexes/data so we start fresh.
    // TODO: Comment this out after the chatbot works!
    console.log("⚠️ FLUSHING REDIS DATABASE TO FIX CORRUPTED INDEX...");
    await redisClient.flushDb(); 
    // ----------------------------------

    // 3. Create Vector Index
    try {
        await redisClient.ft.create(INDEX_NAME, {
            '$.name': { type: SchemaFieldTypes.TEXT, AS: 'name' },
            '$.description': { type: SchemaFieldTypes.TEXT, AS: 'description' },
            '$.embedding': {
                type: SchemaFieldTypes.VECTOR,
                ALGORITHM: VectorAlgorithms.FLAT, // FLAT is better for small datasets
                TYPE: 'FLOAT32',
                DIM: 384, 
                DISTANCE_METRIC: 'COSINE'
            }
        }, {
            ON: 'JSON',
            PREFIX: 'item:'
        });
        console.log("Vector Index created.");
    } catch (e) {
        if (e.message === 'Index already exists') {
            console.log("Index already exists.");
        } else {
            console.error("Index creation error:", e);
        }
    }

    // 4. Force Seed Data
    await seedData();
}

// Helper: Convert Text to Vector Array
async function getEmbedding(text) {
    const response = await embedder(text, { pooling: 'mean', normalize: true });
    // FIX: Convert Float32Array to standard JavaScript Array for JSON storage
    return Array.from(response.data).map(Number);
}

// Helper: Seed Menu Items
async function seedData() {
    const menuItems = [
        { name: "Pork and Shrimp Siomai", price: 285, description: "Classic dimsum with pork and shrimp filling." },
        { name: "Sharksfin Dumplings", price: 285, description: "Savory dumplings with sharksfin flavor." },
        { name: "Special Kikiam", price: 370, description: "Fried meat roll wrapped in bean curd skin." },
        { name: "Siopao Asado", price: 315, description: "Steamed buns filled with sweet bbq pork." },
        { name: "Hakaw", price: 335, description: "Crystal shrimp dumplings." },
        { name: "Chicken Feet", price: 250, description: "Braised chicken feet in savory sauce." },
        { name: "Beancurd Roll", price: 295, description: "Vegetarian friendly tofu skin rolls." },
        { name: "Xiao Long Bao", price: 335, description: "Soup dumplings with pork filling." }
    ];

    console.log("Seeding menu data...");
    for (const item of menuItems) {
        const embedding = await getEmbedding(`${item.name} ${item.description}`);
        const key = `item:${item.name.replace(/\s/g, '')}`;
        
        await redisClient.json.set(key, '$', {
            ...item,
            embedding: embedding
        });
    }
    console.log(`Menu data seeded! (${menuItems.length} items)`);
}

// Helper: Perform Search
async function searchMenu(userQuery) {
    if (!embedder) {
        throw new Error("AI Model is not ready yet.");
    }

    // 1. Generate Vector for the User's Question
    const vector = await getEmbedding(userQuery);
    
    // 2. Convert to Buffer for Redis Query
    const vectorBlob = Buffer.from(new Float32Array(vector).buffer);

    console.log(`Search Query: "${userQuery}"`);

    try {
        // 3. Execute Vector Search (K-Nearest Neighbors)
        const results = await redisClient.ft.search(INDEX_NAME, `*=>[KNN 5 @embedding $BLOB AS score]`, {
            PARAMS: {
                BLOB: vectorBlob
            },
            SORTBY: 'score',
            DIALECT: 2,
            RETURN: ['name', 'price', 'description', 'score']
        });

        console.log(`Found ${results.total} matches.`);
        
        return results.documents.map(doc => ({
            name: doc.value.name,
            price: doc.value.price,
            description: doc.value.description,
            score: doc.value.score
        }));
    } catch (err) {
        console.error("Search Error:", err);
        return [];
    }
}

module.exports = { initChatbot, searchMenu };