var _ = require('lodash');
var Promise = require('bluebird');
var utils = require('../utils');
var ssh = require('../ssh');
var cli = require('../cli');

var API = {
  AWS: require('./aws.js'),
  DigitalOcean: require('./digitalocean.js'),
  Linode: require('./linode.js'),
  VirtualBox: require('./virtualbox.js')
};

exports.run = function (args) {
  utils.argShift(args, 'name');

  if (!args.name) {
    return utils.missingParameter('[instance|cluster|all]', exports.help);
  }

  var instances = utils.findMatchingInstances(args.name);
  utils.handleInstanceOrClusterNotFound(instances, args);

  var self = { queue: Promise.resolve() };

  function addPromise(fn) {
    // We need to overwrite queue to make `then` sequential.
    self.queue = self.queue.then(function () {
      return new Promise(fn);
    });
  }

  _.each(instances, function (instance) {
    if (instance.digitalocean) {
      addPromise(function (resolve) {
        args.command = 'digitalocean';
        args.subcommand = 'reboot';
        args._.unshift(instance.name);
        delete args.name;
        cli.run(API.DigitalOcean.commands.reboot, args, resolve);
      });
    } else if (instance.linode && instance.linode.id) {
      addPromise(function (resolve) {
        args.command = 'linode';
        args.subcommand = 'reboot';
        args._.unshift(instance.name);
        delete args.name;
        cli.run(API.Linode.commands.reboot, args, resolve);
      });
    } else if (instance.aws && instance.aws.id) {
      addPromise(function (resolve) {
        args.command = 'aws';
        args.subcommand = 'reboot';
        args._.unshift(instance.name);
        delete args.name;
        cli.run(API.AWS.commands.reboot, args, resolve);
      });
    } else if (instance.virtualbox) {
      addPromise(function (resolve) {
        args.command = 'virtualbox';
        args.subcommand = 'reboot';
        args._.unshift(instance.name);
        delete args.name;
        cli.run(API.VirtualBox.commands.reboot, args, resolve);
      });
    } else {
      addPromise(function (resolve) {
        ssh.run({ name: instance.name, _: ['reboot'] }, function () {
          // Giving the server some time to shutdown before testing for connectivity.
          setTimeout(function () {
            utils.waitForBoot(instance, resolve);
          }, 10 * 1000);
        });
      });
    }
  });

  self.queue.catch(function (err) {
    utils.die('Error: ' + err);
  }).then(function () {
    utils.success('All instances rebooted.');
  });
};

exports.signatures = function () {
  return [
    '  overcast reboot [instance|cluster|all]'
  ];
};

exports.help = function () {
  utils.printArray([
    'overcast reboot [instance|cluster|all]',
    '  Reboot an instance or cluster.'.grey,
    '',
    '  If the instance was created using AWS, DigitalOcean or Linode,'.grey,
    '  this will use the provider API. Otherwise this will execute the "reboot"'.grey,
    '  command on the server and then wait until the server is responsive.'.grey
  ]);
};
