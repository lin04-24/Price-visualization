import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS } from "./defaults";
import type {
  CaseConfig,
  CaseState,
  CooldownConfig,
  CsqaqContainer,
  ScrapeConfig,
  Settings,
  SwitchesConfig,
} from "./types";

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "app.db");
const settingsJsonPath = path.join(dataDir, "settings.json");
const stateJsonPath = path.join(dataDir, "cases_state.json");

let db: DatabaseSync | null = null;

function nowIso() {
  return new Date().toISOString();
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function normalizeScrape(scrape?: Partial<ScrapeConfig>): ScrapeConfig {
  return {
    ...DEFAULT_SETTINGS.scrape,
    ...scrape,
    max_concurrency: 1,
  };
}

function mergeSettings(base: Settings, override: Partial<Settings>): Settings {
  return {
    switches: {
      ...base.switches,
      ...override.switches,
      buff_uu: {
        ...base.switches.buff_uu,
        ...override.switches?.buff_uu,
      },
      steam: {
        ...base.switches.steam,
        ...override.switches?.steam,
      },
      change: {
        ...base.switches.change,
        ...override.switches?.change,
      },
    },
    cooldown: {
      ...base.cooldown,
      ...override.cooldown,
    },
    scrape: normalizeScrape({
      ...base.scrape,
      ...override.scrape,
    }),
    cases: {
      ...base.cases,
      ...override.cases,
    },
  };
}

function normalizeCaseState(state?: Partial<CaseState>): CaseState {
  return {
    total_seconds: Number(state?.total_seconds ?? 0),
    current_session_seconds: Number(state?.current_session_seconds ?? 0),
    in_cooldown: Boolean(state?.in_cooldown ?? false),
    remaining_days: Number(state?.remaining_days ?? 0),
  };
}

function initSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings_sections (
      section TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      buff_uu_min REAL NOT NULL,
      buff_uu_max REAL NOT NULL,
      steam_min REAL NOT NULL,
      steam_max REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_state (
      case_id TEXT PRIMARY KEY,
      total_seconds REAL NOT NULL DEFAULT 0,
      current_session_seconds REAL NOT NULL DEFAULT 0,
      in_cooldown INTEGER NOT NULL DEFAULT 0,
      remaining_days INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS csqaq_containers (
      id INTEGER PRIMARY KEY,
      img TEXT,
      name TEXT NOT NULL,
      comment TEXT,
      created_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_csqaq_containers_name ON csqaq_containers(name);
  `);
}

function setMeta(database: DatabaseSync, key: string, value: string) {
  database
    .prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)")
    .run(key, value);
}

function getMeta(database: DatabaseSync, key: string): string | null {
  const row = database
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSection<T>(database: DatabaseSync, section: string, payload: T) {
  database
    .prepare(
      "INSERT OR REPLACE INTO settings_sections (section, payload_json, updated_at) VALUES (?, ?, ?)",
    )
    .run(section, JSON.stringify(payload), nowIso());
}

function upsertCase(database: DatabaseSync, id: string, caseConfig: CaseConfig) {
  database
    .prepare(
      `INSERT OR REPLACE INTO cases
        (id, name, enabled, buff_uu_min, buff_uu_max, steam_min, steam_max, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      caseConfig.name || id,
      caseConfig.enabled === false ? 0 : 1,
      Number(caseConfig.buff_uu?.min_price ?? 0),
      Number(caseConfig.buff_uu?.max_price ?? 999999),
      Number(caseConfig.steam?.min_price ?? 0),
      Number(caseConfig.steam?.max_price ?? 999999),
      nowIso(),
    );
}

function ensureCaseState(database: DatabaseSync, caseId: string, state?: Partial<CaseState>) {
  const normalized = normalizeCaseState(state);
  database
    .prepare(
      `INSERT OR IGNORE INTO case_state
        (case_id, total_seconds, current_session_seconds, in_cooldown, remaining_days)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      caseId,
      normalized.total_seconds,
      normalized.current_session_seconds,
      normalized.in_cooldown ? 1 : 0,
      normalized.remaining_days,
    );
}

function migrateJsonIfNeeded(database: DatabaseSync) {
  if (getMeta(database, "json_migrated_at")) {
    return;
  }

  const jsonSettings = readJsonFile<Partial<Settings>>(settingsJsonPath, {});
  const jsonState = readJsonFile<Record<string, Partial<CaseState>>>(stateJsonPath, {});
  const settings = mergeSettings(DEFAULT_SETTINGS, jsonSettings);

  database.exec("BEGIN");
  try {
    setSection(database, "switches", settings.switches);
    setSection(database, "cooldown", settings.cooldown);
    setSection(database, "scrape", settings.scrape);
    for (const [caseId, caseConfig] of Object.entries(settings.cases)) {
      upsertCase(database, caseId, caseConfig);
      ensureCaseState(database, caseId, jsonState[caseId]);
    }
    setMeta(database, "json_migrated_at", nowIso());
    setMeta(database, "start_time", nowIso());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getDb() {
  if (!db) {
    mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(dbPath);
    initSchema(db);
    migrateJsonIfNeeded(db);
  }

  return db;
}

export function getSettings(): Settings {
  const database = getDb();
  const rows = database
    .prepare("SELECT section, payload_json FROM settings_sections")
    .all() as Array<{ section: string; payload_json: string }>;

  const sections = Object.fromEntries(
    rows.map((row) => [row.section, JSON.parse(row.payload_json)]),
  ) as Partial<Pick<Settings, "switches" | "cooldown" | "scrape">>;

  const caseRows = database
    .prepare(
      "SELECT id, name, enabled, buff_uu_min, buff_uu_max, steam_min, steam_max FROM cases ORDER BY id",
    )
    .all() as Array<{
    id: string;
    name: string;
    enabled: number;
    buff_uu_min: number;
    buff_uu_max: number;
    steam_min: number;
    steam_max: number;
  }>;

  const cases: Record<string, CaseConfig> = {};
  for (const row of caseRows) {
    cases[row.id] = {
      name: row.name,
      enabled: row.enabled !== 0,
      buff_uu: {
        min_price: row.buff_uu_min,
        max_price: row.buff_uu_max,
      },
      steam: {
        min_price: row.steam_min,
        max_price: row.steam_max,
      },
    };
  }

  return {
    switches: sections.switches ?? DEFAULT_SETTINGS.switches,
    cooldown: sections.cooldown ?? DEFAULT_SETTINGS.cooldown,
    scrape: normalizeScrape(sections.scrape),
    cases,
  };
}

export function setSwitches(switches: SwitchesConfig) {
  setSection(getDb(), "switches", switches);
}

export function setCooldown(cooldown: CooldownConfig) {
  setSection(getDb(), "cooldown", cooldown);
}

export function setScrape(scrape: ScrapeConfig) {
  setSection(getDb(), "scrape", normalizeScrape(scrape));
}

export function getCasesState(): Record<string, CaseState> {
  const database = getDb();
  const settings = getSettings();
  const stateRows = database
    .prepare(
      "SELECT case_id, total_seconds, current_session_seconds, in_cooldown, remaining_days FROM case_state",
    )
    .all() as Array<{
    case_id: string;
    total_seconds: number;
    current_session_seconds: number;
    in_cooldown: number;
    remaining_days: number;
  }>;

  const byId = new Map(stateRows.map((row) => [row.case_id, row]));
  const result: Record<string, CaseState> = {};

  for (const caseId of Object.keys(settings.cases)) {
    const row = byId.get(caseId);
    result[caseId] = normalizeCaseState(
      row
        ? {
            total_seconds: row.total_seconds,
            current_session_seconds: row.current_session_seconds,
            in_cooldown: row.in_cooldown !== 0,
            remaining_days: row.remaining_days,
          }
        : undefined,
    );
    ensureCaseState(database, caseId, result[caseId]);
  }

  return result;
}

export function saveCase(caseId: string, caseConfig: CaseConfig) {
  const database = getDb();
  database.exec("BEGIN");
  try {
    upsertCase(database, caseId, caseConfig);
    ensureCaseState(database, caseId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function deleteCase(caseId: string): boolean {
  const database = getDb();
  database.exec("BEGIN");
  try {
    const result = database.prepare("DELETE FROM cases WHERE id = ?").run(caseId);
    database.prepare("DELETE FROM case_state WHERE case_id = ?").run(caseId);
    database.exec("COMMIT");
    return result.changes > 0;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function resetAllCooldowns() {
  getDb()
    .prepare(
      "UPDATE case_state SET current_session_seconds = 0, in_cooldown = 0, remaining_days = 0",
    )
    .run();
}

export function resetCaseCooldown(caseId: string): boolean {
  const database = getDb();
  const exists = database.prepare("SELECT 1 FROM cases WHERE id = ?").get(caseId);
  if (!exists) {
    return false;
  }

  ensureCaseState(database, caseId);
  database
    .prepare(
      "UPDATE case_state SET current_session_seconds = 0, in_cooldown = 0, remaining_days = 0 WHERE case_id = ?",
    )
    .run(caseId);
  return true;
}

export function getStartTime() {
  const database = getDb();
  let startTime = getMeta(database, "start_time");
  if (!startTime) {
    startTime = nowIso();
    setMeta(database, "start_time", startTime);
  }

  return startTime;
}

export function getCsqaqContainersSyncedAt() {
  return getMeta(getDb(), "csqaq_containers_synced_at");
}

export function saveCsqaqContainers(containers: CsqaqContainer[]) {
  const database = getDb();
  const timestamp = nowIso();
  const insert = database.prepare(
    `INSERT OR REPLACE INTO csqaq_containers
      (id, img, name, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM csqaq_containers").run();
    for (const container of containers) {
      insert.run(
        container.id,
        container.img ?? null,
        container.name,
        container.comment ?? null,
        container.created_at ?? null,
        timestamp,
      );
    }
    setMeta(database, "csqaq_containers_synced_at", timestamp);
    database.exec("COMMIT");
    return timestamp;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getStoredCsqaqContainers(): CsqaqContainer[] {
  const rows = getDb()
    .prepare("SELECT id, img, name, comment, created_at FROM csqaq_containers ORDER BY id")
    .all() as Array<{
    id: number;
    img: string | null;
    name: string;
    comment: string | null;
    created_at: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    img: row.img ?? undefined,
    name: row.name,
    comment: row.comment ?? undefined,
    created_at: row.created_at ?? undefined,
  }));
}
