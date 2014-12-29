require('./clusterize')({
  // forker - the function to run when a worker process is spun up
  forker: function () {
    // Start sails and pass it command line arguments
    require('sails').lift(require('optimist').argv);
  },
  // killer - the function to tell a worker to quit gracefully
  killer: function (worker) {
    // properly kill worker (sails.js) using SIGINT.  A mere w.disconnect() is insufficient for Sails+Express cleanup
    worker.kill('SIGINT');
  },
  options: { restartDelay: 2000 }
});
