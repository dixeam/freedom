/*globals freedom:true, WebSocket */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Implementation of a Social provider that depends on
 * the WebSockets server code in server/router.py
 * The current implementation uses a public facing common server
 * hosted on p2pbr.com
 *
 * The provider offers
 * - A single global buddylist that everyone is on
 * - no reliability
 * - out of order delivery
 * - ephemeral userIds and clientIds
 * @class WSSocialProvider
 * @constructor
 * @param {Function} dispatchEvent callback to signal events
 * @param {WebSocket} webSocket Alternative webSocket implementation for tests
 **/
function WSSocialProvider(dispatchEvent, webSocket) {
  this.dispatchEvent = dispatchEvent;
  this.websocket = webSocket || WebSocket;

  this.WS_URL = 'wss://p2pbr.com/route/';
  this.STATUS = freedom.social().STATUS;

  this.conn = null;   // Web Socket
  this.id = null;     // userId of this user
  
  //Note that in this.websocket, there is a 1-1 relationship between user and client
  this.users = {};    // List of seen users (<user_profile>)
  this.clients = {};  // List of seen clients (<client_state>)

}

/**
 * Connect to the Web Socket rendezvous server
 * e.g. social.login(Object options)
 * The only login option needed is 'agent', used to determine which group to join in the server
 *
 * @method login
 * @param {Object} loginOptions
 * @return {Object} status - Same schema as 'onStatus' events
 **/
WSSocialProvider.prototype.login = function(loginOpts, continuation) {
  var finishLogin = {
    continuation: continuation,
    finish: function(msg, err) {
      if (this.continuation) {
        this.continuation(msg, err);
        delete this.continuation;
      }
    }
  };

  if (this.conn !== null) {
    console.warn("Already logged in");
    finishLogin.finish(this.changeRoster(this.id, true));
    return;
  }
  this.conn = new this.websocket(this.WS_URL + loginOpts.agent);
  // Save the continuation until we get a status message for
  // successful login.
  this.conn.onmessage = this.onMessage.bind(this, finishLogin);
  this.conn.onerror = function (cont, error) {
    this.conn = null;
    cont.finish(this.sendStatus('ERR_CONNECTION', error));
  }.bind(this, finishLogin);
  this.conn.onclose = function (cont, msg) {
    this.conn = null;
    this.changeRoster(this.id, false);
  }.bind(this, finishLogin);

};

/**
 * Returns all the <user_profile>s that we've seen so far (from 'onUserProfile' events)
 * Note: the user's own <user_profile> will be somewhere in this list. 
 * Use the userId returned from social.login() to extract your element
 * NOTE: This does not guarantee to be entire roster, just users we're currently aware of at the moment
 * e.g. social.getUsers();
 *
 * @method getUsers
 * @return {Object} { 
 *    'userId1': <user_profile>,
 *    'userId2': <user_profile>,
 *     ...
 * } List of <user_profile>s indexed by userId
 *   On failure, rejects with an error code (see above)
 **/
WSSocialProvider.prototype.getUsers = function(continuation) {
  continuation(this.users);
};

/**
 * Returns all the <client_state>s that we've seen so far (from any 'onClientState' event)
 * Note: this instance's own <client_state> will be somewhere in this list
 * Use the clientId returned from social.login() to extract your element
 * NOTE: This does not guarantee to be entire roster, just clients we're currently aware of at the moment
 * e.g. social.getClients()
 * 
 * @method getClients
 * @return {Object} { 
 *    'clientId1': <client_state>,
 *    'clientId2': <client_state>,
 *     ...
 * } List of <client_state>s indexed by clientId
 *   On failure, rejects with an error code (see above)
 **/
WSSocialProvider.prototype.getClients = function(continuation) {
  continuation(this.clients);
};

/** 
 * Send a message to user on your network
 * If the destination is not specified or invalid, the message is dropped
 * Note: userId and clientId are the same for this.websocket
 * e.g. sendMessage(String destination_id, String message)
 * 
 * @method sendMessage
 * @param {String} destination_id - target
 * @return nothing
 **/
