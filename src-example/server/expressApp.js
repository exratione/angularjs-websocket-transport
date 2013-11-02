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
    response[Math.random()] = Math.random();
    callback(response);
  }, 50);
}

/*---------------------------------------------------------------------------
Set up Express
---------------------------------------------------------------------------*/

var app = express();

// Add middleware to serve httpOverWebSocket.js in a path we'll be assigning
// to express.static().
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
app.all('/rest', function (request, response, next) {
  getResponseData(function (data) {
    response.json(data);
  });
});

// Up check.
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

// Set up a listener.
primus.on('connection', function (spark) {
  // Set up the fake response to data requests.
  spark.on('data', function (data) {
    // Check to make sure that this is related to httpOverWebSocket. If not,
    // do nothing.
    if (typeof data !== 'object' || !data._id) {
      return;
    }

    // Generate a fake delayed response and throw it back down the wire.
    getResponseData(function (responseData) {
      // Flag the data to match it up to the request.
      responseData._id = data._id;
      spark.write(responseData);
    });
  });
});

