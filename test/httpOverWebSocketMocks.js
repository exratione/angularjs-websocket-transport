/*global
    angular: false,
    primus: false
*/
/**
 * @fileOverview
 * The service and provider for a mock WebSocket transport layer, to be used
 * in testing.
 */

(function () {
  'use strict';

  /**
   * A mock Transport implementation that feeds requests into $httpBackend.
   *
   * The assumption here is that this will be used in conjunction with the mock
   * $httpBackend, in exactly the same way that standard $http testing proceeds.
   */
  function MockTransport(config, $cacheFactory, $q, $interval, $httpBackend) {
    MockTransport.super_.apply(this, arguments);
  }
  angular.httpOverWebSocket.inherits(MockTransport, angular.httpOverWebSocket.transports.Transport);

  /**
   * @see angular.httpOverWebSocket.transports.Transport#send
   */
  MockTransport.prototype.transmit = function (id, requestConfig) {
    var self = this;

    /**
     * Callback registered to $httpBackend().
     *
     * Once invoked, it manages dealing with caching, returning the assembled
     * response, and so on.
     */
    function done(status, response, headersString) {
      self.resolveResponse(self.createHttpResponse(id, status, response));
    }

    // There should be no need for headers.
    var requestHeaders = requestConfig.headers || {};
    // This is for cross-site requests, which should be irrelevant here: all
    // WebSocket requests go to the origin site, and mock requests go nowhere.
    var withCredentials = false;
    // This is rarely set in requests, and is irrelevant to the mocks and the
    // WebSocket requests.
    var responseType;

    /// Run the request into the mock backend.
    $httpBackend(
      requestConfig.method,
      requestConfig.url,
      requestConfig.data,
      done,
      requestHeaders,
      this.config.timeout,
      withCredentials,
      responseType
    );
  };

  /* -------------------------------------------------------------------------
  Provider: angular.httpOverWebSocket.TransportProvider
  ------------------------------------------------------------------------- */

  /**
   * angular.httpOverWebSocket.MockTransportProvider
   *
   * Provides a mock version of the underlying transport layer, one that runs
   * through $httpBackend.
   */
  var httpOverWebSocketMockTransportProvider = function httpOverWebSocketMockTransportProvider() {
    // Configuration for the purposes of keeping the Transport superclass of
    // MockTransport happy.
    var config = {
      options: {
        // No timeout.
        timeout: 0,
        // Delay in milliseconds between timeout checks.
        timeoutCheckInterval: 100
      }
    };

    /**
     * Dummy configuration function.
     */
    this.configure = function () {};

    /**
     * Return a Transport service instance.
     */
    this.$get = [
      '$cacheFactory',
      '$q',
      '$interval',
      '$httpBackend',
      function ($cacheFactory, $q, $interval, $httpBackend) {
        return new MockTransport(config, $cacheFactory, $q, $interval, $httpBackend);
      }
    ];
  };

  /* -------------------------------------------------------------------------
  Expose implementations.
  ------------------------------------------------------------------------- */

  angular.httpOverWebSocket.transports.MockTransport = MockTransport;
  angular.httpOverWebSocket.MockTransportProvider = httpOverWebSocketMockTransportProvider;

}());
