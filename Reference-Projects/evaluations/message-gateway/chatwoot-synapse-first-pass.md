# Message Gateway Reference Evaluation: Chatwoot and Synapse First Pass

## Scope

- Center: Message Gateway
- Capability: channel account modeling, sender binding, conversation identity, message records, query, cursor, and event log semantics
- Chatwoot commit: `8818d27`
- Synapse commit: `be65a8e`
- Inspected Chatwoot paths:
  - `app/models/inbox.rb`
  - `app/models/conversation.rb`
  - `app/models/contact_inbox.rb`
  - `app/models/message.rb`
  - `app/models/concerns/channelable.rb`
  - `app/models/channel/api.rb`
  - `app/builders/contact_inbox_builder.rb`
  - `app/builders/contact_inbox_with_contact_builder.rb`
- Inspected Synapse paths:
  - `synapse/streams/config.py`
  - `synapse/streams/events.py`
  - `synapse/handlers/pagination.py`
  - `synapse/storage/databases/main/stream.py`
  - `synapse/types/__init__.py`

## Useful Models

### Chatwoot

Chatwoot separates a channel implementation from an inbox that owns user-visible routing and conversation state. `Inbox` belongs to a polymorphic channel and has many contacts, conversations, and messages. This maps well to MG's split between `Channel`, `ChannelAccount`, and `ChannelInstance`, but MG should not copy the support-inbox product semantics.

`ContactInbox` is the most useful model for MG. It binds a contact to one inbox through a platform `source_id` and enforces uniqueness on `inbox_id + source_id`. For MG, this suggests an explicit `SenderChannelBinding` between:

- normalized `senderId`;
- channel/account/instance scope;
- external source ID or platform sender ID;
- verification state;
- current display metadata;
- merge or conflict handling.

The builder code is also useful because it treats external identity as channel-dependent. Email, SMS, WhatsApp, API, and web widget channels all generate or validate source IDs differently. MG should copy that idea, not the exact implementation: every Channel Adapter needs a target/sender identity strategy instead of assuming one global `senderId` shape.

`Message` keeps both internal message IDs and external `source_id`, plus message type, content type, sender, conversation, inbox, and status. This reinforces the MG rule that `HubMessage.id`, platform `externalMessageId`, `conversationId`, sender, and delivery status should be separate fields, not overloaded into one ID.

### Synapse

Synapse's stream model is the strongest reference for MG cursor design. It separates:

- current token discovery;
- pagination config;
- live stream tokens;
- historical/topological tokens;
- multiple stream keys;
- direction and limits;
- stream-order versus historical-order traversal.

The important idea is not Matrix federation. The important idea is that a cursor is an opaque position between events, and query requests must specify direction, bounds, and limits. Synapse also caps pagination limits and treats tokens as parseable protocol values, not arbitrary client strings.

`StreamToken` combines multiple stream positions in one protocol token. MG probably does not need full multi-stream token complexity in phase one, but it should reserve room for composite cursors because a future MG Sink may expose inbound, outbound, reaction, delivery, and dead-letter streams under one consumer.

`stream.py` distinguishes insertion/received order from historical/topological order. MG can simplify this to `received` and `conversation` ordering, but it should not pretend that all history queries are equivalent to append-only event-log scans.

## MG Design Changes Suggested

1. Add `SenderChannelBinding` as a first-class concept.
2. Make `MessageCursor` explicitly opaque and scoped to `sinkId + consumerId`.
3. Add cursor ordering and direction semantics to `MessageQuery`.
4. Add `fromCursor`, `toCursor`, `direction`, and bounded `limit` instead of a single ambiguous `cursor`.
5. Add store-owned monotonic sequence fields to `HubMessage` or Sink Event records so cursor recovery does not depend on platform timestamps.
6. Treat `externalMessageId`, `externalConversationId`, and platform sender/source IDs as adapter facts, not primary MG identities.
7. Add an identity-conflict state for cases where the same channel source ID appears to map to multiple normalized senders.

## Borrow Carefully

Do not copy from Chatwoot:

- support inbox workflow;
- agent assignment;
- CRM/contact lifecycle;
- SLA/status semantics;
- user-facing unread logic.

Do not copy from Synapse:

- federation complexity;
- room state graph;
- full multi-writer vector clock in phase one;
- Matrix event auth and membership model.

## Recommendation

MG should immediately strengthen the design around sender binding and cursor/query semantics before implementation starts. These are cheap to document now and expensive to retrofit after adapters and history catch-up are built.

Confidence: high for `SenderChannelBinding`, high for bounded cursor query semantics, medium for composite cursor reservation.

Open questions:

- Should MG persist `SenderChannelBinding` in Message Store or Account Registry? My recommendation is Message Store owns observed bindings, while Account Registry owns configured identities and credentials.
- Should `Conversation` be first-class separate from `HubMessage`, or initially derived from message records? My recommendation is first-class, because multi-channel routing and history recovery will need stable conversation metadata.
- Should `MessageCursor` support vector-like multi-stream values in phase one? My recommendation is no, but keep `opaqueToken` and `ordering` extensible.
