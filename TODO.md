# Bastolk — TODO

## How to use this list

Tasks are in build order, grouped into the nine blocks of the time plan on the Design tab. Each task states why it exists, so that when time runs short the decision to skip it is an informed one.

- **Every block ends with a checkpoint.** If the checkpoint doesn't hold, fix that before moving on. A broken foundation costs more with every block built on top of it.
- **Tasks marked "cut first" are the ones to drop under time pressure.** Dropping them leaves the demo intact.
- **Give the agent the reason along with the task.** An agent that knows why the rules module has no framework imports won't add one. The reasons here are written so they can be pasted into a prompt.

## Block 0: data check (1 hour)

This block sizes the real test set and collects what the synthetic data generator needs. It also catches format surprises before any code exists.

- [ ] **Export a SIE4 file for each company, covering all available years.** The history supplies the nearest-neighbour examples and the real test set, and its size says how far the accuracy figures can be trusted.
- [ ] **Open one file in a text editor and find the `#KONTO`, `#VER` and `#TRANS` records.** Ten minutes with the raw format prevents an hour of misunderstanding what the parser must do.
- [ ] **Check the file encoding by looking for å, ä and ö in the text.** SIE files use an old PC encoding. Decoding them as UTF-8 silently corrupts every Swedish supplier name.
- [ ] **Count verifications in total, and count those with exactly one line outside the bank and VAT accounts.** Only the second number is usable. With a few hundred, a difference of a few points between two models is noise, and the README should say so.
- [ ] **List the top 20 accounts by frequency.** It shows how skewed the labels are, and it is the starting point for the list of accounts the synthetic data must cover.
- [ ] **Download a bank CSV for the most recent months and put ten rows beside their matching verifications.** If the texts look alike, the history is a fair test of live use. If they don't, write that down: reviewed bank rows then become the more trustworthy test data.
- [ ] **Collect 30 to 50 real bank texts as format patterns, with customer names and amounts removed.** These go into the generator's prompt as a style guide. They are the main defence against synthetic texts that look nothing like real ones, and nothing sensitive should reach a hosted model.
- [ ] **Note how reverse-charge purchases were booked: which accounts, and how many lines.** The rules module must reproduce the company's existing practice, not a textbook's.
- [ ] **Put all of this under `data/` and confirm the folder is ignored by git before the first commit.** Real bookkeeping data in a public repository is the one mistake here that can't be undone.

**Checkpoint:** a short note with the counts, the account list, a verdict on text similarity and the reverse-charge pattern, plus a seed file of text patterns.

## Block 1: toy fine-tune (3 hours, hard limit)

The goal is to push ten examples through the entire chain, not to get a good model. Every link is proven once while there is still time to fall back. Start a timer.

- [ ] **Update the NVIDIA driver and confirm `nvidia-smi` shows the GPU and a CUDA version.** Every later step depends on this, and a stale driver produces errors that point everywhere else.
- [ ] **Create a Conda environment and install the PyTorch build that matches that CUDA version.** Version mismatch is the most common cause of a failed setup, so it is settled before anything else is installed.
- [ ] **Run a two-line PyTorch check that a tensor can be created on the GPU.** If this fails, nothing above it will work, and the failure is far easier to diagnose at this level.
- [ ] **Install Unsloth and run its documented verification script unchanged.** A known-good script separates "my setup is broken" from "my code is broken".
- [ ] **Write ten training examples by hand in the chat format, as a JSONL file.** Hand-writing them fixes the exact input and output format that the dataset export must later produce.
- [ ] **Write `train.py`: load a sub-1B base model in 4-bit, attach LoRA adapters, train for a few steps, save.** The model is small so that each attempt takes seconds. The script takes the dataset path, base model name and output directory as arguments, because a job will call it later.
- [ ] **Mask the loss so only the answer tokens count, and confirm it by printing one tokenised example with its labels.** Without masking, most of the training signal goes to reproducing the prompt. Printing one example is the only way to be sure the mask is where it should be.
- [ ] **If the base model has a thinking mode, disable it in the chat template for both training and serving.** A mismatch between the two templates is a classic cause of a model that trains well and answers nonsense.
- [ ] **Export the merged model to GGUF with 4-bit quantisation.** This is the format the model server loads. The export step has its own dependencies, which is why it is tested now and not on Sunday.
- [ ] **Install Ollama, register the GGUF file under a name, and get an answer from the command line.** It proves that the exported file is valid.
- [ ] **Call Ollama's native chat endpoint over HTTP with a JSON schema for the output and log-probabilities switched on.** These two features are what the confidence score and the output validation depend on. If either is missing in the installed version, switch to the llama.cpp server now.
- [ ] **Unload the model through the API and confirm in `nvidia-smi` that the VRAM is freed.** The training job relies on this to avoid out-of-memory failures.
- [ ] **Write down every command that worked, in order, in `ml/README.md`.** The setup will be needed again, and the path that worked is forgotten within a day.

