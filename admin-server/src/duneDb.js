import { assertIdentifier, intParam, isReadOnlySql, quoteQualified, rowsResult } from "./db.js";

export async function dbStatus(db) {
  const result = await db.query("select current_user, current_database(), version()");
  const tables = await db.query("select count(*)::int as count from information_schema.tables where table_schema = 'dune'");
  return { connected: true, config: db.config, server: result.rows[0], duneTableCount: tables.rows[0]?.count ?? 0 };
}

export async function listSchemas(db) {
  const result = await db.query("select schema_name from information_schema.schemata order by schema_name");
  return result.rows.map((row) => row.schema_name);
}

export async function listTables(db, schema = "dune") {
  assertIdentifier(schema, "schema");
  const result = await db.query(`
    select t.table_schema as schema,
           t.table_name as name,
           coalesce(s.n_live_tup, 0)::bigint as estimated_rows
    from information_schema.tables t
    left join pg_stat_user_tables s on s.schemaname = t.table_schema and s.relname = t.table_name
    where t.table_type = 'BASE TABLE' and t.table_schema = $1
    order by t.table_name`, [schema]);
  return result.rows;
}

export async function tableColumns(db, schema, table) {
  assertIdentifier(schema, "schema");
  assertIdentifier(table, "table");
  const result = await db.query(`
    select column_name as name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = $1 and table_name = $2
    order by ordinal_position`, [schema, table]);
  return result.rows;
}

export async function tableCount(db, schema, table) {
  const safe = quoteQualified(schema, table);
  const result = await db.query(`select count(*)::bigint as count from ${safe}`);
  return { schema, table, count: result.rows[0]?.count ?? "0" };
}

export async function tablePreview(db, schema, table, limit = 50, offset = 0) {
  const safe = quoteQualified(schema, table);
  const maxLimit = intParam(limit, "limit", 1, 500);
  const safeOffset = intParam(offset, "offset", 0);
  const result = await db.query(`select * from ${safe} limit $1 offset $2`, [maxLimit, safeOffset]);
  return { schema, table, limit: maxLimit, offset: safeOffset, ...rowsResult(result) };
}

export async function searchDatabase(db, q) {
  const term = String(q || "").trim();
  if (!term) throw new Error("Search query is required");
  const result = await db.query(`
    select table_schema as schema, table_name as table, column_name as column, data_type
    from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema')
      and (table_name ilike $1 or column_name ilike $1)
    order by table_schema, table_name, column_name
    limit 300`, [`%${term}%`]);
  return result.rows;
}

export async function runSql(db, query, allowDestructive = false) {
  const sql = String(query || "").trim();
  if (!sql) throw new Error("SQL query is required");
  if (!allowDestructive && !isReadOnlySql(sql)) throw new Error("Only read-only SQL is allowed without destructive confirmation");
  const result = await db.query(sql);
  return rowsResult(result);
}

export async function tableExists(db, name, schema = "dune") {
  const result = await db.query("select to_regclass($1) is not null as exists", [`${schema}.${name}`]);
  return Boolean(result.rows[0]?.exists);
}

export async function columnsFor(db, table, schema = "dune") {
  const result = await db.query(`
    select column_name
    from information_schema.columns
    where table_schema = $1 and table_name = $2`, [schema, table]);
  return new Set(result.rows.map((row) => row.column_name));
}

export async function listPlayers(db, { online = false, q = "" } = {}) {
  if (!(await tableExists(db, "actors")) || !(await tableExists(db, "player_state"))) {
    return unsupported("players", ["dune.actors", "dune.player_state"]);
  }
  const values = [];
  let where = "a.class ilike '%PlayerCharacter%'";
  if (online) where += " and coalesce(ps.online_status::text, '') = 'Online'";
  if (q) {
    values.push(`%${q}%`);
    where += ` and (ps.character_name ilike $${values.length} or ac."user" ilike $${values.length} or a.id::text = $${values.length})`;
  }
  const result = await db.query(`
    select a.id as actor_id,
           coalesce(a.owner_account_id, 0) as account_id,
           coalesce(ps.character_name, '') as character_name,
           coalesce(ps.player_controller_id, 0) as player_controller_id,
           coalesce(ac."user", '') as fls_id,
           a.class,
           coalesce(a.map, '') as map,
           coalesce(ps.online_status::text, 'Offline') as online_status
    from dune.actors a
    left join dune.player_state ps on ps.account_id = a.owner_account_id
    left join dune.accounts ac on ac.id = a.owner_account_id
    where ${where}
    order by lower(coalesce(ps.character_name, '')), a.id
    limit 500`, values);
  return { capabilities: { players: true, online }, rows: result.rows };
}

