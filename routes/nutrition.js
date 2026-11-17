const express = require('express');
const { getDb } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { DIETARY, isPlainObject, toNumber } = require('../services/validation');
const {
  buildNutritionQuery, NUTRITION_SORT, NUTRITION_LIMIT, NUTRITION_PROJECTION,
} = require('../services/aggregation');

const router = express.Router();
const NUMERIC_FILTERS = ['maxCalories', 'minProtein', 'maxCarbs', 'maxFat', 'minFiber'];

router.post('/', async (req, res, next) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const errors = [];
    const filters = {};

    // Only known keys are read. Values become plain numbers, so a client can never
    // smuggle a MongoDB operator (like {"$where": ...}) into the query.
    for (const key of NUMERIC_FILTERS) {
      const v = body[key];
      if (v === undefined || v === null || v === '') continue;
      const n = toNumber(v);
      if (!Number.isFinite(n) || n < 0) errors.push(`${key} must be a number >= 0`);
      else filters[key] = n;
    }

    if (body.dietary !== undefined && body.dietary !== null) {
      if (!Array.isArray(body.dietary) || body.dietary.some((d) => !DIETARY.includes(d))) {
        errors.push(`dietary must be an array containing only: ${DIETARY.join(', ')}`);
      } else {
        filters.dietary = [...new Set(body.dietary)];
      }
    }
    if (errors.length) throw new ApiError(400, 'Validation failed', errors);

    const query = buildNutritionQuery(filters);
    const results = await getDb().collection('recipes')
      .find(query, { projection: NUTRITION_PROJECTION })
      .sort(NUTRITION_SORT)
      .limit(NUTRITION_LIMIT)
      .toArray();

    res.json({
      success: true,
      data: { results, count: results.length },
      meta: { query, sort: NUTRITION_SORT, limit: NUTRITION_LIMIT },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
