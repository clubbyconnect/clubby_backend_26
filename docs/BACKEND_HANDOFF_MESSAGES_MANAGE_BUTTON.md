# Backend: Messages tab — Manage button (`POST myGroups`)

**Date:** 2026-06-02  
**Frontend spec:** `docs/BACKEND_HANDOFF_MESSAGES_MANAGE_BUTTON.md` in **JJ_Frontend**  
**Status:** Implemented in `GroupController.getGroupsForUser`

---

## Product rule

Show **Manage requests** on Messages list rows when the viewer is **post owner** (`post.postOwnerId`) or **group admin** (`group.adminId`). Tap opens `PostRequestScreen` via `GET /api/user/club/:productId` — not the chat thread.

**Hide Manage when:**

- `membershipStatus === 'left'`
- Post/club cannot accept requests (wrapped, inactive, admin-deactivated, expired, deleted, or group deactivated)

Manage is **not** on chat header or Group info (frontend only).

---

## `POST /api/user/myGroups`

Each group object includes:

| Field | Type | Rule |
|-------|------|------|
| `productId` | string | Post `_id` |
| `membershipStatus` | `'active'` \| `'left'` | Existing |
| `clubStatus`, `expiryAt`, `deletedAt`, `lastMessage` | — | Existing |
| `adminId` | string | `group.adminId` |
| `postOwnerId` | string | `post.postOwnerId` |
| `isPostOwner` | boolean | `postOwnerId === viewerId` |
| `canManageRequests` | boolean | `(isPostOwner \|\| adminId === viewerId)` and club accepts join requests |
| `pendingRequestCount` | number | Pending `ClubRequest` count for `productId` |
| `hasPendingRequests` | boolean | `pendingRequestCount > 0` |

When `membershipStatus === 'left'`, `canManageRequests` is forced `false` and counts are `0`.

### `canManageRequests` accepts-requests check

Same as `club-requests-for-post` / `GET club/:productId` `postSummary.canAcceptMore`:

- Not deleted (`deletedAt` null)
- Not admin-deactivated (`deactivatedByAdminId` null)
- `clubStatus` not `Inactive`, `Wrap`, or `WrapDeal`
- `group.isActive !== false`
- Not expired (`expiryAt` null or in future)
- Viewer is active member (not left)

---

## Manage screen APIs (unchanged)

| Action | Route |
|--------|-------|
| Load requests + summary | `GET /api/user/club/:productId` |
| Accept / decline | `POST /api/user/club-request/action` |
| Legacy pending count fallback | `GET /api/user/club-requests-for-post/:productId` (alias of `club/:productId`) |

Authorization on manage endpoints: **post owner or group admin** (`canManageClubRequests` in `src/utils/postVisibility.js`).

---

## Implementation

- **List enrichment:** `src/controllers/GroupController.js` — aggregation `$lookup` on `clubrequests` for pending count; `$addFields` for manage flags.
- **Auth helper:** `src/utils/postVisibility.js` — `canManageClubRequests`, `postAcceptsJoinRequests`.
- **Manage APIs:** `src/controllers/ClubRequestController.js` — `list`, `handleClubRequest`.

---

## QA checklist

- [ ] Creator still admin → `canManageRequests: true`, Manage opens pending requests
- [ ] Transferred admin (`postOwnerId === viewer`, `userId !== viewer`) → Manage on Messages row
- [ ] Plain member → `canManageRequests: false`
- [ ] Left group → `canManageRequests: false`, `pendingRequestCount: 0`
- [ ] Wrapped / inactive / deactivated → `canManageRequests: false`; accept rejected on action API
- [ ] `pendingRequestCount` matches DB; badge hidden when 0
- [ ] Messages list loads without per-row `getAdminUser` / `getGroupDetails` / `club-requests-for-post` when myGroups fields present
