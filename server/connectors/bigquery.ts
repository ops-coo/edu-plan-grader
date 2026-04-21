import { BigQuery } from "@google-cloud/bigquery";
import type {
  IConnector,
  ConnectorConfig,
  FetchResult,
  DiscoveredResource,
  ChangeDetection,
} from "./types";
import { computeContentHash } from "./types";

export class BigQueryConnector implements IConnector {
  readonly type = "bigquery" as const;

  private getClient(config: ConnectorConfig): BigQuery {
    const opts: Record<string, unknown> = {};
    if (config.config.projectId) opts.projectId = config.config.projectId as string;
    if (config.credentials.keyFilename) opts.keyFilename = config.credentials.keyFilename;
    return new BigQuery(opts);
  }

  async validateAuth(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    try {
      const bq = this.getClient(config);
      const projectId = (config.config.projectId as string) || undefined;
      await bq.getDatasets({ projectId });
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  async discover(config: ConnectorConfig): Promise<DiscoveredResource[]> {
    const bq = this.getClient(config);
    const datasetId = config.config.datasetId as string | undefined;
    const projectId = (config.config.projectId as string) || undefined;

    if (datasetId) {
      const dataset = bq.dataset(datasetId);
      const [tables] = await dataset.getTables();
      return tables.map((t) => ({
        externalId: `${datasetId}.${t.id}`,
        externalUrl: `https://console.cloud.google.com/bigquery?project=${projectId}&d=${datasetId}&t=${t.id}`,
        title: t.id || "unknown",
        resourceType: t.metadata?.type === "VIEW" ? "view" : "table",
        lastModified: t.metadata?.lastModifiedTime
          ? new Date(Number(t.metadata.lastModifiedTime)).toISOString()
          : null,
        metadata: {
          rowCount: t.metadata?.numRows,
          sizeBytes: t.metadata?.numBytes,
          type: t.metadata?.type,
        },
      }));
    }

    const [datasets] = await bq.getDatasets({ projectId });
    const resources: DiscoveredResource[] = [];
    for (const ds of datasets) {
      resources.push({
        externalId: ds.id || "unknown",
        externalUrl: `https://console.cloud.google.com/bigquery?project=${projectId}&d=${ds.id}`,
        title: ds.id || "unknown",
        resourceType: "dataset",
        lastModified: null,
        metadata: {},
      });
    }
    return resources;
  }

  async fetch(config: ConnectorConfig, externalId: string): Promise<FetchResult> {
    const bq = this.getClient(config);
    const projectId = (config.config.projectId as string) || undefined;

    const [datasetId, tableId] = externalId.includes(".")
      ? externalId.split(".")
      : [config.config.datasetId as string, externalId];

    if (!datasetId || !tableId || !/^[a-zA-Z0-9_-]+$/.test(datasetId) || !/^[a-zA-Z0-9_-]+$/.test(tableId)) {
      throw new Error(`Invalid table reference: ${externalId}`);
    }
    if (projectId && !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    const fullTable = projectId
      ? `\`${projectId}.${datasetId}.${tableId}\``
      : `\`${datasetId}.${tableId}\``;
    const sql = `SELECT * FROM ${fullTable} LIMIT 500`;

    const [rows] = await bq.query({ query: sql });
    const content = JSON.stringify(rows, null, 2);

    return {
      sourceId: config.id,
      externalId,
      externalUrl: `bigquery://${projectId || "default"}/${externalId}`,
      rawContent: content,
      rawFormat: "json",
      contentHash: computeContentHash(content),
      fetchedAt: new Date().toISOString(),
      metadata: { rowCount: rows.length, query: sql },
    };
  }

  async fetchAll(config: ConnectorConfig): Promise<FetchResult[]> {
    const tables = config.config.tables as string[] | undefined;
    if (!tables || tables.length === 0) {
      const discovered = await this.discover(config);
      const tableResources = discovered.filter(
        (r) => r.resourceType === "table" || r.resourceType === "view",
      );
      const results: FetchResult[] = [];
      for (const t of tableResources) {
        results.push(await this.fetch(config, t.externalId));
      }
      return results;
    }
    const results: FetchResult[] = [];
    for (const tableId of tables) {
      results.push(await this.fetch(config, tableId));
    }
    return results;
  }

  async checkForChanges(
    config: ConnectorConfig,
    lastCheckedAt: string,
  ): Promise<ChangeDetection[]> {
    const bq = this.getClient(config);
    const datasetId = config.config.datasetId as string | undefined;
    if (!datasetId) return [];

    const dataset = bq.dataset(datasetId);
    const [tables] = await dataset.getTables();
    const lastCheckedMs = isNaN(Date.parse(lastCheckedAt)) ? 0 : new Date(lastCheckedAt).getTime();

    return tables.map((t) => {
      const modifiedMs = t.metadata?.lastModifiedTime
        ? Number(t.metadata.lastModifiedTime)
        : 0;
      return {
        externalId: `${datasetId}.${t.id}`,
        changed: modifiedMs > lastCheckedMs,
        lastModified: modifiedMs
          ? new Date(modifiedMs).toISOString()
          : null,
        changeType: "modified" as const,
      };
    });
  }
}
