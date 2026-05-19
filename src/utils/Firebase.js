const admin = require('firebase-admin');

let initialized = false;

function initializeFirebase() {
  if (initialized) return true;

  const privateKey = process.env.private_key;
  if (!privateKey) {
    console.warn('Firebase credentials not configured; push notifications are disabled.');
    return false;
  }

  const serviceAccount = {
    type: process.env.type,
    project_id: process.env.project_id,
    private_key_id: process.env.private_key_id,
    private_key: privateKey.replace(/\\n/g, '\n'),
    client_email: process.env.client_email,
    client_id: process.env.client_id,
    auth_uri: process.env.auth_uri,
    token_uri: process.env.token_uri,
    auth_provider_x509_cert_url: process.env.auth_provider_x509_cert_url,
    client_x509_cert_url: process.env.client_x509_cert_url,
    universe_domain: process.env.universe_domain,
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  initialized = true;
  return true;
}

async function sendPushNotification(payload, res) {
  if (!initializeFirebase()) {
    if (res?.status) {
      return res.status(503).json({ error: 'Push notifications are not configured' });
    }
    return null;
  }

  let message;
  if (payload?.body?.token) {
    message = {
      token: payload.body.token,
      notification: {
        title: payload.body.title,
        body: payload.body.message,
      },
    };
  } else {
    message = payload;
  }

  try {
    const response = await admin.messaging().send(message);
    if (res?.status) {
      return res.status(200).json({ success: true, response });
    }
    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
    if (res?.status) {
      return res.status(500).json({ error: error.message });
    }
    throw error;
  }
}

module.exports = admin;
module.exports.sendPushNotification = sendPushNotification;
module.exports.initializeFirebase = initializeFirebase;
