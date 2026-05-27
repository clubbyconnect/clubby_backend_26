# Backend handoff — Join Requested screen

**Endpoint:** `GET /api/user/getUserPosts?role=joined&lat=…&lon=…`  
**Related:** [BACKEND_HANDOFF_ACTIVITY_SCREENS.md](./BACKEND_HANDOFF_ACTIVITY_SCREENS.md) (shared card fields, other tabs).  
**Rejoin after leave (Messages shows group, Join Requested empty):** [BACKEND_HANDOFF_JOIN_REQUESTED_REJOIN.md](./BACKEND_HANDOFF_JOIN_REQUESTED_REJOIN.md).

Deploy latest `JJ_Backend` and **restart** the API before QA.

---

## Screen purpose

The **Join Requested** tab shows clubs the viewer asked to join (not posts they created or received via admin transfer).

| UI state | Meaning |
|----------|---------|
| **Green — Joined** | Request accepted; user is in `group.members` |
| **Red — Request Pending** | `ClubRequest.status === "pending"`; not in `members` yet |

---

## Gap (must fix on server)

**Wrong:** `role=joined` only returns posts where the user is in `group.members`.

**Correct:** Union of:

1. Posts linked to groups where `members` contains the viewer
2. Posts where the viewer has a **`ClubRequest` with `status: "pending"`**

Implementation: `resolveJoinedAndPendingProductIds()` in `src/controllers/MyPostController.js`.

Without (2), pending clubs never appear and everything looks green “Joined” or the list is empty.

---

## Query rules

| Tab | `role` | Include | Exclude |
|-----|--------|---------|---------|
| **My post** | `created` | `userId ===` viewer | — |
| **Join Requested** | `joined` | Member **or** pending request | `postOwnerId !==` viewer **and** `userId !==` viewer — [rules](./BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md) |
| **New Admin** | `transferred` | `postOwnerId ===` viewer, `userId !==` viewer | — |

Optional `status=Active` / `Inactive` uses the same `clubStatus` mapping as other activity tabs.

Sort: **`createdAt` descending** (newest first).

Empty: **HTTP 200** `{ success: true, posts: [] }` — not 404.

---

## Response contract (each row)

| Field | Join Requested |
|-------|----------------|
| `requestStatus` | `"accepted"` \| `"pending"` \| `null` (declined / none) |
| `isGroupMember` | `true` if viewer ∈ `groupInfo.members` |
| `groupInfo.members` | Populated member list (for count / display) |
| `canManageRequests` | **`false`** (viewer is not post owner on this tab) |
| `pendingRequestCount` | Owner’s inbound pending count (usually 0 relevance here) |
| `postStatus` | `"I Joined"` (green) \| `"Pending"` (red) |
| `createdAt` | Post created date |
| `price`, `distance`, `location` | Card layout |
| `memberCount`, `clubMembers`, `spotsOpen`, `isFull`, `memberCapacityLabel` | Capacity UI |
| `clubStatus` / `status` | Active / Inactive chip |
| `groupId`, `groupInfo` | Navigate to product / chat |

**Rule:** If `isGroupMember === true` → force `requestStatus: "accepted"` even if a stale `ClubRequest` row exists.

---

## JSON examples

### Request Pending (red)

```json
{
  "_id": "65a1…",
  "itemName": "Nike Air Max",
  "postStatus": "Pending",
  "requestStatus": "pending",
  "isGroupMember": false,
  "canManageRequests": false,
  "memberCount": 3,
  "clubMembers": 5,
  "spotsOpen": 2,
  "isFull": false,
  "memberCapacityLabel": "3/5",
  "createdAt": "2026-03-20T10:00:00.000Z",
  "price": 799,
  "distance": 2.4,
  "location": "MG Road, Bangalore",
  "groupId": "65b2…",
  "groupInfo": { "_id": "65b2…", "members": ["…", "…", "…"] }
}
```

### Joined (green)

```json
{
  "_id": "65c3…",
  "itemName": "Adidas Jacket",
  "postStatus": "I Joined",
  "requestStatus": "accepted",
  "isGroupMember": true,
  "canManageRequests": false,
  "memberCount": 4,
  "clubMembers": 5,
  "spotsOpen": 1,
  "isFull": false,
  "memberCapacityLabel": "4/5",
  "createdAt": "2026-03-18T08:30:00.000Z",
  "price": 1299,
  "distance": 5.1,
  "location": "Koramangala",
  "groupId": "65d4…",
  "groupInfo": { "_id": "65d4…", "members": ["viewerId", "…"] }
}
```

---

## Client logic (reference)

```typescript
function resolveJoinedMembershipStatus(post: ActivityPostRow) {
  if (post.isGroupMember || post.requestStatus === "accepted") {
    return { label: "Joined", tone: "green" };
  }
  if (post.requestStatus === "pending") {
    return { label: "Request Pending", tone: "red" };
  }
  return { label: "Unknown", tone: "muted" };
}
```

Do **not** show Manage requests on this tab (`canManageRequests` should be false).

---

## Refresh behaviour

- **No WebSockets** for this list.
- App reloads on screen **focus** (pull / navigate back).
- After owner accepts, user returns to tab → `role=joined` should show green Joined once `members` includes them.

---

## QA checklist

- [ ] Send join request → appears on Join Requested as **red** Request Pending
- [ ] Owner accepts → refocus tab → **green** Joined, `isGroupMember: true`
- [ ] Own created posts do **not** appear under `role=joined`
- [ ] `canManageRequests` is never true on this tab
- [ ] `createdAt` order newest first
- [ ] Active / Inactive filter works
- [ ] Empty state returns 200 with `posts: []`

---

## Deploy steps

1. Deploy branch containing:
   - `src/controllers/MyPostController.js` (`resolveJoinedAndPendingProductIds`)
   - `src/utils/activityPost.js` (`requestStatus`, `isGroupMember`, enrichment)
2. Restart API (`npm run dev` or production process)
3. Point app `USE_LOCAL_BACKEND` / base URL at that server
4. Device + local API: `adb reverse tcp:8000 tcp:8000` (see [BACKEND_HANDOFF_REJOIN.md](./BACKEND_HANDOFF_REJOIN.md))

---

## Implementation files

| File | Role |
|------|------|
| `src/controllers/MyPostController.js` | `role=joined` query union |
| `src/utils/activityPost.js` | Shared aggregation + `buildActivityPostRow` |
| `src/routes/UserRoute.js` | `GET /getUserPosts` |
