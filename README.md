# dpd-notify

## Description

Send android push notification in deployd


## Getting started
This module requires deployd ~0.7.0.

If you haven't used Deployd before, make sure to read the [documentation](http://docs.deployd.com/).

### Installation without package.json
````
npm install dpd-notify
````

### Installation with package.json
If you have a package.json, you'll have to add this module in it.
````
npm install dpd-notify --save
````
Once it is installed, Deployd will automatically load it.  
For more information about Modules, take a look at [the module page on the deployd documentation](http://docs.deployd.com/docs/using-modules/).

## The dpd-notify module
### Overview

It is a simple [node-gcm](https://www.npmjs.org/package/node-gcm) wrapper for deployd

### Options/Settings

Require:
- gcmSender

Please fill them in using the deployd dashboard config page of this module.


### Usage example

// send push notification to android phone
dpd.notify.post( { gcmIds:['GCM_ID'], title:'Title', message:'Message' } );


## Contributing

Just send me a Pull Request in Github.


## Release history

- 1.0.0: first version


## Contributors

[Eric Fong](https://github.com/ericfong)
