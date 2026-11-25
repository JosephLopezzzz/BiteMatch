"use strict";

const app = document.querySelector("#app");
const siteHeader = document.querySelector(".site-header");
const restart = document.querySelector("#restart");
const announcement = document.querySelector("#announcement");
const phoneLayout = matchMedia("(max-width: 820px), (hover: none) and (pointer: coarse) and (max-width: 1024px)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const swipeThreshold = 65;
const cues = [
  ["crispy", "Crispy", "🍘"], ["sweet", "Sweet", "🍯"], ["savory", "Savory", "🍲"],
  ["fresh", "Fresh", "🥭"], ["light", "Light", "🍃"], ["filling", "Filling", "🍚"],
  ["unsure", "I’m not sure", "✦"]
];
const ingredients = {
  banana: "Banana", sugar: "Sugar", oil: "Canola oil", wrapper: "Spring roll wrappers",
  potato: "Potato", salt: "Salt", rice: "Cooked rice", garlic: "Garlic", mango: "Ripe mango",
  saba: "Saba bananas", "purple-sweet-potato": "Purple sweet potato", "sweet-corn": "Sweet corn",
  eggplant: "Eggplant", egg: "Egg"
};
const allergies = {
  peanuts: "Peanuts", nuts: "Tree nuts", milk: "Milk", eggs: "Eggs", wheat: "Wheat",
  soy: "Soy", sesame: "Sesame", fish: "Fish", shellfish: "Shellfish"
};
function newSession() {
  return {
    step: "start", cues: new Set(), mode: "buy", budget: "", calories: "", kcalMode: "target",
    allergies: new Set(), pantry: new Set(), skipped: [], refine: "", broadened: false,
    editing: false, picked: null, allergyUnknown: false, deck: null
  };
}

let session = newSession();
let moving = false;
const cueName = id => cues.find(cue => cue[0] === id)?.[1] ?? id;
const realCues = () => [...session.cues].filter(cue => cue !== "unsure");
const atHome = () => session.mode === "home" || session.budget === "0";
const didPickCue = id => session.cues.has(id);
const cueMatch = food => realCues().filter(cue => food.tags.includes(cue));
const escaped = value => String(value).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function matchPreferences() {
  const number = value => value === "" ? null : Number(value);
  return {
    home: atHome(), cues: realCues().sort(), broadened: session.broadened, refine: session.refine,
    budget: number(session.budget), kcalMax: session.kcalMode === "max" ? number(session.calories) : null,
    kcalTarget: session.kcalMode === "target" ? number(session.calories) : null,
    pantry: [...session.pantry].sort(), allergies: [...session.allergies].sort(), allergyUnknown: session.allergyUnknown
  };
}

function ensureDeck() {
  const preferences = matchPreferences();
  const key = JSON.stringify(preferences);
  if (session.deck?.key !== key) {
    session.deck?.controller.abort();
    session.deck = {
      key, preferences, items: [], next: 0, controller: new AbortController(), source: null,
      pending: false, error: false, hadMatches: false, hasAlternatives: false, revision: null, preloaded: null
    };
  }
  return session.deck;
}

function preloadNext(deck) {
  const next = BiteCatalog.photoSource(deck.items[1] ?? {});
  if (!next || next.src === deck.preloaded) return;
  deck.preloaded = next.src;
  const image = new Image();
  image.sizes = next.sizes;
  image.srcset = next.srcset;
  image.src = next.src;
}

async function loadMatches(deck) {
  if (deck.pending || deck.error || deck.next === null || deck.items.length > 2) return;
  deck.pending = true;
  try {
    while (deck.next !== null && deck.items.length < 3) {
      const pageStart = deck.next;
      const page = await BiteCatalog.requestPage(deck.preferences, pageStart, deck.source, deck.controller.signal);
      if (session.deck !== deck) return;
      if (pageStart > 0 && deck.source === page.source && deck.revision !== page.revision) {
        deck.next = 0;
        deck.revision = page.revision;
        continue;
      }
      deck.source = page.source;
      deck.next = page.next;
      deck.revision = page.revision;
      deck.hasAlternatives = page.hasAlternatives;
      deck.hadMatches ||= page.items.length > 0;
      const ignored = new Set([...deck.items, ...session.skipped.map(item => item.food)].map(food => food.dishId));
      for (const food of page.items) {
        if (ignored.has(food.dishId)) continue;
        deck.items.push(food);
        ignored.add(food.dishId);
      }
    }
  } catch (error) {
    if (!deck.controller.signal.aborted) deck.error = true;
  } finally {
    deck.pending = false;
    if (session.deck === deck && session.step === "matches") {
      const displayed = app.querySelector("#food-card");
      if (!displayed) {
        render();
        if (deck.items[0]) announcement.textContent = `Next match: ${deck.items[0].name}.`;
      } else {
        app.querySelector(".deck-stage").dataset.next = String(deck.items.length > 1);
        app.querySelector("#match-feed").textContent = matchCount(deck);
        app.querySelector(".catalog-notice").hidden = deck.source !== "starter";
        preloadNext(deck);
      }
    }
  }
}

function photoMarkup(food, picked = false) {
  const source = BiteCatalog.photoSource(food);
  const alt = escaped(food.photo?.alt || food.name);
  return `<div class="dish-photo ${picked ? "pick-image" : ""}" ${source ? "" : 'data-missing="true"'}>
    ${source ? `<img src="${source.src}" srcset="${source.srcset}" sizes="${source.sizes}" alt="${alt}" draggable="false">` : ""}
    <span class="photo-unavailable">Photo unavailable</span>
    ${food.photo?.kind === "illustration" ? '<span class="photo-credit">Food illustration</span>' : ""}
  </div>`;
}

const deckItems = () => session.deck?.items ?? [];
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
      <h1 id="screen-title" tabindex="-1">
        <span class="desktop-only">Find your<br><span class="accent">next bite.</span></span>
        <span class="phone-only">What are you <span class="accent">craving?</span></span>
      </h1>
      <p class="lead desktop-only">Tell us what sounds good and what fits today. We’ll help you pick something to eat.</p>
      <p class="lead phone-only">Crispy, sweet, or still figuring it out? Find a bite that fits today.</p>
      ${action("Help me pick " + arrow, "craving")}
      <p class="hint">No sign-in needed.</p>
    </div>
    <figure class="feature-photo">
      <img src="assets/food/turon-800.webp" srcset="assets/food/turon-400.webp 400w, assets/food/turon-800.webp 800w, assets/food/turon.webp 1440w"
        sizes="(max-width: 820px) calc(100vw - 60px), 650px" alt="Golden banana turon with a crisp wrapper">
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
  return atHome() ? "₱0 to spend" : food.price ? `₱${food.price[0]}–₱${food.price[1]} est.` : "Local price unavailable";
}

