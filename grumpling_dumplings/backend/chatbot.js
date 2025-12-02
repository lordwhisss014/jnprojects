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

    // Create Index
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
        console.log("Vector Index created.");
    } catch (e) {
        // Ignore "Index already exists"
    }

    // Check Data
    try {
        const info = await redisClient.ft.info(INDEX_NAME);
        let docCount = 0;
        
        // Robust check for doc count
        if (typeof info === 'object' && info.num_docs) {
             docCount = parseInt(info.num_docs);
        } else if (Array.isArray(info)) {
             const idx = info.indexOf('num_docs');
             if (idx > -1) docCount = parseInt(info[idx + 1]);
        }

        console.log(`Index Status: Contains ${docCount} documents.`);

        // Force re-seed if 0 docs (even if keys exist, they might be malformed)
        if (docCount === 0) {
            console.log("Index is empty! Seeding now...");
            await seedData();
        }
    } catch (err) {
        console.error("Error checking index info:", err);
        await seedData(); 
    }
}

async function getEmbedding(text) {
    const response = await embedder(text, { pooling: 'mean', normalize: true });
    // CRITICAL: Ensure we return a plain array, not Float32Array
    return Array.from(response.data).map(Number);
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
    
    // Clear existing data to fix potential bad formats
    // Note: In production, use flushdb carefully. For dev, this ensures clean slate.
    // await redisClient.flushDb(); 

    for (const item of menuItems) {
        const embedding = await getEmbedding(`${item.name} ${item.description}`);
        const key = `item:${item.name.replace(/\s/g, '')}`;
        
        // Save to Redis
        await redisClient.json.set(key, '$', {
            ...item,
            embedding: embedding // This is now guaranteed to be a plain array
        });
    }
    console.log("Menu data seeded!");
}

async function searchMenu(userQuery) {
    if (!embedder) {
        throw new Error("AI Model is not ready yet.");
    }

    const vector = await getEmbedding(userQuery);
    // Convert to Float32Array Buffer for the Search Query (Redis requires Blob here)
    const vectorBlob = Buffer.from(new Float32Array(vector).buffer);

    console.log(`Search Query: "${userQuery}"`);

    try {
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