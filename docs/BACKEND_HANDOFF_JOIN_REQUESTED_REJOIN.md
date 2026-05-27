# Backend handoff: Join Requested + rejoin after leave (Messages ↔ Activity sync)

**Priority:** Production bug — user sees club in **Messages** but not on **Join Requested**.  
**Reported case:** Kaushal Verma account, **Mango** group, left then sent rejoin request; admin sees request; member sees chat only.

Mobile: **Join Requested** (`MyJoinedPost` → `GET /api/user/getUserPosts?role=joined`).  
Messages: `POST /api/user/myGroups`.

Related: [BACKEND_HANDOFF_JOIN_REQUESTED.md](./BACKEND_HANDOFF_JOIN_REQUESTED.md), [BACKEND_HANDOFF_REJOIN.md](./BACKEND_HANDOFF_REJOIN.md), [BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md](./BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md).

---

## Expected user flow (member who did **not** create the post)

| Step | Messages (`myGroups`) | Join Requested (`role=joined`) |
|------|------------------------|--------------------------------|
| Joined club | Group listed, active chat | Row with green **Joined** |
| Left club | Same group, **Left group**, read-only chat | Row removed OR red **Request Pending** only if still pending |
| Sent rejoin request | Still listed (same `groupId`), `membershipStatus: left` | Row with red **Request Pending** |
| Owner accepts | Active chat again | Green **Joined** (same thread, not new group) |

**Same `groupId` / thread** for leave → pending → accept. See [BACKEND_HANDOFF_REJOIN.md](./BACKEND_HANDOFF_REJOIN.md).

---

## Where the row appears (dedupe)

| Viewer relationship to post | Pending rejoin after leave |
|----------------------------|---------------------------|
| **Joined as member** (`post.userId !== viewer`) | **Join Requested** only |
| **Created the post** (`post.userId === viewer`) | **My post** only (not Join Requested) |
| **Current admin** (`postOwnerId === viewer`, did not create) | **New Admin** (Manage), not Join Requested |

If Kaushal **created** the Mango post, the app will **never** show it on Join Requested — check **My post** for **Request Pending**.

---

## Root causes fixed (deploy both repos)

### 1. `getUserPosts?role=joined` used `$geoNear` first

Posts without a valid `store_location.coordinates` index were **dropped** from the activity list while `myGroups` still returned the group.

**Fix (JJ_Backend):** `buildJoinedRoleAggregatePipeline()` — `$match` by post ids first, no leading `$geoNear`.  
File: `src/utils/activityPost.js`, `src/controllers/MyPostController.js`.

### 2. Stale `members` after leave

Viewer still in `group.members` while also in `leftMembers` → API set `requestStatus: accepted` / `isGroupMember: true`.

**Fix (JJ_Backend):** `isViewerLeft` in aggregation; `isGroupMember: false` when left; `requestStatus` from `ClubRequest` when left.  
File: `src/utils/activityPost.js` → `buildActivityPostRow()`.

### 3. App exited early on `"No posts found"`

Frontend cleared the list before merging chat fallback rows.

**Fix (JJ_Frontend):** `MyPost.tsx` — for `role=joined`, still run `mergeJoinRequestedFromChatGroups()` when API returns empty.

### 4. Chat fallback missing fields

**Fix (JJ_Backend):** `POST myGroups` returns `productId` + `requestStatus` (viewer’s `ClubRequest.status`).  
File: `src/controllers/GroupController.js`.

**Fix (JJ_Frontend):** Merge left groups with `requestStatus` not `accepted`/`declined`.  
File: `src/utils/mergeJoinRequestedPosts.ts`.

---

## Backend contract (must implement)

### `GET /api/user/getUserPosts?role=joined`

**Include post ids from:**

```text
union(
  Group.find({ members: viewerId }).productId,
  ClubRequest.find({ requester: viewerId, status: 'pending' }).postId
)
```

**Then match posts:**

```text
Post._id in ids
AND post.postOwnerId !== viewerId
(postOwnerId !== viewerId; do not exclude userId === viewer for ex-creator rejoin)
AND deletedAt null
(+ Active/Inactive clubStatus if query param set)
```

**Do not** use `$geoNear` as the first stage for `role=joined`.

**Per row (pending rejoin):**

| Field | Value |
|-------|--------|
| `requestStatus` | `"pending"` |
| `membershipStatus` | `"left"` |
| `isGroupMember` | `false` |
| `canManageRequests` | `false` |
| `postStatus` | `"Pending"` (optional legacy) |

**Per row (active member):**

