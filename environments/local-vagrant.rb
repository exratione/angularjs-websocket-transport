name 'local-vagrant'
description 'Set up an example AngularJS WebSocket Transport server in a local VM.'

default_attributes(
  # An SSL-only setup, with HAProxy redirecting non-SSL to SSL, terminating the
  # SSL connection and passing plain HTTP to the backend.
  #
  # Note that this requires some setup that the HAProxy cookbook does not
  # perform. Specifically, the SSL certificate file has to be put in place,
  # containing, key and certificate, concatenated in that order. If you are
  # using a CA bundle, then that also has to be put in place.
  'haproxy' => {
    # Turn off some of the simple config defaults as they don't produce what we
    # want to see in the configuration file.
    'enable_ssl' => false,
    'enable_admin' => false,
    'enable_default_http' => false,
    # Configuration file settings.
    'balance_algorithm' => 'leastconn',
    'defaults_options' => [
      # Add x-forwarded-for header.
      'forwardfor',
      'http-server-close'
    ],
    'defaults_timeouts' => [
      'connect 5s',
      'client 30s',
      'server 30s',
      # Long timeout for WebSocket connections.
      'tunnel 1h'
    ],
    # Stats are managed via a web interface here rather than via a socket.
    'enable_stats_socket' => false,
    'global_max_connections' => 4096,
    'listeners' => {
      'frontend' => {
        'public' => [
          # HTTP.
          'bind :80',
          # Redirect all HTTP traffic to HTTPS.
          'redirect scheme https if !{ ssl_fc }',
          # HTTPS
          # Example with CA certificate bundle.
          # bind :443 ssl crt cert.pem ca-file bundle.crt
          # Example without CA certification bundle.
          'bind :443 ssl crt /etc/ssl/snakeoil.pem',
          'default_backend node'
        ],
        'admin' => [
          # HTTPS only.
          # Example with CA certificate bundle.
          # bind :1936 ssl crt /etc/ssl/cert.pem ca-file /etc/ssl/certs/bundle.crt
          # Example without CA certification bundle.
          'bind :1936 ssl crt /etc/ssl/snakeoil.pem',
          'default_backend stats'
        ]
      },
      'backend' => {
        'node' => [
          # Tell the backend that this is a secure connection, even though it is
          # getting plain HTTP.
          'reqadd X-Forwarded-Proto:\ https',
          # Up check by hitting a page intended for this use.
          'option httpchk GET /up',
          'timeout check 500ms',
          # Wait 500ms between checks.
          'server node1 127.0.0.1:10080 check inter 500ms',
        ],
        'stats' => [
          'stats enable',
          'stats hide-version',
          'stats realm Haproxy\ Statistics',
          'stats uri /',
          # Better authentication needed for a non-example system.
          'stats auth admin:password'
        ]
      }
    },
    # Installation settings.
    'install_method' => 'source',
    'source' => {
      # Don't dump it into subfolders.
      'prefix' => '',
      # Magic string - see the HAProxy docs for what it should be for your
      # system.
      'target_os' => 'linux2628',
      'use_openssl' => true,
      'use_pcre' => true,
      'use_zlib' => true,
      # Download information for the source code.
      'version' => '1.5-dev19',
      'url' => 'http://haproxy.1wt.eu/download/1.5/src/devel/haproxy-1.5-dev19.tar.gz',
      'checksum' => '7140a43637233bcb9cc51f789c0d3e0f'
    }
  },
  'nodejs' => {
    'install_method' => 'source',
    'version' => '0.10.21'
  },
  'forever-service' => {
    'description' => 'A Node.js server to demonstrate the AngularJS WebSocket Transport service.',
    'display-name' => 'AngularJS WebSocket Transport Example',
    'identifier' => 'angularjs-websocket-transport',
    'log-file-path' => '/var/log/node/angularjs-websocket-transport.log',
    'node-bin' => '/usr/local/bin',
    'node-path' => '/usr/local/lib/node_modules',
    'pid-file-path' => '/var/run/angular-websocket-transport.pid',
    'service-type' => 'upstart',
    'start-script' => '/vagrant/src-example/server/expressApp.js',
    'start-service' => true,
    'user' => 'vagrant',
    'forever' => {
      'min-uptime' => 5000,
      'spin-sleep-time' => 2000
    }
  }
)
