/*global
  afterEach: false,
  angular: false,
  beforeEach: false,
  describe: false,
  expect: false,
  inject: false,
  it: false,
  jasmine: false,
  spyOn: false
*/
/**
 * @fileOverview
 * Unit tests for the MockTransport class functionality.
 */

describe('MockTransport', function () {
  'use strict';

  var $cacheFactory,
      $q,
      $interval,
      $httpBackend,
      config,
      transport;

  beforeEach(function () {
    inject(function($injector) {
      $cacheFactory = $injector.get('$cacheFactory');
      $q = $injector.get('$q');
      $httpBackend = $injector.get('$httpBackend');
      // This will disable the timeout check loop, which we don't want running
      // here anyway.
      $interval = jasmine.createSpy();
    });

    config = {
      timeout: 0,
      timeoutCheckInterval: 100
    };
    transport = new angular.httpOverWebSocket.transports.MockTransport(config, $cacheFactory, $q, $interval, $httpBackend);
  });

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  it('check instantiation', function () {
    expect(transport.config).toBe(config);
  });

  it('request and 200 response via $httpBackend', function () {
    var requestConfig = {
      method: 'GET',
      url: '/example'
    };
    var response = {
      stuff: 'nonsense'
    };
    var status = 200;

    $httpBackend.expectGET('/example');
    $httpBackend.whenGET('/example').respond(status, response);

    var resolved = jasmine.createSpy();
    var rejected = jasmine.createSpy();
    var promise = transport.send(requestConfig);
    promise.then(resolved, rejected);

    $httpBackend.flush();

    expect(rejected).not.toHaveBeenCalled();
    expect(resolved).toHaveBeenCalled();
    expect(resolved.mostRecentCall.args[0]).toEqual(jasmine.any(Object));
    expect(resolved.mostRecentCall.args[0].status).toBe(status);
    expect(resolved.mostRecentCall.args[0].data).toEqual(response);
  });

  it('request and 500 response via $httpBackend', function () {
    var requestConfig = {
      method: 'GET',
      url: '/example'
    };
    var response = {
      stuff: 'nonsense'
    };
    var status = 500;

    $httpBackend.expectGET('/example');
    $httpBackend.whenGET('/example').respond(status, response);

    var resolved = jasmine.createSpy();
    var rejected = jasmine.createSpy();
    var promise = transport.send(requestConfig);
    promise.then(resolved, rejected);

    $httpBackend.flush();

    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalled();
    expect(rejected.mostRecentCall.args[0]).toEqual(jasmine.any(Object));
    expect(rejected.mostRecentCall.args[0].status).toBe(status);
    expect(rejected.mostRecentCall.args[0].data).toEqual(response);
  });

});
