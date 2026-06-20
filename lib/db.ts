import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as sqlite3 from "sqlite3";
import { DEFAULT_SETTINGS } from "./defaults";
import type { Database, RunResult } from "sqlite3";
import type {
  CaseConfig,
  CaseMarketSnapshot,
  CaseState,
  CooldownConfig,
  CsqaqContainer,
  ScrapeConfig,
  Settings,
  SwitchesConfig,
} from "./types";

type SqlParameter = string | number | null;

interface RunInfo {
  changes: number;
  lastID: number;
}

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "app.db");
const settingsJsonPath = path.join(dataDir, "settings.json");
const stateJsonPath = path.join(dataDir, "cases_state.json");

let dbPromise: Promise<Database> | null = null;
let dbQueue = Promise.resolve();

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

function openDatabase(filePath: string) {
  return new Promise<Database>((resolve, reject) => {
    new sqlite3.Database(
      filePath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      function onOpen(this: Database, error: Error | null) {
        if (error) {
          reject(error);
          return;
        }

        this.configure("busyTimeout", 5000);
        resolve(this);
      },
    );
  });
}

function exec(database: Database, sql: string) {
  return new Promise<void>((resolve, reject) => {
    database.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function run(database: Database, sql: string, params: SqlParameter[] = []) {
  return new Promise<RunInfo>((resolve, reject) => {
    database.run(sql, params, function onRun(this: RunResult, error: Error | null) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        changes: this.changes ?? 0,
        lastID: this.lastID ?? 0,
      });
    });
  });
}

