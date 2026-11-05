# Co-Create v2: gap list against n8n, Dify, Flowise, Langflow and Cohere North

Researched 2026-11-05 from official docs and release notes (n8n 3.0, Dify 1.16, Flowise 3.1 (sunset Aug 2026), Langflow 1.13, North 2). Only features that matter for a demo of an agent and workflow builder are listed. "Build" = done in this pass, "Later" = deliberately left out.

## Workflow building

| # | Gap in Co-Create (before) | Who has it | Decision |
|---|---|---|---|
| 1 | No variables or data mapping; every step only sees "everything so far" | n8n `{{ $json }}`, Dify `{{var}}` + `/` picker, Flowise Flow State | **Build**: every step output becomes `{{key}}`; steps can take an input template; variable picker in the inspector; `{{a.b.0}}` paths into JSON |
| 2 | No loops | Dify Iteration/Loop, n8n Loop Over Items, Flowise Iteration, Langflow Loop | **Build**: "Repeat for each" step with Each/Done branches, items from a variable or extracted from the last result, results collected as a variable |
| 3 | No parallel branches | Dify parallel branches + Variable Aggregator, n8n Merge, Flowise multi-edge | **Build**: "Split" step runs every outgoing branch at once and joins at the first shared step |
| 4 | Conditions only by model judgement | Dify If-Else, Flowise Condition, Langflow If-Else | **Build**: rule mode (contains, equals, empty, >, <, regex) next to plain-language mode |
| 5 | No code or HTTP step | All four | **Build**: "Run code" (JS sandbox with variables) and "Call an API" (any method, headers, body, templates) |
| 6 | Triggers: manual and schedule only | n8n Webhook/Form/Email/Chat triggers, Dify Webhook/Schedule/Plugin triggers, North API trigger | **Build**: "By link" (a URL that starts the run when opened), "When a page changes" (polls a page), "When a document is added". **Later**: inbound webhook and email need a server, which this build does not have |
| 7 | Retries and timeout stored but never used; no on-error choice | n8n Retry On Fail + On Error, Dify Retry + Fail branch | **Build**: retries with back-off, timeout, "if it fails: stop or continue" |
| 8 | No re-run of a single step, no partial re-run | n8n Execute step, Dify single-node run + Variable Inspector | **Build**: "Try this step" in the inspector with the last run's variables; "Run again from here" on any finished run |
| 9 | No sub-workflows | n8n Execute Workflow, Dify workflow-as-tool, Flowise Execute Flow, Langflow Run Flow | **Build**: "Run a workflow" step; the child run is recorded under Runs |
| 10 | No connector catalogue | n8n 2,600 integrations, Dify Marketplace, North connectors | **Build**: catalogue of ready-made public API connectors added with one click (weather, exchange rates, countries, Wikipedia, GitHub, Hacker News, holidays, books, crypto prices, dictionary, postcodes) |
| 11 | Assistant is a two-line box in the left rail | Langflow Assistant pane, n8n AI Workflow Builder with plan cards, North Plan mode | **Build**: assistant panel with conversation, builds/extends/explains, proposes changes before applying |
| 12 | Run view is a vertical list in a narrow dock | n8n Executions, Dify Variable Inspector | **Build**: run drawer with timeline, lanes for loops and branches, variables tab |
| 13 | Version history and diff | n8n workflow history, Dify versions | **Later** |
| 14 | Structured output schema editor | n8n, Dify, Langflow | **Later** |

## Agent creation

| # | Gap | Who has it | Decision |
|---|---|---|---|
| 15 | No evaluations or test sets | n8n Evaluations, Flowise Evaluations, North evaluation tasks | **Build**: test set per agent (prompt + expectation), run all, model-judged pass/fail with reason, pass rate in readiness |
| 16 | Four-step wizard before anything exists | North "Otto" builds from a description, n8n Agent builder with preview, Dify Build mode | **Build**: brief-first Studio: describe, the assistant drafts the whole agent, review on one page, create |
| 17 | Memory across sessions, skills, MCP tools | North, n8n Agents, Dify | **Later** |

## Chat

| # | Gap | Who has it | Decision |
|---|---|---|---|
| 18 | One thread per agent, no history | North chat history grouped by date/agent, Dify conversation list | **Build**: threads (many per agent), search, rename, delete; switch agent per thread |
| 19 | No attachments | North "+" menu, Dify file upload | **Build**: attach text files to a message as context |
| 20 | No openers or follow-ups | Dify Conversation Opener + Follow-up | **Build**: sample prompts as openers; actions on answers (copy, save as document, turn into a workflow) |
| 21 | Voice, table/document modes, projects | North | **Later** |

## Home

| # | Gap | Who has it | Decision |
|---|---|---|---|
| 22 | Greeting plus lists; no sense of what needs attention or what happened | n8n Overview with Insights (7-day executions, failures, failure rate), North inbox notifications, Dify Monitoring | **Build**: Needs you (approvals, failures), Running now, 14-day activity and spend, workspace at a glance |

## Notifications

| # | Gap | Decision |
|---|---|---|
| 23 | A notification fires for every finished scheduled run and every decision | **Build**: notifications only for approvals, failed runs and schedule problems; explicit Notify steps still notify |
