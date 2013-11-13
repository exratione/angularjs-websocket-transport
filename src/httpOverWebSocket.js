/*global
    angular: false,
    primus: false
*/
/**
 * @fileOverview
 * A provider and service that substitutes the standard behavior of the $http
 * service with communication over WebSockets.
 *
 * myModule = angular.module(['ngRoute']);
 * myModule.provider('httpOverWebSocket', angular.httpOverWebSocket.Provider);
 * myModule.provider('httpOverWebSocketTransport', angular.httpOverWebSocket.TransportProvider);
 *
 * myModule.config([
 *   'httpOverWebSocketProvider',
 *   'httpOverWebSocketTransportProvider',
 *   function (httpOverWebSocketProvider, httpOverWebSocketTransportProvider) {
 *     httpOverWebSocketTransportProvider.configure({
 *       transport: 'primus',
 *       options: {
 *         // Request timeout in milliseconds. Not the same as the various
 *         // timeouts associated with Primus: this is how long to wait for a
 *         // response to a specific request before rejecting the associated
 *         // promise.
 *         timeout: 10000,
 *         // Delay in milliseconds between timeout checks.
 *         timeoutCheckInterval: 100,
 *         // Already connected primus instance.
 *         instance: new Primus('/', {
 *           // Default options for the Primus client.
 *         })
 *       }
 *     });
 *
 *     httpOverWebSocketProvider.configure({
 *       // Don't exclude any URLs.
 *       exclude: [],
 *       // Requests with URLs that match this regular expression are sent via
 *       // WebSocket.
 *       include: [/^\/restOverWebSocket/]
 *     });
 *   }
 * ]);
 *
 * Then include the service 'httpOverWebSocket' in place of $http. e.g.:
 *
 * function myService($http) {
 *   // ...
 * };
 * myModule.service('myService', [
 *  'httpOverWebSocket',
 *  myService
 * ]);
 */

