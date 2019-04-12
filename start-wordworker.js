#!/usr/bin/env node

/* global process */

var Wordworker = require('./wordworker');
var logFormat = require('log-format');
var secrets = require('./configs/secrets');

const port = 7568;

Wordworker(
  {
    secrets
  },
  useServer
);

function useServer(error, server) {
  if (error) {
    process.stderr.write(logFormat(error.message, error.stack));
    process.exit(1);
    return;
  }

  server.listen(port, onReady);

  function onReady(error) {
    if (error) {
      logError(error);
    } else {
      process.stdout.write(logFormat(server.name, 'listening at', server.url));
    }
  }
}

function logError(error) {
  process.stderr.write(logFormat(error.message, error.stack));
}
