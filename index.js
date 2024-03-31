// Tiny node server to make Render deploy status available

// TODO: Should we only call dotenv in DEV mode?
require('dotenv')
  .config();
const express = require('express');
const compression = require('compression');
const api = require('api');
const { titleCase } = require('tiny-case');
const debug = require('debug')('main');

const app = express();
app.use(compression());

const renderApi = api('@render-api/v1.0#34i64rhilu8ilhkj');
renderApi.auth(process.env.API_KEY);

// Display strings
const unknown = 'unknown';
const inProgress = 'in progress';
const success = 'success';
const failed = 'failed';
const status = (deployStatus) => {
  // If we are given a key other than a string, we don't know what's going on
  if (typeof deployStatus !== 'string') {
    return unknown;
  }

  // Otherwise map the deploy status to a display string
  // This maps all possible values of deploy status currently available at https://api-docs.render.com/reference/get-deploys
  const statusMap = {
    created: inProgress,
    build_in_progress: inProgress,
    update_in_progress: inProgress,
    live: success,
    deactivated: failed,
    build_failed: failed,
    update_failed: failed,
    canceled: failed,
    pre_deploy_in_progress: inProgress,
    pre_deploy_failed: failed,
  };

  return statusMap[deployStatus] ?? unknown;
};

const color = (statusDisplay) => {
  const statusColorMap = {
    [inProgress]: 'important',
    [success]: 'success',
    [failed]: 'critical',
  };
  return statusColorMap[statusDisplay] ?? 'inactive';
};

app.get('/:id?', (req, res) => {
  const serviceId = req.params.id;

  if (!serviceId) {
    res.json({
      status: status(null), // Unknown
    });
    debug('No service ID in url');
    return;
  }
  debug(`Getting deploys for Render service: ${serviceId}`);

  renderApi.getDeploys({
    limit: '1',
    serviceId,
  })
    .then(({ data }) => {
      res.json({
        status: status(data[0]?.deploy?.status),
      });
    })
    .catch((err) => {
      res.json({
        status: status(null), // Unknown
      });
      debug(err);
    });
});
app.get('/endpoint/:id?', (req, res) => {
  const serviceId = req.params.id;

  const responseObject = {
    schemaVersion: 1,
    label: 'Render Unknown Service',
    message: status(null),
    color: color(null),
    namedLogo: 'render',
    isError: true,
  };
  if (!serviceId) {
    res.json(responseObject);
    debug('No service ID in url');
    return;
  }
  renderApi.getService({ serviceId })
    .then(({ data }) => {
      const serviceName = titleCase(data.name);
      debug(`Getting deploys for Render service: ${serviceName}(${serviceId})`);
      responseObject.label = `Render ${serviceName}`;
      renderApi.getDeploys({
        limit: '1',
        serviceId,
      })
        .then(({ data }) => {
          responseObject.message = status(data[0]?.deploy?.status);
          responseObject.color = color(responseObject.message);
          responseObject.isError = false;
          res.json(responseObject);
        })
        .catch((err) => {
          responseObject.message = status(null);
          responseObject.color = color(null);
          res.json(responseObject);
          debug(err);
        });
    })
    .catch((err) => {
      responseObject.message = status(null);
      responseObject.color = color(null);
      res.json(responseObject);
      debug(err);
    });
});

const port = process.env.PORT || 3001;
debug(`NODE_ENV: ${process.env.NODE_ENV}`);
const server = app.listen(port, () => {
  debug(`App listening on port ${port}`);
});

async function closeGracefully(signal) {
  debug(`*^!@4=> Received signal to terminate: ${signal}`);
  await server.close();
  process.kill(process.pid, signal);
}

process.once('SIGINT', closeGracefully);
process.once('SIGTERM', closeGracefully);
