import "server-only";
import type { DatabaseState } from "../types";
import { FileRepository } from "../db/file-repository";
import { PostgresRepository } from "../db/postgres-repository";
import { createDemoState } from "./seed";
import { demoDirectory, guardDemoContext, isDemoMode } from "./demo";
import { ApiError } from "./http";
export { isDemoMode } from "./demo";

let postgresRepository: PostgresRepository | undefined;
async function repository() {
  if (isDemoMode()) { await guardDemoContext(); return new FileRepository(demoDirectory(), createDemoState); }
  if (!process.env.DATABASE_URL) throw new ApiError(503, "PostgreSQL is not configured");
  postgresRepository ??= new PostgresRepository(process.env.DATABASE_URL); return postgresRepository;
}
export async function readState(): Promise<DatabaseState> { return (await repository()).read(); }
export async function mutateState<T>(fn: (state: DatabaseState) => T | Promise<T>): Promise<T> { return (await repository()).mutate(fn); }
