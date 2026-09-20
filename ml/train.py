"""Fine-tune a small instruct model to map a Swedish bank text to a BAS
account and a VAT treatment.

The trainer receives files and returns files. It never touches the database:
what goes into the dataset is decided in TypeScript, and what happens to the
result is decided by the API's promotion gate.

Only the answer is graded. The prompt tokens are masked out, so the model is
scored on the account and the VAT treatment rather than on reproducing the
transaction text.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

import torch
from datasets import Dataset
from peft import LoraConfig, get_peft_model
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from prompt_format import assistant_message, user_message  # noqa: E402

# Keeping model downloads off the bind-mounted checkout, which is nearly full.
os.environ.setdefault("HF_HOME", "/home/dev/.cache/huggingface")


def read_jsonl(path: pathlib.Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def build_examples(rows: list[dict], tokenizer, max_length: int) -> Dataset:
    """Tokenise into prompt plus answer, with the prompt masked out of the loss."""
    features = []

    for row in rows:
        prompt = tokenizer.apply_chat_template(
            [{"role": "user", "content": user_message(row["text"], row["amountOre"])}],
            tokenize=False,
            add_generation_prompt=True,
        )
        answer = assistant_message(row["account"], row["vat"]) + tokenizer.eos_token

        prompt_ids = tokenizer(prompt, add_special_tokens=False)["input_ids"]
        answer_ids = tokenizer(answer, add_special_tokens=False)["input_ids"]

        input_ids = (prompt_ids + answer_ids)[:max_length]
        # -100 is ignored by the loss, so only the answer is graded.
        labels = ([-100] * len(prompt_ids) + answer_ids)[:max_length]

        features.append({"input_ids": input_ids, "labels": labels, "attention_mask": [1] * len(input_ids)})

    return Dataset.from_list(features)


@torch.no_grad()
def exact_match(model, tokenizer, rows: list[dict], limit: int) -> dict:
    """Share of held-out examples where the generated JSON matches the label.

    Loss is what early stopping watches; this is the number a person can read.
    """
    model.eval()
    sample = rows[:limit]
    account_right = 0
    vat_right = 0
    both_right = 0
    unparsable = 0
    # Per label, because an aggregate hides which accounts the model cannot
    # tell apart, and that is the interesting part of the comparison.
    per_label: dict[str, dict[str, int]] = {}
    confusions: dict[str, int] = {}

    for row in sample:
        prompt = tokenizer.apply_chat_template(
            [{"role": "user", "content": user_message(row["text"], row["amountOre"])}],
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = tokenizer(prompt, return_tensors="pt", add_special_tokens=False).to(model.device)
        generated = model.generate(
            **inputs,
            max_new_tokens=40,
            do_sample=False,
            pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
        )
        answer = tokenizer.decode(generated[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True)

        try:
            parsed = json.loads(answer.strip())
            account_ok = str(parsed.get("account")) == row["account"]
            vat_ok = str(parsed.get("vat")) == row["vat"]
        except (json.JSONDecodeError, AttributeError):
            # Serving constrains the output to a schema, so a malformed answer
            # here is a training signal, not a runtime failure. It is counted
            # rather than hidden.
            unparsable += 1
            continue

        account_right += int(account_ok)
        vat_right += int(vat_ok)
        both_right += int(account_ok and vat_ok)

        label = f"{row['account']}|{row['vat']}"
        counts = per_label.setdefault(label, {"seen": 0, "account": 0, "both": 0})
        counts["seen"] += 1
        counts["account"] += int(account_ok)
        counts["both"] += int(account_ok and vat_ok)

        if not account_ok:
            key = f"{row['account']} -> {parsed.get('account')}"
            confusions[key] = confusions.get(key, 0) + 1

    total = max(len(sample), 1)
    return {
        "examples": len(sample),
        "accountAccuracy": account_right / total,
        "vatAccuracy": vat_right / total,
        "bothAccuracy": both_right / total,
        "unparsable": unparsable,
        "perLabel": {
            label: {
                "seen": counts["seen"],
                "accountAccuracy": counts["account"] / counts["seen"],
                "bothAccuracy": counts["both"] / counts["seen"],
            }
            for label, counts in sorted(per_label.items())
        },
        "topConfusions": dict(
            sorted(confusions.items(), key=lambda item: -item[1])[:15]
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, help="train.jsonl")
    parser.add_argument("--validation", required=True, help="validation.jsonl")
    parser.add_argument("--base-model", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--eval-sample", type=int, default=100)
    parser.add_argument(
        "--load-4bit",
        action="store_true",
        help="Quantise the base model to 4 bits (QLoRA). Needed for a model that does not "
        "otherwise fit alongside everything else on the card; unnecessary below about 2B.",
    )
    args = parser.parse_args()

    if not torch.cuda.is_available():
        # Failing loudly beats spending an hour training on the CPU and
        # reporting it as a successful run.
        print("CUDA is not available. Refusing to train on the CPU.", file=sys.stderr)
        return 2

    output = pathlib.Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)

    train_rows = read_jsonl(pathlib.Path(args.dataset))
    validation_rows = read_jsonl(pathlib.Path(args.validation))
    print(f"train {len(train_rows)} | validation {len(validation_rows)} | base {args.base_model}")

    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    quantization = None
    if args.load_4bit:
        from transformers import BitsAndBytesConfig

        quantization = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        dtype=torch.bfloat16,
        device_map={"": 0},
        quantization_config=quantization,
    )
    model.config.use_cache = False

    # LoRA rather than a full fine-tune: only the adapter matrices train, which
    # is what keeps this inside 8 GB alongside everything else on the card.
    model = get_peft_model(
        model,
        LoraConfig(
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        ),
    )
    model.print_trainable_parameters()

    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=str(output / "checkpoints"),
            num_train_epochs=args.epochs,
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=args.grad_accum,
            learning_rate=args.learning_rate,
            bf16=True,
            logging_steps=10,
            eval_strategy="epoch",
            save_strategy="epoch",
            save_total_limit=1,
            load_best_model_at_end=True,
            metric_for_best_model="eval_loss",
            greater_is_better=False,
            report_to=[],
            gradient_checkpointing=True,
        ),
        train_dataset=build_examples(train_rows, tokenizer, args.max_length),
        eval_dataset=build_examples(validation_rows, tokenizer, args.max_length),
        # Early stopping runs on the synthetic validation slice. Real data never
        # drives a training decision.
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
        data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100),
    )

    trainer.train()

    print("merging the adapter into the base model")
    merged = model.merge_and_unload()
    merged.config.use_cache = True
    merged_dir = output / "merged"
    merged.save_pretrained(merged_dir, safe_serialization=True)
    tokenizer.save_pretrained(merged_dir)

    metrics = exact_match(merged, tokenizer, validation_rows, args.eval_sample)
    metrics["baseModel"] = args.base_model
    metrics["quantised4bit"] = bool(args.load_4bit)
    metrics["trainExamples"] = len(train_rows)
    metrics["mergedDir"] = str(merged_dir)

    (output / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
