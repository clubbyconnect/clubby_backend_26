# Backend handoff — Activity screens (My Post, Join Requested, New Admin, Liked)

Deploy latest `JJ_Backend` and restart (`npm run dev` / redeploy).

**Activity list rules (share with backend agent):** [BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md](./BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md)  
**Creator transfer + rejoin:** [BACKEND_HANDOFF_CREATOR_REJOIN_EDGE_CASE.md](./BACKEND_HANDOFF_CREATOR_REJOIN_EDGE_CASE.md)  
**Join Requested (detailed):** [BACKEND_HANDOFF_JOIN_REQUESTED.md](./BACKEND_HANDOFF_JOIN_REQUESTED.md)

Until deploy, the app dedupes with `shouldIncludeOnMyPostList` / `shouldIncludeOnJoinRequestedList` on the client.

---

## `GET /api/user/getUserPosts`

Query: `lat`, `lon`, `role`, optional `status`, `page`, `limit`

### Roles

| `role` | Tab | Posts returned |
|--------|-----|----------------|
| `created` | **My post** | `userId ===` logged-in user (posts you created) |
| `joined` | **Join Requested** | Member **or** pending request; **exclude** `userId ===` you and `postOwnerId ===` you — [rules](./BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md) |
| `transferred` | **New Admin** | `postOwnerId ===` you and `userId !==` you |

### Status filter (optional)

| `status` | `clubStatus` match |
|----------|-------------------|
| `Active` | `Active`, `Created` |
| `Inactive` | `Inactive`, `WrapDeal`, `Wrap` |
| *(omit)* | All statuses |

Sorted **newest first** (`createdAt` desc).

Empty list → **200** `{ success: true, posts: [] }` (not 404).

---

## Join Requested (`role=joined`)

Full contract, examples, and QA: **[BACKEND_HANDOFF_JOIN_REQUESTED.md](./BACKEND_HANDOFF_JOIN_REQUESTED.md)**

Summary per post:

| Field | Values |
|-------|--------|
| `requestStatus` | `"accepted"` (in group) · `"pending"` (waiting) · `null` |
| `isGroupMember` | `true` / `false` |
| `postStatus` | `"I Joined"` (green) · `"Pending"` (red) |
| `canManageRequests` | **`false`** on this tab |

---

## New Admin (`role=transferred`)

Posts where you became owner after admin transfer (`postOwnerId ===` viewer, original `userId !==` viewer).

| Field | Expected |
|-------|----------|
| `canManageRequests` | **`true`** (you are `postOwnerId` / new admin) |
| `isPostOwner` | **`true`** |
| `pendingRequestCount` | Inbound pending join requests for that post |
| `hasPendingRequests` | `true` when `pendingRequestCount > 0` |
| `postStatus` | `"Admin Transferred"` |

Same **Manage** button + red pending badge as **My post**. Client may also force `canManageRequests` from `postOwnerId` if the API omits the flag; backend must send `true` for transferred owners.

**Example row:**

```json
{
  "itemName": "Vintage Jacket",
  "postStatus": "Admin Transferred",
  "canManageRequests": true,
  "isPostOwner": true,
  "pendingRequestCount": 2,
  "hasPendingRequests": true,
  "requestStatus": null
}
```

---

## My post (`role=created`)

| Field | Expected |
|-------|----------|
| `canManageRequests` | **`true`** |
| `isPostOwner` | **`true`** |
| `pendingRequestCount` / `hasPendingRequests` | Manage badge |

---

## Card fields (all roles + favourites)

| Field | UI |
|-------|-----|
| `createdAt` | Sort / date |
| `price`, `price_type` | ₹ price |
| `distance` | km badge |
| `location` / `store_location` | Location row |
| `memberCount`, `clubMembers`, `spotsOpen`, `isFull`, `memberCapacityLabel` | Members + Full / N left |
| `clubStatus` / `status` | Active / Inactive chip |
| `canManageRequests`, `pendingRequestCount`, `hasPendingRequests` | Manage + red badge (My post / New Admin) |
| `groupInfo`, `groupId` | Navigation |
| `requestStatus`, `isGroupMember`, `membershipStatus` | Join Requested state |
| `userId`, `postOwnerId` | List dedupe (My post vs Join Requested) |

---

## No duplicate posts (QA)

Same `post._id` must **not** appear on **My post** and **Join Requested**. Backend enforces `userId !== viewer` on `role=joined`. See [message doc](./BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md#qa-checklist).

---

## `GET /api/user/getFilteredFavoriteProducts`

Same card fields as `getUserPosts`. **`status` is optional** (no longer required).

---

## QA checklist

- [ ] **My post** (`role=created`) — Manage when owner; badge when `pendingRequestCount > 0`
- [ ] **Join Requested** (`role=joined`) — [full checklist](./BACKEND_HANDOFF_JOIN_REQUESTED.md#qa-checklist)
- [ ] **New Admin** (`role=transferred`) — `canManageRequests: true`, Manage + pending badge same as My post
- [ ] **Liked Posts** — price, distance, members, Full chip, sort order
- [ ] **Manage** → `GET /api/user/club/:productId` loads requests

---

## Production

1. Deploy branch with `MyPostController.js`, `FavouriteController.js`, `activityPost.js`
2. Restart API
3. App base URL → that server
4. Local device: `adb reverse` if using local backend (see [BACKEND_HANDOFF_REJOIN.md](./BACKEND_HANDOFF_REJOIN.md))
