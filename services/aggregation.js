// Builders for aggregation pipelines and queries. Keeping them here (pure functions,
// no DB access) makes each pipeline easy to read, and lets routes return the exact
// pipeline in meta.pipeline so the frontend can display it.
const { STAPLES } = require('./validation');

// Fields that make list responses heavy; excluded from list/search results.
const HEAVY_FIELDS = { steps: 0, ingredients: 0, variations: 0, notes: 0, equipment: 0 };

// ---------- Recipe list: $match -> $addFields -> $sort -> $facet(count + page) ----------
function buildRecipeListPipeline({ q, category, dietary, favorite, sort, page, limit }) {
  const match = {};
  // $text must be part of the first $match stage so the text index can be used
  if (q) match.$text = { $search: q };
  if (category) match.category = category;
  // $all = recipe must carry every selected dietary tag
  if (dietary && dietary.length) match.dietary = { $all: dietary };
  if (favorite) match.isFavorite = true;

  const sortStages = {
    newest: { createdAt: -1 },
    quickest: { totalTimeMin: 1, title: 1 },
    calories: { 'nutrition.calories': 1, title: 1 },
  };

  return [
    { $match: match },
    // computed field: total time = prep + cook (not stored, so it never goes stale)
    { $addFields: { totalTimeMin: { $add: ['$prepTimeMin', '$cookTimeMin'] } } },
    { $sort: sortStages[sort] || sortStages.newest },
    {
      // $facet runs two sub-pipelines on the same input: the total count and the requested page
      $facet: {
        metadata: [{ $count: 'total' }],
        recipes: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $project: HEAVY_FIELDS },
        ],
      },
    },
  ];
}

// ---------- Ingredient matching ----------
// $map over a filtered ingredient list -> normalized names, minus the staples.
function namesExpr(optionalFlag) {
  const cond = optionalFlag
    ? { $eq: ['$$ing.optional', true] }
    : { $ne: ['$$ing.optional', true] };
  return {
    $setDifference: [
      {
        $map: {
          input: { $filter: { input: '$ingredients', as: 'ing', cond } },
          as: 'i',
          in: { $toLower: { $trim: { input: '$$i.name' } } },
        },
      },
      STAPLES, // staples are assumed to be in every kitchen
    ],
  };
}

function buildCookPipeline(userIngredients, onlyFullMatch) {
  return [
    // skip documents that have no ingredients array entries
    { $match: { 'ingredients.0': { $exists: true } } },
    // split ingredients into required / optional name sets (sets also remove duplicates)
    { $addFields: { requiredIngredients: namesExpr(false), optionalIngredients: namesExpr(true) } },
    // compare with what the user has using set operations
    {
      $addFields: {
        availableIngredients: { $setIntersection: ['$requiredIngredients', userIngredients] },
        missingIngredients: { $setDifference: ['$requiredIngredients', userIngredients] },
        optionalAvailable: { $setIntersection: ['$optionalIngredients', userIngredients] },
        totalTimeMin: { $add: ['$prepTimeMin', '$cookTimeMin'] },
      },
    },
    {
      $addFields: {
        totalRequired: { $size: '$requiredIngredients' },
        availableCount: { $size: '$availableIngredients' },
        missingCount: { $size: '$missingIngredients' },
      },
    },
    {
      // a recipe needing nothing but staples counts as 100%
      $addFields: {
        matchPercentage: {
          $cond: [
            { $eq: ['$totalRequired', 0] },
            100,
            { $round: [{ $multiply: [{ $divide: ['$availableCount', '$totalRequired'] }, 100] }, 0] },
          ],
        },
      },
    },
    { $match: onlyFullMatch ? { matchPercentage: 100 } : { matchPercentage: { $gt: 0 } } },
    // best matches first, then fewest missing, then quickest
    { $sort: { matchPercentage: -1, missingCount: 1, totalTimeMin: 1, title: 1 } },
    {
      $project: {
        title: 1, emoji: 1, cuisine: 1, category: 1, difficulty: 1,
        prepTimeMin: 1, cookTimeMin: 1, totalTimeMin: 1, 'nutrition.calories': 1,
        availableIngredients: 1, missingIngredients: 1, optionalAvailable: 1,
        totalRequired: 1, availableCount: 1, matchPercentage: 1,
      },
    },
    { $limit: 50 },
  ];
}

