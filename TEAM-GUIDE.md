# Beinex Co-Create: team guide

Co-Create is our pilot platform for building AI agents and the workflows that use them. Agents can search the web, read pages, run calculations and code, and use your documents. Anything that leaves the platform, such as an email or an approval, always waits for a person.

---

## 1. Getting in

**URL:** https://beinex-co-create.happyflower-19a0f2b7.uaenorth.azurecontainerapps.io

| | |
|---|---|
| Email | `demo@beinex.com` |
| Password | `cocreate` |

The demo account is an admin. Once you're in, create your own user under **Settings › Users** and use that from then on.

> **Important: your workspace lives in your browser.** Agents, workflows, runs, documents and users are saved in the browser you use, not on a server. Another person (or another browser on your machine) starts with an empty workspace. To hand work to a colleague, use **Settings › Export** and they use **Import**. Clearing your browser data deletes your workspace, so export anything you want to keep.

Sessions sign out after 8 hours without activity. Five wrong passwords lock sign-in for 30 seconds.

---

## 2. Your first 15 minutes

1. **Ask something.** On **Home**, type a question in the one-line box. It opens **Chat**.
2. **Build an agent.** Go to **Agents › New**, describe what you want in a sentence ("an agent that researches a company and writes a one-page brief") and let the assistant draft it. Review the abilities and instructions, then **Create**.
3. **Test it.** On the agent page, use **Test drive**, then the **Tests** tab. A test is a prompt plus what a good answer must do; a model grades each answer pass/fail with a reason. "Write tests for me" drafts some for you.
4. **Put it in a workflow.** Go to **Workflows › New** and pick **Agent with approval**. Choose your agent in the Agent step, assign yourself as approver, then **Run**.
5. **Approve it.** The run pauses at the approval. Approve it from **Home** or **Runs › Approvals** and watch it finish in the run drawer.

---

## 3. Agent or workflow?

| | Agent | Workflow |
|---|---|---|
| What it is | A worker: instructions, a model, abilities, knowledge | A process: a fixed chain of steps on a canvas |
| Who decides the steps | The AI, as it goes | You, when you design it |
| How it starts | Someone chats with it, or a workflow reaches its step | A trigger (see below) |
| Use it when | A person asks and the AI works out how | Something should happen the same way every time, often with approvals |

**Only workflows have triggers.** A workflow can start:
- **By hand:** someone runs it, optionally with an input.
- **On a schedule:** for example every weekday at 08:00.
- **By link:** `/run/<workflow id>?input=…`.
- **When a page changes:** a URL is checked for changes.
- **When a document is added:** to a chosen Knowledge library.

Schedules, page watches and document triggers only fire **while someone has Co-Create open in a browser tab**. The **Web Monitor** agent template only runs on a schedule when you place it in a workflow with a schedule trigger (see the **Monitor and alert** workflow template).

---

## 4. What you can build

### Agent templates
| Template | Good for |
|---|---|
| Research Assistant | Web research and sourced briefs |
| Writing Assistant | Emails, memos and documents in our voice (uses Knowledge) |
| Data Analyst | Calculations and small scripts over pasted data |
| Support Agent | Answers only from Knowledge, escalates when unsure |
| Web Monitor | Reports what changed on a topic or page |

Or start blank, or describe it and let the assistant draft it.

**Abilities:** web search, deep research, read web page, calculator, run JavaScript (sandboxed: no network, 5-second limit), date and time, search knowledge, save document, draft email (needs approval), request approval (needs approval). You can also add your own HTTP APIs under **Tools**, or use the connector catalogue (weather, exchange rates, Wikipedia, public holidays, GitHub and more).

**Autonomy (1–3)** controls how freely an agent acts. Agents with approval-gated abilities are capped at 2.

### Workflow templates
- **Research and draft:** research, draft, a person reviews, saved to Knowledge.
- **Monitor and alert:** a daily check that notifies only when something changed.
- **Compare in parallel:** three angles researched at once, then combined.
- **Process a list:** handle each item in a list, then summarise in a table.
- **Agent with approval:** an agent does the work, then a person signs off.
- **Blank:** start from an empty canvas.

**Workflow steps:** Start, Agent, Approval, Action, Notify, Condition (plain language or a rule), Repeat for each, Split (parallel branches), Run a workflow, Run code, Call an API, Wait, Set, Extract and Route.

Each step saves its result as a variable you can use later as `{{step_key}}`. Inside loops, `{{item}}`, `{{index}}` and `{{count}}` are available. The inspector has a variable picker so you don't have to type these.

Steps can retry, time out, and either stop or continue on failure. You can re-run a finished run from any step. The **Co-Create Assistant** panel in the builder can build, extend and explain a workflow for you.

Councils (several agents deciding together) appear under **Agents › Councils** and are still marked as coming soon.

---

## 5. Where things are

| Section | What's there |
|---|---|
| Home | Your inbox: approvals, failed and running runs, activity and spend |
| Chat | Conversations with agents; attach text files; save answers as documents or turn them into workflows |
| Agents | Build, test, version and duplicate agents; Councils tab |
| Workflows | The canvas builder and its run drawer |
| Tools | Built-in abilities, your own APIs, the connector catalogue |
| Knowledge | Libraries of documents agents can search (paste, upload text files or import a URL) |
| Runs | Every run with step outputs and cost; Approvals; Audit log |
| Models | Fast, Balanced and Reasoning profiles and per-agent model choice |
| Settings | Users and roles, governance (spend caps, pause all schedules), export, import, reset |

**Roles:** Builder, Approver, Security, Auditor, Admin.

---

## 6. Ground rules for the pilot

- **No client or confidential data** in prompts, Knowledge or uploads during the pilot. The URL is public and there is no Microsoft sign-in yet.
- **Do not share the URL or demo login outside Beinex.**
- **Treat exports as secrets.** They include any API keys you added to custom abilities.
- **Check what agents say.** Agents read the open web, and pages can contain misleading or manipulative text. Approvals exist for exactly this reason, so read before you approve.
- **Mind the spend.** Every model call costs money. Admins can set daily caps per user and for the workspace under **Settings › Governance**.
- **Report issues** to Mebin Joy with the screen, what you did and what you expected. A screenshot helps.

---

## 7. For developers

The full source is in this package. See **README.md** for the feature list.

**Run it locally**

```bash
npm install
cp .env.example .env    # put your own model key in VITE_OPENROUTER_API_KEY
npm run dev             # http://localhost:5173
```

Never commit `.env`, and never build a release with `VITE_OPENROUTER_API_KEY` set; it would ship inside the JavaScript.

**Release and hosting**
- **SECURITY.md:** how the release build keeps the model key on the server, the required security headers and the go-live checklist.
- **DEPLOY.md:** the Azure setup (registry `beinexailabs`, Container App `beinex-co-create` in `AI_Labs`, UAE North), the release, rollback and key-rotation commands, and the post-release checks.

**Known limits of this build**
- No shared database. Data is per browser.
- No Microsoft SSO yet.
- Schedules and watchers only run while a tab is open.
- Inbound webhooks and email triggers need a server and aren't included.

Next steps for a wider roll-out are Microsoft sign-in, a small backend with a shared database, and a server-side runner for schedules.
