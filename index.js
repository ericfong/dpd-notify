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



/**
* Module setup.
*/
function Notify(name, options) {
  Resource.apply( this, arguments );
  
  var configPath = options.configPath;
  var apnCertPath = this.config.apnCert && Path.join(configPath, this.config.apnCert);
  var apnKeyPath = this.config.apnKey && Path.join(configPath, this.config.apnKey);


  // Create a connection to the apn service using mostly default parameters.
  var apnConnection = new apn.connection({
    cert: apnCertPath,
    key: apnKeyPath,
    gateway: 'gateway.sandbox.push.apple.com'
  });
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

    if ( ctx.req && ctx.req.method !== 'POST' ) {
        return next();
    }

    if ( this.config.rootOrInternalOnly && (!ctx.req.internal && !ctx.req.isRoot) ) {
        return ctx.done({ statusCode: 403, message: 'Forbidden' });
    }

    var body = ctx.body || {};
    var gcmIds = body.gcmIds;
    var hasGcmIds = _.isEmpty(gcmIds);
    var apnIds = body.apnIds;
    var hasApnIds = _.isEmpty(apnIds);
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


    if (gcmMessage) {
      var sender = new gcm.Sender(this.config.gcmSender);
      sender.send(gcmMessage, gcmIds, 4, function(err, ret){
        console.log('>>> sendGcm: ', err, ret);
        ctx.done( err, ret );
      });
    }

    if (apnMessage) {
      this.apnConnection.pushNotification(apnMessage, apnIds);
    }
    
};

/**
* Module export
*/

module.exports = Notify;
