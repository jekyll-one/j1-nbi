/**
 * Methods for starting kernels using BinderHub.
 */

// States that you can register callbacks on
// Keep in sync with https://github.com/jupyterhub/binderhub/blob/master/doc/api.rst#events
const VALID_STATES = new Set([
  '*',
  'failed',
  'built',
  'waiting',
  'building',
  'fetching',
  'pushing',
  'launching',
  'ready',
])

var message = {};

/**
 * Implements the Binder API to start kernels.
 */
export default class BinderHub {
  /**
   *
   * @param {Object} [config] - Config for BinderHub
   *
   * @param {String} [config.spec] - BinderHub spec for Jupyter image. Must be
   *     in the format: `${username}/${repo}/${branch}`.
   *
   * @param {String} [config.baseUrl] - Binder URL to start server.
   *
   * @param {String} [config.provider] - BinderHub provider (e.g. 'gh' for
   * Github)
   *
   * @param {Object} [config.callbacks] - Mapping from state to callback fired
   *     when BinderHub transitions to that state.
   *
   * @param {String} [config.nbUrl] - Full URL of a running notebook server.
   *     If set, NbInteract ignores all Binder config and will directly request
   *     Python kernels from the notebook server.
   *
   *     Defaults to `false`; by default we use Binder to start a notebook
   *     server.
   */
  constructor({
    spec,
    baseUrl,
    provider,
    callbacks = {},
    nbUrl = false,
    logger = false,
    j1API = false,
  } = {}) {
    this.baseUrl = baseUrl
    this.provider = provider
    this.spec = spec
    this.nbUrl = nbUrl
    this.logger = logger
    this.j1     = j1API;

    this.callbacks = callbacks
    this.state = null

    // Log all messages sent by Binder
    //
    this.registerCallback('*', (oldState, newState, data) => {
      if (data.message !== undefined) {

        // Overloaded BinderHub
      	if (data.message.includes('Insufficent nodes')) {
          this.logger.error('\n' + 'binderhub.registerCallback: ' + 'messages sent by Binder: ' + data.message.slice(0,-1));

          message.type    = 'command';
          message.action  = 'error';
          message.text    = 'Insufficent nodes avaialble at BinderHub';
          this.j1.sendMessage('binderhub.registerCallback', 'j1.adapter.nbinteract', message );
        }

        // Overloaded BinderHub
        if (data.message.includes('Too many users')) {
          this.logger.error('\n' + 'binderhub.registerCallback: ' + 'messages sent by Binder: ' + data.message.slice(0,-1));

          message.type    = 'command';
          message.action  = 'error';
          message.text    = 'Too many users on this BinderHub';
          this.j1.sendMessage('binderhub.registerCallback', 'j1.adapter.nbinteract', message );
        }

        // Processing failed at BinderHub
        if (data.message.includes('ImagePullBackOff')) {
          this.logger.error('\n' + 'binderhub.registerCallback: ' + 'messages sent by Binder: ' + data.message.slice(0,-1));

          message.type    = 'command';
          message.action  = 'error';
          message.text    = 'Error: ImagePullBackOff';
          this.j1.sendMessage('binderhub.registerCallback', 'j1.adapter.nbinteract', message );
        }

//      console.log(data.message)
        this.logger.info('\n' + 'binderhub.registerCallback: ' + 'messages sent by Binder: ' + data.message.slice(0,-1));

        message.type    = 'command';
        message.action  = 'info';
        message.text    = data.message.slice(0,-1);
        this.j1.sendMessage('binderhub.registerCallback', 'j1.adapter.nbinteract', message);
      } else {
//      console.log(data)
        this.logger.info('\n' + 'binderhub.registerCallback: ' + 'messages sent by Binder: ' + data.slice(0,-1));

        message.type    = 'command';
        message.action  = 'info';
        message.text    = data.slice(0,-1);
        this.j1.sendMessage('binderhub.registerCallback', 'j1.adapter.nbinteract', message);
      }
    })
  }

  apiUrl() {
    return `${this.baseUrl}/build/${this.provider}/${this.spec}`
  }

  startServer() {
    if (this.nbUrl) {
      return Promise.resolve({
        url: this.nbUrl,
      })
    }

    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(this.apiUrl())

      eventSource.onerror = err => {
        var error_text = JSON.stringify(err);

        this.logger.error('\n' + 'binderhub.startServer: ' + 'stopping nbinteract, failed to connect to Binder: ' + error_text);

        message.type    = 'command';
        message.action  = 'error';
        message.text    = 'failed to connect to Binder:\n' + error_text;
        this.j1.sendMessage('binderhub.startServer', 'j1.adapter.nbinteract', message );

        eventSource.close()
        reject(new Error(err))
      }

      eventSource.onmessage = event => {
        const data = JSON.parse(event.data)

        if (data.phase) {
          this.changeState(data.phase.toLowerCase(), data)
        }
      }

      this.registerCallback('failed', (oldState, newState, data) => {
        this.logger.error('\n' + 'binderhub.startServer: ' + 'Failed to build Binder image:\n' + data.message.slice(0,-1));

        // console.error(
        //   'Failed to build Binder image. Stopping nbinteract...',
        //   data,
        // )

        // message.type    = 'command';
        // message.action  = 'error';
        // message.text    = 'failed to build Binder image:\n' + data.message.slice(0,-1);
        // this.j1.sendMessage('nbinteract-core.startKernel', 'j1.adapter.nbinteract', message );

        eventSource.close()
        reject(new Error(data))
      });

      // When the Binder server is ready, `data` contains the information
      // needed to connect.
      this.registerCallback('ready', (oldState, newState, data) => {
        this.logger.info('\n' + 'binderhub.startServer: ' + 'Binder server is ready, continue ...');
        eventSource.close()
        resolve(data)

      })
    })
  }

  registerCallback(state, cb) {
    if (!VALID_STATES.has(state)) {
      this.logger.error('\n' + 'binderhub.registerCallback: ' + 'tried to register callback on invalid state: ' + state);
//    console.error(`Tried to register callback on invalid state: ${state}`)
      return
    }

    if (this.callbacks[state] === undefined) {
      this.callbacks[state] = [cb]
    } else {
      this.callbacks[state].push(cb)
    }
  }

  changeState(newState, data) {
    ;[newState, '*'].map(key => {
      const callbacks = this.callbacks[key]
      if (callbacks) {
        callbacks.forEach(callback => callback(this.state, newState, data))
      }
    })

    if (newState) {
      this.state = newState
    }
  }
}
