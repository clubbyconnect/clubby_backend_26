# Backend checklist — unified auth OTP (`authFlow: 'auth'`)

**Date:** 2026-06-03  
**Frontend:** `AuthEntryScreen` → `POST /api/user/sendOtp` + `verifyOtp` with `authFlow: 'auth'`

---

## 1. Gmail / email OTP (local dev)

In `JJ_Backend/.env`:

```env
MAIL_HOST=smtp.gmail.com
MAIL_USER=your@gmail.com
MAIL_PASS=xxxx xxxx xxxx xxxx   # 16-char App Password, NOT your Gmail login password
```

1. Google Account → Security → 2-Step Verification ON  
2. App passwords → create “Mail” → copy 16 characters into `MAIL_PASS`  
3. Restart: `npm run dev`

**Or** skip email OTP: use **Google / Apple** on the entry screen (`googleAuth` / `appleAuth` set `emailVerified: true`).

---

## 2. Phone OTP (Fast2SMS)

```env
FAST2SMS_URL=https://www.fast2sms.com/dev/bulkV2
FAST2SMS_API_KEY=your_key
```

Restart `npm run dev` after changes.

---

## 3. Unified sign-up / sign-in (`authFlow: 'auth'`)

### `POST /api/user/sendOtp`

```json
{ "contact": "user@example.com", "authFlow": "auth" }
```

| `authFlow` | Behavior |
|------------|----------|
| `"auth"` / `"signin"` / `"signup"` | Send OTP **without** requiring an existing user (new emails OK) |
| omitted / `"reset"` | Legacy: user **must** exist → `404 User not found` |

### `POST /api/user/verifyOtp`

```json
{
  "contact": "user@example.com",
  "otp": "123456",
  "authFlow": "auth",
  "deviceType": "ANDROID",
  "fcmToken": "..."
}
```

| `authFlow` | Behavior |
|------------|----------|
| unified | Find or **create** user, set verified flag, return `accessToken` + `data.userInfo` + `isNewUser` |
| omitted | Legacy: verify only; email → `emailVerified`; no session tokens |

Response shape (unified) matches `signIn`:

```json
{
  "message": "User registered successfully",
  "isNewUser": true,
  "token": "...",
  "accessToken": "...",
  "data": { "accessToken": "...", "userInfo": { ... } }
}
```

---

## 4. Profile phone (separate flow)

Still uses JWT routes — **not** `sendOtp` / `verifyOtp`:

- `POST /api/user/sendOtpToVerifyMobileNumber`
- `POST /api/user/verifyOtpToVerfiyMobileNumber`

---

## 5. Quick test (Postman / app)

1. `POST sendOtp` `{ "contact": "newuser@example.com", "authFlow": "auth" }` → `200` (not `404`)
2. Check email inbox (or SMS for 10-digit phone)
3. `POST verifyOtp` with `authFlow: "auth"` + `deviceType` + `fcmToken` → `200` + `accessToken`
4. Reload app → signed in

---

## 6. Common errors

| Symptom | Fix |
|---------|-----|
| `404 User not found` on send (new email) | Deploy backend with unified `authFlow` support |
| `500` / SMTP / `535` on send | Fix `MAIL_*` in `.env` |
| `OTP already sent` on resend | Wait 5 min (OTP TTL) or use new contact |
| Verify OK but no session | Ensure `authFlow: "auth"` on verify + `deviceType` / `fcmToken` in body |

---

## 7. Do not use for profile add-phone

| Wrong | Right |
|-------|-------|
| `sendOtp` / `verifyOtp` | `sendOtpToVerifyMobileNumber` / `verifyOtpToVerfiyMobileNumber` |
