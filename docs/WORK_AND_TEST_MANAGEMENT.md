# DocSys Work and Test Management

## Product direction

DocSys treats delivery work, defects, controlled documents, requirements, test definitions and test evidence as one traceable engineering system. The goal is not to reproduce every Jira screen. The goal is to retain the valuable Jira concepts while removing the integration gap between an issue tracker and a requirements/test tool.

The core chain is:

`requirement -> test definition -> test plan -> execution -> defect -> corrective work -> verification execution`

Every link in this chain must be queryable in both directions, permission checked on the server and represented in the audit trail.

## Phase 1: shared work model

Phase 1 introduces:

- project-scoped work items with stable keys;
- Epic, Story, Task, Defect and Risk types;
- Backlog, Ready, In progress, In review, Done and Canceled states;
- priorities, assignee, reporter, labels, due dates and parent hierarchy;
- list and Kanban views with search and quick filters;
- links between work items;
- links from work items to documents, document rows and real test executions;
- comments, mentions, assignment notifications and audit events;
- optimistic concurrency and soft deletion;
- test plans that group test headings and start real executions in a defined environment/build.

## Phase 2: planning and execution depth

Delivered vertical slice:

- work-item detail editing with optimistic version checks, assignment, labels, comments, mentions, artifact navigation and related-work visibility;
- assignment pickers backed by active organization membership rather than administrator-only user discovery;
- searchable test-scenario candidates resolved from real test-step hierarchy, plan membership editing and direct planned-execution start;
- soft-deleted plan membership with history-preserving removal rules;
- exact links from internal Defect work items to the failed `TestStepExecution`, with compact execution evidence referencing the created work key;
- server-side workspace/project/row authorization and same-transaction audit for every new mutation.

Remaining Phase 2 scope:

- configurable workflows and transition rules by work-item type;
- backlog ranking, drag-and-drop board movement, swimlanes and WIP limits;
- iterations, milestones, releases and fix versions;
- test-plan item selection from saved test queries;
- configuration, product variant, environment and data-set matrices;
- execution progress, reruns, evidence and linked internal defects in one view;
- defect creation directly from a failed test step with evidence copied by reference;
- coverage and readiness widgets spanning requirements, plans, runs and defects.

## Phase 3: Jira-grade productivity

- saved personal/team work queries and a structured query builder;
- bulk edit, assignment, transition, link and release operations;
- watchers, activity stream, SLA indicators and subscription notifications;
- configurable fields, screens, issue layouts and project templates;
- automation with trigger, condition and action rules;
- dashboards, cumulative flow, cycle time, burndown and release reports;
- inbound/outbound Jira and Azure DevOps synchronization with explicit conflict policy.

## Phase 4: governed engineering operations

- approval gates that combine baseline, review, coverage, execution and unresolved-defect policy;
- risk-based retest selection from baseline changes and affected links;
- immutable release evidence packages;
- cross-project portfolio roadmaps and dependency views;
- service accounts, webhook signing, rate limits and integration observability;
- retention, legal hold and regulated export policy for work-management data.

## Deliberate boundaries

- PostgreSQL remains the source of truth. Redis is never the authoritative store for work state.
- A defect is a first-class work item, not an unstructured string inside test evidence.
- Test executions remain the existing execution records; test plans reference them instead of duplicating results.
- Artifact links never bypass document or row access controls.
- Every mutation that changes controlled state writes its audit event in the same database transaction.
- Cross-organization links are forbidden.

## Jira concepts used as reference

The design follows the useful parts of Jira Cloud: configurable work types and workflows, linked work items, list/backlog/board views, saved searches, releases and automation. DocSys intentionally keeps requirements, test definitions and execution evidence native rather than relying on a separate test-management add-on.

Official references:

- https://support.atlassian.com/jira-cloud-administration/docs/configure-issues-to-track-individual-pieces-of-work/
- https://support.atlassian.com/jira-software-cloud/docs/link-issues/
- https://support.atlassian.com/jira-software-cloud/docs/enable-the-backlog/
- https://support.atlassian.com/jira-software-cloud/docs/use-advanced-search-with-jira-query-language-jql/
- https://support.atlassian.com/cloud-automation/docs/jira-automation-triggers/
