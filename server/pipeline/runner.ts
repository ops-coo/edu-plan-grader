import { storage } from "../storage";
import { createConnector } from "../connectors";
import type { ConnectorConfig } from "../connectors/types";
import { contextualizeData } from "./contextualizer";
import { pipelineWs } from "./websocket";

function toConnectorConfig(row: any): ConnectorConfig {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    authMethod: row.authMethod,
    credentials: row.credentialsEnc ? JSON.parse(row.credentialsEnc) : {},
    pollIntervalMin: row.pollIntervalMin ?? 15,
    enabled: !!row.enabled,
    config: row.config ? JSON.parse(row.config) : {},
    lastPolledAt: row.lastPolledAt,
  };
}

export class PipelineRunner {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastCycleAt: string | null = null;
  private cycleCount = 0;

  get status() {
    return {
      running: this.running,
      lastCycleAt: this.lastCycleAt,
      cycleCount: this.cycleCount,
    };
  }

  start(intervalMs: number = 5 * 60 * 1000): void {
    if (this.intervalHandle) return;
    console.log(`[pipeline] Starting runner (interval: ${intervalMs / 1000}s)`);
    void this.runCycle().catch((err: any) => console.error("[pipeline] Cycle error:", err?.message ?? err));
    this.intervalHandle = setInterval(() => {
      void this.runCycle().catch((err: any) => console.error("[pipeline] Cycle error:", err?.message ?? err));
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log("[pipeline] Runner stopped");
    }
  }

  async runCycle(): Promise<void> {
    if (this.running) {
      console.log("[pipeline] Skipping cycle — previous cycle still running");
      return;
    }
    this.running = true;
    this.cycleCount++;
    const cycleStart = Date.now();

    try {
      const sources = storage.getEnabledDataSourceConfigs();
      if (sources.length === 0) {
        this.running = false;
        return;
      }

      for (const source of sources) {
        const config = toConnectorConfig(source);
        const now = Date.now();
        const lastPolled = config.lastPolledAt
          ? new Date(config.lastPolledAt).getTime()
          : 0;
        const intervalMs = (config.pollIntervalMin || 15) * 60 * 1000;

        if (now - lastPolled < intervalMs) continue;

        try {
          await this.processSource(source, config);
        } catch (err: any) {
          console.error(`[pipeline] Error processing ${source.name}:`, err.message);
          storage.createIngestionEvent({
            sourceConfigId: source.id,
            externalId: "*",
            externalUrl: null,
            contentHash: null,
            status: "failed",
            errorMessage: err.message,
            rawContentSize: null,
            fetchedAt: new Date().toISOString(),
            processingMs: Date.now() - now,
          });
        }
      }
    } finally {
      this.running = false;
      this.lastCycleAt = new Date().toISOString();
      console.log(`[pipeline] Cycle ${this.cycleCount} completed in ${Date.now() - cycleStart}ms`);
    }
  }

  private async processSource(source: any, config: ConnectorConfig): Promise<void> {
    const connector = createConnector(config.type);
    const lastCheckedAt = config.lastPolledAt || "1970-01-01T00:00:00Z";

    const changes = await connector.checkForChanges(config, lastCheckedAt);
    const changedItems = changes.filter((c) => c.changed);

    if (changedItems.length === 0) {
      storage.updateDataSourceConfig(source.id, {
        lastPolledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    console.log(`[pipeline] ${source.name}: ${changedItems.length} changed items`);

    for (const change of changedItems) {
      const startTime = Date.now();
      try {
        const result = await connector.fetch(config, change.externalId);
        const lastEvent = storage.getLastIngestionEvent(source.id, change.externalId);

        if (lastEvent?.contentHash === result.contentHash) {
          storage.createIngestionEvent({
            sourceConfigId: source.id,
            externalId: result.externalId,
            externalUrl: result.externalUrl,
            contentHash: result.contentHash,
            status: "unchanged",
            errorMessage: null,
            rawContentSize: result.rawContent.length,
            fetchedAt: result.fetchedAt,
            processingMs: Date.now() - startTime,
          });
          continue;
        }

        const event = storage.createIngestionEvent({
          sourceConfigId: source.id,
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          contentHash: result.contentHash,
          status: "success",
          errorMessage: null,
          rawContentSize: result.rawContent.length,
          fetchedAt: result.fetchedAt,
          processingMs: Date.now() - startTime,
        });

        try {
          const ctx = await contextualizeData(result, config);
          storage.runInTransaction(() => {
            storage.supersedeLatestRecord(source.id, result.externalId);
            const record = storage.createNormalizedDataRecord({
              ingestionEventId: event.id,
              sourceConfigId: source.id,
              externalId: result.externalId,
              externalUrl: result.externalUrl,
              canonicalTitle: ctx.canonicalTitle,
              contentType: ctx.contentType,
              summary: ctx.summary,
              rawContent: result.rawContent,
              normalizedContent: ctx.normalizedContent,
              structuredMetadata: JSON.stringify(ctx.structuredMetadata),
              dataQualityScore: ctx.dataQualityScore,
              contextConfidence: ctx.contextConfidence,
              tags: JSON.stringify(ctx.tags),
              quarter: ctx.structuredMetadata.quarter || null,
              isLatest: 1,
              createdAt: new Date().toISOString(),
              supersededAt: null,
            });
            for (const buId of ctx.relatedBusinessUnitIds) {
              storage.createDataRecordBuLink({
                dataRecordId: record.id,
                businessUnitId: buId,
                linkConfidence: ctx.contextConfidence,
                linkMethod: "ai_inferred",
                createdAt: new Date().toISOString(),
              });
            }
          });
        } catch (ctxErr: any) {
          console.error(`[pipeline] Contextualization failed for ${result.externalId}:`, ctxErr.message);
        }
      } catch (fetchErr: any) {
        storage.createIngestionEvent({
          sourceConfigId: source.id,
          externalId: change.externalId,
          externalUrl: null,
          contentHash: null,
          status: "failed",
          errorMessage: fetchErr.message,
          rawContentSize: null,
          fetchedAt: new Date().toISOString(),
          processingMs: Date.now() - startTime,
        });
      }
    }

    storage.updateDataSourceConfig(source.id, {
      lastPolledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (changedItems.length > 0) {
      pipelineWs.broadcast({
        type: "ingestion_complete",
        timestamp: new Date().toISOString(),
        data: {
          sourceId: source.id,
          sourceName: source.name,
          changed: changedItems.length,
        },
      });
    }
  }
}

export const pipelineRunner = new PipelineRunner();
