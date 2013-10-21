# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  # Every Vagrant virtual environment requires a box to build off of. Here
  # we are using 64-bit Ubuntu 12.04. It will be fetched from the remote
  # URL if not already installed.
  config.vm.box = "precise64"
  config.vm.box_url = "http://files.vagrantup.com/precise64.box"

  # Create a private network, which allows host-only access to the machine
  # using a specific IP.
  config.vm.network :private_network, ip: "192.168.35.10"

  # Provider-specific configuration so you can fine-tune various
  # backing providers for Vagrant. These expose provider-specific options.
  # For VirtualBox:
  config.vm.provider :virtualbox do |vb|
    # Use VBoxManage to customize the VM. For example to change memory:
    vb.customize ["modifyvm", :id, "--memory", "512"]
  end

  # Ensure that we update the version of Chef on the guest machine. This has to
  # be a separate provision statement issued before the real provisioning
  # starts. This is because the version won't update until a new provisioning
  # block begins.
  config.vm.provision :shell, :inline => "apt-get update"
  config.vm.provision :shell, :inline => "apt-get -y --no-upgrade install build-essential ruby1.9.1-dev"
  config.vm.provision :shell, :inline => "gem install chef --no-rdoc --no-ri --conservative"

  # The real provisioning. Enable provisioning with chef solo. Paths are
  # relative to this project directory.
  config.vm.provision :chef_solo do |chef|
    # Set the log level.
    chef.log_level = "debug"
    # Set the paths.
    chef.cookbooks_path = "./cookbooks"
    chef.roles_path = "./roles"
    chef.environments_path = "./environments"
    # The environment provides all the necessary attributes.
    chef.environment = "local-vagrant"
    # Includes all of the other necessary recipies as dependencies, and
    # coordinates the necessary configuration of MySQL, Apache, etc.
    chef.add_role("example-server")
  end

end
