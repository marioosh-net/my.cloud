var Db = require('mongodb').Db;
var Server = require('mongodb').Server;

var DbProvider = function(host, port) {
  this.db = new Db('websafe', new Server(host, port, {auto_reconnect: true}, {}));
  this.db.open(function(){});
};

DbProvider.prototype.getCollection= function(callback) {
  this.db.collection('urls', function(error, article_collection) {
    if( error ) callback(error);
    else callback(null, article_collection);
  });
};

DbProvider.prototype.findAll = function(callback) {
    this.getCollection(function(error, article_collection) {
      if( error ) callback(error)
      else {
        article_collection.find().toArray(function(error, results) {
          if( error ) callback(error)
          else callback(null, results)
        });
      }
    });
};

exports.DbProvider = DbProvider;