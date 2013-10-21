name              'angularjs-websocket-transport'
maintainer        'Reason'
maintainer_email  'reason@exratione.com'
license           'MIT'
description       'Minor necessary setup tasks needed prior to running the angularjs-websocket-transport example.'
version           '0.0.1'
recipe            'angularjs-websocket-transport', 'Empty default module.'
recipe            'angularjs-websocket-transport::node_modules', 'Install needed Node.js modules via NPM.'
recipe            'angularjs-websocket-transport::haproxy_preparation', 'Items needed by HAProxy, but which that cookbook does not put in place.'

depends 'nodejs'

%w{ ubuntu }.each do |os|
  supports os
end
