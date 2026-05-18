const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const client = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
  cache: true,
  rateLimit: true,
});

function getSigningKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/**
 * @param {string} idToken - Apple identity token from the client
 * @param {string} audience - APPLE_CLIENT_ID (bundle id or services id)
 */
function verifyAppleIdToken(idToken, audience) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getSigningKey,
      {
        algorithms: ["RS256"],
        issuer: "https://appleid.apple.com",
        audience,
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      }
    );
  });
}

module.exports = verifyAppleIdToken;
