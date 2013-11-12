/*global
  angular: false,
  beforeEach: false,
  describe: false,
  expect: false,
  inject: false,
  it: false,
  module: false
*/
/**
 * @fileOverview
 * Unit tests for the PrimusTransport class functionality.
 */

describe('TransportProvider', function () {
  'use strict';

  var primusInstance,
      transportProvider;

  beforeEach(function () {
    // Set up a module and load it.
    var test = angular.module('test', []);
    test.provider('httpOverWebSocketTransport', angular.httpOverWebSocket.TransportProvider);
    test.config([
      'httpOverWebSocketTransportProvider',
      function (httpOverWebSocketTransportProvider) {
        transportProvider = httpOverWebSocketTransportProvider;
      }
    ]);
    module('test');

    // Set up a bare minimum stub for the Primus client instance.
    primusInstance = {
      on: function (type, listener) {}
    };
  });

  it('configure() with invalid transport should throw', inject(function ($injector) {
    var shouldThrow = function () {
      transportProvider.configure({
        transport: 'noSuchTransport'
      });
      var transport = $injector.get('httpOverWebSocketTransport');
    };
    expect(shouldThrow).toThrow();
  }));

  it('configure() with Primus transport specified', inject(function ($injector) {
    var timeout = 10001;
    var timeoutCheckInterval = 101;
    transportProvider.configure({
      transport: 'primus',
      options: {
        timeout: timeout,
        timeoutCheckInterval: timeoutCheckInterval,
        instance: primusInstance
      }
    });
    var transport = $injector.get('httpOverWebSocketTransport');

    expect(transport instanceof angular.httpOverWebSocket.transports.PrimusTransport).toBe(true);
    expect(transport.config.instance).toBe(primusInstance);
    expect(transport.config.timeout).toBe(timeout);
    expect(transport.config.timeoutCheckInterval).toBe(timeoutCheckInterval);
  }));

});
