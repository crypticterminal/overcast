var fs = require('fs');
var cp = require('child_process');
var _ = require('lodash');
var utils = require('./utils');

exports.run = function (args) {
  var instances = utils.findMatchingInstances(args.name);
  utils.handleInstanceOrClusterNotFound(instances, args);

  if (args.parallel || args.p) {
    _.each(instances, function (instance) {
      runOnInstance(instance, _.cloneDeep(args));
    });
  } else {
    runOnInstances(_.toArray(instances), args);
  }
};

function runOnInstances(stack, args) {
  var instance = stack.shift();
  runOnInstance(instance, _.cloneDeep(args), function () {
    if (stack.length > 0) {
      runOnInstances(stack, args);
    }
  });
}

function runOnInstance(instance, args, next) {
  rsync({
    ip: instance.ip,
    user: args.user || instance.user,
    password: args.password || instance.password,
    name: instance.name,
    ssh_key: args['ssh-key'] || instance.ssh_key,
    ssh_port: instance.ssh_port,
    env: args.env,
    direction: args.direction,
    source: args.source,
    dest: args.dest
  }, function () {
    if (_.isFunction(next)) {
      next();
    }
  });
}

function rsync(options, next) {
  if (!options.ip) {
    return utils.die('IP missing.');
  }

  var color = utils.SSH_COLORS[utils.SSH_COUNT++ % 5];

  options.ssh_key = utils.normalizeKeyPath(options.ssh_key);
  options.ssh_port = options.ssh_port || '22';
  options.user = options.user || 'root';
  options.name = options.name || 'Unknown';

  var ssh = [];
  if (options.password) {
    ssh.push('sshpass');
    ssh.push('-p' + options.password);
  }
  ssh.push('ssh');
  ssh.push('-p');
  ssh.push(options.ssh_port);
  if (options.password) {
    ssh.push('-o');
    ssh.push('PubkeyAuthentication=no');
  } else {
    ssh.push('-i');
    ssh.push(options.ssh_key);
  }
  
  var args = [
    'rsync',
    '-e "' + ssh.join(' ') + '"',
    '-varuzP',
    '--delete',
    '--ignore-errors'
  ];

  if (options.direction === 'pull') {
    options.dest = utils.convertToAbsoluteFilePath(options.dest);
    options.dest = utils.replaceInstanceName(options.name, options.dest);
    args.push(options.user + '@' + options.ip + ':' + options.source);
    args.push(options.dest);
  } else if (options.direction === 'push') {
    options.source = utils.convertToAbsoluteFilePath(options.source);
    options.source = utils.replaceInstanceName(options.name, options.source);
    args.push(options.source);
    args.push(options.user + '@' + options.ip + ':' + options.dest);
  } else {
    return utils.die('No direction specified.');
  }

  utils.grey(args.join(' '));
  var rsyncProcess = utils.spawn(args);

  rsyncProcess.stdout.on('data', function (data) {
    utils.prefixPrint(options.name, color, data);
  });

  rsyncProcess.stderr.on('data', function (data) {
    utils.prefixPrint(options.name, color, data, 'grey');
  });

  rsyncProcess.on('exit', function (code) {
    if (code !== 0) {
      var str = 'rsync exited with a non-zero code (' + code + '). Stopping execution...';
      utils.prefixPrint(options.name, color, str, 'red');
      process.exit(1);
    }
    utils.success(options.source + ' transferred to ' + options.dest);
    console.log('');
    if (_.isFunction(next)) {
      next();
    }
  });
}
