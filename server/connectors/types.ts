import { createHash } from "crypto";

export type ConnectorType =
  | "bigquery"
  | "google_docs"
  | "google_sheets"
  | "google_drive"
  | "github"
  | "local_file";

export type AuthMethod = "service_account" | "api_token" | "oauth2" | "none";

export interface ConnectorConfig {
  id: number;
  type: ConnectorType;
  name: string;
  authMethod: AuthMethod;
  credentials: Record<string, string>;
  pollIntervalMin: number;
  enabled: boolean;
  config: Record<string, unknown>;
  lastPolledAt: string | null;
}

export interface FetchResult {
  sourceId: number;
  externalId: string;
  externalUrl: string;
  rawContent: string;
  rawFormat: "text" | "json" | "csv" | "html" | "markdown";
  contentHash: string;
  fetchedAt: string;
  metadata: Record<string, unknown>;
}

export interface DiscoveredResource {
  externalId: string;
  externalUrl: string;
  title: string;
  resourceType: string;
  lastModified: string | null;
  metadata: Record<string, unknown>;
}

export interface ChangeDetection {
  externalId: string;
  changed: boolean;
  lastModified: string | null;
  changeType: "created" | "modified" | "deleted";
}

export interface IConnector {
  readonly type: ConnectorType;

  validateAuth(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }>;

  discover(config: ConnectorConfig): Promise<DiscoveredResource[]>;

  fetch(config: ConnectorConfig, externalId: string): Promise<FetchResult>;

  fetchAll(config: ConnectorConfig): Promise<FetchResult[]>;

  checkForChanges(
    config: ConnectorConfig,
    lastCheckedAt: string,
  ): Promise<ChangeDetection[]>;
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}
