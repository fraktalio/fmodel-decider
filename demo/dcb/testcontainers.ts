/**
 * Testcontainers helper for PostgreSQL integration tests.
 *
 * Uses `@valkyr/testcontainers` (a Deno-native testcontainers library from JSR)
 * to manage PostgreSQL container lifecycle. Each test gets a fresh container
 * with the `dcb_schema.sql` schema pre-loaded — true slice isolation.
 *
 * Requires Docker daemon.
 */

import { PostgresTestContainer } from "@valkyr/testcontainers/postgres";
import { Client } from "@bartlomieju/postgres";
import * as path from "@std/path";

/** Return type for {@link startPostgresContainer}. */
export interface PostgresContainer {
  container: PostgresTestContainer;
  connectionString: string;
}

/**
 * Starts a PostgreSQL 17 container and loads `dcb_schema.sql` into it.
 *
 * @returns The container handle and a connection URI for `@bartlomieju/postgres`.
 */
export async function startPostgresContainer(): Promise<PostgresContainer> {
  const container = await PostgresTestContainer.start("postgres:17");

  // Create the database and load the DCB schema
  await container.create("fmodel");

  const schemaPath = path.resolve("dcb_schema.sql");
  const schemaSql = await Deno.readTextFile(schemaPath);

  // Execute the schema SQL via the built-in client
  const sql = container.client("fmodel");
  await sql.unsafe(schemaSql);
  await sql.end();

  const connectionString = container.url("fmodel");

  return { container, connectionString };
}

/**
 * Creates and connects a `@bartlomieju/postgres` Client from a connection string.
 */
export async function createPostgresClient(
  connectionString: string,
): Promise<Client> {
  const client = new Client(connectionString);
  await client.connect();
  return client;
}