export async function playerProfile(db, id) {
  const actorId = intParam(id, "player id", 1);
  const result = await db.query(`
    select a.id as actor_id,
           coalesce(a.owner_account_id, 0) as account_id,
           coalesce(ps.character_name, '') as character_name,
           coalesce(ps.player_controller_id, 0) as player_controller_id,
           coalesce(ac."user", '') as fls_id,
           a.class,
           coalesce(a.map, '') as map,
           coalesce(ps.online_status::text, 'Offline') as online_status
    from dune.actors a
    left join dune.player_state ps on ps.account_id = a.owner_account_id
    left join dune.accounts ac on ac.id = a.owner_account_id
    where a.id = $1`, [actorId]);
  if (!result.rows[0]) throw new Error("Player not found");
  return { capabilities: await playerCapabilities(db), player: result.rows[0] };
}

export async function playerInventory(db, id) {
  if (!(await tableExists(db, "items")) || !(await tableExists(db, "inventories"))) return unsupported("inventory", ["dune.items", "dune.inventories"]);
  const result = await db.query(`
    select i.id,
           i.template_id,
           i.stack_size,
           i.quality_level,
           i.position_index,
           i.inventory_id,
           coalesce((i.stats->'FItemStackAndDurabilityStats'->1->>'CurrentDurability'), null) as current_durability,
           coalesce((i.stats->'FItemStackAndDurabilityStats'->1->>'MaxDurability'), null) as max_durability,
           i.stats
    from dune.items i
    join dune.inventories inv on i.inventory_id = inv.id
    where inv.actor_id = $1
    order by i.template_id`, [intParam(id, "player id", 1)]);
  return { capabilities: { inventory: true }, rows: result.rows };
}

export async function playerCurrency(db, id) {
  if (!(await tableExists(db, "player_virtual_currency_balances"))) return unsupported("currency", ["dune.player_virtual_currency_balances"]);
  const actorId = intParam(id, "player id", 1);
  const result = await db.query(`
    select currency_id, balance
    from dune.player_virtual_currency_balances
    where player_controller_id = $1
       or player_controller_id = (select coalesce(player_controller_id, 0) from dune.player_state where player_pawn_id = $1 limit 1)
    order by currency_id`, [actorId]);
  return { capabilities: { currency: true }, rows: result.rows };
}

export async function playerFactions(db, id) {
  if (!(await tableExists(db, "player_faction_reputation"))) return unsupported("factions", ["dune.player_faction_reputation"]);
  const hasFactions = await tableExists(db, "factions");
  const result = await db.query(`
    select pfr.actor_id,
           pfr.faction_id,
           ${hasFactions ? "coalesce(f.name, '')" : "''"} as faction_name,
           pfr.reputation_amount
    from dune.player_faction_reputation pfr
    ${hasFactions ? "left join dune.factions f on f.id = pfr.faction_id" : ""}
    where pfr.actor_id = $1
    order by pfr.faction_id`, [intParam(id, "player id", 1)]);
  return { capabilities: { factions: true, factionNames: hasFactions }, rows: result.rows };
}

export async function playerSpecs(db, id) {
  if (!(await tableExists(db, "specialization_tracks"))) return unsupported("specs", ["dune.specialization_tracks"]);
  const result = await db.query(`
    select player_id, track_type::text, xp_amount, level
    from dune.specialization_tracks
    where player_id = $1
    order by track_type`, [intParam(id, "player id", 1)]);
  return { capabilities: { specs: true }, rows: result.rows };
}

export async function playerPosition(db, id) {
  const actorId = intParam(id, "player id", 1);
  try {
    const result = await db.query(`
      select id as actor_id, map, (transform).location::text as location, (transform).rotation::text as rotation
      from dune.actors
      where id = $1`, [actorId]);
    return { capabilities: { position: true }, position: result.rows[0] || null };
  } catch (error) {
    return { capabilities: { position: false }, reason: "dune.actors transform composite columns were not available", error: error.message };
  }
}

export async function unsupportedPlayerFeature(db, id, feature) {
  intParam(id, "player id", 1);
  return { capabilities: { [feature]: false }, rows: [], reason: `${feature} schema has not been detected in this database yet` };
}

