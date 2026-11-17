const express = require('express');
const { getDb } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { STAPLES, isPlainObject, toNumber } = require('../services/validation');
const { buildStatsPipeline, summarizeExplain } = require('../services/aggregation');

const router = express.Router();

const SCENARIOS = {
  calories: { filter: { 'nutrition.calories': { $lte: 300 } }, indexName: 'idx_nutrition_calories' },
  ingredient: { filter: { 'ingredients.name': 'onion' }, indexName: 'idx_ingredients_name' },
};
const COLLECTIONS = ['recipes', 'perf_samples'];
const PERF = 'perf_samples';

// Dashboard numbers from a single $facet aggregation
router.get('/stats', async (req, res, next) => {
  try {
    const db = getDb();
    const pipeline = buildStatsPipeline();
    const [facets] = await db.collection('recipes').aggregate(pipeline).toArray();
    const [mealPlanCount, pantryCount] = await Promise.all([
      db.collection('mealplans').countDocuments(),
      db.collection('pantry').countDocuments(),
    ]);

    // each facet returns an array; unwrap the single-element ones and default to zeros when empty
    const totals = facets.totals[0] || { count: 0, favorites: 0, avgPrep: 0, avgCook: 0, avgCalories: 0 };
    const schemaVariety = facets.schemaVariety[0] || { withNotes: 0, withEquipment: 0, withVariations: 0 };

    res.json({
      success: true,
      data: {
        totals,
        byCategory: facets.byCategory,
        topIngredients: facets.topIngredients,
        byCuisine: facets.byCuisine,
        byDifficulty: facets.byDifficulty,
        schemaVariety,
        mealPlanCount,
        pantryCount,
        staplesExcluded: STAPLES,
      },
      meta: { pipeline },
    });
  } catch (err) {
    next(err);
  }
});

// Runs the same query twice (forced index vs forced collection scan) and reports explain() numbers
router.get('/explain-demo', async (req, res, next) => {
  try {
    const scenario = req.query.scenario || 'calories';
    const collection = req.query.collection || 'recipes';
    const errors = [];
    if (!Object.hasOwn(SCENARIOS, scenario)) errors.push(`scenario must be one of: ${Object.keys(SCENARIOS).join(', ')}`);
    if (!COLLECTIONS.includes(collection)) errors.push(`collection must be one of: ${COLLECTIONS.join(', ')}`);
    if (errors.length) throw new ApiError(400, 'Invalid query parameters', errors);

    const coll = getDb().collection(collection);
    const collectionSize = await coll.countDocuments();
    if (collection === PERF && collectionSize === 0) {
      throw new ApiError(400, 'Generate the benchmark dataset first');
    }

    const { filter, indexName } = SCENARIOS[scenario];
    // hint() forces the index; hint({$natural:1}) forces a full collection scan
    const indexedExplain = await coll.find(filter).hint(indexName).explain('executionStats');
    const scanExplain = await coll.find(filter).hint({ $natural: 1 }).explain('executionStats');

    res.json({
      success: true,
      data: {
        scenario,
        collection,
        filter,
        collectionSize,
        indexed: summarizeExplain(indexedExplain),
        collectionScan: summarizeExplain(scanExplain),
        smallDataset: collectionSize < 1000,
        note: 'Timings depend on dataset size, hardware and caching. With tiny collections both plans can report 0 ms, '
          + 'so compare totalDocsExamined instead: an index scan examines only matching entries while a collection scan reads every document.',
      },
    });
  } catch (err) {
    next(err);
  }
});

const NAMES = ['onion', 'tomato', 'garlic', 'rice', 'eggs', 'beans', 'carrot', 'potato', 'cabbage',
  'chicken breast', 'beef', 'milk', 'wheat flour', 'green pepper', 'spinach', 'lentils'];
const CATS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Generates synthetic recipe-shaped documents in a SEPARATE collection (real recipes are never touched)
router.post('/explain-demo/benchmark-data', async (req, res, next) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    let count = 50000;
    if (body.count !== undefined && body.count !== null) {
      count = toNumber(body.count);
      if (!Number.isInteger(count) || count < 1000 || count > 100000) {
        throw new ApiError(400, 'count must be an integer between 1000 and 100000');
      }
    }

    const coll = getDb().collection(PERF);
    await coll.deleteMany({});

    // insert in batches of 5000 so memory stays small; unordered inserts are faster
    for (let start = 0; start < count; start += 5000) {
      const size = Math.min(5000, count - start);
      const batch = [];
      for (let i = 0; i < size; i++) {
        const picked = [...NAMES].sort(() => Math.random() - 0.5).slice(0, rand(3, 8));
        batch.push({
          title: `Sample recipe ${start + i + 1}`,
          category: CATS[rand(0, CATS.length - 1)],
          nutrition: { calories: rand(50, 1200), protein_g: rand(0, 80) },
          ingredients: picked.map((name) => ({ name, quantity: rand(1, 5), unit: 'piece' })),
        });
      }
      await coll.insertMany(batch, { ordered: false });
    }

    await coll.createIndex({ 'nutrition.calories': 1 }, { name: 'idx_nutrition_calories' });
    await coll.createIndex({ 'ingredients.name': 1 }, { name: 'idx_ingredients_name' });

    res.status(201).json({ success: true, data: { inserted: count, collection: PERF } });
  } catch (err) {
    next(err);
  }
});

router.delete('/explain-demo/benchmark-data', async (req, res, next) => {
  try {
    try {
      await getDb().collection(PERF).drop();
    } catch (err) {
      if (err.codeName !== 'NamespaceNotFound' && err.code !== 26) throw err;
    }
    res.json({ success: true, data: { dropped: PERF } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
