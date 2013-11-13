/*global
  angular: false,
  beforeEach: false,
  describe: false,
  expect: false,
  inject: false,
  it: false,
  jasmine: false,
  module: false
*/
/**
 * @fileOverview
 * Unit tests for the PrimusTransport class functionality.
 */

describe('Provider', function () {
  'use strict';

  var primusInstance,
      provider;

  beforeEach(function () {
    // Set up a module and load it.
    var test = angular.module('test', []);
    test.provider('httpOverWebSocket', angular.httpOverWebSocket.Provider);
    test.provider('httpOverWebSocketTransport', angular.httpOverWebSocket.TransportProvider);
    test.config([
      'httpOverWebSocketProvider',
      'httpOverWebSocketTransportProvider',
      function (httpOverWebSocketProvider, httpOverWebSocketTransportProvider) {
        httpOverWebSocketTransportProvider.configure({
          transport: 'primus',
          options: {
            timeout: 10000,
            timeoutCheckInterval: 100,
            instance: primusInstance
          }
        });

        provider = httpOverWebSocketProvider;
      }
    ]);
    module('test');
  });

  it('obtain httpOverWebSocket instance', inject(function ($injector) {
    provider.configure({
      // Don't exclude any URLs.
      exclude: [],
      // Requests with URLs that match this regular expression are sent via
      // WebSocket.
      include: [/^\/restOverWebSocket/]
    });

    var httpOverWebSocket = $injector.get('httpOverWebSocket');

    expect(httpOverWebSocket).toEqual(jasmine.any(Function));
    angular.forEach(['delete', 'get', 'head', 'jsonp', 'post', 'put'], function (type) {
      expect(httpOverWebSocket[type]).toEqual(jasmine.any(Function));
    });
  }));

});
