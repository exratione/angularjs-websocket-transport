/*global
  angular: false,
  beforeEach: false,
  describe: false,
  expect: false,
  inject: false,
  it: false,
  jasmine: false
*/
/**
 * @fileOverview
 * Unit tests for the Transport superclass functionality.
 */

describe('Transport', function () {
  'use strict';

  var $cacheFactory,
      $q,
      $interval,
      transport,
      uuidRegExp = /[a-z0-9]{8}-[a-z0-9]{4}-4[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{12}/;

  /**
   * Generate something suitable to be put into the transport.requests object.
   *
   * @param {number} [timeoutAfter]
   *   Timestamp after which this is timed out.
   * @param {object} [requestConfig]
   *   Configuration object relating the request.
   * @return {object}
   *   The dummy request marker object.
   */
  function generateDummyRequestMarker(timeoutAfter, requestConfig) {
    return {
      requestConfig: requestConfig || {},
      deferred: {
        resolve: jasmine.createSpy(),
        reject: jasmine.createSpy(),
        // Not needed for any of these tests.
        promise: {}
      },
      timeoutAfter: timeoutAfter || 0
    };
  }

  beforeEach(function () {
    inject(function($injector) {
      $cacheFactory = $injector.get('$cacheFactory');
      $q = $injector.get('$q');
      // This will disable the timeout check loop, which we don't want running
      // here anyway.
      $interval = jasmine.createSpy();
    });

    var config = {};
    transport = new angular.httpOverWebSocket.transports.Transport(config, $cacheFactory, $q, $interval);
  });

  it('defaults assigned to configuration', function () {
    expect(transport.config).toEqual(jasmine.any(Object));
    expect(transport.config.timeout).toBe(0);
    expect(transport.config.timeoutCheckInterval).toBe(100);
  });

  // Using a spy as $interval lets us check to see if this is called correctly.
  it('timeout loop check interval set up', function () {
    expect($interval).toHaveBeenCalled();
    expect($interval.mostRecentCall.args[0]).toEqual(jasmine.any(Function));
    expect($interval.mostRecentCall.args[1]).toEqual(transport.config.timeoutCheckInterval);
    expect($interval.mostRecentCall.args[2]).toEqual(0);
    expect($interval.mostRecentCall.args[3]).toEqual(false);
  });

  it('transport.isSuccessStatus()', function () {
    expect(transport.isSuccessStatus(200)).toBe(true);
    expect(transport.isSuccessStatus(300)).toBe(false);
    expect(transport.isSuccessStatus(404)).toBe(false);
    expect(transport.isSuccessStatus(500)).toBe(false);
  });

  // Transmit in this class throws an Error because it isn't implementd.
  it('transport.transmit() always throws', function () {
    var shouldThrow = function () {
      transport.transmit('id', {
        method: 'GET',
        url: '/example'
      });
    };
    expect(shouldThrow).toThrow();
  });

  // Does the UUID generator produce the right result?
  it('transport.generateUuid()', function () {
    expect(transport.generateUuid()).toMatch(uuidRegExp);
  });

  // Testing the tail end of the request process, after a response has been
  // received, and we have to tidy up the data and resolve or reject the
  // deferred.
  it('resolve a response', function () {
    var dummyRequestA = generateDummyRequestMarker();
    var dummyRequestB = generateDummyRequestMarker();

    transport.requests['a'] = dummyRequestA;
    transport.requests['b'] = dummyRequestB;

    var dataA = {};
    var dataB = {};
    var statusA = 200;
    var statusB = 404;

    transport.resolveResponse(transport.createHttpResponse('a', statusA, dataA));
    transport.resolveResponse(transport.createHttpResponse('b', statusB, dataB));

    // Resolving a request removes the marker data from transport.requests.
    expect(transport.requests['a']).toBe(undefined);
    expect(transport.requests['b']).toBe(undefined);

    // The output here has to match the response that $http() returns to
    // its promise listeners, with the addition of an extra "id" property.
    expect(dummyRequestA.deferred.resolve).toHaveBeenCalled();
    expect(dummyRequestA.deferred.resolve.mostRecentCall.args[0]).toEqual({
      id: 'a',
      data: dataA,
      status: statusA,
      headers: {},
      config: dummyRequestA.requestConfig
    });

    expect(dummyRequestB.deferred.reject).toHaveBeenCalled();
    expect(dummyRequestB.deferred.reject.mostRecentCall.args[0]).toEqual({
      id: 'b',
      data: dataB,
      status: statusB,
      headers: {},
      config: dummyRequestB.requestConfig
    });
  });

  // Make sure that the timeout mechanism does the right thing.
  it('timing out old requests', function () {
    // These should not be timed out.
    var dummyRequestA = generateDummyRequestMarker(0);
    var dummyRequestB = generateDummyRequestMarker(Date.now() + 1000);
    // This should time out.
    var dummyRequestC = generateDummyRequestMarker(Date.now() - 1000);

    transport.requests['a'] = dummyRequestA;
    transport.requests['b'] = dummyRequestB;
    transport.requests['c'] = dummyRequestC;

    transport.runTimeoutCheck();

    // Rejecting a request removes the marker data from transport.requests.
    expect(transport.requests['a']).toBe(dummyRequestA);
    expect(transport.requests['b']).toBe(dummyRequestB);
    expect(transport.requests['c']).toBe(undefined);

    expect(dummyRequestA.deferred.reject).not.toHaveBeenCalled();
    expect(dummyRequestB.deferred.reject).not.toHaveBeenCalled();
    expect(dummyRequestC.deferred.reject).toHaveBeenCalled();
  });

  it('transport.send() GET request without cache', function () {
    // Replace the always-throwing unimplemented transmit() method with a spy.
    transport.transmit = jasmine.createSpy();
    var requestConfig = {
      method: 'GET',
      url: '/example'
    };

    var promise = transport.send(requestConfig);

    // Haul out the ID of the request and the request marker object.
    var requestIds = Object.keys(transport.requests);
    expect(requestIds.length).toBe(1);
    var requestId = requestIds[0];
    expect(requestId).toMatch(uuidRegExp);
    var request = transport.requests[requestIds[0]];
    expect(request.requestConfig).toBe(requestConfig);

    // Was the deferred created and the promise extended?
    expect(request.deferred).toBeDefined();
    expect(request.deferred.promise).toBeDefined();
    expect(request.deferred.promise.success).toBeDefined();
    expect(request.deferred.promise.error).toBeDefined();
    expect(request.deferred.resolve).toBeDefined();
    expect(request.deferred.reject).toBeDefined();

    expect(request.deferred.promise).toBe(promise);

    // No timeout here.
    expect(request.timeoutAfter).not.toBeDefined();

    // And it should have been sent through.
    expect(transport.transmit).toHaveBeenCalledWith(requestId, requestConfig);
  });

  it('transport.send() non-GET requests do not cache', function () {
    // Replace the always-throwing unimplemented transmit() method with a spy.
    transport.transmit = jasmine.createSpy();
    var url = '/example';
    var promises = {};

    angular.forEach(['DELETE', 'HEAD', 'JSONP', 'POST', 'PUT'], function (method) {
      promises[method] = [];
      promises[method][0] = transport.send({
        method: method,
        url: url,
        data: {},
        cache: true
      });
      promises[method][1] = transport.send({
        method: method,
        url: url,
        data: {},
        cache: true
      });
    });

    expect(transport.transmit.callCount).toBe(10);

    // And the default cache should be empty.
    var promise = transport.defaultCache.get(url);
    expect(promise).toBe(undefined);
  });

  it('transport.send() GET with default cache', function () {
    // Replace the always-throwing unimplemented transmit() method with a spy.
    transport.transmit = jasmine.createSpy();
    var url = '/example';

    var promiseA = transport.send({
      method: 'GET',
      url: url,
      cache: true
    });
    var promiseB = transport.send({
      method: 'GET',
      url: url,
      cache: true
    });

    // 1 not 2 because only one of the GET requests is sent through.
    expect(transport.transmit.callCount).toBe(1);

    // And the default cache should have a promise in it because the first
    // request has yet to resolve.
    //
    // That should be the same promise returned by send() for both GET requests.
    var promise = transport.defaultCache.get(url);
    expect(promise).toBe(promiseA);
    expect(promise).toBe(promiseB);
  });

  it('transport.send() GET with cache object', function () {
    // Replace the always-throwing unimplemented transmit() method with a spy.
    transport.transmit = jasmine.createSpy();
    var url = '/example';
    var cache = $cacheFactory('test transport');

    var promiseA = transport.send({
      method: 'GET',
      url: url,
      cache: cache
    });
    var promiseB = transport.send({
      method: 'GET',
      url: url,
      cache: cache
    });

    // 1 not 2 because only one of the GET requests is sent through.
    expect(transport.transmit.callCount).toBe(1);

    // The cache should have a promise in it because the first request has yet
    // to resolve.
    //
    // That should be the same promise returned by send() for both GET requests.
    var promise = cache.get(url);
    expect(promise).toBe(promiseA);
    expect(promise).toBe(promiseB);
  });

});
