/**
* Module dependencies
*/
var Resource = require('deployd/lib/resource');
var util = require('util');
var gcm = require('node-gcm');


/**
* Module setup.
*/
function Notify() {
    Resource.apply( this, arguments );
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

    var message = ctx.body || {};
    var gcmIds = message.gcmIds;
    delete message.gcmIds;
    // TODO: add apnIds later

    var errors = {};
    if (!gcmIds || gcmIds.length == 0) {
        errors.gcmIds = '\'gcmIds\' is required';
    }
    if ( !message.message ) {
        errors.message = '\'message\' is required';
    }
    if ( Object.keys(errors).length ) {
        return ctx.done({ statusCode: 400, errors: errors });
    }

    var that = this;

    var gcmMessage = new gcm.Message({
        collapseKey: 'notify',
        delayWhileIdle: false,
        timeToLive: 3600,  // in second
        data: message,
        // {
        //     title: title,
        //     message: message,
        //     //msgcnt: '1',
        //     //soundname: 'beep.wav',
        // },
    });

    var env = that.options.server.options.env;
    if (that.config.productionOnly && env != 'production') {
        console.log('_______________________________________________');
        console.log('Simulate CGM Notify', gcmMessage, gcmIds);
        console.log('```````````````````````````````````````````````');
        return ctx.done( null, { message : 'Simulated sending' } );
    }

    var sender = new gcm.Sender(this.config.gcmSender);
    sender.send(gcmMessage, gcmIds, 4, function(err, ret){
        console.log('>>> sendGcm: ', err, ret);
        ctx.done( err, ret );
    });

};

/**
* Module export
*/

module.exports = Notify;
