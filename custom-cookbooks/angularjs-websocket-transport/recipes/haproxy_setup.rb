#
# Preparations for HAProxy installation.
#

# ----------------------------------------------------------------
# Ensure we have a snakeoil certificate.
# ----------------------------------------------------------------

# Recreate a snakeoil cert such that it has the right hostname. Start by making
# sure that the ssl-cert package is installed.
package 'ssl-cert'
# And then run the command.
execute 'make-ssl-cert generate-default-snakeoil --force-overwrite'

# Concatenate the key and cert into a single file, which is the format needed by
# HAProxy.
execute 'create concatenated snakeoil.pem' do
  command 'cat private/ssl-cert-snakeoil.key certs/ssl-cert-snakeoil.pem > snakeoil.pem'
  cwd '/etc/ssl'
end
