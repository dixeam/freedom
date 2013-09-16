/*globals fdom:true, handleEvents, mixin, isAppContext, Worker */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */
if (typeof fdom === 'undefined') {
  fdom = {};
}
fdom.port = fdom.port || {};

/**
 * A freedom port providing debugging output to the console.
 * @uses handleEvents
 * @extends Port
 * @constructor
 */
fdom.port.Debug = function() {
  this.id = 'debug';
  this.emitChannel = false;
  this.console = null;
  this.config = false;
  handleEvents(this);
};

/**
 * Provide a textual description of this port.
 * @method toString
 * @return {String} the textual description.
 */
fdom.port.Debug.prototype.toString = function() {
  return '[Console]';
};

/**
 * Handler for receiving messages sent to the debug port.
 * These messages are used to retreive config for exposing console.
 * @method onMessage
 * @param {String} source the source identifier for the message.
 * @param {Object} message the received message.
 */
fdom.port.Debug.prototype.onMessage = function(source, message) {
  if (source === 'control' && message.channel && !this.emitChannel) {
    this.emitChannel = message.channel;
    this.config = message.config.debug;
    this.console = message.config.global.console;
    this.emit('ready');
  }
};

/**
 * Dispatch a debug message with arbitrary severity.
 * @method format
 * @param {String} severity the severity of the message.
 * @param {String} source The location of message.
 * @param {String[]} args The contents of the message.
 * @private
 */
fdom.port.Debug.prototype.format = function(severity, source, args) {
  if (!this.emitChannel) {
    this.on('ready', this.format.bind(this, severity, source, args));
    return;
  }
  this.emit(this.emitChannel, {
    severity: severity,
    source: source,
    quiet: true,
    request: 'debug',
    msg: args
  });
};

/**
 * Print received messages on the console.
 * @method print
 * @param {Object} message The message emitted by {@see format} to print.
 */
fdom.port.Debug.prototype.print = function(message) {
  var debug = Boolean(this.config), args, arr = [], i = 0;
  if (typeof this.config === 'string') {
    debug = false;
    args = this.config.split(' ');
    for (i = 0; i < args.length; i++) {
      if (args[i].indexOf('source:') === 0) {
        if (message.source === undefined ||
            message.source.indexOf(args[i].substr(7)) > -1) {
          debug = true;
          break;
        }
      } else {
        if (message.msg.indexOf(args[i]) > -1) {
          debug = true;
          break;
        }
      }
    }
  }
  if (!debug) {
    return;
  }
  if (typeof console !== 'undefined' && console !== this) {
    args = JSON.parse(message.msg);
    while (args[i] !== undefined) {
      arr.push(args[i]);
      i += 1;
    }
    if (message.source) {
      arr.unshift('color: red');
      arr.unshift('%c ' + message.source);
    }
    console[message.severity].apply(console, arr);
  }
};

/**
 * Print a log message to the console.
 * @method log
 */
fdom.port.Debug.prototype.log = function() {
  this.format('log', undefined, JSON.stringify(arguments));
};

/**
 * Print a warning message to the console.
 * @method warn
 */
fdom.port.Debug.prototype.warn = function() {
  this.format('warn', undefined, JSON.stringify(arguments));
};

/**
 * Print an error message to the console.
 * @method error
 */
fdom.port.Debug.prototype.error = function() {
  this.format('error', undefined, JSON.stringify(arguments));
};