function get<T>(database: Database, sql: string, params: SqlParameter[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    database.get<T>(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all<T>(database: Database, sql: string, params: SqlParameter[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    database.all<T>(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
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

function normalizeNullableNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

async function initSchema(database: Database) {
  await exec(
    database,
    `
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

    CREATE TABLE IF NOT EXISTS case_market_snapshots (
      case_id TEXT PRIMARY KEY,
      steam_sell_price REAL,
      yyyp_sell_price REAL,
      updated_at TEXT NOT NULL
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
  `,
  );
}

async function setMeta(database: Database, key: string, value: string) {
  await run(database, "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)", [key, value]);
}

async function getMeta(database: Database, key: string): Promise<string | null> {
  const row = await get<{ value: string }>(database, "SELECT value FROM app_meta WHERE key = ?", [key]);
  return row?.value ?? null;
}

async function setSection<T>(database: Database, section: string, payload: T) {
  await run(
    database,
    "INSERT OR REPLACE INTO settings_sections (section, payload_json, updated_at) VALUES (?, ?, ?)",
    [section, JSON.stringify(payload), nowIso()],
  );
}

async function upsertCase(database: Database, id: string, caseConfig: CaseConfig) {
  await run(
    database,
    `INSERT OR REPLACE INTO cases
        (id, name, enabled, buff_uu_min, buff_uu_max, steam_min, steam_max, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      caseConfig.name || id,
      caseConfig.enabled === false ? 0 : 1,
      Number(caseConfig.buff_uu?.min_price ?? 0),
      Number(caseConfig.buff_uu?.max_price ?? 999999),
      Number(caseConfig.steam?.min_price ?? 0),
      Number(caseConfig.steam?.max_price ?? 999999),
      nowIso(),
    ],
  );
}

async function ensureCaseState(
  database: Database,
  caseId: string,
  state?: Partial<CaseState>,
) {
  const normalized = normalizeCaseState(state);
  await run(
    database,
    `INSERT OR IGNORE INTO case_state
        (case_id, total_seconds, current_session_seconds, in_cooldown, remaining_days)
       VALUES (?, ?, ?, ?, ?)`,
    [
      caseId,
      normalized.total_seconds,
      normalized.current_session_seconds,
      normalized.in_cooldown ? 1 : 0,
      normalized.remaining_days,
    ],
  );
}

async function transaction<T>(database: Database, action: () => Promise<T>) {
  await exec(database, "BEGIN");
  try {
    const result = await action();
    await exec(database, "COMMIT");
    return result;
  } catch (error) {
    await exec(database, "ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function migrateJsonIfNeeded(database: Database) {
  if (await getMeta(database, "json_migrated_at")) {
    return;
  }

  const jsonSettings = readJsonFile<Partial<Settings>>(settingsJsonPath, {});
  const jsonState = readJsonFile<Record<string, Partial<CaseState>>>(stateJsonPath, {});
  const settings = mergeSettings(DEFAULT_SETTINGS, jsonSettings);

  await transaction(database, async () => {
    await setSection(database, "switches", settings.switches);
    await setSection(database, "cooldown", settings.cooldown);
    await setSection(database, "scrape", settings.scrape);
    for (const [caseId, caseConfig] of Object.entries(settings.cases)) {
      await upsertCase(database, caseId, caseConfig);
      await ensureCaseState(database, caseId, jsonState[caseId]);
    }
    await setMeta(database, "json_migrated_at", nowIso());
    await setMeta(database, "start_time", nowIso());
  });
}

export async function getDb() {
  if (!dbPromise) {
    mkdirSync(dataDir, { recursive: true });
    dbPromise = openDatabase(dbPath)
      .then(async (database) => {
        await initSchema(database);
        await migrateJsonIfNeeded(database);
        return database;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }

  return dbPromise;
}

function withDb<T>(operation: (database: Database) => Promise<T>) {
  const queuedOperation = dbQueue.then(async () => operation(await getDb()));
  dbQueue = queuedOperation.then(
    () => undefined,
    () => undefined,
  );
  return queuedOperation;
}

async function getSettingsInternal(database: Database): Promise<Settings> {
  const rows = await all<{ section: string; payload_json: string }>(
    database,
    "SELECT section, payload_json FROM settings_sections",
  );

  const sections = Object.fromEntries(
    rows.map((row) => [row.section, JSON.parse(row.payload_json)]),
  ) as Partial<Pick<Settings, "switches" | "cooldown" | "scrape">>;

  const caseRows = await all<{
    id: string;
    name: string;
    enabled: number;
    buff_uu_min: number;
    buff_uu_max: number;
    steam_min: number;
    steam_max: number;
  }>(
    database,
    "SELECT id, name, enabled, buff_uu_min, buff_uu_max, steam_min, steam_max FROM cases ORDER BY id",
  );

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

export function getSettings(): Promise<Settings> {
  return withDb((database) => getSettingsInternal(database));
}

export function setSwitches(switches: SwitchesConfig) {
  return withDb((database) => setSection(database, "switches", switches));
}

export function setCooldown(cooldown: CooldownConfig) {
  return withDb((database) => setSection(database, "cooldown", cooldown));
}

export function setScrape(scrape: ScrapeConfig) {
  return withDb((database) => setSection(database, "scrape", normalizeScrape(scrape)));
}

export function getCasesState(): Promise<Record<string, CaseState>> {
  return withDb(async (database) => {
    const settings = await getSettingsInternal(database);
    const stateRows = await all<{
      case_id: string;
      total_seconds: number;
      current_session_seconds: number;
      in_cooldown: number;
      remaining_days: number;
    }>(
      database,
      "SELECT case_id, total_seconds, current_session_seconds, in_cooldown, remaining_days FROM case_state",
    );

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
      await ensureCaseState(database, caseId, result[caseId]);
    }

    return result;
  });
}

export function saveCase(caseId: string, caseConfig: CaseConfig) {
  return withDb((database) =>
    transaction(database, async () => {
      await upsertCase(database, caseId, caseConfig);
      await ensureCaseState(database, caseId);
    }),
  );
}

export function deleteCase(caseId: string): Promise<boolean> {
  return withDb((database) =>
    transaction(database, async () => {
      const result = await run(database, "DELETE FROM cases WHERE id = ?", [caseId]);
      await run(database, "DELETE FROM case_state WHERE case_id = ?", [caseId]);
      await run(database, "DELETE FROM case_market_snapshots WHERE case_id = ?", [caseId]);
      return result.changes > 0;
    }),
  );
}

export function getCaseMarketSnapshots(): Promise<Record<string, CaseMarketSnapshot>> {
  return withDb(async (database) => {
    const rows = await all<{
      case_id: string;
      steam_sell_price: number | null;
      yyyp_sell_price: number | null;
      updated_at: string;
    }>(
      database,
      "SELECT case_id, steam_sell_price, yyyp_sell_price, updated_at FROM case_market_snapshots",
    );

    return Object.fromEntries(
      rows.map((row) => [
        row.case_id,
        {
          steam_sell_price: row.steam_sell_price,
          yyyp_sell_price: row.yyyp_sell_price,
          updated_at: row.updated_at,
        },
      ]),
    );
  });
}

export function saveCaseMarketSnapshot(
  caseId: string,
  snapshot: Pick<CaseMarketSnapshot, "steam_sell_price" | "yyyp_sell_price">,
): Promise<CaseMarketSnapshot> {
  return withDb(async (database) => {
    const exists = await get<{ found: number }>(database, "SELECT 1 AS found FROM cases WHERE id = ?", [
      caseId,
    ]);
    if (!exists) {
      throw new Error("配置不存在");
    }

    const updatedAt = nowIso();
    const normalizedSnapshot: CaseMarketSnapshot = {
      steam_sell_price: normalizeNullableNumber(snapshot.steam_sell_price),
      yyyp_sell_price: normalizeNullableNumber(snapshot.yyyp_sell_price),
      updated_at: updatedAt,
    };

    await run(
      database,
      `INSERT OR REPLACE INTO case_market_snapshots
        (case_id, steam_sell_price, yyyp_sell_price, updated_at)
       VALUES (?, ?, ?, ?)`,
      [
        caseId,
        normalizedSnapshot.steam_sell_price,
        normalizedSnapshot.yyyp_sell_price,
        normalizedSnapshot.updated_at,
      ],
    );

    return normalizedSnapshot;
  });
}

export function resetAllCooldowns() {
  return withDb(async (database) => {
    await run(
      database,
      "UPDATE case_state SET current_session_seconds = 0, in_cooldown = 0, remaining_days = 0",
    );
  });
}

export function resetCaseCooldown(caseId: string): Promise<boolean> {
  return withDb(async (database) => {
    const exists = await get<{ found: number }>(
      database,
      "SELECT 1 AS found FROM cases WHERE id = ?",
      [caseId],
    );
    if (!exists) {
      return false;
    }

    await ensureCaseState(database, caseId);
    await run(
      database,
      "UPDATE case_state SET current_session_seconds = 0, in_cooldown = 0, remaining_days = 0 WHERE case_id = ?",
      [caseId],
    );
    return true;
  });
}

export function getStartTime(): Promise<string> {
  return withDb(async (database) => {
    let startTime = await getMeta(database, "start_time");
    if (!startTime) {
      startTime = nowIso();
      await setMeta(database, "start_time", startTime);
    }

    return startTime;
  });
}

export function getCsqaqContainersSyncedAt(): Promise<string | null> {
  return withDb((database) => getMeta(database, "csqaq_containers_synced_at"));
}

export function saveCsqaqContainers(containers: CsqaqContainer[]) {
  return withDb((database) =>
    transaction(database, async () => {
      const timestamp = nowIso();

      await run(database, "DELETE FROM csqaq_containers");
      for (const container of containers) {
        await run(
          database,
          `INSERT OR REPLACE INTO csqaq_containers
            (id, img, name, comment, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            container.id,
            container.img ?? null,
            container.name,
            container.comment ?? null,
            container.created_at ?? null,
            timestamp,
          ],
        );
      }
      await setMeta(database, "csqaq_containers_synced_at", timestamp);
      return timestamp;
    }),
  );
}

export function getStoredCsqaqContainers(): Promise<CsqaqContainer[]> {
  return withDb(async (database) => {
    const rows = await all<{
      id: number;
      img: string | null;
      name: string;
      comment: string | null;
      created_at: string | null;
    }>(
      database,
      "SELECT id, img, name, comment, created_at FROM csqaq_containers ORDER BY id",
    );

    return rows.map((row) => ({
      id: row.id,
      img: row.img ?? undefined,
      name: row.name,
      comment: row.comment ?? undefined,
      created_at: row.created_at ?? undefined,
    }));
  });
}
