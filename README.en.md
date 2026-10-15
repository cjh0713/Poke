# Poké Discovery Room

A buildless HTML/CSS/JavaScript course project for beginners exploring Pokémon #001–151: a Chinese Pokédex, base-stat comparison, type experiments, favorites and teams of up to six members within a 3000-point budget.

The type lab sends one attack type from a small type sprite toward a selected Pokémon from the local catalog. Its one or two defensive types come directly from the target's data. Launching reveals the multiplier, a playful message, and an outcome animation; the calculation is expandable. Changing a dropdown resets the lab to its ready state; quick examples launch their preset combinations directly. Selections and playback stay in memory. A separate five-question practice and its existing account-local results remain available; the lab does not simulate HP, moves, or a full battle.

Public data is normalized from [PokéAPI](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv), with local artwork from [PokeAPI/sprites](https://github.com/PokeAPI/sprites). A manifest records source versions and retrieval dates. This is an educational, unaffiliated project.

Team cost is the sum of members' six base stats. The 3000-point cap is this project's own challenge rule, not an official competition rule; source stats are unchanged. The editor shows used and remaining points and blocks additions and saves over budget. Older over-budget saved teams remain available for adjustment. Imports containing an over-budget team are rejected before any personal records are replaced.

Author-designed static reference teams in `js/data/challenges.js` are separate from personal saved teams and do not represent real players. Compare the current draft with a reference or personal team using member count, cost, mean base stats, type distribution and defensive weakness/resistance counts. These comparisons show tradeoffs, not predicted winners or win rates.

Collapsible beginner notes explain the six base stats, base versus actual stats, defensive weaknesses/resistances/immunities, and the budget. One live team-building task checks the current draft for six unique members, a cost of at most 3000 points, and at most two members weak to Electric attacks (a defensive multiplier greater than 1). Completing the task does not automatically save a team or score, grant rewards, or decide a winner. The task's Electric-weakness condition does not change normal team-saving rules.

Open `index.html` in Chrome/Edge, or run `python -m http.server 8080 --bind 127.0.0.1`. Demo accounts: `leaf` / `poke123`, `blue` / `poke123`. Accounts and records are browser-local; no backend authentication is provided.

See [README.md](README.md) and [docs/立项.md](docs/立项.md). Run `node --test tests/*.test.cjs` for checks. Git submission remains the student's responsibility.

See [development notes](docs/开发说明.md) for the data/store/rules/UI/effects flow and [class presentation outline](docs/课堂汇报提纲.md) for a short explanation and demo plan. AI assistance is documented; these guides do not claim that the student already understands or independently wrote every part.