WSSocialProvider.prototype.sendMessage = function(to, msg, continuation) {
  if (this.conn) {
    this.conn.send(JSON.stringify({to: to, msg: msg}));
  } else {
    console.error('WS Social Provider: trying to sendMessage when connection not established');
  }
  continuation();
};

/**
   * Disconnects from the Web Socket server
   * e.g. logout(Object options)
   * No options needed
   * 
   * @method logout
   * @param {Object} logoutOptions
   * @return {Object} status - same schema as 'onStatus' events
   **/
WSSocialProvider.prototype.logout = function(logoutOpts, continuation) {
  if (this.conn === null) { // We may not have been logged in
    console.warn("Already logged out");
    this.changeRoster(this.id, false);
    continuation();
    return;
  }
  this.conn.onclose = function(continuation) {
    this.conn = null;
    this.changeRoster(this.id, false);
    continuation();
  }.bind(this, continuation);
  this.conn.close();
};

/**
 * INTERNAL METHODS
 **/

/**
 * Dispatch an 'onClientState' event with the following status and return the <client_card>
 * Modify entries in this.users and this.clients if necessary
 * Note, because this provider has a global buddylist of ephemeral clients, we trim all OFFLINE users
 *
 * @method changeRoster
 * @private
 * @param {String} id - userId and clientId are the same in this provider
 * @param {Boolean} stat - true if "ONLINE", false if "OFFLINE".
 *                          "ONLINE_WITH_OTHER_APP"
 * @return {Object} - same schema as 'onStatus' event
 **/
WSSocialProvider.prototype.changeRoster = function(id, stat) {
  var newStatus;
  var result = {
    userId: id,
    clientId: id,
    timestamp: (new Date()).getTime()
  };
  if (stat) {
    newStatus = this.STATUS["ONLINE"];
  } else {
    newStatus = this.STATUS["OFFLINE"];
  }
  result.status = newStatus;
  if (!this.clients.hasOwnProperty(id) || 
      (this.clients[id] && this.clients[id].status !== newStatus)) {
    this.dispatchEvent('onClientState', result);
  }

  if (stat) {
    this.clients[id] = result;
    if (!this.users.hasOwnProperty(id)) {
      this.users[id] = {
        userId: id,
        name: id,
        timestamp: (new Date()).getTime()
      };
      this.dispatchEvent('onUserProfile', this.users[id]);
    }
  } else {
    delete this.users[id];
    delete this.clients[id];
  }
  return result;
};

/**
 * Interpret messages from the server
 * There are 3 types of messages
 * - Directed messages from friends
 * - State information from the server on initialization
 * - Roster change events (users go online/offline)
 *
 * @method onMessage
 * @private
 * @param {Object} finishLogin Function to call upon successful login
 * @param {String} msg Message from the server (see server/router.py for schema)
 * @return nothing
 **/
WSSocialProvider.prototype.onMessage = function(finishLogin, msg) {
  var i;
  msg = JSON.parse(msg.data);

  // If state information from the server
  // Store my own ID and all known users at the time
  if (msg.cmd === 'state') {
    this.id = msg.id;
    for (i = 0; i < msg.msg.length; i += 1) {
      this.changeRoster(msg.msg[i], true);
    }
    finishLogin.finish(this.changeRoster(this.id, true));
  // If directed message, emit event
  } else if (msg.cmd === 'message') {
    this.dispatchEvent('onMessage', {
      from: this.changeRoster(msg.from, true),
      to: this.changeRoster(this.id, true),
      message: msg.msg
    });
  // Roster change event
  } else if (msg.cmd === 'roster') {
    this.changeRoster(msg.id, msg.online);
  // No idea what this message is, but let's keep track of who it's from
  } else if (msg.from) {
    this.changeRoster(msg.from, true);
  }
};

/** REGISTER PROVIDER **/
if (typeof freedom !== 'undefined') {
  freedom.social().provideAsynchronous(WSSocialProvider);
}