export async function listStorage(db) {
  if (!(await tableExists(db, "placeables"))) return unsupported("storage", ["dune.placeables"]);
  const result = await db.query(`
    select p.id,
           coalesce(max(case when pa.actor_name not like '##%' and pa.actor_name <> 'None' then pa.actor_name end), '') as name,
           p.building_type as class,
           coalesce(a.map, '') as map,
           count(i.id)::int as item_count,
           coalesce(max(ps.character_name), '') as owner_name
    from dune.placeables p
    left join dune.actors a on a.id = p.id
    left join dune.permission_actor pa on pa.actor_id = p.id
    left join dune.inventories inv on inv.actor_id = p.id
    left join dune.items i on i.inventory_id = inv.id
    left join dune.actor_fgl_entities afe on afe.entity_id = p.owner_entity_id
    left join dune.permission_actor_rank par on par.permission_actor_id = afe.actor_id
    left join dune.actors player_a on player_a.id = par.player_id
    left join dune.player_state ps on ps.account_id = player_a.owner_account_id
    where p.building_type in ('SpiceSilo_Placeable','GenericContainer_Placeable','StorageContainer_Placeable','MediumStorageContainer_Placeable')
      and p.is_hologram = false and p.owner_entity_id is not null and p.owner_entity_id != 0
    group by p.id, p.building_type, a.map
    order by p.id`);
  return { capabilities: { storage: true }, rows: result.rows };
}

export async function storageItems(db, id) {
  return playerInventory(db, id);
}

export async function listBases(db) {
  if (!(await tableExists(db, "buildings"))) return unsupported("bases", ["dune.buildings"]);
  const result = await db.query(`
    select b.id,
           coalesce(pa.actor_name, '') as name,
           coalesce(inst.cnt, 0)::int as pieces,
           coalesce(plac.cnt, 0)::int as placeables
    from dune.buildings b
    left join (
      select building_id, min(owner_entity_id) as owner_entity_id, count(*) as cnt
      from dune.building_instances
      group by building_id
    ) inst on inst.building_id = b.id
    left join dune.actor_fgl_entities afe on afe.entity_id = inst.owner_entity_id
    left join dune.actors t on t.id = afe.actor_id and t.class ilike '%Totem%'
    left join dune.permission_actor pa on pa.actor_id = t.id
    left join (
      select bi.building_id, count(*) as cnt
      from dune.building_instances bi
      join dune.placeables p on p.owner_entity_id = bi.owner_entity_id
      group by bi.building_id
    ) plac on plac.building_id = b.id
    order by b.id`);
  return { capabilities: { bases: true }, rows: result.rows };
}

export async function listBlueprints(db) {
  if (!(await tableExists(db, "building_blueprints"))) return unsupported("blueprints", ["dune.building_blueprints"]);
  const result = await db.query(`
    select bb.id,
           coalesce(ps.character_name, '') as owner_name,
           coalesce(bb.item_id, 0) as item_id,
           coalesce(inst.cnt, 0)::int as pieces,
           coalesce(plac.cnt, 0)::int as placeables,
           coalesce(i.stats->'FBuildingBlueprintItemStats'->1->>'BuildingBlueprintName', '') as name
    from dune.building_blueprints bb
    left join dune.items i on i.id = bb.item_id
    left join dune.inventories inv on inv.id = i.inventory_id
    left join dune.actors a on a.id = inv.actor_id
    left join dune.player_state ps on ps.player_pawn_id = a.id
    left join (
      select building_blueprint_id, count(*) as cnt
      from dune.building_blueprint_instances
      group by building_blueprint_id
    ) inst on inst.building_blueprint_id = bb.id
    left join (
      select building_blueprint_id, count(*) as cnt
      from dune.building_blueprint_placeables
      group by building_blueprint_id
    ) plac on plac.building_blueprint_id = bb.id
    order by bb.id`);
  return { capabilities: { blueprints: true }, rows: result.rows };
}

export async function exportRows(db, query) {
  const result = await runSql(db, query, false);
  return JSON.stringify(result, null, 2);
}

async function playerCapabilities(db) {
  return {
    inventory: await tableExists(db, "items") && await tableExists(db, "inventories"),
    currency: await tableExists(db, "player_virtual_currency_balances"),
    factions: await tableExists(db, "player_faction_reputation"),
    specs: await tableExists(db, "specialization_tracks"),
    progression: false,
    events: false,
    stats: false,
    history: false
  };
}

function unsupported(feature, requiredTables) {
  return {
    capabilities: { [feature]: false },
    rows: [],
    reason: `Unsupported by detected schema. Missing required table(s): ${requiredTables.join(", ")}`
  };
}
