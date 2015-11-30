# flashheart

> A fully-featured Node.js REST client built for ease-of-use and resilience

`flashheart` is built using [request](https://github.com/request/request), but adds all the features you need to build HTTP-based services with confidence.

## Installation

```
npm install --save flashheart
```

## Features

* [Parses JSON responses](#json)
* [Understands HTTP errors](#errors)
* [Timeout](#timeout)
* [Caching](#caching)
* [Logging](#logging)
* [StatsD integration](#stats)
* [Retries](#retries)
* [Circuit breaker](#circuit-breaker)

## Usage

```js
var client = require('flashheart').createClient({
  name: 'my_service',
  logger: console
});

client.get('http://echo.jsontest.com/key/value/', function (err, body) {
  if (err) throw err;

  console.log(body);
  // {key: "value"}
});
```

### JSON

The client assumes you're working with a JSON API by default. It uses the `json: true` option in request to send the `Accept: application/json` header and automatically parse the response into an object. If you need to call an API that returns plain text, XML, animated GIFs etc. then set the `json` flag to `false` in your request options.

### Errors

Unlike `request`, any response with a status code greater than or equal to `400` results in an error. There's no need to manually check the status code of the response. The status code is exposed as `err.statusCode` on the returned error object, and the body (if one exists) is set as `err.body`.

### Timeout

The client has a default timeout of _2000 milliseconds_. You can override this when creating a client by setting the `timeout` property in the client options or configuring your own request instance (see [Advanced configuration](#advanced-confiugration))

```js
var client = require('flashheart').createClient({
  timeout: 50
});
```

### Caching

The client will optionally cache any publicly cacheable response with a `max-age` directive. You can specify the caching storage with an instance of [Catbox](https://github.com/hapijs/catbox) using the `cache` parameter.

```js
var storage = new Catbox(new Memory());
var client = require('flashheart').createClient({
  cache: storage
});
```

The cache varies on all request options (and therefore, headers) by default. If you don't want to vary on a particular header, you can use the `doNotVary` option:

```js
var client = require('@ibl/flashheart').createClient({
  cache: storage,
  doNotVary: ['Request-Id']
});
```

### Logging

All requests can be logged at `info` level if you provide a logger that supports the standard logging API (like `console` or [Winston](https://github.com/flatiron/winston))

```js
var client = require('flashheart').createClient({
  logger: console
});
```

### Stats

Metrics can be sent to [StatsD](https://github.com/etsy/statsd/) by providing an instance of the [node-statsd](https://github.com/sivy/node-statsd) client:

```js
var StatsD = require('node-statsd');
var stats = new StatsD();

var client = require('flashheart').createClient({
  stats: stats
});
```

The following metrics are sent from each client:

|Name|Type|Description|
|----|----|-----------|
|`{name}.requests`|Counter|Incremented every time a request is made|
|`{name}.responses.{code}`|Counter|Incremented every time a response is received|
|`{name}.request_errors`|Counter|Incremented every time a request fails (times out, DNS lookup fails etc.)|
|`{name}.response_time`|Timer|Measures of the response time in milliseconds across all requests|
|`{name}.cache.hits`|Counter|Incremented for each cache hit|
|`{name}.cache.misses`|Counter|Incremented for each cache miss|
|`{name}.cache.errors`|Counter|Incremented whenever there's is a problem communicating with the cache|

The `{name}` variable comes from the `name` option you pass to `createClient`. It defaults to `http` if you don't name your client.

You can also add the `name` option on a per-request basis which will include the request name in the metric. For example: `api.feed.cache.hits`.

### Retries

By default the client retries failed requests once, with a delay of 100 milliseconds between attempts. The number of times to retry and the delay between retries can be configured using the `retries` and `retryTimeout` properties.

For example, to retry 10 times, with a delay of 500ms:

```js
var client = require('flashheart').createClient({
  retries: 10,
  retryTimeout: 500
});
```

Only request errors or server errors result in a retry; `4XX` errors are _not_ retried.

### Circuit breaker

By default the client implements a circuit breaker using the [Levee](https://github.com/totherik/levee) library. It is configured to trip after 100 failures, trying to reset every 10 seconds. This can be configured using the `circuitBreakerMaxFailures` and `circuitBreakerResetTimeout` properties.

For example to trip after 200 failures and try to reset after 30 seconds:

```js
var client = require('flashheart').createClient({
  circuitBreakerMaxFailures: 200,
  circuitBreakerResetTimeout: 30000
});
```

### Advanced configuration

The client uses [request](https://github.com/request/request) to make HTTP requests. You can override the default request instance using the `request` parameter:

```js
var customRequest = require('request').defaults({
  json: false,
  timeout: 5000,
  headers: {
    'X-Api-Key': 'foo'
  }
});

var client = require('flashheart').createClient({
  request: customRequest
});
```

## API

### `.createClient`

Creates a new client.

#### Parameters

* `opts` - An options object

#### Options

* `name` - _optional_ - A name to be used in stats metrics
* `cache` - _optional_ - A [Catbox](https://github.com/hapijs/catbox) instance to use for caching.
* `retries` - _optional_ - Number of times to retry failed requests (_default 3_)
* `retryTimeout` - _optional_ - Time to wait between retries in milliseconds (_default 100_)
* `circuitBreakerMaxFailures` - _optional_ - The number of failures required to trip the circuit breaker (_default 100_)
* `circuitBreakerResetTimeout` - _optional_ - Time to in milliseconds to wait before the circuit breaker resets after opening (_default 10000_)
* `userAgent` - _optional_ - Custom user agent for this client (_default flashheart/VERSION_)
* `doNotVary` - _optional_ - An array of headers to ignore when creating cache keys (_default_ `[]`)
* `request` - _optional_ - A pre-configured instance of [`request`](https://github.com/request/request)

### `client.get`

#### Parameters

* `url` - The URL to be requested
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function that is called with an error object and the response body as a JavaScript object

### `client.put`

#### Parameters

* `url` - The URL to be requested
* `body` - A JavaScript object to be used as the request body
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function that is called with an error object and the response body as a JavaScript object

### `client.post`

#### Parameters

* `url` - The URL to be requested
* `body` - A JavaScript object to be used as the request body
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function that is called with an error object and the response body as a JavaScript object

### `client.delete`

#### Parameters

* `url` - The URL to be requested
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function that is called with an error object and the response body as a JavaScript object

## Contributing

* If you're unsure if a feature would make a good addition, you can always [create an issue](https://github.com/bbc/flashheart/issues/new) first
* We aim for 100% test coverage. Please write tests for any new functionality or changes
* Make sure your code meets our linting standards. Run `npm run lint` to check your code
* Mainting the existing coding style. There are some settings in `.jsbeautifyrc` to help
