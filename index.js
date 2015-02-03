/**
* Module dependencies
*/
var Resource = require('deployd/lib/resource');
var Path = require('path');
var util = require('util');
var gcm = require('node-gcm');
var apn = require('apn');
var _ = require('lodash');
var debug = require('debug')('dpd-notify');
var Wait = require('wait-async');


/**
* Module setup.
*/
function Notify(name, options) {
  Resource.apply( this, arguments );
  var configPath = options.configPath;
  
  // APN config in different env
  var apnConfig = null;
  if (options.server.options.env == 'production') {
    apnConfig = {
      cert: this.config.apnCert && Path.join(configPath, this.config.apnCert),
      key: this.config.apnKey && Path.join(configPath, this.config.apnKey),
      gateway: 'gateway.push.apple.com'
    };
  } else {
    apnConfig = {
      cert: this.config.apnCert && Path.join(configPath, this.config.apnCertDev),
      key: this.config.apnKey && Path.join(configPath, this.config.apnKeyDev),
      gateway: 'gateway.sandbox.push.apple.com'
    };
  }  
  
  // connection to apn service
  var apnConnection = new apn.connection(apnConfig);
  apnConnection.on('transmitted', function(notification, device) {
    debug("APN: Transmitted to:" + device.token.toString('hex'), notification);
  });
  apnConnection.on('transmissionError', function(errCode, notification, device) {
    console.error("APN: transmissionError: " + errCode + " for device ", device, notification);
  });
  apnConnection.on('connected', function() {
    debug("APN: Connected");
  });
  apnConnection.on('timeout', function () {
    debug("APN: Connection Timeout");
  });
  apnConnection.on('disconnected', function() {
    debug("APN: Disconnected from APNS");
  });
  apnConnection.on('socketError', console.error);
  this.apnConnection = apnConnection;
  
  
  var store = this.store = process.server.createStore(this.name + "-feedback");
  var feedback = new apn.Feedback(_.defaults({
    "batchFeedback": true,
    "interval": 300
  }, apnConfig));
  feedback.on("feedback", function(devices) {
    devices.forEach(function(item) {
      // Do something with item.device and item.time;
      console.log('APN Feedback', item.device, item.time);
      store.insert({
        _id: 'APN-'+item.device,
        network: 'APN',
        deviceId: item.device,
        time: item.time,
        mtime: (new Date()).toISOString(),
      }, function(){})      
    });
  });
  
}
util.inherits( Notify, Resource );

Notify.prototype.clientGeneration = true;

Notify.basicDashboard = {
  settings: [
  {
    name        : 'gcmSender',
    type        : 'text',
    description : 'Google Cloud Message Sender'
  }, {
    name        : 'apnCert',
    type        : 'text',
    description : 'Apple Push Notification Cert path'
  }, {
    name        : 'apnKey',
    type        : 'text',
    description : 'Apple Push Notification Key path'
  }, {
    name        : 'apnCertDev',
    type        : 'text',
    description : 'Apple Push Notification Dev Cert path'
  }, {
    name        : 'apnKeyDev',
    type        : 'text',
    description : 'Apple Push Notification Dev Key path'
  }, {
    name        : 'rootOrInternalOnly',
    type        : 'checkbox',
    description : 'Only allow root or internal scripts to send email'
  }, {
    name        : 'productionOnly',
    type        : 'checkbox',
    description : 'If on development mode, print emails to console instead of sending them'
  }]
};

