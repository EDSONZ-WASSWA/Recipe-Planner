const express = require('express');
const { getDb } = require('../config/database');
const { ApiError, parseObjectId } = require('../utils/errors');
const {
  DAYS, MEAL_TYPES, STAPLES, isPlainObject,
  validateMealPlanEntries, validateWeekStart,
} = require('../services/validation');
const { buildShoppingListPipeline, buildMealPlanListPipeline } = require('../services/aggregation');

const router = express.Router();
const plans = () => getDb().collection('mealplans');

// Validates entries, loads the recipes with ONE query and copies title/calories/emoji
// from the database (client-sent values are never trusted). Result is sorted by day, then meal.
async function buildEntries(rawEntries) {
  const entries = validateMealPlanEntries(rawEntries);
  const ids = [...new Map(entries.map((e) => [e.recipeId.toString(), e.recipeId])).values()];

  const found = ids.length
    ? await getDb().collection('recipes')
      .find({ _id: { $in: ids } }, { projection: { title: 1, emoji: 1, 'nutrition.calories': 1 } })
      .toArray()
    : [];
  const byId = new Map(found.map((r) => [r._id.toString(), r]));

  const unknown = ids.filter((id) => !byId.has(id.toString()));
  if (unknown.length) {
    throw new ApiError(400, 'Some recipes do not exist', unknown.map((id) => `recipeId ${id} not found`));
  }

  return entries
    .map((e) => {
      const r = byId.get(e.recipeId.toString());
      return {
        day: e.day,
        mealType: e.mealType,
        recipeId: e.recipeId,
        recipeTitle: r.title,
        calories: r.nutrition.calories,
        emoji: r.emoji,
      };
    })
    .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType));
}

// With ?weekStart= : the plan for that week (or null). Without: summary list of all plans.
router.get('/', async (req, res, next) => {
  try {
    if (req.query.weekStart !== undefined) {
      const weekStart = validateWeekStart(req.query.weekStart);
      const plan = await plans().findOne({ weekStart });
      return res.json({ success: true, data: plan || null });
    }
    const list = await plans().aggregate(buildMealPlanListPipeline()).toArray();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const weekStart = validateWeekStart(body.weekStart);
    const entries = await buildEntries(body.entries === undefined ? [] : body.entries);
    const now = new Date();
    const doc = { weekStart, entries, purchasedItems: [], createdAt: now, updatedAt: now };
    try {
      const result = await plans().insertOne(doc);
      res.status(201).json({ success: true, data: { _id: result.insertedId, ...doc } });
    } catch (err) {
      // the unique index on weekStart rejects a second plan for the same week
      if (err.code === 11000) throw new ApiError(409, `A meal plan already exists for week ${weekStart}`);
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};
    const entries = await buildEntries(body.entries);
    // weekStart is immutable, purchasedItems is left untouched
    const updated = await plans().findOneAndUpdate(
      { _id: id },
      { $set: { entries, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!updated) throw new ApiError(404, 'Meal plan not found');
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    const result = await plans().deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new ApiError(404, 'Meal plan not found');
    res.json({ success: true, data: { deletedId: id } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/shopping-list', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    const plan = await plans().findOne({ _id: id });
    if (!plan) throw new ApiError(404, 'Meal plan not found');

    const pipeline = buildShoppingListPipeline(id);
    const items = await plans().aggregate(pipeline).toArray();
    res.json({
      success: true,
      data: {
        weekStart: plan.weekStart,
        items,
        purchasedItems: plan.purchasedItems || [],
        mealCount: plan.entries.length,
        staplesExcluded: STAPLES,
      },
      meta: { pipeline },
    });
  } catch (err) {
    next(err);
  }
});

// Tick / untick one shopping-list row. $addToSet never adds duplicates; $pull removes the value.
router.patch('/:id/purchased', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};
    const errors = [];
    if (typeof body.key !== 'string' || !body.key.trim() || body.key.length > 100) errors.push('key must be a string of 1-100 characters');
    if (typeof body.purchased !== 'boolean') errors.push('purchased must be a boolean');
    if (errors.length) throw new ApiError(400, 'Validation failed', errors);

    const update = body.purchased
      ? { $addToSet: { purchasedItems: body.key }, $set: { updatedAt: new Date() } }
      : { $pull: { purchasedItems: body.key }, $set: { updatedAt: new Date() } };
    const updated = await plans().findOneAndUpdate({ _id: id }, update, {
      returnDocument: 'after',
      projection: { purchasedItems: 1 },
    });
    if (!updated) throw new ApiError(404, 'Meal plan not found');
    res.json({ success: true, data: { purchasedItems: updated.purchasedItems || [] } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
