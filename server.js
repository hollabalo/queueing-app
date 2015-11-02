var http = require('http');
var url = require('url');
var redis = require('redis');
var fs = require('fs');
var staticServer = require('node-static').Server;
var file = new staticServer('./public');
var client = redis.createClient();

var server = http.createServer(function(req, res) {
	var uu = url.parse(req.url, true);
	if(uu.pathname == "/" || uu.pathname == "/index") {
		file.serveFile('/index.html', 200, {}, req, res);
	}
	else if(uu.pathname == "/admin") {
		file.serveFile('/admin.html', 200, {}, req, res);
	}
	else if(uu.pathname == "/style.css") {
		file.serveFile('/style.css', 200, {}, req, res);
	}
	else {
		file.serveFile('/not-found.html', 503, {}, req, res);
	}
});
server.listen(8001);

var WebSocketServer = require('websocket').server;
wsServer = new WebSocketServer({httpServer : server});
wsServer.on('request', function(request) {
	var connection = request.accept();
	connection.on('message', function(message) {
		console.log('Received: ' + message.utf8Data);

		var json = JSON.parse(message.utf8Data);
		if(json.action == "get") {
			client.lrange(json.queue, -1, -1, function(err, data) {
				var num;
				if(data.length > 0) {
					num = parseInt(data) + 1;
				}
				else if(json.prev != "") {
					num = parseInt(json.prev) + 1;
				}
				else {
					num = 1;
				}
				client.rpush(json.queue, num);
				var ret = JSON.stringify({
					action : json.action,
				    queue : json.queue,
				    num : num
				});
				connection.send(ret);
				broadcast(wsServer, ret);
			});
		}
		else if(json.action == "last") {
			client.lrange(json.queue, -1, -1, function(err, data) {
				if(data.length == 0) {
					data = "0";
				}
				var ret = JSON.stringify({
					action : "get",
				    queue : json.queue,
				    num : data
				});
				connection.send(ret);
			});
		}
		else if(json.action == "serve") {
			client.lrange(json.queue, 0, 0, function(err, data) {
				if(data.length > 0) {
					var ret = JSON.stringify({
						action : json.action,
					    queue : json.queue,
					    num : data
					});
					connection.send(ret);
					broadcast(wsServer, ret);
				}
				else {
					
				}
			});
		}
		else if(json.action == "pop") {
			if(json.prev != 0) {
				client.lpop(json.queue);
			}
			client.lrange(json.queue, 0, 0, function(err, data) {
				if(data.length == 0) {
					data = "0";
				}
				var ret = JSON.stringify({
					action :json.action,
				    queue : json.queue,
				    num : data
				});
				connection.send(ret);
				broadcast(wsServer, ret);
			});
		}
		else if(json.action == "reset") {
			client.del(json.queue);
			var ret = JSON.stringify({
				action : json.action,
			    queue : json.queue,
			    num : "0"
			});
			broadcast(wsServer, ret);
		}
	});

	connection.on('close', function(reasonCode, description) {
		console.log('Connection closed');
	});
});

function broadcast(svr, msg) {
	svr.connections.forEach(function (conn) {
		conn.send(msg);
	})
}
