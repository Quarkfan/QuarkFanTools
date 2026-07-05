# Message Gateway Reference Evaluation: Mattermost, Slack, and GitHub Second Pass

## Scope

- Center: Message Gateway
- Capability: channel/thread/post modeling, reaction records, webhook envelope verification, delivery attempt observability, and redelivery semantics
- Mattermost commit: `ce23427d98`
- Slack API Specs commit: `bc08db4`
- GitHub REST API Description commit: `a70b6c5b8`
- Inspected Mattermost paths:
  - `server/public/model/channel.go`
  - `server/public/model/channel_member.go`
  - `server/public/model/post.go`
  - `server/public/model/thread.go`
  - `server/public/model/reaction.go`
  - `api/v4/source/webhooks.yaml`
  - `api/v4/source/definitions.yaml`
- Inspected Slack paths:
  - `events-api/slack_common_event_wrapper_schema.json`
  - `events-api/slack_events_api_async_v1.json`
  - `web-api/slack_web_openapi_v2.json`
- Inspected GitHub paths:
  - `descriptions-next/api.github.com/dereferenced/api.github.com.2026-03-10.deref.yaml`

## Useful Models

### Mattermost

Mattermost separates `Channel`, `Post`, `Thread`, `ThreadMembership`, `ChannelMember`, and `Reaction`. This confirms that MG should not collapse all group-chat semantics into `conversationId + text`.

Useful ideas:

- `Post.RootId` makes thread relationship explicit. MG should preserve `threadId`, `parentMessageId`, and root message IDs when the source platform provides them.
- `Thread` is metadata about a root post and replies. MG should treat thread metadata as conversation/thread state, not as message content.
- `ThreadMembership` and `ChannelMember` track per-user read position, mention counts, notification settings, and following state. MG should not own these as product behavior, but it may expose channel facts required by downstream subscription or recovery logic.
- `Reaction` includes `PostId`, `UserId`, `EmojiName`, `RemoteId`, and `ChannelId`. MG reaction records should preserve channel context and external reaction IDs where the platform provides them.
- Incoming and outgoing webhook models separate destination channel, ownership, trigger words, callback URLs, content type, token regeneration, and permissions. MG should model Webhook channels as first-class ChannelAccount/ChannelInstance variants rather than treating them as generic HTTP callbacks.

### Slack

Slack Events API uses a standard event wrapper with `team_id`, `api_app_id`, `event`, `type`, `event_id`, `event_time`, and `authed_users`.

This is especially useful for MG because `api_app_id` and `authed_users` are explicit routing and visibility facts. The same Request URL can receive events for multiple apps, and the wrapper says which app and which installed users can see the event. MG needs equivalent fields in `WebhookEnvelope` / `InboundEnvelope` so multi-account routing never relies only on payload body shape.

Slack also has `url_verification`, which reinforces that webhook channels need lifecycle states for verification/probe, not only `connected` or `failed`.

### GitHub

GitHub webhook delivery APIs expose delivery records and redelivery as first-class management concepts. The delivery record contains delivery ID, GUID, delivered time, redelivery boolean, duration, status, status code, event, action, installation/repository IDs, request headers and payload, response headers and payload, and a redelivery endpoint.

This maps directly to MG's `DeliveryRecord`, but MG should split a logical `DeliveryRecord` from individual `DeliveryAttempt` records. GitHub's `guid` also shows why idempotency should be based on an external event/delivery ID when available, not only content hash.

The examples also show delivery/event/signature/hook target headers. MG should model webhook verification headers and delivery IDs generically, while each Channel Adapter owns provider-specific verification.

## MG Design Changes Suggested

1. Add `WebhookEnvelope` as a standard pre-normalization wrapper for HTTP/Webhook channels.
2. Track webhook verification lifecycle separately from runtime connection status.
3. Add `DeliveryAttempt` under `DeliveryRecord`.
4. Preserve `externalDeliveryId`, `externalEventId`, `eventType`, `eventAction`, `redelivery`, `durationMs`, `requestRef`, and `responseRef`.
5. Extend reaction records with channel, account, target message, sender, external reaction ID, and remove/update lifecycle.
6. Keep thread/read/mention membership facts out of `HubMessage` content and represent them as optional channel facts or metadata.
7. Add capability declarations for `supportsThreads`, `supportsReactions`, `supportsWebhookVerification`, `supportsDeliveryListing`, and `supportsRedelivery`.

## Borrow Carefully

Do not copy from Mattermost:

- complete team/channel permission model;
- unread count product behavior;
- notification preference semantics;
- collaboration UI assumptions.

Do not copy from Slack:

- Slack token/scopes as a generic auth model;
- workspace-app product assumptions;
- Events API wrapper fields as universal required fields.

Do not copy from GitHub:

- GitHub App/JWT-specific authentication;
- repository/installation domain objects;
- all webhook delivery APIs as mandatory MG features.

## Recommendation

MG should treat webhook/event sources as first-class Channel Adapter implementations, not as a side path. Delivery observability should be split into logical delivery and attempts before implementation starts; otherwise retry, redelivery, and diagnostic bundles will become hard to reason about.

Confidence: high for `WebhookEnvelope`, high for `DeliveryAttempt`, high for reaction lifecycle fields, medium for delivery listing/redelivery capability in phase one.

Open questions:

- Should MG expose manual `redeliver(deliveryId)` in phase one? My recommendation is yes for MG-internal failed deliveries, and later for provider-native redelivery when a channel supports it.
- Should webhook request/response bodies be persisted in Message Store? My recommendation is no raw body by default; store `rawRef`, redacted summaries, headers allowlist, and response status.
- Should channel membership/read-position facts be modeled now? My recommendation is only as optional channel facts; product-level unread behavior belongs outside MG.
