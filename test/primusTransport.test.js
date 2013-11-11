/*global
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
 * Unit tests for the PrimusTransport class functionality.
 */

describe('PrimusTransport', function () {
  'use strict';

  var $cacheFactory,
      $q,
      $interval,
      $window,
      $rootScope,
      primus,
      primusInstance,
      transport,
      ID = angular.httpOverWebSocket.ID,
      STATUS = angular.httpOverWebSocket.STATUS,
      uuidRegExp = /[a-z0-9]{8}-[a-z0-9]{4}-4[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{12}/;

  beforeEach(function () {
    inject(function($injector) {
      $cacheFactory = $injector.get('$cacheFactory');
      $q = $injector.get('$q');
      $window = $injector.get('$window');
      $rootScope = $injector.get('$rootScope');
      // This will disable the timeout check loop, which we don't want running
      // here anyway.
      $interval = jasmine.createSpy();
    });

    // Set up a stub for the Primus client instance, with a way to simulate
    // arrival of a message.
    primusInstance = {
      // Listeners for event types.
      listeners: {},
      /**
       * Cause the instance to behave as though a response message arrived from
       * the server.
       */
      simulateResponse: function (data) {
        this.invokeListeners('data', data);
      },
      /**
       * Invoke listener functions for this type, and pass in data as an
       * argument.
       */
      invokeListeners: function (type, data) {
        if (!angular.isArray(this.listeners[type])) {
          return;
        }
        angular.forEach(this.listeners[type], function (listener) {
          listener(data);
        });
      },
      /**
       * Add a listener for a given event type.
       */
      on: function (type, listener) {
        if (!this.listeners[type]) {
          this.listeners[type] = [];
        }
        this.listeners[type].push(listener);
      },
      /**
       * Simulate sending a message to the server.
       */
      write: jasmine.createSpy()
    };

    // A stub for the main Primus factory function.
    $window.primus = function () {
      return primusInstance;
    };
  });

  it('instantiation with existing Primus instance', function () {
    var config = {
      instance: primusInstance
    };
    spyOn(primusInstance, 'on').andCallThrough();
    transport = new angular.httpOverWebSocket.transports.PrimusTransport(config, $cacheFactory, $q, $interval);

    expect(transport.primus).toBe(primusInstance);
    expect(primusInstance.on).toHaveBeenCalledWith('data', jasmine.any(Function));
  });

  it('instantiation with Primus configuration', function () {
    spyOn($window, 'primus').andCallThrough();
    var config = {
      url: '/',
      options: {}
    };
    spyOn(primusInstance, 'on').andCallThrough();
    transport = new angular.httpOverWebSocket.transports.PrimusTransport(config, $cacheFactory, $q, $interval);

    expect($window.primus).toHaveBeenCalledWith(config.url, config.options);
    expect(transport.primus).toBe(primusInstance);
    expect(primusInstance.on).toHaveBeenCalledWith('data', jasmine.any(Function));
  });

  // Simulate sending a request and receiving a response via the stub Primus
  // client instance.
  it('round trip send and receive', function () {
    var config = {
      instance: primusInstance
    };
    transport = new angular.httpOverWebSocket.transports.PrimusTransport(config, $cacheFactory, $q, $interval);

    var requestConfig = {
      method: 'GET',
      url: '/example'
    };

    // ------------------------------------------------------------------
    // Send the request.
    // ------------------------------------------------------------------

    var response = {};
    var id, status;

    primusInstance.write = function (data) {
      // Check what came through.
      expect(data[ID]).toMatch(uuidRegExp);
      expect(data.method).toBe(requestConfig.method);
      expect(data.url).toBe(requestConfig.url);

      // Fake what would happen with a response back. Form up the response
      // object first.
      response[ID] = id = data[ID];
      response[STATUS] = status = 200;
    };

    spyOn(primusInstance, 'write').andCallThrough();
    spyOn(transport, 'resolveResponse').andCallThrough();

    var resolved = jasmine.createSpy();
    var rejected = jasmine.createSpy();
    var promise = transport.send(requestConfig);
    promise.then(resolved, rejected);

    expect(primusInstance.write).toHaveBeenCalled();

    // ------------------------------------------------------------------
    // Trigger the response.
    // ------------------------------------------------------------------

    // To get the deferred.resolve() involved in the response to trigger in test
    // code has to be inside an explicit digest loop - i.e. call to $apply().
    //
    // This is one of those magic things about AngularJS you just have to know.
    $rootScope.$apply(function () {
      primusInstance.simulateResponse(response);
    });

    var resolvedResponse = {
      id: id,
      data: response,
      status: status,
      headers: {},
      config: requestConfig
    };

    expect(transport.resolveResponse).toHaveBeenCalled();
    expect(transport.resolveResponse.mostRecentCall.args[0]).toEqual(resolvedResponse);
    expect(rejected).not.toHaveBeenCalled();
    expect(resolved).toHaveBeenCalled();
    expect(resolved.mostRecentCall.args[0]).toEqual(resolvedResponse);
  });

});
