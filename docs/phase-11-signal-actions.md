# Phase 11.5: Signal-to-action shortcuts

PA Nostromo now turns the signals already shown on the dashboard into a
project-attached action without adding another provider or a workflow engine.

## Available shortcuts

| Existing surface | Focused action |
| --- | --- |
| Unread Email | Create task |
| RSS story | Create task or note |
| eBay traffic listing | Create task |
| Social audience anomaly | Create reminder |

Every shortcut opens the same small project picker. Creating the action keeps a
source reference with only four fields: `type`, `externalId`, `title`, and a
safe `https`/`http` URL when one is appropriate. The source label remains
visible on created tasks, notes, and reminders.

## Privacy boundary

Email-generated actions keep the subject/title and an internal message
identifier only. They do not copy a message body, preview, sender details, or
mailbox URL. RSS, eBay, and social references keep only their already-visible
title and approved public link.

Social creates a reminder when an audience signal is stale, reports an error,
or shows a negative recorded change. This is a focused prompt to review a
signal—not an automated posting or workflow rule.

## Verification

Automated coverage validates source-reference normalization, blocks unsafe URLs
and email mailbox URLs, and exercises each of the four browser actions through
the project picker. The full fast suite, syntax/guardrail check, typecheck,
accessibility smoke, and dashboard smoke are run before committing.
