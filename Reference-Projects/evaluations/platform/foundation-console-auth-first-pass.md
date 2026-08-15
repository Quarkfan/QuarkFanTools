# Foundation, Console and Authentication References

## Scope

- Centers: Platform Contracts, Platform Console, all service foundations
- Fastify: `d693f43d890f07a8852b4737b048ed76458139a2`
- Better Auth: `58c49eb97f04ff18aa823318a3856a013353fdc2`
- shadcndashboard: `89ef0302b0b229aeefe24968a08eb0d509c05113`
- Existing UI reference: Open WebUI and QuarkfanTools-Single 2.3.2

## Source-Level Findings

- Fastify `lib/plugin-utils.js`, encapsulation/plugin docs, schema controller, hooks and error handler show a useful boundary: transport plugins decorate request context, domain services remain plain modules, route schemas drive validation and serialization.
- Better Auth packages separate core session/account storage from optional `admin` and `username` plugins. This fits an initial local account/password system without baking user management into every center.
- shadcndashboard provides useful examples for route layout, tables, forms, theme and authentication screens, but contains broad marketing/demo surfaces that do not belong in an operational control plane.
- Open WebUI demonstrates dense provider/model/knowledge management and role-gated administrative surfaces; its Python/Svelte product assumptions are not adopted.

## Adopt

- Fastify plugin encapsulation, request IDs, schema-first routes, centralized error serialization and injection-based tests.
- Better Auth email/password, username, session and admin concepts as a maintained dependency boundary.
- A restrained React/Vite operational console with a stable sidebar, tables, detail drawers/modals, explicit status and keyboard focus.
- Browser only talks to the BFF; internal center credentials never reach browser JavaScript.

## Do Not Copy

- Do not import a dashboard template wholesale or retain placeholder pages/assets.
- Do not let authentication library tables become platform tenant/domain models.
- Do not expose each center directly and repeat login/session logic in every service.

## Recommendation

Use Fastify service templates and Better Auth in Platform Console. Keep platform RBAC/audit mapping in Governance and treat Better Auth as identity/session infrastructure.