function facts(food) {
  const calories = !food.kcal ? "Calories unavailable" : food.kcal[0] === food.kcal[1] ? `${food.kcal[0]} kcal est.` :
    `${food.kcal[0]}–${food.kcal[1]} kcal est.`;
  return `${foodCost(food)} · ${calories} · ${escaped(food.serving)}`;
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

function catalogNotice() {
  return `<p class="hint catalog-notice" ${session.deck.source === "starter" ? "" : "hidden"}>Using the five-dish starter catalog.</p>`;
}

function emptyPage() {
  const lastSkip = session.skipped.at(-1)?.food;
  const exhausted = session.deck.hadMatches && lastSkip;
  const reason = exhausted ? `Skipped ${escaped(lastSkip.name)}. You’ve seen every match in this round.`
    : session.allergyUnknown ? "This demo can’t assess the extra ingredient you selected."
    : atHome() ? "We couldn’t find a match using your selected ingredients and limits."
    : "We couldn’t find a match within the limits you set.";
  const controls = [
    exhausted ? action("Undo last skip", "undo", "secondary") : "",
    session.deck.hasAlternatives ? action("Broaden my craving", "broaden") : "",
    atHome() ? action("Add ingredients", "edit-pantry", "secondary") : "",
    action("Edit my limits", "edit-limits", "secondary"),
    quiet("Edit my craving", "craving")
  ].join("");
  return workspace("Step 3 of 3 · Matches", 3, exhausted ? "That’s the deck." : "No matches yet.", reason,
    `<div class="panel step-in"><span class="empty-mark" aria-hidden="true">✧</span>${context()}
      <p class="hint">Your budget and ingredient exclusions are still in effect.</p>${catalogNotice()}
      <div class="empty-actions">${controls}</div></div>`,
    "results");
}

function matchCount(deck) {
  if (deck.next !== null) return "More dishes available";
  const count = deck.items.length;
  return `${count} match${count === 1 ? "" : "es"} left`;
}

function matchesPage() {
  const deck = session.deck;
  const remaining = deckItems();
  const food = remaining[0];
  if (!food && (deck.error || deck.next !== null)) {
    const title = deck.error ? "Matches couldn’t load" : "Finding your next bite";
    const message = deck.error ? "Check your connection, then try again." : "Checking the catalog against what fits today.";
    return workspace("Step 3 of 3 · Matches", 3, title, message,
      `<div class="panel step-in" role="status">${deck.error ? action("Try again", "retry-matches") :
        '<p class="hint">Loading dishes…</p>'}${quiet("Edit limits", "edit-limits")}</div>`, "results");
  }
  if (!food) return emptyPage();
  const lastSkip = session.skipped.at(-1)?.food;
  const refine = session.skipped.length >= 2 && !session.refine
    ? `<div class="refine"><h2>Would lighter or more filling sound better?</h2><div class="chips">
        ${choice("Lighter", "light", "refine", false)}${choice("More filling", "filling", "refine", false)}
        ${choice("Either", "either", "refine", false)}
      </div></div>` : "";
  return workspace("Step 3 of 3 · Matches", 3,
    '<span class="desktop-only">Does this hit the spot?</span><span class="phone-only">Your next bite</span>',
    '<span class="desktop-only">Swipe left to skip, or swipe right if this is your pick.</span><span class="phone-only"><span aria-hidden="true">↔</span> Swipe left or right to skip</span>',
    `<div class="panel deck step-in">${context()}${refine}${catalogNotice()}
      <div class="card-meta"><span id="match-feed">${matchCount(deck)}</span>
        ${session.skipped.length ? quiet("Undo skip", "undo") : ""}</div>
      <div class="deck-stage" data-next="${remaining.length > 1}">
        <article id="food-card" class="food-card" aria-label="Current suggestion">
          ${photoMarkup(food)}
          <div class="swipe-feedback" aria-hidden="true">
            <span class="swipe-progress">Swipe to skip</span>
            <span class="swipe-ready">Release to skip</span>
            <span class="swipe-done">Skipped</span>
          </div>
          <div class="food-info"><h2>${escaped(food.name)}</h2><p>${escaped(food.description)}</p><p>${why(food)}</p>
            <p class="facts">${facts(food)}</p></div>
        </article>
      </div>
      <div class="deck-controls">${action("Skip", "skip", "secondary")}${action("I’ll eat this " + arrow, "pick")}</div>
      ${lastSkip ? `<p class="hint skip-receipt phone-only">Skipped ${escaped(lastSkip.name)}.</p>` : ""}
      <div class="edit-row">${quiet("Edit limits", "edit-limits")}${quiet("Edit craving", "craving")}</div>
      <p class="hint deck-note">Estimates are per serving. Check actual prices and ingredients before choosing.</p>
    </div>`, "results");
}

function pickedPage() {
  const food = session.picked;
  const prep = atHome()
    ? `<h3>What you’ll use</h3><p>${food.ingredients.map(item => escaped(ingredients[item] ?? item)).join(", ")}</p>
      <h3>How to make it</h3><ol>${food.steps.map(step => `<li>${escaped(step)}</li>`).join("")}</ol>
      <p class="hint">Verify packaged ingredient labels and check your preparation surfaces for cross-contact.</p>`
    : `<h3>What to look for</h3><p>Ask for ${escaped(food.name.toLowerCase())}. Prices, ingredients, and servings vary by seller.</p>`;
  const source = food.nutritionSource;
  const nutrition = source?.url?.startsWith("https://")
    ? `<p class="hint"><a href="${escaped(source.url)}">Nutrition source · ${escaped(source.label)}</a></p>`
    : source ? `<p class="hint">Nutrition source · ${escaped(source.label)}</p>` : "";
  return workspace("Your pick", 3, "You found<br><span class=\"accent\">your bite.</span>", why(food),
    `<div class="panel step-in">${photoMarkup(food, true)}
      <h2 class="pick-title">${escaped(food.name)}</h2><p class="hint">${facts(food)}</p>
      <div class="details">${prep}${nutrition}</div><div class="form-actions">${quiet("Back to matches", "matches")}
        ${action("Start over " + arrow, "reset")}</div></div>`, "results");
}

const screen = {
  start: startPage, craving: cravingPage, followup: followupPage,
  limits: limitsPage, pantry: pantryPage, matches: matchesPage, picked: pickedPage
};

function render(focus = true) {
  app.innerHTML = screen[session.step]();
  restart.hidden = session.step === "start";
  siteHeader.classList.toggle("in-session", session.step !== "start");
  const card = app.querySelector("#food-card");
  if (card) {
    enableSwipe(card);
    preloadNext(session.deck);
  }
  const dishImage = app.querySelector(".dish-photo img");
  if (dishImage) {
    const missing = () => { dishImage.parentElement.dataset.missing = "true"; };
    dishImage.addEventListener("error", missing, { once: true });
    if (dishImage.complete && !dishImage.naturalWidth) missing();
  }
  if (focus) {
    window.scrollTo(0, 0);
    app.querySelector("#screen-title").focus({ preventScroll: true });
  }
}

function go(step) {
  moving = false;
  session.step = step;
  if (step === "matches") {
    session.editing = false;
    ensureDeck();
  }
  render();
  if (step === "matches") void loadMatches(session.deck);
}

function reset() {
  session.deck?.controller.abort();
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
      go("matches");
      break;
  }
}

