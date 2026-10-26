# OpenAI Codex for Open Source — Project Evidence Draft

Prepared on 2026-10-26. This document is an evidence-based draft, not a submitted application or a claim of acceptance. The owner approved MIT + Public on 2026-10-26, including the listed project-owned code, six runtime icons, and synthetic-content screenshot. Publishing identity `fu379410-cell` and ADMIN access to the public repository were verified through GitHub CLI on 2026-10-26. Repository: [Mist Notes](https://github.com/fu379410-cell/mist-notes). See [Actions](https://github.com/fu379410-cell/mist-notes/actions) for actual remote checks.

## 1. Project Overview

**Mist Notes (雾笺)** is a local-first desktop sticky-note application built with Electron, TypeScript, React, and Tiptap. It combines independently resizable note windows, precise rich-text font controls, 240 curated gradient palettes, slow full-window color transitions, and optional one-click AI organization. The current local version is `2.1.0-beta.6`.

The intended audience is individual desktop users who need small, readable spaces for temporary thoughts and working drafts. Linux source checks are configured, but release targets are macOS and Windows. The verified public repository is [https://github.com/fu379410-cell/mist-notes](https://github.com/fu379410-cell/mist-notes), under the MIT license.

## 2. Problem & Solution

Short notes often need readable typography and lightweight organization without adopting a large knowledge-management system or requiring a cloud account. Mist Notes stores versioned JSON on the user's computer, preserves window geometry, and lets each note have its own visual settings. AI is optional: only an explicit action sends the current note to DeepSeek, while everyday editing and automated tests require no AI credentials.

## 3. Technical Highlights

- A typed Electron bridge with main-frame/source validation separates the sandboxed editor from filesystem and provider access.
- Tiptap history treats a completed font drag or AI title/body replacement as one reversible transaction. Stale or cancelled AI results are discarded.
- Gradient readability checks cover arbitrary sRGB mixtures of original nodes, with a uniform reading layer when needed. The project does not claim this mathematical technique as an invention.
- Shared compositor timelines cycle complete linear gradients without localized light spots or animation resets during typing, respecting reduced-motion preferences.
- Versioned local documents, validation, atomic replacement, previous-valid-state storage, migration, and import snapshots protect routine data workflows.
- OS-encrypted credentials remain separate from notebook data and exports. Provider errors are mapped to safe messages.

## 4. Open Source Contribution

Current tangible work includes application source, regression tests, pinned dependencies, third-party notices, build scripts, a privacy-focused source-selection process, and proposed cross-platform CI and draft-release workflows. The exact local verification results are recorded in [VERIFICATION.md](VERIFICATION.md).

**Approved:** MIT licensing and publication of the reviewed project-owned source and runtime assets. **Not yet established:** public release history, externally merged pull requests, downstream reuse, or independently confirmed ecosystem adoption. No stars, downloads, user counts, or contributor counts are asserted.

## 5. Maintainer Role

The project owner has defined product behavior, prioritized iteration, reviewed the local client, and retained custody of the source and release artifacts. Implementation and testing have been AI-assisted. The eventual applicant should describe their own actual maintenance decisions and contributions, without claiming every generated line as manually authored.

The publishing account `fu379410-cell` was verified as a repository administrator through GitHub CLI. Before applying, the applicant should confirm the current permissions, MIT notice and their actual continuing responsibility. No employment affiliation or broader ecosystem leadership is asserted.

## 6. Community Impact

The application has local development and private desktop-use evidence, including prior synthetic-note AI tests. There is currently no verified public usage dataset, independent community feedback, external contribution history, or public issue-resolution record. Private notes and API keys are excluded from application evidence.

A useful future evidence set would include voluntary public bug reports, reproducible device tests, documented fixes, real releases, and attribution to actual contributors. The project should not manufacture activity, testimonials, usage numbers, or repository history for eligibility.

## 7. Future Roadmap

1. Maintain the owner-approved MIT source and runtime-asset scope, preserving third-party notices and real release evidence.
2. Run the configured CI remotely and establish real Windows/Intel Mac acceptance evidence.
3. Address the native-menu save-queue boundary and measure large-notebook persistence behavior.
4. Add checklists, search/categories, and recovery/history based on real issue feedback.
5. Evaluate reminders, images, or sync only after specifying data migration and privacy requirements.

## 8. How Codex Helps

Codex can help maintain focused regression tests for editor history, import validation, credential races, and gradient continuity; reproduce platform-specific issues from synthetic examples; review IPC changes; keep documentation and dependency notices aligned; and prepare reviewable release candidates. Human maintainers remain responsible for authorization, code and asset rights, product decisions, public claims, and release approval.

## Eligibility and present gaps

The [official Program Terms](https://learn.chatgpt.com/docs/codex-for-oss-terms), fetched on 2026-10-26, require accurate and complete account, repository, and maintainer information. OpenAI may consider repository usage, ecosystem importance, active maintenance, role/permissions, and program capacity, and may ask for verification. The terms reviewed here do not establish a guaranteed star or download threshold. Application does not guarantee selection or any benefit.

| Evidence area | Present status | Practical next step |
| --- | --- | --- |
| Open license and asset rights | Owner approved MIT and the reviewed public scope on 2026-10-26 | Preserve the root MIT notice and third-party rights; keep unverified font outlines excluded |
| Public repository/control | Public [https://github.com/fu379410-cell/mist-notes](https://github.com/fu379410-cell/mist-notes); publishing account verified with ADMIN access | Keep source/default-branch and actual CI evidence current |
| Active maintenance | Local iteration exists; public history absent | Publish truthful commits and track subsequent fixes; do not backdate history |
| Technical quality | Local tests/build and source review available | Publish evidence, then let actual CI and device tests establish their results |
| Usage/ecosystem importance | No verified public evidence | Gather voluntary real feedback and downstream use over time |
| Applicant information | Must be supplied/verified by the applicant | Confirm valid ChatGPT account, actual maintainer responsibilities and repository permissions |

For the first week, prioritize verified source publication, license-notice checks and actual CI results. Over the following weeks, resolve reproducible issues and collect actual platform feedback. Submit only after the public repository and maintainer evidence are complete enough to support the claims; the program terms and application form should be rechecked at that time.
