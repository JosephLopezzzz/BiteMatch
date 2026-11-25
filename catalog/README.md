# BiteMatch food catalog

`foods.json` is the source for the online catalog. `starter.json` contains the five offline dishes. Each record carries a canonical dish ID, serving, tags, ingredient review, and illustration credit. Leave price or calorie ranges null while the evidence is pending. A generic takeaway item carries an incomplete ingredient review and stays outside allergy-filtered matches.

Run `node catalog/export.mjs` to validate records, regenerate the offline subset, and emit the catalog's SQL update. The dedicated Supabase project runs the read-only `bitematch_search_catalog` function. Apply the migration before the first catalog update. The SQL update publishes the source records in one transaction and advances the catalog revision. When adding a dish, add both `assets/food/<file>-400.webp` and `assets/food/<file>-800.webp` before publishing its record. The browser preloads the next card's image and caches at most 24 extra image files.

## Menu and food research

Menus identify dishes and variants. Seller, branch, serving, price, and ingredient evidence belong to the specific offer. This catalog uses generic dish names and original food illustrations.

| Source | Used in the current batch | Candidates for the next review |
| --- | --- | --- |
| [Jollibee Philippines menu guide](https://help.jollibee.com.ph/hc/en-ph/articles/12483672999311-Jollibee-Kids-Party-Menu-Overview) | Burger steak with rice, peach mango hand pie | Filipino-style sweet spaghetti, palabok, tuna hand pie, creamy macaroni soup, chocolate sundae |
| [Chowking Philippines menu](https://www.chowking.ph/menu), [merienda menu examples](https://www.chowking.ph/promos/3533), and [chicken lauriat](https://www.chowking.ph/products/sweet-n-sour-chicken-lauriat) | Asado siopao, pork siomai, buchi, halo-halo, pancit canton | Wonton mami, siomai fried rice, sweet-and-sour chicken rice meal |
| [7-Eleven Philippines Crunch Time](https://www.7-eleven.com.ph/products-category/crunch-time/) and [convenience menu](https://www.7-eleven.com.ph/7-eleven-exclusives/) | Chicken nuggets, Korean corn dog | Egg tart, hot dog sandwich, ube tikoy rolls, spicy sisig onigiri, chocolate brownie, ube macapuno cake |
| [Goldilocks snacks and pasalubong](https://www.goldilocks.com.ph/products/bakeshop/snacks-pasalubong) | Cheese ensaymada, leche flan | Mamon, polvoron, egg pie, mung bean hopia, ube cheese puto |
| [Japan National Tourism Organization street-food guide](https://www.japan.travel/en/gastronomy/local-street-food-favorites-budget-restaurant-japan/) | Ramen, udon | Takoyaki, gyoza, karaage, yakisoba, onigiri, taiyaki, dango, okonomiyaki |
| [Korea Tourism Organization food guide](https://english.visitkorea.or.kr/svc/contents/contentsView.do?dataSetId=12&menuSn=745&vcontsId=1595365) | Korean corn dog | Tteokbokki, kimbap, hotteok, eomuk, gyeranppang, bungeoppang |

Nutrition references for plain boiled saba and purple sweet potato are stored in their records and shown in the app. The inherited five starter dishes use clearly identified demo estimates.
