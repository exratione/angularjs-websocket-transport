/*global
    angular: false,
    primus: false
*/
/**
 * @fileOverview
 * A provider and service that substitutes the standard behavior of the $http
 * service with communication over WebSockets.
 *
 * myModule.provider('httpOverWebSocket', httpOverWebSocketProvider);
 * myModule.config('httpOverWebSocketProvider', {
 *
 * });
 *
 * Then include the service 'httpOverWebSocket' in place of $http. e.g.:
 *
 * function myService($http);
 * myModule.service('myService', [
 *  'httpOverWebSocket',
 *  myService
 * ]);
 */
var httpOverWebSocketProvider;

(function () {
  'use strict';

  /* -------------------------------------------------------------------------
  Utilities.
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
   * @param {object} $rootScope
   * @param {object} $interval
   */
  function Transport (config, $q, $rootScope, $interval) {
    this.config = config || {};

    // Set up various defaults.
    this.requests = {};
    this.$q = $q;
    this.$rootScope = $rootScope;

    // Start the timeout checks running if a timeout is set.
    var self = this;
    if (this.config.timeout) {
    // Make sure that this has a value.
      this.config.timeoutCheckInterval = this.config.timeoutCheckInterval || 100;
      // Continue indefinitely and don't run digests on each check.
      var repeatCount = 0;
      var invokeApply = false;
      this.timeoutCheckPromise = $interval(function () {
        self.runTimeoutCheck();
      }, this.config.timeoutCheckInterval, repeatCount, invokeApply);
    }
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
    var id = this.generateUuid();
    this.requests[id] = {
      promise: this.$q.defer(),
      config: requestConfig,
    };
    if (this.config.timeout) {
      this.requests[id].timeoutAfter = Date.now() + this.config.timeout;
    }

    this.transmit(id, requestConfig);
    return this.requests[id].promise;
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
    throw new Error("Not implemented.");
  };

  /**
   * Create a UUID.
   *
   * @return {string}
   */
  Transport.prototype.generateUuid = function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  };

  /**
   * Create something that looks like the $http response provided by AngularJS.
   *
   * @param {object} data
   *   Response data.
   * @param {object} requestConfig
   *   Request configuration passed in.
   * @return {object}
   */
  Transport.prototype.createHttpSuccessResponse = function (data, requestConfig) {
    data = angular.copy(data);
    return {
      data: data,
      status: 200,
      headers: {},
      config: requestConfig
    };
  };

  /**
   * Create something that looks like the $http response provided by AngularJS.
   *
   * @param {string} error
   *   Error provided.
   * @param {object} requestConfig
   *   Request configuration passed in.
   * @return {object}
   */
  Transport.prototype.createHttpTimeoutResponse = function (error, requestConfig) {
    return {
      data: error,
      status: 0,
      headers: {},
      config: requestConfig
    };
  };

  /**
   * Run through pending RPCs and terminate those that have timed out.
   */
  p.runTimeoutCheck = function () {
    var now = Date.now();
    for (var prop in this.requests) {
      if (this.requests[prop].timeoutAfter && this.requests[prop].timeoutAfter < now) {
        var promise = this.requests[prop].promise;
        var requestConfig = this.requests[prop].config;
        delete this.requests[prop];
        promise.reject(this.createHttpTimeoutResponse('Timed out.', requestConfig));
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
  function PrimusTransport (config, $q, $rootScope, $interval) {
    this.super_.apply(this, arguments);
    // Either store or create the primus connection.
    if (config.instance) {
      this.primus = config.instance;
    } else {
      this.primus = primus(config.url, config.options);
    }

    // Set up to receive messages. These must come back with a matching _id
    // property to be considered. Note that because we are probably running
    // with an underlying transport layer that won't segment our messages off
    // into their own space, we are expecting to see all messages that arrive,
    // not just those involved with httpOverWebSocket.
    this.primus.on('data', function (data) {
      // Skip if not an httpOverWebSocket message.
      if (typeof data !== 'object' || !data._id) {
        return;
      }

      if (!this.requests[data._id]) {
        // Throw and let Angular handle the error.
        throw new Error('httpOverWebSocket: response came back with ID ' + data._id + ' but no matching request found.');
      }

      var promise = this.requests[data._id].promise;
      var requestConfig = this.requests[data._id].config;
      delete data._id;
      delete this.requests[data._id];

      // Send back something that looks like a $http 200 response.
      var self = this;
      $rootScope.$apply(function () {
        self.promises[data._id].resolve(self.createHttpSuccessResponse(data, requestConfig));
      });
    });
  }
  inherits(PrimusTransport, Transport);

  /**
   * @see Transport#transmit
   */
  PrimusTransport.prototype.transmit = function (id, requestConfig) {
    // Use the existence of an _id property to determine that this is a message
    // associated with httpOverWebSocket.
    requestConfig._id = id;
    this.primus.write(requestConfig);
  };

  /* -------------------------------------------------------------------------
  Provider: httpOverWebSocketProvider
  ------------------------------------------------------------------------- */

  /**
   * httpOverWebSocketProvider
   *
   */
  httpOverWebSocketProvider = function httpOverWebSocketProvider() {

    this.config = {
      // Are we excluding any URLs, and passing them through to plain $http?
      exclude: [],
      // Which URLs are we including?
      include: [],
      // Options to pass to Primus.
      primus: {
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
     * @param {object} config
     */
    this.configure = function (config) {
      for (var prop in config || {}) {
        this.config[prop] = config.prop;
      }
    };

    /**
     * Return an httpOverWebSocket service instance.
     *
     * @return {Function}
     */
    this.$get = ['$http', '$q', '$rootScope', '$interval', function ($http, $q, $rootScope, $interval) {

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
        for (index = 0; index < exclude.length; index++) {
          if (requestConfig.match(exclude[index])) {
            return $http(requestConfig);
          }
        }
        // Route via httpOverWebSocket if there is an included match.
        for (index = 0; index < include.length; index++) {
          if (requestConfig.match(include[index])) {


            // TODO: deal with requestConfig.cache in the right way.
            delete requestConfig.cache;



            return this.transport.send(requestConfig);
          }
        }

        // Doesn't match anything? Then off to plain $http.
        return $http(requestConfig);
      };

      function adjunct (method, url, requestConfig, data) {
        requestConfig = requestConfig || {};
        requestConfig.method = method.toUpperCase();
        requestConfig.url = url;
        requestConfig.data = data;
        return httpOverWebSocket(requestConfig);
      }

      httpOverWebSocket.delete = function (url, requestConfig) {
        return ajunct('delete', url, requestConfig);
      };
      httpOverWebSocket.get = function (url, requestConfig) {
        return ajunct('get', url, requestConfig);
      };
      httpOverWebSocket.head = function (url, requestConfig) {
        return ajunct('head', url, requestConfig);
      };

      // TODO: httpOverWebSocket.jsonp() what extras?
      //httpOverWebSocket.jsonp = function (url, requestConfig) {
      //  return ajunct('jsonp', url, requestConfig);
      //};


      httpOverWebSocket.post = function (url, data, requestConfig) {
        return ajunct('post', requestConfig, data);
      };
      httpOverWebSocket.put = function (url, data, requestConfig) {
        return ajunct('put', url, requestConfig, data);
      };

      /* ---------------------------------------------------------------------
      Set the transport.
      --------------------------------------------------------------------- */

      // Only Primus as a transport option for now, since that is an abstraction
      // layer for all the other options we might have included here, such as
      // Engine.IO, Socket.IO, etc.
      httpOverWebSocket.transport = new PrimusTransport(this.config.primus, $q, $rootScope, $interval);

      return httpOverWebSocket;
    }];
  };

}());
