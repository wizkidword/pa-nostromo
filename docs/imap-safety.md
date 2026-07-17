# IMAP safety contract

The unread-email IMAP adapter keeps a single connection for a mailbox snapshot, discovers server capabilities after login, rejects control characters in protocol arguments, and bounds command responses, headers, message bodies, and batch size.

Message bodies are fetched in two stages: `BODYSTRUCTURE` first, then only a selected text part capped at 64 KiB. Attachment names may be returned as metadata; attachment bodies are never fetched. The UI labels a truncated body and retains failed items in a bulk selection for a safe retry.

## Move semantics

The adapter never sends ordinary `EXPUNGE`. Its fake-IMAP safety suite records these capability-specific transcripts:

| Server capabilities | Transcript after `LOGIN` and `CAPABILITY` | Result |
| --- | --- | --- |
| `MOVE UIDPLUS` | `SELECT "INBOX"` -> `UID MOVE 42 "Trash"` | moved |
| `MOVE` | `SELECT "INBOX"` -> `UID MOVE 42 "Trash"` | moved; no expunge needed |
| `UIDPLUS` | `SELECT "INBOX"` -> identity check -> `UID COPY 42 "Trash"` -> `UID STORE 42 +FLAGS.SILENT (\Deleted)` -> `UID EXPUNGE 42` | copied, source marked deleted, UID-only expunge |
| neither | `SELECT "INBOX"` -> identity check -> `UID COPY 42 "Trash"` -> `UID STORE 42 +FLAGS.SILENT (\Deleted)` | copied, source marked deleted, final expunge deferred |

The fallback performs a target `MESSAGE-ID` lookup before copying. If a previous attempt copied successfully but failed before the source flag update, a retry records the target as already complete and resumes from the source-flag step instead of creating a duplicate.

`tests/email-imap-safety.test.mjs` verifies these transcripts plus CR/LF rejection, disconnect/partial-batch outcomes, malformed replies, and oversized-body truncation.
