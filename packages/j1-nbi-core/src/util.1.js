/**
 * Private utility functions used primarily by NbInteract.js
 */
import { KernelMessage } from '@jupyterlab/services'

const j1        = window.j1;
var message     = {};
var renderCount = 0;
var messageLast = false;
var response;
var responseText;
var widgets;
var widgetsRendered;

/**
 * Converts a notebook HTTP URL to a WebSocket URL
 */
export const baseToWsUrl = baseUrl =>
  (baseUrl.includes('localhost') ? 'ws:' : 'wss:') +
  baseUrl
    .split(':')
    .slice(1)
    .join(':')

/**
 * Message type for widgets
 */
export const WIDGET_MSG = 'application/vnd.jupyter.widget-view+json'

/**
 * Functions to work with notebook DOM
 */
export const codeCells = () => document.querySelectorAll('.code_cell')
export const widgetCells = () => document.querySelectorAll('.output_wrapper').length
export const widgetCellsRendered = () => document.querySelectorAll('.widget-vbox').length

export const pageHasWidgets = () =>
  document.querySelector('.output_widget_view') !== null

export const cellToCode = cell =>
  cell.querySelector('.input_area').textContent.trim()

export const isWidgetCell = cell =>
  cell.querySelector('.output_widget_view') !== null

export const cellToWidgetOutput = cell =>
  cell.querySelector('.output_widget_view')

/**
 * Functions to work with nbinteract status buttons
 * Keep CSS class in sync with nbinteract/templates/*.tpl
 */
export const statusButtons = (cell = document) =>
  cell.querySelectorAll('.js-nbinteract-widget')

export const setButtonsStatus = (message, cell = document) => {
  statusButtons(cell).forEach(button => {
    button.innerHTML = message
  })
}

export const setButtonsError = (message, cell = document) => {
  statusButtons(cell).forEach(button => {
    button.disabled = true

    const error = document.createElement('pre')
    error.innerText = message
    error.style.cssText = 'text-align: left; font-size: 0.9em;'

    button.innerHTML = ''
    button.appendChild(error)
  })
}

export const removeButtons = (cell = document) => {
  statusButtons(cell).forEach(button => button.remove())
}

/**
 * Functions to work with kernel messages
 */
export const isErrorMsg = msg => msg.msg_type === 'error'

export const msgToModel = async (msg, manager) => {

  if (!KernelMessage.isDisplayDataMsg(msg)) {
    return false
  }

  const widgetData = msg.content.data[WIDGET_MSG]
  if (widgetData === undefined || widgetData.version_major !== 2) {
    return false
  }

  const getModelID = async () => {
    // see: https://stackoverflow.com/questions/10441717/javascript-scope-in-a-try-block
    try {
      renderCount++;
    	response              = await manager.get_model(widgetData.model_id);
      responseText          = JSON.stringify(response);
      widgets               = widgetCells();
      widgetsRendered       = widgetCellsRendered();
    } finally {
      // console.log('nbinteract-core.util\n got the widget model id: ' + responseText);

      if (!messageLast && !widgetsRendered) {
        messageLast = true;                                                     // issue message only once
        // console.error('nbinteract-core.util\n render the first widget failed');
        message.type    = 'command';
        message.action  = 'error';
        message.text    = 'Widget initialization failed.';
        j1.sendMessage('nbinteract-core.util', 'j1.adapter.nbinteract', message);
      }

      if (!messageLast && widgetsRendered >= 1) {
        messageLast = true;                                                     // issue message only once
        // console.log('nbinteract-core.util\n first widget successfully rendered');
        message.type    = 'command';
        message.action  = 'info';
        message.text    = 'First widget successfully rendered';
        j1.sendMessage('nbinteract-core.run', 'j1.adapter.nbinteract', message);
      }

      if (!messageLast && widgetsRendered >= 1) {
        message.type    = 'command';
        message.action  = 'info';
        message.text    = 'Displaying widget finished on id: ' + responseText;
        j1.sendMessage('nbinteract-core.run', 'j1.adapter.nbinteract', message);
      }
  }

  // wait some ms for the FIRST render
  //
  window.setTimeout(function() {
     getModelID();
  }, 250);


  // var renderCount = 0;
  // var dependencies_met_first_vbox_loaded = setInterval(function() {
  //   if (widgetCellsRendered()) {
  //     clearInterval(dependencies_met_first_vbox_loaded);
  //     getModelID();
  //   }
  //   renderCount += 1;
  //   if (renderCount > 1) {
  //     console.warn('nbinteract-core.util\n render the first widget took too long: ' + renderCount + 'ms');
  //   }
  // }, 25); // END dependencies_met_nb_loaded

  const model = await manager.get_model(widgetData.model_id);
  return model;
}
