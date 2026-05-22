## Tool Access Level
- Level: Read-Only / Static Analysis
- Execution Ring: Ring 2 (Development Workspace) 

## Allowed Tools
- Code Retrieval: ls, grep, cat, glob (full codebase read access).
- Architecture Skill: architecture-review (review model engine).
- Sensing Scripts: wb-snapshot.sh, wb-query.sh (war-room sync scripts).

## Forbidden Tools
- Write/Edit: sed, awk -i, write_file, replace_string (strictly forbidden).
- Deployment: kubectl, terraform apply, npm publish.

## Environment Constraints
- Workdir: Project root directory.
- Network: No external API access allowed, limited to local filesystem and war-room message channel.
