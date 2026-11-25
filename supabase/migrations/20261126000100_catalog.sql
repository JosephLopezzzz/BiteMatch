create schema bitematch_catalog;
revoke all on schema bitematch_catalog from public, anon, authenticated;

create table bitematch_catalog.foods (
  id text primary key,
  position integer not null check (position >= 0),
  published boolean not null default false,
  entry jsonb not null check (jsonb_typeof(entry) = 'object')
);
alter table bitematch_catalog.foods enable row level security;
create index foods_published_tags on bitematch_catalog.foods using gin ((entry->'tags')) where published;

create table bitematch_catalog.metadata (
  singleton boolean primary key default true check (singleton),
  revision integer not null default 1
);
alter table bitematch_catalog.metadata enable row level security;
insert into bitematch_catalog.metadata default values;

create function public.bitematch_search_catalog(preferences jsonb, start_at integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select
      case when preferences->'home' = 'true'::jsonb then true else false end as home,
      case when preferences->'broadened' = 'true'::jsonb then true else false end as broadened,
      case when preferences->'allergyUnknown' = 'true'::jsonb then true else false end as allergy_unknown,
      case when jsonb_typeof(preferences->'budget') = 'number' then (preferences->>'budget')::numeric end as budget,
      case when jsonb_typeof(preferences->'kcalMax') = 'number' then (preferences->>'kcalMax')::numeric end as kcal_max,
      case when jsonb_typeof(preferences->'kcalTarget') = 'number' then (preferences->>'kcalTarget')::numeric end as kcal_target,
      left(preferences->>'refine', 20) as refine,
      array(select distinct tag from jsonb_array_elements_text(
        case when jsonb_typeof(preferences->'cues') = 'array' then preferences->'cues' else '[]'::jsonb end
      ) as t(tag) where tag in ('crispy', 'sweet', 'savory', 'fresh', 'light', 'filling')) as cues,
      array(select tag from jsonb_array_elements_text(
        case when jsonb_typeof(preferences->'allergies') = 'array' then preferences->'allergies' else '[]'::jsonb end
      ) as t(tag) limit 10) as allergies,
      case when jsonb_typeof(preferences->'pantry') = 'array' then preferences->'pantry' else '[]'::jsonb end as pantry,
      least(1000000, greatest(0, coalesce(start_at, 0))) as page_start
  ),
  eligible as (
    select food.id, food.position, food.entry,
      (select count(*) from unnest(input.cues) as cue where (food.entry->'tags') ? cue) as cue_score,
      coalesce((food.entry->'tags') ? input.refine, false) as refined,
      case when input.kcal_target is null then 0
           when jsonb_typeof(food.entry->'kcal') <> 'array' or food.entry->'kcal' is null then 1000000
           else greatest((food.entry->'kcal'->>0)::numeric - input.kcal_target,
                         input.kcal_target - (food.entry->'kcal'->>1)::numeric, 0)
      end as kcal_distance
    from bitematch_catalog.foods as food
    cross join input
    where food.published
      and not input.allergy_unknown
      and (not input.home or (jsonb_typeof(food.entry->'ingredients') = 'array'
        and (food.entry->'ingredients') <> '[]'::jsonb and input.pantry @> (food.entry->'ingredients')))
      and (cardinality(input.allergies) = 0 or (input.home
        and food.entry->>'ingredientReview' = 'listed'
        and jsonb_typeof(food.entry->'allergens') = 'array'
        and not ((food.entry->'allergens') ?| input.allergies)))
      and (input.home or input.budget is null or (food.entry->'price'->>1)::numeric <= input.budget)
      and (input.kcal_max is null or (food.entry->'kcal'->>1)::numeric <= input.kcal_max)
  ),
  result as (
    select eligible.*
    from eligible cross join input
    where input.broadened or cardinality(input.cues) = 0 or eligible.cue_score > 0
    order by refined desc, cue_score desc, kcal_distance, position, id
    limit 7 offset (select page_start from input)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(entry order by refined desc, cue_score desc, kcal_distance, position, id)
      from (select * from result order by refined desc, cue_score desc, kcal_distance, position, id limit 6) as page), '[]'::jsonb),
    'next', case when (select count(*) from result) > 6 then input.page_start + 6 end,
    'hasAlternatives', not input.broadened and cardinality(input.cues) > 0
      and exists (select 1 from eligible where cue_score = 0),
    'revision', (select revision from bitematch_catalog.metadata where singleton)
  ) from input;
$$;

revoke all on function public.bitematch_search_catalog(jsonb, integer) from public;
grant execute on function public.bitematch_search_catalog(jsonb, integer) to anon, authenticated;
