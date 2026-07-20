# English Pixel Academy API Architecture

This document defines the backend organization standard for the English Pixel Academy API. The goal is to keep feature code easy to locate, debug, test, and extend as the application grows.

## Current Directory Tree

```text
pixel-english-quest-api/
  src/
    config/
      app-config.js              - Environment, CORS, rate limit, port, and database file config
      database.js                - Database bootstrap export used by the application
    shared/
      data-utils.js              - Reusable parsing, text cleaning, integer clamping, and date helpers
      http.js                    - HTTP error class, response helpers, CORS headers, and request body parsing
      routing.js                 - Reusable declarative route-table dispatcher for feature routes
      middleware/
        auth.middleware.js       - Bearer session lookup and role guards
        error.middleware.js      - Centralized operational error formatting and logging
      utils/
        appError.js              - Custom operational error class
        logger.js                - Request and error logging helpers
    auth/
      auth.routes.js             - Auth endpoint declarations
      auth.controller.js         - Auth request parsing and response orchestration
      auth.service.js            - Registration, login, logout, and profile workflows
      auth.repository.js         - Auth user/session data access helpers
      auth.session.js            - Session token creation and auth guard exports
      auth.validator.js          - Registration and login validation
    dashboard/
      dashboard.service.js       - Dashboard aggregation shared by student and teacher workflows
    student/
      student.routes.js          - Student endpoint declarations
      student.controller.js      - Student request parsing and response orchestration
      student.service.js         - Dashboard, profile, reset, quiz, and vocabulary workflows
      student.repository.js      - Student progress, quiz, vocabulary, and activity persistence
      student.validator.js       - Profile, quiz, and vocabulary validation
    lesson/
      lesson.routes.js           - Lesson endpoint declarations
      lesson.controller.js       - Lesson request parsing and response orchestration
      lesson.service.js          - Lesson serialization, ownership checks, validation, and attempt logic
      lesson.repository.js       - Checkpoint, study-note, speaking-attempt, and activity persistence
      lesson.seed.js             - Demo lesson and quick quiz seed content
      lesson.validator.js        - Checkpoint, notes, and transcript validation
    teacher/
      teacher.routes.js          - Teacher endpoint declarations
      teacher.controller.js      - Teacher request parsing and response orchestration
      teacher.service.js         - Course, module, lesson authoring, assignment, analytics, and announcement workflows
      teacher.repository.js      - Teacher-owned course, lesson, assignment, analytics, and announcement persistence
      teacher.validator.js       - Teacher payload validation and normalization
    routes/
      index.js                   - API route group dispatcher
    app.js                       - Application bootstrap, rate limiting, API mounting, and shared error handling
    server.js                    - Application entry point establishing the HTTP listener
  scripts/
    setup-supabase.js            - Optional Supabase/Postgres schema setup script
  supabase/
    schema.sql                   - Cloud database schema
  test/
    lms-workflows.test.js        - End-to-end API workflow tests
  .env                           - Local environment variables
  package.json                   - Node.js dependencies and scripts
  README.md                      - API setup, commands, route docs, and deployment notes
```

## Target Baseline Standard Directory Tree

Feature folders should own their route declarations, request orchestration, business logic, data access, and validation. Shared cross-cutting concerns should live under `shared`.

```text
English-pixel-academy-api/
  src/
    config/
      database.js                - Database and external client setup
    shared/
      middleware/
        error.middleware.js      - Centralized error catching and response formatting
        auth.middleware.js       - JWT/session verification and protected-route guard
      utils/
        logger.js                - System logging utility for server events and debugging
        appError.js              - Custom predictable operational error class
    auth/
      auth.routes.js             - Route declarations mapping auth endpoints to controllers
      auth.controller.js         - Request parsing, response orchestration, and status mapping
      auth.service.js            - Business workflows and access coordination
      auth.repository.js         - Isolated data access layer
      auth.validator.js          - Payload validation before processing
    app.js                       - Core application bootstrap and feature router mounting
    server.js                    - HTTP server listener
```

## Baseline Standard For New Features

Use this layout for each new feature once it has enough behavior to justify its own folder:

```text
src/
  config/
    database.js
  shared/
    middleware/
      error.middleware.js
      auth.middleware.js
    utils/
      logger.js
      appError.js
  feature-name/
    feature-name.routes.js
    feature-name.controller.js
    feature-name.service.js
    feature-name.repository.js
    feature-name.validator.js
  app.js
  server.js
```

## Layer Responsibilities

- `routes`: Declare URLs, HTTP methods, and route-specific middleware.
- `controller`: Read request data, call services, and shape HTTP responses with shared response helpers.
- `service`: Own business rules, workflow decisions, transactions, and cross-feature coordination.
- `repository`: Isolate database or external client reads and writes.
- `validator`: Validate request payload shape and field constraints before service logic runs.
- `shared/middleware`: House reusable request guards and global error handling.
- `shared/utils`: House framework-agnostic helpers such as logging and custom errors.
- `config`: Centralize environment-driven setup for databases, external clients, CORS, rate limits, and ports.

## Current-To-Baseline Mapping

The API uses Node's built-in HTTP server rather than Express, but the source now follows the same feature-layer idea:

- `src/auth`, `src/student`, `src/lesson`, and `src/teacher` implement the full `routes -> controller -> service -> repository -> validator` pattern.
- `src/routes/index.js` is only the API dispatcher that mounts feature route handlers.
- Feature route files use `src/shared/routing.js` so each feature declares endpoints without duplicating matching loops.
- `src/shared/middleware` contains request guards and centralized error response behavior.
- `src/shared/utils` contains operational errors and logging.
- `src/config/database.js` is the database bootstrap entry and owns SQLite schema creation, migrations, demo account setup, and low-level persistence helpers.
- `src/dashboard/dashboard.service.js` is a shared domain service because both student and teacher workflows return dashboard-shaped data.
- `src/lesson/lesson.seed.js` keeps demo lesson and quick quiz content beside the lesson feature instead of in a legacy module folder.

When a feature becomes harder to debug, split it further toward repository-specific data access and smaller service workflows instead of adding more logic to controllers.

## Future Enhancement For Large Features

If a feature grows large, split service logic by use case:

```text
feature-name/
  services/
    get-feature.service.js       - Fetching logic
    create-feature.service.js    - Creation and heavy validation logic
    update-feature.service.js    - Mutation logic
    delete-feature.service.js    - Teardown or soft-delete logic
  feature-name.routes.js
  feature-name.controller.js
  feature-name.repository.js
  feature-name.validator.js
```

This should be done when it reduces debugging time or clarifies ownership. Small features can stay in one service file.
