# Upstream provenance

Every file listed below was copied byte for byte from an upstream Inji repository (MPL-2.0) and committed
unchanged in its own `import: upstream <repo>@<commit> (MPL-2.0)` commit. Later team commits change some of
these files in place, so `git log -p -- deploy/inji-stack/<file>` shows exactly what the team changed and why;
[README.md](README.md) lists every change with its reason.

The files were copied from git objects (`git cat-file blob <commit>:<path>`), not from a working tree, so line
endings are exactly as published. The repository's `.gitattributes` (`* -text`) stores them unchanged.

Check: `node deploy/inji-stack/scripts/stack.mjs verify-imports` confirms, for every row, that the file as
committed in its import commit hashes (`git hash-object --no-filters`) to the blob id below, and that the
import commit is the first commit that touched the file. It prints `IMPORTS MATCH`.

The MPL-2.0 text is in [LICENSE.MPL-2.0](LICENSE.MPL-2.0). Files written by the team in this folder are MIT,
like the rest of the repository.

## Imported files

| File (under `deploy/inji-stack/`) | Repository | Upstream path | Commit | Blob id | Licence |
| --- | --- | --- | --- | --- | --- |
| `nginx/certify-nginx.conf` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/certify-nginx.conf`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/certify-nginx.conf) | `e54539a` | `1930d720350a575bf11e7a7038f4df687b277ec6` | MPL-2.0 |
| `sql/certify_init.sql` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/certify_init.sql`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/certify_init.sql) | `e54539a` | `c09d91872917d549c1fe80724205aa666222f0ce` | MPL-2.0 |
| `config/certify-default.properties` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/config/certify-default.properties`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/config/certify-default.properties) | `e54539a` | `e6f41d75473a80b45b31f9c9c0e187eee89a4ae9` | MPL-2.0 |
| `config/certify-csvdp-farmer.properties` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/config/certify-csvdp-farmer.properties`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/config/certify-csvdp-farmer.properties) | `e54539a` | `adad7c0a22c1d43a2f5b91186b6f582691bac32b` | MPL-2.0 |
| `config/farmer_identity_data.csv` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/config/farmer_identity_data.csv`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/config/farmer_identity_data.csv) | `e54539a` | `19c429bc370e5e57f24a73278b956183fbcf8282` | MPL-2.0 |
| `config/mimoto-issuers-config.json` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/config/mimoto-issuers-config.json`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/config/mimoto-issuers-config.json) | `e54539a` | `303a1fa4f9d5c75ef57e197a350771569cc1d22f` | MPL-2.0 |
| `config/mimoto-trusted-verifiers.json` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/config/mimoto-trusted-verifiers.json`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/config/mimoto-trusted-verifiers.json) | `e54539a` | `da3010015aaafcc1484835cf45b6eba3cc9e839e` | MPL-2.0 |
| `config/credential-template.html` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/config/credential-template.html`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/config/credential-template.html) | `e54539a` | `485f7f4c884b7b44b958a580679ea3f160b48aac` | MPL-2.0 |
| `config/vp_request_config.json` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/config/vp_request_config.json`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/config/vp_request_config.json) | `e54539a` | `fc626684d6a75ce360a8b264d9bd3d44ad23ec43` | MPL-2.0 |
| `config/context/farmer.json` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`docker-compose/docker-compose-injistack/context/farmer.json`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack/context/farmer.json) | `e54539a` | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` | MPL-2.0 |
| `LICENSE.MPL-2.0` | [inji/inji-certify](https://github.com/inji/inji-certify) | [`LICENSE`](https://github.com/inji/inji-certify/blob/e54539a89616f64dc90e8f6797db9e66d826d97d/LICENSE) | `e54539a` | `a612ad9813b006ce81d1ee438dd784da99a54007` | MPL-2.0 |

Full commit ids: inji-certify `e54539a89616f64dc90e8f6797db9e66d826d97d`.
