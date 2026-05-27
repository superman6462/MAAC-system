const offlineQueue = new IDB('maac-offline', 'queue');

async function addToQueue(operation) {
  const ops = (await offlineQueue.get('pending')) || { items: [] };
  ops.items.push({ ...operation, timestamp: Date.now() });
  await offlineQueue.set('pending', ops);
  // Request background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-attendance'));
  }
}

async function processQueue() {
  const ops = await offlineQueue.get('pending');
  if (!ops || !ops.items.length) return;
  const batchOps = ops.items.map(item => ({
    collection: item.collection,
    id: item.id,
    type: item.type,
    data: item.data
  }));
  try {
    await batchWrite(batchOps);
    await offlineQueue.set('pending', { items: [] });
    console.log('Offline queue synced');
  } catch (err) {
    console.error('Sync failed, will retry later', err);
  }
}

// Auto-retry when online
window.addEventListener('online', processQueue);
