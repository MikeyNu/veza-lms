# Contributing

## Branches and commits

Use focused branches and conventional commits. A change is not complete until its tests, accessibility impact, tenant-isolation impact and documentation have been considered.

## Required checks

- formatting
- lint
- strict type checking
- unit and contract tests
- production build
- keyboard and responsive UI review for changed product surfaces

## Architectural boundaries

Applications may depend on packages. Domain packages must not import applications. Backend bounded contexts may communicate through published interfaces or domain events, never another context's repositories.
