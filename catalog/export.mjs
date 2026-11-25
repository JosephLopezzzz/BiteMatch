import { readFile, writeFile } from "node:fs/promises";

const records = JSON.parse(await readFile(new URL("foods.json", import.meta.url), "utf8"));
const sourceFields = ["id", "dishId", "name", "description", "serving", "ingredientReview"];
const cueTags = new Set(["crispy", "sweet", "savory", "fresh", "light", "filling"]);
const unique = new Set();

function validRange(value) {
  return value === null || (Array.isArray(value) && value.length === 2 &&
    value.every(amount => Number.isFinite(amount) && amount >= 0) && value[0] <= value[1]);
}

for (const food of records) {
  if (sourceFields.some(field => typeof food[field] !== "string" || !food[field].trim()) ||
      !/^[a-z0-9-]+$/.test(food.id) || unique.has(food.id) ||
      !validRange(food.price) || !validRange(food.kcal) || (food.price !== null && !food.priceSource?.label) ||
      (food.kcal !== null && !food.nutritionSource?.label) ||
      !Array.isArray(food.tags) || food.tags.some(tag => !cueTags.has(tag)) ||
      !Array.isArray(food.ingredients) || !Array.isArray(food.steps) ||
      (food.ingredientReview === "listed" && (!food.ingredients.length || !food.steps.length)) ||
      !Array.isArray(food.allergens) || !["listed", "incomplete"].includes(food.ingredientReview) ||
      !/^[a-z0-9-]+$/.test(food.photo?.file ?? "") || !food.photo.alt || !food.photo.credit ||
      !["photo", "illustration"].includes(food.photo.kind)) {
    throw new Error(`Invalid catalog record: ${food?.id}`);
  }
  unique.add(food.id);
}

const starter = ["turon", "banana-chips", "potatoes", "rice", "mango"].map(id => records.find(food => food.id === id));
if (starter.some(food => !food)) throw new Error("A required offline dish is missing.");
await writeFile(new URL("starter.json", import.meta.url), JSON.stringify(starter) + "\n");

const sqlLiteral = value => "'" + String(value).replaceAll("'", "''") + "'";
const rows = records.map((food, order) =>
  `(${sqlLiteral(food.id)}, ${order}, true, ${sqlLiteral(JSON.stringify(food))}::jsonb)`).join(",\n");
process.stdout.write(`begin;
insert into bitematch_catalog.foods (id, position, published, entry) values
${rows}
on conflict (id) do update set position = excluded.position, published = excluded.published, entry = excluded.entry;
update bitematch_catalog.foods set published = false
where published and id not in (${records.map(food => sqlLiteral(food.id)).join(", ")});
update bitematch_catalog.metadata set revision = revision + 1 where singleton;
commit;
`);
