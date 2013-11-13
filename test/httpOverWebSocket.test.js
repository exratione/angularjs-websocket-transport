/*global
  afterEach: false,
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
 * Unit tests for the main httpOverWebSocket service, using the MockTransport
 * that runs via $httpBackend.
 */

describe('Provider', function () {
  'use strict';

  var $httpBackend,
      httpOverWebSocket,
      methods = ['DELETE', 'GET', 'HEAD', 'JSONP', 'POST', 'PUT'];

  /**
   * Run a request with the necessary expectations and checks.
   *
   * @param {string} method
   *   Request method.
   * @param {string} url
   *   Request URL.
   * @param {number} status
   *   Response status.
   * @param {boolean} useHelperMethod
   *   Use the httpOverWebSocket.get() style of helper method rather than the
   *   main function.
   */
  function makeRequest(method, url, status, useHelperMethod) {
    var response = {
      stuff: 'nonsense'
    };
    $httpBackend.expect(method, url);
    $httpBackend.when(method, url).respond(status, response);

    var resolved = jasmine.createSpy();
    var rejected = jasmine.createSpy();
    var data = {};

    if (useHelperMethod) {
      var config = {};
      if (method === 'POST' || method === 'PUT') {
        httpOverWebSocket[method.toLowerCase()](url, data, config).then(resolved, rejected);
      } else {
        httpOverWebSocket[method.toLowerCase()](url, config).then(resolved, rejected);
      }
    } else {
      if (method === 'POST' || method === 'PUT') {
        httpOverWebSocket({
          method: method,
          url: url,
          data: data
        }).then(resolved, rejected);
      } else {
        httpOverWebSocket({
          method: method,
          url: url
        }).then(resolved, rejected);
      }
    }

    $httpBackend.flush();

    var called, notCalled;
    if (200 <= status && status < 300) {
      called = resolved;
      notCalled = rejected;
    } else {
      called = rejected;
      notCalled = resolved;
    }

    expect(notCalled).not.toHaveBeenCalled();
    expect(called).toHaveBeenCalled();
    expect(called.mostRecentCall.args[0]).toEqual(jasmine.any(Object));
    expect(called.mostRecentCall.args[0].status).toBe(status);
    expect(called.mostRecentCall.args[0].data).toEqual(response);
  }

  beforeEach(function () {
    // Set up a module and load it.
    var test = angular.module('test', []);
    test.provider('httpOverWebSocket', angular.httpOverWebSocket.Provider);
    test.provider('httpOverWebSocketTransport', angular.httpOverWebSocket.MockTransportProvider);
    test.config([
      'httpOverWebSocketProvider',
      'httpOverWebSocketTransportProvider',
      function (httpOverWebSocketProvider, httpOverWebSocketTransportProvider) {
        // This is a dummy function; it does nothing.
        httpOverWebSocketTransportProvider.configure({});
        httpOverWebSocketProvider.configure({
          exclude: [],
          include: [/^\/overWebSocket/]
        });
      }
    ]);
    module('test');

    inject(function($injector) {
      $httpBackend = $injector.get('$httpBackend');
      httpOverWebSocket = $injector.get('httpOverWebSocket');
    });
  });

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  it('succcessful requests for all methods via $http', function () {
    angular.forEach(methods, function (method) {
      makeRequest(method, '/notOverWebSocket', 200, true);
      makeRequest(method, '/notOverWebSocket', 200, false);
    });
  });

  it('failed requests for all methods via $http', function () {
    angular.forEach(methods, function (method) {
      makeRequest(method, '/notOverWebSocket', 500, true);
      makeRequest(method, '/notOverWebSocket', 500, false);
    });
  });

  it('succcessful requests for all methods via httpOverWebSocket', function () {
    angular.forEach(methods, function (method) {
      makeRequest(method, '/overWebSocket', 200, true);
      makeRequest(method, '/overWebSocket', 200, false);
    });
  });

  it('failed requests for all methods via httpOverWebSocket', function () {
    angular.forEach(methods, function (method) {
      makeRequest(method, '/overWebSocket', 500, true);
      makeRequest(method, '/overWebSocket', 500, false);
    });
  });

});
