# User flow: Transfer admin → leave → rejoin (ex-creator)

Clear journey for QA and backend/mobile alignment. Ownership is stored on `post.userId` (original creator) and `post.postOwnerId` (current admin). **Activity cards do not show “You created this club”.**

---

## Roles

| Field | Meaning |
|-------|---------|
| `post.userId` | Who **created** the deal (never changes) |
| `post.postOwnerId` | Who **runs** the club now (changes on admin transfer) |
| `group.members` | Active chat members |
| `group.leftMembers` | Left history (kept for rejoin limits) |
| `ClubRequest.status` | `pending` → `accepted` / `declined` |

---

## Journey (User A = original creator, User B = new admin)

### 1. A creates club
- **My post:** yes — **Manage**
- **Join Requested:** no
- **New Admin:** no

### 2. A transfers admin to B and leaves
- `post.postOwnerId` = B  
- A in `leftMembers`, not in `members`
- **My post:** **no** (A no longer owns the club)
- **Join Requested:** no (until A requests again)
- **New Admin:** yes for B — **Manage**
- **Messages:** A may still see thread read-only (“Left group”)

### 3. A sends rejoin request
- `ClubRequest.status` = `pending`
- **My post:** **no**
- **Join Requested:** yes — **Request Pending**
- **Messages:** same group, left / read-only
- B sees request in **Manage requests**

### 4. B accepts rejoin
- A added to `group.members`, `markUserRejoined` on `leftMembers`
- `ClubRequest.status` = `accepted`
- **Join Requested:** yes — **Joined** (green)
- **My post:** **no**
- **Messages:** active chat again (same `groupId`)

### 5. A leaves a second time (if allowed)
- Per [BACKEND_HANDOFF_REJOIN.md](./BACKEND_HANDOFF_REJOIN.md) — feed / second-chance rules apply

---

## Activity tabs (summary)

| Situation | My post | Join Requested | New Admin |
|-----------|---------|----------------|-----------|
| A still owner | ✓ Manage | — | — |
| A transferred away | **Never** | ✓ when member or pending | B only |
| B is admin (not creator) | — | — | ✓ Manage |

---

## Status pill rules (Join Requested)

Evaluated in order:

1. Viewer in `members` and `membershipStatus` not `left` → **Joined**
2. `requestStatus === 'accepted'` → **Joined**
3. `requestStatus === 'pending'` → **Request Pending**
4. Do **not** use stale `postStatus: "Pending"` after accept when user is active member

**Bug fixed:** User in `members` but still in `leftMembers` after rejoin was treated as “left” → showed Request Pending after accept. Backend now treats “left” only when **not** in `members`.

---

## What we do not show on cards

- No **“You created this club”** on activity cards (ownership stays in DB only).
- No **Manage** on Join Requested for ex-creator.

---

## APIs

| Screen | API |
|--------|-----|
| My post | `GET getUserPosts?role=created` — excludes all `userId === viewer && postOwnerId !== viewer` |
| Join Requested | `GET getUserPosts?role=joined` — includes ex-creator when member or pending |
| Messages | `POST myGroups` |

After accept, reopen **Join Requested** (screen refocus) to refresh pills.

---

## Related docs

- [BACKEND_HANDOFF_CREATOR_REJOIN_EDGE_CASE.md](./BACKEND_HANDOFF_CREATOR_REJOIN_EDGE_CASE.md)
- [BACKEND_HANDOFF_JOIN_REQUESTED_REJOIN.md](./BACKEND_HANDOFF_JOIN_REQUESTED_REJOIN.md)
