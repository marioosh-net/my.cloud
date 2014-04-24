var express = require('express');
var router = express.Router();
var BSON = require('mongodb').BSONPure;
var MongoClient = require('mongodb').MongoClient;
var GridStore = require('mongodb').GridStore;
var Grid = require('mongodb').Grid;
var ObjectID = require('mongodb').ObjectID;

function download(url, callback) {

	if(typeof url == 'undefined' || url.trim() == '') {
		return callback(new Error('Błędne parametry'));
	}
  var request = require(url.lastIndexOf('https', 0) === 0?'https':'http').get(url, function(res) {

	var d = {
      	data: '',
      	contentType: res.headers['content-type'],
      	contentLength: res.headers['content-length']
      };

  	// console.log(res);
  	// console.log(JSON.stringify(res.headers));
  	if(res.statusCode != 200) {
  		return callback(new Error('Problem z pobraniem adresu'));
  	}

    res.on('data', function(chunk) {
      d.data += chunk;
    });
 
    res.on('end', function() {
      callback(null,d);
    })
  });
 
  request.on('error', function(e) {
  	callback(e);
  });
};

// mongodb
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
					id:i._id
				});
			} else {
				console.log(urls);
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

		/**
		 * download file and save into GridFS
		 */

/*
		var fileId = new ObjectID();
		var gridStore = new GridStore(db, fileId, "w", {root:'fs'});
		gridStore.chunkSize = 1024 * 256;
		gridStore.open(function(err, gridStore) {
			*/

			var request = require(form.url.lastIndexOf('https', 0) === 0?'https':'http').get(form.url, function(res1) {

				var contentLength = parseInt(res1.headers['content-length']);

			  	if(res1.statusCode != 200) {
			  		return res.status(400).send('Problem z pobraniem adresu');
			  	}				
			  	// res1.headers['content-type']


				var fileId = new ObjectID();
				var gridStore = new GridStore(db, fileId, "w", {root:'fs', content_type:res1.headers['content-type']});
				gridStore.chunkSize = 1024 * 256;
				gridStore.open(function(err, gridStore) {
				

			  	/**
			  	 * write chunk to gridfs
			  	 */
			    res1.on('data', function(chunk) {
					gridStore.write(chunk, function(err, gridStore) {
						console.log('wri START');
						console.log(gridStore.position);
						console.log(gridStore.currentChunk);
						console.log('wri END');

						var pr = Math.ceil(parseInt(gridStore.position)/contentLength * 100);
 						io.sockets.emit('progress',{p:pr});
					});							    	
			    });
			 
			    res1.on('end', function() {
			      gridStore.close(function(err, result) {

			      	/**
			      	 * on write full insert url with id to gridfs
			      	 */
			      	var urlsCollection = db.collection('urls');
			      	urlsCollection.insert({
			      		url:form.url,
			      		grid_id: fileId
			      	}, function(err, result) {
			      		if(err) {
			      			throw err;
			      		}
			      		getUrls(function(err, urls){
			      			res.status(200).send('ok');
			      			/*
			      			res.render('index', { 
			      				urls: urls,
			      				form:form 
			      			});
							*/
			      		}); 
			      	});			      	

			      });
			    });

			    });			  	

			});
			request.on('error', function(e) {
				res.status(400).send('error');
				/*
				return res.render('error',{error: new Error('Problem z pobraniem adresu')});
				*/
			});		
		//});

	});

	router.get('/get/:id', function(req,res){
		getById(req.params.id, function(err, url){
			new GridStore(db, url.grid_id, "r").open(function(err, gridStore) {
				var stream = gridStore.stream(true);
				var data = '';
				stream.on("data", function(chunk) {
					data += chunk;
				});
				stream.on("end", function() {
					res.set('Content-Type', gridStore.contentType);
					res.send(data);				    
				});
			});
		});
	});
});

module.exports = router;
