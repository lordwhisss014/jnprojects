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
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = '/tmp/transformers_cache';
    env.allowLocalModels = false;
    
    console.log("Loading AI model...");
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log("AI Model loaded.");

    console.log("⚠️ FLUSHING REDIS DB...");
    await redisClient.flushDb();

    // 1. Create Index (Expect FLOAT32)
    try {
        await redisClient.ft.create(INDEX_NAME, {
            '$.name': { type: SchemaFieldTypes.TEXT, AS: 'name' },
            '$.description': { type: SchemaFieldTypes.TEXT, AS: 'description' },
            '$.embedding': {
                type: SchemaFieldTypes.VECTOR,
                ALGORITHM: VectorAlgorithms.FLAT,
                TYPE: 'FLOAT32',
                DIM: 384, 
                DISTANCE_METRIC: 'COSINE'
            }
        }, {
            ON: 'JSON',
            PREFIX: 'item:'
        });
        console.log("✅ Vector Index created.");
    } catch (e) {
        if (e.message !== 'Index already exists') console.error(e);
    }

    await seedData();
}

async function getEmbedding(text) {
    const response = await embedder(text, { pooling: 'mean', normalize: true });
    // Keep as Float32Array (Don't convert to standard JS Array yet)
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
        const embeddingRaw = await getEmbedding(`${item.name} ${item.description}`);
        
        // CRITICAL CHANGE: Convert Float32Array to standard Array for JSON
        // We ensure it is a flat array of numbers.
        const embeddingArray = Array.from(embeddingRaw);

        const key = `item:${item.name.replace(/\s/g, '')}`;
        
        // Save using json.set
        await redisClient.json.set(key, '$', {
            name: item.name,
            price: item.price,
            description: item.description,
            embedding: embeddingArray
        });
    }
    console.log("Menu data seeded! (8 items)");
}

async function searchMenu(userQuery) {
    if (!embedder) throw new Error("AI Model not ready");

    const vectorRaw = await getEmbedding(userQuery);
    console.log(`Query: "${userQuery}" | Dim: ${vectorRaw.length}`);

    // Create a Float32 Buffer for the query blob
    const vectorBlob = Buffer.from(vectorRaw.buffer);

    try {
        // Use raw command
        const results = await redisClient.sendCommand([
            'FT.SEARCH', INDEX_NAME,
            `*=>[KNN 5 @embedding $vec AS score]`,
            'PARAMS', '2', 'vec', vectorBlob,
            'SORTBY', 'score',
            'DIALECT', '2',
            'RETURN', '3', 'name', 'price', 'description'
        ]);

        const count = results[0];
        console.log(`Found ${count} matches.`);
        
        const docs = [];
        for (let i = 1; i < results.length; i += 2) {
            const fields = results[i + 1];
            if (Array.isArray(fields)) {
                const doc = {};
                for (let j = 0; j < fields.length; j += 2) {
                    doc[fields[j]] = fields[j + 1];
                }
                docs.push(doc);
            }
        }
        return docs;

    } catch (err) {
        console.error("Search Error:", err);
        return [];
    }
}

module.exports = { initChatbot, searchMenu };