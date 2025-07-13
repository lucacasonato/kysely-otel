# kysely-otel

OpenTelemetry instrumentation for Kysely SQL query builder.

## Features

- Automatic tracing of SQL queries and transactions
- Detailed span attributes including query text and row counts
- Error tracking with exception recording
- Support for all Kysely query types (SELECT, INSERT, UPDATE, DELETE, DDL
  operations)
- Zero-configuration auto-instrumentation option

## Usage

### Manual Setup

```typescript
import { trace } from "@opentelemetry/api";
import { setupInstrumentation } from "@luca/kysely-otel";

const tracer = trace.getTracer("kysely", "1.0.0");
setupInstrumentation(tracer);

// Now all Kysely queries will be automatically traced
```

### Auto-instrumentation

For zero-configuration setup, simply import the auto module:

```typescript
import "@luca/kysely-otel/auto";
```

This will automatically set up instrumentation using the package version as the
tracer version.

## Span Attributes

The instrumentation adds the following OpenTelemetry span attributes:

- `db.system.name`: Always set to "postgres"
- `db.query.text`: The SQL query text
- `db.response.returned_rows`: Number of rows returned (for successful queries)
- `db.response.status_code`: Database error code (for failed queries)

## Span Names

Spans are automatically named based on the query type:

- `SELECT FROM table_name`
- `INSERT INTO table_name`
- `UPDATE table_name`
- `DELETE FROM table_name`
- `TRANSACTION`
- `DDL Operation`
- `MERGE`
- `REFRESH MATERIALIZED VIEW`
- `RAW SQL`

## Requirements

- Kysely 0.28
- OpenTelemetry API 1.9+

## License

MIT