**Checkpoint:** an HTTP request returns a JSON answer with log-probabilities from a model trained on this machine. If three hours have passed without that, stop, note where it failed, and go to block 2.

## Block 2: NestJS foundation (4 hours)

This is the core learning block. Read each generated file instead of accepting it, and for each Nest concept, know why it exists before moving on. Speed matters less here than in any other block.

### Repository and tooling

- [ ] **Create the repository with pnpm workspaces and the folder layout from the Architecture tab.** Settling the layout first means the agent puts files in the right place from its first prompt.
- [ ] **Write `CLAUDE.md`: the stack, the commands, the module conventions, money as integer öre, the no-framework-imports rule for the parser and rules, and "never commit anything under `data/`".** The agent follows written conventions far better than implied ones, and this file is itself evidence of an AI-native workflow.
- [ ] **Start `docs/agent-log.md` with a first entry.** Notes taken in the moment are specific. Reconstructed ones are vague, and specifics are what make the account credible.
- [ ] **Add `docker-compose.yml` with the pgvector Postgres image and Redis, and start them.** A disposable database makes it safe to reset migrations freely while the schema is still moving.
- [ ] **Scaffold the API with the Nest CLI, then read `main.ts`, `app.module.ts` and the generated controller, service and test.** The scaffold is the smallest complete example of Nest's structure. Understanding these five files first makes everything after it a variation.

### Cross-cutting setup

- [ ] **Add the config module with a validated environment schema.** The app should refuse to start with a missing database URL, not fail on the first request. It is also the first taste of a global module.
- [ ] **Add Prisma, write the schema for `company`, `account`, `verification` and `verification_line`, and run the first migration.** Only the tables this block needs. Later tables come with their features, so each migration tells a story.
- [ ] **Wrap the Prisma client in an injectable service inside a global `common` module, with a shutdown hook.** This is the standard pattern for sharing a resource through dependency injection, and the first lifecycle hook.
- [ ] **Turn on the global validation pipe with whitelisting and transformation.** Unknown fields are stripped and types are coerced before a controller ever sees the input. Understanding what a pipe does, and when it runs, is the point of using one.
- [ ] **Add the Swagger module and open the docs page.** It gives a free UI for exercising the API before the frontend exists, and it is the source of the generated frontend types.
- [ ] **Add a logging interceptor that records method, path, status and duration.** It is small and useful, and the clearest way to see what an interceptor is: code that wraps around the handler.
- [ ] **Add an exception filter that maps domain errors, such as "account not in chart", to proper HTTP responses.** Services should throw meaningful domain errors and not know about HTTP. The filter is where the two meet.

### Companies and tenancy

- [ ] **Build the `companies` module with create and list endpoints.** It is the simplest possible module, built first as a template for the rest.
- [ ] **Write a guard that reads a company id header, verifies the company exists, and attaches it to the request.** A guard decides whether a request may proceed at all. Centralising tenancy there means no endpoint can forget it.
- [ ] **Write a `@CurrentCompany()` parameter decorator and use it in every company-scoped controller.** It keeps controllers free of request plumbing, and shows how Nest's decorators are built.
- [ ] **Write an end-to-end test proving company A's data is invisible with company B's header.** Tenancy leaks are the most serious class of bug in multi-tenant software. One test guards against every future regression.

### SIE import and ledger