// ---------- Nutrition search (plain find, built only from validated numbers) ----------
function buildNutritionQuery(f) {
  const query = {};
  if (f.maxCalories !== undefined) query['nutrition.calories'] = { $lte: f.maxCalories };
  if (f.minProtein !== undefined) query['nutrition.protein_g'] = { $gte: f.minProtein };
  if (f.maxCarbs !== undefined) query['nutrition.carbs_g'] = { $lte: f.maxCarbs };
  if (f.maxFat !== undefined) query['nutrition.fat_g'] = { $lte: f.maxFat };
  if (f.minFiber !== undefined) query['nutrition.fiber_g'] = { $gte: f.minFiber };
  if (f.dietary && f.dietary.length) query.dietary = { $all: f.dietary };
  return query;
}

const NUTRITION_SORT = { 'nutrition.calories': 1, title: 1 };
const NUTRITION_LIMIT = 50;
const NUTRITION_PROJECTION = { steps: 0, ingredients: 0, notes: 0, equipment: 0, variations: 0 };

// ---------- Shopping list for one meal plan ----------
function buildShoppingListPipeline(planId) {
  return [
    { $match: { _id: planId } },
    // one document per planned meal (a recipe planned twice appears twice)
    { $unwind: '$entries' },
    // join each entry with its recipe; $unwind drops entries whose recipe was deleted
    { $lookup: { from: 'recipes', localField: 'entries.recipeId', foreignField: '_id', as: 'recipe' } },
    { $unwind: '$recipe' },
    // one document per ingredient line
    { $unwind: '$recipe.ingredients' },
    { $match: { 'recipe.ingredients.name': { $nin: STAPLES } } },
    {
      // same ingredient + same unit are added together
      $group: {
        _id: { name: '$recipe.ingredients.name', unit: '$recipe.ingredients.unit' },
        totalQuantity: { $sum: '$recipe.ingredients.quantity' },
        recipes: { $addToSet: '$recipe.title' },
        // $min over booleans: false if ANY recipe needs it as required
        allOptional: { $min: { $ifNull: ['$recipe.ingredients.optional', false] } },
      },
    },
    {
      $project: {
        _id: 0,
        key: { $concat: ['$_id.name', '|', '$_id.unit'] },
        name: '$_id.name',
        unit: '$_id.unit',
        totalQuantity: { $round: ['$totalQuantity', 2] },
        recipes: 1,
        recipeCount: { $size: '$recipes' },
        allOptional: 1,
      },
    },
    { $sort: { name: 1, unit: 1 } },
  ];
}

// ---------- Meal plan list ----------
function buildMealPlanListPipeline() {
  return [
    {
      $project: {
        weekStart: 1,
        entryCount: { $size: { $ifNull: ['$entries', []] } },
        totalCalories: { $sum: '$entries.calories' },
        updatedAt: 1,
      },
    },
    { $sort: { weekStart: -1 } },
  ];
}

