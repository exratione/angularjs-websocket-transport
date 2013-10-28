AngularJS WebSocket Transport
=============================

A simple way to replace $http in any existing AngularJS application with a
WebSocket transport layer that falls back to HTTP.

  * Slightly faster in modern browsers for consecutive requests.
  * Significantly faster in modern browsers for concurrent requests.
  * Uses [Primus](https://github.com/primus/primus) as an abstraction layer for WebSocket implementations.

Adding To Your AngularJS Application
------------------------------------

TODO

Example Setup With Vagrant
--------------------------

The example is a simple Express application that compares the $http versus
httpOverWebSocket services for a series of fake requests. This runs on an
Ubuntu VM managed by Vagrant and Virtualbox, with an HAProxy SSL-terminating
frontend.

If you have Virtualbox and Vagrant installed then run this in the project
directory:

    vagrant up

You can access the example application at:

    https://192.168.35.10/
