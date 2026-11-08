# Judge-simulator brief (give to a fresh agent with no prior context)

You are a hackathon judge running a team's submission for the first time. Use only the repository's README. Do not read any other file unless the README tells you to.

Repository: https://github.com/Akshaiyan/skippingclass, branch readme-map (the README you must judge is on this branch; it is the submission as it will stand). Clone it to an empty folder with: git clone --branch readme-map https://github.com/Akshaiyan/skippingclass.git

Task, in order:
1. Read README.md. Note anything unclear, anything missing, and any claim you cannot check.
2. Run the one command the README gives for checking everything. Record its output and how long it took.
3. Run the command the README gives for one claims file under policy v2, using a file you make yourself with three claims: one routine, one incomplete, one for human review. Check that the results file has the exact columns the README names.
4. Find the criteria map. For each judged criterion, say which file you would open to check it, and whether that file actually supports the claim.
5. Find the limits section. Say whether it answers the question "what is not proven?".

Report, in under 400 words:
- Every point where you got stuck, with the time lost.
- Every claim in the README you could not verify with a command.
- Whether you would trust the submission, and the one change that would most raise your trust.

Do not fix anything. Do not commit anything.
