# Profile verification — Postman / QA samples

**Base URL:** `http://localhost:8000/api/user` (local) or staging host  
**Auth header:** `Authorization: Bearer {{accessToken}}`

All auth responses return `data.userInfo` with:

```json
{
  "signupMethod": "email",
  "emailVerified": false,
  "phoneNumberVerified": false
}
```

---

## Deploy checklist (backend)

1. Deploy API with P0 + phone signup changes
2. Run migration on staging/production:
   ```bash
   npm run migrate:profile-verification        # dry-run
   npm run migrate:profile-verification:apply  # apply
   ```
3. Confirm frontend QA against staging

---

## 1. Email sign up

`POST {{baseUrl}}/user/signUp`

```json
{
  "email": "qa.email@example.com",
  "password": "TestPass123",
  "confirmPassword": "TestPass123",
  "deviceType": "ANDROID",
  "fcmToken": "test-fcm-token"
}
```

**Expect:** `200`, `userInfo.signupMethod === "email"`, `emailVerified === false`

---

## 2. Phone sign up

`POST {{baseUrl}}/user/signUp`

```json
{
  "phoneNumber": "9876543210",
  "password": "TestPass123",
  "confirmPassword": "TestPass123",
  "deviceType": "ANDROID",
  "fcmToken": "test-fcm-token"
}
```

**Expect:** `200`, `userInfo.signupMethod === "phone"`, `phoneNumberVerified === false`, `phoneNumber` set

---

## 3. Sign in — email

`POST {{baseUrl}}/user/signIn`

```json
{
  "email": "qa.email@example.com",
  "password": "TestPass123",
  "deviceType": "ANDROID",
  "fcmToken": "test-fcm-token"
}
```

---

## 4. Sign in — phone

`POST {{baseUrl}}/user/signIn`

```json
{
  "phoneNumber": "9876543210",
  "password": "TestPass123",
  "deviceType": "ANDROID",
  "fcmToken": "test-fcm-token"
}
```

**Expect:** `userInfo` includes verification fields (badges fix after migration on legacy users)

---

## 5. Profile phone — OTP-only save (not UpdateUserDetails)

### 5a. Send OTP (does NOT save phone on user)

`POST {{baseUrl}}/sendOtpToVerifyMobileNumber`

```json
{ "phoneNumber": "9123456789" }
```

**Expect:** `200`, User document still has no `phoneNumber` until verify.

### 5b. Verify OTP (only place that saves phone)

`POST {{baseUrl}}/verifyOtpToVerfiyMobileNumber`

```json
{
  "phoneNumber": "9123456789",
  "otp": "123456"
}
```

**Expect:** `200`, `data.phoneNumberVerified === true`, `data.phoneNumber` set.

### 5c. UpdateUserDetails must reject phone

`POST {{baseUrl}}/UpdateUserDetails`

```json
{ "phoneNumber": "9123456789" }
```

**Expect:** `400`, `code: "PHONE_USE_OTP_FLOW"`

---

## 6. Update profile — other fields only

`POST {{baseUrl}}/UpdateUserDetails`

```json
{
  "firstName": "Test",
  "userName": "testuser01"
}
```

**Expect:** `200`, no phone fields changed unless already verified via §5b.

---

## 7. Send mobile OTP (alias — same as 5a)

`POST {{baseUrl}}/user/sendOtpToVerifyMobileNumber`

```json
{
  "phoneNumber": "9123456789"
}
```

---

## 8. Verify mobile OTP (alias — same as 5b)

`POST {{baseUrl}}/user/verifyOtpToVerfiyMobileNumber`

```json
{
  "phoneNumber": "9123456789",
  "otp": "123456"
}
```

**Expect:** `200`, `data.phoneNumberVerified === true`

---

## 9. Email OTP

Send: `POST {{baseUrl}}/user/sendOtp`

```json
{ "contact": "qa.email@example.com" }
```

Verify: `POST {{baseUrl}}/user/verifyOtp`

```json
{
  "contact": "qa.email@example.com",
  "otp": "123456"
}
```

**Expect:** sets `emailVerified: true` on user

---

## 10. Password settings

`GET {{baseUrl}}/user/password-settings`

**Expect:**

```json
{
  "authProvider": "email",
  "canChangePassword": true
}
```

Google/Apple users → `authProvider: "google" | "apple"`, `canChangePassword: false`

---

## 11. Google auth (smoke)

`POST {{baseUrl}}/user/googleAuth`

```json
{
  "token": "{{googleIdToken}}",
  "deviceType": "ANDROID",
  "fcmToken": "test-fcm-token"
}
```

**Expect:** `userInfo.signupMethod === "email"`, `emailVerified === true`, `googleAuthId` present

---

## 12. Migration verification

Query MongoDB or re-login legacy Google user:

- No `phoneNumber` → `phoneNumberVerified` must be `false`
- Google/Apple + email → `signupMethod: "email"`, `emailVerified: true`
- No `otpSkipped` field on user docs (removed when invalid)

---

## Frontend QA notes

- Drop local fallbacks for badges once migration + deploy confirmed on staging
- Phone signup UI on `Signup.tsx` can ship after backend confirms `POST /signUp` with `phoneNumber` live
- Red dot / notifications unchanged (`GET /getNotiReadCount`)