- [ ] **Commit a small synthetic SIE4 file as a test fixture, in the same encoding as the real ones.** Tests and CI need data that is safe to publish, and the encoding must be exercised.
- [ ] **Write the SIE parser as pure functions: decode, tokenise lines with quoted fields, build accounts and verifications.** Plain functions are trivial to test. This is the code most likely to meet surprising input.
- [ ] **Unit-test the parser: Swedish characters, quoted text containing spaces, negative amounts, and a verification with many lines.** Each is a way real files differ from the simple case. Amounts are converted to integer öre here, and nowhere else.
- [ ] **Build the `sie` module with an upload endpoint that parses and stores a file inside one database transaction.** A half-imported file is worse than a failed import. It is also the first use of file upload handling in Nest.
- [ ] **Make the import idempotent per company, fiscal year and verification number.** The same file will be uploaded twice during development, and duplicates would silently double the weight of training examples.
- [ ] **Build the `ledger` module with read endpoints for accounts and verifications, with pagination.** It makes the imported data visible, which is the quickest way to spot parser bugs.
- [ ] **Unit-test one service with `Test.createTestingModule` and a mocked Prisma service.** Replacing a provider in a testing module is the payoff of dependency injection.

### CI

- [ ] **Add the GitHub Actions workflow: install, lint, type-check, unit tests, end-to-end tests with a Postgres service, build.** Set up now, it guards every later block. Set up at the end, it guards nothing.
- [ ] **Push, and get the pipeline green.** A red pipeline that is ignored is worse than none.

**Checkpoint:** a real SIE file imports, accounts and verifications show up in Swagger scoped by company, and CI is green.

## Block 3: baseline and suggestions (3 hours)

By the end of this block the backend produces real, balanced suggestions with no GPU involved. From here on, the project has a working product whatever happens to the LLM.

### Training examples

- [ ] **Add the `training_example` table with a pgvector column, and enable the extension in a migration.** Prisma can't express the vector type, so the column is declared as unsupported and queried with raw SQL. Knowing where an ORM stops is part of knowing the ORM.
- [ ] **Write label extraction as a pure function: verification in, labelled example or "skip" out.** Per-company configuration names the bank and VAT accounts. This function defines what the models learn, so it gets the most careful tests in the project.
- [ ] **Unit-test label extraction: domestic purchase, EU reverse charge, non-EU reverse charge, VAT-free, income, and a multi-line salary entry that must be skipped.** These are the patterns found in block 0. A wrong label here becomes a confidently wrong model later.
- [ ] **Run extraction after each SIE import and report how many verifications were used and how many skipped.** The skip rate is a data-quality number worth knowing, and worth putting in the README.

### Nearest-neighbour predictor

- [ ] **Add an embedding service that loads the multilingual embedding model once at startup and embeds text in batches.** Loading takes seconds, so it happens in a lifecycle hook, not on a request. Batching turns embedding a whole history from minutes into seconds.
- [ ] **Normalise text before embedding: lower-case, strip card numbers, dates and reference codes.** Bank texts are full of tokens that differ on every row and mean nothing. Removing them makes "the same supplier" look the same.
- [ ] **Embed all training examples and store the vectors.** After this, a correction is searchable the instant it is saved.
- [ ] **Define the predictor interface and an injection token in the `predictors` module.** The interface comes before any implementation, so the rest of the code is written against the abstraction.
- [ ] **Implement the nearest-neighbour predictor: the top ten by cosine similarity within the company, votes weighted by similarity, the top three accounts returned with their matched examples as evidence.** Weighted voting is robust to a single odd neighbour, and the evidence is what makes a suggestion trustworthy to a bookkeeper.
- [ ] **Add an evaluation command that scores a predictor on the newest three months and prints accuracy overall, per account, and top-three.** This number is the bar the LLM has to beat. Building the evaluation before the second model keeps the comparison fair.

### Rules and suggestions

