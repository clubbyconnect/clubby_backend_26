# QA test report: Ex-creator rejoin (Join Requested / My post)

**Date:** 2026-05-25 (updated with backend sign-off)  
**Feature:** Transfer admin → leave → rejoin → accept (e.g. Mango / Kaushal Verma)  
**Repos:** `JJ_Frontend` + `JJ_Backend`  
**User flow doc:** [USER_FLOW_EX_CREATOR_REJOIN.md](./USER_FLOW_EX_CREATOR_REJOIN.md)

**Status:** Backend verified (script 5/5, matrix rows 3–5 PASS). Frontend unit tests 20/20 PASS. **Remaining:** product-owner manual 2-device Mango flow on devices.

---

## Message for backend agent (copy/paste)

> **QA sign-off request — ex-creator rejoin activity lists**  
>  
> Frontend and backend are aligned on this user journey. Please verify after pulling latest `JJ_Backend`:  
>  
> 1. **`GET getUserPosts?role=joined`** — Include posts where viewer has pending `ClubRequest` OR is in `group.members`, with **`postOwnerId !== viewer` only** (do **not** exclude `userId === viewer` for ex-creator rejoin). No leading `$geoNear` for joined role.  
> 2. **`GET getUserPosts?role=created`** — **`filterActivityPostsByRole`** excludes **all** rows where `userId === viewer && postOwnerId !== viewer` (ex-creator never on My post).  
> 3. **`isViewerLeft` in aggregation** — User in `members` is **not** treated as left (fixes Request Pending after accept when `leftMembers` row remains).  
> 4. **`buildActivityPostRow`** — Active member → `requestStatus: accepted`, `isGroupMember: true`.  
> 5. **`POST myGroups`** — Return `productId` + viewer `requestStatus` per group.  
>  
> **Do not** require UI copy “You created this club” — ownership stays in `userId` / `postOwnerId` only.  
>  
> Run: `node scripts/test-activity-post-filters.js`  
> Manual QA matrix below. Report any failing row with API JSON for that post.

---

## Automated tests run

| Suite | Command | Result |
|-------|---------|--------|
| Frontend unit | `npm run test:rejoin` | **20/20 PASS** |
| Backend unit | `node scripts/test-activity-post-filters.js` | **5/5 PASS** |

---

## Backend verification — matrix rows 3–5 (signed off)

| Row | Step | Result | Evidence |
|-----|------|--------|----------|
| 3 | A sends rejoin request | **PASS** | `role=joined` includes ex-creator (`postOwnerId !== A` only; `userId === A` allowed). Pending: `requestStatus: "pending"`, `isGroupMember: false`. `filterActivityPostsByRole` removes ex-creator from `role=created`. |
| 4 | B accepts rejoin | **PASS** | `isViewerLeft` false when A ∈ `members`. Returns `requestStatus: "accepted"`, `isGroupMember: true`, `membershipStatus: "active"` even if `leftMembers` still has A. |
| 5 | A refocus Join Requested | **PASS** | Same as row 4 — no revert to Pending when accepted + in members. `buildActivityPostRow` prefers aggregation `isGroupMember` / `isViewerLeft`. |

### Contract checks (backend)

| Check | Status |
|-------|--------|
| `role=joined` includes ex-creator pending/member | **PASS** (no `userId !== viewer` on joined query) |
| `role=created` never returns ex-creator | **PASS** (`filterActivityPostsByRole` / `shouldIncludeOnCreatedActivityRow`) |
| After accept: accepted + `isGroupMember` with stale `leftMembers` | **PASS** (`isViewerLeft` + row builder) |
| `POST myGroups` → `productId` + `requestStatus` | **PASS** (`GroupController.getGroupsForUser`) |
| No “You created this club” from API | **PASS** (ownership via `userId` / `postOwnerId` only) |

### Backend fix (aligned with frontend)

`buildActivityPostRow` treats aggregation `isGroupMember: true` as active even when `leftMembers` still has the user — matches frontend `isViewerActiveGroupMember`.

---

## Test matrix (manual + expected)

Use **two accounts**: **A** = original creator (ex-owner), **B** = new admin.

