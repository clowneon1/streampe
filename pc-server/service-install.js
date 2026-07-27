/**
 * Run this ONCE after installing to register as a Windows Service.
 * Run as Administrator: node service-install.js
 */
const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'PaymentAlertsOBS',
  description: 'Payment Alerts for OBS - forwards phone notifications to stream overlay',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [],
  env: {
    name: 'PORT',
    value: 2907
  }
});

svc.on('install', () => {
  console.log('✅ Service installed successfully!');
  console.log('   Starting service...');
  svc.start();
});

svc.on('start', () => {
  console.log('✅ PaymentAlertsOBS service is running on port 2907');
  console.log('   It will auto-start on every Windows boot.');
});

svc.on('error', (err) => {
  console.error('❌ Service error:', err);
});

svc.on('alreadyinstalled', () => {
  console.log('⚠️  Service already installed. Run service-uninstall.js first if you want to reinstall.');
});

svc.install();
