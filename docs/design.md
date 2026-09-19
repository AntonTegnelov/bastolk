# Bastolk — design

What the tool is, what is in scope, and the decisions that shaped the
rest. [architecture.md](architecture.md) covers the technical shape and
[../TODO.md](../TODO.md) lists the work in build order.

## Purpose

Bastolk suggests a bookkeeping entry for each bank transaction. Suggestions come from two local models: a small LLM fine-tuned on synthetic transactions, and a nearest-neighbour model that learns each company's own habits. A person reviews every suggestion, and approved entries leave the tool as a SIE4 file that the real accounting system imports.

It exists because two small Swedish companies need their bank transactions coded, and many of those are foreign software subscriptions that need reverse-charge VAT entries: repetitive, rule-bound and easy to get wrong. It is also a deliberate exercise in training, evaluating, serving and retraining a small model on local hardware (an RTX 3070 with 8 GB of VRAM), which is why the model work is time-boxed and has a fallback that needs no GPU at all.

## Time box, and what gets cut first

The tool is built in a two-day time box, as thin end-to-end slices: the
whole path works before any part of it gets deeper. If time runs short, cut in
this order. Each item is chosen because removing it leaves a demo that still makes sense.

1. The SIE4 export. The review screen still shows the finished journal entries.
2. The job queue. Training can run as a plain background process with a status row in the database.
3. The automatic promotion gate. Promote a new model by hand after reading its metrics.
4. The fine-tuned LLM itself, if the toolchain does not work inside its time box. The nearest-neighbour model carries the product alone.

## Scope

The tool covers one path: bookkeeping history in, bank transactions in, reviewed journal entries out. Everything outside that path is left out, mostly because it would consume time without teaching anything new.

### In scope

| Capability | Why it is in |
| --- | --- |
| Import SIE4 files (chart of accounts and historical verifications) | It supplies the nearest-neighbour model's examples and the real-world test set for the LLM. Every Swedish accounting system exports it, so nothing depends on one vendor. |
| Import a bank CSV of new transactions | These are the items to be coded. Bank text is already plain text, so no OCR or document parsing is needed. |
| Suggest an account and a VAT treatment per transaction, with a confidence value | This is the judgement call, and the part a model is good at. |
| Build the full journal entry from that suggestion with deterministic rules | Amount splitting and reverse-charge lines are arithmetic and law. They should never be probabilistic. |
| Review screen: approve or correct each suggestion | Bookkeeping mistakes have legal weight, so a person signs off on every entry. Corrections are also the most valuable training data. |
| Retrain from corrections, with versioned models and recorded metrics | This is the part of LLM work that is hardest to learn from reading: knowing whether a new model is better before using it. |
| Several companies in one installation | There are two real companies to serve, and tenant scoping is a natural use for Nest guards. |
| Export approved entries as SIE4 | It closes the loop and makes the tool useful beyond the demo. |

### Out of scope

| Left out | Why |
| --- | --- |
| Posting directly to an accounting system's API | It needs OAuth setup and vendor-specific code. SIE import achieves the same result and keeps the tool a proposer, never a poster. |
| Invoices, PDFs and receipts | Document understanding is a different and much larger problem. Bank lines give a complete product without it. |
| User accounts and login | The tool runs locally for one person. A company selector is enough to exercise guards and tenant scoping. |
| Cloud deployment | The data is private and the GPU is local. How it would run on GCP is worth being able to describe, and the architecture document does so, but building it teaches little in this time frame. |
| Cost centres, projects and other dimensions | Small companies rarely use them, so the history probably holds little training signal. The data model leaves room for them. |
| Transactions that split across several expense accounts | They are rare in bank data and would complicate both the model's output format and the review screen. |

## Key decisions

Each decision below shaped the rest of the design. The reasoning is recorded because these are the questions a reviewer, or a future reader of the code, would ask.

### Train the LLM on synthetic data, and test it on real history

Each company's history holds a few hundred usable entries, concentrated on a handful of accounts. That is enough for nearest-neighbour search and too little to fine-tune an LLM. The training set is therefore generated. A large hosted model writes realistic Swedish bank texts for a given BAS account and VAT treatment, a few thousand in total. The label is handed to the generator, not guessed by it, so labels are right by construction.

BAS is a national standard, so a general model of "bank text to BAS account" is meaningful across companies. The real history is never trained on. It is the test set, which makes the reported accuracy a measure of transfer to real data, not of memorisation. This is also how small specialised models are commonly built: a large model's knowledge is distilled into a small one that is cheap, fast and private to run.

### Two models behind one interface

A nearest-neighbour model and a fine-tuned LLM both implement the same prediction interface. There are three reasons for carrying both.

- **Safety.** The nearest-neighbour model needs no GPU and no training step, so the product works even if fine-tuning fails.
- **Honest evaluation.** A fine-tuned LLM only means something next to a simple baseline. For picking one account out of a few dozen, the baseline may well win, and knowing that is the real lesson.
- **Different knowledge.** The LLM knows what suppliers generally are, for example that a cloud provider is an IT cost from a foreign company. Nearest-neighbour knows what this company has done before. It learns from a correction instantly, because a correction is just a new stored example, and it can show the past entries it matched. When nearest-neighbour has a close match it answers. Otherwise the LLM does.

