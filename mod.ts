import {
  SpanKind,
  type SpanOptions,
  SpanStatusCode,
  type Tracer,
} from "@opentelemetry/api";
import {
  type CompiledQuery,
  DefaultQueryExecutor,
  type OperationNode,
  type QueryId,
  type QueryResult,
  TableNode,
  TransactionBuilder,
} from "kysely";

/**
 * Sets up OpenTelemetry instrumentation for Kysely database operations.
 * 
 * This function patches Kysely's TransactionBuilder and DefaultQueryExecutor
 * to automatically create spans for database transactions and queries, providing
 * distributed tracing capabilities for your database operations.
 * 
 * @param tracer - The OpenTelemetry tracer instance to use for creating spans
 * 
 * @example
 * ```typescript
 * import { trace } from "@opentelemetry/api";
 * import { setupInstrumentation } from "@luca/kysely-otel";
 * 
 * const tracer = trace.getTracer("my-app");
 * setupInstrumentation(tracer);
 * ```
 */
export function setupInstrumentation(tracer: Tracer) {
  const transactionBuilderExecute = TransactionBuilder.prototype.execute;
  TransactionBuilder.prototype.execute = function (cb) {
    const spanOptions = {
      kind: SpanKind.INTERNAL,
      attributes: { "db.system.name": "postgres" },
    } satisfies SpanOptions;
    return tracer.startActiveSpan("TRANSACTION", spanOptions, async (span) => {
      try {
        // deno-lint-ignore no-explicit-any
        const res = (await transactionBuilderExecute.call(this, cb)) as any;
        return res;
      } catch (err) {
        if (
          typeof err === "object" && err !== null && "code" in err &&
          typeof err.code === "string"
        ) {
          span.setAttribute("db.response.status_code", err.code);
        }
        if (Error.isError(err)) span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
      } finally {
        span.end();
      }
    });
  };

  const defaultQueryExecutorExecuteQuery =
    DefaultQueryExecutor.prototype.executeQuery;
  DefaultQueryExecutor.prototype.executeQuery = function (
    query: CompiledQuery<unknown>,
    id: QueryId,
  ) {
    const spanOptions = {
      kind: SpanKind.INTERNAL,
      attributes: {
        "db.system.name": "postgres",
        "db.query.text": query.sql,
      },
    } satisfies SpanOptions;
    return tracer.startActiveSpan(
      summarizeQuery(query),
      spanOptions,
      async (span) => {
        try {
          const res = await defaultQueryExecutorExecuteQuery.call(
            this,
            query,
            id,
          ) as QueryResult<never>;
          span.setAttribute("db.response.returned_rows", res.rows.length);
          return res;
        } catch (err) {
          if (
            typeof err === "object" && err !== null && "code" in err &&
            typeof err.code === "string"
          ) {
            span.setAttribute("db.response.status_code", err.code);
          }
          if (Error.isError(err)) {
            span.recordException(err);
          }
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  };
}

/**
 * Generates a human-readable summary of a Kysely compiled query for use in OpenTelemetry span names.
 * 
 * @param query - The compiled query object containing the query AST
 * @returns A string summary of the query operation (e.g., "SELECT FROM users", "INSERT INTO posts")
 * 
 * @internal
 */
function summarizeQuery({ query }: CompiledQuery<unknown>): string {
  let summary: string;
  switch (query.kind) {
    case "SelectQueryNode":
      if (query.from && query.from.froms.length > 0) {
        summary = `SELECT FROM ${getTableNames(query.from.froms).join(", ")}`;
      } else {
        summary = `SELECT`;
      }
      if (query.joins && query.joins.length > 0) {
        summary += ` JOIN ${getTableNames(query.joins).join(", ")}`;
      }
      break;
    case "InsertQueryNode":
      if (query.into) {
        summary = `INSERT INTO ${getTableName(query.into)}`;
      } else {
        summary = `INSERT`;
      }
      break;
    case "UpdateQueryNode":
      if (query.table && TableNode.is(query.table)) {
        summary = `UPDATE ${getTableName(query.table)}`;
      } else {
        summary = `UPDATE`;
      }
      if (query.joins && query.joins.length > 0) {
        summary += ` JOIN ${getTableNames(query.joins).join(", ")}`;
      }
      break;
    case "DeleteQueryNode":
      summary = `DELETE FROM ${getTableNames(query.from.froms).join(", ")}`;
      if (query.joins && query.joins.length > 0) {
        summary += ` JOIN ${getTableNames(query.joins).join(", ")}`;
      }
      break;
    case "CreateTableNode":
    case "AlterTableNode":
    case "DropTableNode":
    case "CreateIndexNode":
    case "DropIndexNode":
    case "CreateSchemaNode":
    case "DropSchemaNode":
    case "CreateTypeNode":
    case "DropTypeNode":
    case "CreateViewNode":
    case "DropViewNode":
      summary = "DDL Operation";
      break;
    case "MergeQueryNode":
      summary = `MERGE`;
      break;
    case "RefreshMaterializedViewNode":
      summary = `REFRESH MATERIALIZED VIEW`;
      if (query.name) {
        summary += ` ${query.name}`;
      }
      if (query.concurrently) {
        summary += " CONCURRENTLY";
      }
      break;
    default:
      summary = "RAW SQL";
      break;
  }
  return summary;
}

/**
 * Extracts table names from an array of operation nodes.
 * 
 * @param froms - Array of operation nodes that may contain table references
 * @returns Array of table names as strings, filtered to exclude empty values
 * 
 * @internal
 */
function getTableNames(
  froms: ReadonlyArray<OperationNode>,
): string[] {
  return froms
    .map((f) => (TableNode.is(f) ? getTableName(f) : ""))
    .filter(Boolean);
}

/**
 * Extracts the table name from a TableNode, including schema if present.
 * 
 * @param node - The TableNode containing table and optional schema information
 * @returns The table name as a string, formatted as "schema.table" if schema exists, otherwise just "table"
 * 
 * @internal
 */
function getTableName(node: TableNode): string {
  if (node.table.schema) {
    return `${node.table.schema.name}.${node.table.identifier.name}`;
  }
  return node.table.identifier.name;
}
