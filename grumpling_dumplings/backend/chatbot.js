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

    console.log("Loading AI library...");
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = '/tmp/transformers_cache';
    env.allowLocalModels = false;
    
    console.log("Loading AI model...");
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log("AI Model loaded.");

    // --- CLEAN SLATE ---
    console.log("⚠️ FLUSHING REDIS DB...");
    await redisClient.flushDb();

    // 2. Create Index (HASH Mode)
    // Note: We removed "ON: JSON". This defaults to Hash.
    try {
        await redisClient.ft.create(INDEX_NAME, {
            'name': { type: SchemaFieldTypes.TEXT },
            'description': { type: SchemaFieldTypes.TEXT },
            'embedding': {
                type: SchemaFieldTypes.VECTOR,
                ALGORITHM: VectorAlgorithms.FLAT,
                TYPE: 'FLOAT32',
                DIM: 384, 
                DISTANCE_METRIC: 'COSINE'
            }
        }, {
            PREFIX: 'item:'
        });
        console.log("✅ Vector Index (Hash) created.");
    } catch (e) {
        if (e.message !== 'Index already exists') console.error("Index Error:", e);
    }

    await seedData();
}

async function getEmbedding(text) {
    const response = await embedder(text, { pooling: 'mean', normalize: true });
    // Keep as Float32Array for Buffer conversion
    return response.data;
}

async function seedData() {
    const menuItems = [
        { name: "Pork and Shrimp Siomai", price: "285", description: "Classic dimsum with pork and shrimp filling." },
        { name: "Sharksfin Dumplings", price: "285", description: "Savory dumplings with sharksfin flavor." },
        { name: "Special Kikiam", price: "370", description: "Fried meat roll wrapped in bean curd skin." },
        { name: "Siopao Asado", price: "315", description: "Steamed buns filled with sweet bbq pork." },
        { name: "Hakaw", price: "335", description: "Crystal shrimp dumplings." },
        { name: "Chicken Feet", price: "250", description: "Braised chicken feet in savory sauce." },
        { name: "Beancurd Roll", price: "295", description: "Vegetarian friendly tofu skin rolls." },
        { name: "Xiao Long Bao", price: "335", description: "Soup dumplings with pork filling." }
    ];

    console.log("Seeding menu data...");
    for (const item of menuItems) {
        const embeddingRaw = await getEmbedding(`${item.name} ${item.description}`);
        const vectorBlob = Buffer.from(embeddingRaw.buffer); // Convert to Raw Bytes
        
        const key = `item:${item.name.replace(/\s/g, '')}`;
        
        // SAVE AS HASH (HSET) instead of JSON
        await redisClient.hSet(key, {
            name: item.name,
            price: item.price,
            description: item.description,
            embedding: vectorBlob // Store raw bytes directly
        });
    }
    console.log(`Menu data seeded! (${menuItems.length} items)`);
}

async function searchMenu(userQuery) {
    if (!embedder) throw new Error("AI Model not ready");

    const vectorRaw = await getEmbedding(userQuery);
    const vectorBlob = Buffer.from(vectorRaw.buffer);

    console.log(`Query: "${userQuery}" | Dim: ${vectorRaw.length}`);

    try {
        // Search using standard KNN query
        const results = await redisClient.ft.search(INDEX_NAME, `*=>[KNN 5 @embedding $vec AS score]`, {
            PARAMS: {
                vec: vectorBlob
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