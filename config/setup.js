// Creates the collection validator and all indexes. Safe to run on every start:
// createIndex is idempotent, and we never drop anything.

// DB-level safety net. App-level validation (services/validation.js) is the first
// line of defence; this $jsonSchema rejects badly-shaped documents even if they
// arrive from another tool (mongosh, Compass, a script...).
// It deliberately has NO additionalProperties:false so optional fields such as
// notes / equipment / variations can exist on some documents only (flexible schema).
const recipeValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['title', 'category', 'ingredients', 'steps', 'nutrition'],
    properties: {
      title: { bsonType: 'string', description: 'recipe title' },
      category: { bsonType: 'string' },
      ingredients: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['name', 'quantity'],
          properties: {
            name: { bsonType: 'string' },
            quantity: { bsonType: ['double', 'int', 'long', 'decimal'] },
          },
        },
      },
      steps: { bsonType: 'array' },
      nutrition: { bsonType: 'object' },
    },
  },
};

async function applyRecipeValidator(db) {
  const existing = await db.listCollections({ name: 'recipes' }).toArray();
  const options = { validator: recipeValidator, validationLevel: 'moderate', validationAction: 'error' };
  if (existing.length === 0) {
    await db.createCollection('recipes', options);
  } else {
    // collMod updates the validator on an existing collection without touching its data
    await db.command({ collMod: 'recipes', ...options });
  }
}

async function safeCreateIndex(collection, keys, options) {
  try {
    await collection.createIndex(keys, options);
  } catch (err) {
    // 85 = IndexOptionsConflict, 86 = IndexKeySpecsConflict: index exists with other settings.
    if (err.code === 85 || err.code === 86) {
      console.warn(`[setup] Index "${options.name}" already exists with different options - keeping the existing one.`);
    } else {
      console.warn(`[setup] Could not create index "${options.name}": ${err.message}`);
    }
  }
}

async function initializeDatabase(db) {
  await applyRecipeValidator(db);

  const recipes = db.collection('recipes');
  const mealplans = db.collection('mealplans');
  const pantry = db.collection('pantry');

  // GET /api/recipes?q=... : weighted full-text search ($text). Title matches rank highest.
  await safeCreateIndex(
    recipes,
    { title: 'text', description: 'text', tags: 'text', 'ingredients.name': 'text' },
    {
      name: 'recipe_text_search',
      weights: { title: 10, tags: 5, 'ingredients.name': 3, description: 1 },
      default_language: 'english',
    }
  );

  // POST /api/cook and explain-demo (ingredient): multikey index, one key per array element.
  await safeCreateIndex(recipes, { 'ingredients.name': 1 }, { name: 'idx_ingredients_name' });

  // POST /api/nutrition-search (maxCalories) and GET /api/recipes?sort=calories.
  await safeCreateIndex(recipes, { 'nutrition.calories': 1 }, { name: 'idx_nutrition_calories' });

  // POST /api/nutrition-search (minProtein) range filter.
  await safeCreateIndex(recipes, { 'nutrition.protein_g': 1 }, { name: 'idx_nutrition_protein' });

  // GET /api/recipes?category=... equality filter.
  await safeCreateIndex(recipes, { category: 1 }, { name: 'idx_category' });

  // GET /api/recipes?dietary=... and nutrition-search dietary filter ($all on a multikey index).
  await safeCreateIndex(recipes, { dietary: 1 }, { name: 'idx_dietary' });

  // GET /api/recipes?sort=newest (default sort) avoids an in-memory sort.
  await safeCreateIndex(recipes, { createdAt: -1 }, { name: 'idx_created_at' });

  // GET/POST /api/mealplans: one plan per week; the unique index makes duplicates fail with code 11000.
  await safeCreateIndex(mealplans, { weekStart: 1 }, { name: 'uniq_week_start', unique: true });

  // Recipe PUT/DELETE: finds meal plans that reference a recipe (denormalization sync).
  await safeCreateIndex(mealplans, { 'entries.recipeId': 1 }, { name: 'idx_entries_recipe_id' });

  // POST /api/pantry: upsert by name; unique so an item exists only once.
  await safeCreateIndex(pantry, { name: 1 }, { name: 'uniq_pantry_name', unique: true });
}

module.exports = { initializeDatabase };
