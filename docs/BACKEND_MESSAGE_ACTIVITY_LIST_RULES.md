# Backend message: Activity list rules (My post / Join Requested / New Admin)

**Implement on `GET /api/user/getUserPosts`**. Mobile mirrors these rules in `normalizeActivityPost.ts` until API is verified in production.

Related: [BACKEND_HANDOFF_ACTIVITY_SCREENS.md](./BACKEND_HANDOFF_ACTIVITY_SCREENS.md), [BACKEND_HANDOFF_CREATOR_REJOIN_EDGE_CASE.md](./BACKEND_HANDOFF_CREATOR_REJOIN_EDGE_CASE.md), [BACKEND_HANDOFF_JOIN_REQUESTED.md](./BACKEND_HANDOFF_JOIN_REQUESTED.md)

---

## Deploy checklist

1. Deploy updated `MyPostController.js` (or equivalent).
2. **Restart API** (`npm run dev` / production).
3. QA dedupe + fields below.

---

## Dedupe rule (critical QA)

**The same `post._id` must NOT appear on both My post and Join Requested.**

| Screen | `role` param |
|--------|----------------|
| My post | `created` |
| Join Requested | `joined` |
| New Admin | `transferred` |

---

## Rule summary

| Screen | Include when | Exclude when | Card footer |
|--------|--------------|--------------|-------------|
| **My post** | `postOwnerId === viewer` **or** ex-creator **archive** (`userId === viewer`, transferred, no pending/member) | Non-creators; ex-creator pending/member | **Manage** only if `postOwnerId === viewer` |
| **Join Requested** | Member or pending join; **ex-creator** after admin transfer (`userId === viewer`, `postOwnerId !== viewer`) | `postOwnerId === viewer` (use New Admin); creator still owner | **Joined** / **Request Pending**; optional “You created this club” |
| **New Admin** | `postOwnerId === viewer` && `userId !== viewer` | — | **Manage** |

### `role=joined` — include ex-creator rejoin

```text
postOwnerId !== viewer
AND (active member OR pending ClubRequest)
// includes userId === viewer when postOwnerId !== viewer (ex-creator rejoin)
```

Excludes only posts you **still own** (`postOwnerId === viewer` → My post / New Admin).

### `role=created` — ex-creator archive only

```text
(userId === viewer AND postOwnerId === viewer)
OR
(userId === viewer AND postOwnerId !== viewer AND NOT pending AND NOT active member)   // archive
```

Ex-creator **pending** rejoin → **Join Requested** (not My post).

---

## Required fields (every row)

| Field | Notes |
|-------|--------|
| `userId` | Original creator |
| `postOwnerId` | Current admin / owner |
| `membershipStatus` | `active` \| `left` — do not treat `left` as in `members` |
| `requestStatus` | `pending` \| `accepted` \| `null` |
| `memberCount`, `clubMembers`, `spotsOpen`, `isFull` | Card chips |
| `canManageRequests` | `true` only when `postOwnerId === viewer` |
| `createdAt` | Newest-first sort |

Example:

```json
{
  "_id": "...",
  "userId": "creatorId",
  "postOwnerId": "adminId",
  "membershipStatus": "left",
  "requestStatus": "pending",
  "canManageRequests": false,
  "itemName": "...",
  "clubStatus": "Active",
  "memberCount": 2,
  "clubMembers": 4
}
```

---

## Edge case QA matrix

User **A** created post → transferred admin to **B** → left → `requestStatus: pending`

| Screen | Show? |
|--------|-------|
| My post | **No** |
| Join Requested | **Yes** — Request Pending, hint “You created this club” |
| New Admin | **No** (B only) |

User still owns post (`postOwnerId === A`):

| My post | Yes — Manage |
| Join Requested | No |

---

## Frontend (JJ_Frontend)

- `shouldIncludeOnMyPostList()` — aligned with `role=created`
- `shouldIncludeOnJoinRequestedList()` — excludes `userId === viewer`
- Client filters remain as safety net after deploy; can trim once API is stable in prod.