| Field | Value |
|-------|--------|
| `requestStatus` | `"accepted"` or null |
| `membershipStatus` | `"active"` |
| `isGroupMember` | `true` |

### `POST /api/user/myGroups`

For each group row returned to the viewer:

| Field | Required | Notes |
|-------|----------|--------|
| `_id` | yes | Group id (chat thread) |
| `productId` | yes | Post `_id` for activity cards / merge |
| `membershipStatus` | yes | `'active'` \| `'left'` |
| `requestStatus` | yes | Viewer's `ClubRequest.status` for that `productId` |
| `productName` | yes | Maps to `itemName` on card |

---

## Frontend behaviour (JJ_Frontend)

1. Load `getUserPosts?role=joined` + `myGroups` in parallel.
2. Filter with `shouldIncludeOnJoinRequestedList()` (includes ex-creator after admin transfer).
3. Merge missing **left + pending** rows from `myGroups` (`mergeJoinRequestedFromChatGroups`).
4. Pill: `resolveJoinedMembershipStatus()` → **Request Pending** when `requestStatus === 'pending'` or `membershipStatus === 'left'` + pending.

---

## QA script (Mango / Kaushal case)

Use **two accounts**: A = post owner, B = Kaushal (member, **did not create** post).

1. B joins Mango → accepts → B sees Mango on Join Requested (**Joined**).
2. B leaves → B still sees Mango in **Messages** (left, read-only).
3. B taps **Request to rejoin** on post detail → `ClubRequest.status = pending`.
4. **B — Join Requested:** Mango card with **Request Pending** (same as admin sees pending in Manage requests).
5. **B — Messages:** Mango still listed (`membershipStatus: left`).
6. A accepts → B sees **Joined** on Join Requested and can send chat again (same group).

**API checks (account B token):**

```bash
# Replace TOKEN, LAT, LON
curl -s "http://localhost:8000/api/user/getUserPosts?role=joined&lat=LAT&lon=LON" \
  -H "Authorization: Bearer TOKEN" | jq '.posts[] | select(.itemName|test("Mango";"i")) | {itemName,requestStatus,membershipStatus,isGroupMember,userId,postOwnerId}'

curl -s -X POST "http://localhost:8000/api/user/myGroups" \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"page":1,"limit":50}' | jq '.groups[] | select(.productName|test("Mango";"i")) | {productId,productName,membershipStatus,requestStatus}'
```

Expected for step 3–4: `requestStatus: "pending"`, `membershipStatus: "left"`, `isGroupMember: false`.

If `getUserPosts` omits Mango but `myGroups` has `productId` + `requestStatus: pending`, frontend merge should still show the card after app reload.

If B **created** Mango: `getUserPosts?role=joined` correctly omits it; verify `role=created` (**My post**) shows **Request Pending**.

---

## Deploy checklist

- [ ] Pull latest `JJ_Backend` (`MyPostController`, `activityPost.js`, `GroupController.js`).
- [ ] `npm run dev` (or production deploy) **restart**.
- [ ] Pull latest `JJ_Frontend` (`MyPost.tsx`, `mergeJoinRequestedPosts.ts`).
- [ ] Reload app → Settings → **Join Requested** (screen refocus refetches).
- [ ] Run QA script above.

---

## Files

| Repo | File |
|------|------|
| JJ_Backend | `src/controllers/MyPostController.js` |
| JJ_Backend | `src/utils/activityPost.js` |
| JJ_Backend | `src/controllers/GroupController.js` |
| JJ_Frontend | `src/screens/MyPost.tsx` |
| JJ_Frontend | `src/utils/mergeJoinRequestedPosts.ts` |
| JJ_Frontend | `src/utils/normalizeActivityPost.ts` |

---

## Short message to paste for backend team

> **Join Requested vs Messages (rejoin after leave)**  
> After a member leaves and sends a **rejoin** request, they must see the post on **Join Requested** with `requestStatus: pending` (and still see the same group in **Messages** with `membershipStatus: left`).  
> Implement: `getUserPosts?role=joined` = union(active `members` + pending `ClubRequest`), exclude `post.userId === viewer`, **no `$geoNear` first** for joined role, set `isGroupMember: false` when viewer is in `leftMembers`, and return `requestStatus: pending`.  
> `POST myGroups` must include `productId` and viewer `requestStatus` per group.  
> If the viewer **created** the post, the row belongs on **My post**, not Join Requested.  
> Full spec: `JJ_Frontend/docs/BACKEND_HANDOFF_JOIN_REQUESTED_REJOIN.md` (copy to backend repo if needed).
