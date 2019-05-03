import * as httpTransport from '@bbc/http-transport';
import { events, maxAge, staleIfError } from '@bbc/http-transport-cache';
import * as rateLimit from '@bbc/http-transport-rate-limiter';
import * as collapsing from '@bbc/http-transport-request-collapse';
import * as stats from '@bbc/http-transport-statsd';
import * as toError from '@bbc/http-transport-to-error';
import * as request from 'request';
import * as memoryCache from '../caching/memory';
import { ClientParams, Stats } from '../core/clientParams';

type RequestClient = request.RequestAPI<request.Request, request.CoreOptions, request.RequiredUriUrl>;

const logger = httpTransport.logger;
const defaultRetries = 1;
const defaultDelay = 100;

type StatsEventsOpts = {
  client: Stats;
  namespace: string;
  statName: string;
  eventName: string;
};

export const defaultRequestOptions = Object.freeze({
  json: true,
  timeout: 2000,
  time: true,
  gzip: true,
  forever: true,
  proxy: undefined,
  agentOptions: {
    maxSockets: 1000
  }
});

function getRetries(params: ClientParams): number {
  return params.retries === undefined ? defaultRetries : params.retries;
}

function getRetryDelay(params: ClientParams): number {
  return params.retryDelay === undefined ? defaultDelay : params.retryDelay;
}

function configureMemoryCache(builder: any, params: ClientParams): void {
  const cache = memoryCache.createCache(params.memoryCache);
  const cacheOpts = {
    name: `${params.name}memory`,
    varyOn: params.varyOn
  };
  builder.use(maxAge(cache, cacheOpts));
  builder.use(staleIfError(cache, cacheOpts));

  configureStatsEvents({
    client: params.stats,
    namespace: params.name,
    statName: 'memory_cache',
    eventName: cacheOpts.name
  });
}

function configureStatsEvents(params: StatsEventsOpts): void {
  const {
    client,
    namespace,
    statName,
    eventName
  } = params;

  if (client) {
    events.on(`cache.${eventName}.hit`, () => {
      client.increment(`${namespace}.${statName}.hits`, 1, 0.05);
    });
    events.on(`cache.${eventName}.miss`, () => {
      client.increment(`${namespace}.${statName}.misses`, 1, 0.05);
    });
    events.on(`cache.${eventName}.error`, () => {
      client.increment(`${namespace}.${statName}.errors`);
    });
    events.on(`cache.${eventName}.timeout`, () => {
      client.increment(`${namespace}.${statName}.timeouts`);
    });
    events.on(`cache.${eventName}.stale`, () => {
      client.increment(`${namespace}.${statName}.stale`, 1, 0.05);
    });
    events.on(`cache.${eventName}.revalidate.error`, () => {
      client.increment(`${namespace}.${statName}.revalidate.error`, 1, 0.05);
    });
    events.on(`cache.${eventName}.revalidate`, () => {
      client.increment(`${namespace}.${statName}.revalidate`, 1, 0.05);
    });
  }
}

function configureExternalCache(builder: any, params: ClientParams): void {
  const cache = params.externalCache.cache;
  const cacheOpts: any = {
    name: params.name,
    varyOn: params.varyOn
  };

  if (params.externalCache.timeout) {
    cacheOpts.timeout = params.externalCache.timeout;
    cacheOpts.ignoreCacheErrors = true;
  }

  builder.use(maxAge(cache, cacheOpts));
  builder.use(staleIfError(cache, cacheOpts));

  configureStatsEvents({
    client: params.stats,
    namespace: params.name,
    statName: 'cache',
    eventName: cacheOpts.name
  });
}

function configureRequest(params: ClientParams): httpTransport.defaultTransport {
  if (params.httpClient) {
    return params.httpClient;
  }
  const defaults = Object.assign({}, defaultRequestOptions);
  return new httpTransport.defaultTransport(request.defaults(defaults));
}

function configureCollapsing(builder: any, params: ClientParams): void {
  builder.use(collapsing.middleware({
    eventName: params.name,
    collapsingWindow: params.collapsing.window
  }));

  if (params.stats) {
    collapsing.events.on(`collapsed-${params.name}`, () => {
      params.stats.increment(`${params.name}.collapsing.collapsed`);
    });
  }
}

export function configureClient(params: ClientParams): httpTransport.HttpTransportClient {
  const transport = configureRequest(params);
  const builder = httpTransport
    .createBuilder(transport)
    .retries(getRetries(params))
    .retryDelay(getRetryDelay(params))
    .use(toError());

  if (params.rateLimit && params.rateLimitInterval) { builder.use(rateLimit(params.rateLimit, params.rateLimitInterval)); }
  if (params.userAgent !== undefined) { builder.userAgent(params.userAgent); }
  if (params.collapsing) { configureCollapsing(builder, params); }
  if (params.memoryCache) { configureMemoryCache(builder, params); }
  if (params.externalCache) { configureExternalCache(builder, params); }
  if (params.logger) { builder.use(logger(params.logger)); }
  if (params.stats) { builder.use(stats(params.stats, params.name)); }

  return builder.createClient();
}
