import { describe, it, expect } from 'vitest'

/**
 * Lead Decision Eval — Scenario & Scorer Tests
 *
 * Validates that the eval framework correctly scores Lead responses
 * across both fault_detection and pipeline suites.
 * Does NOT call the LLM — tests the scoring logic against synthetic responses.
 */

// ── Inline scorer (matches lead-eval.ts logic) ──

interface Scenario {
  id: string
  name: string
  passSignals: string[]
  failSignals: string[]
}

type Grade = 'pass' | 'partial' | 'fail'

const scoreResponse = (scenario: Scenario, response: string): { grade: Grade; score: number } => {
  const lower = response.toLowerCase()
  const passHits = scenario.passSignals.filter(s => lower.includes(s.toLowerCase()))
  const hitFailSignal = scenario.failSignals.some(s => lower.includes(s.toLowerCase()))
  const flaggedIssue = passHits.length >= 2

  if (flaggedIssue && !hitFailSignal) return { grade: 'pass', score: 1 }
  if (flaggedIssue && hitFailSignal) return { grade: 'partial', score: 0.5 }
  return { grade: 'fail', score: 0 }
}

// ══════════════════════════════════════════════════
// Suite 1: Fault Detection Scenarios
// ══════════════════════════════════════════════════

describe('TC-1.1: Missing primary deliverable', () => {
  const scenario: Scenario = {
    id: 'tc-1.1',
    name: 'Missing primary deliverable',
    passSignals: ['DESIGN.md', 'missing', 'deliverable', 'not created', 'incomplete', 'retry', 'handoff'],
    failSignals: ['advance-workflow'],
  }

  it('scores pass when Lead detects missing DESIGN.md', () => {
    const response = `The design task output mentions utils.ts but DESIGN.md was not created.
    This is the primary deliverable and is missing. I'll use handoff.sh to re-dispatch the design task.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores partial when Lead notices but still advances', () => {
    const response = `I notice the output only mentions utils.ts and DESIGN.md seems to be missing,
    but let me advance-workflow to keep things moving.`
    expect(scoreResponse(scenario, response).grade).toBe('partial')
  })

  it('scores fail when Lead blindly advances', () => {
    const response = `Design task completed successfully. Running advance-workflow.sh 'wf-eval-tc-1.1' to start the implement task.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-1.2: Empty/vacuous deliverable', () => {
  const scenario: Scenario = {
    id: 'tc-1.2',
    name: 'Empty deliverable',
    passSignals: ['suspicious', 'too few', 'shallow', 'only 2', 'low cost', 'insufficient',
      'thorough', 're-review', 'retry', 'too quick', 'breaking', 'handoff',
      'concern', 'unexpected', 'unlikely', 'question'],
    failSignals: [],
  }

  it('scores pass when Lead questions shallow review', () => {
    const response = `This review looks suspicious — only 2/3 tools used and $0.008 cost
    for a 12-file breaking auth refactor. This seems too shallow. I'll retry with a more thorough review.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead accepts vacuous review', () => {
    const response = `Both tasks completed. The review found no issues. Workflow is done.
    Great work on the auth refactor!`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-1.3: Partial completion', () => {
  const scenario: Scenario = {
    id: 'tc-1.3',
    name: 'Partial completion',
    passSignals: ['email verification', 'password change', 'missing', 'only 3', '3 of 5',
      'incomplete', 'remaining', 'not implemented', '2 features', 'partial'],
    failSignals: ['advance-workflow'],
  }

  it('scores pass when Lead catches missing features', () => {
    const response = `The implement task summary mentions only 3 of 5 features (user profile, settings, avatar).
    Email verification and password change are missing. I'll handoff to complete the remaining 2 features before review.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead advances without noticing gap', () => {
    const response = `Implementation complete. Let me advance-workflow to start the code review.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-2.1: Boundary violation (design writes code)', () => {
  const scenario: Scenario = {
    id: 'tc-2.1',
    name: 'Design writes code',
    passSignals: ['boundary', 'violation', 'should not', 'only DESIGN.md', '.tsx', '.ts', '.css',
      'implementation', 'code files', 'overlap', 'conflict', 'downstream',
      'overstepped', 'scope', 'not supposed to'],
    failSignals: ['advance-workflow'],
  }

  it('scores pass when Lead detects boundary violation', () => {
    const response = `The design task created .tsx and .ts files which is a boundary violation —
    the designer should not produce implementation code. This will overlap with the downstream implement task.
    I'll handoff to clean this up.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead ignores code files from designer', () => {
    const response = `Design task done with DESIGN.md and starter files. advance-workflow.sh to continue.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-2.2: Boundary violation (reviewer edits source)', () => {
  const scenario: Scenario = {
    id: 'tc-2.2',
    name: 'Reviewer edits source',
    passSignals: ['fixed', 'patched', 'modified', 'source', 'should not', 'boundary',
      'only review.md', 'scope', 'not supposed to', 'violation', 'overstepped',
      'directly', 'changed code'],
    failSignals: [],
  }

  it('scores pass when Lead flags reviewer modifying source', () => {
    const response = `The reviewer patched source files directly — this violates the boundary.
    Reviewers should not modify source code. The fixes need to be verified by the implementer.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead sees "fixed" as positive', () => {
    const response = `Review completed and the reviewer proactively resolved 3 issues. Workflow done!`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-3.1: Parallel file write conflict', () => {
  const scenario: Scenario = {
    id: 'tc-3.1',
    name: 'File write conflict',
    passSignals: ['Header.tsx', 'both', 'same file', 'conflict', 'overwrite', 'overlap',
      'merge', 'collision', 'git diff', 'check', 'verify'],
    failSignals: ['advance-workflow'],
  }

  it('scores pass when Lead detects overlapping file modifications', () => {
    const response = `Both feature-a and feature-b modified Header.tsx. This is a potential conflict —
    the second writer may have overwritten the first's changes. Let me check with git diff before advancing.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores partial when Lead notices overlap but advances anyway', () => {
    const response = `I see both tasks touched Header.tsx. There could be a conflict.
    Let me advance-workflow.sh to the integrate task which should verify both features work.`
    expect(scoreResponse(scenario, response).grade).toBe('partial')
  })

  it('scores fail when Lead misses the overlap entirely', () => {
    const response = `Both features completed. Running advance-workflow.sh to start integration.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-3.2: Semantic conflict (REST vs GraphQL)', () => {
  const scenario: Scenario = {
    id: 'tc-3.2',
    name: 'Semantic conflict',
    passSignals: ['GraphQL', 'REST', 'mismatch', 'conflict', 'inconsistent', 'contradiction',
      'different approach', "doesn't match", 'diverge', 'aligned'],
    failSignals: ['advance-workflow'],
  }

  it('scores pass when Lead detects REST vs GraphQL mismatch', () => {
    const response = `There's a conflict — the architect decided on GraphQL but the backend implemented REST endpoints.
    The frontend task depends on the API design, so we need to resolve this mismatch first.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead misses the architectural contradiction', () => {
    const response = `API design and backend both done. advance-workflow.sh to start frontend.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

// ══════════════════════════════════════════════════
// Suite 2: Pipeline Scenarios
// ══════════════════════════════════════════════════

// ── Stage 1: Task Intake ──

describe('TC-4.1: Simple task → single handoff', () => {
  const scenario: Scenario = {
    id: 'tc-4.1',
    name: 'Simple task single handoff',
    passSignals: ['handoff', 'fullstack', 'single', 'direct', 'simple',
      'one agent', 'no need', 'overkill', 'straightforward'],
    failSignals: ['create-workflow', 'DAG', 'workflow', 'design', 'review', 'multiple agents'],
  }

  it('scores pass when Lead chooses handoff for typo fix', () => {
    const response = `This is a simple typo fix — a single handoff to fullstack-engineer is all that's needed.
    No need for a multi-agent setup. Straightforward one-line change.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead creates DAG for a typo', () => {
    const response = `I'll create a workflow DAG for this: first a design review, then implementation.
    Using create-workflow.sh with multiple agents.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })

  it('scores partial when Lead picks handoff but also mentions DAG', () => {
    const response = `This is a simple task — a direct handoff to fullstack-engineer.
    I considered a DAG with create-workflow but that's overkill for a typo.`
    expect(scoreResponse(scenario, response).grade).toBe('partial')
  })
})

describe('TC-4.2: Cross-domain task → DAG', () => {
  const scenario: Scenario = {
    id: 'tc-4.2',
    name: 'Cross-domain DAG',
    passSignals: ['DAG', 'workflow', 'create-workflow', 'pipeline', 'multiple',
      'design', 'implement', 'review',
      'ui-designer', 'fullstack', 'code-reviewer',
      'depends', 'sequence', 'after', 'then'],
    failSignals: ['handoff.sh', 'single agent', 'one agent'],
  }

  it('scores pass when Lead creates proper multi-agent DAG', () => {
    const response = `This requires a DAG with three tasks:
    1. design (ui-designer): create DESIGN.md with visual hierarchy
    2. implement (fullstack-engineer): implement the React changes, depends on design
    3. review (code-reviewer): review the implementation, depends on implement
    Using create-workflow.sh to set this up.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead uses single handoff for multi-domain work', () => {
    const response = `I'll handoff.sh this to fullstack-engineer — one agent can handle everything end-to-end.
    Single agent is sufficient for this work.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-4.3: Large scope → fan-out review', () => {
  const scenario: Scenario = {
    id: 'tc-4.3',
    name: 'Fan-out review',
    passSignals: ['parallel', 'fan-out', 'split', 'multiple review', 'by area',
      'server', 'web', 'frontend', 'backend',
      'review-server', 'review-frontend', 'review-web', 'separate'],
    failSignals: ['single review', 'one task', 'handoff.sh'],
  }

  it('scores pass when Lead splits review by area', () => {
    const response = `With 22 files across multiple areas, I'll fan-out into parallel review tasks:
    - review-server: server/auth/, server/stores/, server/routes/ (code-reviewer)
    - review-frontend: web/components/, web/hooks/ (code-reviewer)
    Each review runs in parallel, split by area for focused attention.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead assigns single review', () => {
    const response = `I'll handoff.sh this to code-reviewer for a single review of all 22 files.
    One task should be sufficient.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

// ── Stage 2: DAG Construction Quality ──

describe('TC-5.1: Missing critical dependency in DAG', () => {
  const scenario: Scenario = {
    id: 'tc-5.1',
    name: 'Missing dependency',
    passSignals: ['dependency', 'missing', 'depends', 'design before', 'order',
      'implement should wait', 'depends on design', 'dependsOn',
      'parallel', 'no dependency', 'DESIGN.md', 'before implement'],
    failSignals: ['looks correct', 'no issues', 'submit as-is', 'good to go'],
  }

  it('scores pass when Lead detects missing dependency', () => {
    const response = `The implement task has no dependency on design — but it needs DESIGN.md which
    the design task produces. The dependency is missing: implement should depend on design.
    I'll fix the dependsOn before submitting.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead approves broken DAG', () => {
    const response = `This DAG looks correct. All tasks have proper descriptions and agent assignments.
    No issues found — good to go, I'll submit as-is.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-5.2: Wrong agent assigned to task', () => {
  const scenario: Scenario = {
    id: 'tc-5.2',
    name: 'Wrong agent',
    passSignals: ['wrong agent', 'mismatch', 'code-reviewer', 'should be', 'not ui-designer',
      'ui-designer cannot', 'role', 'reassign', 'incorrect', 'code review',
      'reviewer', 'wrong', 'misassigned'],
    failSignals: ['looks correct', 'no issues', 'submit as-is', 'good to go'],
  }

  it('scores pass when Lead catches agent mismatch', () => {
    const response = `The review task is assigned to ui-designer but the description says "Review implementation
    code for correctness, performance, and security." This is a code review — it should be assigned to
    code-reviewer, not ui-designer. Wrong agent for this task, I'll reassign before submitting.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead misses agent mismatch', () => {
    const response = `DAG looks correct. Each task has an agent and description. No issues found.
    Good to go — submitting as-is.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

// ── Stage 4: Rejection Quality ──

describe('TC-6.1: Rejection feedback must be specific', () => {
  const scenario: Scenario = {
    id: 'tc-6.1',
    name: 'Specific rejection',
    passSignals: ['reject', 'specific', 'files', 'each', 'auth', 'breaking', 'security',
      'migration', 'backward', 'all 15', 'list', 'check', 'session',
      'middleware', 'token', 'thorough', 'insufficient'],
    failSignals: ['try harder', 'be more thorough', 'do better', 'review more carefully', 'advance-workflow'],
  }

  it('scores pass when Lead gives specific rejection feedback', () => {
    const response = `Rejecting this review. The auth refactor touches 15 files with breaking changes,
    session token migration, and new middleware. The reviewer must check each file for security issues,
    particularly auth.ts and session.ts. Backward compatibility and migration path must be verified.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead gives vague feedback', () => {
    const response = `The output is not good enough. I will try harder to push for improvements.
    Do better on the next round and review more carefully please.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })

  it('scores fail when Lead accepts rubber-stamp review', () => {
    const response = `Review says LGTM. Looks good, let me advance-workflow to complete.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-6.2: Rejection cap reached → escalate', () => {
  const scenario: Scenario = {
    id: 'tc-6.2',
    name: 'Rejection cap escalation',
    passSignals: ['escalate', 'user', 'open_question', 'cap', 'maximum', 'cannot reject',
      '2 times', 'user input', 'war-room', 'advance', 'accept',
      'reached', 'limit', 'no more rejections'],
    failSignals: ['reject-task'],
  }

  it('scores pass when Lead escalates at rejection cap', () => {
    const response = `The task has been rejected 2 times already — the maximum. Despite improvement
    (coverage went from 3 to 11 files), it's still not complete. I cannot reject again.
    I'll escalate to the user via open_question to ask how to proceed.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores pass when Lead decides to accept and move on', () => {
    const response = `The rejection cap has been reached after 2 rejections. The review has improved
    significantly — 11 of 15 files covered with 3 findings. I'll accept and advance the workflow.
    The user can do a final check if needed.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead tries to reject again', () => {
    const response = `Still not good enough — only 11 of 15 files. I'll reject-task again
    with feedback to cover all remaining files.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

// ── Stage 5: Escalation Judgment ──

describe('TC-7.1: Ambiguous requirement → clarify', () => {
  const scenario: Scenario = {
    id: 'tc-7.1',
    name: 'Ambiguous escalation',
    passSignals: ['clarify', 'what specifically', 'scope', 'which aspects', 'open_question',
      'user', 'define', 'ambiguous', 'vague', 'unclear', 'more detail',
      'what do you mean', 'ask', 'specify'],
    failSignals: ['handoff', 'create-workflow', 'dispatch'],
  }

  it('scores pass when Lead asks for clarification', () => {
    const response = `"Make the dashboard better" is too vague. I need to clarify
    with the user — which aspects? Performance? Visual polish? New features?
    I'll open_question to ask what specifically needs improvement.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead dispatches blindly', () => {
    const response = `I'll handoff this to ui-designer to improve the dashboard visuals.
    The designer can decide what "better" means and dispatch accordingly.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

describe('TC-7.2: Conflicting instructions → escalate', () => {
  const scenario: Scenario = {
    id: 'tc-7.2',
    name: 'Conflicting escalation',
    passSignals: ['conflict', 'contradiction', 'GraphQL', 'REST', 'mismatch',
      'clarify', 'which', 'escalate', 'open_question', 'inconsistent',
      'user', 'ask', 'resolve', 'decide'],
    failSignals: ['handoff', 'create-workflow', 'dispatch', 'advance'],
  }

  it('scores pass when Lead flags the contradiction', () => {
    const response = `There's a direct conflict: the architect decided on GraphQL but the user's
    project brief says REST only. These are inconsistent instructions.
    I need to escalate via open_question to ask the user which approach to use.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead picks one side without escalating', () => {
    const response = `I'll go with the architect's recommendation. Handoff to fullstack-engineer
    to implement GraphQL data fetching. The architect is the domain expert.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

// ── Stage 6: Workflow Completion ──

describe('TC-8.1: Clean completion summary', () => {
  const scenario: Scenario = {
    id: 'tc-8.1',
    name: 'Clean summary',
    passSignals: ['completed', 'summary', 'design', 'implement', 'review', 'settings page',
      'all tasks', 'workflow complete', 'accomplished', 'done', 'delivered',
      'DESIGN.md', '5 sections', 'minor issues'],
    failSignals: [],
  }

  it('scores pass when Lead produces comprehensive summary', () => {
    const response = `Workflow completed successfully. Summary:
    - Design: created DESIGN.md with component hierarchy and tokens for the settings page
    - Implement: all 5 sections delivered (profile, preferences, notifications, security, billing)
    - Review: 2 minor issues found (missing error boundary, unused import), no security concerns
    All tasks done, workflow complete.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })
})

describe('TC-8.2: Completion with rejection history', () => {
  const scenario: Scenario = {
    id: 'tc-8.2',
    name: 'Rejection summary',
    passSignals: ['rejected', 'retry', 'attempt', 'feedback', 'rejection', 'review rejected',
      'implement rejected', 'quality concern', 'required', 'cycle', 'friction',
      'eventually', 'after', 'improved'],
    failSignals: [],
  }

  it('scores pass when Lead flags rejection cycles', () => {
    const response = `Workflow completed with some friction:
    - Design: done on first attempt
    - Implement: required 1 rejection cycle — first attempt missed email verification, fixed after feedback
    - Review: rejected 2 times — initial attempts were shallow, eventually improved to cover all files
    All tasks eventually completed, but the review quality concern is worth noting for future workflows.`
    expect(scoreResponse(scenario, response).grade).toBe('pass')
  })

  it('scores fail when Lead ignores rejection history', () => {
    const response = `All tasks completed. The auth flow is now implemented and reviewed. Good work team.`
    expect(scoreResponse(scenario, response).grade).toBe('fail')
  })
})

// ══════════════════════════════════════════════════
// Scoring Edge Cases
// ══════════════════════════════════════════════════

describe('Scorer edge cases', () => {
  it('case-insensitive matching needs 2+ signals', () => {
    const s: Scenario = { id: 'test', name: 'test', passSignals: ['problem', 'issue'], failSignals: [] }
    expect(scoreResponse(s, 'I see a PROBLEM — this is an ISSUE').grade).toBe('pass')
  })

  it('empty response is a fail', () => {
    const s: Scenario = { id: 'test', name: 'test', passSignals: ['problem'], failSignals: [] }
    expect(scoreResponse(s, '').grade).toBe('fail')
  })

  it('single pass signal is insufficient (need 2+)', () => {
    const s: Scenario = { id: 'test', name: 'test', passSignals: ['problem'], failSignals: [] }
    expect(scoreResponse(s, 'There might be a problem').grade).toBe('fail')
  })

  it('fail signal blocks even with many pass hits', () => {
    const s: Scenario = { id: 'test', name: 'test', passSignals: ['a', 'b', 'c'], failSignals: ['bad'] }
    expect(scoreResponse(s, 'a b c but also bad').grade).toBe('partial')
  })

  it('fail signal alone without pass hits is still fail', () => {
    const s: Scenario = { id: 'test', name: 'test', passSignals: ['alpha', 'bravo'], failSignals: ['terrible'] }
    expect(scoreResponse(s, 'everything is terrible').grade).toBe('fail')
  })

  it('no fail signals defined means any pass is clean', () => {
    const s: Scenario = { id: 'test', name: 'test', passSignals: ['x', 'y'], failSignals: [] }
    expect(scoreResponse(s, 'x and y detected').grade).toBe('pass')
  })
})
