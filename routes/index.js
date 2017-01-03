var express = require('express');
var router = express.Router();
var BSON = require('mongodb').BSONPure;
var MongoClient = require('mongodb').MongoClient;
var GridStore = require('mongodb').GridStore;
var Grid = require('mongodb').Grid;
var ObjectID = require('mongodb').ObjectID;
var fs = require('fs');
var contentDisposition = require('content-disposition');

var request = require('request');
var multer = require('multer');

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

	var getUrls = function(page, search, callback) {
		var urls = [];
		var urlsCollection = db.collection('urls');
		var cursor = urlsCollection.find(search!=null?{'url' : {$regex : '.*'+search.trim()+'.*'}}:{}).sort({_id:-1}).limit(page * 10);
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

	router.get('/list/:page?', function(req, res) {
		getUrls(req.params.page ? req.params.page : 1, req.query.search, function(err, urls){
			res.render('list', { 
				urls: urls,
				page: req.params.page
			});
		}); 		
	});

	router.get('/:page?', function(req, res) {
		
			res.render('index', { 
				//urls: urls,
				form:{}
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

		var insertToDB = function(type, callback) {
			var urlsCollection = db.collection('urls');
			urlsCollection.insert({
				url:form.url,
				type:type,
				grid_id: fileId
			}, function(err, result) {
				if(err) {
					callback(err);
				}
				callback(null);
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
				io.sockets.socket(socketid).emit('progress',{p:pr, count: f, of: contentLength});				
			})			
			.on('end', function(){
				insertToDB('video/mp4', function(err){
					if(err) {
						return res.status(500).send('fail');
					}
					res.status(200).send('ok');
				});
			})			
			.on('error', function(e) {
				res.status(400).send('error');
			})						
			.pipe(writestream);
		} else {
			require(form.url.lastIndexOf('https', 0) === 0?'https':'http').get(form.url, function(res1) {

				if(res1.statusCode != 200) {
		  			return res.status(400).send('Problem z pobraniem adresu');
		  		}					
		  		
				var contentLength = parseInt(res1.headers['content-length']);
				var f = 0;
  				
  				res1
  				.on('data', function(chunk) {  					
  					f+=chunk.length;
					var pr = Math.floor(parseInt(f)/contentLength * 100);
					io.sockets.socket(socketid).emit('progress',{p:pr, count: f, of: contentLength});
			    })
			    .on('end', function() {			  
					insertToDB(res1.headers['content-type'], function(err){
						if(err) {
							return res.status(500).send('fail');
						}						
						res.status(200).send('ok');
					});
			    })
			    .on('error', function(e) {
					res.status(400).send('error');
				})
			    .pipe(writestream);
			});
		}
	});

	router.get('/get/:id', function(req,res){
		getById(req.params.id, function(err, url){
			new GridStore(db, url.grid_id, "r").open(function(err, gridStore) {
				if(url.type == 'application/octet-stream') {
					res.set('Content-Disposition', contentDisposition(url.url));
				}
				res.set('Content-Type', url.type/*gridStore.contentType*/);
				gridStore.stream(true).pipe(res);
			});
		});
	});	

	/**
	 * file upload
	 */
	var upload = multer({
		dest: __dirname + '/../uploads/',
		limits: {fileSize: 100000000, files:1},
	});
	router.post('/upload', upload.single('file'), function(req, res) {
		var io = req.app.get('io');
		var socketid = req.param('socketid')

		console.log(req.file);
		var localFile = req.file.path;
		var contentLength = req.file.size;

		var fileId = new ObjectID();
		var writestream = Grid(db, mongo).createWriteStream({
    		_id: fileId
		});

		var f = 0;

		fs.createReadStream(localFile)
		.on('data', function(chunk) {  					
			f+=chunk.length;
			var pr = Math.floor(parseInt(f)/contentLength * 100);
			io.sockets.socket(socketid).emit('progress',{p:pr, count: f, of: contentLength});
	    })		
		.on('end', function() {
			fs.unlink(localFile, function(err){
				if(!err) {
					console.log(localFile + ' deleted.');
				}
			});
			db.collection('urls').insert({
				url: req.file.originalname,
				type: 'application/octet-stream',
				grid_id: fileId
			}, function(err, result) {
				if(err) {
					return res.status(500).send('fail');
				}						
				//res.status(200).send('ok');
				res.redirect('/');
			});			      				
		})
		.pipe(writestream);
	});

});

module.exports = router;
