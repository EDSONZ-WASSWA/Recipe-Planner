# Recipe & Meal Planner

A web app for browsing recipes, finding meals you can cook with what you have, planning a week of meals and generating a shopping list. Built with Node.js, Express and MongoDB for a NoSQL database course.

## Features

- **Recipes**: search, filter by category, dietary tag and favourites, sort, and paginate. Each recipe opens in a detail view with a servings scaler.
- **Add / edit recipes**: a form with dynamic ingredient and step rows. You can create, edit and delete recipes.
- **What can I cook?**: enter your ingredients and recipes are ranked by match percentage. You can show only the recipes you can cook right now. Salt, water and cooking oil are assumed.
- **Pantry**: keep a list of the ingredients you have at home and load it into the matcher.
- **Nutrition search**: filter by max calories, carbs and fat, by min protein and fibre, and by dietary tags. Presets: Low Calorie, High Protein and Low Carb.
- **Meal planner**: 7 days × 4 meals. Save, load and delete a plan for each week. Shows daily and weekly calorie totals.
- **Shopping list**: built from the week's plan, with quantities added up per ingredient and unit. Tick items off as you buy them, and print the list.
- **Dashboard**: recipe statistics and an indexed vs. non-indexed query comparison using `explain()`.

## Tech stack

- **Database**: MongoDB 8, either Community Server or Atlas, accessed through the official `mongodb` Node.js driver (no Mongoose).
- **Backend**: Node.js (20.19 or newer) and Express 5, serving a REST API with JSON.
- **Frontend**: plain HTML, CSS and JavaScript, served from `public/`, with no framework or build step.
- **npm dependencies**: `express`, `mongodb`, `cors`, `dotenv`.

## Project structure

```
├── server.js              Express app, routes, error handling
├── seed.js                Loads the sample data
├── config/
│   ├── database.js        Shared MongoDB connection
│   └── setup.js           Schema validator and indexes (run on startup)
├── routes/                recipes, cooking, nutrition, mealplans, dashboard, pantry
├── services/
│   ├── aggregation.js     Queries and aggregation pipelines
│   └── validation.js      Input validation
├── utils/errors.js        ApiError and ObjectId parsing
├── scripts/smoke-test.js  End-to-end API test
└── public/                index.html, style.css, app.js
```

## Getting started (Windows)

1. Install **Node.js LTS** from https://nodejs.org.
2. Install **MongoDB Community Server** and choose "Install as a Service", or create a free **MongoDB Atlas** cluster.
3. Make sure MongoDB is running. Check with `sc query MongoDB`, and start it from an administrator terminal with `net start MongoDB` if needed.
4. Open the project folder in a terminal and install the dependencies:
   ```
   npm install
   ```
5. Create the `.env` file:
   ```
   copy .env.example .env
   ```
6. If you use Atlas, set `MONGODB_URI` in `.env` to your Atlas connection string and add your IP under Network Access.
7. Load the sample data, then start the app:
   ```
   npm run seed
   npm start
   ```
8. Open http://localhost:3000.

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Starts the server |
| `npm run dev` | Starts the server and restarts it when files change |
| `npm run seed` | Resets the database: 28 recipes, a meal plan for the current week and 8 pantry items |
| `npm run smoke` | Runs the API test against a running server |

### Configuration (`.env`)

| Key | Default | Description |
| --- | --- | --- |
| `MONGODB_URI` | required | MongoDB connection string |
| `DB_NAME` | `recipe_planner` | Database name |
| `PORT` | `3000` | HTTP port |

## Database

Database: `recipe_planner`

| Collection | Contents |
| --- | --- |
| `recipes` | One document per recipe. Ingredients, steps and nutrition are embedded. `notes`, `equipment` and `variations` are optional fields. |
| `mealplans` | One document per week (`weekStart` is a Monday). Each entry references a recipe by `recipeId` and keeps a copy of its title and calories. |
| `pantry` | Ingredients you have at home (name, quantity, unit). |
| `perf_samples` | Optional generated data for the index comparison on the dashboard. |

The server creates these indexes on startup:

| Collection | Index | Fields |
| --- | --- | --- |
| recipes | `recipe_text_search` | text: title, description, tags, ingredients.name |
| recipes | `idx_ingredients_name` | ingredients.name |
| recipes | `idx_nutrition_calories` | nutrition.calories |
| recipes | `idx_nutrition_protein` | nutrition.protein_g |
| recipes | `idx_category` | category |
| recipes | `idx_dietary` | dietary |
| recipes | `idx_created_at` | createdAt |
| mealplans | `uniq_week_start` (unique) | weekStart |
| mealplans | `idx_entries_recipe_id` | entries.recipeId |
| pantry | `uniq_pantry_name` (unique) | name |

When a recipe is edited, the server updates its copied title and calories in the meal plans. When a recipe is deleted, it is removed from every meal plan.

## API

Successful responses look like `{ "success": true, "data": ... }`. Errors look like `{ "success": false, "error": "...", "details": [...] }` and come with status 400, 404, 409 or 500.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server and database status |
| GET | `/api/recipes` | List recipes. Query: `q`, `category`, `dietary`, `favorite`, `sort`, `page`, `limit` |
| GET | `/api/recipes/options` | Short recipe list for the meal planner |
| GET | `/api/recipes/:id` | One recipe |
| POST | `/api/recipes` | Create a recipe |
| PUT | `/api/recipes/:id` | Update a recipe |
| DELETE | `/api/recipes/:id` | Delete a recipe |
| PATCH | `/api/recipes/:id/favorite` | Toggle favourite |
| POST | `/api/cook` | Match recipes to ingredients. Body: `{ ingredients, onlyFullMatch }` |
| POST | `/api/nutrition-search` | Nutrition filters. Body: `{ maxCalories, minProtein, maxCarbs, maxFat, minFiber, dietary }` |
| GET | `/api/mealplans` | List saved plans; with `?weekStart=YYYY-MM-DD`, the plan for that week |
| POST | `/api/mealplans` | Create a plan. Body: `{ weekStart, entries: [{ day, mealType, recipeId }] }` |
| PUT | `/api/mealplans/:id` | Replace a plan's entries |
| DELETE | `/api/mealplans/:id` | Delete a plan |
| GET | `/api/mealplans/:id/shopping-list` | Shopping list for a plan |
| PATCH | `/api/mealplans/:id/purchased` | Tick or untick an item. Body: `{ key, purchased }` |
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/explain-demo` | Indexed vs. collection-scan comparison. Query: `scenario`, `collection` |
| POST / DELETE | `/api/explain-demo/benchmark-data` | Create or remove the `perf_samples` test data |
| GET / POST | `/api/pantry` | List or add pantry items |
| PUT / DELETE | `/api/pantry/:id` | Update or delete a pantry item |

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Could not connect to MongoDB" / `ECONNREFUSED` | Start the MongoDB service (`net start MongoDB`) and check `MONGODB_URI` |
| Atlas authentication or `ENOTFOUND` errors | Check the username, password and cluster host, and that your IP is allowed |
| "MONGODB_URI is not set" | Create `.env` from `.env.example` |
| "Port 3000 is already in use" | Change `PORT` in `.env`, or find and stop the other process with `netstat -ano \| findstr :3000` |
| The app shows no recipes | Run `npm run seed` |
| `Cannot find module ...` | Run `npm install` |
