# Co-Create v2: what changed and what was left out

Date: 2026-11-05. Base commit `b1a1fe3`. Research and concepts: `design/gap-list.md`, `design/v2-concepts.html`.

## Redesigned screens

- **Home** is an inbox and a pulse. One start line with an intent switch (Ask / Build an agent / Build a workflow) routes to Chat, Studio or the builder with the text carried over. "Needs you" lists approvals with inline Approve/Reject, failed runs with "Run again" from the failed step, and running runs with a live bar. "Last 14 days" shows run activity, failures, spend against the cap and a tabbed workspace list. First run shows a three-step setup card instead.
- **Chat** has threads: many per agent, grouped by day, searchable, renamable, deletable. The composer carries the agent pill (switch who answers), the thinking level and a file attach. Answers collect sources and offer Copy, Save as document and Turn into a workflow. Gated actions still queue under Approvals.
- **Studio** starts with a brief. Describe the agent, the Co-Create Assistant drafts name, description, icon, abilities, knowledge, thinking, independence, personality, instructions, sample prompts and three tests; everything is reviewed on one page with a live card and readiness ring; "Create" or "Create and run tests". Templates, import and "Build step by step" remain.
- **Workflow builder** is canvas-first: floating glass header and toolbar, a searchable palette (Steps, Abilities, Connectors, Flows), a floating inspector with a variable picker, "If it fails" and "Try this step", a run drawer with step lanes, a Variables tab and "Run again from here", and a docked 380px Co-Create Assistant that builds, extends, explains the last run and proposes changes as a plan you apply.

## Features added (all working against the real key, tested live)

- Variables and data mapping: every producing step stores `{{key}}`; input templates; `{{a.b.0}}` paths into JSON; loop variables; checks flag unknown variables.
- Repeat for each (loops) with Each/Done branches, items from a variable or extracted from the last result, results collected as a variable.
- Split (parallel branches) that run concurrently and join at the first shared step.
- Rule conditions (contains, equals, empty, greater/less than, regex) next to plain-language conditions.
- Run code (JavaScript sandbox over the variables) and Call an API (any method, headers, body, templates).
- Run a workflow as a step (child run recorded under Runs).
- Retries with back-off, timeouts, "if it fails: stop or continue".
- Re-run a finished run from any step (builder, Runs page, Home); try one step on its own with the last run's variables.
- Triggers: by link (`/run/<id>?input=…` while signed in), when a page changes (polled, hash-compared), when a document is added to a library.
- Agent tests: prompt plus expectation, real agent answer, model-judged pass/fail with reasons; "Write tests for me"; readiness counts them.
- Connector catalogue: twelve keyless public APIs added as abilities with one click, with Try buttons; usable by agents and as Action steps.
- Assistant panel with conversation, plan cards, approver resolution, insertion into existing chains, tolerant JSON parsing.
- Notifications only for approvals, failed runs and schedule problems; explicit Notify steps still notify. Removed: "scheduled run finished" and "approved/rejected" notifications.
- New templates: Compare in parallel, Process a list; Monitor and alert now uses a rule condition.

## Verified live

Parallel template (3 branches, join, variables), loop template (3 items, lanes, summary from collected results), approval pause and resume with a save-to-Knowledge step, re-run from the last step, assistant plan apply with insertion, Studio draft from a brief, three agent tests judged, connector Try calls, chat thread with answer actions, rule condition via Try this step. `tsc -b` and `vite build` are clean.

## Deliberately left out

- Inbound webhooks and email triggers: need a server to receive them; this build is browser-only. "By link" and "When a page changes" cover the demo cases.
- Workflow version history and diffs, structured-output schema editor, MCP tools, cross-session memory, voice, table/document modes, collaboration, environment secrets.
- Councils stay marked coming soon.
- Code splitting of the production bundle (one chunk over 500 kB; a warning, not an error).

## Known limits

- Approval steps cannot sit inside a Repeat or a Split (the checks say so).
- A workflow run as a step cannot pause for approval.
- Page watches and schedules fire only while the app is open in a browser.
- Connectors must allow browser requests; REST Countries was replaced by the World Bank API for that reason.
