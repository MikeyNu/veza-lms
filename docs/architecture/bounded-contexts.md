# Bounded contexts

Delivery order follows trust and dependency boundaries.

1. Tenant and entitlements
2. Identity and access
3. Audit and compliance
4. Institution structure
5. People and relationships
6. Academic catalogue and curriculum
7. Delivery and enrolment
8. Content and Studio
9. Scheduling and attendance
10. Assessment and results
11. Progress and intervention
12. Communications
13. Integrations, analytics and credentials

Every context owns its commands, invariants, records and emitted events. Shared contracts describe messages; they do not become a shared domain model.
