AngularJS WebSocket Transport
=============================

A simple way to replace $http in any existing AngularJS application with a
WebSocket transport layer that falls back to HTTP. This requires use of a
Node.js webserver and WebSocket implementation on the server, such as Express
and Engine.IO.

  * For AngularJS, a plug-in replacement for the $http service.
  * Requests are faster than HTTP/S in modern browsers for most scenarios.
  * Requires Node.js on the server.
  * Uses [Primus][0] as an abstraction layer for WebSocket implementations.

Adding To An Express/AngularJS Application
------------------------------------------

On the server side install Primus and one of the supported WebSocket
implementations such as Engine.IO.

    npm install -g primus engine.io

Then somewhere in the setup or build process generate the Primus client
Javascript file and include it into your deployment. See the
[Primus documentation][0] for more on that.

Your Express launch script will have to set up and configure Primus to use the
chosen WebSocket implementation. See the Primus documentation for options and
the full API. As a trivial example:

```
var app = express();
var server = http.createServer(app).listen(10080);

// Use Engine.IO as the underlying implementation.
var primus = new Primus(server, {
  transformer: 'engine.io'
});

// Write out the client library. In a real setup we would create this at deploy
// time through a separate script, or have a utility to recreate it and check it
// in to make sure it was under version control, etc.
//
// But this is good enough for an example.
primus.save(path.join(__dirname, '../client/js/lib/primus.js'));

// Set up a listener.
primus.on('connection', function (spark) {
  var ID = '_howsId';
  var STATUS = '_howsStatus';

  // Set up responses to httpOverWebSocket requests.
  spark.on('data', function (data) {
    // Check to make sure that this is related to httpOverWebSocket. If not,
    // do nothing.
    if (typeof data !== 'object' || !data[ID]) {
      return;
    }

    // Generate a response here. The response MUST be an object that at minimum
    // has an ID property that matches that of the request. It should also
    // contain a STATUS property.
    var responseData = {
      stuff: {
        // ...
      }
    }
    responseData[ID] = data[ID];
    responseData[STATUS] = 200;

    // Then send the response.
    spark.write(responseData);
  });
});

```

Copy the file `/src/httpOverWebSocket.js` in this project and include it in the
deployment along with the Primus generated client Javascript file. Make sure
both scripts load prior to the AngularJS application definition. E.g. a
development environment, without minification, might look as follows:

```
<script type="text/javascript" src="js/primus.js"></script>
<script type="text/javascript" src="js/jquery.2.0.3.js"></script>
<script type="text/javascript" src="js/angular.1.2.0.rc3.js"></script>
<script type="text/javascript" src="js/angular-route.1.2.0.rc3.js"></script>
<script type="text/javascript" src="js/httpOverWebSocket.js"></script>
<script type="text/javascript" src="js/app.js"></script>
```

In the AngularJS client application code perform the substitution of
httpOverWebSocket for $http as needed.

```
myModule = angular.module(['ngRoute']);
myModule.provider('httpOverWebSocket', angular.httpOverWebSocket.Provider);
myModule.provider('httpOverWebSocketTransport', angular.httpOverWebSocket.TransportProvider);

myModule.config([
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

function myService($http) {
  // ...
};
myModule.service('myService', [
  'httpOverWebSocket',
  myService
]);
```

Demonstration Application
-------------------------

Under `/src-example` is a simple demonstration application using Express. It
allows the user to issue HTTP/S and WebSocket requests running in series or
parallel, and measures the time taken for responses to return. It employs the
httpOverWebSocket service.

Run the Demonstration Locally With Node.js
------------------------------------------

Install the package via NPM and launch the Express server directly:

    npm install angularjs-websocket-transport
    node node_modules/angularjs-websocket-transport/src-example/server/expressApp.js

The demonstration site can then be viewed at:

    http://localhost:10080/

Launch a Demonstration Server With Vagrant
------------------------------------------

The demonstration Express server can also be run on an Ubuntu 12.04 virtual
machine managed by Vagrant and Virtualbox. The Express application runs as a
service under Forever, behind HAProxy. The machine is built from a base box
using Chef.

With Virtualbox and Vagrant installed run this to start the server setup:

    npm install angularjs-websocket-transport
    cd node_modules/angularjs-websocket-transport
    vagrant up

Once the server is complete and provisioned the demonstration application can
be accessed at:

    https://192.168.35.10/

How to Set Up AngularJS Unit Tests
----------------------------------

To unit test an AngularJS application that uses this WebSocket transport you
can take much the same approach as for unit testing code that makes use of the
$http service. Include `/src/httpOverWebSocketMocks.js` from the project and use
the MockTransport service to send requests via the usual mock $httpBackend.

Here is an example:

```
describe('Provider', function () {
  'use strict';

  var $httpBackend,
      httpOverWebSocket;

  beforeEach(function () {
    // Set up a module and load it.
    var test = angular.module('test', []);
    test.provider('httpOverWebSocket', angular.httpOverWebSocket.Provider);
    // Use the mock transport layer that redirects all requests to $httpBackend.
    test.provider('httpOverWebSocketTransport', angular.httpOverWebSocket.MockTransportProvider);
    test.config([
      'httpOverWebSocketProvider',
      'httpOverWebSocketTransportProvider',
      function (httpOverWebSocketProvider, httpOverWebSocketTransportProvider) {
        // This is a dummy function; it does nothing.
        httpOverWebSocketTransportProvider.configure({});
        // All requests wind up passing through $httpBackend regardless of these
        // settings, either via $http (if excluded or not included) or via the
        // MockTransport service (if included and not excluded).
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

  it('GET request', function () {
    var url = '/overWebSocket';
    $httpBackend.expectGET(url);
    $httpBackend.whenGET(url).respond(200, {
      stuff: 'nonsense'
    };);

    var resolved = jasmine.createSpy();
    var rejected = jasmine.createSpy();
    httpOverWebSocket({
      method: method,
      url: url
    }).then(resolved, rejected);

    $httpBackend.flush();

    expect(rejected).not.toHaveBeenCalled();
    expect(resolved).toHaveBeenCalled();
    expect(resolved.mostRecentCall.args[0].data).toEqual(response);
  });
});
```

Current Differences Between $http and httpOverWebSocket Services
----------------------------------------------------------------

  * Request and response interceptors are not applied.
  * Transform request and response functions are not applied.
  * WebSocket requests will always be sent to the connected WebSocket server regardless of URL.
  * Headers provided in requestConfig.headers are ignored.
  * The cross-origin requestConfig.withCredentials boolean flag is ignored.
  * The requestConfig.responseType value is ignored.

[0]: https://github.com/primus/primus
