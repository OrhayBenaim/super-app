# Grocer

A shopping list app for Israel that compares what a list costs at nearby supermarkets.

## Language

### Lists and people

**User**:
A person with a Grocer account.
_Avoid_: Customer, account holder

**List**:
A named shopping list of items. Every List has exactly one Owner.
_Avoid_: Shopping cart, basket

**Owner**:
The User who created a List. Only the Owner can rename it or remove Members, and the Owner cannot leave it.
_Avoid_: Admin, creator

**Member**:
A User other than the Owner who joined a List through its invite code.
_Avoid_: Collaborator, guest

**Shared list**:
A List that has at least one Member besides its Owner.
_Avoid_: Group list, joint list

### Account lifecycle

**Account deletion**:
The permanent, immediate removal of a User and everything they own: the Lists they own (for every Member, too) and their membership in other people's Lists. There is no undo and no grace period.
_Avoid_: Deactivation, closing the account

**Password reset**:
A User who signs in with email and password proves they own that email with a Reset code, then sets a new password and is signed in. Users who only sign in with Google or Apple have no password and cannot reset one.
_Avoid_: Password recovery, forgot password (except as the link text)

**Reset code**:
A 6-digit code emailed to the User for a Password reset. It is valid for 5 minutes and dies after 3 wrong tries.
_Avoid_: OTP, PIN, token
