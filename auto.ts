/**
 * This module automatically configures OpenTelemetry instrumentation for Kysely
 * database operations using a default tracer. Simply import this module to enable
 * automatic tracing of all Kysely queries and transactions in your application.
 * 
 * @example
 * ```typescript
 * // Import this module to automatically enable tracing
 * import "@luca/kysely-otel/auto";
 * 
 * // Now all Kysely operations will be automatically traced
 * const result = await db.selectFrom("users").selectAll().execute();
 * ```
 * 
 * @module
 */

import { trace } from "@opentelemetry/api";
import denoJson from "./deno.json" with { type: "json" };
import { setupInstrumentation } from "./mod.ts";

const tracer = trace.getTracer("kysely", denoJson.version);

setupInstrumentation(tracer);
