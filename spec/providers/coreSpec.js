describe("Core Provider Integration", function() {
  var freedom_src;

  var freedom;
  beforeEach(function() {
    freedom_src = getFreedomSource();
    
    var global = {
      console: {
        log: function() {}
      }
    };
  
    // Setup resource loading for the test environment, which uses file:// urls.
    fdom.resources = new Resource();
    fdom.resources.addResolver(function(manifest, url, deferred) {
      if (url.indexOf('relative://') === 0) {
        var dirname = manifest.substr(0, manifest.lastIndexOf('/'));
        deferred.resolve(dirname + '/' + url.substr(11));
        return true;
      }
      return false;
    });
    fdom.resources.addResolver(function(manifest, url, deferred) {
      if (manifest.indexOf('file://') === 0) {
        manifest = 'http' + manifest.substr(4);
        fdom.resources.resolve(manifest, url).done(function(addr) {
          addr = 'file' + addr.substr(4);
          deferred.resolve(addr);
        });
        return true;
      }
      return false;
    });
    fdom.resources.addRetriever('file', fdom.resources.xhrRetriever);

    var path = window.location.href,
        dir_idx = path.lastIndexOf('/'),
        dir = path.substr(0, dir_idx) + '/';
    freedom = setup(global, undefined, {
      manifest: "relative://spec/helper/channel.json",
      portType: 'Frame',
      inject: dir + "node_modules/es5-shim/es5-shim.js",
      src: freedom_src
    });
  });
  
  afterEach(function() {
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      frames[i].parentNode.removeChild(frames[i]);
    }
  });

  it("Manages Channels Between Modules", function() {
    var cb = jasmine.createSpy('cb');
    var called = false;
    runs(function() {
      freedom.once('message', function(msg) {
        // created.
        expect(msg).toEqual('creating custom channel 0');
        freedom.on('message', cb);
        freedom.on('message', function() {
          called = true;
        });
        freedom.emit('message', 0);
      });
      freedom.emit('create');
    });

    waitsFor(function() {
      return called;
    }, "Freedom should return success", 4000);

    runs(function() {
      expect(cb).toHaveBeenCalledWith('sending message to 0');
    });
  });

  it("Manages Channels With providers", function() {
    var cb = jasmine.createSpy('cb');
    var called = false;
    runs(function() {
      freedom.once('message', function(msg) {
        // created.
        freedom.on('message', cb);
        freedom.on('message', function() {
          called = true;
        });
        freedom.emit('message', 0);
      });
      freedom.emit('peer');
    });

    waitsFor(function() {
      return called;
    }, "Freedom should return success", 4000);

    runs(function() {
      expect(cb).toHaveBeenCalledWith('sending message to peer 0');
    });
  });
});

describe("Core Provider Channels", function() {
  var manager, hub, global;
  beforeEach(function() {
    global = {freedom: {}};
    hub = new fdom.Hub();
    manager = new fdom.port.Manager(hub);
    hub.emit('config', {
      global: global
    });
  });

  it('Links Custom Channels', function() {
    var source = createTestPort('test');
    manager.setup(source);

    var chan = source.gotMessage('control').channel;
    hub.onMessage(chan, {
      type: 'Core Provider',
      request: 'core'
    });
    
    var core = source.gotMessage('control', {type: 'core'}).core;
    expect(core).toBeDefined();

    var c = new core(), id, input;
    var call = c.createChannel(function(chan) {
      id = chan.identifier;
      input = chan.channel;
    });
    expect(input).toBeDefined();
    
    var inHandle = jasmine.createSpy('input');
    input.on(inHandle);
    expect(inHandle).not.toHaveBeenCalled();

    var output;
    c.bindChannel(id, function(chan) {
      output = chan;
    });
    expect(output).toBeDefined();
    
    expect(inHandle).not.toHaveBeenCalled();
    output.emit('message', 'whoo!');
    expect(inHandle).toHaveBeenCalled();
  });
});
