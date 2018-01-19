var express = require('express');
var router = express.Router();
var BSON = require('bson');
var MongoClient = require('mongodb').MongoClient;
var GridStore = require('mongodb').GridStore;
var Grid = require('mongodb').Grid;
var ObjectID = require('mongodb').ObjectID;
var fs = require('fs');
var contentDisposition = require('content-disposition');
var mime = require('mime-types');
var log4js = require('log4js');
var log = log4js.getLogger();

var passport = require('passport');
var config = require('../config');

var request = require('request');
var multer = require('multer');

var mongo = require('mongodb');
var Grid = require('gridfs-stream');

/* youtube support */
var ytdl = require('ytdl-core');
var async = require('async');

const crypto = require('crypto');

router.get('/login',function(req, res) {
	if(req.user) {
		res.redirect('/');
	} else {
		res.render('login', {
			user : req.user, 
			error : req.flash('error')
		});
	}
});

router.post('/login', 
	passport.authenticate('local', {
		failureRedirect: '/login',
		failureFlash: 'Błędny login/hasło' }
	), function(req, res) {
	res.redirect(req.session.returnTo || '/');
});

router.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
});

/**
 * activate passport auth middleware
 */
router.use(function(req, res, next) {
    if(req.user || !config.basicAuth.active || req.path.indexOf('/share/') == 0) {
    	res.locals.logged = true;
        next();
    } else {
		req.session.returnTo = req.path;
    	res.locals.logged = false;		
        res.redirect('/login');
    }
});

var viewableType = function(type) {
	return type == 'application/pdf'||
			type == 'image/png'||
			type == 'image/jpeg'||
			type == 'video/mp4'||
			type.indexOf('application/pdf') !== -1||
			type.indexOf('image/') !== -1||
			type.indexOf('video/mp4') !== -1;
};

/**
 * file upload
 */
var upload = multer({
	dest: __dirname + '/../uploads/',
	limits: {fileSize: 100000000, files:1},
});

