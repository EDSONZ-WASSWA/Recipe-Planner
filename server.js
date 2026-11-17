require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('path');

const { connectDB, getDb, closeDB } = require('./config/database');
const { initializeDatabase } = require('./config/setup');
const { ApiError } = require('./utils/errors');

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Copy .env.example to .env and edit the values.');
  process.exit(1);
}
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res, next) => {
  try {
    await getDb().command({ ping: 1 });
    res.json({ success: true, data: { status: 'ok', db: 'connected' } });
  } catch (err) {
    next(err);
  }
});

app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/cook', require('./routes/cooking'));
app.use('/api/nutrition-search', require('./routes/nutrition'));
app.use('/api/mealplans', require('./routes/mealplans'));
app.use('/api', require('./routes/dashboard')); // /api/stats and /api/explain-demo
app.use('/api/pantry', require('./routes/pantry'));

// Any other /api path
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl.split('?')[0]}` });
});

// Central error handler: only safe messages ever reach the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    const body = { success: false, error: err.message };
    if (err.details && err.details.length) body.details = err.details;
    return res.status(err.status).json(body);
  }
  if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Malformed JSON request body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body too large' });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ success: false, error: 'Duplicate value: this item already exists' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

async function start() {
  try {
    const db = await connectDB();
    await initializeDatabase(db);
  } catch (err) {
    console.error(`Could not connect to MongoDB: ${err.message}`);
    console.error('Troubleshooting:');
    console.error('  - Is the MongoDB service running? On Windows try: net start MongoDB');
    console.error('  - Check MONGODB_URI in your .env file.');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Recipe & Meal Planner running at http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other program or change PORT in .env.`);
    } else {
      console.error('Server error:', err.message);
    }
    closeDB().finally(() => process.exit(1));
  });

  const shutdown = async () => {
    server.close();
    await closeDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
