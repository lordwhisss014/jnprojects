const { createClient, SchemaFieldTypes, VectorAlgorithms } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis-stack:6379';
const INDEX_NAME = 'menu-index';

let redisClient;
let embedder;

async function initChatbot() {
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();

    console.log("Loading AI library...");
    
    // --- CHANGE 1: Import 'env' alongside 'pipeline' ---
    const { pipeline, env } = await import('@xenova/transformers');
    
    // --- CHANGE 2: Set cache directory to /tmp (Writable in OpenShift) ---
    env.cacheDir = '/tmp/transformers_cache';
    env.allowLocalModels = false; // Force download to /tmp
    
    console.log("Loading AI model...");
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log("AI Model loaded successfully.");

    // Create Index
    try {
        await redisClient.ft.create(INDEX_NAME, {
            '$.name': { type: SchemaFieldTypes.TEXT, AS: 'name' },
            '$.description': { type: SchemaFieldTypes.TEXT, AS: 'description' },
            '$.embedding': {
                type: SchemaFieldTypes.VECTOR,
                ALGORITHM: VectorAlgorithms.HNSW,
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

    // Check Data and Seed
    try {
        const checkData = await redisClient.ft.search(INDEX_NAME, '*', { LIMIT: { from: 0, size: 1 } });
        if (checkData.total === 0) {
            console.log("Index is empty! Starting seeding process...");
            await seedData();
        } else {
            console.log(`Index contains ${checkData.total} items. Skipping seed.`);
        }
    } catch (err) {
        console.error("Error checking index data:", err);
    }
}

async function getEmbedding(text) {
    const response = await embedder(text, { pooling: 'mean', normalize: true });
    return response.data;
}

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
        await redisClient.json.set(`item:${item.name.replace(/\s/g, '')}`, '$', {
            ...item,
            embedding: Array.from(embedding)
        });
    }
    console.log("Menu data seeded!");
}

async function searchMenu(userQuery) {
    if (!embedder) {
        throw new Error("AI Model is not ready yet.");
    }

    console.log(`Generating embedding for: "${userQuery}"`);
    const vector = await getEmbedding(userQuery);
    
    console.log("Executing Vector Search...");
    const results = await redisClient.ft.search(INDEX_NAME, `*=>[KNN 3 @embedding $BLOB AS score]`, {
        PARAMS: {
            BLOB: Buffer.from(new Float32Array(vector).buffer)
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
}

module.exports = { initChatbot, searchMenu };