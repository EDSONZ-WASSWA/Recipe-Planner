// Single shared MongoClient: the driver keeps a connection pool internally,
// so the whole app reuses this one client instead of reconnecting per request.
const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connectDB() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || 'recipe_planner';

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(dbName);
  // ping proves the server is really reachable
  await db.command({ ping: 1 });
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connectDB() first.');
  return db;
}

async function closeDB() {
  if (client) {
    await client.close();
  }
  client = null;
  db = null;
}

module.exports = { connectDB, getDb, closeDB };
