"use strict";

const BiteCatalog = (() => {
  const limit = 6;
  let starterRecords;

  function offlinePage(records, prefs, start) {
    const eligible = records.filter(food => !prefs.allergyUnknown &&
      (!prefs.home || (food.ingredients.length > 0 && food.ingredients.every(item => prefs.pantry.includes(item)))) &&
      (!prefs.allergies.length || (prefs.home && food.ingredientReview === "listed" &&
        !food.allergens.some(item => prefs.allergies.includes(item)))) &&
      (prefs.home || prefs.budget === null || (food.price && food.price[1] <= prefs.budget)) &&
      (prefs.kcalMax === null || (food.kcal && food.kcal[1] <= prefs.kcalMax)));
    const score = food => prefs.cues.filter(cue => food.tags.includes(cue)).length;
    const distance = food => prefs.kcalTarget === null ? 0 : !food.kcal ? Infinity :
      Math.max(food.kcal[0] - prefs.kcalTarget, prefs.kcalTarget - food.kcal[1], 0);
    const matches = eligible.filter(food => prefs.broadened || !prefs.cues.length || score(food) > 0);
    matches.sort((a, b) => Number(b.tags.includes(prefs.refine)) - Number(a.tags.includes(prefs.refine)) ||
      score(b) - score(a) || distance(a) - distance(b));
    return {
      items: matches.slice(start, start + limit),
      next: start + limit < matches.length ? start + limit : null,
      hasAlternatives: !prefs.broadened && prefs.cues.length > 0 && eligible.some(food => !score(food)),
      revision: 0, source: "starter"
    };
  }

  async function requestPage(prefs, start, source, signal) {
    if (source !== "starter" && navigator.onLine !== false && window.BiteCatalogConfig) {
      const { endpoint, publicKey } = window.BiteCatalogConfig;
      const timeout = new AbortController();
      const abort = () => timeout.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => timeout.abort(), 3500);
      try {
        const response = await fetch(endpoint, {
          method: "POST", headers: { apikey: publicKey, "Content-Type": "application/json" },
          body: JSON.stringify({ preferences: prefs, start_at: start }), signal: timeout.signal
        });
        if (!response.ok) throw new Error("Catalog request failed.");
        const page = await response.json();
        if (!Array.isArray(page.items) || page.items.length > limit) throw new Error("Invalid catalog page.");
        return { ...page, source: "online" };
      } catch (error) {
        if (signal.aborted) throw error;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      }
    }
    signal.throwIfAborted();
    if (!starterRecords) {
      const response = await fetch("./catalog/starter.json", { signal });
      if (!response.ok) throw new Error("Starter catalog unavailable.");
      starterRecords = await response.json();
    }
    return offlinePage(starterRecords, prefs, source === "starter" ? start : 0);
  }

  function photoSource(food) {
    const file = food.photo?.file;
    if (!/^[a-z0-9-]+$/.test(file ?? "")) return null;
    return {
      src: `assets/food/${file}-800.webp`,
      srcset: `assets/food/${file}-400.webp 400w, assets/food/${file}-800.webp 800w`,
      sizes: "(max-width: 820px) calc(100vw - 66px), 650px"
    };
  }

  return { requestPage, photoSource };
})();
