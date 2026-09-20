# Agent log

Where the coding agent went wrong, and what caught it. One entry per incident:
what it produced, why it was wrong, and which gate found it (a test, CI, a
review, or a person noticing). The point is the catching mechanism, not the
mistake.

| Date | What the agent did | Why it was wrong | What caught it |
| --- | --- | --- | --- |
| 2026-09-19 | Mounted the pnpm node_modules volumes at apps/api and apps/web before those directories existed in the checkout. | Docker creates a missing bind-mount parent as a root-owned 755 directory, so the dev user could not write into apps/api and the first scaffold command would have failed. | A write test as dev in every mount parent, run while verifying the container instead of on first use. |
| 2026-09-20 | Stored a reverse-charge proposal for an incoming transfer, and built the review list by asking the rules module for every row, so one impossible proposal made the whole review screen return 422. | Reverse charge applies to a purchase, so there is no correct entry for it on money coming in. The rules module was right to refuse; the fault was storing a candidate that cannot become an entry, and letting one bad row hide the other 72. | Running the real bank export through the running API. Both test suites were green: the synthetic fixture had no incoming payment whose nearest neighbour was a reverse-charge purchase. |
| 2026-09-20 | Styled the active navigation tab with the accent colour on top of the default filled button rule, so the selected tab rendered as blue text on a blue background and its label was invisible. | A CSS specificity mistake: `button:not(.link)` outranks `nav button`, so the tab kept the filled background while taking the accent text colour. Nothing failed, and the accessibility tree still read "Review". | Rendering the page in a headless browser and looking at the screenshot. Neither the type checker, the linter nor a DOM query could see it, because every one of them found the text present. |
