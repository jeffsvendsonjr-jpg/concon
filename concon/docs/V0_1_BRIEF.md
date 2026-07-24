# ConCon v0.1 brief

## Hypothesis

A long AI conversation can automatically organize itself into a useful, visible, chronological living outline that updates as the conversation evolves and lets the user immediately navigate back to the underlying conversation.

## First success criteria

On one long ChatGPT conversation, show a sidebar roughly like:

- ShieldVault traction
- Safe Paste
- AI aftermarket
- ConCon
  - Congruence
  - Receipts
  - Forks
  - Living outline
- You are here

Clicking a topic jumps to its source conversation.

Searching a literal phrase locates matching messages/topics.

## Architecture review required before coding

Return:
1. proposed file structure,
2. technical architecture,
3. how ChatGPT messages will be observed and uniquely tracked,
4. how topic boundaries could be detected in v0.1,
5. what can be deterministic/local vs. what needs model intelligence,
6. privacy risks,
7. smallest implementation sequence,
8. assumptions.

Do not write significant code until this review is complete.
