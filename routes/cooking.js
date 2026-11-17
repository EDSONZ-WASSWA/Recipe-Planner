const express = require('express');
const { getDb } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { STAPLES, normalizeIngredientName, isPlainObject } = require('../services/validation');
const { buildCookPipeline } = require('../services/aggregation');

const router = express.Router();

// "What can I cook with these ingredients?"
router.post('/', async (req, res, next) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    if (!Array.isArray(body.ingredients)) throw new ApiError(400, 'ingredients must be an array of strings');
    if (body.onlyFullMatch !== undefined && typeof body.onlyFullMatch !== 'boolean') {
      throw new ApiError(400, 'onlyFullMatch must be a boolean');
    }

    // normalize, drop empties, remove duplicates
    const ingredients = [...new Set(body.ingredients.map(normalizeIngredientName).filter(Boolean))];
    if (ingredients.length === 0) throw new ApiError(400, 'Please enter at least one ingredient');
    if (ingredients.length > 50) throw new ApiError(400, 'Please enter at most 50 ingredients');

    const pipeline = buildCookPipeline(ingredients, body.onlyFullMatch === true);
    const results = await getDb().collection('recipes').aggregate(pipeline).toArray();

    res.json({
      success: true,
      data: { results, count: results.length, ingredients, staples: STAPLES },
      meta: { pipeline },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
