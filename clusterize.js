"use strict";
var _ = require('lodash');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var util = require('util');

/**
 * List of processes forked by master keyed (properties) by pid, values are:
 * 'f' - forked, 'o' - online, 'k' - master-triggered kill, 'r' - master-triggered respawn
 * If a forked process dies, it is removed from the list
 */
var managedPids = {};

var forker;
var killer;
var options;

module.exports = function (settings) {
  forker = settings.forker;
  killer = settings.killer;
  options = settings.options;

  if (cluster.isWorker) {
    // Workers can share any TCP connection
    if (typeof forker === "function") {
      forker();
    }
  }

  if (cluster.isMaster) {
    var masterSettings = {};

    if (typeof forker === "string") {
      // forker is a file path to worker script file
      masterSettings.exec = forker;
    }
    if (options.silent !== undefined) {
      masterSettings.silent = options.silent;
    }
    cluster.setupMaster(masterSettings);
    if (killer === undefined) { // default killer to worker.disconnect
      killer = disconnectWorker;
    }

    process.on('SIGUSR2', function () {
      util.log('Got SIGUSR2.');
      if (cluster.isMaster) {
        util.log(' on master. recycling workers.');
        restartWorkers();
      }
    });

    cluster.on('fork', function (worker) {
      managedPids[worker.process.id] = 'f';
    });

    cluster.on('online', function (worker) {
      managedPids[worker.process.id] = 'o';
    });

    cluster.on('exit', function (worker, code, signal) {
      util.log('worker ' + worker.process.pid + ' died. code: ', code, 'signal: ', signal);
      if (managedPids[worker.process.pid] === 'k') {
        // master wanted this process dead, so no respawn
      } else {
        startWorker();
        util.log('worker respawned');
      }
      delete managedPids[worker.process.pid];
    });

    process.on("SIGINT", function () {
      util.log("Got SIGINT. Shutting down.");
      stopWorkers();
      process.exit();
    });

    startWorkers(options);
  }
};

function startWorkers(options) {
  if (!cluster.isMaster) return;

  options = options || { poolSize: numCPUs };
  var poolSize = options.poolSize || numCPUs;

  // Fork workers.
  if (options.startDelay !== undefined) {
    // start workers with a delay in between
    startWorkerLoop(options, poolSize);
  } else {
    for (var i = 0; i < poolSize; i++) {
      startWorker(options);
    }
  }
}

function startWorkerLoop(options, countDown) {
  if (countDown <= 0) return;
  startWorker(options);
  setTimeout(startWorkerLoop, options.startDelay, options, countDown-1);
}

function startWorker(options) {
  cluster.fork();
}

function restartWorkers() {
  // remember the current workers
  var nowWorkers = [];
  _.forOwn(cluster.workers, function (v, id) {
    nowWorkers.push(id);
  });

  if (options.restartDelay !== undefined) {
    restartWorkerLoop(nowWorkers);
  } else {
    while (nowWorkers.length > 0) {
      var w = cluster.workers[nowWorkers[0]];
      if (w !== undefined) {
        stopWorker(w, 'r');
      }
      nowWorkers.shift();
    }
  }
}

function restartWorkerLoop(nowWorkers) {
  if (nowWorkers.length <= 0) return;
  var w = cluster.workers[nowWorkers[0]];
  if (w !== undefined) {
    stopWorker(w, 'r');
  }
  nowWorkers.shift();

  setTimeout(restartWorkerLoop, options.restartDelay, nowWorkers);
}

function disconnectWorker(worker) {
  worker.disconnect();
}

function stopWorkers() {
  // remember the current workers
  var nowWorkers = [];
  _.forOwn(cluster.workers, function (v, id) {
    nowWorkers.push(id);
  });

  while (nowWorkers.length > 0) {
    var w = cluster.workers[nowWorkers[0]];
    if (w !== undefined) {
      stopWorker(w, 'k');
    }
    nowWorkers.shift();
  }
}

function stopWorker(w, flag) {
  managedPids[w.process.pid] = flag;  // master-triggered kill or master-triggered respawn
  // set up timeout before disconnecting from worker
  var timeout = setTimeout(function () {
    util.log('force kill ' + w.process.pid);
    w.kill();
  }, 60000);  // wait a minute before force kill - this would mean that new code would be loaded BEFORE processing is completed by the worker
  w.on('disconnect', function () {
    util.log('disconnected ' + w.process.pid);
    clearTimeout(timeout);
  });
  // properly kill worker (sails.js) using SIGINT.  A mere w.disconnect() is insufficient for Sails+Express cleanup
  killer(w);  //w.kill('SIGINT');
}
