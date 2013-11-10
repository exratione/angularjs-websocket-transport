name 'example-server'
description 'An example server to demonstrate the AngularJS WebSocket Transport service.'

run_list [
  'recipe[nodejs]',
  'recipe[angularjs-websocket-transport::setup]',
  'recipe[forever-service]',
  'recipe[angularjs-websocket-transport::haproxy_setup]',
  'recipe[haproxy]'
]
