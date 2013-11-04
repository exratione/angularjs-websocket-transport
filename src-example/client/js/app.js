/*global
  angular: false,
  async: false,
  httpOverWebSocketProvider: false,
  Primus: false
*/
/**
 * @fileOverview
 * A simple Angular application setup.
 */

(function () {
  'use strict';

  /*---------------------------------------------------------------------------
  Set up the AngularJS application.
  ---------------------------------------------------------------------------*/

  // Create the example application AngularJS module.
  var comparison = angular.module('comparison', ['ngRoute']);

  // Use the config function to set up routes, or route singular in this case.
  comparison.config(['$routeProvider', function ($routeProvider) {
    $routeProvider
      .when('/', {
        controller: 'comparisonController',
        templateUrl: '/partial/comparison.html'
      })
      .otherwise({
        redirectTo: '/'
      });
  }]);

  /*---------------------------------------------------------------------------
  Set up the httpOverWebSocket service, etc.
  ---------------------------------------------------------------------------*/

  comparison.provider('httpOverWebSocket', httpOverWebSocketProvider);
  comparison.provider('httpOverWebSocketTransport', httpOverWebSocketTransportProvider);
  comparison.config([
    'httpOverWebSocketProvider',
    'httpOverWebSocketTransportProvider',
    function (httpOverWebSocketProvider, httpOverWebSocketTransportProvider) {
      httpOverWebSocketTransportProvider.configure({
        transport: 'primus',
        options: {
          // Request timeout in milliseconds. Not the same as the various timeouts
          // associated with Primus: this is how long to wait for a response to a
          // specific request before rejecting the associated promise.
          timeout: 10000,
          // Delay in milliseconds between timeout checks.
          timeoutCheckInterval: 100,
          // Already connected primus instance.
          instance: new Primus('/', {
            // Default options for the Primus client.
          })
        }
      });

      httpOverWebSocketProvider.configure({
        // Don't exclude any URLs.
        exclude: [],
        // Requests with URLs that match this regular expression are sent via
        // WebSocket.
        include: [/^\/restOverWebSocket/]
      });
    }
  ]);

  /*---------------------------------------------------------------------------
  Set up the Controllers.
  ---------------------------------------------------------------------------*/

  /**
   * The application controller.
   *
   * Note that $http will be provided by httpOverWebSocket here.
   */
  function comparisonController ($scope, $http) {

    /*----------------------------------------------------------------------
    Utility functions.
    ----------------------------------------------------------------------*/

    /**
     * Note that a request is started.
     *
     * @return {number}
     *     Index of the new request.
     */
    function requestStarted () {
      var newIndex = $scope.results.length;
      $scope.results[newIndex] = {
        index: newIndex + 1,
        startTime: Date.now(),
        completed: false
      };
      return newIndex;
    }

    /**
     * Deal with the response from the server.
     */
    function processResponse(index, success, response) {
      var result = $scope.results[index];
      result.endTime = Date.now();
      result.completed = true;
      result.success = success;
      result.elapsed = result.endTime - result.startTime;
      result.responseData = JSON.stringify(response.data);

      // Complete the run if we're done.
      if (!$scope.isRunning()) {
        $scope.runEnded();
      }
    }

    /**
     * Send an HTTP request to the server, which may go via WebSocket if the
     * URL matches.
     *
     * @param  {Function} [callback]
     *   Optional callback. Invoked when the request completes.
     */
    function sendRequest(url, callback) {
      var index = requestStarted();
      $http({
        cache: $scope.useCache,
        method: 'GET',
        url: url
      }).then(function (response) {
        processResponse(index, true, response);
        if (callback) {
          callback();
        }
      }, function () {
        processResponse(index, false, response);
        if (callback) {
          callback();
        }
      });
    }

    /**
     * Return a status for the given result suitable for display.
     *
     * @param {number} index
     *   Index of the result in the results array.
     * @return {string}
     *   Display string for the status.
     */
    $scope.resultStatus = function (index) {
      var result = this.results[index];
      if (!result) {
        return '';
      }
      if (!result.completed) {
        return 'Running...';
      } else {
        if (result.success) {
          return 'Completed';
        } else {
          return 'Failed.';
        }
      }
    };

    /**
     * Is a test current running?
     */
    $scope.isRunning = function () {
      if (!this.run.started || this.run.ended) {
        return false;
      }
      if (this.results.length < this.run.count) {
        return true;
      } else {
        return this.results.some(function (result) {
          return !result.completed;
        });
      }
    };

    /**
     * Note that a run started.
     *
     * @param {number} requestCount
     *   The number of requests to make.
     */
    $scope.runStarted = function (requestCount) {
      this.clear();
      this.run.count = requestCount;
      this.run.started = Date.now();
    };

    /**
     * Note that a run ended.
     */
    $scope.runEnded = function () {
      this.run.ended = Date.now();
      this.run.elapsed = this.run.ended - this.run.started;
    };

    /**
     * Clear the current test results.
     */
    $scope.clear = function () {
      this.run = {
        count: this.count,
        started: undefined,
        ended: undefined,
        elapsed: undefined,
        averagePerRequest: undefined
      };
      this.results = [];
      this.socketCallbacks = [];
    };

    /**
     * Return a unique URL for this run.
     *
     * @param {string} baseUrl
     * @return {string}
     */
    function getRunUrl(baseUrl) {
      return baseUrl + '/' + Date.now();
    }

    /*----------------------------------------------------------------------
    Test running functions.
    ----------------------------------------------------------------------*/

    /**
     * Run a test against the server over HTTP in series.
     */
    $scope.httpSeries = function () {
      if (this.isRunning()) {
        return;
      }

      var self = this;
      var runUrl = getRunUrl($scope.httpUrl);
      this.runStarted(this.count);
      async.timesSeries(this.count, function (index, asyncCallback) {
        sendRequest(runUrl, asyncCallback);
      }, function () {});
    };

    /**
     * Run a test against the server over HTTP in parallel.
     */
    $scope.httpParallel = function () {
      if (this.isRunning()) {
        return;
      }

      var self = this;
      var runUrl = getRunUrl($scope.httpUrl);
      this.runStarted(this.count);
      async.times(this.count, function (index, asyncCallback) {
        sendRequest(runUrl);
        asyncCallback();
      }, function () {});
    };

    /**
     * Run a test against the server over Socket.IO in series.
     */
    $scope.httpOverWebSocketSeries = function () {
      if (this.isRunning()) {
        return;
      }

      var self = this;
      var runUrl = getRunUrl($scope.httpOverWebSocketUrl);
      this.runStarted(this.count);
      async.timesSeries(this.count, function (index, asyncCallback) {
        sendRequest(runUrl, asyncCallback);
      }, function () {});
    };

    /**
     * Run a test against the server over Socket.IO in parallel.
     */
    $scope.httpOverWebSocketParallel = function () {
      if (this.isRunning()) {
        return;
      }

      var self = this;
      var runUrl = getRunUrl($scope.httpOverWebSocketUrl);
      this.runStarted(this.count);
      async.times(this.count, function (index, asyncCallback) {
        sendRequest(runUrl);
        asyncCallback();
      }, function () {});
    };

    /*----------------------------------------------------------------------
    Initialization.
    ----------------------------------------------------------------------*/

    $scope.clear();
    // The normal limit on concurrent HTTP requests in Firefox.
    $scope.count = 6;
    $scope.useCache = false;
    $scope.countOptions = [1, 6, 10, 20];
    $scope.httpUrl = '/rest';
    $scope.httpOverWebSocketUrl = '/restOverWebSocket';
  }

  // Create the application controller. Only a single controller here to go
  // with the single route.
  comparison.controller('comparisonController', [
    '$scope',
    'httpOverWebSocket',
    comparisonController
  ]);

})();
