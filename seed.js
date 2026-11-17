// Seed script: resets the data and inserts sample recipes, one meal plan and pantry items.
// NOTE: nutrition values are rough per-serving estimates for teaching purposes,
// they are NOT medically verified.
require('dotenv').config({ quiet: true });
const { connectDB, closeDB } = require('./config/database');
const { initializeDatabase } = require('./config/setup');
const { validateRecipe } = require('./services/validation');

// ---- small helpers to keep the recipe list readable ----
// ingredient: [name, quantity, unit, optional?]
const ing = (name, quantity, unit, optional) => ({ name, quantity, unit, ...(optional ? { optional: true } : {}) });
// step: plain string, or [text, durationMin]
const steps = (list) => list.map((s) => (Array.isArray(s) ? { instruction: s[0], durationMin: s[1] } : { instruction: s }));
// nutrition array order: calories, protein, carbs, fat, fiber, sugar, sodium(mg)
const nut = ([calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg]) =>
  ({ calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg });

const FAVORITES = new Set(['Rolex', 'Ugandan Pilau', 'Luwombo (Chicken)', 'Spaghetti Bolognese', 'Pancakes']);

const recipeSpecs = [
  // ---------------- East African ----------------
  {
    title: 'Matooke with Groundnut Sauce', emoji: '🍌', category: 'lunch', cuisine: 'Ugandan', difficulty: 'medium',
    prep: 20, cook: 60, servings: 4, nutrition: [520, 14, 88, 15, 9, 8, 380],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free'], tags: ['ugandan', 'traditional', 'steamed'],
    description: 'Steamed green bananas served with a rich, creamy groundnut sauce - a classic Ugandan meal.',
    ingredients: [ing('matooke', 1.5, 'kg'), ing('groundnut paste', 6, 'tbsp'), ing('onion', 1, 'piece'), ing('tomato', 2, 'piece'), ing('salt', 1, 'tsp'), ing('water', 2, 'cup'), ing('banana leaves', 2, 'piece', true)],
    steps: steps([['Peel the matooke and rinse in water.', 10], 'Wrap the matooke in banana leaves inside a cooking pot with a little water.', ['Steam on medium heat until very soft.', 45], 'Fry onion and tomato until soft, then stir in the groundnut paste and water.', ['Simmer the sauce, stirring, until thick.', 10], 'Mash the matooke lightly and serve with the sauce.']),
    equipment: ['Large cooking pot', 'Banana leaves or foil'], notes: 'Green cooking bananas are not the same as sweet bananas.',
  },
  {
    title: 'Posho and Beans', emoji: '🫘', category: 'lunch', cuisine: 'Ugandan', difficulty: 'easy',
    prep: 10, cook: 70, servings: 4, nutrition: [480, 20, 90, 5, 16, 4, 420],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free'], tags: ['ugandan', 'budget', 'staple'],
    description: 'Firm maize-flour porridge (posho) served with a hearty pot of stewed beans.',
    ingredients: [ing('maize flour', 3, 'cup'), ing('beans', 2, 'cup'), ing('onion', 1, 'piece'), ing('tomato', 2, 'piece'), ing('carrot', 1, 'piece', true), ing('cooking oil', 2, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 8, 'cup')],
    steps: steps([['Boil the beans in water until soft.', 60], 'Fry onion in oil, add tomato and cook to a paste.', 'Add the fried mix and salt to the beans and simmer.', 'Boil 4 cups of water in another pot.', 'Add maize flour gradually while stirring hard to avoid lumps.', ['Cook and stir until the posho is firm.', 8], 'Serve the posho with the beans.']),
    equipment: ['Wooden spoon (mwiko)'],
  },
  {
    title: 'Rolex', emoji: '🌯', category: 'snack', cuisine: 'Ugandan', difficulty: 'easy',
    prep: 10, cook: 8, servings: 1, nutrition: [560, 22, 52, 28, 4, 4, 720],
    dietary: ['vegetarian'], tags: ['ugandan', 'street food', 'quick'],
    description: 'Uganda\'s famous street food: an omelette rolled inside a warm chapati.',
    ingredients: [ing('chapati', 1, 'piece'), ing('eggs', 2, 'piece'), ing('onion', 0.5, 'piece'), ing('tomato', 1, 'piece'), ing('cabbage', 30, 'g', true), ing('green pepper', 0.25, 'piece', true), ing('cooking oil', 1, 'tbsp'), ing('salt', 0.5, 'tsp')],
    steps: steps(['Chop onion, tomato, cabbage and pepper finely.', 'Beat the eggs with salt and the chopped vegetables.', ['Fry the egg mix in oil into a thin omelette.', 3], 'Warm the chapati in a dry pan.', 'Place the omelette on the chapati and roll tightly.']),
    variations: ['Add minced meat for a richer filling', 'Use avocado slices instead of cabbage'],
  },
  {
    title: 'Chapati', emoji: '🫓', category: 'dinner', cuisine: 'East African', difficulty: 'medium',
    prep: 40, cook: 20, servings: 6, nutrition: [250, 6, 38, 8, 2, 1, 290],
    dietary: ['vegetarian', 'vegan', 'dairy-free', 'nut-free'], tags: ['bread', 'east african', 'layered'],
    description: 'Soft, layered flatbread made from a simple wheat dough and cooked on a hot pan.',
    ingredients: [ing('wheat flour', 3, 'cup'), ing('cooking oil', 4, 'tbsp'), ing('salt', 1, 'tsp'), ing('sugar', 1, 'tbsp'), ing('water', 1, 'cup')],
    steps: steps(['Mix flour, salt and sugar in a bowl.', 'Add water slowly and knead into a smooth dough.', ['Rest the dough, covered.', 30], 'Divide into balls, roll flat, brush with oil, roll up and coil into a spiral.', 'Roll each coil flat again.', ['Cook each chapati on a hot pan with a little oil until golden on both sides.', 3]]),
    equipment: ['Rolling pin', 'Flat frying pan'], notes: 'Resting the dough makes the chapati soft.',
  },
  {
    title: 'Ugandan Pilau', emoji: '🍚', category: 'dinner', cuisine: 'Ugandan', difficulty: 'medium',
    prep: 20, cook: 50, servings: 5, nutrition: [610, 28, 78, 19, 4, 4, 640],
    dietary: ['dairy-free', 'nut-free', 'gluten-free'], tags: ['ugandan', 'rice', 'spiced', 'celebration'],
    description: 'Fragrant spiced rice cooked in beef broth with caramelised onions.',
    ingredients: [ing('rice', 3, 'cup'), ing('beef', 500, 'g'), ing('onion', 3, 'piece'), ing('garlic', 4, 'clove'), ing('pilau masala', 2, 'tbsp'), ing('cooking oil', 4, 'tbsp'), ing('salt', 1.5, 'tsp'), ing('water', 6, 'cup'), ing('potato', 2, 'piece', true)],
    steps: steps(['Cut the beef into cubes and boil with salt until tender.', ['Boil beef until tender, keep the broth.', 30], 'Fry sliced onions in oil until dark brown.', 'Add garlic and pilau masala and stir for one minute.', 'Add the beef and fry briefly.', 'Add washed rice and 6 cups of hot broth/water.', ['Cover and cook on low heat until the rice is done.', 20]]),
    equipment: ['Heavy-bottomed pot with lid'], variations: ['Use chicken instead of beef', 'Add potato cubes for extra bulk'],
  },
  {
    title: 'Luwombo (Chicken)', emoji: '🍗', category: 'dinner', cuisine: 'Ugandan', difficulty: 'hard',
    prep: 30, cook: 120, servings: 4, nutrition: [450, 38, 12, 28, 3, 4, 560],
    dietary: ['gluten-free', 'dairy-free', 'high-protein', 'low-carb'], tags: ['ugandan', 'royal', 'steamed', 'special occasion'],
    description: 'Chicken and groundnut sauce slow-steamed in banana leaves, a traditional royal dish of Buganda.',
    ingredients: [ing('chicken breast', 600, 'g'), ing('groundnut paste', 4, 'tbsp'), ing('onion', 2, 'piece'), ing('tomato', 2, 'piece'), ing('carrot', 1, 'piece', true), ing('green pepper', 1, 'piece', true), ing('salt', 1, 'tsp'), ing('water', 1, 'cup'), ing('banana leaves', 4, 'piece')],
    steps: steps(['Soften the banana leaves over a flame so they do not tear.', 'Cut the chicken into pieces and mix with chopped onion, tomato and salt.', 'Stir the groundnut paste into the water and mix with the chicken.', 'Place a portion in the centre of each leaf and fold into a tight parcel.', 'Tie the parcels with string and pack them in a pot with water at the bottom.', ['Steam gently over low heat.', 110]]),
    equipment: ['Banana leaves', 'Kitchen string', 'Large pot'], notes: 'Traditionally prepared for guests of honour.',
  },
  {
    title: 'Mandazi', emoji: '🍩', category: 'breakfast', cuisine: 'East African', difficulty: 'medium',
    prep: 30, cook: 15, servings: 8, nutrition: [230, 4, 31, 10, 1, 8, 110],
    dietary: ['vegetarian', 'nut-free'], tags: ['fried', 'snack', 'sweet', 'east african'],
    description: 'Lightly sweet, cardamom-scented fried dough triangles, perfect with tea.',
    ingredients: [ing('wheat flour', 3, 'cup'), ing('sugar', 4, 'tbsp'), ing('milk', 0.5, 'cup'), ing('eggs', 1, 'piece'), ing('baking powder', 2, 'tsp'), ing('cardamom', 0.5, 'tsp', true), ing('cooking oil', 2, 'cup'), ing('salt', 0.25, 'tsp')],
    steps: steps(['Mix flour, sugar, baking powder, salt and cardamom.', 'Beat the egg with milk and add to the dry mix.', 'Knead into a soft dough.', ['Rest the dough, covered.', 20], 'Roll out and cut into triangles.', ['Deep-fry in hot oil until golden, turning once.', 10], 'Drain on paper towels.']),
    equipment: ['Deep pan', 'Rolling pin'],
  },
  {
    title: 'Katogo', emoji: '🍲', category: 'breakfast', cuisine: 'Ugandan', difficulty: 'easy',
    prep: 15, cook: 40, servings: 4, nutrition: [430, 18, 62, 14, 7, 5, 520],
    dietary: ['dairy-free', 'nut-free', 'gluten-free'], tags: ['ugandan', 'one-pot', 'breakfast'],
    description: 'A comforting one-pot breakfast of matooke cooked together with beef and vegetables.',
    ingredients: [ing('matooke', 1, 'kg'), ing('beef', 300, 'g'), ing('onion', 1, 'piece'), ing('tomato', 2, 'piece'), ing('carrot', 1, 'piece'), ing('green pepper', 1, 'piece', true), ing('cooking oil', 2, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 3, 'cup')],
    steps: steps(['Peel matooke and cut into chunks.', 'Fry onion in oil, add beef and brown it.', 'Add tomato, carrot and pepper and cook for a few minutes.', 'Add water and salt, then the matooke.', ['Simmer covered until the matooke and beef are soft.', 35], 'Stir gently and serve hot.']),
    notes: 'Katogo can also be made with cassava or offal.',
  },
  {
    title: 'Vegetable Stew', emoji: '🥘', category: 'dinner', cuisine: 'East African', difficulty: 'easy',
    prep: 15, cook: 30, servings: 4, nutrition: [190, 5, 28, 7, 7, 10, 410],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free'], tags: ['stew', 'healthy', 'vegetables'],
    description: 'A light tomato-based stew full of seasonal vegetables.',
    ingredients: [ing('potato', 2, 'piece'), ing('carrot', 2, 'piece'), ing('cabbage', 200, 'g'), ing('onion', 1, 'piece'), ing('tomato', 3, 'piece'), ing('garlic', 2, 'clove'), ing('green pepper', 1, 'piece'), ing('cooking oil', 2, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 2, 'cup')],
    steps: steps(['Chop all vegetables into bite-size pieces.', 'Fry onion and garlic in oil until soft.', 'Add tomato and cook to a thick sauce.', 'Add potato, carrot, pepper, water and salt.', ['Simmer until the potato is tender.', 20], ['Add cabbage and cook a few more minutes.', 5]]),
    variations: ['Add peas or green beans', 'Serve with rice or chapati'],
  },
  {
    title: 'Groundnut Sauce (Ebinyeebwa)', emoji: '🥜', category: 'lunch', cuisine: 'Ugandan', difficulty: 'easy',
    prep: 10, cook: 25, servings: 4, nutrition: [310, 11, 14, 25, 4, 5, 300],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free'], tags: ['ugandan', 'sauce', 'peanut'],
    description: 'A thick, savoury peanut sauce traditionally served with steamed matooke, sweet potatoes or rice.',
    ingredients: [ing('groundnut paste', 8, 'tbsp'), ing('onion', 1, 'piece'), ing('tomato', 2, 'piece'), ing('water', 2, 'cup'), ing('salt', 1, 'tsp'), ing('cooking oil', 1, 'tbsp')],
    steps: steps(['Fry chopped onion in oil until golden.', 'Add chopped tomato and cook until soft.', 'Mix the groundnut paste with warm water until smooth.', 'Pour into the pot and stir.', ['Simmer on low heat, stirring often, until thick.', 15], 'Season with salt.']),
    notes: 'Stir often - groundnut sauce burns easily.',
  },
  {
    title: 'Ugandan Beef Stew', emoji: '🥩', category: 'dinner', cuisine: 'Ugandan', difficulty: 'medium',
    prep: 20, cook: 90, servings: 5, nutrition: [420, 35, 14, 25, 3, 6, 600],
    dietary: ['gluten-free', 'dairy-free', 'nut-free', 'high-protein', 'low-carb'], tags: ['ugandan', 'stew', 'meat'],
    description: 'Tender beef simmered with tomatoes, onions and carrots in a rich gravy.',
    ingredients: [ing('beef', 700, 'g'), ing('onion', 2, 'piece'), ing('tomato', 3, 'piece'), ing('carrot', 2, 'piece'), ing('garlic', 3, 'clove'), ing('potato', 2, 'piece', true), ing('cooking oil', 3, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 3, 'cup')],
    steps: steps(['Cut the beef into cubes.', ['Boil the beef with salt until half tender.', 40], 'Fry onions and garlic in oil.', 'Add tomatoes and cook until soft.', 'Add beef with some broth, carrots and potatoes.', ['Simmer until the meat is soft and the gravy thick.', 40]]),
    equipment: ['Heavy saucepan'],
  },
  {
    title: 'Sukuma Wiki', emoji: '🥬', category: 'dinner', cuisine: 'Kenyan', difficulty: 'easy',
    prep: 10, cook: 15, servings: 4, nutrition: [120, 4, 10, 8, 4, 4, 320],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'low-carb'], tags: ['kenyan', 'greens', 'quick', 'healthy'],
    description: 'Collard greens sauteed with onions and tomatoes, a staple side dish across East Africa.',
    ingredients: [ing('collard greens', 500, 'g'), ing('onion', 1, 'piece'), ing('tomato', 2, 'piece'), ing('garlic', 2, 'clove', true), ing('cooking oil', 2, 'tbsp'), ing('salt', 0.5, 'tsp')],
    steps: steps(['Wash and thinly slice the collard greens.', 'Fry onion in oil until soft.', 'Add tomatoes and cook until mushy.', ['Add greens and salt, stir and cook until wilted.', 8]]),
    variations: ['Add a splash of lemon juice', 'Cook with beef cubes for a main dish'],
  },
  // ---------------- International ----------------
  {
    title: 'Fruit Salad', emoji: '🍓', category: 'dessert', cuisine: 'International', difficulty: 'easy',
    prep: 15, cook: 0, servings: 4, nutrition: [140, 2, 35, 1, 5, 26, 5],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free'], tags: ['fruit', 'fresh', 'no-cook', 'healthy'],
    description: 'A refreshing bowl of seasonal fruit tossed with a little lemon juice.',
    ingredients: [ing('banana', 2, 'piece'), ing('pineapple', 200, 'g'), ing('mango', 1, 'piece'), ing('orange', 2, 'piece'), ing('watermelon', 200, 'g', true), ing('lemon juice', 1, 'tbsp')],
    steps: steps(['Wash and peel all the fruit.', 'Cut the fruit into bite-size cubes.', 'Place the fruit in a large bowl.', 'Add lemon juice and toss gently.', ['Chill before serving.', 15]]),
    variations: ['Add a spoon of honey', 'Top with yoghurt'],
  },
  {
    title: 'Oats Porridge', emoji: '🥣', category: 'breakfast', cuisine: 'International', difficulty: 'easy',
    prep: 2, cook: 8, servings: 2, nutrition: [260, 9, 42, 6, 5, 9, 90],
    dietary: ['vegetarian', 'nut-free'], tags: ['breakfast', 'quick', 'healthy', 'oats'],
    description: 'Creamy oats cooked in milk and lightly sweetened.',
    ingredients: [ing('oats', 1, 'cup'), ing('milk', 1.5, 'cup'), ing('water', 0.5, 'cup'), ing('sugar', 1, 'tbsp'), ing('banana', 1, 'piece', true), ing('salt', 0.25, 'tsp')],
    steps: steps(['Combine oats, milk, water and salt in a pot.', ['Cook on medium heat, stirring, until thick.', 6], 'Stir in sugar.', 'Serve topped with sliced banana.']),
    notes: 'Use water only for a dairy-free version.',
  },
  {
    title: 'Omelette', emoji: '🍳', category: 'breakfast', cuisine: 'International', difficulty: 'easy',
    prep: 5, cook: 5, servings: 1, nutrition: [270, 17, 4, 20, 1, 3, 420],
    dietary: ['vegetarian', 'gluten-free', 'dairy-free', 'nut-free', 'low-carb', 'high-protein'], tags: ['eggs', 'quick', 'breakfast'],
    description: 'A fluffy omelette filled with onion and tomato.',
    ingredients: [ing('eggs', 3, 'piece'), ing('onion', 0.5, 'piece'), ing('tomato', 1, 'piece'), ing('green pepper', 0.25, 'piece', true), ing('cooking oil', 1, 'tbsp'), ing('salt', 0.25, 'tsp')],
    steps: steps(['Dice the onion and tomato.', 'Beat the eggs with salt.', 'Heat oil and fry the onion until soft.', 'Add tomato and cook for one minute.', ['Pour in the eggs and cook until set, then fold.', 3]]),
    equipment: ['Non-stick frying pan'],
  },
  {
    title: 'Grilled Chicken Salad', emoji: '🥗', category: 'lunch', cuisine: 'International', difficulty: 'easy',
    prep: 15, cook: 15, servings: 2, nutrition: [350, 42, 12, 15, 4, 6, 480],
    dietary: ['gluten-free', 'dairy-free', 'nut-free', 'high-protein', 'low-carb'], tags: ['salad', 'healthy', 'protein', 'grilled'],
    description: 'Juicy grilled chicken slices over crisp vegetables with a lemon dressing.',
    ingredients: [ing('chicken breast', 300, 'g'), ing('lettuce', 100, 'g'), ing('tomato', 2, 'piece'), ing('cucumber', 1, 'piece'), ing('onion', 0.5, 'piece', true), ing('lemon juice', 2, 'tbsp'), ing('cooking oil', 2, 'tbsp'), ing('salt', 0.5, 'tsp')],
    steps: steps(['Rub the chicken with oil, salt and half the lemon juice.', ['Grill the chicken until cooked through.', 12], 'Slice the vegetables and arrange in a bowl.', 'Slice the rested chicken and place on top.', 'Drizzle with the remaining lemon juice.']),
    equipment: ['Grill pan'],
  },
  {
    title: 'Lentil Soup', emoji: '🍜', category: 'lunch', cuisine: 'Middle Eastern', difficulty: 'easy',
    prep: 10, cook: 35, servings: 4, nutrition: [260, 16, 40, 5, 14, 5, 480],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free'], tags: ['soup', 'lentils', 'healthy', 'budget'],
    description: 'Warming red lentil soup with onion, carrot and cumin.',
    ingredients: [ing('lentils', 1.5, 'cup'), ing('onion', 1, 'piece'), ing('carrot', 2, 'piece'), ing('garlic', 3, 'clove'), ing('cumin', 1, 'tsp'), ing('cooking oil', 2, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 6, 'cup'), ing('lemon juice', 1, 'tbsp', true)],
    steps: steps(['Rinse the lentils.', 'Fry onion, carrot and garlic in oil.', 'Stir in the cumin.', 'Add lentils, water and salt.', ['Simmer until the lentils are very soft.', 30], 'Blend partly for a creamy texture and add lemon juice.']),
    equipment: ['Stick blender'],
  },
  {
    title: 'Pancakes', emoji: '🥞', category: 'breakfast', cuisine: 'International', difficulty: 'easy',
    prep: 10, cook: 15, servings: 4, nutrition: [290, 8, 42, 10, 1, 9, 380],
    dietary: ['vegetarian', 'nut-free'], tags: ['breakfast', 'sweet', 'family'],
    description: 'Light, fluffy pancakes ready in under half an hour.',
    ingredients: [ing('wheat flour', 2, 'cup'), ing('milk', 1.5, 'cup'), ing('eggs', 2, 'piece'), ing('sugar', 2, 'tbsp'), ing('baking powder', 2, 'tsp'), ing('cooking oil', 2, 'tbsp'), ing('salt', 0.25, 'tsp'), ing('honey', 2, 'tbsp', true)],
    steps: steps(['Whisk flour, sugar, baking powder and salt.', 'Beat eggs with milk and oil.', 'Mix wet and dry ingredients until just combined.', ['Rest the batter.', 5], ['Cook ladles of batter on a hot greased pan until bubbles form, flip and cook the other side.', 10], 'Serve with honey.']),
    variations: ['Add mashed banana to the batter', 'Add blueberries'],
  },
  {
    title: 'Vegetable Fried Rice', emoji: '🍛', category: 'dinner', cuisine: 'Chinese', difficulty: 'easy',
    prep: 15, cook: 15, servings: 4, nutrition: [380, 11, 62, 10, 4, 4, 720],
    dietary: ['vegetarian', 'dairy-free', 'nut-free'], tags: ['rice', 'stir-fry', 'quick', 'vegetables'],
    description: 'Wok-fried rice with egg, carrots and peppers.',
    ingredients: [ing('rice', 3, 'cup'), ing('eggs', 2, 'piece'), ing('carrot', 1, 'piece'), ing('green pepper', 1, 'piece'), ing('onion', 1, 'piece'), ing('garlic', 2, 'clove'), ing('soy sauce', 3, 'tbsp'), ing('cooking oil', 3, 'tbsp'), ing('salt', 0.5, 'tsp')],
    steps: steps(['Use cooked, cooled rice for best results.', 'Dice the carrot, pepper and onion.', 'Scramble the eggs in hot oil and set aside.', 'Fry garlic and onion, then the carrot and pepper.', 'Add the rice and soy sauce and toss on high heat.', ['Stir in the egg and fry until hot.', 3]]),
    equipment: ['Wok or large frying pan'],
  },
  {
    title: 'Spaghetti Bolognese', emoji: '🍝', category: 'dinner', cuisine: 'Italian', difficulty: 'medium',
    prep: 15, cook: 45, servings: 4, nutrition: [580, 30, 70, 19, 6, 9, 640],
    dietary: ['dairy-free', 'nut-free'], tags: ['pasta', 'italian', 'family', 'meat'],
    description: 'Classic Italian meat sauce served over spaghetti.',
    ingredients: [ing('spaghetti', 400, 'g'), ing('beef', 400, 'g'), ing('onion', 1, 'piece'), ing('garlic', 3, 'clove'), ing('tomato', 5, 'piece'), ing('carrot', 1, 'piece'), ing('cooking oil', 2, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 1, 'cup'), ing('basil', 1, 'tsp', true)],
    steps: steps(['Finely chop the onion, carrot and garlic.', 'Brown the minced beef in oil and set aside.', 'Fry the vegetables until soft.', 'Add chopped tomatoes, beef, water and salt.', ['Simmer the sauce until rich and thick.', 35], ['Boil spaghetti in salted water until al dente and drain.', 10], 'Serve the sauce over the spaghetti.']),
    notes: 'The sauce tastes even better the next day.', equipment: ['Large saucepan', 'Large pot'],
  },
  {
    title: 'Chicken Curry', emoji: '🍛', category: 'dinner', cuisine: 'Indian', difficulty: 'medium',
    prep: 15, cook: 40, servings: 4, nutrition: [430, 38, 14, 24, 3, 5, 610],
    dietary: ['gluten-free', 'dairy-free', 'nut-free', 'high-protein'], tags: ['curry', 'spicy', 'chicken'],
    description: 'Tender chicken pieces simmered in a spiced tomato and onion sauce.',
    ingredients: [ing('chicken breast', 600, 'g'), ing('onion', 2, 'piece'), ing('tomato', 3, 'piece'), ing('garlic', 4, 'clove'), ing('ginger', 1, 'tbsp'), ing('curry powder', 2, 'tsp'), ing('cooking oil', 3, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 1, 'cup'), ing('coconut milk', 1, 'cup', true)],
    steps: steps(['Cut the chicken into chunks.', 'Fry onions until golden.', 'Add garlic, ginger and curry powder and stir for a minute.', 'Add tomatoes and cook to a paste.', 'Add chicken, water and salt.', ['Simmer covered until the chicken is cooked.', 25], 'Stir in coconut milk if using and heat through.']),
    variations: ['Add potato cubes', 'Add chili for extra heat'],
  },
  {
    title: 'Mashed Potatoes', emoji: '🥔', category: 'dinner', cuisine: 'International', difficulty: 'easy',
    prep: 10, cook: 20, servings: 4, nutrition: [210, 4, 33, 7, 3, 3, 330],
    dietary: ['vegetarian', 'gluten-free', 'nut-free'], tags: ['side dish', 'comfort food', 'potato'],
    description: 'Smooth and creamy mashed potatoes with butter and milk.',
    ingredients: [ing('potato', 6, 'piece'), ing('milk', 0.5, 'cup'), ing('butter', 2, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 4, 'cup')],
    steps: steps(['Peel and cut the potatoes into chunks.', ['Boil in salted water until very soft.', 18], 'Drain well.', 'Mash with butter.', 'Add warm milk gradually until creamy.']),
    notes: 'Warm milk keeps the mash smooth.',
  },
  {
    title: 'Greek Salad', emoji: '🥙', category: 'lunch', cuisine: 'Greek', difficulty: 'easy',
    prep: 10, cook: 0, servings: 2, nutrition: [240, 7, 12, 19, 3, 7, 560],
    dietary: ['vegetarian', 'gluten-free', 'nut-free', 'low-carb'], tags: ['salad', 'fresh', 'no-cook'],
    description: 'Tomato, cucumber, onion and feta with olive oil and oregano.',
    ingredients: [ing('tomato', 3, 'piece'), ing('cucumber', 1, 'piece'), ing('onion', 0.5, 'piece'), ing('feta cheese', 100, 'g'), ing('olives', 10, 'piece', true), ing('olive oil', 2, 'tbsp'), ing('oregano', 1, 'tsp'), ing('salt', 0.25, 'tsp')],
    steps: steps(['Cut tomatoes and cucumber into chunks.', 'Slice the onion thinly.', 'Combine in a bowl with olives.', 'Top with crumbled feta.', 'Drizzle with olive oil and sprinkle with oregano and salt.']),
  },
  {
    title: 'Bean Soup', emoji: '🥣', category: 'lunch', cuisine: 'International', difficulty: 'easy',
    prep: 10, cook: 75, servings: 5, nutrition: [270, 16, 44, 4, 15, 4, 450],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free'], tags: ['soup', 'beans', 'budget', 'fibre'],
    description: 'A thick, filling soup of slow-cooked beans, onion and tomato.',
    ingredients: [ing('beans', 2, 'cup'), ing('onion', 1, 'piece'), ing('tomato', 2, 'piece'), ing('carrot', 1, 'piece'), ing('garlic', 2, 'clove'), ing('cooking oil', 1, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 8, 'cup')],
    steps: steps(['Soak the beans overnight if possible.', ['Boil the beans until nearly soft.', 50], 'Fry onion, garlic and carrot in oil.', 'Add tomatoes and cook down.', 'Add the fried mix and salt to the beans.', ['Simmer until thick.', 20]]),
    equipment: ['Large pot'],
  },
  {
    title: 'Chicken Stir-Fry', emoji: '🥢', category: 'dinner', cuisine: 'Chinese', difficulty: 'easy',
    prep: 15, cook: 10, servings: 3, nutrition: [340, 34, 18, 15, 4, 8, 760],
    dietary: ['dairy-free', 'nut-free', 'high-protein'], tags: ['stir-fry', 'quick', 'chicken'],
    description: 'Strips of chicken tossed quickly with colourful vegetables and soy sauce.',
    ingredients: [ing('chicken breast', 400, 'g'), ing('green pepper', 1, 'piece'), ing('carrot', 1, 'piece'), ing('onion', 1, 'piece'), ing('garlic', 2, 'clove'), ing('soy sauce', 3, 'tbsp'), ing('cooking oil', 2, 'tbsp'), ing('cabbage', 100, 'g', true)],
    steps: steps(['Slice the chicken and vegetables into thin strips.', ['Stir-fry the chicken in hot oil until browned.', 5], 'Add garlic and onion.', 'Add carrot, pepper and cabbage and toss.', ['Pour in the soy sauce and cook briefly.', 2]]),
    equipment: ['Wok'], variations: ['Serve over rice or noodles'],
  },
  {
    title: 'Vegetable Pasta', emoji: '🍝', category: 'dinner', cuisine: 'Italian', difficulty: 'easy',
    prep: 10, cook: 20, servings: 3, nutrition: [420, 14, 72, 9, 7, 8, 450],
    dietary: ['vegetarian', 'vegan', 'dairy-free', 'nut-free'], tags: ['pasta', 'vegetables', 'quick'],
    description: 'Pasta tossed in a light tomato sauce with fresh vegetables.',
    ingredients: [ing('pasta', 300, 'g'), ing('tomato', 3, 'piece'), ing('onion', 1, 'piece'), ing('garlic', 2, 'clove'), ing('carrot', 1, 'piece'), ing('green pepper', 1, 'piece'), ing('cooking oil', 2, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 3, 'cup'), ing('basil', 1, 'tsp', true)],
    steps: steps([['Boil the pasta in salted water until al dente.', 10], 'Fry onion and garlic in oil.', 'Add carrot and pepper and cook until tender.', 'Add chopped tomato and simmer into a sauce.', 'Drain the pasta and mix with the sauce.']),
  },
  // ---------------- Extra: cookable from {rice, tomato, onion, eggs, beans} ----------------
  {
    title: 'Rice and Beans', emoji: '🍚', category: 'lunch', cuisine: 'International', difficulty: 'easy',
    prep: 10, cook: 60, servings: 4, nutrition: [450, 18, 82, 5, 12, 4, 420],
    dietary: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free'], tags: ['budget', 'staple', 'rice', 'beans'],
    description: 'A simple, filling combination of boiled rice and tomato-onion beans.',
    ingredients: [ing('rice', 2, 'cup'), ing('beans', 1.5, 'cup'), ing('onion', 1, 'piece'), ing('tomato', 2, 'piece'), ing('cooking oil', 2, 'tbsp'), ing('salt', 1, 'tsp'), ing('water', 8, 'cup')],
    steps: steps([['Boil the beans until soft.', 50], 'Fry onion in oil and add tomatoes.', 'Add the fried mix and salt to the beans.', ['Boil the rice in salted water until cooked and drain.', 15], 'Serve the beans over the rice.']),
  },
  {
    title: 'Tomato Egg Rice', emoji: '🍅', category: 'dinner', cuisine: 'International', difficulty: 'easy',
    prep: 5, cook: 20, servings: 2, nutrition: [520, 18, 78, 15, 3, 6, 600],
    dietary: ['vegetarian', 'dairy-free', 'gluten-free', 'nut-free'], tags: ['quick', 'rice', 'eggs', 'student'],
    description: 'Rice topped with eggs scrambled in a quick tomato and onion sauce.',
    ingredients: [ing('rice', 1.5, 'cup'), ing('eggs', 3, 'piece'), ing('tomato', 2, 'piece'), ing('onion', 1, 'piece'), ing('cooking oil', 2, 'tbsp'), ing('salt', 0.75, 'tsp'), ing('water', 3, 'cup')],
    steps: steps([['Cook the rice in salted water until done.', 15], 'Fry onion in oil until soft.', 'Add chopped tomato and cook into a sauce.', ['Pour in beaten eggs and stir until just set.', 2], 'Serve over the rice.']),
    notes: 'A good meal when the cupboard is nearly empty.',
  },
];

