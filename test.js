var GridStore = require('mongodb').GridStore;
var Grid = require('gridfs-stream');
var ObjectID = require('mongodb').ObjectID;
var MongoClient = require('mongodb').MongoClient;
var http = require('http');
var mongo = require('mongodb');
var fs = require('fs');

MongoClient.connect("mongodb://localhost:27017/websafe", function(err, db) {
	var gfs = Grid(db, mongo);
	var fileId = new ObjectID();
	var writestream = gfs.createWriteStream({
		_id: fileId
	});
	console.log(fileId);
	var r = http.get('http://i.stack.imgur.com/KpNEm.png', function(res){
		res.pipe(/*writestream*/fs.createWriteStream('p.png'));
		res.on('end',function(){
			console.log('end');
			db.close();
		});
	});
});
