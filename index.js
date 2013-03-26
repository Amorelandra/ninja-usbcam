var
	fs = require('fs')
	, util = require('util')
	, stream = require('stream')
	, path = require('path')
	, http = require('http')
	, https = require('https')
;

util.inherits(usbcam, stream);
module.exports = usbcam;

function usbcam(opts, app) {
	
	var mod = this;
	stream.call(this);

	this.writable = true;
	this.readable = true;
	this.configurable = true;

	this.V = 0;
	this.G = "0";
	this.D = 1004;
	
	this.app = app;
	this.interval = undefined; // setInterval ref
	this.present = false;

	fs.watch('/dev/', function(event, filename) {

		if(!(filename.substr(0, 5) === 'video')) { return; }
		fs.lstat(path.resolve('/dev', filename), function(err, stats) {

			if(err) {

				if(err.code == "ENOENT") {

					mod.log.info("usbcam: Camera unplugged");
					mod.unplug();
					return;
				}

				mod.log.error("usbcam: %s", err);
			}

			if(!mod.present) {

				mod.log.info("usbcam: Camera plugged in");
				init();
			}
		});
	});

	fs.lstat('/dev/video0', function(err, stats) {

		if(err) { 

			mod.log.info("usbcam: No camera detected");
			return; 
		}

		if(stats.isCharacterDevice()) {

			mod.log.info("usbcam: Found camera");
			mod.emit('register', mod);
			mod.plugin();
		}

	});

	function init() {

		mod.log.info("usbcam: Camera detected");

		mod.emit('register', mod);
		mod.plugin();
	};
};

usbcam.prototype.write = function write(data) {
	
	this.log.info("usbcam: Attempting snapshot...");
	var
		getOpts = {

			host : 'localhost'
			, port : 5000
			, path : '/?action=snapshot'
			, method : 'GET'
		}	
		, postOpts = {

			host : this.opts.streamHost
			, port : this.opts.streamPort
			, path : '/rest/v0/camera/' + this.guid + '/snapshot'
			, method : 'POST'
		}
		, mod = this
	;
	console.log(postOpts);
	var proto = (this.opts.streamPort == 443 ? https : http);

	var get = http.get(getOpts, function(res) {

		postOpts.headers = res.headers;
		postOpts.headers['X-Ninja-Token'] = mod.app.token;	

		var post = proto.request(postOpts, function(res) {

			res.on('end', function() {

				mod.log.debug("usbcam: streaming done");
			});
		});
		get.pipe(post).on('error', function(err) {

			mod.log.error("usbcam: Error streaming snapshot: %s", err);
		});
		get.on('end', function() { post.end(); });

	}).on('error', function(e) {

		mod.log.error("usbcam: Error retrieving snapshot");
	});
};

usbcam.prototype.heartbeat = function heartbeat(bool) {

	clearInterval(this.interval);

	if(!!bool) {

		var 
			mod = this
			, ival = this.opts.interval || 10000
		;
		this.log.debug(

			"usbcam: Setting data interval to %s"
			, Math.round(ival / 1000)
		);
		
		this.emit('data', '1');
		this.interval = setInterval(function() {

			mod.emit('data', '1');

		}, ival);
		return;
	}
	this.log.debug("usbcam: Clearing data interval");
};

usbcam.prototype.unplug = function unplug() {

	this.present = false;
	this.heartbeat(false);
	this.emit('config', {

		G : this.G
		, V : this.V
		, D : this.D
		, type : 'UNPLUG'
	});
};

usbcam.prototype.plugin = function plugin() {

	this.present = true;
	this.heartbeat(true);
	this.emit('data', '1');
	this.emit('config', {

		G : this.G
		, V : this.V
		, D : this.D
		, type : 'PLUGIN'
	});
};

usbcam.prototype.config = function config(opts) {
	
	// we can do something with config opts here

	this.save(opts);
};
