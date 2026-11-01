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
