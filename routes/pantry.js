const express = require('express');
const { getDb } = require('../config/database');
const { ApiError, parseObjectId } = require('../utils/errors');
const { isPlainObject, toNumber, normalizeIngredientName } = require('../services/validation');

const router = express.Router();
const pantry = () => getDb().collection('pantry');

function validateQuantityUnit(body, errors) {
  const quantity = toNumber(body.quantity);
  const unit = typeof body.unit === 'string' ? body.unit.trim().toLowerCase() : '';
  if (!Number.isFinite(quantity) || quantity < 0) errors.push('quantity must be a number >= 0');
  if (!unit || unit.length > 20) errors.push('unit must be 1-20 characters');
  return { quantity, unit };
}

router.get('/', async (req, res, next) => {
  try {
    const items = await pantry().find().sort({ name: 1 }).toArray();
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// Upsert: adding an existing name updates it instead of failing
router.post('/', async (req, res, next) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const errors = [];
    const name = normalizeIngredientName(body.name);
    if (!name || name.length > 60) errors.push('name must be 1-60 characters');
    const { quantity, unit } = validateQuantityUnit(body, errors);
    if (errors.length) throw new ApiError(400, 'Validation failed', errors);

    const now = new Date();
    await pantry().updateOne(
      { name },
      { $set: { quantity, unit, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    const doc = await pantry().findOne({ name });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};
    const errors = [];
    const { quantity, unit } = validateQuantityUnit(body, errors);
    if (errors.length) throw new ApiError(400, 'Validation failed', errors);

    const updated = await pantry().findOneAndUpdate(
      { _id: id },
      { $set: { quantity, unit, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!updated) throw new ApiError(404, 'Pantry item not found');
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    const result = await pantry().deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new ApiError(404, 'Pantry item not found');
    res.json({ success: true, data: { deletedId: id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