Notify.prototype.handle = function ( ctx, next ) {
  
  if ( ctx.req && ctx.req.method == 'GET' ) {
    this.store.find(ctx.query, function(err, result) {
      ctx.done(err, result);
    })    
    return;
  }  
  
  
  if ( ctx.req && ctx.req.method !== 'POST' ) {
    return next();
  }
  
  if ( this.config.rootOrInternalOnly && (!ctx.req.internal && !ctx.req.isRoot) ) {
    return ctx.done({ statusCode: 403, message: 'Forbidden' });
  }
  
  var body = ctx.body || {};
  var gcmIds = body.gcmIds;
  var hasGcmIds = !_.isEmpty(gcmIds);
  var apnIds = body.apnIds;
  var hasApnIds = !_.isEmpty(apnIds);
  delete body.gcmIds;
  delete body.apnIds;
  
  var errors = {};
  if ( !hasGcmIds && !hasApnIds ) {
    errors.destIds = '\'gcmIds\' or \'apnIds\' is required';
  }
  if ( !body.message ) {
    errors.message = '\'message\' is required';
  }
  if ( Object.keys(errors).length ) {
    return ctx.done({ statusCode: 400, errors: errors });
  }
  
  
  var gcmMessage = null;
  if (hasGcmIds) {
    gcmMessage = new gcm.Message({
      collapseKey: 'notify',
      delayWhileIdle: false,
      timeToLive: 3600,  // in second
      data: body,
      // {
      //     title: title,
      //     message: message,
      //     //msgcnt: '1',
      //     //soundname: 'beep.wav',
      // },
    });
  }
  
  
  var apnMessage = null;
  if (hasApnIds) {
    var apnMessage = new apn.notification();
    
    if (body.title) apnMessage.setAlertTitle( body.title );
    if (body.message) apnMessage.setAlertText( body.message );
    if (body.action) apnMessage.setAlertAction( body.action );
    if (body.actionLocKey) apnMessage.setActionLocKey( body.actionLocKey );
    if (body.locKey) apnMessage.setLocKey( body.locKey );
    if (body.locArgs) apnMessage.setLocArgs( body.locArgs );
    if (body.launchImage) apnMessage.setLaunchImage( body.launchImage );
    if (body.mdm) apnMessage.setMDM( body.mdm );
    if (body.newsstandAvailable) apnMessage.setNewsstandAvailable( body.newsstandAvailable );
    if (body.contentAvailable) apnMessage.setContentAvailable( body.contentAvailable );
    if (body.urlArgs) apnMessage.setUrlArgs( body.urlArgs );
    //apnMessage.badge = 1;
    //apnMessage.payload = {'data-id': 'Caroline'};
    
    apnMessage.trim()      
  }
  
  
  var env = this.options.server.options.env;
  if (this.config.productionOnly && env != 'production') {
    console.log('_______________________________________________');
    console.log('Simulate CGM Notify', gcmMessage, gcmIds);
    console.log('Simulate APN Notify', apnMessage, apnIds);
    console.log('```````````````````````````````````````````````');
    return ctx.done( null, { message : 'Simulated sending' } );
  }
  
  
  var wait = new Wait();
  var resErr = null;
  var resResult = {};
  
  var store = this.store;
  if (gcmMessage) {
    var sender = new gcm.Sender(this.config.gcmSender);
    sender.send(gcmMessage, gcmIds, 4, wait(function(err, ret){
      resResult.gcm = ret;
      // ret = { multicast_id:NUMBER, success: 1, failure: 0, canonical_ids: 0, results: [ { message_id: 'ID' } ] }
      console.log('>>> sendGcm: ', err, ret);
      if (err || ret.failure > 0) {
        resErr = err;
        
        var time = (new Date()).toISOString();
        for (var i = 0, ii = gcmIds.length; i < ii; i++) {
          var gcmId = gcmIds[i];
          store.insert({
            _id: 'GCM-'+gcmId,
            network: 'GCM',
            deviceId: gcmId,
            error: err,
            result: ret,
            time: time,
            mtime: time,
          }, function(){})      
        }
      }
    }) );
  } 
  
  if (apnMessage) {
    for (var i = 0, ii = apnIds.length; i < ii; i++) {
      var destDevice = apnIds[i]; //new apn.Device(apnIds[i]);
      this.apnConnection.pushNotification(apnMessage, destDevice);
    }
    resResult = {apnSent:apnIds.length};
  }

  wait.then(function(){
    ctx.done( resErr, resResult );
  });
};


Notify.prototype.configChanged = function(config, fn) {
  var store = this.store;
  var configPath =  this.options.configPath;
  var name = this.name;
  
  var properties = config && config.properties;
  if(config.id && config.id !== this.name) {
    console.log("rename store")
    store.rename(config.id.replace('/', '')  + "-feedback", function (err) {
      fs.rename(configPath + "/" + name + ".js", configPath + "/" + config.id.replace('/', '') + ".js", function(err){
        fn(err)
      });
    });
    return;
  }
  
  fn(null);
};


/**
* Module export
*/

module.exports = Notify;
