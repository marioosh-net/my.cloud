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
		var form = {
			url: req.param('url')
		};

		var io = req.app.get('io');
		var yt = form.url.lastIndexOf('https://www.youtube.com/', 0) === 0 || form.url.lastIndexOf('http://www.youtube.com/', 0) === 0;
		/*
		if(yt) {
			var ystream = ytdl(form.url, { filter: function(format) { return format.container === 'mp4'; } });
			ystream.pipe(fs.createWriteStream('vide.mp4'));
		}
		*/

		var gfs = Grid(db, mongo);
		var fileId = new ObjectID();
		var writestream = gfs.createWriteStream({
    		_id: fileId
		});
		if(yt) {
			console.log('youtube!');
			var ystream = ytdl(form.url, { filter: function(format) { return format.container === 'mp4'; } });
			ystream
			.on('info', function(a,b){
				console.log(a);
			})
			.on('end', function(){
				console.log('end yt!!!');
				/**
				 * on write full insert url with id to gridfs
				 */
				var urlsCollection = db.collection('urls');
				urlsCollection.insert({
					url:form.url,
					type:'video/mp4',
					grid_id: fileId
				}, function(err, result) {
					if(err) {
						throw err;
					}
					getUrls(function(err, urls){
						res.status(200).send('ok');
					}); 
				});			      					 
			})			
			.pipe(writestream);
		} else {
			var r = request(form.url, function(err, res1, body){
				if(err || res1.statusCode != 200) {
					return res.status(400).send('Problem z pobraniem adresu');
				}
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
			})
			.on('end', function(){
				console.log('end!!!');
				/**
				 * on write full insert url with id to gridfs
				 */
			})			
			.pipe(writestream);

			/**
			 * czemu to nie dziala ???
			 */
			r.on('data', function(chunk) {
				console.log('1');
				/*
				var pr = Math.floor(parseInt(gridStore.position)/contentLength * 100);
				io.sockets.emit('progress',{p:pr});						
				*/
			})		
			.on('end', function(){
				console.log('end');
				/**
				 * on write full insert url with id to gridfs
				 */
			})
			.on('error', function(e) {
				res.status(400).send('error');
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
