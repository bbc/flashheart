# Flashheart

>  A fully-featured REST client built for ease-of-use and resilience

## Features

* [Circuit breaker](#circuit-breaker)
* [Caching](#caching)
* [Retries](#retries)
* [Rate Limiting](#ratelimiting)
* [Timeout](#timeout)
* [Logging](#logging)
* [Parses JSON responses](#json)
* [Understands HTTP errors](#errors)
* [StatsD integration](#stats)
* [Custom HTTP client](#custom-http-client)

### Circuit breaker

By default the client implements a circuit breaker using the [Levee](https://github.com/totherik/levee) library. It is configured to trip after 100 failures and resets after 10 seconds. This can be configured using the `circuitBreakerMaxFailures` and `circuitBreakerResetTimeout` properties.

For example to trip after 200 failures and try to reset after 30 seconds:

```js
 const restClient = require('flashheart');
 const StatsD = require('node-statsd');

 const client = restClient.createClient({
    name: 'my-client',
    circuitbreaker: {
      maxFailures: 200,
      resetTimeout: 30000
    }
  });
```

### Caching

If caching is enabled, the client will cache response with a `max-age` directive. You can specify the caching storage with an instance of [Catbox](https://github.com/hapijs/catbox) using the `cache` parameter.

```js
const Catbox = require('catbox').Client;
const Memory = require('catbox-memory');
const storage = new Catbox(new Memory());
const flashheart = require('flashheart')

const client = flashheart.createClient({
   name: 'my-client',
   externalCache: {
     cache: storage
   },
  // varyOn: [ 'accept-language' ] - optional, refer to https://github.com/bbc/http-transport-cache#cache-key-structure
});
```

The `staleIfError` directive is also supported. If a response has a `staleIfError` directive, the response will be cached for the duration of the `stale-if-error` directive as well as the `max-age` and will try to retrieve them in this order:

* `max-age` stored version fresh version
* `stale-if-error` stale version

### Retries

By default the client retries failed requests once, with a delay of 100 milliseconds between attempts. The number of times to retry and the delay between retries can be configured using the `retries` and `retryDelay` properties.

For example, to retry 10 times, with a delay of 500ms:

```js
 const restClient = require('flashheart');
 const StatsD = require('node-statsd');

 const client = restClient.createClient({
    name: 'my-client',
    retries: 10,
    retryDelay: 500
  });
```

Only request errors or server errors result in a retry; `4XX` errors are _not_ retried.

### Rate Limiting

The client has no rate limitation by default. You can specify how many requests are allowed to happen within a given interval - respectively with the `rateLimit` and `rateLimitInterval` properties.	

 ```js	
const restClient = require('flashheart');
const client = restClient.createClient({	
  rateLimit: 10,         // Allow a maxmimum of 10 requests…	
  rateLimitInterval: 6000,    // In an interval of 6 seconds (6000ms)	
});
```	

 *Note*: rate limiting is provided by [simple-rate-limiter](https://www.npmjs.com/package/simple-rate-limiter).	

### Timeout

The client has a default timeout of _2 seconds_. You can override this when creating a client by setting the `timeout` property.

```js
const flashheart = require('flashheart');

const client = flashheart.createClient({
  timeout: 50
});
```

### Logging

All requests can be logged at `info` level if you provide a logger that supports the standard logging API (like `console` or [Winston](https://github.com/flatiron/winston))

```js
const flashheart = require('flashheart');

const client = flashheart.createClient({
  logger: console
});
```

### JSON

The client assumes you're working with a JSON API by default. It uses the `json: true` option in request (default client) to send the `Accept: application/json` header and automatically parse the response into an object. If you need to call an API that returns plain text, XML, animated GIFs etc. then set the `json` flag to `false` in your request options.

### Errors

Any response with a status code greater than or equal to `400` results in an error. There's no need to manually check the status code of the response. The status code is exposed as `err.statusCode` and the headers are assigned to `err.headers`. 

### Stats

Metrics can be sent to [StatsD](https://github.com/etsy/statsd/) by providing an instance of the [node-statsd](https://github.com/sivy/node-statsd) client:

```js
const StatsD = require('node-statsd');
const stats = new StatsD();
const flashheart = require('flashheart');

const client = flashheart.createClient({
  stats: stats
});
```

The following metrics are sent from each client:

|Name|Type|Description|
|----|----|-----------|
|`{name}.requests`|Counter|Incremented every time a request is made|
|`{name}.responses.{code}`|Counter|Incremented every time a response is received|
|`{name}.request_errors`|Counter|Incremented every time a request fails (timeout, DNS lookup fails etc.)|
|`{name}.response_time`|Timer|Measures of the response time in milliseconds across all requests|
|`{name}.retries`|Counter|Incremented every time the request retries|
|`{name}.attempts`|Timer|Measures the number of attempts|
|`{name}.cache.hits`|Counter|Incremented for each cache hit|
|`{name}.cache.misses`|Counter|Incremented for each cache miss|
|`{name}.cache.errors`|Counter|Incremented whenever there's is a problem communicating with the cache|

The `{name}` variable comes from the `name` option you pass to `createClient`. It defaults to `http` if you don't name your client.


### Custom HTTP Client

By default, Flashheart uses [request](https://github.com/request/request) under the hood and configures it with a set of [default values](https://github.com/bbc/flashheart/blob/a69566f41717b906a50166a7bb60d823403ae1c3/src/httpTransport/configuration.ts#L24). You can however, configure and pass in your own instance of request (for example, if you need to use certificates). This can be done by setting `httpClient` property when creating Flashheart client. Please also note that in order for this to work, you need to use another layer of abstraction and pull in [@bbc/http-transport](https://github.com/bbc/http-transport/blob/63e394360c96d12cbe7278e8cde7b8aeca8dc489/index.js#L7).

```js
 const restClient = require('flashheart');
 const request = require('request');
 const httpTransport = require('@bbc/http-transport');

 const requestClient = request.defaults({
   json: true,
   timeout: 1000,
   time: true,
   gzip: true,
   forever: true,
   agentOptions: {
     maxSockets: 1000
   },
   strictSSL: true,
   cert: fs.readFileSync('./client.crt'),
   key: fs.readFileSync('./client.key'),
   ca: fs.readFileSync('./client.crt')
 });

 const RequestTransport = httpTransport.RequestTransport;
 const httpClient = new RequestTransport(requestClient);

 const client = restClient.createClient({
    name: 'my-client',
    httpClient
  });
```
