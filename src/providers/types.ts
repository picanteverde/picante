export interface ModelInfo {
  id: string;
  name?: string;
  description?: string;
  contextLength?: number;
  pricing?: { prompt?: number; completion?: number; currency?: string };
  provider: string;
}

export interface Provider {
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  listModels(apiKey?: string): Promise<ModelInfo[]>;
}
