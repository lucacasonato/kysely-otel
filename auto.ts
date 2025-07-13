import { trace } from "@opentelemetry/api";
import denoJson from "./deno.json" with { type: "json" };
import { setupInstrumentation } from "./mod.ts";

const tracer = trace.getTracer("kysely", denoJson.version);

setupInstrumentation(tracer);