- [ ] **Write the rules module as pure functions: account, VAT treatment and gross amount in, journal lines out.** One template per VAT treatment, shaped like the company's own past entries. No model output ever reaches the amounts.
- [ ] **Unit-test every template, including amounts that don't divide evenly, and assert that debits equal credits to the öre.** Rounding is where bookkeeping code goes wrong. The balance assertion is the single most valuable test in the project.
- [ ] **Add a check that flags a foreign-looking supplier predicted with domestic VAT.** It shows rules and models covering for each other's weaknesses.
- [ ] **Add the `bank_transaction`, `suggestion`, `decision`, `journal_entry` and `journal_line` tables.** They arrive together because they describe one flow.
- [ ] **Build the `bank` module: CSV upload with column mapping for the bank's format, and de-duplication by content hash.** Overlapping date ranges will be uploaded by accident, and duplicates would mean double bookings.
- [ ] **Build the `suggestions` service: for each uncoded transaction, predict, validate the account against the chart, apply the rules, store the suggestion.** This is the central use case, and it should read like a short description of the process.
- [ ] **Add approve and correct endpoints. A correction creates a decision, a journal entry, and a new training example with its embedding.** This closes the fast learning loop: the next similar transaction benefits at once.
- [ ] **Write an end-to-end test of the loop: import history, upload a transaction, get a suggestion, correct it, upload a similar one, and see the corrected account suggested.** It is the demo as a test. If this passes, the product works.

**Checkpoint:** Swagger can drive the whole loop on real data, the baseline's held-out accuracy is written down, and CI is green. End of day one.

## Block 4: synthetic dataset and fine-tune (3 hours)

Generation and training both run unattended, so start each early and work on block 5 meanwhile. Generation can start on Saturday evening. If block 1 failed, the training half of this block is a second attempt capped at two hours, and then it is skipped.

### Dataset

- [ ] **Write `taxonomy.json`: 30 to 40 BAS accounts, the VAT treatments valid for each, and five to ten purchase scenarios per account.** Start from the top-20 list in block 0 and add the common accounts a small company meets sooner or later. The taxonomy decides what the model can ever know, so it deserves real thought.
- [ ] **Write the generator command: for each account, VAT treatment and scenario, ask the hosted model for a batch of bank texts with amounts, using the seed patterns as a style guide.** The label is given, not asked for, which keeps labelling errors rare. Requests run in parallel with a cap, and results are written as they arrive, so a crash loses minutes, not the run.
- [ ] **Ask for variety explicitly: Swedish and foreign merchants, card and transfer formats, truncation, subscription and one-off purchases.** A generator repeats itself unless told not to, and a model trained on repetitive data learns the repetition.
- [ ] **Generate 100 examples first and read 50 of them.** Ten minutes of reading catches a systematic problem that would otherwise cost a full generation and training run to discover.
- [ ] **Generate the full set of 3,000 to 5,000, remove near-duplicates, apply the class floor, and hold out a tenth as synthetic validation data.** Validation data drives early stopping, so that no real data is touched during training.
- [ ] **Export the real history as two JSONL files in the same format, split by date: development and test.** The export lives in TypeScript because it reads the database, and because both models must be scored on exactly the same rows.

### Training

- [ ] **Extend `train.py` for the real run: the 2B-class base model, validation loss every few steps, early stopping, and a metrics file written at the end.** The metrics file is the script's only way of reporting back, which keeps Python away from the database.
- [ ] **Watch VRAM during the first minute, and lower the batch size with more gradient accumulation if it nears 8 GB.** An out-of-memory crash ten minutes in wastes more time than a slightly slower run.
- [ ] **Look at the loss curves before trusting any number.** Training loss falling while validation loss rises means overfitting. Recognising that shape in one's own run is the experience this project is for.
- [ ] **Write `evaluate.py`: run the model over a JSONL file and report accuracy overall, per account and for VAT treatment, in the same format as the baseline's report.** Same data, same metrics, same format. Otherwise the comparison means nothing.
- [ ] **Score the model on synthetic validation data and on the real development set, and compare.** The gap between the two is the most informative number in the project. A large gap means the generator needs work, not the training settings.
- [ ] **If the gap is large, read the real examples the model got wrong, fix the generator's prompt or taxonomy, regenerate and retrain, once.** One loop of this is the core skill of working with synthetic data. More than one loop doesn't fit the weekend.
- [ ] **Score the final model on the real test months, once.** The test set stays meaningful only if it isn't used for tuning.

