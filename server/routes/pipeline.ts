import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { createConnector, getAvailableConnectorTypes } from "../connectors";
import type { ConnectorConfig, FetchResult } from "../connectors/types";
import { contextualizeData } from "../pipeline/contextualizer";
import { pipelineWs } from "../pipeline/websocket";

const pipelineRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

function toConnectorConfig(row: any): ConnectorConfig {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    authMethod: row.authMethod,
    credentials: row.credentialsEnc ? JSON.parse(row.credentialsEnc) : {}, // non-secret config; actual auth uses GOOGLE_APPLICATION_CREDENTIALS env var
    pollIntervalMin: row.pollIntervalMin ?? 15,
    enabled: !!row.enabled,
    config: row.config ? JSON.parse(row.config) : {},
    lastPolledAt: row.lastPolledAt,
  };
}

export function registerPipelineRoutes(app: Express) {
  // --- Data Source Configs ---

  app.get("/api/data-sources", (_req, res) => {
    const sources = storage.getDataSourceConfigs();
    res.json(sources);
  });

  app.get("/api/data-sources/types", (_req, res) => {
    res.json(getAvailableConnectorTypes());
  });

  app.get("/api/data-sources/:id", (req, res) => {
    const source = storage.getDataSourceConfig(parseInt(req.params.id as string));
    if (!source) return res.status(404).json({ error: "Data source not found" });
    res.json(source);
  });

  app.post("/api/data-sources", pipelineRateLimit, (req, res) => {
    const { type, name, authMethod, credentials, pollIntervalMin, enabled, config } = req.body;
    if (!type || !name) {
      return res.status(400).json({ error: "type and name are required" });
    }
    const source = storage.createDataSourceConfig({
      type,
      name,
      authMethod: authMethod || "service_account",
      credentialsEnc: credentials ? JSON.stringify(credentials) : null,
      pollIntervalMin: pollIntervalMin ?? 15,
      enabled: enabled !== undefined ? (enabled ? 1 : 0) : 1,
      config: config ? JSON.stringify(config) : null,
      lastPolledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    res.status(201).json(source);
  });

  app.patch("/api/data-sources/:id", pipelineRateLimit, (req, res) => {
    const id = parseInt(req.params.id as string);
    const existing = storage.getDataSourceConfig(id);
    if (!existing) return res.status(404).json({ error: "Data source not found" });

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.authMethod !== undefined) updates.authMethod = req.body.authMethod;
    if (req.body.credentials !== undefined) updates.credentialsEnc = JSON.stringify(req.body.credentials);
    if (req.body.pollIntervalMin !== undefined) updates.pollIntervalMin = req.body.pollIntervalMin;
    if (req.body.enabled !== undefined) updates.enabled = req.body.enabled ? 1 : 0;
    if (req.body.config !== undefined) updates.config = JSON.stringify(req.body.config);

    const updated = storage.updateDataSourceConfig(id, updates);
    res.json(updated);
  });

  app.delete("/api/data-sources/:id", pipelineRateLimit, (req, res) => {
    const id = parseInt(req.params.id as string);
    const deleted = storage.deleteDataSourceConfig(id);
    if (!deleted) return res.status(404).json({ error: "Data source not found" });
    res.json({ success: true });
  });

  // --- Connector Operations ---

  app.post("/api/data-sources/:id/test", pipelineRateLimit, async (req, res) => {
    const source = storage.getDataSourceConfig(parseInt(req.params.id as string));
    if (!source) return res.status(404).json({ error: "Data source not found" });

    try {
      const connector = createConnector(source.type as any);
      const config = toConnectorConfig(source);
      const result = await connector.validateAuth(config);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message });
    }
  });

  app.post("/api/data-sources/:id/discover", pipelineRateLimit, async (req, res) => {
    const source = storage.getDataSourceConfig(parseInt(req.params.id as string));
    if (!source) return res.status(404).json({ error: "Data source not found" });

    try {
      const connector = createConnector(source.type as any);
      const config = toConnectorConfig(source);
      const resources = await connector.discover(config);
      res.json(resources);
    } catch (err: any) {
      res.status(500).json({ error: `Discovery failed: ${err.message}` });
    }
  });

  app.post("/api/data-sources/:id/sync", pipelineRateLimit, async (req, res) => {
    const source = storage.getDataSourceConfig(parseInt(req.params.id as string));
    if (!source) return res.status(404).json({ error: "Data source not found" });

    const startTime = Date.now();
    try {
      const connector = createConnector(source.type as any);
      const config = toConnectorConfig(source);

      const externalId = req.body.externalId as string | undefined;
      let results: import("../connectors/types").FetchResult[];

      if (externalId) {
        results = [await connector.fetch(config, externalId)];
      } else {
        results = await connector.fetchAll(config);
      }

      const contextualize = req.body.contextualize !== false;
      const events = [];
      const records = [];

      for (const result of results) {
        const lastEvent = storage.getLastIngestionEvent(source.id, result.externalId);
        const unchanged = lastEvent?.contentHash === result.contentHash;

        const event = storage.createIngestionEvent({
          sourceConfigId: source.id,
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          contentHash: result.contentHash,
          status: unchanged ? "unchanged" : "success",
          errorMessage: null,
          rawContentSize: result.rawContent.length,
          fetchedAt: result.fetchedAt,
          processingMs: Date.now() - startTime,
        });
        events.push({ ...event, unchanged });

        if (!unchanged && contextualize) {
          try {
            const ctx = await contextualizeData(result, config);
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

            records.push(record);
          } catch (ctxErr: any) {
            console.error(`Contextualization failed for ${result.externalId}:`, ctxErr.message);
          }
        }
      }

      storage.updateDataSourceConfig(source.id, {
        lastPolledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const changed = events.filter((e) => !e.unchanged).length;
      const unchangedCount = events.filter((e) => e.unchanged).length;

      if (changed > 0) {
        pipelineWs.broadcast({
          type: "ingestion_complete",
          timestamp: new Date().toISOString(),
          data: {
            sourceId: source.id,
            sourceName: source.name,
            changed,
            contextualized: records.length,
          },
        });
      }

      res.json({
        success: true,
        total: events.length,
        changed,
        unchanged: unchangedCount,
        contextualized: records.length,
        events,
        records,
      });
    } catch (err: any) {
      storage.createIngestionEvent({
        sourceConfigId: source.id,
        externalId: req.body.externalId || "*",
        externalUrl: null,
        contentHash: null,
        status: "failed",
        errorMessage: err.message,
        rawContentSize: null,
        fetchedAt: new Date().toISOString(),
        processingMs: Date.now() - startTime,
      });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Ingestion Events ---

  app.get("/api/ingestion-events", (req, res) => {
    const sourceConfigId = req.query.sourceConfigId
      ? parseInt(req.query.sourceConfigId as string)
      : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const events = storage.getIngestionEvents(sourceConfigId, limit);
    res.json(events);
  });

  // --- Normalized Data Records (Data Lake) ---

  app.get("/api/data-records", (req, res) => {
    const filters: import("../storage").DataRecordFilters = {};
    if (req.query.contentType) filters.contentType = req.query.contentType as string;
    if (req.query.sourceConfigId) filters.sourceConfigId = parseInt(req.query.sourceConfigId as string);
    if (req.query.isLatest !== undefined) filters.isLatest = req.query.isLatest === "true";
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
    const records = storage.getNormalizedDataRecords(filters);
    res.json(records);
  });

  app.get("/api/data-records/:id", (req, res) => {
    const record = storage.getNormalizedDataRecord(parseInt(req.params.id as string));
    if (!record) return res.status(404).json({ error: "Data record not found" });
    const links = storage.getDataRecordBuLinks(record.id);
    res.json({ ...record, businessUnitLinks: links });
  });

  app.get("/api/business-units/:id/data-records", (req, res) => {
    const records = storage.getDataRecordsForBusinessUnit(parseInt(req.params.id as string));
    res.json(records);
  });

  app.post("/api/data-records/:id/link-bu", pipelineRateLimit, (req, res) => {
    const dataRecordId = parseInt(req.params.id as string);
    const { businessUnitId } = req.body;
    if (!businessUnitId) return res.status(400).json({ error: "businessUnitId required" });

    const link = storage.createDataRecordBuLink({
      dataRecordId,
      businessUnitId,
      linkConfidence: 100,
      linkMethod: "manual",
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(link);
  });

  app.delete("/api/data-records/:id/link-bu/:buId", pipelineRateLimit, (req, res) => {
    const deleted = storage.deleteDataRecordBuLink(
      parseInt(req.params.id as string),
      parseInt(req.params.buId as string),
    );
    if (!deleted) return res.status(404).json({ error: "Link not found" });
    res.json({ success: true });
  });

  // --- Change Tracking ---

  app.get("/api/changes/recent", (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const changes = storage.getRecentChanges(limit);
    res.json(changes);
  });

  // --- Pipeline Status ---

  app.get("/api/pipeline/status", async (_req, res) => {
    const sources = storage.getDataSourceConfigs();
    const enabledSources = sources.filter((s) => s.enabled);
    const recentEvents = storage.getIngestionEvents(undefined, 10);

    let runnerStatus = { running: false, lastCycleAt: null as string | null, cycleCount: 0 };
    if (process.env.PIPELINE_ENABLED === "true") {
      try {
        const { pipelineRunner } = await import("../pipeline/runner");
        runnerStatus = pipelineRunner.status;
      } catch { /* runner not loaded */ }
    }

    res.json({
      enabled: process.env.PIPELINE_ENABLED === "true",
      totalSources: sources.length,
      enabledSources: enabledSources.length,
      recentEvents: recentEvents.length,
      lastActivity: recentEvents[0]?.fetchedAt || null,
      runner: runnerStatus,
    });
  });

  // Manual trigger for a full pipeline cycle
  app.post("/api/pipeline/run-cycle", pipelineRateLimit, async (_req, res) => {
    try {
      const { pipelineRunner } = await import("../pipeline/runner");
      await pipelineRunner.runCycle();
      res.json({ success: true, status: pipelineRunner.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
