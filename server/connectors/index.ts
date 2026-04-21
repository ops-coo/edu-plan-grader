import type { ConnectorType, IConnector } from "./types";
import { BigQueryConnector } from "./bigquery";
import { GoogleSheetsConnector } from "./google-sheets";
import { GoogleDocsConnector } from "./google-docs";

const connectors: Record<string, IConnector> = {
  bigquery: new BigQueryConnector(),
  google_sheets: new GoogleSheetsConnector(),
  google_docs: new GoogleDocsConnector(),
};

export function createConnector(type: ConnectorType): IConnector {
  const connector = connectors[type];
  if (!connector) {
    throw new Error(`Unknown connector type: ${type}. Available: ${Object.keys(connectors).join(", ")}`);
  }
  return connector;
}

export function getAvailableConnectorTypes(): ConnectorType[] {
  return Object.keys(connectors) as ConnectorType[];
}
