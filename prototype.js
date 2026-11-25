"use strict";

const app = document.querySelector("#app");
const restart = document.querySelector("#restart");
const announcement = document.querySelector("#announcement");
const cues = [
  ["crispy", "Crispy", "🍘"], ["sweet", "Sweet", "🍯"], ["savory", "Savory", "🍲"],
  ["fresh", "Fresh", "🥭"], ["light", "Light", "🍃"], ["filling", "Filling", "🍚"],
  ["unsure", "I’m not sure", "✦"]
];
const ingredients = {
  banana: "Banana", sugar: "Sugar", oil: "Canola oil", wrapper: "Spring roll wrappers",
  potato: "Potato", salt: "Salt", rice: "Cooked rice", garlic: "Garlic", mango: "Ripe mango"
};
const allergies = {
  peanuts: "Peanuts", nuts: "Tree nuts", milk: "Milk", eggs: "Eggs", wheat: "Wheat",
  soy: "Soy", sesame: "Sesame", fish: "Fish", shellfish: "Shellfish"
};
const foods = [
  { id: "turon", name: "Banana turon", image: "turon", tags: ["crispy", "sweet", "filling"],
    description: "A crackly wrapper around warm, sweet banana.",
    serving: "1 roll", kcal: [160, 220], price: [15, 35], ingredients: ["banana", "sugar", "oil", "wrapper"],
    allergens: ["wheat"], incompleteIngredients: true,
    steps: ["Roll sliced banana and a little sugar in a spring roll wrapper.", "Pan-fry until golden, then drain and let it cool briefly."] },
  { id: "banana-chips", name: "Banana chips", image: "banana-chips", tags: ["crispy", "sweet", "light"],
    description: "Thin banana slices with a sweet crunch.",
    serving: "1 small handful", kcal: [140, 190], price: [25, 55], ingredients: ["banana", "sugar", "oil"],
    allergens: [], steps: ["Slice a firm banana thinly.", "Fry the slices until crisp, drain, and toss with a little sugar."] },
  { id: "potatoes", name: "Crispy potato bites", image: "potatoes", tags: ["crispy", "savory", "filling"],
    description: "Golden, salty edges with a soft potato center.",
    serving: "1 small bowl", kcal: [190, 280], price: [45, 85], ingredients: ["potato", "oil", "salt"],
    allergens: [], steps: ["Cut the potato into small cubes and pat them dry.", "Pan-fry until golden on all sides, then season with salt."] },
  { id: "rice", name: "Garlic fried rice", image: "rice", tags: ["savory", "filling"],
    description: "A cozy bowl of sinangag with toasted garlic.",
    serving: "1 small bowl", kcal: [230, 340], price: [35, 75], ingredients: ["rice", "garlic", "oil", "salt"],
    allergens: [], steps: ["Sauté chopped garlic in a little oil.", "Add cooked rice, stir over high heat, and season with salt."] },
  { id: "mango", name: "Chilled ripe mango", image: "mango", tags: ["sweet", "fresh", "light"],
    description: "Cool, juicy slices of ripe mango.",
    serving: "1 small bowl", kcal: [95, 150], price: [30, 70], ingredients: ["mango"],
    allergens: [], steps: ["Slice a ripe mango and chill it for a few minutes.", "Scoop the flesh into a bowl."] }
];

function newSession() {
  return {
    step: "start", cues: new Set(), mode: "buy", budget: "", calories: "", kcalMode: "target",
    allergies: new Set(), pantry: new Set(), skipped: [], refine: "", broadened: false,
    editing: false, picked: null, allergyUnknown: false
  };
}

let session = newSession();
let moving = false;
const cueName = id => cues.find(cue => cue[0] === id)?.[1] ?? id;
const realCues = () => [...session.cues].filter(cue => cue !== "unsure");
const atHome = () => session.mode === "home" || session.budget === "0";
const photo = food => "assets/food/" + food.image + ".webp";
const didPickCue = id => session.cues.has(id);
const cueMatch = food => realCues().filter(cue => food.tags.includes(cue));

