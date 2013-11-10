#
# Setup for everything except HAProxy.
#

# Install needed node modules.
execute 'npm -g install express primus engine.io karma'

# This package is needed for PhantomJS to run on an Ubuntu 12.04 server.
package 'libfontconfig1-dev'