function skip(direction = -1) {
  const card = app.querySelector("#food-card");
  if (!card || moving) return;
  const food = deckItems()[0];
  moving = true;
  card.style.setProperty("--exit-x", direction < 0 ? "-115%" : "115%");
  card.style.setProperty("--exit-rotation", direction < 0 ? "-10deg" : "10deg");
  card.classList.remove("dragging");
  card.classList.add("leaving");
  window.setTimeout(() => {
    if (!app.contains(card)) return;
    session.deck.items.shift();
    session.skipped.push({ food, key: session.deck.key });
    go("matches");
    const nextFood = deckItems()[0];
    const status = nextFood ? `Next match: ${nextFood.name}.` : session.deck.next !== null ?
      "Loading more matches." : "You’ve reached the end of the matches.";
    announcement.textContent = `Skipped ${food.name}. ${status}`;
  }, reducedMotion.matches ? 0 : 240);
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
  let skipsBothWays = false;
  card.addEventListener("pointerdown", event => {
    if (moving || pointer !== null || event.button !== 0) return;
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    skipsBothWays = phoneLayout.matches;
    card.setPointerCapture(pointer);
    card.classList.add("dragging");
  });
  const isHorizontal = (dx, dy) => Math.abs(dx) >= Math.abs(dy) * 1.4;
  card.addEventListener("pointermove", event => {
    if (pointer !== event.pointerId) return;
    const dx = event.clientX - startX;
    const horizontal = isHorizontal(dx, event.clientY - startY);
    const shift = horizontal && !reducedMotion.matches ? dx : 0;
    card.style.setProperty("--drag-x", `${shift}px`);
    card.style.setProperty("--drag-angle", `${Math.max(-12, Math.min(12, shift / 19))}deg`);
    if (skipsBothWays) {
      card.dataset.swipe = horizontal && Math.abs(dx) >= swipeThreshold ? "ready"
        : horizontal && Math.abs(dx) > 12 ? "moving" : "";
    }
  });
  function release(event) {
    if (pointer !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    pointer = null;
    if (event.type === "pointerup" && isHorizontal(dx, dy) && Math.abs(dx) >= swipeThreshold) {
      if (dx < 0 || skipsBothWays) skip(Math.sign(dx));
      else pick();
      return;
    }
    card.classList.remove("dragging");
    card.style.removeProperty("--drag-x");
    card.style.removeProperty("--drag-angle");
    delete card.dataset.swipe;
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
      {
        const skipped = session.skipped.pop();
        if (skipped?.key === session.deck.key) {
          session.deck.items = [skipped.food, ...deckItems().filter(food => food.dishId !== skipped.food.dishId)];
        } else {
          session.deck.controller.abort();
          session.deck = null;
        }
      }
      go("matches");
      break;
    case "retry-matches":
      session.deck.error = false;
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
    else if (phoneLayout.matches) skip(1);
    else pick();
  }
});

restart.addEventListener("click", reset);
render(false);
