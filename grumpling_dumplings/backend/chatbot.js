const { createClient, SchemaFieldTypes, VectorAlgorithms } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis-stack:6379';
const INDEX_NAME = 'menu-index';

let redisClient;
let embedder;

async function initChatbot() {
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();

    // --- FIX: Configure Environment properly ---
    console.log("Loading AI library...");
    const { pipeline, env } = await import('@xenova/transformers');
    
    // Force cache to /tmp (Writable)
    env.cacheDir = '/tmp/transformers_cache';
    env.allowLocalModels = false;
    console.log("AI Cache Directory set to:", env.cacheDir); // <--- DEBUG LOG

    console.log("Loading AI model...");
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log("AI Model loaded.");

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
            // console.log("Index exists."); 
        } else {
            console.error("Index creation error:", e);
        }
    }

    // Check Index Info
    try {
        const info = await redisClient.ft.info(INDEX_NAME);
        // Find number of docs in the raw info array
        const docCountIdx = info.indexOf('num_docs');
        const docCount = info[docCountIdx + 1];
        console.log(`Index Status: Contains ${docCount} documents.`);

        if (docCount == 0) {
            console.log("Index is empty! Seeding now...");
            await seedData();
        }
    } catch (err) {
        console.error("Error checking index:", err);
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
        // Remove spaces for key to match previous logic
        const key = `item:${item.name.replace(/\s/g, '')}`;
        await redisClient.json.set(key, '$', {
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

    // Log the vector generation
    const vector = await getEmbedding(userQuery);
    console.log(`Search Query: "${userQuery}" | Vector Size: ${vector.length}`);

    // Perform Vector Search
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