(function () {
  'use strict';

  /* -------------------------------------------------------------------------
  Definitions and Utilities.
  ------------------------------------------------------------------------- */

  // Add a prototypical inheritance function. Note that this will need es5-sham
  // in older browsers to provide Object.create().
  function inherits(ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false
      }
    });
  }

  /* -------------------------------------------------------------------------
  Transport superclass.
  ------------------------------------------------------------------------- */

  /**
   * Superclass for Transport implementations, defining the behavior of how
   * data gets from client to server and vice versa.
   *
   * @param {object} config
   * @param {object} $q
   * @param {object} $interval
   */
  function Transport (config, $cacheFactory, $q, $interval) {
    this.config = config || {};

    // Set up various defaults.
    this.requests = {};
    this.$q = $q;
    this.defaultCache = $cacheFactory('httpOverWebSocketTransport');

    // Start the timeout checks running.
    var self = this;
    // Make sure that this has a value.
    this.config.timeout = this.config.timeout || 0;
    this.config.timeoutCheckInterval = this.config.timeoutCheckInterval || 100;
    // Continue indefinitely and don't run digests on each check.
    var repeatCount = 0;
    var invokeApply = false;
    this.timeoutCheckPromise = $interval(function () {
      self.runTimeoutCheck();
    }, this.config.timeoutCheckInterval, repeatCount, invokeApply);
  }

  /**
   * Send a message to the server.
   *
   * @param {object} requestConfig
   *   The request config object normally passed in to $http(requestConfig).
   * @return {object}
   *   A promise that resolves to the response from the server.
   */
  Transport.prototype.send = function (requestConfig) {
    var self = this;
    var requestId;
    var promise;

    /**
     * Helper function to create the deferred for the new request. We don't
     * have to do this if an existing cachable request is running - we can
     * return the promise associated with that deferred instead.
     *
     * @return {string}
     *   The UUID of the new request.
     */
    function createDeferred() {
      var id = self.generateUuid();
      self.requests[id] = {
        deferred: self.$q.defer(),
        requestConfig: requestConfig,
      };

      // Manage timeout.
      var timeout = self.config.timeout;
      if (typeof requestConfig.timeout === 'number') {
        timeout = requestConfig.timeout;
      }
      if (timeout > 0) {
        self.requests[id].timeoutAfter = Date.now() + timeout;
      }

      // Add success and error functions to the promise - this is a straight
      // clone from AngularJS code.
      self.requests[id].deferred.promise.success = function(fn) {
        this.then(function(response) {
          fn(response.data, response.status, response.headers, requestConfig);
        });
        return this;
      };

      self.requests[id].deferred.promise.error = function(fn) {
        this.then(null, function(response) {
          fn(response.data, response.status, response.headers, requestConfig);
        });
        return this;
      };
      return id;
    }

    /**
     * A helper function that adds cache update functionality to a promise on
     * resolution or rejection.
     *
     * @param {object} promiseToUpdate
     */
    function setPromiseToUpdateCacheOnResolution(promiseToUpdate, cache, url) {
      promiseToUpdate.then(function (response) {
        cache.put(url, angular.copy(response));
      }, function () {
        // On failure we want to clear the cache for this URL. There will be a
        // promise there as a placeholder.
        cache.remove(url);
      });
    }

    // Is this a potentially cachable request? If so then work some magic. This
    // follows the same basic logic as caching in the $ng.http service.
    if (requestConfig.cache && requestConfig.method === 'GET') {
      // Determine which cache we are using, the default, or one passed in by
      // the user. The requestConfig.cache property can be either a cache
      // instance or a boolean.
      var cache = this.defaultCache;
      if (typeof requestConfig.cache === 'object') {
        cache = requestConfig.cache;
      }

      var response = cache.get(requestConfig.url);
      // No cached response? Then send the request and cache the promise.
      if (!response) {
        requestId = createDeferred();
        promise = this.requests[requestId].deferred.promise;
        setPromiseToUpdateCacheOnResolution(promise, cache, requestConfig.url);
        cache.put(requestConfig.url, promise);
        this.transmit(requestId, requestConfig);
        return promise;
      }
      // If a request is in progress then there is a promise cached. Just return
      // the promise - multiple listeners can be added by different lines of
      // execution, and all will just work when it resolves or rejects.
      else if (response.then) {
        return response;
      }
      // Otherwise what is cached is the response object, which we can just
      // copy, update with a new ID, and apply immediately to a freshly-created
      // promise.
      else {
        requestId = createDeferred();
        promise = this.requests[requestId].deferred.promise;
        response = angular.copy(response);
        response.id = requestId;
        this.resolveResponse(response);
        return promise;
      }
    // No caching: just create a local record and deferred, send the request,
    // and return the promise. Nice and simple.
    } else {
      requestId = createDeferred();
      promise = this.requests[requestId].deferred.promise;
      this.transmit(requestId, requestConfig);
      return promise;
    }
  };

  /**
   * Do the work of sending a request via WebSocket.
   *
   * This should be implemented by child classes.
   *
   * @param {string} id
   *   UUID for this request.
   * @param {object} requestConfig
   *   Data to be sent.
   */
  Transport.prototype.transmit = function (id, requestConfig) {
    throw new Error('Not implemented.');
  };

  /**
   * Create a UUID.
   *
   * @return {string}
   */
  Transport.prototype.generateUuid = function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  };

  /**
   * Does this HTTP status indicate success.?
   *
   * @param {number} status
   *   HTTP status code.
   * @return {boolean}
   *   True if a success status code.
   */
  Transport.prototype.isSuccessStatus = function (status) {
    return 200 <= status && status < 300;
  };

  /**
   * Create something that looks like the $http response provided by AngularJS.
   *
   * @param {string} id
   *   The UUID of this request.
   * @param {number} status
   *   HTTP status code. Defaults to 200 if something other than a number is
   *   passed in.
   * @param {object} data
   *   Response data.
   * @param {object} requestConfig
   *   Request configuration passed in.
   * @return {object}
   */
  Transport.prototype.createHttpResponse = function (id, status, data) {
    data = angular.copy(data);
    if (typeof status !== 'number') {
      status = 200;
    }
    return {
      id: id,
      data: data,
      status: status,
      headers: {},
      config: this.requests[id].requestConfig
    };
  };

  /**
   * Create something that looks like the $http response provided by AngularJS.
   *
   * @param {string} id
   *   The UUID of this request.
   * @param {string} error
   *   Error provided.
   * @return {object}
   */
  Transport.prototype.createHttpTimeoutResponse = function (id, error) {
    return this.createHttpResponse(id, 0, error);
  };

  /**
   * Either resolve or reject the deferred based on the response. The format is:
   *
   * {
   *   // This UUID of this request.
   *   id: ''
   *   // Response data.
   *   data: {},
   *   // HTTP status.
   *   status: 200
   *   headers: {},
   *   // Original request config object.
   *   config: {}
   * }
   *
   * Also remove the data for this request.
   *
   * @param {object} response
   */
  Transport.prototype.resolveResponse = function (response) {
    // Make sure we drop the stored information on this request. It's no longer
    // needed.
    var deferred = this.requests[response.id].deferred;
    delete this.requests[response.id];
    if (this.isSuccessStatus(response.status)) {
      deferred.resolve(response);
    } else {
      deferred.reject(response);
    }
  };

  /**
   * Run through pending RPCs and terminate those that have timed out.
   */
  Transport.prototype.runTimeoutCheck = function () {
    var now = Date.now();
    for (var id in this.requests) {
      if (this.requests[id].timeoutAfter && this.requests[id].timeoutAfter < now) {
        this.resolveResponse(this.createHttpTimeoutResponse(id, 'Timed out.'));
      }
    }
  };

  /* -------------------------------------------------------------------------
  Primus Transport class.
  ------------------------------------------------------------------------- */

  /**
   * A Transport instance that uses the Primus WebSocket abstraction layer. See:
   *
   * https://github.com/primus/primus
   *
   * @param {object} config
   * @param {object} $q
   */
  function PrimusTransport (config, $cacheFactory, $q, $interval) {
    PrimusTransport.super_.apply(this, arguments);
    var self = this;
    var ID = angular.httpOverWebSocket.ID;
    var STATUS = angular.httpOverWebSocket.STATUS;

    // Either store or create the primus connection.
    if (this.config.instance) {
      this.primus = this.config.instance;
    } else {
      this.primus = primus(this.config.url, this.config.options);
    }

    // Set up to receive messages. These must come back with a matching ID
    // property to be considered. Note that because we are probably running
    // with an underlying transport layer that won't segment our messages off
    // into their own space, we are expecting to see all messages that arrive,
    // not just those involved with httpOverWebSocket.
    this.primus.on('data', function (data) {
      // Skip if not an httpOverWebSocket message.
      if (typeof data !== 'object' || !data[ID]) {
        return;
      }

      // Extract the ID and status, since we don't want to return that with the
      // data.
      var id = data[ID];
      var status = data[STATUS] || 200;
      delete data[ID];
      delete data[STATUS];

      if (!self.requests[id]) {
        // Throw and let Angular handle the error.
        throw new Error('httpOverWebSocketTransport: response has ID ' + id + ' but no matching request found.');
      }

      // Send back something that looks like a $http response.
      self.resolveResponse(self.createHttpResponse(id, status, data));
    });
  }
  inherits(PrimusTransport, Transport);

  /**
   * @see Transport#transmit
   */
  PrimusTransport.prototype.transmit = function (id, requestConfig) {
    var ID = angular.httpOverWebSocket.ID;
    // Get rid of items we don't want to transmit, but retain the original
    // requestConfig intact.
    requestConfig = angular.copy(requestConfig);
    delete requestConfig.cache;

    // Use the existence of an ID property to determine that this is a message
    // associated with httpOverWebSocket.
    requestConfig[ID] = id;
    this.primus.write(requestConfig);
  };

  /* -------------------------------------------------------------------------
  Provider: angular.httpOverWebSocket.TransportProvider
  ------------------------------------------------------------------------- */

  /**
   * angular.httpOverWebSocket.TransportProvider
   *
   * Provides the underlying transport layer.
   */
  var httpOverWebSocketTransportProvider = function httpOverWebSocketTransportProvider() {

    var config = {
      transport: 'primus',
      // Options to pass to the transport.
      options: {
        // Request timeout in milliseconds. Not the same as the various timeouts
        // associated with Primus: this is how long to wait for a response to a
        // specific request before rejecting the associated promise.
        timeout: 10000,
        // Delay in milliseconds between timeout checks.
        timeoutCheckInterval: 100,
        // Already connected primus instance.
        instance: undefined,
        // Or a URl and options so that a primus instance can be created.
        url: '',
        // The standard options that can be passed to Primus when connecting.
        options: {}
      }
    };

    /**
     * Set the configuration for httpOverWebSocket service instances.
     *
     * @param {object} configuration
     */
    this.configure = function (providedConfig) {
      providedConfig = providedConfig || {};
      for (var prop in providedConfig) {
        config[prop] = providedConfig[prop];
      }
    };

    /**
     * Return a Transport service instance.
     */
    this.$get = [
      '$cacheFactory',
      '$q',
      '$interval',
      function ($cacheFactory, $q, $interval) {
        if (config.transport === 'primus') {
          return new PrimusTransport(config.options, $cacheFactory, $q, $interval);
        } else {
          throw new Error('Invalid transport specified for angular.httpOverWebSocket.TransportProvider: ' + config.transport);
        }
      }
    ];
  };

  /* -------------------------------------------------------------------------
  Provider: angular.httpOverWebSocket.Provider
  ------------------------------------------------------------------------- */

  /**
   * angular.httpOverWebSocket.Provider
   *
   * Provides an interface to match that of ng.$http.
   */
  var httpOverWebSocketProvider = function httpOverWebSocketProvider() {

    var config = {
      // Are we excluding any URLs, and passing them through to plain $http?
      exclude: [],
      // Which URLs are we including?
      include: []
    };

    /**
     * Set the configuration for httpOverWebSocket service instances.
     *
     * @param {object} configuration
     */
    this.configure = function (providedConfig) {
      for (var prop in providedConfig || {}) {
        config[prop] = providedConfig[prop];
      }
    };

    /**
     * Return an httpOverWebSocket service instance.
     *
     * @return {Function}
     */
    this.$get = ['$http', 'httpOverWebSocketTransport', function ($http, httpOverWebSocketTransport) {

      /* ---------------------------------------------------------------------
      Service: httpOverWebSocket
      --------------------------------------------------------------------- */

      /**
       * httpOverWebSocket
       *
       * A service with the same signature as ng.$http, but which runs over
       * WebSockets rather than HTTP/S.
       */
      var httpOverWebSocket = function httpOverWebSocket (requestConfig) {
        // Route via $http if the URL doesn't match or is excluded.
        var index;
        for (index = 0; index < config.exclude.length; index++) {
          if (requestConfig.url.match(config.exclude[index])) {
            return $http(requestConfig);
          }
        }
        // Route via httpOverWebSocket if there is an included match.
        for (index = 0; index < config.include.length; index++) {
          if (requestConfig.url.match(config.include[index])) {
            return httpOverWebSocketTransport.send(requestConfig);
          }
        }

        // Doesn't match anything? Then off to plain $http we go.
        return $http(requestConfig);
      };

      /**
       * Helper function. Pass a request into the main httpOverWebSocket
       * function.
       */
      function adjunct (method, url, requestConfig, data) {
        requestConfig = requestConfig || {};
        requestConfig.method = method;
        requestConfig.url = url;
        requestConfig.data = data;
        return httpOverWebSocket(requestConfig);
      }

      httpOverWebSocket.delete = function (url, requestConfig) {
        return adjunct('DELETE', url, requestConfig);
      };
      httpOverWebSocket.get = function (url, requestConfig) {
        return adjunct('GET', url, requestConfig);
      };
      httpOverWebSocket.head = function (url, requestConfig) {
        return adjunct('HEAD', url, requestConfig);
      };
      httpOverWebSocket.jsonp = function (url, requestConfig) {
        return adjunct('JSONP', url, requestConfig);
      };

      httpOverWebSocket.post = function (url, data, requestConfig) {
        return adjunct('POST', url, requestConfig, data);
      };
      httpOverWebSocket.put = function (url, data, requestConfig) {
        return adjunct('PUT', url, requestConfig, data);
      };

      return httpOverWebSocket;
    }];
  };

  /* -------------------------------------------------------------------------
  Expose implementations.
  ------------------------------------------------------------------------- */

  angular.httpOverWebSocket = {
    ID: '_howsId',
    STATUS: '_howsStatus',
    inherits: inherits,
    transports: {
      Transport: Transport,
      PrimusTransport: PrimusTransport
    },
    Provider: httpOverWebSocketProvider,
    TransportProvider: httpOverWebSocketTransportProvider
  };

}());
