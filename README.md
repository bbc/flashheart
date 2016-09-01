# flashheart

<br/><p align="center"><img width="350" src="https://rawgit.com/bbc/flashheart/master/logo.png?a" alt="Flashheart"></p><br/>

[![Build Status](https://travis-ci.org/bbc/flashheart.svg?branch=master)](https://travis-ci.org/bbc/flashheart) [![Code Climate](https://codeclimate.com/github/bbc/flashheart/badges/gpa.svg)](https://codeclimate.com/github/bbc/flashheart) [![Test Coverage](https://codeclimate.com/github/bbc/flashheart/badges/coverage.svg)](https://codeclimate.com/github/bbc/flashheart/coverage)

> A fully-featured Node.js REST client built for ease-of-use and resilience

`flashheart` is [request](https://github.com/request/request) with batteries included. It provides everything you need to build HTTP-based services with confidence.

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
* [Shared Execution](#shared-execution)

## Usage

```js
const client = require('flashheart').createClient({
  name: 'my_service',
  logger: console
});

client.get('http://echo.jsontest.com/key/value/', (err, body) => {
  if (err) return console.error(err.message);

  console.log(body);
  // {key: "value"}
});
```

### JSON

The client assumes you're working with a JSON API by default. It uses the `json: true` option in request to send the `Accept: application/json` header and automatically parse the response into an object. If you need to call an API that returns plain text, XML, animated GIFs etc. then set the `json` flag to `false` in your request options.

### Errors

Unlike `request`, any response with a status code greater than or equal to `400` results in an error. There's no need to manually check the status code of the response. The status code is exposed as `err.statusCode` on the returned error object, and the body (if one exists) is assigned to `err.body`.

### Timeout

The client has a default timeout of _2 seconds_. You can override this when creating a client by setting the `timeout` property.

```js
const client = require('flashheart').createClient({
  timeout: 50
});
```

### Caching

The client will optionally cache any publicly cacheable response with a `max-age` directive. You can specify the caching storage with an instance of [Catbox](https://github.com/hapijs/catbox) using the `cache` parameter.

```js
const Catbox = require('catbox').Client;
const Memory = require('catbox-memory');
const storage = new Catbox(new Memory());
const client = require('flashheart').createClient({
  cache: storage
});
```

The cache varies on _all_ request options (and therefore, headers) by default. If you don't want to vary on a particular header, use the `doNotVary` option:

```js
const client = require('flashheart').createClient({
  cache: storage,
  doNotVary: ['Request-Id']
});
```

The cache behaviour can be enabled to act on stale-while-revalidate headers. When enabled this causes the cache to serve stale but refresh the cache entry in the background. It is enabled with the `swr` option:
```js
const client = require('flashheart').createClient({
  cache: storage,
  swr: true
});
```

### Logging

All requests can be logged at `info` level if you provide a logger that supports the standard logging API (like `console` or [Winston](https://github.com/flatiron/winston))

```js
const client = require('flashheart').createClient({
  logger: console
});
```

### Stats

Metrics can be sent to [StatsD](https://github.com/etsy/statsd/) by providing an instance of the [node-statsd](https://github.com/sivy/node-statsd) client:

```js
const StatsD = require('node-statsd');
const stats = new StatsD();

const client = require('flashheart').createClient({
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
|`{name}.cache.hits`|Counter|Incremented for each cache hit|
|`{name}.cache.misses`|Counter|Incremented for each cache miss|
|`{name}.cache.errors`|Counter|Incremented whenever there's is a problem communicating with the cache|

The `{name}` variable comes from the `name` option you pass to `createClient`. It defaults to `http` if you don't name your client.

You can also add the `name` option on a per-request basis which will include the request name in the metric. For example: `api.feed.cache.hits`.

### Retries

By default the client retries failed requests once, with a delay of 100 milliseconds between attempts. The number of times to retry and the delay between retries can be configured using the `retries` and `retryTimeout` properties.

For example, to retry 10 times, with a delay of 500ms:

```js
const client = require('flashheart').createClient({
  retries: 10,
  retryTimeout: 500
});
```

Default retries can be overridden using method options:
```js
client.get(url, {
  retries: 5,
  retryTimeout: 250
}, done);
```

Only request errors or server errors result in a retry; `4XX` errors are _not_ retried.

### Circuit breaker

By default the client implements a circuit breaker using the [Levee](https://github.com/totherik/levee) library. It is configured to trip after 100 failures and resets after 10 seconds. This can be configured using the `circuitBreakerMaxFailures` and `circuitBreakerResetTimeout` properties.

For example to trip after 200 failures and try to reset after 30 seconds:

```js
const client = require('flashheart').createClient({
  circuitBreakerMaxFailures: 200,
  circuitBreakerResetTimeout: 30000
});
```
### Shared Execution

The client can be configured to share execution of HTTP GET requests, protecting downstream services from the thundering herd. It can be enabled/disabled by providing a boolean value for the `sharedExecution` property. By default this is disabled.

For example to enable shared execution:

```js
const client = require('flashheart').createClient({
    sharedExecution: true
});
```

### Advanced configuration

The client uses [request](https://github.com/request/request) to make HTTP requests. You can override the default request instance using the `request` parameter:

```js
const request = require('request').defaults({
  json: false,
  headers: {
    'X-Api-Key': 'foo'
  }
});

const client = require('flashheart').createClient({
  request: request
});
```

Alternatively, you can override or append to the default `request` options.

```js
const client = require('flashheart').createClient({
  defaults: {
    json: false,
    headers: {
      'X-Api-Key': 'foo'
    }
  }
});
```

#### Usage with client certificates

The `request` option can also be used to pass a pre-configured request client for HTTPS client certificate authentication:

```js
const fs = require('fs');
const request = require('request').defaults({
  pfx: fs.readFileSync('/path/to/my/cert.p12'),
  passphrase: 'password',
  strictSSL: false
});

const client = require('flashheart').createClient({
  request: request
});
```

## API

#### Callback return values

All of the client methods (`.get`, `.put` etc.) return three arguments to their callbacks; `err`, `body` and `res`:

```js
client.get(url, (err, body, res) => {
  // `err` is an optional error
  // `body` is the parsed JSON response body
  // `res` is an object containing information about the response
  //   `res.headers` is an object containing the response headers
  //   `res.statusCode` is the status code
  //   `res.elapsedTime` is the response time in milliseconds
});
```

### `.createClient`

Creates a new client.

#### Parameters

* `opts` - An options object

#### Options

* `name` - _optional_ - A name to be used for logging and stats (_default `http`_)
* `cache` - _optional_ - A [Catbox](https://github.com/hapijs/catbox) instance to use for caching
* `timeout` - _optional_ - A timeout in milliseconds (_default 2000_)
* `retries` - _optional_ - Number of times to retry failed requests (_default 3_)
* `retryTimeout` - _optional_ - Time to wait between retries in milliseconds (_default 100_)
* `circuitBreakerMaxFailures` - _optional_ - The number of failures required to trip the circuit breaker (_default 100_)
* `circuitBreakerResetTimeout` - _optional_ - Time in milliseconds to wait before the circuit breaker resets after opening (_default 10000_)
* `userAgent` - _optional_ - A custom user agent for the client (_default flashheart/VERSION_)
* `doNotVary` - _optional_ - An array of headers to ignore when creating cache keys (_default_ `[]`)
* `defaults` - _optional_ - A [`request`](https://github.com/request/request) options object to append or override existing default options
* `request` - _optional_ - A pre-configured instance of [`request`](https://github.com/request/request)

### `client.get`

#### Parameters

* `url` - The URL to be requested
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function called with the [callback return values](https://github.com/bbc/flashheart#callback-return-values)

### `client.put`

#### Parameters

* `url` - The URL to be requested
* `body` - A JavaScript object to be used as the request body
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function called with the [callback return values](https://github.com/bbc/flashheart#callback-return-values)

### `client.post`

#### Parameters

* `url` - The URL to be requested
* `body` - A JavaScript object to be used as the request body
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function called with the [callback return values](https://github.com/bbc/flashheart#callback-return-values)

### `client.patch`

#### Parameters

* `url` - The URL to be requested
* `body` - A JavaScript object to be used as the request body
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function called with the [callback return values](https://github.com/bbc/flashheart#callback-return-values)

### `client.delete`

#### Parameters

* `url` - The URL to be requested
* `opts` - _optional_ - A set of options. All of the [request options](https://github.com/request/request#requestoptions-callback) are supported
* `callback` - A function called with the [callback return values](https://github.com/bbc/flashheart#callback-return-values)

## Contributing

* If you're unsure if a feature would make a good addition, you can always [create an issue](https://github.com/bbc/flashheart/issues/new) first.
* We aim for 100% test coverage. Please write tests for any new functionality or changes.
* Make sure your code meets our linting standards. Run `npm run lint` to check your code.
* Maintain the existing coding style. There are some settings in `.jsbeautifyrc` to help.

## Why Flashheart?

[Lord Flashheart](http://blackadder.wikia.com/wiki/Lord_Flashheart) is [Blackadder](https://en.wikipedia.org/wiki/Blackadder)'s trusted friend, and a massive show-off.

[![Flashheart](http://img.youtube.com/vi/aKfbSHW9uGA/0.jpg)](http://www.youtube.com/watch?v=aKfbSHW9uGA)
