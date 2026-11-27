# ExamGuard UI prototype

A standalone, backend-free front-end prototype of the ExamGuard examination platform. It uses in-memory test data and is meant for exploring the interface and workflows. The production app lives in the repository root (Next.js + Prisma).

## Run
Open `prototype/index.html` in a browser. No install or build step.

## Demo roles
Pick a role on the sign-in screen (no password in the prototype).

| Role | Demo user | What to try |
|---|---|---|
| Candidate | Amina Tariq (FA23-BCS-0419) | Take an exam, scratchpad, offline mode, dispute, verify report |
| Examiner | Dr. Sana Malik | Create exam, sandbox, import questions, monitor, grade, analytics, disputes |
| Administrator | Admin Rauf | Change user roles |

Verification demo ID: `VR-7F3K-92QX`

## Coverage
- Core: role-based screens, exam lifecycle (draft, published, ongoing, completed), question bank, enrolment view, exam workspace, monitoring, grading, publishing, results.
- Secondary: network-aware interface, PDF report (print), sandbox, bulk import (JSON), question analytics, verifiable reports, customisable workspace, digital scratchpad.
- Innovation: failure-resilient attempts (offline autosave, timer never pauses), dispute resolution with recorded reasons, difficulty-balanced randomisation setting, integrity incident log that is advisory only.

## Structure
`css/` styles, `js/` one file per area (data, core, auth, candidate-dashboard, workspace, results, examiner, monitoring, admin, main).