### Serving

- [ ] **Export the best model to GGUF and register it in Ollama under a versioned name.** There will be a second version within hours, so names carry a version from the start.
- [ ] **Implement the LLM predictor: call the native chat endpoint with the JSON schema, parse, and compute confidence from the log-probabilities of the account tokens.** It implements the same interface as the baseline, so nothing else in the API changes.
- [ ] **Handle the failure cases explicitly: server unreachable, timeout, invalid JSON, account not in chart.** Each returns "no prediction", not an exception, because the composite predictor treats all of them as "ask the other model".
- [ ] **Implement the composite predictor: nearest-neighbour when its best match is close, otherwise the LLM, with the threshold and strategy as configuration.** Known suppliers follow the company's habit and unknown ones get general knowledge. Configuration makes baseline-only, LLM-only and combined runs a one-line change.
- [ ] **Unit-test the composite predictor with two stub predictors.** Fallback logic is exactly the kind of code that works in the demo and fails in the one case nobody tried.
- [ ] **Score all three strategies on the real test months.** The combined strategy is the product, so its number matters most. Whether it beats both parts is the project's headline result.
- [ ] **Add the `model_version` table, and record this first model with its per-company metrics as the active version.** The registry starts with real content, which makes block 6 a matter of adding the second row.
- [ ] **Build the calibration table for both predictors from the real development months: the hit rate per confidence band.** A raw score of 0.9 means nothing to a user. "Right 19 times out of 20 at this level" does.

**Checkpoint:** suggestions can come from either model or both, all three strategies have real-data scores in the same format, and the synthetic-to-real gap is written down.

## Block 5: review screen (3 hours)

React is a known skill, so this block is about speed. Let the agent do most of the work, against the generated API types, and spend attention only on the review interaction itself.

- [ ] **Scaffold the web app with Vite and TypeScript, and set up a dev proxy to the API.** A proxy avoids CORS configuration, which is a time sink that teaches nothing.
- [ ] **Generate TypeScript types from the OpenAPI document, and add a script and a CI step that fail when they are stale.** The backend is the single source of truth. A type error in the frontend is a far better failure than a runtime surprise.
- [ ] **Add TanStack Query and a small API client that always sends the selected company header.** Tenancy is handled in one place on the frontend, just as on the backend.
- [ ] **Add a company selector in the page header.** Switching company and seeing everything change is a ten-second demonstration of multi-tenancy.
- [ ] **Build the Import page: upload a SIE file, upload a bank CSV, and see the resulting counts.** The demo has to start from an empty system to be convincing.
- [ ] **Build the Review page: a table of transactions with text, amount, suggested account and name, VAT treatment, and measured confidence.** This is the product. The columns are what a bookkeeper looks at, in the order they look at them.
- [ ] **Sort by confidence, lowest first, and add a bulk-approve action for everything above a chosen level.** Attention is the scarce resource. The screen's job is to spend it where the model is unsure.
- [ ] **Add an expandable row showing the journal lines, the evidence (matched past entries or model version), and any rule warnings.** A suggestion with visible evidence gets trusted. One without gets re-checked by hand, which defeats the purpose.
- [ ] **Add the correct action: choose from the other candidates or search the chart of accounts, choose a VAT treatment, save.** The model's second and third guesses are usually right when the first is wrong, so they are offered before a full search.
- [ ] **Invalidate the right queries after approve and correct, so that counters and lists update.** Stale numbers on screen undermine trust in the whole tool.
- [ ] **Show a banner when the API reports that the GPU is busy and suggestions come from the baseline.** The user should never have to wonder why the suggestions changed character.
- [ ] **Style it with plain CSS or one small component library, and stop.** (Cut first: anything cosmetic.)

**Checkpoint:** the five-step demo from the Design tab can be clicked through in the browser up to, but not including, the model-versions step.

## Block 6: retraining loop (2 hours)

This block turns a model that was trained once into a system that can be retrained safely. It is the part of the LLM goal that reading tutorials doesn't provide.

