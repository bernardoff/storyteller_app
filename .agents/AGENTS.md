# Code Modification Rules

## Commit on Substantial Changes
- **Core Instruction:** For any medium or large code changes (e.g., creating new features, refactoring, modifying logic, etc. - anything larger than minor typo fixes or trivial tweaks), the agent MUST ALWAYS trigger a github commit after the changes are fully implemented and verified.
- **Workflow:**
  1. Complete the implementation and test/verify it.
  2. Use the local git repository to stage the changed files (`git add <files>`).
  3. Create a clear and descriptive commit message explaining what was changed and why (`git commit -m "..."`).
  4. This ensures that the user can improve versioning and easily rollback individual changes if needed.