MongoClient.connect(config.db.url, function(err, client) {
	if(err) {
		log.error(err);
		throw err;
	}
	log.info('Connected to db '+config.db.url);
	const db = client.db(client.s.options.dbName);
 
	var getUrls = function(page, search, tag, callback) {
		var urls = [];
		var urlsCollection = db.collection('urls');

		var loop = function(cursor) {
			cursor.each(function(err, i){
				if(err) {
					callback(err);
				}			
				if(i != null) {
					urls.push(i);
				} else {
					async.map(urls, function(url, callback1){
						var tags = [];
						db.collection('tags').find({_id: {$in: url.tags}}).each(function(err, tag){
							if(tag != null) {
								tags.push(tag);
							} else {
								url.tags = tags;
								callback1(null, url);
							}
						});
					}, function(err, result){					
						callback(null, result);
					});
				}
			});
		};

		var query = {};
		if(search != null) {
			query['url'] = {
				$regex : '.*'+search.trim()+'.*'
			};
		}
		if(typeof tag != 'undefined') {
			db.collection('tags').find({name:tag}).each(function(err, t){
				if(t!=null) {
					query['tags'] = {$in: [t._id]};
					loop(db.collection('urls').find(query).sort({_id:-1}).limit(page * 10));
				}
			});
		} else {
			loop(urlsCollection.find(query).sort({_id:-1}).limit(page * 10));
		}
	};

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

	var getByShareId = function(id, callback) {
		db.collection('urls').findOne({share_id: id}, function(err,r){
			if(err) {
				return callback(err);
			};			
			callback(null, r);
		});
	};

	var sendDoc = function(url, res)	 {
		new GridStore(db, url.grid_id, "r").open(function(err, gridStore) {
			var type = url.type == 'application/octet-stream' ? mime.lookup(url.url) : url.type;
			if(!type || !viewableType(type)) {
				res.set('Content-Disposition', contentDisposition(url.url));
			}
			res.set('Content-Type', type);
			gridStore.stream(true).pipe(res);
		});		
	};

	var getTags = function(search, callback) {
		db.collection('tags')
			.find(search!=null && search.trim()!='' ? {'name': {$regex : '.*'+search.trim()+'.*'}}:{})
			.sort({_id:-1})
			.limit(20)
			.toArray(function(err, tags){
				callback(err, tags);
		});
	};

	var updateTags = function(tags, callback) {
		log.info('updating tags...');
		var funcs = tags.map(function(tag){
			return function(callback1){
				var tag1 = {
					name: tag.trim().toLowerCase()
				};		
				if(tag1.name == '') {
					callback1(null, null);
				} else {
					var tagInDb = db.collection('tags').find(tag1);
					tagInDb.count(function(err,count){
						if(count > 0) {
							tagInDb.each(function(err, i){
								if(i!=null) {
									callback1(null, i._id);
								}
							});
						} else {
							db.collection('tags').insert(tag1, function(err, result){
								if(err) {
									callback1(err);
								} else {
									callback1(null, tag1._id);
								}							
							});
						}
					});
				}
			};
		});
		async.parallel(funcs, function(err, results){
			if(err) {
				callback(err);	
			} else {
				callback(null, results);	
			}
		});
	};

	router.get('/tags', function(req, res) {
		getTags(req.query.q, function(err, tags){
			if(!err) {
				res.json(tags.map(function(tag){
					tag.value = tag.name;
					tag.label = tag.name;
					return tag;
				}));
			}
		}); 				
	});

	router.get('/list/:page?', function(req, res) {
		getUrls(req.params.page ? req.params.page : 1, req.query.search, req.query.tag, function(err, urls){
			res.render('list', { 
				urls: urls,
				page: req.params.page
			});
		}); 		
	});

	router.get('/urls/:page?', function(req, res) {
		getUrls(req.params.page ? req.params.page : 1, req.query.search, req.query.tag, function(err, urls){
			res.json(urls);
		}); 		
	});

	router.get('/:page?', function(req, res) {
			res.render('index', { 
				//urls: urls,
				form:{},
				query: req.query
			});
		
	});

	router.post('/', function(req, res) {
		var io = req.app.get('io');
		var socketid = req.param('socketid')

		var form = {
			url: req.param('url'),
			tags: req.param('tags')
		};
		
		var yt = form.url.lastIndexOf('https://www.youtube.com/', 0) === 0 || form.url.lastIndexOf('http://www.youtube.com/', 0) === 0 || form.url.lastIndexOf('https://youtube.com/', 0) === 0 || form.url.lastIndexOf('http://youtube.com/', 0) === 0;

		var gfs = Grid(db, mongo);
		var fileId = new ObjectID();
		var writestream = gfs.createWriteStream({
    		_id: fileId
		});

		var insertToDB = function(options, callback) {
			var url = {
				url: form.url,
				title: options.title,
				upload: false,
				type: options.type,
				grid_id: fileId
			};
			updateTags(form.tags.trim().split(','), function(err, tagids){
				if(err) {
					callback(err);
				} else {
					url.tags = tagids;
					db.collection('urls').insert(url, function(err, result) {
						if(err) {
							callback(err);
						} else {
							callback(null);
						}
					});			      				
				}
			});
		};

		if(yt) {
			log.info('youtube!');
			var ystream = ytdl(form.url, { filter: function(format) { return format.container === 'mp4'; } });

			var contentLength = 0;
			var f = 0;
			var ct = 'video/mp4';
			var firstChunk = true;
			var title = form.url;

			ystream
			.on('info', function(info, format){
				title = info.title;
			})
			.on('response', function(response){
				contentLength = parseInt(response.headers['content-length']);
				ct = response.headers['content-type'];
			})
			.on('data', function(chunk){
				if(firstChunk) firstChunk = false;
				f+=chunk.length;
				var pr = Math.floor(parseInt(f)/contentLength * 100);
				io.to(socketid).emit('progress',{p:pr, count: f, of: contentLength});				
			})			
			.on('end', function(){
				log.info('end: '+title);
				insertToDB({type:ct, title: title}, function(err){
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
			var contentLength = 0, f = 0, ct = '';
			var prefix = form.url.lastIndexOf('https://', 0) === 0?'':
							form.url.lastIndexOf('http://', 0) === 0?'':'http://';
			request.get(prefix+form.url)
				.on('response', function(response) {
					contentLength = parseInt(response.headers['content-length']);
					ct = response.headers['content-type'];
				})
  				.on('data', function(chunk) {  					
  					f+=chunk.length;
					var pr = Math.floor(parseInt(f)/contentLength * 100);
					io.to(socketid).emit('progress',{p:pr, count: f, of: contentLength});
			    })
			    .on('end', function() {			  
					insertToDB({type: ct, title:form.url}, function(err){
						if(err) {
							return res.status(500).send('fail');
						}						
						res.status(200).send('ok');
					});
			    })
			    .on('error', function(e) {
					return res.status(400).send('Problem z pobraniem adresu');					
				})
			    .pipe(writestream);
		}
	});

	router.get('/get/:id', function(req,res){
		getById(req.params.id, function(err, url){
			sendDoc(url, res);
		});
	});	

	router.get('/share/:id', function(req,res){
		getByShareId(req.params.id, function(err, url){
			if(err) {
				return res.status(400).json(err);
			};	
			if(url == null) {
				return res.status(404).send('Document not found');
			}
			sendDoc(url, res);
		});		
	});

	router.post('/share/:id', function(req,res){
		var share_hash = crypto.createHmac('md5', config.crypto.secret).update(req.params.id).digest('hex')
								.substring(0,8); // short hash
		/*getByShareId(share_hash, function(err, url){
			if(url != null) {
				share_hash = null;
			}*/
			db.collection('urls').update({_id: BSON.ObjectID.createFromHexString(req.params.id)}, {$set: {share_id: share_hash}}, function(err, count, status) {
				if(err || count == 0) {
					return res.status(400).json(status);
				} else {
					res.status(201).json({share_id: share_hash});
				}
			});			
		/*});*/
	});		

	router.post('/upload', upload.single('file'), function(req, res) {
		var io = req.app.get('io');
		var socketid = req.param('socketid');

		log.info(req.file);
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
			io.to(socketid).emit('progress',{p:pr, count: f, of: contentLength});
	    })		
		.on('end', function() {
			fs.unlink(localFile, function(err){
				if(!err) {
					log.info(localFile + ' deleted.');
				}
			});
			var url = {
				url: req.file.originalname,
				title: req.file.originalname,
				type: 'application/octet-stream',
				upload: true,
				grid_id: fileId
			};

			updateTags(req.param('tags').trim().split(','), function(err, tagids){
				if(err) {
					return res.status(500).send('fail');
				} else {
					url.tags = tagids;
					db.collection('urls').insert(url, function(err, result) {
						if(err) {
							return res.status(500).send('fail');
						} else {
							res.redirect('/');
						}
					});			      				
				}
			});
		})
		.pipe(writestream);
	});

});

module.exports = router;
