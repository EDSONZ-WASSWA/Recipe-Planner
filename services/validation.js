// Application-level validation. Every function whitelists the fields it accepts
// and collects ALL problems before throwing, so the client sees every error at once.
const { ApiError, parseObjectId } = require('../utils/errors');

const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DIETARY = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'high-protein', 'low-carb'];
const SORTS = ['newest', 'quickest', 'calories'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const NUTRITION_FIELDS = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'];
// Ingredients everybody is assumed to have: ignored when matching and in shopping lists.
const STAPLES = ['salt', 'water', 'cooking oil'];

const isString = (v) => typeof v === 'string';
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// "  Green   PEPPER " -> "green pepper"
function normalizeIngredientName(str) {
  if (!isString(str)) return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Accepts numbers or numeric strings; returns NaN for anything else.
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (isString(v) && v.trim() !== '') return Number(v);
  return NaN;
}

function isIntInRange(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

function validateRecipe(body) {
  const errors = [];
  const b = isPlainObject(body) ? body : {};
  if (!isPlainObject(body)) errors.push('body must be a JSON object');
  const out = {};

  // --- simple text fields ---
  const title = isString(b.title) ? b.title.trim() : '';
  if (title.length < 2 || title.length > 120) errors.push('title must be a string of 2-120 characters');
  else out.title = title;

  const description = isString(b.description) ? b.description.trim() : '';
  if (description.length < 1 || description.length > 1000) errors.push('description is required (1-1000 characters)');
  else out.description = description;

  const cuisine = isString(b.cuisine) ? b.cuisine.trim() : '';
  if (cuisine.length < 2 || cuisine.length > 60) errors.push('cuisine is required (2-60 characters)');
  else out.cuisine = cuisine;

  // --- enums ---
  if (!CATEGORIES.includes(b.category)) errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
  else out.category = b.category;

  if (!DIFFICULTIES.includes(b.difficulty)) errors.push(`difficulty must be one of: ${DIFFICULTIES.join(', ')}`);
  else out.difficulty = b.difficulty;

  // --- integers ---
  if (!isIntInRange(b.prepTimeMin, 0, 1440)) errors.push('prepTimeMin must be an integer between 0 and 1440');
  else out.prepTimeMin = b.prepTimeMin;
  if (!isIntInRange(b.cookTimeMin, 0, 1440)) errors.push('cookTimeMin must be an integer between 0 and 1440');
  else out.cookTimeMin = b.cookTimeMin;
  if (!isIntInRange(b.servings, 1, 100)) errors.push('servings must be an integer between 1 and 100');
  else out.servings = b.servings;

  // --- emoji ---
  if (b.emoji === undefined || b.emoji === null || b.emoji === '') {
    out.emoji = '🍽️';
  } else if (!isString(b.emoji) || [...b.emoji].length > 8 || b.emoji.length > 16) {
    errors.push('emoji must be a string of at most 8 characters');
  } else {
    out.emoji = b.emoji;
  }

  // --- tags ---
  if (b.tags === undefined || b.tags === null) {
    out.tags = [];
  } else if (!Array.isArray(b.tags) || b.tags.some((t) => !isString(t))) {
    errors.push('tags must be an array of strings');
  } else {
    const tags = [...new Set(b.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (tags.length > 15) errors.push('tags can contain at most 15 items');
    else out.tags = tags;
  }

  // --- ingredients ---
  if (!Array.isArray(b.ingredients) || b.ingredients.length < 1 || b.ingredients.length > 50) {
    errors.push('ingredients must be an array of 1-50 items');
  } else {
    const seen = new Set();
    const ingredients = [];
    b.ingredients.forEach((ing, i) => {
      const n = i + 1;
      if (!isPlainObject(ing)) {
        errors.push(`ingredients[${n}] must be an object`);
        return;
      }
      const name = normalizeIngredientName(ing.name);
      const quantity = toNumber(ing.quantity);
      const unit = isString(ing.unit) ? ing.unit.trim().toLowerCase() : '';
      let ok = true;
      if (!name || name.length > 60) { errors.push(`ingredients[${n}].name must be 1-60 characters`); ok = false; }
      else if (seen.has(name)) { errors.push(`ingredients[${n}].name "${name}" is duplicated in this recipe`); ok = false; }
      if (!Number.isFinite(quantity) || quantity <= 0) { errors.push(`ingredients[${n}].quantity must be a number greater than 0`); ok = false; }
      if (!unit || unit.length > 20) { errors.push(`ingredients[${n}].unit must be 1-20 characters`); ok = false; }
      if (ing.optional !== undefined && ing.optional !== null && typeof ing.optional !== 'boolean') {
        errors.push(`ingredients[${n}].optional must be a boolean`); ok = false;
      }
      if (name) seen.add(name);
      if (ok) ingredients.push({ name, quantity, unit, optional: ing.optional === true });
    });
    out.ingredients = ingredients;
  }

  // --- steps (order is assigned by the server) ---
  if (!Array.isArray(b.steps) || b.steps.length < 1 || b.steps.length > 50) {
    errors.push('steps must be an array of 1-50 items');
  } else {
    const steps = [];
    b.steps.forEach((s, i) => {
      const n = i + 1;
      if (!isPlainObject(s)) { errors.push(`steps[${n}] must be an object`); return; }
      const instruction = isString(s.instruction) ? s.instruction.trim() : '';
      let ok = true;
      if (!instruction || instruction.length > 1000) { errors.push(`steps[${n}].instruction must be 1-1000 characters`); ok = false; }
      const step = { order: n, instruction };
      if (s.durationMin !== undefined && s.durationMin !== null && s.durationMin !== '') {
        if (!Number.isInteger(s.durationMin) || s.durationMin < 0) { errors.push(`steps[${n}].durationMin must be an integer >= 0`); ok = false; }
        else step.durationMin = s.durationMin;
      }
      if (ok) steps.push(step);
    });
    out.steps = steps;
  }

  // --- nutrition ---
  if (!isPlainObject(b.nutrition)) {
    errors.push('nutrition must be an object');
  } else {
    const nutrition = {};
    for (const field of NUTRITION_FIELDS) {
      const v = b.nutrition[field];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`nutrition.${field} must be a number >= 0`);
      else nutrition[field] = v;
    }
    out.nutrition = nutrition;
  }

  // --- dietary ---
  if (b.dietary === undefined || b.dietary === null) {
    out.dietary = [];
  } else if (!Array.isArray(b.dietary) || b.dietary.some((d) => !DIETARY.includes(d))) {
    errors.push(`dietary must be an array containing only: ${DIETARY.join(', ')}`);
  } else {
    out.dietary = [...new Set(b.dietary)];
  }

  // --- optional flexible fields: stored only when non-empty ---
  if (b.notes !== undefined && b.notes !== null && b.notes !== '') {
    if (!isString(b.notes) || b.notes.length > 2000) errors.push('notes must be a string of at most 2000 characters');
    else if (b.notes.trim()) out.notes = b.notes.trim();
  }
  for (const field of ['equipment', 'variations']) {
    const v = b[field];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v) || v.length > 20 || v.some((x) => !isString(x))) {
      errors.push(`${field} must be an array of at most 20 strings`);
      continue;
    }
    const items = v.map((x) => x.trim()).filter(Boolean);
    if (items.some((x) => x.length > 200)) errors.push(`${field} items must be at most 200 characters`);
    else if (items.length) out[field] = items;
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  return out;
}

// weekStart must be a real calendar date AND a Monday (checked in UTC to avoid timezone shifts).
function validateWeekStart(str) {
  if (!isString(str) || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new ApiError(400, 'weekStart must be a date in YYYY-MM-DD format');
  }
  const d = new Date(`${str}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== str) {
    throw new ApiError(400, `weekStart "${str}" is not a valid calendar date`);
  }
  if (d.getUTCDay() !== 1) {
    throw new ApiError(400, `weekStart "${str}" must be a Monday`);
  }
  return str;
}

// Validates the shape of entries. Returns [{day, mealType, recipeId: ObjectId}] (no DB access here).
function validateMealPlanEntries(entries) {
  if (!Array.isArray(entries)) throw new ApiError(400, 'entries must be an array');
  if (entries.length > 28) throw new ApiError(400, 'A week can have at most 28 entries');
  const slots = new Set();
  return entries.map((e, i) => {
    if (!isPlainObject(e)) throw new ApiError(400, `entries[${i + 1}] must be an object`);
    if (!DAYS.includes(e.day)) throw new ApiError(400, `entries[${i + 1}].day must be one of: ${DAYS.join(', ')}`);
    if (!MEAL_TYPES.includes(e.mealType)) throw new ApiError(400, `entries[${i + 1}].mealType must be one of: ${MEAL_TYPES.join(', ')}`);
    const slot = `${e.day} ${e.mealType}`;
    if (slots.has(slot)) throw new ApiError(400, `Only one recipe allowed per day and meal slot (${slot})`);
    slots.add(slot);
    const recipeId = parseObjectId(e.recipeId, `entries[${i + 1}].recipeId`);
    return { day: e.day, mealType: e.mealType, recipeId };
  });
}

module.exports = {
  CATEGORIES, DIFFICULTIES, DIETARY, SORTS, DAYS, MEAL_TYPES, NUTRITION_FIELDS, STAPLES,
  isPlainObject, toNumber,
  validateRecipe, validateMealPlanEntries, validateWeekStart, normalizeIngredientName,
};