// ---------- Dashboard statistics: one $facet = many results from a single pass ----------
function buildStatsPipeline() {
  const round1 = (expr) => ({ $round: [expr, 1] });
  const hasField = (field) => ({ $sum: { $cond: [{ $ne: [{ $type: field }, 'missing'] }, 1, 0] } });
  return [
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              favorites: { $sum: { $cond: [{ $eq: ['$isFavorite', true] }, 1, 0] } },
              avgPrep: { $avg: '$prepTimeMin' },
              avgCook: { $avg: '$cookTimeMin' },
              avgCalories: { $avg: '$nutrition.calories' },
            },
          },
          {
            $project: {
              _id: 0, count: 1, favorites: 1,
              avgPrep: round1('$avgPrep'), avgCook: round1('$avgCook'), avgCalories: round1('$avgCalories'),
            },
          },
        ],
        byCategory: [
          { $group: { _id: '$category', count: { $sum: 1 }, avgCalories: { $avg: '$nutrition.calories' } } },
          { $project: { _id: 0, category: '$_id', count: 1, avgCalories: round1('$avgCalories') } },
          { $sort: { count: -1, category: 1 } },
        ],
        topIngredients: [
          { $unwind: '$ingredients' },
          { $match: { 'ingredients.name': { $nin: STAPLES } } },
          { $group: { _id: '$ingredients.name', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 10 },
          { $project: { _id: 0, name: '$_id', count: 1 } },
        ],
        byCuisine: [
          { $group: { _id: '$cuisine', count: { $sum: 1 } } },
          { $project: { _id: 0, cuisine: '$_id', count: 1 } },
          { $sort: { count: -1, cuisine: 1 } },
        ],
        byDifficulty: [
          { $group: { _id: '$difficulty', count: { $sum: 1 } } },
          { $project: { _id: 0, difficulty: '$_id', count: 1 } },
          { $sort: { count: -1, difficulty: 1 } },
        ],
        // flexible schema demo: how many documents actually carry each optional field
        schemaVariety: [
          {
            $group: {
              _id: null,
              withNotes: hasField('$notes'),
              withEquipment: hasField('$equipment'),
              withVariations: hasField('$variations'),
            },
          },
          { $project: { _id: 0 } },
        ],
      },
    },
  ];
}

// ---------- explain() helpers ----------
// Walks the plan tree (inputStage / inputStages / queryPlan wrapper in MongoDB 8) collecting stage names.
function collectStages(node, stages = []) {
  if (!node || typeof node !== 'object') return stages;
  if (node.queryPlan) return collectStages(node.queryPlan, stages);
  if (node.stage) stages.push(node.stage);
  if (node.inputStage) collectStages(node.inputStage, stages);
  if (Array.isArray(node.inputStages)) node.inputStages.forEach((s) => collectStages(s, stages));
  if (node.shardPlan) collectStages(node.shardPlan, stages);
  return stages;
}

function findIndexName(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.queryPlan) return findIndexName(node.queryPlan);
  if (node.stage === 'IXSCAN') return node.indexName || null;
  if (node.inputStage) {
    const r = findIndexName(node.inputStage);
    if (r) return r;
  }
  if (Array.isArray(node.inputStages)) {
    for (const s of node.inputStages) {
      const r = findIndexName(s);
      if (r) return r;
    }
  }
  return null;
}

function summarizeExplain(explain) {
  const stats = explain.executionStats || {};
  const winningPlan = (explain.queryPlanner && explain.queryPlanner.winningPlan) || {};
  const stages = collectStages(winningPlan);
  const primaryStage = stages.includes('IXSCAN') ? 'IXSCAN' : stages.includes('COLLSCAN') ? 'COLLSCAN' : stages[stages.length - 1] || 'UNKNOWN';
  return {
    executionTimeMillis: stats.executionTimeMillis,
    totalDocsExamined: stats.totalDocsExamined,
    totalKeysExamined: stats.totalKeysExamined,
    nReturned: stats.nReturned,
    stages,
    primaryStage,
    indexName: findIndexName(winningPlan),
  };
}

module.exports = {
  buildRecipeListPipeline, buildCookPipeline, buildNutritionQuery,
  NUTRITION_SORT, NUTRITION_LIMIT, NUTRITION_PROJECTION,
  buildShoppingListPipeline, buildMealPlanListPipeline, buildStatsPipeline,
  summarizeExplain, HEAVY_FIELDS,
};