function buildRecipeDocs() {
  const now = Date.now();
  return recipeSpecs.map((s, index) => {
    const validated = validateRecipe({
      title: s.title, description: s.description, category: s.category, cuisine: s.cuisine,
      difficulty: s.difficulty, prepTimeMin: s.prep, cookTimeMin: s.cook, servings: s.servings,
      emoji: s.emoji, tags: s.tags, dietary: s.dietary, ingredients: s.ingredients, steps: s.steps,
      nutrition: nut(s.nutrition), notes: s.notes, equipment: s.equipment, variations: s.variations,
    });
    // stagger creation dates (older first) so the "newest" sort is meaningful
    const daysAgo = 60 - Math.round((index * 58) / (recipeSpecs.length - 1));
    return {
      ...validated,
      isFavorite: FAVORITES.has(s.title),
      createdAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000),
    };
  });
}

// Monday of the current week as "YYYY-MM-DD" using local date
function currentWeekStart() {
  const d = new Date();
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PLAN_LAYOUT = [
  ['Monday', 'breakfast', 'Omelette'], ['Monday', 'lunch', 'Posho and Beans'], ['Monday', 'dinner', 'Vegetable Stew'],
  ['Tuesday', 'breakfast', 'Oats Porridge'], ['Tuesday', 'lunch', 'Rice and Beans'], ['Tuesday', 'dinner', 'Chicken Curry'],
  ['Wednesday', 'breakfast', 'Pancakes'], ['Wednesday', 'lunch', 'Greek Salad'], ['Wednesday', 'dinner', 'Ugandan Pilau'],
  ['Thursday', 'breakfast', 'Omelette'], ['Thursday', 'lunch', 'Lentil Soup'], ['Friday', 'dinner', 'Spaghetti Bolognese'],
];

const PANTRY_ITEMS = [
  ['rice', 2, 'cup'], ['onion', 4, 'piece'], ['tomato', 6, 'piece'], ['eggs', 12, 'piece'],
  ['beans', 3, 'cup'], ['wheat flour', 5, 'cup'], ['milk', 2, 'cup'], ['potato', 8, 'piece'],
];

async function main() {
  const db = await connectDB();
  try {
    const recipes = db.collection('recipes');
    const mealplans = db.collection('mealplans');
    const pantry = db.collection('pantry');

    const docs = buildRecipeDocs(); // validation errors throw here, before touching the data

    // deleteMany keeps the indexes and validator that initializeDatabase created
    await Promise.all([recipes.deleteMany({}), mealplans.deleteMany({}), pantry.deleteMany({})]);
    await initializeDatabase(db);

    const { insertedIds } = await recipes.insertMany(docs);
    const idByTitle = new Map(docs.map((d, i) => [d.title, insertedIds[i]]));
    const docByTitle = new Map(docs.map((d) => [d.title, d]));

    const entries = PLAN_LAYOUT.map(([day, mealType, title]) => {
      const doc = docByTitle.get(title);
      return {
        day, mealType, recipeId: idByTitle.get(title),
        recipeTitle: doc.title, calories: doc.nutrition.calories, emoji: doc.emoji,
      };
    });
    const now = new Date();
    await mealplans.insertOne({ weekStart: currentWeekStart(), entries, purchasedItems: [], createdAt: now, updatedAt: now });

    await pantry.insertMany(PANTRY_ITEMS.map(([name, quantity, unit]) => ({ name, quantity, unit, createdAt: now, updatedAt: now })));

    console.log('Seed complete:');
    console.log(`  recipes:   ${await recipes.countDocuments()}`);
    console.log(`  mealplans: ${await mealplans.countDocuments()} (week starting ${currentWeekStart()})`);
    console.log(`  pantry:    ${await pantry.countDocuments()}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

main();
