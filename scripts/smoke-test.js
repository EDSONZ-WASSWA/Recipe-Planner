// End-to-end API test. Run with the server already started:  npm start  (then)  npm run smoke
require('dotenv').config({ quiet: true });
const assert = require('node:assert');

const BASE = `http://localhost:${process.env.PORT || 3000}`;
let passed = 0;
let failed = 0;

async function api(method, path, body, rawBody) {
  const options = { method, headers: {} };
  if (rawBody !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = rawBody;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, options);
  const json = await res.json();
  return { status: res.status, body: json };
}

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
  }
}

const testRecipe = (overrides = {}) => ({
  title: 'Smoke Test Stew', description: 'Temporary recipe created by the smoke test.',
  category: 'dinner', cuisine: 'Testland', difficulty: 'easy', prepTimeMin: 5, cookTimeMin: 10, servings: 2,
  emoji: '🧪', tags: ['Smoke ', 'smoke', 'test'], dietary: ['vegan', 'vegan'],
  ingredients: [
    { name: '  Smoke   Bean ', quantity: '2', unit: 'Cup' },
    { name: 'salt', quantity: 1, unit: 'tsp' },
    { name: 'smoke herb', quantity: 1, unit: 'tbsp', optional: true },
  ],
  steps: [{ instruction: 'Mix.', order: 9 }, { instruction: 'Cook.', durationMin: 5 }],
  nutrition: { calories: 111, protein_g: 5, carbs_g: 10, fat_g: 2, fiber_g: 3, sugar_g: 1, sodium_mg: 100 },
  notes: 'temporary', equipment: ['pot'], variations: ['none'],
  isFavorite: true, createdAt: '2000-01-01', _id: 'hack',
  ...overrides,
});

