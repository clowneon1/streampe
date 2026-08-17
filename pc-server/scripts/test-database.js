const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Load UMD PaymentsCsv module
const PaymentsCsv = require('../public/js/lib/payments-csv.js');

console.log('🧪 Starting Payment Alerts persistent database test suite...');

// Setup temporary directory for tests
const DATA_DIR = path.join(__dirname, '..', 'data');
const TEST_PROFILE = 'test_db_profile';
const TEST_PROFILE_DIR = path.join(DATA_DIR, TEST_PROFILE);

// Helper to clean up test directory
function cleanupTestDir() {
  if (fs.existsSync(TEST_PROFILE_DIR)) {
    fs.rmSync(TEST_PROFILE_DIR, { recursive: true, force: true });
  }
}

// ── Mocks of Server Database Core functions ─────────────────────────
function getDonationsCsvPath(profileName, yearMonth) {
  const profile = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const [year, month] = yearMonth.split('-');
  return path.join(DATA_DIR, profile, year, `${month}.csv`);
}

function loadDonations(profileName, monthFilter = 'all') {
  const profile = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const profileDir = path.join(DATA_DIR, profile);
  if (!fs.existsSync(profileDir)) return [];

  let filesToRead = [];
  if (monthFilter && monthFilter !== 'all') {
    const filePath = getDonationsCsvPath(profile, monthFilter);
    if (fs.existsSync(filePath)) filesToRead.push(filePath);
  } else {
    // Read all year/month folders
    const years = fs.readdirSync(profileDir).filter(y => /^\d{4}$/.test(y));
    for (const year of years) {
      const yearDir = path.join(profileDir, year);
      const months = fs.readdirSync(yearDir).filter(m => /^\d{2}\.csv$/.test(m));
      for (const m of months) {
        filesToRead.push(path.join(yearDir, m));
      }
    }
  }

  let merged = [];
  for (const f of filesToRead) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      merged = merged.concat(PaymentsCsv.parseCsv(content));
    } catch (_) {}
  }
  
  // Sort descending by timestamp
  return merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
}

function saveDonations(profileName, transactions) {
  const profile = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const profileDir = path.join(DATA_DIR, profile);
  
  // Delete existing sharded monthly CSV files
  if (fs.existsSync(profileDir)) {
    const years = fs.readdirSync(profileDir).filter(y => /^\d{4}$/.test(y));
    for (const year of years) {
      fs.rmSync(path.join(profileDir, year), { recursive: true, force: true });
    }
  }

  // Shard and write transactions to their respective monthly files
  const sharded = {};
  for (const tx of transactions) {
    const ts = Number(tx.timestamp) || Date.now();
    const d = new Date(ts);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const ym = `${yr}-${mo}`;
    if (!sharded[ym]) sharded[ym] = [];
    sharded[ym].push(tx);
  }

  for (const ym of Object.keys(sharded)) {
    const filePath = getDonationsCsvPath(profile, ym);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const csvContent = PaymentsCsv.serializeCsv(sharded[ym]);
    fs.writeFileSync(filePath, csvContent, 'utf8');
  }
}

function getMetadataPath(profileName) {
  return path.join(DATA_DIR, profileName.replace(/[^a-zA-Z0-9_-]/g, '_'), 'metadata.json');
}

function loadProfileMetadata(profileName) {
  const filePath = getMetadataPath(profileName);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return {
    goal: { currentAmount: 0 },
    leaderboard: { supporters: {} },
    recent: { recentDonations: [] }
  };
}

function saveProfileMetadata(profileName, metadata) {
  const filePath = getMetadataPath(profileName);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
}

// Replicate legacy CSV database migration
function migrateLegacyCsvDatabases() {
  const profileDir = TEST_PROFILE_DIR;
  if (!fs.existsSync(profileDir)) return;

  const legacyFile = path.join(profileDir, 'donations.csv');
  if (fs.existsSync(legacyFile)) {
    try {
      const content = fs.readFileSync(legacyFile, 'utf8');
      const transactions = PaymentsCsv.parseCsv(content);
      if (transactions.length > 0) {
        saveDonations(TEST_PROFILE, transactions);
      }
      fs.renameSync(legacyFile, `${legacyFile}.bak`);
    } catch (e) {
      throw new Error('Migration failed: ' + e.message);
    }
  }
}