### The model decides the judgement, code decides the arithmetic

The model outputs only an account number and a VAT treatment. A deterministic rules module turns that into balanced journal lines. Splitting out 25% VAT or adding the paired reverse-charge lines has exactly one right answer, and a language model should never be asked to do sums. It also keeps the model's output tiny, which makes training fast and the output easy to validate.

### A person approves every entry

Nothing is exported without approval. Confidence decides only how much attention an entry gets: high-confidence entries can be approved in bulk, and low-confidence ones are flagged. Bookkeeping errors have tax consequences, and with a history this small the model will be wrong often enough that silent automation would be reckless.

### Keep the newest real months untouched as the test set

The real history is split by date. Older months are a development set, used while tuning the generator and the training settings. The newest three months are the final test set and are scored rarely. Tuning against the data that produces the headline number would inflate it, however real that data is.

The date split matters for nearest-neighbour too. Recurring suppliers appear dozens of times, and a random split would let it look up test answers among its own examples.

### A new model must beat the current one to be used

Every training run is scored on the same held-out months, and the result is stored with the model version. A version is promoted only if it scores at least as well as the active one. Retraining on a handful of corrections can easily make a small model worse, and without a gate nobody would notice.

### Python only where it is unavoidable

The training script is Python, because the fine-tuning ecosystem is. Everything else, including the baseline model, data preparation, evaluation bookkeeping and serving calls, lives in the NestJS application. This is a TypeScript project, so hours spent in Python beyond the minimum serve the wrong goal.

### Several companies from the first migration

Every table that holds company data carries a company id from the start. Adding tenancy later means touching every query, and doing it up front costs almost nothing. Nearest-neighbour examples, suggestions and decisions are strictly per company.

The fine-tuned LLM is shared, because it models the national standard and because corrections from both companies improve it. That is acceptable here because both companies have one owner. A product with unrelated customers would need per-customer adapters, or consent, before one customer's corrections shaped another's suggestions.

## Risks

The fine-tuning toolchain is the largest risk, and the plan is built so that it can fail without sinking the project. The other risks each have a cheap fallback.

| Risk | Why it is likely | Consequence | Fallback |
| --- | --- | --- | --- |
| The fine-tuning toolchain does not install or run | PyTorch, CUDA and the quantisation libraries must match each other exactly. | Hours lost with nothing to show. | A hard time box on the toy fine-tune (block 1 in TODO.md). The nearest-neighbour model then carries the product, and the README states what was attempted. |
| Synthetic texts don't look like real bank lines | A generator left to itself writes tidy, descriptive texts. Real bank lines are truncated, upper-case and full of reference codes. | Good scores on synthetic validation data and poor ones on the real test set. | Seed the generator with anonymised patterns from real bank files. Compare synthetic and real accuracy after the first run, and revise the generator if the gap is large. |
| Verification texts differ from bank texts | If descriptions were typed by hand, the nearest-neighbour examples and the test set hold one kind of text, and live predictions see another. | Accuracy on real bank lines is far below the test score. | Checked in block 0. If they differ, the correction loop matters more, since each correction stores a real bank text. |
| 8 GB of VRAM is shared | The served model and a training run cannot both sit on the GPU. | Training crashes with out-of-memory errors, or serving stalls. | The training job unloads the served model first and reloads it afterwards. Suggestions fall back to nearest-neighbour while training runs. |
| 16 GB of RAM is tight | Docker, Postgres, the dev servers and an editor all compete with the training process. | Swapping makes everything slow. | Cap Docker's memory, and close the frontend dev server and browser tabs during training. |
| Time going to the wrong thing | Model training is more novel and more fun than learning framework conventions. | A good model on top of backend code that nobody understands. | The build order in TODO.md. The NestJS foundation is the longest block and comes before any real model work. |
| Wrong VAT handling | Reverse-charge rules depend on the supplier's country and the type of purchase. | Exported entries that would be wrong in the real books. | Derive VAT templates from how past verifications were actually booked, and have whoever does the bookkeeping check them before any real import. |
| The real test set is small | A few hundred entries per company, most of them on five or six accounts. | Accuracy figures swing by several points between runs, and rare accounts can't be scored at all. | Report the number of test examples beside every figure. Treat a difference of a few points between models as a tie. |

## Definition of done

The project is done when a five-minute demo can run without apology.

### The demo

- [ ] Import a SIE4 file and see the chart of accounts and verification count for that company.
- [ ] Upload a bank CSV and see a suggested entry per transaction, each with a confidence value and the evidence behind it.
- [ ] Correct one suggestion, upload a similar transaction, and see the correction take effect.
- [ ] Open the model-versions screen and show two versions with their held-out accuracy.
- [ ] Switch company and show that none of the first company's data is visible.