| # | Step | A: My post | A: Join Requested | A: Messages | B: New Admin |
|---|------|------------|-------------------|-------------|--------------|
| 1 | A creates club, still owner | ✓ Manage | — | Active chat | — |
| 2 | A transfers admin to B, A leaves | **No** | — | Left / read-only | ✓ Manage |
| 3 | A sends rejoin request | **No** | ✓ **Request Pending** | Left, same thread | Sees pending in Manage |
| 4 | B accepts rejoin | **No** | ✓ **Joined** (green) | Active chat | — |
| 5 | A opens Join Requested again (refocus) | **No** | Still **Joined** (not Pending) | — | — |
| 6 | Regular joiner C (never created post) pending | — | ✓ Request Pending | — | — |
| 7 | C accepted | — | ✓ Joined | Active | — |
| 8 | B views Join Requested | — | — (B is owner) | — | — |
| 9 | A cancels pending rejoin | **No** | No row (or removed) | Left | Pending gone |

---

## API contract checks (per step)

### Step 3 — A pending rejoin

`GET .../getUserPosts?role=joined` (token A):

```json
{
  "requestStatus": "pending",
  "membershipStatus": "left",
  "isGroupMember": false,
  "userId": "<A>",
  "postOwnerId": "<B>",
  "canManageRequests": false
}
```

`GET .../getUserPosts?role=created` (token A): **must not** include this `post._id`.

### Step 4 — B accepted

`GET .../getUserPosts?role=joined` (token A):

```json
{
  "requestStatus": "accepted",
  "membershipStatus": "active",
  "isGroupMember": true
}
```

`ClubRequest` for A+post: `status: "accepted"`.

### Step 4 — regression (was failing)

If A in `group.members` but `leftMembers` still has A:

- Must **not** return `requestStatus: pending` or pill Pending.
- `isViewerLeft` must be false when A ∈ `members`.

---

## Frontend-only checks

| Check | Expected |
|-------|----------|
| No “You created this club” on activity card | ✓ removed |
| Empty Join Requested hint mentions transferred clubs | ✓ |
| `mergeJoinRequestedFromChatGroups` when API empty but myGroups has left+pending | ✓ Mango appears |
| Early exit on `"No posts found"` skipped for joined role | ✓ |

---

## Edge cases

| Case | My post | Join Requested | Notes |
|------|---------|----------------|-------|
| Ex-creator, transferred, left, no request | No | No | Not in members, no pending |
| Ex-creator, pending | No | Yes | |
| Ex-creator, accepted | No | Yes (Joined) | |
| Creator still owner, pending own club | Yes | No | Rare; owner does not request join |
| Viewer is B (admin) | No | No | Use New Admin |
| Stale `postStatus: "Pending"` + `requestStatus: accepted` | No | Joined pill | Frontend prioritizes member/accepted |

---

## Files under test

| Repo | File |
|------|------|
| JJ_Frontend | `src/utils/normalizeActivityPost.ts` |
| JJ_Frontend | `src/utils/mergeJoinRequestedPosts.ts` |
| JJ_Frontend | `src/screens/MyPost.tsx` |
| JJ_Frontend | `src/componet/ActivityPostCard.tsx` |
| JJ_Backend | `src/utils/activityPost.js` |
| JJ_Backend | `src/controllers/MyPostController.js` |
| JJ_Backend | `src/controllers/GroupController.js` |
| JJ_Backend | `src/controllers/ClubRequestController.js` |

---

## Sign-off

| Layer | Status | Notes |
|-------|--------|-------|
| Frontend unit tests | **PASS** (20/20) | `npm run test:rejoin` |
| Backend script | **PASS** (5/5) | `node scripts/test-activity-post-filters.js` |
| Backend API contract (rows 3–5) | **PASS** | See table above |
| Manual 2-device QA | **Pending** | Mango flow on Kaushal + admin accounts |
| API deployed | Restart after pull | `npm run dev` in `JJ_Backend` |

Feature is **ready for product-owner device QA**. If manual Mango pass matches rows 3–5, treat ex-creator rejoin as **shipped**.
