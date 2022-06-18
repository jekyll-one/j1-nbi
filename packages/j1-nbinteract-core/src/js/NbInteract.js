import log4javascript from 'log4javascript'

import debounce from 'lodash.debounce'

import { Kernel, ServerConnection } from '@jupyterlab/services'

import { WidgetManager } from './manager'
import * as util from './util.js'
import BinderHub from './BinderHub'

const DEFAULT_BASE_URL  = 'https://mybinder.org'
const DEFAULT_PROVIDER  = 'gh'
const DEFAULT_SPEC      = 'SamLau95/nbinteract-image/master'

var message             = {};
var buttonState         = '';
var debug               = false;

/**
 * Main entry point for nbinteract
 *
 * Class that runs notebook code and create widgets
 */
export default class NbInteract {

  /**
   * Initialize NbInteract. Does not start kernel until run() is called.
   *
   * @param {Object} [config] - Configuration for NbInteract
   *
   * @param {String} [config.spec] - BinderHub spec for Jupyter image. Must be
   *     in the format: `${username}/${repo}/${branch}`. Defaults to
   *     'SamLau95/nbinteract-image/master'.
   *
   * @param {String} [config.baseUrl] - Binder URL to start server. Defaults to
   *     https://mybinder.org.
   *
   * @param {String} [config.provider] - BinderHub provider. Defaults to 'gh'
   *     for GitHub.
   *
   * @param {String} [config.nbUrl] - Full URL of a running notebook server.
   *     If set, NbInteract ignores all Binder config and will directly request
   *     Python kernels from the notebook server.
   *
   *     Defaults to `false` by default as Binder is used to start
   *     a notebook server.
   */
  constructor({
    spec = DEFAULT_SPEC,
    baseUrl = DEFAULT_BASE_URL,
    provider = DEFAULT_PROVIDER,
    nbUrl = false,
    logger = false,
    j1API = false,
    debug = false,
  } = {}) {

    this.logger = logger;
    this.j1     = j1API;

    this.run = debounce(this.run, 500, {
      leading: true,
      trailing: false,
    })
    this._kernelHeartbeat = this._kernelHeartbeat.bind(this)

    this.binder = new BinderHub({ spec, baseUrl, provider, nbUrl, logger, j1API })

    // Keep track of properties for debugging
    this.kernel = null
    this.manager = null
  }

  /**
   * Attaches event listeners to page that call run() when clicked. Updates
   * status text of elements as server is started until widget is rendered.
   * When widgets are rendered, removes all status elements.
   *
   * If a running kernel is cached in localStorage, creates widgets without
   * needing button click.
   */
  async prepare() {

    this.logger.debug('\n' + 'nbinteract.prepare: ' + 'nbinteract core is being initialized');

    // The widget buttons show loading indicator text by default. At this
    // point, nbinteract is ready to run so we change the button text to match.
    util.setButtonsStatus('Show widgets')

    this.binder.registerCallback('failed', (oldState, newState, data) => {

      message.type    = 'command';
      message.action  = 'error';
      message.text    = `Error, try refreshing the page:<br> ${data.message}`;
      this.j1.sendMessage('nbinteract-core.prepare', 'j1.adapter.nbinteract', message);

      // util.setButtonsError(
      //   `Error, try refreshing the page:<br> ${data.message}`,
      // )
    })

    // util.statusButtons().forEach(button => {
    //   button.addEventListener('click', e => {
    //     this.run()
    //   })
    // })

    this.runIfKernelExists()
  }

