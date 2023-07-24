const WebSocket = require('ws');
let ws = new WebSocket("ws://localhost:80");
let msg = new Object();
msg.type = 'test';
msg.data = 'hello world';
ws.onopen =  function (e) {
	console.log('open');
	ws.send(JSON.stringify(msg));
};