function eligible(food) {
  if (session.allergyUnknown) return false;
  if (session.allergies.size &&
    (!atHome() || food.incompleteIngredients || food.allergens.some(allergen => session.allergies.has(allergen)))) return false;
  if (atHome() && !food.ingredients.every(item => session.pantry.has(item))) return false;
  if (!atHome() && session.budget !== "" && food.price[1] > Number(session.budget)) return false;
  if (session.calories !== "" && session.kcalMode === "max" && food.kcal[1] > Number(session.calories)) return false;
  return true;
}

function kcalDistance(food) {
  if (session.calories === "" || session.kcalMode !== "target") return 0;
  const target = Number(session.calories);
  return Math.max(food.kcal[0] - target, target - food.kcal[1], 0);
}

function rankedFoods() {
  const matching = foods.filter(food => eligible(food) &&
    (session.broadened || !realCues().length || cueMatch(food).length > 0));
  return matching.sort((first, second) => {
    const byRefinement = Number(second.tags.includes(session.refine)) - Number(first.tags.includes(session.refine));
    return byRefinement || cueMatch(second).length - cueMatch(first).length || kcalDistance(first) - kcalDistance(second);
  });
}

const deckItems = () => rankedFoods().filter(food => !session.skipped.includes(food.id));
const arrow = '<span class="arrow" aria-hidden="true">→</span>';

function action(label, id, modifier = "") {
  return `<button type="button" class="action ${modifier}" data-action="${id}">${label}</button>`;
}

function quiet(label, id) {
  return `<button type="button" class="quiet" data-action="${id}">${label}</button>`;
}

function choice(label, value, group, selected, icon = "") {
  return `<button type="button" class="choice" data-option="${value}" data-group="${group}" aria-pressed="${selected}">${icon ? `<span class="cue-icon" aria-hidden="true">${icon}</span>` : ""}${label}</button>`;
}

function options(record, group, selected) {
  return Object.entries(record).map(([id, label]) => choice(label, id, group, selected.has(id))).join("");
}

function progress(stage, label) {
  return `<p class="kicker">${label}</p><div class="progress" aria-hidden="true">${[1, 2, 3].map(i => `<span class="${i <= stage ? "done" : ""}"></span>`).join("")}</div>`;
}

function workspace(label, stage, title, description, content, extra = "") {
  return `<section class="workspace ${extra}"><div class="question-copy">${progress(stage, label)}
    <h1 id="screen-title" tabindex="-1">${title}</h1><p class="lead">${description}</p>
  </div>${content}</section>`;
}

function startPage() {
  return `<section class="welcome">
    <div class="welcome-copy">
      <h1 id="screen-title" tabindex="-1">Find your<br><span class="accent">next bite.</span></h1>
      <p class="lead">Tell us what sounds good and what fits today. We’ll help you pick something to eat.</p>
      ${action("Help me pick " + arrow, "craving")}
      <p class="hint">Your answers stay in this session.</p>
    </div>
    <figure class="feature-photo">
      <img src="assets/food/turon.webp" alt="Golden banana turon with a crisp wrapper">
      <span class="sparkle" aria-hidden="true">✦</span>
      <figcaption><strong>Banana turon</strong><small>Sweet · Crispy</small></figcaption>
    </figure>
  </section>`;
}

function cravingPage() {
  return workspace("Step 1 of 3 · Craving", 1, "What sounds good?", "Pick anything you’re in the mood for.",
    `<div class="panel step-in"><div class="option-grid">${cues.map(([id, label, icon]) =>
      choice(label, id, "cue", didPickCue(id), icon)).join("")}</div>
      <div class="form-actions">${quiet("Back", "start")}${action("Continue " + arrow, "after-craving")}</div>
    </div>`);
}

function followupPage() {
  const texture = didPickCue("sweet") && !didPickCue("crispy");
  const pair = texture ? [["crispy", "Something crispy", "🍘"], ["fresh", "Something fresh", "🥭"]]
    : [["sweet", "Sweet", "🍯"], ["savory", "Savory", "🍲"]];
  return workspace("Step 1 of 3 · Craving", 1, texture ? "What kind of sweet?" : "Sweet or savory?", "One quick choice can help us narrow it down.",
    `<div class="panel step-in"><div class="option-grid">${pair.map(([id, label, icon]) =>
      choice(label, id, "followup", didPickCue(id), icon)).join("")}</div>
      <div class="form-actions">${quiet("Back", "craving")}${action("Continue " + arrow, "limits")}</div>
      <button type="button" class="quiet" data-action="limits">Skip this question</button>
    </div>`);
}