async function main() {
  let recipeId; let recipeId2; let planId; let pantryId;
  let seededId;
  const WEEK = '2030-01-07';

  await check('GET /api/health', async () => {
    const r = await api('GET', '/api/health');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.data, { status: 'ok', db: 'connected' });
  });

  // ---------- recipes: reading ----------
  await check('GET /api/recipes default list', async () => {
    const r = await api('GET', '/api/recipes');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.total >= 26, `total ${r.body.data.total}`);
    assert.strictEqual(r.body.data.recipes.length, 12);
    assert.strictEqual(r.body.data.limit, 12);
    assert.ok(Array.isArray(r.body.meta.pipeline));
    assert.ok(r.body.data.recipes.every((x) => x.ingredients === undefined && x.steps === undefined && x.totalTimeMin >= 0));
    seededId = r.body.data.recipes[0]._id;
  });
  await check('GET /api/recipes?q=chicken (text search)', async () => {
    const r = await api('GET', '/api/recipes?q=chicken');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.total >= 3);
    assert.ok(r.body.meta.pipeline[0].$match.$text);
  });
  await check('GET /api/recipes?category=breakfast', async () => {
    const r = await api('GET', '/api/recipes?category=breakfast&limit=50');
    assert.ok(r.body.data.total >= 4);
    assert.ok(r.body.data.recipes.every((x) => x.category === 'breakfast'));
  });
  await check('GET /api/recipes?dietary=vegan,gluten-free', async () => {
    const r = await api('GET', '/api/recipes?dietary=vegan,gluten-free&limit=50');
    assert.ok(r.body.data.total >= 3);
    assert.ok(r.body.data.recipes.every((x) => x.dietary.includes('vegan') && x.dietary.includes('gluten-free')));
  });
  await check('GET /api/recipes?favorite=true', async () => {
    const r = await api('GET', '/api/recipes?favorite=true&limit=50');
    assert.ok(r.body.data.total >= 5);
    assert.ok(r.body.data.recipes.every((x) => x.isFavorite === true));
  });
  await check('sort=newest is descending by createdAt', async () => {
    const r = await api('GET', '/api/recipes?sort=newest&limit=50');
    const dates = r.body.data.recipes.map((x) => x.createdAt);
    assert.deepStrictEqual(dates, [...dates].sort().reverse());
  });
  await check('sort=quickest is ascending by total time', async () => {
    const r = await api('GET', '/api/recipes?sort=quickest&limit=50');
    const t = r.body.data.recipes.map((x) => x.totalTimeMin);
    assert.deepStrictEqual(t, [...t].sort((a, b) => a - b));
  });
  await check('sort=calories is ascending by calories', async () => {
    const r = await api('GET', '/api/recipes?sort=calories&limit=50');
    const c = r.body.data.recipes.map((x) => x.nutrition.calories);
    assert.deepStrictEqual(c, [...c].sort((a, b) => a - b));
  });
  await check('pagination page=2&limit=10', async () => {
    const p1 = await api('GET', '/api/recipes?page=1&limit=10');
    const p2 = await api('GET', '/api/recipes?page=2&limit=10');
    assert.strictEqual(p2.body.data.page, 2);
    assert.strictEqual(p2.body.data.recipes.length, Math.min(10, p2.body.data.total - 10));
    assert.ok(p1.body.data.recipes[0]._id !== p2.body.data.recipes[0]._id);
    assert.strictEqual(p2.body.data.totalPages, Math.ceil(p2.body.data.total / 10));
  });
  await check('invalid category -> 400', async () => {
    const r = await api('GET', '/api/recipes?category=brunch');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.success, false);
  });
  await check('invalid sort / dietary -> 400', async () => {
    assert.strictEqual((await api('GET', '/api/recipes?sort=best')).status, 400);
    assert.strictEqual((await api('GET', '/api/recipes?dietary=keto')).status, 400);
  });
  await check('GET /api/recipes/options', async () => {
    const r = await api('GET', '/api/recipes/options');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.length >= 26);
    assert.ok(r.body.data[0].title && r.body.data[0].nutrition.calories >= 0);
  });
  await check('GET /api/recipes/:id returns full document', async () => {
    const r = await api('GET', `/api/recipes/${seededId}`);
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.data.ingredients) && Array.isArray(r.body.data.steps));
    assert.ok(r.body.data.totalTimeMin >= 0);
  });
  await check('invalid ObjectId -> 400', async () => {
    assert.strictEqual((await api('GET', '/api/recipes/not-an-id')).status, 400);
  });
  await check('unknown valid id -> 404', async () => {
    assert.strictEqual((await api('GET', '/api/recipes/aaaaaaaaaaaaaaaaaaaaaaaa')).status, 404);
  });

  // ---------- recipes: writing ----------
  await check('POST invalid recipe -> 400 with details', async () => {
    const r = await api('POST', '/api/recipes', { title: 'x', category: 'nope', ingredients: [], nutrition: {} });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Validation failed');
    assert.ok(Array.isArray(r.body.details) && r.body.details.length >= 5);
  });
  await check('POST duplicate ingredient names -> 400', async () => {
    const r = await api('POST', '/api/recipes', testRecipe({
      ingredients: [{ name: 'Egg', quantity: 1, unit: 'piece' }, { name: ' egg ', quantity: 1, unit: 'piece' }],
    }));
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.details.some((d) => d.includes('duplicated')));
  });
  await check('POST valid recipe -> 201 (normalized, whitelisted, optional fields kept)', async () => {
    const r = await api('POST', '/api/recipes', testRecipe());
    assert.strictEqual(r.status, 201);
    const d = r.body.data;
    recipeId = d._id;
    assert.strictEqual(d.isFavorite, false);
    assert.notStrictEqual(d._id, 'hack');
    assert.ok(new Date(d.createdAt).getFullYear() >= 2026);
    assert.deepStrictEqual(d.tags, ['smoke', 'test']);
    assert.deepStrictEqual(d.dietary, ['vegan']);
    assert.strictEqual(d.ingredients[0].name, 'smoke bean');
    assert.strictEqual(d.ingredients[0].quantity, 2);
    assert.strictEqual(d.ingredients[0].unit, 'cup');
    assert.deepStrictEqual(d.steps.map((s) => s.order), [1, 2]);
    assert.strictEqual(d.notes, 'temporary');
    assert.deepStrictEqual(d.equipment, ['pot']);
  });
  await check('PUT recipe without notes unsets the field', async () => {
    const body = testRecipe({ title: 'Smoke Test Stew v2', notes: undefined, equipment: [], variations: undefined });
    const r = await api('PUT', `/api/recipes/${recipeId}`, body);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.title, 'Smoke Test Stew v2');
    assert.ok(r.body.data.updatedAt);
    const g = await api('GET', `/api/recipes/${recipeId}`);
    assert.strictEqual('notes' in g.body.data, false);
    assert.strictEqual('equipment' in g.body.data, false);
    assert.strictEqual('variations' in g.body.data, false);
    assert.strictEqual(g.body.data.isFavorite, false);
  });
  await check('PUT unknown recipe -> 404', async () => {
    assert.strictEqual((await api('PUT', '/api/recipes/aaaaaaaaaaaaaaaaaaaaaaaa', testRecipe())).status, 404);
  });
  await check('PATCH favorite toggles twice', async () => {
    const a = await api('PATCH', `/api/recipes/${recipeId}/favorite`);
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.body.data.isFavorite, true);
    const b = await api('PATCH', `/api/recipes/${recipeId}/favorite`);
    assert.strictEqual(b.body.data.isFavorite, false);
    assert.strictEqual((await api('PATCH', '/api/recipes/aaaaaaaaaaaaaaaaaaaaaaaa/favorite')).status, 404);
  });

  // ---------- cook ----------
  await check('POST /api/cook normalizes, dedupes, sorts', async () => {
    const r = await api('POST', '/api/cook', { ingredients: ['Rice', ' tomato ', 'onion', 'EGGS', 'beans', 'rice'], onlyFullMatch: false });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.data.ingredients, ['rice', 'tomato', 'onion', 'eggs', 'beans']);
    assert.deepStrictEqual(r.body.data.staples, ['salt', 'water', 'cooking oil']);
    assert.ok(Array.isArray(r.body.meta.pipeline));
    const res = r.body.data.results;
    const pct = res.map((x) => x.matchPercentage);
    assert.deepStrictEqual(pct, [...pct].sort((a, b) => b - a));
    assert.ok(pct.filter((p) => p === 100).length >= 2, 'need at least 2 full matches');
    assert.strictEqual(r.body.data.count, res.length);
  });
  await check('POST /api/cook onlyFullMatch=true -> all 100%', async () => {
    const r = await api('POST', '/api/cook', { ingredients: ['rice', 'tomato', 'onion', 'eggs', 'beans'], onlyFullMatch: true });
    assert.ok(r.body.data.results.length >= 2);
    assert.ok(r.body.data.results.every((x) => x.matchPercentage === 100));
  });
  await check('POST /api/cook empty list -> 400', async () => {
    const r = await api('POST', '/api/cook', { ingredients: ['  ', ''] });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Please enter at least one ingredient');
  });
  await check('POST /api/cook non-array -> 400', async () => {
    assert.strictEqual((await api('POST', '/api/cook', { ingredients: 'rice' })).status, 400);
    assert.strictEqual((await api('POST', '/api/cook', { ingredients: ['rice'], onlyFullMatch: 'yes' })).status, 400);
  });

  // ---------- nutrition ----------
  await check('POST /api/nutrition-search combined filters', async () => {
    const r = await api('POST', '/api/nutrition-search', { maxCalories: 300, minProtein: '5', dietary: ['vegetarian'] });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.count >= 1);
    assert.ok(r.body.data.results.every((x) => x.nutrition.calories <= 300 && x.nutrition.protein_g >= 5 && x.dietary.includes('vegetarian')));
    assert.deepStrictEqual(r.body.meta.query.dietary, { $all: ['vegetarian'] });
    assert.ok(r.body.data.results.every((x) => x.ingredients === undefined));
  });
  await check('nutrition-search with no filters returns up to 50', async () => {
    const r = await api('POST', '/api/nutrition-search', {});
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.count >= 26);
  });
  await check('nutrition-search invalid number -> 400', async () => {
    assert.strictEqual((await api('POST', '/api/nutrition-search', { maxCalories: 'abc' })).status, 400);
    assert.strictEqual((await api('POST', '/api/nutrition-search', { minProtein: -1 })).status, 400);
    assert.strictEqual((await api('POST', '/api/nutrition-search', { maxFat: { $gt: 0 } })).status, 400);
  });
  await check('nutrition-search ignores extra keys like $where', async () => {
    const r = await api('POST', '/api/nutrition-search', { maxCalories: 400, $where: 'sleep(5000)', title: { $ne: null } });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(Object.keys(r.body.meta.query), ['nutrition.calories']);
  });

  // ---------- meal plans ----------
  const r2 = await api('POST', '/api/recipes', testRecipe({ title: 'Smoke Test Second', ingredients: [{ name: 'smoke bean', quantity: 3, unit: 'cup' }] }));
  recipeId2 = r2.body.data._id;

  await check('POST meal plan -> 201 with entries filled from DB', async () => {
    const r = await api('POST', '/api/mealplans', {
      weekStart: WEEK,
      entries: [
        { day: 'Tuesday', mealType: 'lunch', recipeId: recipeId, recipeTitle: 'FAKE', calories: 99999 },
        { day: 'Monday', mealType: 'dinner', recipeId: recipeId },
        { day: 'Monday', mealType: 'breakfast', recipeId: recipeId2 },
      ],
    });
    assert.strictEqual(r.status, 201);
    planId = r.body.data._id;
    const e = r.body.data.entries;
    assert.deepStrictEqual(e.map((x) => `${x.day}-${x.mealType}`), ['Monday-breakfast', 'Monday-dinner', 'Tuesday-lunch']);
    assert.strictEqual(e[2].recipeTitle, 'Smoke Test Stew v2');
    assert.strictEqual(e[2].calories, 111);
    assert.deepStrictEqual(r.body.data.purchasedItems, []);
  });
  await check('duplicate week -> 409', async () => {
    const r = await api('POST', '/api/mealplans', { weekStart: WEEK, entries: [] });
    assert.strictEqual(r.status, 409);
    assert.ok(r.body.error.includes(WEEK));
  });
  await check('duplicate slot -> 400', async () => {
    const r = await api('POST', '/api/mealplans', {
      weekStart: '2030-01-14',
      entries: [{ day: 'Monday', mealType: 'breakfast', recipeId }, { day: 'Monday', mealType: 'breakfast', recipeId: recipeId2 }],
    });
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.includes('Only one recipe allowed per day and meal slot (Monday breakfast)'));
  });
  await check('non-Monday / bad date weekStart -> 400', async () => {
    assert.strictEqual((await api('POST', '/api/mealplans', { weekStart: '2030-01-08', entries: [] })).status, 400);
    assert.strictEqual((await api('POST', '/api/mealplans', { weekStart: '2030-02-30', entries: [] })).status, 400);
    assert.strictEqual((await api('GET', '/api/mealplans?weekStart=nonsense')).status, 400);
  });
  await check('unknown recipeId -> 400', async () => {
    const r = await api('POST', '/api/mealplans', {
      weekStart: '2030-01-14', entries: [{ day: 'Monday', mealType: 'lunch', recipeId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }],
    });
    assert.strictEqual(r.status, 400);
  });
  await check('GET meal plan by weekStart (and null when none)', async () => {
    const r = await api('GET', `/api/mealplans?weekStart=${WEEK}`);
    assert.strictEqual(r.body.data._id, planId);
    const none = await api('GET', '/api/mealplans?weekStart=2031-01-06');
    assert.strictEqual(none.status, 200);
    assert.strictEqual(none.body.data, null);
  });
  await check('GET meal plan list has summaries', async () => {
    const r = await api('GET', '/api/mealplans');
    const mine = r.body.data.find((p) => p._id === planId);
    assert.ok(mine);
    assert.strictEqual(mine.entryCount, 3);
    assert.strictEqual(mine.totalCalories, 333);
    const weeks = r.body.data.map((p) => p.weekStart);
    assert.deepStrictEqual(weeks, [...weeks].sort().reverse());
  });
  await check('PUT meal plan replaces entries, keeps weekStart', async () => {
    const r = await api('PUT', `/api/mealplans/${planId}`, {
      weekStart: '2030-12-02',
      entries: [
        { day: 'Monday', mealType: 'lunch', recipeId },
        { day: 'Wednesday', mealType: 'dinner', recipeId },
        { day: 'Friday', mealType: 'dinner', recipeId: recipeId2 },
      ],
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.weekStart, WEEK);
    assert.strictEqual(r.body.data.entries.length, 3);
    assert.strictEqual((await api('PUT', '/api/mealplans/aaaaaaaaaaaaaaaaaaaaaaaa', { entries: [] })).status, 404);
  });
  await check('shopping list sums quantities for a recipe used twice', async () => {
    const r = await api('GET', `/api/mealplans/${planId}/shopping-list`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.mealCount, 3);
    const names = r.body.data.items.map((i) => i.name);
    assert.ok(!names.includes('salt'), 'staples excluded');
    // recipe 1: 2 cup smoke bean x2 = 4, recipe 2: 3 cup x1 = 3 -> 7
    const bean = r.body.data.items.find((i) => i.name === 'smoke bean' && i.unit === 'cup');
    assert.strictEqual(bean.totalQuantity, 7);
    assert.strictEqual(bean.key, 'smoke bean|cup');
    assert.strictEqual(bean.recipeCount, 2);
    const herb = r.body.data.items.find((i) => i.name === 'smoke herb');
    assert.strictEqual(herb.totalQuantity, 2);
    assert.strictEqual(herb.allOptional, true);
    assert.strictEqual(bean.allOptional, false);
    assert.ok(Array.isArray(r.body.meta.pipeline));
    assert.strictEqual((await api('GET', '/api/mealplans/aaaaaaaaaaaaaaaaaaaaaaaa/shopping-list')).status, 404);
  });
  await check('PATCH purchased add then remove', async () => {
    const add = await api('PATCH', `/api/mealplans/${planId}/purchased`, { key: 'smoke bean|cup', purchased: true });
    assert.deepStrictEqual(add.body.data.purchasedItems, ['smoke bean|cup']);
    const again = await api('PATCH', `/api/mealplans/${planId}/purchased`, { key: 'smoke bean|cup', purchased: true });
    assert.deepStrictEqual(again.body.data.purchasedItems, ['smoke bean|cup']);
    const rem = await api('PATCH', `/api/mealplans/${planId}/purchased`, { key: 'smoke bean|cup', purchased: false });
    assert.deepStrictEqual(rem.body.data.purchasedItems, []);
    assert.strictEqual((await api('PATCH', `/api/mealplans/${planId}/purchased`, { key: '', purchased: 'x' })).status, 400);
    assert.strictEqual((await api('PATCH', '/api/mealplans/aaaaaaaaaaaaaaaaaaaaaaaa/purchased', { key: 'a', purchased: true })).status, 404);
  });
  await check('recipe PUT syncs denormalized meal plan entries', async () => {
    const r = await api('PUT', `/api/recipes/${recipeId}`, testRecipe({
      title: 'Smoke Renamed', emoji: '🔥', nutrition: { calories: 222, protein_g: 5, carbs_g: 10, fat_g: 2, fiber_g: 3, sugar_g: 1, sodium_mg: 100 },
    }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.meta.mealPlansUpdated, 1);
    const plan = await api('GET', `/api/mealplans?weekStart=${WEEK}`);
    const mine = plan.body.data.entries.filter((e) => e.recipeId === recipeId);
    assert.strictEqual(mine.length, 2);
    assert.ok(mine.every((e) => e.recipeTitle === 'Smoke Renamed' && e.calories === 222 && e.emoji === '🔥'));
    const other = plan.body.data.entries.find((e) => e.recipeId === recipeId2);
    assert.strictEqual(other.recipeTitle, 'Smoke Test Second');
  });
  await check('recipe DELETE pulls its entries from meal plans', async () => {
    const r = await api('DELETE', `/api/recipes/${recipeId2}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.deletedId, recipeId2);
    assert.strictEqual(r.body.meta.mealPlansUpdated, 1);
    const plan = await api('GET', `/api/mealplans?weekStart=${WEEK}`);
    assert.strictEqual(plan.body.data.entries.length, 2);
    assert.ok(plan.body.data.entries.every((e) => e.recipeId !== recipeId2));
    assert.strictEqual((await api('DELETE', `/api/recipes/${recipeId2}`)).status, 404);
  });
  await check('meal plan DELETE then 404', async () => {
    assert.strictEqual((await api('DELETE', `/api/mealplans/${planId}`)).status, 200);
    assert.strictEqual((await api('DELETE', `/api/mealplans/${planId}`)).status, 404);
    assert.strictEqual((await api('GET', `/api/mealplans/${planId}/shopping-list`)).status, 404);
  });
  await check('cleanup: delete smoke test recipe', async () => {
    assert.strictEqual((await api('DELETE', `/api/recipes/${recipeId}`)).status, 200);
    assert.strictEqual((await api('GET', `/api/recipes/${recipeId}`)).status, 404);
  });

  // ---------- stats & explain ----------
  await check('GET /api/stats shape and totals', async () => {
    const r = await api('GET', '/api/stats');
    assert.strictEqual(r.status, 200);
    const d = r.body.data;
    assert.ok(d.totals.count >= 26);
    assert.ok(d.totals.favorites >= 5);
    assert.ok(d.totals.avgCalories > 0);
    assert.strictEqual(d.byCategory.reduce((s, c) => s + c.count, 0), d.totals.count);
    assert.strictEqual(d.topIngredients.length, 10);
    assert.ok(!d.topIngredients.some((i) => ['salt', 'water', 'cooking oil'].includes(i.name)));
    assert.ok(d.byCuisine.length > 3 && d.byDifficulty.length === 3);
    assert.ok(d.schemaVariety.withNotes > 0 && d.schemaVariety.withNotes < d.totals.count);
    assert.ok(d.schemaVariety.withEquipment > 0 && d.schemaVariety.withVariations > 0);
    assert.ok(d.mealPlanCount >= 1 && d.pantryCount >= 8);
    assert.ok(Array.isArray(r.body.meta.pipeline));
  });
  for (const [scenario, indexName] of [['calories', 'idx_nutrition_calories'], ['ingredient', 'idx_ingredients_name']]) {
    await check(`GET /api/explain-demo?scenario=${scenario} (recipes)`, async () => {
      const r = await api('GET', `/api/explain-demo?scenario=${scenario}&collection=recipes`);
      assert.strictEqual(r.status, 200);
      const d = r.body.data;
      assert.strictEqual(d.indexed.primaryStage, 'IXSCAN');
      assert.strictEqual(d.indexed.indexName, indexName);
      assert.strictEqual(d.collectionScan.primaryStage, 'COLLSCAN');
      assert.strictEqual(d.indexed.nReturned, d.collectionScan.nReturned);
      assert.strictEqual(d.collectionScan.totalDocsExamined, d.collectionSize);
      assert.strictEqual(d.smallDataset, true);
      assert.ok(d.note.length > 20);
    });
  }
  await check('explain-demo invalid params -> 400; perf_samples empty -> 400', async () => {
    assert.strictEqual((await api('GET', '/api/explain-demo?scenario=bogus')).status, 400);
    assert.strictEqual((await api('GET', '/api/explain-demo?collection=users')).status, 400);
    await api('DELETE', '/api/explain-demo/benchmark-data');
    const r = await api('GET', '/api/explain-demo?scenario=calories&collection=perf_samples');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Generate the benchmark dataset first');
    assert.strictEqual((await api('POST', '/api/explain-demo/benchmark-data', { count: 10 })).status, 400);
  });
  await check('benchmark data: index beats collection scan on perf_samples', async () => {
    const gen = await api('POST', '/api/explain-demo/benchmark-data', { count: 5000 });
    assert.strictEqual(gen.status, 201);
    assert.strictEqual(gen.body.data.inserted, 5000);
    for (const [scenario, name] of [['calories', 'idx_nutrition_calories'], ['ingredient', 'idx_ingredients_name']]) {
      const r = await api('GET', `/api/explain-demo?scenario=${scenario}&collection=perf_samples`);
      assert.strictEqual(r.status, 200);
      const d = r.body.data;
      assert.strictEqual(d.collectionSize, 5000);
      assert.strictEqual(d.indexed.primaryStage, 'IXSCAN');
      assert.strictEqual(d.indexed.indexName, name);
      assert.strictEqual(d.collectionScan.totalDocsExamined, 5000);
      if (scenario === 'calories') {
        assert.ok(d.indexed.totalDocsExamined < d.collectionScan.totalDocsExamined,
          `${d.indexed.totalDocsExamined} !< ${d.collectionScan.totalDocsExamined}`);
      }
    }
  });
  await check('DELETE benchmark data (idempotent)', async () => {
    assert.strictEqual((await api('DELETE', '/api/explain-demo/benchmark-data')).status, 200);
    assert.strictEqual((await api('DELETE', '/api/explain-demo/benchmark-data')).status, 200);
  });

  // ---------- pantry ----------
  await check('pantry CRUD', async () => {
    const bad = await api('POST', '/api/pantry', { name: '', quantity: -1, unit: '' });
    assert.strictEqual(bad.status, 400);
    const c = await api('POST', '/api/pantry', { name: '  Smoke   Spice ', quantity: 2, unit: 'Tsp' });
    assert.strictEqual(c.status, 201);
    pantryId = c.body.data._id;
    assert.strictEqual(c.body.data.name, 'smoke spice');
    const again = await api('POST', '/api/pantry', { name: 'smoke spice', quantity: 5, unit: 'tsp' });
    assert.strictEqual(again.body.data._id, pantryId);
    assert.strictEqual(again.body.data.quantity, 5);
    const list = await api('GET', '/api/pantry');
    assert.ok(list.body.data.some((p) => p._id === pantryId));
    const u = await api('PUT', `/api/pantry/${pantryId}`, { quantity: 1, unit: 'tbsp' });
    assert.strictEqual(u.body.data.quantity, 1);
    assert.strictEqual(u.body.data.unit, 'tbsp');
    assert.strictEqual((await api('DELETE', `/api/pantry/${pantryId}`)).status, 200);
    assert.strictEqual((await api('DELETE', `/api/pantry/${pantryId}`)).status, 404);
    assert.strictEqual((await api('PUT', `/api/pantry/${pantryId}`, { quantity: 1, unit: 'g' })).status, 404);
  });

  // ---------- errors ----------
  await check('malformed JSON -> 400', async () => {
    const r = await api('POST', '/api/recipes', undefined, '{"title": ');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Malformed JSON request body');
  });
  await check('unknown /api route -> 404 JSON', async () => {
    const r = await api('GET', '/api/does-not-exist');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.success, false);
  });
  await check('error responses never leak stack traces', async () => {
    const r = await api('GET', '/api/recipes/bad-id');
    assert.ok(!JSON.stringify(r.body).includes(' at '));
    assert.strictEqual(r.body.stack, undefined);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed (is the server running? try: npm start):', err.message);
  process.exit(1);
});
