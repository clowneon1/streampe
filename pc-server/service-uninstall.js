/**
 * Run as Administrator: node service-uninstall.js
 */
const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'PaymentAlertsOBS',
  script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', () => {
  console.log('✅ Service uninstalled successfully.');
});

svc.on('error', (err) => {
  console.error('❌ Error:', err);
});

svc.uninstall();
