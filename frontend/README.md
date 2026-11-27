# ExamGuard — Web UI prototype

A dependency-free, role-based exam portal UI (Admin, Examiner, Candidate) with a dark/light blue theme.
Open `index.html` in a browser (or serve the folder with any static server). No build step.

## Test credentials (password `demo1234`)

| Role | Email |
| --- | --- |
| Candidate | amina@examguard.test |
| Examiner | examiner@examguard.test |
| Admin | admin@examguard.test |

## What works

- **Candidate:** dashboard with Available / Upcoming / Completed tabs, instructions and identity-confirmation gate, exam workspace (navigator, flag for review, scratchpad, text size), auto-resume after refresh, published results and printable report.
- **Examiner:** create and publish exams, question bank with correct/skip analytics and validated add-question form, CSV bulk import with row errors, live monitor and announcements, grading queue with mark validation, results analytics, sandbox preview.
- **Admin:** user and role management.
- **Anyone:** report verification by ID (shows masked initials only).
- **Failure resilience (challenge 5.3):** answers are saved locally first, offline state is shown, and the timer deadline is fixed at attempt start so reconnecting never adds time.

## Status and limits

This is a front-end prototype: data is simulated and stored in `localStorage` (`data.js` is the only seed). Server-side authorization, server-authoritative timing, real PDF generation and persistence belong to the backend and are not part of this package.
