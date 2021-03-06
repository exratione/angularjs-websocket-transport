/*jshint
  node: true,
  strict: false
*/
/**
 * @fileOverview
 * The Express application.
 */

var http = require('http');
var path = require('path');
var express = require('express');
var Primus = require('primus');

/*---------------------------------------------------------------------------
Functionality shared between HTTP/S and WebSocket transports.
---------------------------------------------------------------------------*/

/**
 * Get a dummy response with a small uniform pause.
 *
 * @param {Function} callback
 *     Of the form function (data);
 */
function getResponseData(callback) {
  setTimeout(function () {
    var response = {};
    response[Math.floor(Math.random() * 1000)] = Math.floor(Math.random() * 1000);
    callback(response);
  }, 50);
}

/*---------------------------------------------------------------------------
Set up Express
---------------------------------------------------------------------------*/

var app = express();

// Add middleware to serve httpOverWebSocket.js. This is in a path we'll be
// assigning to express.static(), so this needs to be processed first.
app.use(function (request, response, next) {
  if(request.path === '/js/httpOverWebSocket.js') {
    response.sendfile(path.join(__dirname, '../../src/httpOverWebSocket.js'));
  } else {
    next();
  }
});

// Serve the client code from a single static directory.
app.use(express.static(path.join(__dirname, '../client')));

// A path for fake REST requests.
app.all('/rest/:ts', function (request, response, next) {
  getResponseData(function (data) {
    response.json(data);
  });
});

// An up check to keep proxies happy.
app.all('/up', function (request, response, next) {
  response.json({ up: true });
});

/*---------------------------------------------------------------------------
Launch the server.
---------------------------------------------------------------------------*/

var server = http.createServer(app).listen(10080);

/*---------------------------------------------------------------------------
Set up Primus with Engine.IO as the transport.
---------------------------------------------------------------------------*/

var primus = new Primus(server, {
  transformer: 'engine.io'
});

// Write out the client library. In a real setup we would create this at deploy
// time through a separate script, or have a utility to recreate it and check it
// in to make sure it was under version control, etc.
//
// But this is good enough for this example use.
primus.save(path.join(__dirname, '../client/js/lib/primus.js'));

// Set up a listener. This is missing the error checks and other epicycles that
// non-example code would have.
primus.on('connection', function (spark) {
  var ID = '_howsId';
  var STATUS = '_howsStatus';

  // Set up the fake response to data requests.
  spark.on('data', function (data) {
    // Check to make sure that this is related to httpOverWebSocket. If not,
    // do nothing.
    if (typeof data !== 'object' || !data[ID]) {
      return;
    }

    // Generate a fake delayed response and throw it back down the wire.
    getResponseData(function (responseData) {
      // Flag the data to match it up to the request and add a status.
      responseData[ID] = data[ID];
      responseData[STATUS] = 200;
      // Then send it down the wire.
      spark.write(responseData);
    });
  });
});