function limitsPage() {
  return workspace("Step 2 of 3 · Limits", 2, "What fits today?", "Tell us what you can spend and what to leave out.",
    `<form id="limits-form" class="panel step-in">
      <fieldset><legend>Where will you get it?</legend><div class="option-grid">
        ${choice("I’ll buy it", "buy", "mode", session.mode === "buy")}
        ${choice("Use what I have", "home", "mode", session.mode === "home")}
      </div></fieldset>
      <div class="number-row">
        <label><span class="field-title">Budget (₱)</span><input name="budget" type="number" min="0" step="1" max="999999" inputmode="numeric" placeholder="Any budget" value="${session.budget}"></label>
        <label><span class="field-title">Calories (kcal)</span><input name="calories" type="number" min="1" step="1" max="9999" inputmode="numeric" placeholder="Optional" value="${session.calories}"></label>
      </div>
      <fieldset class="calorie-mode" ${session.calories === "" ? "hidden" : ""}><legend>Apply calories as a</legend>
        <div class="chips">${choice("Target", "target", "kcal-mode", session.kcalMode === "target")}
        ${choice("Maximum", "max", "kcal-mode", session.kcalMode === "max")}</div>
      </fieldset>
      <fieldset><legend>Allergies or ingredients to avoid</legend><div class="chips">
        ${options(allergies, "allergy", session.allergies)}
        ${choice("Something else", "other", "allergy-other", session.allergyUnknown)}
      </div>
      <p class="hint selection-note">A ₱0 budget checks what you already have. Takeout is excluded when an allergy or ingredient exclusion is selected.</p></fieldset>
      <div class="form-actions">${quiet("Back", session.editing ? "matches" : "craving")}
        <button type="submit" class="action">Continue ${arrow}</button>
      </div>
    </form>`);
}

function pantryPage() {
  return workspace("Step 2 of 3 · Pantry", 2, "What’s on hand?", "Select ingredients you can use today, including the basics.",
    `<div class="panel step-in"><fieldset><legend>Available ingredients</legend><div class="chips">
      ${options(ingredients, "pantry", session.pantry)}
    </div></fieldset>
    <div class="form-actions">${quiet("Back", "limits")}${action("Show my matches " + arrow, "matches")}</div></div>`);
}

function foodCost(food) {
  return atHome() ? "₱0 to spend" : `₱${food.price[0]}–₱${food.price[1]} est.`;
}

function facts(food) {
  return `${foodCost(food)} · ${food.kcal[0]}–${food.kcal[1]} kcal est. · ${food.serving}`;
}

function context() {
  const tags = realCues().map(cueName);
  if (atHome()) tags.push("Pantry");
  if (session.budget !== "") tags.push(`₱${session.budget} max`);
  if (session.calories !== "") tags.push(`${session.calories} kcal ${session.kcalMode === "max" ? "max" : "target"}`);
  if (session.allergies.size || session.allergyUnknown) tags.push("Exclusions on");
  return tags.length ? `<ul class="context" aria-label="Current preferences">${tags.map(tag => `<li>${tag}</li>`).join("")}</ul>` : "";
}

function why(food) {
  const tags = cueMatch(food);
  if (tags.length) return `Matches your ${tags.map(tag => cueName(tag).toLowerCase()).join(" and ")} craving.`;
  return session.broadened ? "An alternative within your current limits." : "Fits the limits you set for today.";
}

