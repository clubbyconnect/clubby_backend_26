# Backend handoff — club rejoin (JJ_Backend)

Deploy latest `JJ_Backend` and **restart** (`npm run dev` locally, redeploy on Vercel for production).

---

## Summary

Users may join a club **at most twice**. Leaving increments `leaveCount` on a persistent `leftMembers` row (never deleted on rejoin). After the **second** leave (`leaveCount >= 2`), the post is hidden from that user’s home feed and they cannot request again (`requestStatus: exhausted`).

---

## Data model — `Group.leftMembers[]`

| Field | Type | Notes |
|-------|------|--------|
| `user` | ObjectId | User ref |
| `leftAt` | Date | Last leave time (read-only chat cutoff) |
| `leaveCount` | Number | Default `1`; incremented on each leave |
| `rejoinedAt` | Date | Set on accept/rejoin; cleared on next leave |
| `membershipHistory` | `{ event: 'left' \| 'rejoined', at }[]` | Audit trail on **this** group (not a new Group doc) |

**`markUserRejoined(group, userId)`** — sets `rejoinedAt`, appends `rejoined` to `membershipHistory`, does **not** remove the row or reset `leaveCount`.

**`recordUserLeft(group, userId)`** — removes from `members`, updates or creates `leftMembers`, increments `leaveCount`, clears `rejoinedAt`, appends `left` to history.

**`getMembershipAudit(group, userId)`** — returns `leaveCount`, `rejoinCount`, `wasInClubTwice`, `membershipStints`, `history[]` for support/logs.

Server logs: `[membership] left` / `[membership] rejoined` with `groupId`, `userId`, `leaveCount`.

---

## Chat on leave / rejoin (same group, same thread)

Rejoin does **not** create a new `Group` document. Messages stay on the same `groupId`.

### Backend behaviour

| Action | `members` | `leftMembers` | Messages |
|--------|-----------|---------------|----------|
| **Leave** | User removed | Row kept; `leaveCount++`; `leftAt` set | History kept on group |
| **Pending rejoin** | Not in members | Row kept; `rejoinedAt` cleared if was set | No new messages for user |
| **Accept rejoin** | `markUserRejoined` then `members.push` | Same row; `rejoinedAt` set; history += `rejoined` | Same thread; new messages after accept |

### What the user sees (mobile)

| Phase | Messages list | Chat screen |
|-------|---------------|-------------|
| **After leave** | Same club; preview *"You're no longer part of this group"* | Banner: *"You're no longer part of this group. New messages are hidden."* — `readOnly: true`, `membershipStatus: 'left'` |
| **Rejoin pending** | Still read-only if they open chat | Wait on **My post** / post detail (Request Pending); not in live club |
| **After accept** | Same conversation in Messages | Same history via `GET /getMessages/:groupId`; input bar returns |

### What it is **not**

- Not a new group per join/rejoin.
- Not a blank chat (unless product deliberately created a new Group — **current backend does not**).

### Optional product copy (UI)

| Screen | Suggestion |
|--------|------------|
| Post detail (left + pending) | *"Your previous group chat is paused until the admin accepts your rejoin."* |
| After accept | *"You're back in the same group chat."* |

### Relation to activity tabs

| Concern | Screen |
|---------|--------|
| Rejoin request | **My post** (you created it) or post detail — pending pill |
| Chat while waiting | Same thread, **read-only** |
| Chat after accept | Same thread, **active** |

See [BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md](./BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md) — same post must not duplicate on My post + Join Requested.

---

## Audit — “Was this user in the club twice?”

Use `leftMembers` on the **same** `Group` (single `groupId`).

| Signal | Meaning |
|--------|---------|
| `leaveCount === 1` | Left once; may rejoin once |
| `leaveCount >= 2` | Left twice; exhausted (hidden from home feed) |
| `rejoinCount >= 1` (from `membershipHistory`) | User was accepted back after at least one leave |
| `wasInClubTwice: true` | `rejoinCount >= 1` — member stint, then left, then rejoined |
| `membershipStints` | Rough count of active periods (rejoins + currently active) |

### API — `membershipAudit` object

Returned on:

- `GET /getMessages/:groupId`
- `GET /getGroupDetails/:groupId`
- `GET /club/:productId` (each request row for post owner)