  /**
   * Starts kernel if needed, runs code on page, and initializes widgets.
   */
  async run() {

    if (debug) this.logger.debug('\n' + 'nbinteract.run: started');

    // The logic to remove the status buttons is temporarily in
    // manager.js:_displayWidget since it's tricky to implement here.
    // TODO(sam): Move the logic here instead.
    util.setButtonsStatus('Initializing widgets ...')

    message.type    = 'command';
    message.action  = 'info';
    message.text    = 'Initializing widgets ...';
    this.j1.sendMessage('nbinteract-core.run', 'j1.adapter.nbinteract', message);

    // Normally, we wait until one widget displays before removing the show
    // widget buttons. However, if there are no widgets on the page, we should
    // just remove all buttons since the top level button is generated
    // regardless of whether the page contains widgets.
    if (util.codeCells().length === 0) {
      util.removeButtons()
    }

    const firstRun = !this.kernel || !this.manager
    try {
      this.kernel = await this._getOrStartKernel()
      this.manager = this.manager || new WidgetManager(this.kernel)
      this.manager.generateWidgets()

      message.type    = 'command';
      message.action  = 'info';
      message.text    = 'Widget initialization started ...';
      this.j1.sendMessage('nbinteract-core.run', 'j1.adapter.nbinteract', message);

      message.type    = 'command';
      message.action  = 'nbi_init_started';
      message.text    = 'nbinteract initialization finished.';
      this.j1.sendMessage('nbinteract-core.run', 'j1.adapter.nbinteract', message);

      if (firstRun) this._kernelHeartbeat()
    } catch (err) {
      debugger
//    console.log ('Error in widget initialization :(')
      this.logger.info('\n' + 'nbinteract-core.run: '+ 'widget initialization failed');

      message.type    = 'command';
      message.action  = 'error';
      message.text    = 'Widget initialization failed.';
      this.j1.sendMessage('nbinteract-core.run', 'j1.adapter.nbinteract', message);

      // throw err
    }
  }

  /**
   * Same as run(), but only runs code if kernel is already started.
   */
  async runIfKernelExists() {

    if (debug) this.logger.debug('\n' + 'nbinteract.runIfKernelExists: started');

    try {
      await this._getKernelModel()
    } catch (err) {
      // console.log (
      //   'No kernel, stopping the runIfKernelExists() call. Use the',
      //   'run() method to automatically start a kernel if needed.',
      // )
      this.logger.info('\n' + 'nbinteract.runIfKernelExists: '
        + 'no kernel, stopping the runIfKernelExists() call.'
        + '\n'
        + 'use the run() method to automatically start a kernel if needed'
      );
      // jadams
      // call 'run()' method to automatically start a kernel
      this.run()
      return
    }

    this.run()
  }

  /**********************************************************************
   * Private methods
   **********************************************************************/

  /**
   * Checks kernel connection every seconds_between_check seconds. If the
   * kernel is dead, starts a new kernel and re-creates widgets.
   */
  async _kernelHeartbeat(seconds_between_check = 5) {
    try {
      await this._getKernelModel()
    } catch (err) {
      this.logger.info('\n' + 'nbinteract.kernelHeartbeat: ' + 'looks like the kernel has died');
//    console.log ('Looks like the kernel died:', err.toString())
      this.logger.info('\n' + 'nbinteract.kernelHeartbeat: ' + 'starting a new kernel ...');
//    console.log ('Starting a new kernel...')

      message.type    = 'command';
      message.action  = 'info';
      message.text    = 'Seems the kernel has died, starting a new kernel ...';
      this.j1.sendMessage('nbinteract-core.kernelHeartbeat', 'j1.adapter.nbinteract', message);

      const kernel = await this._startKernel()
      this.kernel = kernel

      this.manager.setKernel(kernel)
      this.manager.generateWidgets()
    } finally {
      setTimeout(this._kernelHeartbeat, seconds_between_check * 5000)
    }
  }

  /**
   * Private method that starts a Binder server, then starts a kernel and
   * returns the kernel information.
   *
   * Once initialized, this function caches the server and kernel info in
   * localStorage. Future calls will attempt to use the cached info, falling
   * back to starting a new server and kernel.
   */
  async _getOrStartKernel() {
    if (debug) this.logger.debug('\n' + 'nbinteract.getOrStartKernel: started');

    if (this.kernel) {
      return this.kernel
    }

    try {
      const kernel = await this._getKernel();
      const kernelID = kernel._id;

      // console.log ('Connected to cached kernel.')
      this.logger.info('\n' + 'nbinteract.getOrStartKernel: ' + 'connected to cached kernel: ' + kernelID);

      message.type    = 'command';
      message.action  = 'info';
      message.text    = 'Connected to cached kernel ...';
      this.j1.sendMessage('nbinteract-core.getOrStartKernel', 'j1.adapter.nbinteract', message);

      return kernel
    } catch (err) {
      var errMsg = err.toString();

      // this.logger.info('\n' + 'no cached kernel found, starting kernel on BinderHub: ' + err.toString());
      this.logger.info('\n' + 'nbinteract.getOrStartKernel: ' + 'no cached kernel found.');
      this.logger.info('\n' + 'nbinteract.getOrStartKernel: ' + 'starting new kernel on BinderHub ...');

      message.type    = 'command';
      message.action  = 'info';
      message.text    = 'No cached kernel found.';
      this.j1.sendMessage('nbinteract-core.getOrStartKernel', 'j1.adapter.nbinteract', message);

      message.type    = 'command';
      message.action  = 'info';
      message.text    = 'Starting new kernel on BinderHub ...';
      this.j1.sendMessage('nbinteract-core.getOrStartKernel', 'j1.adapter.nbinteract', message);

      // console.log (
      //   'No cached kernel, starting kernel on BinderHub:',
      //   err.toString(),
      // )

      const kernel = await this._startKernel()
      return kernel
    }
  }

