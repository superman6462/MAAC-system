async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    const token = await messaging.getToken({ vapidKey: VAPID_KEY });
    // Save token to Firestore under user's doc
    const user = getCurrentUser();
    if (user && user.role === 'student') {
      await db.collection('students').doc(user.id).update({ fcmToken: token });
    }
    return token;
  }
}

// Show in‑app notification
function showInAppNotification(title, body, url = null) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/assets/images/icon-192.png' });
  }
}

// Listen for incoming messages
messaging.onMessage(payload => {
  showInAppNotification(payload.notification.title, payload.notification.body);
});
