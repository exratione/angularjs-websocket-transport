name 'example-server'
description 'An example server to demonstrate the AngularJS Websocket Transport service.'

run_list [
  'recipe[nodejs]',
  'recipe[angularjs-websocket-transport::node_modules]',
  'recipe[forever-service]',
  'recipe[angularjs-websocket-transport::haproxy_preparation]',
  'recipe[haproxy]'
]
