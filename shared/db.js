// Cache layer using IndexedDB (via offline/idb.js)
const dbCache = new IDB('maac-cache', 'store');

async function getCachedDoc(collection, docId) {
  const key = `${collection}_${docId}`;
  const cached = await dbCache.get(key);
  if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
    return cached.data;
  }
  const snap = await db.collection(collection).doc(docId).get();
  if (snap.exists) {
    await dbCache.set(key, { data: snap.data(), timestamp: Date.now() });
    return snap.data();
  }
  return null;
}

async function getCachedCollection(collection, whereClause = null) {
  let query = db.collection(collection);
  if (whereClause) {
    query = query.where(whereClause.field, whereClause.op, whereClause.value);
  }
  const snap = await query.get();
  const results = [];
  snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
  return results;
}

// Batch write helper (for offline queue)
async function batchWrite(operations) {
  const batch = db.batch();
  operations.forEach(op => {
    const ref = db.collection(op.collection).doc(op.id);
    if (op.type === 'set') batch.set(ref, op.data, { merge: true });
    else if (op.type === 'update') batch.update(ref, op.data);
    else if (op.type === 'delete') batch.delete(ref);
  });
  return batch.commit();
}
