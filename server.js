const express = require('express');
var Client = require('castv2').Client;
var mdns = require('mdns-js');

let app = express();
let castDeviceHost = '';
let castAppSessionId = ''; 
let castReceiver;
let castConnection;
let castAppConnection;
let castAppReceiver;
let pingRef;
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
  const client = new Client();
  if(!castDeviceHost) return false;
  client.on('error', err =>console.log('cast client error', err));
  client.connect(castDeviceHost, function() {
    // create various namespace handlers
    castConnection = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.tp.connection', 'JSON');
    const heartbeat  = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.tp.heartbeat', 'JSON');
    castReceiver   = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.receiver', 'JSON');
    castConnection.on('error', err =>console.log('castConnection error', err))
    heartbeat.on('error', err =>console.log('heartbeat error', err))
    castReceiver.on('error', err =>console.log('castReceiver error', err))
    // establish virtual connection to the receiver
    castConnection.send({ type: 'CONNECT' });
    if(pingRef) clearInterval(pingRef);
    // start heartbeating
    pingRef = setInterval(function() {
      try {
        heartbeat.send({ type: 'PING' });
      } catch(err){
        console.log('heartbeat failed');
      }
    }, 5000);
    // launch Cast Receiver app
    castReceiver.send({ type: 'LAUNCH', appId: castAppId, requestId: 1 });

    // display receiver status updates
    castReceiver.on('message', function(data, broadcast) {
      console.log(data);
      const castAppData = findApplicationReady(castAppId, data);
      if (castAppData) {
        console.log('Cast App is ready');
        castAppSessionId =  castAppData.sessionId;
        const transportId = castAppData.transportId;
        castAppConnection = client.createChannel('sender-0', transportId, 'urn:x-cast:com.google.cast.tp.connection', 'JSON');
        castAppReceiver = client.createChannel('sender-0', transportId, 'urn:x-cast:com.url.cast');
        castAppConnection.on('error', err =>console.log('castAppConnection error', err))
        castAppReceiver.on('error', err =>console.log('castAppReceiver error', err))
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
  try {
    if(pingRef) clearInterval(pingRef);
    if(castReceiver && castAppSessionId){
      console.log('stop app session', castAppSessionId);
      castReceiver.send({ type: 'STOP', sessionId: castAppSessionId, requestId: 2 });
    }
    response.send('stop casting webcams');
  } catch(err){
    console.log('cast/stop error', err);
  }
});

var browser = mdns.createBrowser();
 
browser.on('ready', function () {
    browser.discover(); 
});
browser.on('update', function (data) {
    if(data && !castDeviceHost){
      const service = data.type.find(service => service.name === 'googlecast')
      if(service){
        castDeviceHost = data.addresses[0];
        console.log('found google chromecast via mdns',castDeviceHost, service );
      }
    }
});
app.listen(8888)