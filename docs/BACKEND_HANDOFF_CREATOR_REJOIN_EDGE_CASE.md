# Edge case: Original creator transferred admin, left, and re-requested to join

## Scenario

1. User **A** creates a post / club (`post.userId = A`, `post.postOwnerId = A`).
2. Others join.
3. **A** transfers admin to **B** (`post.postOwnerId = B`, `group.adminId = B`). **A** is no longer admin/owner.
4. **A** leaves the group (`membershipStatus: left`).
5. **A** sends a **rejoin** request (`requestStatus: pending`).
6. **B** (new admin) can accept from **New Admin** / Manage requests.

## Product rule: one primary activity tab per post

| User relationship | Activity screen | Card footer | Notes |
|-------------------|-----------------|-------------|--------|
| Creator **and** current owner (`userId` & `postOwnerId` = me) | **My post** | **Manage** | Full owner tools |
| Current admin, not original creator | **New Admin** | **Manage** | Transferred ownership |
| Joiner (not creator), member or pending | **Join Requested** | **Joined** / **Request Pending** | |
| Creator, transferred away (any state) | **Never** | **Request Pending** / **Joined** when applicable | A is not owner |

### Why only **Join Requested** after transfer

- After admin transfer, **B** owns the club (`postOwnerId = B`). **A** is not the owner anymore.
- **A** rejoins like any other member; **B** accepts in Manage requests.
- **My post** is only for posts you **still own** (`postOwnerId === A`).
- Do **not** show “You created this club” on cards — `userId` / `postOwnerId` remain in data only.

See [USER_FLOW_EX_CREATOR_REJOIN.md](./USER_FLOW_EX_CREATOR_REJOIN.md).

## API rules (`getUserPosts`)

### `role=created` (My post)

Return posts where `userId === viewer`, then **exclude** rows where:

- `postOwnerId !== viewer` (ex-creator), **and**
- viewer has `requestStatus: pending` **or** `isGroupMember: true` / `membershipStatus: active`

**Exclude all** ex-creator rows (`postOwnerId !== viewer` while `userId === viewer`).

### `role=joined` (Join Requested)

Return posts where viewer is in `members` **or** has `pending` `ClubRequest`, **and** `postOwnerId !== viewer`.

**Do not** exclude `userId === viewer` — **include** ex-creator (`userId === viewer`, `postOwnerId !== viewer`, pending or member).

### `role=transferred` (New Admin)

Unchanged: `postOwnerId === viewer` && `userId !== viewer`.

## Post detail (SingleItemScreen)

- Ex-creator with `membershipStatus: left` + `requestStatus: pending` → **Cancel rejoin request** (no T&C block).
- No owner **Manage** unless `postOwnerId === viewer`.

## QA matrix

| A = creator, transferred to B, left, pending rejoin | My post | Join Requested | New Admin |
|-----------------------------------------------------|---------|----------------|-----------|
| A | **No** | **Yes** (Request Pending → Joined after accept) | No |
| B | No | No | **Yes** (Manage) |

| A = creator, still owner | **My post** (Manage) | No | No |

| A = creator, transferred, left, no request | **No** | No | No |

## Frontend (implemented)

- `shouldIncludeOnMyPostList()` — excludes ex-creator pending/member
- `shouldIncludeOnJoinRequestedList()` — includes ex-creator pending/member
- `ActivityPostCard` — join pill only (no creator hint on card)

## Backend (implemented)

- `MyPostController` — `role=joined` match: no `userId !== viewer`
- `filterActivityPostsByRole()` — `role=created` excludes ex-creator pending/member

Related: [BACKEND_HANDOFF_JOIN_REQUESTED_REJOIN.md](./BACKEND_HANDOFF_JOIN_REQUESTED_REJOIN.md), [BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md](./BACKEND_MESSAGE_ACTIVITY_LIST_RULES.md)
