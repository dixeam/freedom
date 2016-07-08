
var child = freedom.child();
var log = freedom.log();
var getlog = freedom.getlog();

var app = freedom();

app.on('input', function(value) {
  //console.log('got ' + value);
  app.emit('output', value);
});

// For testing child dependencies
app.on('child-input', function(value) {
  child.emit('input', value);
});
child.on('output', function(value) {
  app.emit('child-output', value);
});

// For testing manifest-defined apis
app.on('do-log', function(value) {
  console.log("received do-log: " + value);
  log.log(value);
});

app.on('get-log', function() {
  console.log("received get-log!");
  getlog.get().then(function(output) {
    console.log("get-log success");
    app.emit('log', output);
  });
});
