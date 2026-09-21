"""The chat format, written once.

The API builds the same message when it asks the served model, so training and
serving cannot drift apart. If this changes, `llm.predictor.ts` changes with it.
"""

import json


def user_message(text: str, amount_ore: int) -> str:
    direction = "ut" if amount_ore < 0 else "in"
    amount = f"{abs(amount_ore) / 100:.2f}"
    return f"Text: {text}\nBelopp: {amount} SEK\nRiktning: {direction}"


def assistant_message(account: str, vat: str) -> str:
    # Compact and key-ordered, so the account number is always the first tokens
    # the model produces and its log-probabilities are the confidence signal.
    return json.dumps({"account": account, "vat": vat}, ensure_ascii=False)
