const express = require('express');
var Client = require('castv2').Client;
var mdns = require('mdns');

let app = express();
let castDeviceHost = '';
let castAppSessionId = ''; 
let castReceiver;
let castConnection;
let castAppConnection;
let castAppReceiver;
const castAppId = '5CB45E5A';
const WEBCAM_WEB_APP_URL = 'https://egm0121.github.io/camcast/single.html';

const findApplicationReady = (appId, data) => {
  if (data.type = 'RECEIVER_STATUS' && data.status.applications) {
    const targetApp = data.status.applications.find(e => e.appId === appId);
    if (targetApp && targetApp.statusText === 'URL Cast ready...'){
      return targetApp;
    }
    return false;
  }
  return false;
}
app.get("/cast/start/", function(request, response){
  const castTargetUrl = request.query.url || WEBCAM_WEB_APP_URL;
  var client = new Client();
  if(!castDeviceHost) return false;
  client.connect(castDeviceHost, function() {
    // create various namespace handlers
    castConnection = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.tp.connection', 'JSON');
    var heartbeat  = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.tp.heartbeat', 'JSON');
    castReceiver   = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.receiver', 'JSON');

    // establish virtual connection to the receiver
    castConnection.send({ type: 'CONNECT' });
   
    // start heartbeating
    setInterval(function() {
      heartbeat.send({ type: 'PING' });
    }, 5000);
    // launch Cast Receiver app
    castReceiver.send({ type: 'LAUNCH', appId: castAppId, requestId: 1 });

    // display receiver status updates
    castReceiver.on('message', function(data, broadcast) {
      console.log(data);
      const castAppData = findApplicationReady(castAppId, data);
      if (castAppData) {
        console.log('Cast App is ready');
        console.log(castAppData);
        castAppSessionId =  castAppData.sessionId;
        const transportId = castAppData.transportId;
        castAppConnection = client.createChannel('sender-0', transportId, 'urn:x-cast:com.google.cast.tp.connection', 'JSON');
        castAppReceiver = client.createChannel('sender-0', transportId, 'urn:x-cast:com.url.cast');
        // connect to app reciever endpoint
        castAppConnection.send({ type: 'CONNECT' });
        // subscribe to app reciever messages
        castAppReceiver.on('message', (data) => console.log(`${transportId}: ${data}`));
        // load page on receiver app
        castAppReceiver.send(JSON.stringify({ "type": "iframe", "url": castTargetUrl }));
      }
    });
  });
  response.send('start casting webcams');
});

app.get("/cast/stop", function(request, response){
  if(castReceiver && castAppSessionId){
    console.log('stop app session', castAppSessionId);
    castReceiver.send({ type: 'STOP', sessionId: castAppSessionId, requestId: 2 });
  }
  response.send('stop casting webcams');
});

var browser = mdns.createBrowser(mdns.tcp('googlecast'));

browser.on('serviceUp', function(service) {
  console.log('found device %s at %s:%d', service.name, service.addresses[0], service.port);
  castDeviceHost = service.addresses[0];
  browser.stop();
});
browser.start();

app.listen(8888)