// ── TEST RUNNERS ────────────────────────────────────────────────────
try {
  cleanupTestDir();
  fs.mkdirSync(TEST_PROFILE_DIR, { recursive: true });

  // 1. Test CSV Parser backward-compatibility (old header fields)
  console.log('⚡ Running Test 1: CSV Parser & Serializer backward-compatibility...');
  const oldCsvData = [
    'id,timestamp,date,time,sender,amount,currency,sourceApp,message,templateId,simulated',
    'evt_1715000000000,1715000000000,2024-05-06,20:36:40,Rahul Sharma,500.00,INR,PhonePe,Superchat contribution!,default_template,false',
    'evt_1715000100000,1715000100000,2024-05-06,20:38:20,Priya Patel,150.00,INR,Google Pay,Keep it up!,default_template,true'
  ].join('\n');

  const parsed = PaymentsCsv.parseCsv(oldCsvData);
  assert.strictEqual(parsed.length, 2, 'Should parse exactly 2 records');
  assert.strictEqual(parsed[0].sender, 'Priya Patel', 'First sender should match');
  assert.strictEqual(parsed[1].sender, 'Rahul Sharma', 'Second sender should match');
  assert.strictEqual(parsed[0].amount, 150.00, 'Amount should be numeric');

  // Verify formatting does NOT write templateId or simulated columns anymore
  const formatted = PaymentsCsv.serializeCsv(parsed);
  assert.ok(!formatted.includes('templateId'), 'Serialized CSV headers should omit templateId');
  assert.ok(!formatted.includes('simulated'), 'Serialized CSV headers should omit simulated');
  assert.ok(formatted.includes('Rahul Sharma'), 'Serialized CSV should retain data values');
  console.log('✅ Test 1 Passed!');

  // 2. Test Parser Date Fallbacks on import
  console.log('⚡ Running Test 2: Date fallback logic on malformed imports...');
  const malformedCsv = [
    'id,timestamp,date,time,sender,amount,currency,sourceApp,message',
    'evt_empty_ts,,2026-08-17,12:00:00,Blank TS,100,INR,Manual,test',
    'evt_empty_date,1773734400000,,,Blank Date,200,INR,Manual,test',
    'evt_both_empty,,,,,Blank Both,300,INR,Manual,test'
  ].join('\n');

  const parsedFallback = PaymentsCsv.parseCsv(malformedCsv);
  assert.strictEqual(parsedFallback.length, 3, 'Should parse all 3 fallback rows');
  
  const rowEmptyTs = parsedFallback.find(t => t.id === 'evt_empty_ts');
  const rowEmptyDate = parsedFallback.find(t => t.id === 'evt_empty_date');
  const rowBothEmpty = parsedFallback.find(t => t.id === 'evt_both_empty');

  assert.ok(rowEmptyTs && rowEmptyTs.timestamp > 0, 'Row with empty timestamp should parse timestamp from date');
  assert.ok(rowEmptyDate && rowEmptyDate.date.includes('2026-03'), 'Row with empty date should compute correct month string from timestamp');
  assert.ok(rowBothEmpty && rowBothEmpty.timestamp > Date.now() - 5000, 'Row with both empty should fallback to current timestamp');
  assert.strictEqual(rowBothEmpty.date, new Date().toISOString().split('T')[0], 'Row with both empty date should match current date');
  console.log('✅ Test 2 Passed!');

  // 3. Test Legacy Database Migration & Sharding
  console.log('⚡ Running Test 3: Legacy CSV migration and monthly directory sharding...');
  const legacyPath = path.join(TEST_PROFILE_DIR, 'donations.csv');
  fs.writeFileSync(legacyPath, oldCsvData, 'utf8');

  migrateLegacyCsvDatabases();
  
  // Verify legacy file was renamed to .bak
  assert.ok(!fs.existsSync(legacyPath), 'Legacy CSV file should be renamed');
  assert.ok(fs.existsSync(`${legacyPath}.bak`), 'Legacy CSV backup should exist');

  // Verify sharded database structure was created: data/test_db_profile/2024/05.csv
  const shardedPath = getDonationsCsvPath(TEST_PROFILE, '2024-05');
  assert.ok(fs.existsSync(shardedPath), 'Sharded CSV directory should contain May 2024 database file');
  
  const shardedContent = fs.readFileSync(shardedPath, 'utf8');
  assert.ok(shardedContent.includes('Rahul Sharma'), 'Sharded CSV should retain transaction contents');
  console.log('✅ Test 3 Passed!');

  // 4. Test Metadata Sync / Rebuild Calculations
  console.log('⚡ Running Test 4: Rebuilding metadata.json and stripping configurations...');
  
  const mockTransactions = [
    { id: '1', timestamp: 1715000000000, date: '2024-05-06', time: '20:30:00', sender: 'Rahul', amount: 500, currency: 'INR', sourceApp: 'PhonePe', message: 'Hi' },
    { id: '2', timestamp: 1715000100000, date: '2024-05-06', time: '20:32:00', sender: 'Rahul', amount: 300, currency: 'INR', sourceApp: 'GPay', message: 'Hello' },
    { id: '3', timestamp: 1715000200000, date: '2024-05-06', time: '20:34:00', sender: 'Priya', amount: 1000, currency: 'INR', sourceApp: 'Paytm', message: 'Thanks' }
  ];
  saveDonations(TEST_PROFILE, mockTransactions);

  // Replicate forceRebuild sync
  const startAmount = 100;
  const metrics = PaymentsCsv.computeMetrics(mockTransactions, { startAmount, includeSimulated: false });
  
  const testMetadata = {
    goal: { currentAmount: metrics.goalAmount },
    leaderboard: { supporters: metrics.supporters },
    recent: { recentDonations: metrics.recentDonations }
  };
  saveProfileMetadata(TEST_PROFILE, testMetadata);

  // Assertions on metadata totals
  const loadedMeta = loadProfileMetadata(TEST_PROFILE);
  assert.strictEqual(loadedMeta.goal.currentAmount, 1900, 'Goal progress should calculate 1800 from rows + 100 startAmount');
  assert.strictEqual(loadedMeta.leaderboard.supporters['Rahul'], 800, 'Leaderboard sum of Rahul contributions should be 800');
  assert.strictEqual(loadedMeta.leaderboard.supporters['Priya'], 1000, 'Leaderboard Priya contribution should be 1000');
  assert.strictEqual(loadedMeta.recent.recentDonations.length, 3, 'Recent history length should track all 3 items');
  console.log('✅ Test 4 Passed!');

  // 5. Test Filter-Based CSV Export Queries
  console.log('⚡ Running Test 5: Date range and filter query boundaries...');
  
  const dbTransactions = loadDonations(TEST_PROFILE);
  
  // Filter by provider 'Paytm'
  const filterPaytm = PaymentsCsv.filterTransactions(dbTransactions, { provider: 'paytm', includeSimulated: false });
  assert.strictEqual(filterPaytm.length, 1, 'Provider filter should return exactly 1 transaction');
  assert.strictEqual(filterPaytm[0].sender, 'Priya', 'Filtered provider sender should match');

  // Filter by search text 'Rahul'
  const filterSearch = PaymentsCsv.filterTransactions(dbTransactions, { search: 'Rahul', includeSimulated: false });
  assert.strictEqual(filterSearch.length, 2, 'Search text filter should match exactly 2 rows');

  // Filter by date range (overlapping May 2024)
  const filterRange = PaymentsCsv.filterTransactions(dbTransactions, { 
    startDate: '2024-05-01', 
    endDate: '2024-05-10', 
    includeSimulated: false 
  });
  assert.strictEqual(filterRange.length, 3, 'Date range filter should fetch all 3 rows matching May range');

  // Filter by empty/out-of-bounds date range
  const filterOutOfBounds = PaymentsCsv.filterTransactions(dbTransactions, { 
    startDate: '2024-06-01', 
    endDate: '2024-06-30', 
    includeSimulated: false 
  });
  assert.strictEqual(filterOutOfBounds.length, 0, 'Out-of-bounds date range should return 0 items');

  // Test month range normalization boundary (From 2024-04 to 2024-05, making sure May is included)
  let testStart = '2024-04';
  let testEnd = '2024-05';

  if (testStart.length === 7) testStart = `${testStart}-01`;
  if (testEnd.length === 7) {
    const [year, monthVal] = testEnd.split('-').map(Number);
    const lastDay = new Date(year, monthVal, 0).getDate();
    testEnd = `${testEnd}-${String(lastDay).padStart(2, '0')}`;
  }

  const filterBoundary = PaymentsCsv.filterTransactions(dbTransactions, { 
    startDate: testStart, 
    endDate: testEnd, 
    includeSimulated: false 
  });
  assert.strictEqual(filterBoundary.length, 3, 'Month boundary normalization should fully include May transactions');

  // Test amount ascending sort
  const sortedAsc = [...filterBoundary].sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0));
  assert.strictEqual(sortedAsc[0].amount, 300, 'Ascending sort should put lowest amount first');
  assert.strictEqual(sortedAsc[2].amount, 1000, 'Ascending sort should put highest amount last');

  // Test amount descending sort
  const sortedDesc = [...filterBoundary].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  assert.strictEqual(sortedDesc[0].amount, 1000, 'Descending sort should put highest amount first');
  assert.strictEqual(sortedDesc[2].amount, 300, 'Descending sort should put lowest amount last');

  console.log('✅ Test 5 Passed!');

  // 6. Test Custom Directories & Single Storage Root Bootstrapping
  console.log('⚡ Running Test 6: Custom storage root & PUBLIC_DIR resolution...');
  const TEST_DIR = TEST_PROFILE_DIR;
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const testPathConfigFile = path.join(TEST_DIR, 'path-config.json');
  const customConfig = {
    storageRootDir: path.join(TEST_DIR, 'custom-storage-root')
  };

  fs.writeFileSync(testPathConfigFile, JSON.stringify(customConfig, null, 2), 'utf8');
  assert.ok(fs.existsSync(testPathConfigFile), 'path-config.json should be written successfully');

  const parsedPaths = JSON.parse(fs.readFileSync(testPathConfigFile, 'utf8'));
  const storageRoot = parsedPaths.storageRootDir && parsedPaths.storageRootDir.trim()
    ? path.resolve(parsedPaths.storageRootDir.trim())
    : TEST_DIR;

  const testLogDir      = path.join(storageRoot, 'logs');
  const testSettingsDir = path.join(storageRoot, 'config');
  const testDataDir     = path.join(storageRoot, 'data');

  assert.strictEqual(testLogDir, path.join(customConfig.storageRootDir, 'logs'), 'Logs dir should be subfolder under storage root');
  assert.strictEqual(testSettingsDir, path.join(customConfig.storageRootDir, 'config'), 'Config dir should be subfolder under storage root');
  assert.strictEqual(testDataDir, path.join(customConfig.storageRootDir, 'data'), 'Data dir should be subfolder under storage root');

  // Test fallback when storageRootDir is empty
  const emptyConfig = { storageRootDir: '   ' };
  const fallbackRoot = emptyConfig.storageRootDir && emptyConfig.storageRootDir.trim()
    ? path.resolve(emptyConfig.storageRootDir.trim())
    : TEST_DIR;

  assert.strictEqual(fallbackRoot, TEST_DIR, 'Fallback root should resolve to base directory');
  assert.strictEqual(path.join(fallbackRoot, 'logs'), path.join(TEST_DIR, 'logs'), 'Fallback logs dir should be subfolder under base dir');

  // Test dynamic PUBLIC_DIR resolution
  const testExecDir = TEST_DIR;
  const testExecPublic = path.join(testExecDir, 'public');
  fs.mkdirSync(testExecPublic, { recursive: true });
  fs.writeFileSync(path.join(testExecPublic, 'app.html'), '<html></html>', 'utf8');

  let resolvedPublic = path.join(testExecDir, 'public');
  if (!fs.existsSync(resolvedPublic)) {
    resolvedPublic = path.join(__dirname, '..', 'public');
  }
  assert.strictEqual(resolvedPublic, testExecPublic, 'PUBLIC_DIR should resolve relative to process execution directory');
  assert.ok(fs.existsSync(path.join(resolvedPublic, 'app.html')), 'PUBLIC_DIR app.html asset should exist');

  console.log('✅ Test 6 Passed!');

  // Cleanup testing workspace
  cleanupTestDir();
  console.log('\n🎉 ALL PERSISTENT DATABASE TEST CASES PASSED SUCCESSFULLY!');
} catch (err) {
  cleanupTestDir();
  console.error('\n❌ TEST SUITE FAILURE:');
  console.error(err);
  process.exit(1);
}
