var bunyan = require('bunyan');
var log = bunyan.createLogger(
  {
    name: 'applog',
    streams: [
      {
        level: 'info',
        stream: process.stdout            // log INFO and above to stdout
      }
    ]
  });

module.exports.express = {
  customMiddleware: function (app) {
    // request logger, too bad I can't put it any higher....
    app.use(function requestLogger(req, res, next) {
      var start = new Date();
      // I used to listen to 'end' event, but it is not emitted when I POST to addToCart.  Probably because POST sends data, and
      // requires a request.resume() to emit 'end'.  Instead, I listen to 'finish', which is clearly documented in Node.js docs
      // Module HTTP Class: http.ServerResponse http://nodejs.org/api/http.html#http_event_finish
      res.on('finish', function () {
        var responseTime = ((new Date()).getTime() - start.getTime()) / 1000.0; // in seconds (to be in same unit of measure as nginx)
        req.responseTime = responseTime;
        log.info({ req: req }, 'requestlog');
      });
      next();

    });
  }
};