```json
{
  "leaveCount": 1,
  "rejoinCount": 1,
  "wasInClubTwice": true,
  "membershipStints": 2,
  "currentlyActive": true,
  "currentlyLeft": false,
  "leftAt": "2026-03-10T12:00:00.000Z",
  "rejoinedAt": "2026-03-12T09:00:00.000Z",
  "history": [
    { "event": "left", "at": "2026-03-10T12:00:00.000Z" },
    { "event": "rejoined", "at": "2026-03-12T09:00:00.000Z" }
  ]
}
```

### MongoDB support query

```javascript
// User was in this club twice (left then rejoined at least once)
db.groups.findOne(
  { _id: ObjectId("GROUP_ID"), "leftMembers.user": ObjectId("USER_ID") },
  { "leftMembers.$": 1 }
);
// Check: leftMembers[0].membershipHistory has both "left" and "rejoined"
// Or: getMembershipAudit(group, userId).wasInClubTwice === true
```

### Server logs (grep)

```
[membership] left
[membership] rejoined
```

---


## Post detail — `GET /api/user/post/:productId`

Uses **`resolveVisitorRequestState(group, userId, clubRequest)`**.

Never returns `requestStatus: "accepted"` unless the user is in `group.members`.

| Situation | `requestStatus` | `membershipStatus` | `canRejoin` | `rejoinMessage` |
|-----------|-----------------|-------------------|-------------|-----------------|
| Active member | `accepted` (or DB status) | `active` | `true` | `null` |
| Left once, can rejoin | `pending` or `null` | `left` | `true` | Warning (below) |
| Left twice (exhausted) | `exhausted` | `left` | `false` | Exhausted (below) |
| Never joined | DB status | `none` | `true` | `null` |

Response also includes: `leaveCount`, `feedHidden`.

---

## Rejoin request — `GET /api/user/club/join/:postId` (`sendClubRequest`)

- Blocks when `leaveCount >= 2` → **403** `REJOIN_EXHAUSTED`
- If DB has stale `accepted` but user not in `members` → reset to **`pending`**
- New request after a prior leave → `isRejoin: true`, `rejoinMessage` set
- Response **200**:
  ```json
  {
    "message": "Rejoin request sent. Waiting for the post owner.",
    "requestStatus": "pending",
    "isRejoin": true,
    "rejoinMessage": "You were part of this club but left..."
  }
  ```

---

## Accept request — `POST /api/user/club-request/action`

On `status: "accepted"`:

1. **`markUserRejoined(group, requesterId)`** (before push to `members`)
2. `group.members.push(requesterId)`
3. `group.save()`

---

## Home feed — `GET /api/user/searchProducts` & `GET /api/user/homeBootstrap`

`executeProductSearch` excludes posts where the viewer has `leftMembers` entry with:

- `leaveCount >= 2`
- `rejoinedAt` not set (currently left / exhausted)

---

## Copy for QA (exact strings)

**Rejoin warning** (`rejoinMessage` / `REJOIN_WARNING_MESSAGE`):

> You were part of this club but left. You can request to join again — this is your second and final chance. If you leave again, this post will no longer appear on your home feed.

**Exhausted** (`requestStatus: exhausted` / `EXHAUSTED_REJOIN_MESSAGE`):

> You have already used both chances to join this club. This post will not appear on your home feed.

---

## Legacy users

Users who left **before** `leftMembers` / `leaveCount` existed may need to **leave once more** under this backend for counts to be correct.

---

## Related endpoints (unchanged contract)

| Endpoint | Left-group behavior |
|----------|---------------------|
| `POST /leaveGroupRequest` | `recordUserLeft`, `membershipStatus: left` |
| `POST /myGroups` | Includes left groups, read-only preview |
| `GET /getMessages/:groupId` | Messages `createdAt <= leftAt`, `readOnly: true` |
| `GET /getGroupDetails/:groupId` | `membershipStatus`, `readOnly` |

---

## Files

| File | Role |
|------|------|
| `src/utils/groupMembership.js` | `recordUserLeft`, `markUserRejoined`, `getUserMembership`, `getMembershipAudit` |
| `src/utils/clubRejoin.js` | `resolveVisitorRequestState`, `getFeedExcludedPostIds` |
| `src/models/Group.js` | `leftMembers` schema |
| `src/controllers/ClubRequestController.js` | Join + accept |
| `src/controllers/PostController.js` | Post detail visitor state |
| `src/services/productSearch.js` | Feed exclusion |

---

## Frontend (Clubby)

`SingleItemScreen.tsx` handles:

- `membershipStatus: 'left'`
- `canRejoin`
- `rejoinMessage`
- `requestStatus: 'exhausted'`

After leave success → navigate to **Messages** tab (client-side).
