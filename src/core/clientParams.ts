export interface CircuitBreakerConfiguration {
  maxFailures: number;
  resetTimeout?: number;
}

type LogCallback = (error?: any, level?: string, message?: string, meta?: any) => void;

interface LogMethod {
  (message: string, callback: LogCallback): Logger;
  (message: string, meta: any, callback: LogCallback): Logger;
  (message: string, ...meta: any[]): Logger;
  (infoObject: object): Logger;
}

export interface Logger {
  log: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  error: LogMethod;
  warn: LogMethod;
}

export interface CollapsingConfiguration {
  window: number;
}

export interface ExternalCacheHostConfiguration {
  host?: string;
  port?: number;
  cluster?: boolean;
  timeout?: number;
  storage?: any;
}

export interface ExternalCacheStringConfiguration {
  connectionString: string;
  cluster?: boolean;
  timeout?: number;
  storage?: any;
}

export type ExternalCacheConfiguration = ExternalCacheHostConfiguration | ExternalCacheStringConfiguration;

export interface InMemoryCacheConfiguration {
  maxSize?: number;
}

export interface Stats {
  increment(metric: string, value?: number, sampleRate?: number): void;
  timing(metric: string, duration: number): void;
}

export interface ClientParams {
  name?: string;
  userAgent?: string;
  collapsing?: CollapsingConfiguration;
  stats?: Stats;
  logger?: Logger;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  circuitbreaker?: CircuitBreakerConfiguration;
  memoryCache?: InMemoryCacheConfiguration;
  externalCache?: ExternalCacheConfiguration;
  httpClient?: any;
}