function emptyPage() {
  const exhausted = rankedFoods().length > 0;
  const alternatives = !session.broadened && realCues().length &&
    foods.some(food => eligible(food) && !session.skipped.includes(food.id));
  const reason = exhausted ? "You’ve seen every match in this round."
    : session.allergyUnknown ? "This demo can’t assess the extra ingredient you selected."
    : atHome() ? "We couldn’t find a match using your selected ingredients and limits."
    : "We couldn’t find a match within the limits you set.";
  const controls = [
    exhausted ? action("Undo last skip", "undo", "secondary") : "",
    alternatives ? action("Broaden my craving", "broaden") : "",
    atHome() ? action("Add ingredients", "edit-pantry", "secondary") : "",
    action("Edit my limits", "edit-limits", "secondary"),
    quiet("Edit my craving", "craving")
  ].join("");
  return workspace("Step 3 of 3 · Matches", 3, exhausted ? "That’s the deck." : "No matches yet.", reason,
    `<div class="panel step-in"><span class="empty-mark" aria-hidden="true">✧</span>${context()}
      <p class="hint">Your budget and ingredient exclusions are still in effect.</p><div class="empty-actions">${controls}</div></div>`,
    "results");
}

function matchesPage() {
  const remaining = deckItems();
  const food = remaining[0];
  if (!food) return emptyPage();
  const refine = session.skipped.length >= 2 && !session.refine
    ? `<div class="refine"><h2>Would lighter or more filling sound better?</h2><div class="chips">
        ${choice("Lighter", "light", "refine", false)}${choice("More filling", "filling", "refine", false)}
        ${choice("Either", "either", "refine", false)}
      </div></div>` : "";
  return workspace("Step 3 of 3 · Matches", 3, "Does this hit the spot?", "Swipe left to skip, or swipe right if this is your pick.",
    `<div class="panel deck step-in">${context()}${refine}
      <div class="card-meta"><span>${remaining.length} match${remaining.length === 1 ? "" : "es"} left</span>
        ${session.skipped.length ? quiet("Undo skip", "undo") : ""}</div>
      <article id="food-card" class="food-card" aria-label="Current suggestion">
        <img src="${photo(food)}" alt="${food.name}" draggable="false">
        <div class="food-info"><h2>${food.name}</h2><p>${food.description}</p><p>${why(food)}</p>
          <p class="facts">${facts(food)}</p></div>
      </article>
      <div class="deck-controls">${action("← Skip", "skip", "secondary")}${action("I’ll eat this " + arrow, "pick")}</div>
      <div class="edit-row">${quiet("Edit limits", "edit-limits")}${quiet("Edit craving", "craving")}</div>
      <p class="hint deck-note">Demo estimates per serving. Check actual prices and ingredients before choosing.</p>
    </div>`, "results");
}

function pickedPage() {
  const food = session.picked;
  const prep = atHome()
    ? `<h3>What you’ll use</h3><p>${food.ingredients.map(item => ingredients[item]).join(", ")}</p>
      <h3>How to make it</h3><ol>${food.steps.map(step => `<li>${step}</li>`).join("")}</ol>
      <p class="hint">Verify packaged ingredient labels and check your preparation surfaces for cross-contact.</p>`
    : `<h3>What to look for</h3><p>Ask for ${food.name.toLowerCase()}. The price and calories shown are demo estimates for one serving.</p>`;
  return workspace("Your pick", 3, "You found<br><span class=\"accent\">your bite.</span>", why(food),
    `<div class="panel step-in"><img class="pick-image" src="${photo(food)}" alt="${food.name}">
      <h2 class="pick-title">${food.name}</h2><p class="hint">${facts(food)}</p>
      <div class="details">${prep}</div><div class="form-actions">${quiet("Back to matches", "matches")}
        ${action("Start over " + arrow, "reset")}</div></div>`, "results");
}

const screen = {
  start: startPage, craving: cravingPage, followup: followupPage,
  limits: limitsPage, pantry: pantryPage, matches: matchesPage, picked: pickedPage
};

function render(focus = true) {
  app.innerHTML = screen[session.step]();
  restart.hidden = session.step === "start";
  const card = app.querySelector("#food-card");
  if (card) enableSwipe(card);
  if (focus) {
    window.scrollTo(0, 0);
    app.querySelector("#screen-title").focus({ preventScroll: true });
  }
}

function go(step) {
  moving = false;
  session.step = step;
  if (step === "matches") session.editing = false;
  render();
}

function reset() {
  session = newSession();
  go("start");
}