  /**
   * Connects to kernel using cached info from localStorage. Throws exception
   * if kernel connection fails for any reason.
   */
  async _getKernel() {
    if (debug) this.logger.debug('\n' + 'nbinteract.getKernel: started');

    const { serverSettings, kernelModel } = await this._getKernelModel()
    return await Kernel.connectTo(kernelModel, serverSettings)
  }

  /**
   * Retrieves kernel model using cached info from localStorage. Throws
   * exception if kernel doesn't exist.
   */
  async _getKernelModel() {

    if (debug) this.logger.debug('\n' + 'nbinteract.getKernelModel: started');

    // const { serverParams, kernelId } = localStorage
    // const { url, token } = JSON.parse(serverParams)

    // for better browser compatibility
    const serverParams = localStorage.getItem('serverParams')
    const kernelId = localStorage.getItem('kernelId')
    const { url, token } = JSON.parse(serverParams)

    if (debug) {
      var readKernelId = localStorage.getItem('kernelId');
      if (readKernelId.length) {
        this.logger.info('\n' + 'Read Binder settings from localStorage: successful');
      } else {
        this.logger.error('\n' + 'Read Binder settings from localStorage: failed');
      }
    }

    const serverSettings = ServerConnection.makeSettings({
      baseUrl: url,
      wsUrl: util.baseToWsUrl(url),
      token: token,
    })

    const kernelModel = await Kernel.findById(kernelId, serverSettings)
    return { serverSettings, kernelModel }
  }

  /**
   * Starts a new kernel using Binder and returns the connected kernel. Stores
   * localStorage.serverParams and localStorage.kernelId .
   */
  async _startKernel() {

    if (debug) this.logger.debug('\n' + 'nbinteract.startKernel: started');

    try {
      const { url, token } = await this.binder.startServer()

      // Connect to the notebook webserver.
      const serverSettings = ServerConnection.makeSettings({
        baseUrl: url,
        wsUrl: util.baseToWsUrl(url),
        token: token,
      })

      // Start a kernel
      const kernelSpecs = await Kernel.getSpecs(serverSettings)
      const kernel = await Kernel.startNew({
        name: kernelSpecs.default,
        serverSettings,
      })

      // Store the params in localStorage for later use
      //
      // localStorage.serverParams = JSON.stringify({ url, token })
      // localStorage.kernelId = kernel.id

      // for better browser compatibility
      localStorage.setItem('serverParams', JSON.stringify({ url, token }));
      localStorage.setItem('kernelId', kernel.id);

      if (debug) {
        var readKernelId = localStorage.getItem('kernelId');
        if (readKernelId.length) {
          this.logger.info('\n' + 'Save Binder settings to localStorage: successful');
        } else {
          this.logger.error('\n' + 'Save Binder settings to localStorage: failed');
        }
      }

//    console.log ('Started kernel:', kernel.id)
      this.logger.info('\n' + 'nbinteract-core.startKernel: ' + 'started kernel: '+ kernel.id);

      message.type    = 'command';
      message.action  = 'info';
      message.text    = 'Kernel successfully started.';
      this.j1.sendMessage('nbinteract-core.startKernel', 'j1.adapter.nbinteract', message);

      return kernel
    } catch (err) {
      debugger
      this.logger.error('\n' + 'nbinteract-core: startKernel, ' + 'initialization kernel failed');

      message.type    = 'command';
      message.action  = 'error';
      message.text    = 'Initialization of the kernel failed.';
      this.j1.sendMessage('nbinteract-core.startKernel', 'j1.adapter.nbinteract', message);

//    console.error('Error in kernel initialization :(')
//    throw err
    }
  }

  async _killKernel() {
    const kernel = await this._getKernel()
    return kernel.shutdown()
  }
}