- [ ] **Add the `training_run` table.** Runs fail in ways that need a record: when, at which step, and with what last output.
- [ ] **Register a BullMQ queue in the `training` module, and add an endpoint that enqueues a training job.** The request returns at once with a run id. Learning the producer and processor pattern is the Nest goal of this block. (Cut first: replace the queue with a plain background promise and a status row.)
- [ ] **Limit the queue to one training job at a time.** There is one GPU. Two concurrent runs would both fail.
- [ ] **Write the processor step by step: assemble the dataset from the synthetic file plus all corrections, unload the served model, start `train.py` as a child process, stream its output to the run's log, and wait.** Each step updates the run's status, so a failure says where it happened.
- [ ] **Treat a non-zero exit code or a missing metrics file as a failed run. Reload the previous model in every case, including failure.** The system must always return to a working state. The reload therefore sits in a `finally` step, not at the end of the happy path.
- [ ] **On success, register the GGUF in Ollama, store a new `model_version` with its metrics, and apply the promotion gate against the same test months as the active version.** Comparing on identical data is the only fair comparison. The gate's threshold is a configuration value.
- [ ] **Leave corrections dated inside the test months out of the training data, and repeat the others several times in the file.** Test data that leaks into training makes every new version look better than the last, which would make the gate meaningless. The repetition keeps a few dozen corrections from vanishing among thousands of synthetic rows.
- [ ] **Unit-test the promotion gate: better, equal, worse, and the first version ever.** The logic is small, the consequences are large, and it is pure. There is no reason to leave it untested.
- [ ] **Add endpoints to list versions and runs, and to activate a version by hand.** Manual activation is the rollback path, and it is also the fallback if the automatic gate is cut.
- [ ] **Build the Models page: versions with metrics and status, runs with status and a log tail, and a "Retrain" button.** Seeing two versions side by side, with their scores, is the moment that makes the training story concrete for someone watching.
- [ ] **Run the loop for real: make a batch of corrections, retrain, and see whether the new version is promoted.** Whatever happens is a useful result. A rejected version is arguably the better story.

**Checkpoint:** two model versions exist with comparable metrics, the gate made a decision, and suggestions kept working while training ran.

## Block 7: export (1 hour, cut first)

The export makes the tool useful beyond the demo. It is also the first feature to drop, because nothing else depends on it.

- [ ] **Write the SIE4 writer as a pure function: journal entries in, file content out, in the same encoding as the imports.** It is the parser in reverse, and it shares the parser's test fixtures.
- [ ] **Test the round trip: write entries, parse the output with the project's own parser, and compare.** If the tool can't read its own files, no accounting system will.
- [ ] **Add an endpoint that exports approved, not-yet-exported entries for a date range, and marks them as exported.** Without the mark, the same entries would be imported into the real books twice.
- [ ] **Add an export button with a date range on the Review page.**
- [ ] **Import one exported file into a test company in the real accounting system, not the live one.** Every accounting system is strict about this format in its own way. The first attempt should happen where a mistake costs nothing.
- [ ] **Ask whoever does the bookkeeping to look over the reverse-charge entries before any real use.** The templates were derived from past entries, but a rule that is wrong is wrong at scale.

## Block 8: write-up (2 hours, then stop)

The project is only worth what can be explained about it afterwards. This block is not optional, and it is not to be traded for one more feature.

### The repository

- [ ] **Write the README: what it does, a screenshot of the Review page, how to run it, and the results table.** Someone opening the repository gives it a minute. The README is the whole project to them.
- [ ] **Put the results in one table: baseline, LLM and the two combined, overall and top-three accuracy, synthetic validation beside real test, and the number of examples behind each figure.** Honest numbers with their context are more impressive than a good number without any.
- [ ] **Add a "what I would do next" section.** Naming a project's limits shows judgement. Leaving them for a reader to find does the opposite.
- [ ] **Tidy `docs/agent-log.md` into three to five concrete episodes: what was asked, what went wrong, and what caught it.** Specific episodes beat general claims about how the work was done.
- [ ] **Check that no real company data, supplier names or amounts appear in the repository, screenshots or commit history.** Blur the screenshots, or take them with the synthetic fixture.
- [ ] **Confirm that CI is green on the final commit.**