function toggle(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function markChoices(group, selected) {
  app.querySelectorAll(`[data-group="${group}"]`).forEach(button => {
    button.setAttribute("aria-pressed", String(selected.has(button.dataset.option)));
  });
}

function selectOption(button) {
  const { group, option } = button.dataset;
  switch (group) {
    case "cue":
      toggle(session.cues, option);
      if (option === "unsure" && session.cues.has(option)) session.cues = new Set(["unsure"]);
      else session.cues.delete("unsure");
      session.broadened = false;
      markChoices(group, session.cues);
      break;
    case "followup":
      app.querySelectorAll('[data-group="followup"]').forEach(item => session.cues.delete(item.dataset.option));
      session.cues.add(option);
      session.broadened = false;
      go("limits");
      break;
    case "mode":
      session.mode = option;
      markChoices(group, new Set([option]));
      break;
    case "kcal-mode":
      session.kcalMode = option;
      markChoices(group, new Set([option]));
      break;
    case "allergy":
      toggle(session.allergies, option);
      markChoices(group, session.allergies);
      break;
    case "allergy-other":
      session.allergyUnknown = !session.allergyUnknown;
      button.setAttribute("aria-pressed", String(session.allergyUnknown));
      break;
    case "pantry":
      toggle(session.pantry, option);
      markChoices(group, session.pantry);
      break;
    case "refine":
      session.refine = option;
      render();
      break;
  }
}

function skip() {
  const card = app.querySelector("#food-card");
  if (!card || moving) return;
  const food = deckItems()[0];
  moving = true;
  card.classList.add("leaving");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    if (!app.contains(card)) return;
    session.skipped.push(food.id);
    go("matches");
    announcement.textContent = deckItems()[0] ? `Next match: ${deckItems()[0].name}` : "You’ve reached the end of the matches.";
  }, reduced ? 0 : 210);
}

function pick() {
  if (moving || !deckItems().length) return;
  session.picked = deckItems()[0];
  go("picked");
}

function enableSwipe(card) {
  let startX = 0;
  let startY = 0;
  let pointer = null;
  card.addEventListener("pointerdown", event => {
    if (moving || event.button !== 0) return;
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    card.setPointerCapture(pointer);
    card.classList.add("dragging");
  });
  card.addEventListener("pointermove", event => {
    if (pointer !== event.pointerId) return;
    const dx = event.clientX - startX;
    card.style.setProperty("--drag-x", `${dx}px`);
    card.style.setProperty("--drag-angle", `${dx / 19}deg`);
  });
  function release(event) {
    if (pointer !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    pointer = null;
    card.classList.remove("dragging");
    card.style.removeProperty("--drag-x");
    card.style.removeProperty("--drag-angle");
    if (event.type !== "pointerup" || Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) skip();
    else pick();
  }
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", release);
}

app.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.option !== undefined) {
    selectOption(button);
    return;
  }
  const actionId = button.dataset.action;
  switch (actionId) {
    case "after-craving":
      go(realCues().length === 1 && (didPickCue("crispy") || didPickCue("sweet")) ? "followup" : "limits");
      break;
    case "edit-limits":
    case "edit-pantry":
      session.editing = true;
      go(actionId === "edit-limits" ? "limits" : "pantry");
      break;
    case "broaden":
      session.broadened = true;
      go("matches");
      break;
    case "undo":
      session.skipped.pop();
      go("matches");
      break;
    case "skip": skip(); break;
    case "pick": pick(); break;
    case "reset": reset(); break;
    default:
      if (Object.hasOwn(screen, actionId)) go(actionId);
  }
});

app.addEventListener("input", event => {
  if (event.target.name === "calories") {
    app.querySelector(".calorie-mode").hidden = event.target.value === "";
  }
});

app.addEventListener("submit", event => {
  if (event.target.id !== "limits-form") return;
  event.preventDefault();
  const fields = new FormData(event.target);
  for (const name of ["budget", "calories"]) {
    const value = fields.get(name);
    session[name] = value === "" ? "" : String(Number(value));
  }
  go(atHome() && !session.allergyUnknown ? "pantry" : "matches");
});

document.addEventListener("keydown", event => {
  if (session.step !== "matches" || !app.querySelector("#food-card") || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    if (event.key === "ArrowLeft") skip();
    else pick();
  }
});

restart.addEventListener("click", reset);
render(false);
