# Agent log

Where the coding agent went wrong, and what caught it. One entry per incident:
what it produced, why it was wrong, and which gate found it (a test, CI, a
review, or a person noticing). The point is the catching mechanism, not the
mistake.

| Date | What the agent did | Why it was wrong | What caught it |
| --- | --- | --- | --- |
| 2026-09-19 | Mounted the pnpm node_modules volumes at apps/api and apps/web before those directories existed in the checkout. | Docker creates a missing bind-mount parent as a root-owned 755 directory, so the dev user could not write into apps/api and the first scaffold command would have failed. | A write test as dev in every mount parent, run while verifying the container instead of on first use. |
