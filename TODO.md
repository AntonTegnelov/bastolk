# Bastolk — TODO

## How to use this list

Outstanding work only. Finished tasks are deleted rather than ticked: this is
a queue, and what was built is visible in the code and the git history.

Each task says why it exists, so that when time runs short the decision to
skip it is an informed one. The order is the order to do them in.

## Blocked on data

Everything in this section waits on one file, and nothing else in the project
is worth doing before it.

- [ ] **Export SIE4 for both companies, covering all available years.** It is
  the chart of accounts, the nearest-neighbour model's examples and the only
  source of labelled real entries. Until it exists there is no real-history
  accuracy figure and no honest comparison between the two models.
- [ ] **Check the file's encoding by looking for å, ä and ö.** The parser
  decodes CP437 explicitly and there is a test for it, but a file written by a
  different program is the case the test cannot cover.
- [ ] **Count verifications with exactly one non-bank, non-VAT line.** Only
  those become labels. The number decides how far the accuracy figures can be
  trusted, and the README should quote it beside every figure.
- [ ] **Compare bank texts with verification texts.** If the history's texts
  were typed by hand, the stored examples and live bank lines are different
  kinds of text, and the correction loop matters more than the import does.

## Serving the fine-tuned model

- [ ] **Convert the merged model to GGUF.** Ollama 0.34.2 rejects
  `Qwen2ForCausalLM` from safetensors with `unsupported MLX architecture`, and
  the `gguf` pip package ships inspection tools rather than the converter. The
  converter is `convert_hf_to_gguf.py` in the llama.cpp repository, which is
  one clone and one command for a person. Blob upload to Ollama over HTTP
  already works, so that is the only missing step.
- [ ] **Register the converted model with Ollama and confirm the API reaches
  it.** `llm.predictor.ts` calls the native chat endpoint and reports itself
  unavailable when no version is active, which is the path the composite takes
  today. Nothing has exercised the other branch against a real model.
- [ ] **Confirm the native endpoint returns log-probabilities.** Confidence
  for the LLM is built on them, and the OpenAI-compatible endpoint drops them.
  If the installed build returns none, the predictor reports zero confidence
  rather than inventing one, and that needs to be stated in the README.
- [ ] **Score the fine-tuned model on the held-out months and store the
  metrics with the version.** The gate reads stored metrics; a version with
  none cannot be promoted, by design.

## Retraining loop

- [ ] **Move training behind BullMQ.** It was second on the cut list and the
  cut was taken, so training is started by hand. A queued job gives progress,
  a visible history of runs and somewhere to put the GPU handover.
- [ ] **Unload the served model before training and reload it after.** Eight
  gigabytes holds one consumer. The API must keep answering from the baseline
  while the GPU is busy, and `/health` already reports that state.
- [ ] **Include corrections in the training file, weighted up, and exclude any
  dated inside the test months.** A few dozen corrections vanish among a
  thousand synthetic rows, and a correction inside the test window is a leak.

## Honest numbers

- [ ] **Report the synthetic-to-real gap, with the baseline beside the
  fine-tuned model, per account.** The gap is the finding. A fine-tuned model
  without a baseline next to it is not a result.
- [ ] **Calibrate confidence for both models against the held-out months.**
  The two scales are not comparable and neither is calibrated, so the review
  screen currently shows a raw score where it promises a hit rate.

## Data quality

Going from 1277 to 3573 training examples moved account accuracy from 39% to
61% with no other change, so this section is where the next gain is.

- [ ] **Keep generating.** The curve has not obviously flattened, and a fourth
  round costs minutes. Report the accuracy at each dataset size so the point
  where it stops paying is visible rather than guessed at.
- [ ] **Attack the confusions rather than the volume.** The errors concentrate
  on `5420` against `6540`, `6540` against `6590`, and `2730` against `2710`.
  The first two are semantically adjacent and want more contrastive examples.
  The third is paid to the same authority and can carry the same bank text, so
  more data will not fix it and the correction loop has to.
- [ ] **Give the batch reviewer something harder than its own judgement.** It
  passed a batch of transfers that contained taxi fares and a salary run. A
  cheaper and stricter check is whether a text also appears under another
  label, which the dataset builder already computes.

## Smaller things

- [ ] **Generate the frontend's response types too.** Path and request types
  come from the OpenAPI document; the computed view types are hand-mirrored,
  so those two can still drift apart.
- [ ] **Distinguish the two reverse-charge treatments.** They book identical
  VAT accounts, so extraction cannot tell them apart from a verification alone
  and reports the EU one. Only a correction records the difference.
- [ ] **Make the bank and VAT account ranges configuration per company.** They
  are BAS constants in `rules/bas.ts` today, which is right for both real
  companies and wrong for a third.
