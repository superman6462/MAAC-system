async function extractMarksFromImage(file) {
  const { data: { text } } = await Tesseract.recognize(file, 'eng+ben', {
    logger: m => console.log(m)
  });
  // Simplified parsing: assume lines like "Name: X, Marks: Y"
  const lines = text.split('\n');
  const results = [];
  lines.forEach(line => {
    const match = line.match(/([A-Za-z ]+)\s*[:-]\s*(\d+)/);
    if (match) {
      results.push({ name: match[1].trim(), marks: parseInt(match[2]) });
    }
  });
  return results;
}

async function processOCRUpload(file, classId, week) {
  const extracted = await extractMarksFromImage(file);
  const batch = db.batch();
  extracted.forEach(({ name, marks }) => {
    // Match name to student ID? For now, just store with name
    const ref = db.collection('weekly_results').doc(`${classId}_${week}_${name}`);
    batch.set(ref, { name, marks, classId, week, uploadedAt: firebase.firestore.FieldValue.serverTimestamp() });
  });
  await batch.commit();
  // Optionally update leaderboard
  await updateWeeklyLeaderboard();
}
