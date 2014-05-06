var express = require('express');
var router = express.Router();
var BSON = require('mongodb').BSONPure;
var MongoClient = require('mongodb').MongoClient;
var GridStore = require('mongodb').GridStore;
var Grid = require('mongodb').Grid;
var ObjectID = require('mongodb').ObjectID;

var request = require('request');

var mongo = require('mongodb');
var Grid = require('gridfs-stream');

/* youtube support */
var ytdl = require('ytdl');

MongoClient.connect("mongodb://localhost:27017/websafe", function(err, db) {
	if(err) {
		throw err;
	}
	console.log('Connected to db');
	console.log('Collections:');
	db.collectionNames(function(err, names){
		console.log(names);
	});
	db.createCollection('urls', function(err, collection) {});

	var getUrls = function(callback) {
		var urls = [];
		var urlsCollection = db.collection('urls');
		var cursor = urlsCollection.find();
		cursor.each(function(err, i){
			if(err) {
				callback(err);
			}			
			if(i != null) {
				urls.push({
					url:i.url,
					type:i.type,
					id:i._id
				});
			} else {
				callback(null, urls);
			}
		});		
	}	

	var getById = function(id, callback) {
		var urlsCollection = db.collection('urls');
		var obj_id = BSON.ObjectID.createFromHexString(id);
		urlsCollection.findOne({_id:obj_id}, function(err,r){
			if(err) {
				return callback(err);
			};			
			callback(null, r);
		});
	};

	router.get('/', function(req, res) {

		getUrls(function(err, urls){
			res.render('index', { 
				urls: urls,
				form:{}
			});
		}); 		
	});

	router.post('/', function(req, res) {
		var io = req.app.get('io');
		var socketid = req.param('socketid')

		var form = {
			url: req.param('url')
		};
		
		var yt = form.url.lastIndexOf('https://www.youtube.com/', 0) === 0 || form.url.lastIndexOf('http://www.youtube.com/', 0) === 0 || form.url.lastIndexOf('https://youtube.com/', 0) === 0 || form.url.lastIndexOf('http://youtube.com/', 0) === 0;

		var gfs = Grid(db, mongo);
		var fileId = new ObjectID();
		var writestream = gfs.createWriteStream({
    		_id: fileId
		});

		var insertToDB = function(type) {
			var urlsCollection = db.collection('urls');
			urlsCollection.insert({
				url:form.url,
				type:type,
				grid_id: fileId
			}, function(err, result) {
				if(err) {
					throw err;
				}
				getUrls(function(err, urls){
					res.status(200).send('ok');
				}); 
			});			      				
		};

		if(yt) {
			console.log('youtube!');
			var ystream = ytdl(form.url, { filter: function(format) { return format.container === 'mp4'; } });

			var contentLength = 0;
			var f = 0;
			var firstChunk = true;

			ystream
			.on('info', function(info, format){
				contentLength = format.size;
			})
			.on('data', function(chunk){
				if(firstChunk) firstChunk = false;
				f+=chunk.length;
				var pr = Math.floor(parseInt(f)/contentLength * 100);
				io.sockets.socket(socketid).emit('progress',{p:pr});				
			})			
			.on('end', function(){
				insertToDB('video/mp4');
			})			
			.on('error', function(e) {
				res.status(400).send('error');
			})						
			.pipe(writestream);
		} else {
			require(form.url.lastIndexOf('https', 0) === 0?'https':'http').get(form.url, function(res1) {
				var contentLength = parseInt(res1.headers['content-length']);
				var f = 0;
  				
  				res1
  				.on('data', function(chunk) {  					
  					f+=chunk.length;
					var pr = Math.floor(parseInt(f)/contentLength * 100);
					io.sockets.socket(socketid).emit('progress',{p:pr});
			    })
			    .on('end', function() {			  
					insertToDB(res1.headers['content-type']);
			    })
			    .on('error', function(e) {
					res.status(400).send('error');
				})
			    .pipe(writestream);
			});
		}

		/* 
		 *
		 * old way
		 *
		 *
		var request = require(form.url.lastIndexOf('https', 0) === 0?'https':'http').get(form.url, function(res1) {

			var contentLength = parseInt(res1.headers['content-length']);

		  	if(res1.statusCode != 200) {
		  		return res.status(400).send('Problem z pobraniem adresu');
		  	}				

			var fileId = new ObjectID();
			var gridStore = new GridStore(db, fileId, "w", {root:'fs', content_type:res1.headers['content-type']});
			gridStore.chunkSize = 1024 * 256;
			gridStore.open(function(err, gridStore) {
			
			    res1.on('data', function(chunk) {
					gridStore.write(chunk, function(err, gridStore) {
						var pr = Math.floor(parseInt(gridStore.position)/contentLength * 100);
						io.sockets.emit('progress',{p:pr});						
					});							    	
			    });
			 
			    res1.on('end', function() {			    	
					gridStore.close(function(err, result) {

						var urlsCollection = db.collection('urls');
						urlsCollection.insert({
							url:form.url,
							type:res1.headers['content-type'],
							grid_id: fileId
						}, function(err, result) {
							if(err) {
								throw err;
							}
							getUrls(function(err, urls){
								res.status(200).send('ok');
							}); 
						});			      	

					});
			    });

		    });

		});
		request.on('error', function(e) {
			res.status(400).send('error');
		});
		*/		

	});

	router.get('/get/:id', function(req,res){
		getById(req.params.id, function(err, url){
			new GridStore(db, url.grid_id, "r").open(function(err, gridStore) {
				res.set('Content-Type', url.type/*gridStore.contentType*/);
				gridStore.stream(true).pipe(res);
			});
		});
	});	

});

module.exports = router;
