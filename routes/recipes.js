const express = require('express');
const { getDb } = require('../config/database');
const { ApiError, parseObjectId } = require('../utils/errors');
const { CATEGORIES, DIETARY, SORTS, validateRecipe } = require('../services/validation');
const { buildRecipeListPipeline } = require('../services/aggregation');

const router = express.Router();
const recipes = () => getDb().collection('recipes');
const mealplans = () => getDb().collection('mealplans');

// List / search / filter / sort / paginate (one aggregation with $facet)
router.get('/', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : undefined;
    const sort = typeof req.query.sort === 'string' && req.query.sort ? req.query.sort : 'newest';
    const dietary = typeof req.query.dietary === 'string' && req.query.dietary
      ? [...new Set(req.query.dietary.split(',').map((d) => d.trim()).filter(Boolean))]
      : [];
    const favorite = req.query.favorite === 'true';

    const errors = [];
    if (category && !CATEGORIES.includes(category)) errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
    if (dietary.some((d) => !DIETARY.includes(d))) errors.push(`dietary must only contain: ${DIETARY.join(', ')}`);
    if (!SORTS.includes(sort)) errors.push(`sort must be one of: ${SORTS.join(', ')}`);
    if (errors.length) throw new ApiError(400, 'Invalid query parameters', errors);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));

    const pipeline = buildRecipeListPipeline({ q, category, dietary, favorite, sort, page, limit });
    const [result] = await recipes().aggregate(pipeline).toArray();
    const total = result.metadata.length ? result.metadata[0].total : 0;

    res.json({
      success: true,
      data: { recipes: result.recipes, total, page, limit, totalPages: Math.ceil(total / limit) },
      meta: { pipeline },
    });
  } catch (err) {
    next(err);
  }
});

// Lightweight list for the meal-planner picker (find + projection, no aggregation needed)
router.get('/options', async (req, res, next) => {
  try {
    const list = await recipes()
      .find({}, { projection: { title: 1, emoji: 1, category: 1, 'nutrition.calories': 1 } })
      .sort({ title: 1 })
      .toArray();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const recipe = await recipes().findOne({ _id: parseObjectId(req.params.id) });
    if (!recipe) throw new ApiError(404, 'Recipe not found');
    recipe.totalTimeMin = recipe.prepTimeMin + recipe.cookTimeMin;
    res.json({ success: true, data: recipe });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = validateRecipe(req.body);
    const doc = { ...data, isFavorite: false, createdAt: new Date() };
    const result = await recipes().insertOne(doc); // insertOne adds _id to doc
    res.status(201).json({ success: true, data: { _id: result.insertedId, ...doc } });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    const data = validateRecipe(req.body);
    const now = new Date();

    // optional fields that are absent from the body get $unset: the document really loses them
    const unset = {};
    for (const field of ['notes', 'equipment', 'variations']) {
      if (data[field] === undefined) unset[field] = '';
    }
    const update = { $set: { ...data, updatedAt: now } };
    if (Object.keys(unset).length) update.$unset = unset;

    const updated = await recipes().findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' });
    if (!updated) throw new ApiError(404, 'Recipe not found');

    // Meal plans store a copy of title/calories/emoji (denormalization for fast reads),
    // so the copy must be refreshed. arrayFilters limits the update to matching array elements.
    const sync = await mealplans().updateMany(
      { 'entries.recipeId': id },
      {
        $set: {
          'entries.$[e].recipeTitle': data.title,
          'entries.$[e].calories': data.nutrition.calories,
          'entries.$[e].emoji': data.emoji,
          updatedAt: now,
        },
      },
      { arrayFilters: [{ 'e.recipeId': id }] }
    );

    updated.totalTimeMin = updated.prepTimeMin + updated.cookTimeMin;
    res.json({ success: true, data: updated, meta: { mealPlansUpdated: sync.modifiedCount } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    const result = await recipes().deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new ApiError(404, 'Recipe not found');

    // $pull removes every entry that referenced the deleted recipe: no dangling references
    const sync = await mealplans().updateMany(
      { 'entries.recipeId': id },
      { $pull: { entries: { recipeId: id } }, $set: { updatedAt: new Date() } }
    );
    res.json({ success: true, data: { deletedId: id }, meta: { mealPlansUpdated: sync.modifiedCount } });
  } catch (err) {
    next(err);
  }
});

// Toggle favourite atomically in ONE round trip using an update pipeline:
// the new value is computed from the current value inside the database.
router.patch('/:id/favorite', async (req, res, next) => {
  try {
    const doc = await recipes().findOneAndUpdate(
      { _id: parseObjectId(req.params.id) },
      [{ $set: { isFavorite: { $not: [{ $ifNull: ['$isFavorite', false] }] } } }],
      { returnDocument: 'after', projection: { isFavorite: 1, title: 1 } }
    );
    if (!doc) throw new ApiError(404, 'Recipe not found');
    res.json({ success: true, data: { _id: doc._id, isFavorite: doc.isFavorite } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
