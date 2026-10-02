import { MongoClient } from 'mongodb';

let client;
let db;

export async function connectDB() {
    if (db) return db;

    const uri = process.env.MONGO_URI;
    const dbName = process.env.DB_NAME;

    if (!uri) throw new Error('MONGO_URI is not set in .env');
    if (!dbName) throw new Error('DB_NAME is not set in .env');

    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);

    console.log(`✅ Connected to MongoDB Atlas — DB: ${db.databaseName}`);
    return db;
}

export function getDB() {
    if (!db) throw new Error('DB not initialized. Call connectDB() first.');
    return db;
}

export async function closeDB() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log('🔌 MongoDB connection closed');
    }
}