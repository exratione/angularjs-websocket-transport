/*global
  beforeEach: false,
  describe: false,
  expect: false,
  inject: false,
  it: false
*/
/**
 * @fileOverview
 * Tests for the Transport superclass functions.
 */

describe('Transport', function () {
  'use strict';

  var $httpBackend,
      $cacheFactory,
      $q,
      $interval,
      config,
      transport;

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
        reject: jasmine.createSpy()
      },
      timeoutAfter: timeoutAfter || 0
    };
  }

  beforeEach(function () {
    inject(function($injector) {
      $httpBackend = $injector.get('$httpBackend');
      $cacheFactory = $injector.get('$cacheFactory');
      $q = $injector.get('$cacheFactory');
      // This will disable the timeout check loop.
      $interval = jasmine.createSpy();
    });

    config = undefined;
    transport = new angular.httpOverWebSocket.transports.Transport({}, $cacheFactory, $q, $interval);
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
        url: 'http://example.com'
      });
    };
    expect(shouldThrow).toThrow();
  });

  // Does the UUID generator produce the right result?
  it('transport.generateUuid()', function () {
    var regexp = /[a-z0-9]{8}-[a-z0-9]{4}-4[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{12}/;
    expect(transport.generateUuid()).toMatch(regexp);
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

});
