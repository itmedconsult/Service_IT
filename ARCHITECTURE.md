# Angular structure

```text
src/app/
├── core/                 # App-wide types and infrastructure
│   ├── models/           # Shared domain models
│   └── services/         # Singleton services, API clients, persistence
├── features/             # Business capabilities, isolated by feature
│   └── price-control/
│       ├── data/         # Temporary mock data; replace with API repository later
│       ├── domain/       # Pure business rules and their unit tests
│       └── price-control-page.component.*
├── app.component.ts      # Thin application shell only
└── app.routes.ts         # Route composition and lazy feature loading
```

## Conventions

- Put DoctorEase and Supabase clients in `core/services/`; do not expose API secrets to Angular.
- Keep pricing calculations as pure functions in `features/*/domain/` and add tests before changing the rules.
- Keep page-specific UI, templates, styles, and data access inside the owning `features/<feature>/` directory.
- Promote code to `shared/` only after it is genuinely used by two or more features.
- Add a route per feature and lazy-load it to keep the initial bundle small.
